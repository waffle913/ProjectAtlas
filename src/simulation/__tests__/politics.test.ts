import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyAssets } from '../assets/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyCrisis } from '../crisis/model';
import { emptyFiscal } from '../fiscal/model';
import { initializeNewGame } from '../initialization';
import { applyPendingFidelityTransitions, requestFidelityTransition } from '../fidelity';
import { assertSimulationInvariants, validateFidelityConservation } from '../invariants';
import { emptyPolitics, POLITICAL_ISSUES } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { politicsInvariant, validatePoliticalRegistry } from '../politics/invariants';
import { politicalExperienceFor } from '../politics/initialization';
import { ratio } from '../socioeconomy/model';
import { aggregateNationalSupport } from '../politics/aggregation';
import { politicalRegistry } from '../politics/registry';
import { inspectPolitics, runPoliticalOpinionWeek } from '../politics/runtime';
import { migrateSimulationState, restoreSimulationState, serializeSimulationState } from '../save';
import { emptySocioeconomy } from '../socioeconomy/model';
import { createEngineState } from '../state';

const sourced = Object.values(politicalRegistry.countries).filter(item => item.partyIds.length > 1 && item.organizationIds.length > 1 && item.partyIds.some(id => politicalRegistry.parties[id].ideologicalBasis.status === 'sourced' || politicalRegistry.parties[id].ideologicalBasis.status === 'partial')).slice(0, 2).map(item => item.countryId);
const regions: RegionEntity[] = sourced.map((id, index) => ({ id: `region.test-${index}`, parentCountryId: id, initialOwnerCountryId: id, commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } }));
const context = { countryIds: new Set(sourced), regionIds: new Set(regions.map(r => r.id)), regions };
const base = (): SimulationState => ({ schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {}, regionOwnership: Object.fromEntries(regions.map(r => [r.id, r.parentCountryId])), populationByRegion: Object.fromEntries(regions.map(r => [r.id, 90_000])), economicOutputByRegion: Object.fromEntries(regions.map(r => [r.id, 1_080_000_000])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(sourced, 'politics-test') });
const initialized = () => initializeNewGame(base(), regions, sourced);
const evaluate = (state: SimulationState, date = '2026-01-05') => runPoliticalOpinionWeek({ ...state, date });
const issue = (name: typeof POLITICAL_ISSUES[number]) => POLITICAL_ISSUES.indexOf(name);

describe('0.13 corrected national politics', () => {
  it.each(['missing-region', 'missing-cohort', 'extra-cohort', 'wrong-region-id', 'duplicate-assignment'] as const)('rejects self-consistently rebuilt political coverage: %s', corruption => {
    const state = initialized(), countryId = sourced[0], regionId = regions[0].id;
    const country = state.politics.countries[countryId], regional = state.politics.regionalOpinion[regionId];
    if (corruption === 'missing-region') { delete state.politics.regionalOpinion[regionId]; country.regionIds = []; }
    if (corruption === 'missing-cohort') delete regional.cohorts['low:left'];
    if (corruption === 'extra-cohort') regional.cohorts['invented:cohort'] = structuredClone(regional.cohorts['low:left']);
    if (corruption === 'wrong-region-id') regional.regionId = 'region.invented';
    if (corruption === 'duplicate-assignment') state.politics.countries[sourced[1]].regionIds.push(regionId);
    country.nationalSupportBps = aggregateNationalSupport(state, country.regionIds, state.politics.regionalOpinion, politicalRegistry.countries[countryId].partyIds.length);
    expect(politicsInvariant.check(state, context, 'reload').length).toBeGreaterThan(0);
  });
  it('keeps unavailable population as an empty political Region, never invented political persons', () => {
    const state = base(); state.populationByRegion[regions[0].id] = undefined;
    const initialized = initializeNewGame(state, regions, sourced);
    expect(initialized.politics.regionalOpinion[regions[0].id].cohorts).toEqual({});
    expect(assertSimulationInvariants(initialized, context, 'reload')).toBe(true);
  });
  it('rejects a forged national aggregate even when its sum stays exactly 10,000', () => {
    const state = initialized(), values = state.politics.countries[sourced[0]].nationalSupportBps;
    const donor = values.findIndex(value => value > 0), recipient = (donor + 1) % values.length; values[donor]--; values[recipient]++;
    expect(values.reduce((a, b) => a + b)).toBe(10_000);
    expect(politicsInvariant.check(state, context, 'save').join(' ')).toContain('disagrees with regional cohorts');
  });
  it.each(['date', 'future', 'bound', 'duplicate-drivers', 'negative-index', 'fractional-index', 'large-index', 'duplicate-region'])('rejects malformed political history: %s', corruption => {
    const state = initialized(), country = state.politics.countries[sourced[0]];
    country.recentOpinionDrivers = [{ date: state.date, drivers: [0] }];
    const entry = country.recentOpinionDrivers[0];
    if (corruption === 'date') entry.date = '2026-02-30';
    if (corruption === 'future') entry.date = '2026-01-02';
    if (corruption === 'bound') country.recentOpinionDrivers = Array(100).fill(entry);
    if (corruption === 'duplicate-drivers') entry.drivers = [0, 0];
    if (corruption === 'negative-index') entry.drivers = [-1];
    if (corruption === 'fractional-index') entry.drivers = [0.5];
    if (corruption === 'large-index') entry.drivers = [POLITICAL_ISSUES.length];
    if (corruption === 'duplicate-region') country.regionIds.push(country.regionIds[0]);
    expect(politicsInvariant.check(state, context, 'save').length).toBeGreaterThan(0);
  });
  it('validates stored political ownership until the scheduled weekly transfer reconciliation', () => {
    const state = initialized(); state.regionOwnership[regions[0].id] = sourced[1];
    expect(politicsInvariant.check(state, context, 'save')).toEqual([]);
    expect(politicsInvariant.check(evaluate(state), context, 'save')).toEqual([]);
  });
  it('rejects duplicate cohort driver indexes and strict invalid organization/politics dates', () => {
    const original = initialized();
    const duplicate = structuredClone(original); Object.values(duplicate.politics.regionalOpinion[regions[0].id].cohorts)[0][6] = [0, 0];
    expect(politicsInvariant.check(duplicate, context, 'save').join(' ')).toContain('Invalid cohort opinion');
    for (const field of ['initializedOn', 'lastOpinionUpdate'] as const) {
      const changed = structuredClone(original); changed.politics[field] = '2026-02-30'; expect(politicsInvariant.check(changed, context, 'save').length).toBeGreaterThan(0);
    }
    const changed = structuredClone(original); Object.values(changed.politics.organizations)[0].lastUpdatedOn = '2026-13-01';
    expect(politicsInvariant.check(changed, context, 'save').join(' ')).toContain('Invalid dynamic organization');
  });
  it('uses exact large-quantity experience ratios and preserves missing observations', () => {
    const state = initialized(), region = state.socioeconomy.regions[regions[0].id];
    region.economy!.labourForce = Number.MAX_SAFE_INTEGER; region.economy!.unemployed = Number.MAX_SAFE_INTEGER - 37;
    expect(politicalExperienceFor(region, 'low', null).unemploymentBps).toBe(ratio(region.economy!.unemployed, 10_000, region.economy!.labourForce));
    region.economy!.incomeByGroup = [0, 0, 0]; expect(politicalExperienceFor(region, 'low', null).taxBurdenBps).toBeNull();
  });
  it('uses the immutable sourced registry and variable fictional party counts', () => {
    const state = initialized(), counts = sourced.map(id => politicalRegistry.countries[id].partyIds.length);
    expect(state.politics.registryVersion).toBe(politicalRegistry.version); expect(new Set(counts).size + Number(counts[0] === counts[1])).toBeGreaterThan(0);
    expect(Object.values(politicalRegistry.parties).every(party => party.fictional && party.provenance.status === 'modelled_fallback')).toBe(true);
    expect(Object.values(politicalRegistry.institutions).flatMap(item => item.chambers).some(item => item.seatAllocationStatus === 'sourced')).toBe(true);
    expect(assertSimulationInvariants(state, context, 'tick')).toBe(true);
  });

  it('retains nine socioeconomic cohorts with exact compact support', () => {
    const state = initialized();
    for (const country of Object.values(state.politics.countries)) expect(country.nationalSupportBps.reduce((a, b) => a + b, 0)).toBe(10_000);
    for (const [regionId, regional] of Object.entries(state.politics.regionalOpinion)) {
      expect(Object.keys(regional.cohorts)).toHaveLength(state.socioeconomy.regions[regionId].cohorts.filter(c => c.persons > 0).length);
      for (const cohort of Object.values(regional.cohorts)) expect(cohort[2].reduce((a, b) => a + b, 0)).toBe(10_000);
    }
  });

  it('responds progressively to material conditions', () => {
    const state = initialized(), regionId = regions[0].id, stressed = structuredClone(state), economy = stressed.socioeconomy.regions[regionId].economy!;
    economy.employed = Math.floor(economy.labourForce / 2); economy.unemployed = economy.labourForce - economy.employed;
    const before = state.politics.regionalOpinion[regionId].cohorts['low:left'], after = evaluate(stressed).politics.regionalOpinion[regionId].cohorts['low:left'];
    expect(after[1][issue('labour_protection')]).toBeGreaterThan(before[1][issue('labour_protection')]);
    const partyIds = politicalRegistry.countries[sourced[0]].partyIds, differentiated = partyIds.map((_, index) => after[2][index] - before[2][index]);
    expect(new Set(differentiated).size).toBeGreaterThan(1);
  });

  it('uses sourced ideological evidence while retaining an explicit low-confidence fallback', () => {
    const evidenced = Object.values(politicalRegistry.parties).filter(party => party.ideologicalBasis.status === 'sourced' || party.ideologicalBasis.status === 'partial');
    expect(evidenced.length).toBeGreaterThan(1);
    expect(evidenced.some((party, index) => evidenced.slice(index + 1).some(other => JSON.stringify(other.ideology) !== JSON.stringify(party.ideology)))).toBe(true);
    const fallbackCountry = Object.values(politicalRegistry.countries).find(country => country.partyIds.length > 0 && country.partyIds.every(id => politicalRegistry.parties[id].ideologicalBasis.status === 'modelled_fallback'))!;
    expect(fallbackCountry.coverage.partyIdeology).toBe('modelled_fallback');
    expect(fallbackCountry.partyIds.every(id => politicalRegistry.parties[id].ideologicalBasis.confidenceBps === 500)).toBe(true);
  });

  it('updates unions and employer associations differently and recovers with inertia', () => {
    const state = initialized(), regionId = regions[0].id, organizationIds = politicalRegistry.countries[sourced[0]].organizationIds;
    const unionId = organizationIds.find(id => politicalRegistry.organizations[id].type === 'union')!, associationId = organizationIds.find(id => politicalRegistry.organizations[id].type === 'association')!;
    const stressed = structuredClone(state), economy = stressed.socioeconomy.regions[regionId].economy!;
    economy.employed = Math.floor(economy.labourForce / 3); economy.unemployed = economy.labourForce - economy.employed;
    const stressedResult = evaluate(stressed), union = stressedResult.politics.organizations[unionId], association = stressedResult.politics.organizations[associationId];
    const unionLabourDelta = union.currentPositions.labour_protection - state.politics.organizations[unionId].currentPositions.labour_protection;
    const associationLabourDelta = association.currentPositions.labour_protection - state.politics.organizations[associationId].currentPositions.labour_protection;
    expect(unionLabourDelta).not.toBe(associationLabourDelta); expect(unionLabourDelta).toBeGreaterThan(associationLabourDelta);
    const recoveredInput = structuredClone(stressedResult); recoveredInput.socioeconomy.regions[regionId].economy = structuredClone(state.socioeconomy.regions[regionId].economy);
    const recovered = evaluate(recoveredInput, '2026-01-12').politics.organizations[unionId];
    expect(recovered.currentPositions.labour_protection).not.toBe(union.currentPositions.labour_protection);
    expect(recovered.currentPositions.labour_protection).not.toBe(state.politics.organizations[unionId].currentPositions.labour_protection);
  });

  it('does not turn degraded infrastructure into a first-update public-services shock', () => {
    const state = initialized(), regionId = regions[0].id, changed = structuredClone(state);
    changed.fiscal.countries[sourced[0]].services.infrastructure.coverageBps = 0;
    const before = state.politics.regionalOpinion[regionId].cohorts['middle:centre'], after = evaluate(changed).politics.regionalOpinion[regionId].cohorts['middle:centre'];
    expect(after[0][issue('public_services')]).toBe(before[0][issue('public_services')]);
    expect(after[1][issue('public_services')]).toBe(before[1][issue('public_services')]);
    expect(after[1][issue('infrastructure')]).toBeGreaterThan(before[1][issue('infrastructure')]);
  });

  it('remaps a sovereign transfer on the next update while occupation alone has no effect', () => {
    const state = initialized(), regionId = regions[0].id, original = state.politics.regionalOpinion[regionId], occupied = structuredClone(state);
    occupied.occupationByRegion[regionId] = { regionId, warId: 'war.test', occupierCountryId: sourced[1], startDate: occupied.date };
    const occupationResult = evaluate(occupied); expect(occupationResult.politics.regionalOpinion[regionId].countryId).toBe(sourced[0]);
    const transferred = structuredClone(state); transferred.regionOwnership[regionId] = sourced[1];
    const result = evaluate(transferred), remapped = result.politics.regionalOpinion[regionId];
    expect(remapped.countryId).toBe(sourced[1]); expect(result.politics.countries[sourced[0]].regionIds).not.toContain(regionId); expect(result.politics.countries[sourced[1]].regionIds).toContain(regionId);
    expect(remapped.cohorts['low:left'][0]).toEqual(occupationResult.politics.regionalOpinion[regionId].cohorts['low:left'][0]);
    expect(remapped.cohorts['low:left'][2]).toHaveLength(politicalRegistry.countries[sourced[1]].partyIds.length + 1);
  });

  it('migrates old saves without fake history and round-trips only dynamic state', () => {
    const state = initialized(), legacy = structuredClone(state) as unknown as Record<string, unknown>; legacy.schemaVersion = 10; delete legacy.politics; legacy.date = '2032-06-15';
    const migrated = migrateSimulationState(legacy, regions, {}, {}, context); expect(migrated.politics).toMatchObject({ initializedOn: '2032-06-15', weeklyEvaluations: 0, registryVersion: politicalRegistry.version });
    const evaluated = evaluate(state), serialized = serializeSimulationState(evaluated, context); expect(serialized).not.toContain('sourcePartyName'); expect(serialized).not.toContain('issuePositions');
    expect(restoreSimulationState(serialized, regions, {}, {}, context)).toEqual(evaluated);
    const v2 = structuredClone(evaluated); v2.politics.registryVersion = 'political-registry-0.13-v2' as never; delete (v2.politics as Partial<typeof v2.politics>).organizations;
    Object.assign(v2, { schemaVersion: 11 });
    const preserved = Object.fromEntries(Object.entries(v2.politics.regionalOpinion).map(([regionId, regional]) => [regionId, Object.fromEntries(Object.entries(regional.cohorts).map(([cohortId, opinion]) => [cohortId, [opinion[0], opinion[1], opinion[3], opinion[4], opinion[5], opinion[6]]]))]));
    for (const regional of Object.values(v2.politics.regionalOpinion)) for (const opinion of Object.values(regional.cohorts)) opinion[2] = opinion[2].map((_, index) => index === 0 ? 10_000 : 0);
    for (const country of Object.values(v2.politics.countries)) country.nationalSupportBps = country.nationalSupportBps.map((_, index) => index === 0 ? 10_000 : 0);
    const nonPolitical = { fiscal: v2.fiscal, socioeconomic: v2.socioeconomy, crisis: v2.crisis };
    const upgraded = restoreSimulationState(JSON.stringify(v2), regions, {}, {}, context); expect(upgraded.politics.registryVersion).toBe(politicalRegistry.version);
    expect(upgraded.politics.regionalOpinion[regions[0].id].cohorts['low:left'][2]).not.toEqual(v2.politics.regionalOpinion[regions[0].id].cohorts['low:left'][2]);
    const retained = Object.fromEntries(Object.entries(upgraded.politics.regionalOpinion).map(([regionId, regional]) => [regionId, Object.fromEntries(Object.entries(regional.cohorts).map(([cohortId, opinion]) => [cohortId, [opinion[0], opinion[1], opinion[3], opinion[4], opinion[5], opinion[6]]]))]));
    expect(retained).toEqual(preserved); expect(upgraded.politics.organizations).not.toEqual({}); expect({ fiscal: upgraded.fiscal, socioeconomic: upgraded.socioeconomy, crisis: upgraded.crisis }).toEqual(nonPolitical);
    const earlySchema11 = structuredClone(evaluated) as unknown as { politics: Record<string, unknown> }; delete earlySchema11.politics.registryVersion;
    Object.assign(earlySchema11, { schemaVersion: 11 });
    expect(restoreSimulationState(JSON.stringify(earlySchema11), regions, {}, {}, context).politics.registryVersion).toBe(politicalRegistry.version);
  });

  it('returns defensive inspection data without exposing static registry identity', () => {
    const state = initialized(), inspected = inspectPolitics(state, sourced[0])!; inspected.country.regionIds.length = 0;
    expect(state.politics.countries[sourced[0]].regionIds).toHaveLength(1); expect(inspected.parties.length).toBe(politicalRegistry.countries[sourced[0]].partyIds.length);
  });

  it('is deterministic for the same state and independent of Country/Region insertion order', () => {
    const state = initialized(), reordered = structuredClone(state);
    reordered.politics.countries = Object.fromEntries(Object.entries(reordered.politics.countries).reverse());
    reordered.politics.regionalOpinion = Object.fromEntries(Object.entries(reordered.politics.regionalOpinion).reverse());
    reordered.socioeconomy.regions = Object.fromEntries(Object.entries(reordered.socioeconomy.regions).reverse());
    expect(evaluate(state).politics).toEqual(evaluate(structuredClone(state)).politics);
    expect(evaluate(reordered).politics).toEqual(evaluate(state).politics);
  });

  it('keeps politics conserved across fidelity-only transitions', () => {
    const state = initialized(), queued = requestFidelityTransition(state, sourced[0], 'Detailed', context.countryIds);
    const applied = applyPendingFidelityTransitions(queued);
    expect(applied.politics).toBe(queued.politics);
    expect(validateFidelityConservation(queued, applied)).toEqual([]);
  });

  it('ignores crisis phase and does not mutate socioeconomic, fiscal or crisis branches', () => {
    const state = initialized(), active = structuredClone(state), episode = active.crisis.countries[sourced[0]].currentByType.fiscal_stress;
    episode.state = 'ACTIVE'; episode.severity = 'severe'; episode.activatedOn = active.date;
    const normalResult = evaluate(state), activeResult = evaluate(active);
    expect(activeResult.politics).toEqual(normalResult.politics);
    expect(activeResult.socioeconomy).toBe(active.socioeconomy);
    expect(activeResult.fiscal).toBe(active.fiscal);
    expect(activeResult.crisis).toBe(active.crisis);
    expect(activeResult.politics.organizations).not.toBe(active.politics.organizations);
  });

  it('keeps unavailable distinct from numeric zero and never infers not-applicable from entity type', () => {
    const absent = Object.values(politicalRegistry.countries).find(item => item.coverage.institutions === 'unavailable')!;
    expect(absent.coverage.executiveSystem).toBe('unavailable');
    expect(absent.coverage.legislature).toBe('unavailable');
    expect(Object.values(politicalRegistry.countries).some(item => Object.values(item.coverage).includes('not_applicable'))).toBe(false);
    const fallback = Object.values(politicalRegistry.parties).find(party => party.ideologicalBasis.status === 'modelled_fallback')!;
    expect(fallback.ideologicalBasis).toMatchObject({ status: 'modelled_fallback', confidenceBps: 500 });
  });

  it('rejects malformed seats, support and future evidence', () => {
    const malformedSeats = structuredClone(politicalRegistry), partyId = malformedSeats.countries[sourced[0]].partyIds[0];
    malformedSeats.parties[partyId].currentSeats = -1;
    expect(validatePoliticalRegistry(malformedSeats)).toContain(`Invalid party profile ${partyId}.`);
    const sourcedChamber = Object.values(malformedSeats.institutions).flatMap(item => item.chambers).find(item => item.seatAllocationStatus === 'sourced' && Object.keys(item.seatsByParty).length)!;
    sourcedChamber.seatsByParty[Object.keys(sourcedChamber.seatsByParty)[0]] += 1;
    expect(validatePoliticalRegistry(malformedSeats)).toContain(`Seat allocation does not reconcile for ${sourcedChamber.id}.`);
    const future = structuredClone(politicalRegistry); future.parties[partyId].provenance.effectiveDate = '2027-01-01';
    expect(validatePoliticalRegistry(future).some(error => error.includes('Future-dated'))).toBe(true);
    const malformedSupport = initialized(); malformedSupport.politics.countries[sourced[0]].nationalSupportBps[0] += 1;
    expect(() => assertSimulationInvariants(malformedSupport, context, 'tick')).toThrow(/support does not sum/);
  });

  it('continues deterministically after save/reload and contains no 0.14 state', () => {
    const first = evaluate(initialized()), restored = restoreSimulationState(serializeSimulationState(first, context), regions, {}, {}, context);
    const nextDate = '2026-01-12';
    expect(evaluate(restored, nextDate)).toEqual(evaluate(first, nextDate));
    expect(JSON.stringify(first.politics)).not.toMatch(/electionSimulation|candidate|legislation|protest|coup|media|politicalAi/i);
    expect(readFileSync('src/simulation/politics/runtime.ts', 'utf8')).not.toContain('Math.random');
    expect(readFileSync('src/simulation/politics/initialization.ts', 'utf8')).not.toContain('Math.random');
  });
});
