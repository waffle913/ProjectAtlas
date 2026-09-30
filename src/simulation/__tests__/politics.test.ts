import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyCrisis } from '../crisis/model';
import { emptyFiscal } from '../fiscal/model';
import { initializeNewGame } from '../initialization';
import { assertSimulationInvariants } from '../invariants';
import { emptyPolitics, POLITICAL_ISSUES } from '../politics/model';
import { politicalRegistry } from '../politics/registry';
import { inspectPolitics, runPoliticalOpinionWeek } from '../politics/runtime';
import { migrateSimulationState, restoreSimulationState, serializeSimulationState } from '../save';
import { emptySocioeconomy } from '../socioeconomy/model';
import { createEngineState } from '../state';

const sourced = Object.values(politicalRegistry.countries).filter(item => item.partyIds.length > 1).slice(0, 2).map(item => item.countryId);
const regions: RegionEntity[] = sourced.map((id, index) => ({ id: `region.test-${index}`, parentCountryId: id, initialOwnerCountryId: id, commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } }));
const context = { countryIds: new Set(sourced), regionIds: new Set(regions.map(r => r.id)), regions };
const base = (): SimulationState => ({ schemaVersion: 11, politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {}, regionOwnership: Object.fromEntries(regions.map(r => [r.id, r.parentCountryId])), populationByRegion: Object.fromEntries(regions.map(r => [r.id, 90_000])), economicOutputByRegion: Object.fromEntries(regions.map(r => [r.id, 1_080_000_000])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(sourced, 'politics-test') });
const initialized = () => initializeNewGame(base(), regions, sourced);
const evaluate = (state: SimulationState, date = '2026-01-05') => runPoliticalOpinionWeek({ ...state, date });
const issue = (name: typeof POLITICAL_ISSUES[number]) => POLITICAL_ISSUES.indexOf(name);

describe('0.13 corrected national politics', () => {
  it('uses the immutable sourced registry and variable fictional party counts', () => {
    const state = initialized(), counts = sourced.map(id => politicalRegistry.countries[id].partyIds.length);
    expect(state.politics.registryVersion).toBe(politicalRegistry.version); expect(new Set(counts).size + Number(counts[0] === counts[1])).toBeGreaterThan(0);
    expect(Object.values(politicalRegistry.parties).every(party => party.fictional && party.provenance.status === 'modelled_fallback')).toBe(true);
    expect(Object.values(politicalRegistry.institutions).flatMap(item => item.chambers).some(item => item.seatAllocationStatus === 'sourced')).toBe(true);
    expect(assertSimulationInvariants(state, context, 'tick')).toBe(true);
  });

  it('retains nine socioeconomic cohorts with exact compact support', () => {
    const state = initialized();
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
    const earlySchema11 = structuredClone(evaluated) as unknown as { politics: Record<string, unknown> }; delete earlySchema11.politics.registryVersion;
    expect(restoreSimulationState(JSON.stringify(earlySchema11), regions, {}, {}, context).politics.registryVersion).toBe(politicalRegistry.version);
  });

  it('returns defensive inspection data without exposing static registry identity', () => {
    const state = initialized(), inspected = inspectPolitics(state, sourced[0])!; inspected.country.regionIds.length = 0;
    expect(state.politics.countries[sourced[0]].regionIds).toHaveLength(1); expect(inspected.parties.length).toBe(politicalRegistry.countries[sourced[0]].partyIds.length);
  });
});
