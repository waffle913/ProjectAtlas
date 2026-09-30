import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyCrisis } from '../crisis/model';
import { emptyFiscal } from '../fiscal/model';
import { requestFidelityTransition, applyPendingFidelityTransitions } from '../fidelity';
import { initializeNewGame } from '../initialization';
import { assertSimulationInvariants, validateFidelityConservation, validateSimulationInvariants } from '../invariants';
import { emptyPolitics, POLITICAL_ISSUES } from '../politics/model';
import { inspectPolitics, runPoliticalOpinionWeek } from '../politics/runtime';
import { migrateSimulationState, restoreSimulationState, serializeSimulationState } from '../save';
import { advanceSimulationDays } from '../engine';
import { emptySocioeconomy } from '../socioeconomy/model';
import { createEngineState } from '../state';

const ids = ['country.a', 'country.b'];
const regions: RegionEntity[] = ids.map(id => ({ id: `region.${id.at(-1)}`, parentCountryId: id, initialOwnerCountryId: id, commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } }));
const context = { countryIds: new Set(ids), regionIds: new Set(regions.map(r => r.id)), regions };
const base = (): SimulationState => ({
  schemaVersion: 11, politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
  territoryOwnership: {}, regionOwnership: Object.fromEntries(regions.map(r => [r.id, r.parentCountryId])), populationByRegion: Object.fromEntries(regions.map(r => [r.id, 90_000])), economicOutputByRegion: Object.fromEntries(regions.map(r => [r.id, 1_080_000_000])),
  bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(ids, 'politics-test'),
});
const initialized = () => initializeNewGame(base(), regions, ids);
const evaluate = (state: SimulationState, date = '2026-01-05') => runPoliticalOpinionWeek({ ...state, date });

