import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyAssets } from '../assets/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptyFiscal } from '../fiscal/model';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { initializeFiscal } from '../fiscal/runtime';
import { createEngineState } from '../state';
import { assertSimulationInvariants } from '../invariants';
import { applyDemographicTransition, applyInternationalMigration } from '../demography/integration';

const region = (id: string): RegionEntity => ({ id: `region.${id}`, parentCountryId: `country.${id}`, initialOwnerCountryId: `country.${id}`, commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } });
const build = (ids: string[]): { state: SimulationState; regions: RegionEntity[] } => {
  const regions = ids.map(region), countryIds = ids.map(id => `country.${id}`);
  let state: SimulationState = {
    schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
    territoryOwnership: {}, regionOwnership: Object.fromEntries(regions.map(r => [r.id, r.parentCountryId])),
    populationByRegion: Object.fromEntries(regions.map(r => [r.id, 100_000])), economicOutputByRegion: Object.fromEntries(regions.map(r => [r.id, 1_200_000_000])),
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(countryIds, 'demography-seed'),
  };
  return { state: initializeFiscal(initializeSocioeconomy(state, regions)), regions };
};
const context = (regions: RegionEntity[]) => ({ regions, countryIds: new Set(regions.map(r => r.parentCountryId)), regionIds: new Set(regions.map(r => r.id)) });

describe('demography 0.30 runtime integration (population conservation)', () => {
  it('applies a dated birth/death, re-derives cohorts, and passes every invariant', () => {
    const { state, regions } = build(['a']);
    const ctx = context(regions);
    const born = applyDemographicTransition(state, 'region.a', { id: 'birth.1', cohortKey: 'low:left', kind: 'birth', count: 10, date: state.date });
    expect(born.socioeconomy.regions['region.a'].population).toBe(100_010);
    expect(born.populationByRegion['region.a']).toBe(100_010);
    expect(born.socioeconomy.regions['region.a'].cohorts.reduce((s, c) => s + c.persons, 0)).toBe(100_010);
    expect(assertSimulationInvariants(born, ctx, 'save')).toBe(true);
    const died = applyDemographicTransition(born, 'region.a', { id: 'death.1', cohortKey: 'low:left', kind: 'death', count: 20, date: state.date });
    expect(died.socioeconomy.regions['region.a'].population).toBe(99_990);
    expect(assertSimulationInvariants(died, ctx, 'save')).toBe(true);
  });

  it('applies a conserved international migration flow and fails closed on over-draw', () => {
    const { state, regions } = build(['a', 'b']);
    const ctx = context(regions);
    const moved = applyInternationalMigration(state, 'region.a', 'region.b', { id: 'mig.1', originId: 'region.a', destinationId: 'region.b', count: 500, date: state.date });
    expect(moved.socioeconomy.regions['region.a'].population).toBe(99_500);
    expect(moved.socioeconomy.regions['region.b'].population).toBe(100_500);
    expect(moved.socioeconomy.regions['region.a'].population! + moved.socioeconomy.regions['region.b'].population!).toBe(200_000);
    expect(assertSimulationInvariants(moved, ctx, 'save')).toBe(true);
    expect(() => applyInternationalMigration(state, 'region.a', 'region.b', { id: 'mig.2', originId: 'region.a', destinationId: 'region.b', count: 200_000, date: state.date })).toThrow(/negative/);
  });

  it('never fabricates a population when the Region population is unavailable', () => {
    const { state } = build(['a']);
    const noPopulation = { ...state, socioeconomy: { ...state.socioeconomy, regions: { ...state.socioeconomy.regions, 'region.a': { ...state.socioeconomy.regions['region.a'], population: undefined, cohorts: [] } } }, populationByRegion: { 'region.a': undefined } };
    expect(() => applyDemographicTransition(noPopulation, 'region.a', { id: 'birth.2', cohortKey: 'low:left', kind: 'birth', count: 1, date: state.date })).toThrow(/unavailable/);
  });
});