describe('0.13 national institutions and political opinion', () => {
  it('initializes national-only institutions, fictional parties and interests without fabricated facts', () => {
    const state = initialized();
    expect(state.politics.initializedOn).toBe('2026-01-01');
    expect(Object.keys(state.politics.countries)).toEqual(ids);
    expect(Object.keys(state.politics.partyRegistry)).toHaveLength(6);
    expect(Object.keys(state.politics.organizationRegistry)).toHaveLength(4);
    for (const country of Object.values(state.politics.countries)) {
      expect(country.coverage).toMatchObject({ institutions: 'unavailable', legislature: 'unavailable', electoralSystem: 'unavailable', partyBasis: 'modelled', seats: 'unavailable', coalition: 'unavailable' });
      expect(state.politics.institutions[country.institutionId]).toMatchObject({ executiveSystem: 'unavailable', legislatureKind: 'unavailable', chambers: [] });
      expect(country.partyIds.every(id => state.politics.partyRegistry[id].fictional && state.politics.partyRegistry[id].currentSeats === null)).toBe(true);
    }
  });

  it('reuses the nine existing socioeconomic cohorts and preserves exact support sums', () => {
    const state = initialized();
    for (const [regionId, regional] of Object.entries(state.politics.regionalOpinion)) {
      expect(Object.keys(regional.cohorts)).toHaveLength(state.socioeconomy.regions[regionId].cohorts.filter(c => c.persons > 0).length);
      expect(Object.values(regional.cohorts).reduce((n, c) => n + c.persons, 0)).toBe(state.socioeconomy.regions[regionId].population);
      for (const cohort of Object.values(regional.cohorts)) expect(Object.values(cohort.partySupportBps).reduce((a, b) => a + b, 0)).toBe(10_000);
      expect(Object.values(regional.aggregateSupportBps).reduce((a, b) => a + b, 0)).toBe(10_000);
    }
    expect(assertSimulationInvariants(state, context, 'tick')).toBe(true);
  });

  it('is deterministic across input country order and repeated evaluation', () => {
    const left = initializeNewGame(base(), regions, ids);
    const right = initializeNewGame(base(), [...regions].reverse(), [...ids].reverse());
    expect(left.politics).toEqual(right.politics);
    expect(evaluate(left).politics).toEqual(evaluate(structuredClone(left)).politics);
  });

  it('responds progressively to unemployment and reverses gradually after recovery', () => {
    const stable = initialized(), regionId = regions[0].id;
    const stressed = structuredClone(stable), economy = stressed.socioeconomy.regions[regionId].economy!;
    economy.employed = Math.floor(economy.labourForce / 2); economy.unemployed = economy.labourForce - economy.employed;
    const first = evaluate(stressed), cohortId = 'low:left';
    const before = stable.politics.regionalOpinion[regionId].cohorts[cohortId], after = first.politics.regionalOpinion[regionId].cohorts[cohortId];
    expect(after.issuePreferencesBps.labour_protection).toBeGreaterThan(before.issuePreferencesBps.labour_protection);
    expect(after.issueSalienceBps.labour_protection).toBeGreaterThan(before.issueSalienceBps.labour_protection);
    const recoveredInput = { ...first, date: '2026-01-12', socioeconomy: stable.socioeconomy };
    const recovered = evaluate(recoveredInput, '2026-01-12').politics.regionalOpinion[regionId].cohorts[cohortId];
    expect(recovered.issueSalienceBps.labour_protection).toBeLessThan(after.issueSalienceBps.labour_protection);
    expect(recovered.issueSalienceBps.labour_protection).toBeGreaterThanOrEqual(4_000);
  });

  it('keeps income interests, parties and organizations multidimensional and distinct', () => {
    const state = evaluate(initialized()), regional = state.politics.regionalOpinion[regions[0].id];
    expect(regional.cohorts['low:left'].issuePreferencesBps.fiscal_distribution).toBeGreaterThan(regional.cohorts['high:left'].issuePreferencesBps.fiscal_distribution);
    const parties = Object.values(state.politics.partyRegistry).filter(p => p.countryId === ids[0]);
    expect(new Set(parties.map(p => JSON.stringify(p.ideology))).size).toBe(3);
    const organizations = Object.values(state.politics.organizationRegistry).filter(o => o.countryId === ids[0]);
    expect(organizations.map(o => o.type).sort()).toEqual(['association', 'union']);
    expect(organizations[0].representedInterests).not.toEqual(organizations[1].representedInterests);
  });

  it('applies income loss differently by cohort and raises public-service salience when services degrade', () => {
    const state = initialized(), regionId = regions[0].id, stressed = structuredClone(state);
    const fiscal = stressed.fiscal.regions[regionId]; fiscal.disposable[0] = Math.floor(fiscal.disposable[0] / 2); fiscal.disposable[2] = Math.floor(fiscal.disposable[2] * 9 / 10);
    stressed.fiscal.countries[ids[0]].services.health.coverageBps = 4_000; stressed.fiscal.countries[ids[0]].services.education.coverageBps = 4_000;
    const next = evaluate(stressed).politics.regionalOpinion[regionId].cohorts;
    expect(next['low:left'].materialSentimentBps).toBeLessThan(next['high:left'].materialSentimentBps);
    expect(next['low:left'].issueSalienceBps.public_services).toBeGreaterThan(state.politics.regionalOpinion[regionId].cohorts['low:left'].issueSalienceBps.public_services);
    const supportChanges = state.politics.countries[ids[0]].partyIds.map(id => next['low:left'].partySupportBps[id] - state.politics.regionalOpinion[regionId].cohorts['low:left'].partySupportBps[id]);
    expect(new Set(supportChanges).size).toBeGreaterThan(1);
  });

  it('uses material conditions but never the crisis phase as a direct opinion bonus', () => {
    const state = initialized(), withCrisis = structuredClone(state);
    withCrisis.crisis.countries[ids[0]].currentByType.household_distress.state = 'ACTIVE';
    withCrisis.crisis.countries[ids[0]].currentByType.household_distress.currentPressure = 10_000;
    expect(evaluate(withCrisis).politics).toEqual(evaluate(state).politics);
  });

  it('does not modify socioeconomic, fiscal or crisis state during opinion evaluation', () => {
    const state = initialized(), before = { socioeconomic: state.socioeconomy, fiscal: state.fiscal, crisis: state.crisis };
    const next = evaluate(state);
    expect(next.socioeconomy).toBe(before.socioeconomic); expect(next.fiscal).toBe(before.fiscal); expect(next.crisis).toBe(before.crisis);
  });

  it('rejects malformed support, seat reconciliation and future evidence', () => {
    const malformed = structuredClone(initialized()), country = malformed.politics.countries[ids[0]], institution = malformed.politics.institutions[country.institutionId];
    country.nationalSupportBps.undecided += 1;
    institution.chambers.push({ id: 'chamber:test', countryId: ids[0], displayName: 'Test', totalSeats: 10, seatsByParty: { [country.partyIds[0]]: 9 }, independentOtherSeats: 0, electoralRule: { kind: 'unavailable', status: 'unavailable', provenance: institution.provenance }, electionProcess: 'unavailable', provenance: institution.provenance });
    institution.provenance.referenceDate = '2027-01-01';
    const messages = validateSimulationInvariants(malformed, context, 'tick').violations.map(v => v.message).join('|');
    expect(messages).toMatch(/National support/); expect(messages).toMatch(/Seat allocation/); expect(messages).toMatch(/Future-dated/);
  });

  it('migrates schema 10 at the saved date without fake political history', () => {
    const legacy = structuredClone(initialized()) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 10; delete legacy.politics; legacy.date = '2032-06-15';
    const migrated = migrateSimulationState(legacy, regions, {}, {}, context);
    expect(migrated).toMatchObject({ schemaVersion: 11, date: '2032-06-15' });
    expect(migrated.politics.initializedOn).toBe('2032-06-15'); expect(migrated.politics.lastOpinionUpdate).toBeUndefined(); expect(migrated.politics.weeklyEvaluations).toBe(0);
    expect(Object.values(migrated.politics.countries).every(c => c.recentOpinionDrivers.length === 0)).toBe(true);
  });

  it('round-trips schema 11, exposes defensive debug data and conserves politics across fidelity changes', () => {
    const state = evaluate(initialized()), restored = restoreSimulationState(serializeSimulationState(state, context), regions, {}, {}, context);
    expect(restored).toEqual(state);
    expect(advanceSimulationDays(restored, 8)).toEqual(advanceSimulationDays(state, 8));
    const inspected = inspectPolitics(state, ids[0])!; inspected.country.regionIds.length = 0;
    expect(state.politics.countries[ids[0]].regionIds.length).toBe(1);
    const queued = requestFidelityTransition(state, ids[0], 'Detailed', context.countryIds, 'test'), transitioned = applyPendingFidelityTransitions(queued);
    expect(validateFidelityConservation(queued, transitioned)).toEqual([]); expect(transitioned.politics).toEqual(queued.politics);
  });

  it('keeps every issue bounded after repeated updates and contains no player decision state', () => {
    let state = initialized();
    for (let week = 1; week <= 30; week++) state = evaluate(state, `2026-${String(1 + Math.floor(week / 4)).padStart(2, '0')}-${String(1 + (week % 4) * 7).padStart(2, '0')}`.replace(/-(29|30|31)$/, '-28'));
    for (const regional of Object.values(state.politics.regionalOpinion)) for (const cohort of Object.values(regional.cohorts)) for (const issue of POLITICAL_ISSUES) {
      expect(cohort.issuePreferencesBps[issue]).toBeGreaterThanOrEqual(0); expect(cohort.issuePreferencesBps[issue]).toBeLessThanOrEqual(10_000);
    }
    expect(JSON.stringify(state.politics)).not.toMatch(/playerChoice|playerDecision|legislation|voteIntent|mediaCampaign/);
  });
});
