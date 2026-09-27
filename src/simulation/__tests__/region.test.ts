import { describe, expect, it } from 'vitest';
import type { Country, RegionEntity, SimulationState } from '../../types';
import { controlledEconomicOutput, controlledPopulation, transferRegion } from '../region';
import { migrateSimulationState, restoreSimulationState, serializeSimulationState } from '../save';

const region: RegionEntity = {
  id: 'region.permanent', parentCountryId: 'country.alpha', initialOwnerCountryId: 'country.alpha',
  macroTerritoryId: 'territory.alpha', commonName: 'Example', administrativeLevel: 1,
  externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'source', sourceFeatureIds: ['feature-a'] },
};
const state: SimulationState = {
  schemaVersion: 6, date: '2026-01-01', paused: true, speed: 1,
  territoryOwnership: { 'territory.alpha': 'country.alpha' },
  regionOwnership: { 'region.permanent': 'country.alpha' },
  populationByRegion: { 'region.permanent': 12345 },
  economicOutputByRegion: { 'region.permanent': 200_000_000_000 },
  bilateralRelations: {}, claims: [], explicitCasusBelli: [],
  wars: [], occupationByRegion: {},
};

describe('Region ownership and saves', () => {
  it('transfers ownership without mutating the prior state or country identity', () => {
    const country: Country = { id: 'country.alpha', commonName: 'Alpha', externalIds: {}, entityType: 'sovereign_state', unMembership: 'member', sources: {}, kind: 'sovereign' };
    const frozenCountry = structuredClone(country);
    const next = transferRegion(state, region.id, 'country.alpha', 'country.beta');
    expect(next.regionOwnership[region.id]).toBe('country.beta');
    expect(state.regionOwnership[region.id]).toBe('country.alpha');
    expect(next.populationByRegion[region.id]).toBe(12_345);
    expect(next.economicOutputByRegion[region.id]).toBe(200_000_000_000);
    expect(controlledPopulation(next, 'country.alpha')).toBeUndefined();
    expect(controlledPopulation(next, 'country.beta')).toBe(12_345);
    expect(controlledEconomicOutput(next, 'country.alpha')).toBeUndefined();
    expect(controlledEconomicOutput(next, 'country.beta')).toBe(200_000_000_000);
    expect(country).toEqual(frozenCountry);
  });
  it('preserves transferred ownership through save serialization and restoration', () => {
    const transferred = transferRegion(state, region.id, 'country.alpha', 'country.beta');
    const restored = restoreSimulationState(serializeSimulationState(transferred), [region], {}, {}, { countryIds: new Set(['country.alpha', 'country.beta']), regionIds: new Set([region.id]) });
    expect(restored.regionOwnership[region.id]).toBe('country.beta');
    expect(restored.schemaVersion).toBe(6);
    expect(restored.populationByRegion[region.id]).toBe(12345);
    expect(restored.economicOutputByRegion[region.id]).toBe(200_000_000_000);
  });
  it('migrates territory-only saves without discarding their IDs or ownership', () => {
    const migrated = migrateSimulationState({ date: '2026-01-03', paused: false, speed: 2, territoryOwnership: { 'territory.alpha': 'country.beta' } }, [region], { [region.id]: 500 }, { [region.id]: 700 });
    expect(migrated.territoryOwnership['territory.alpha']).toBe('country.beta');
    expect(migrated.regionOwnership[region.id]).toBe('country.beta');
    expect(migrated.populationByRegion[region.id]).toBe(500);
    expect(migrated.economicOutputByRegion[region.id]).toBe(700);
  });
  it('migrates v2 population deterministically and transfers control without changing inhabitants', () => {
    const v2 = { schemaVersion: 2, date: '2026-01-01', paused: true, speed: 1, territoryOwnership: { 'territory.alpha': 'country.alpha' }, regionOwnership: { [region.id]: 'country.alpha' } };
    const migrated = migrateSimulationState(v2, [region], { [region.id]: 900 }, { [region.id]: 800 });
    const transferred = transferRegion(migrated, region.id, 'country.alpha', 'country.beta');
    expect(transferred.populationByRegion[region.id]).toBe(900);
    expect(controlledPopulation(transferred, 'country.beta')).toBe(900);
    expect(controlledPopulation(transferred, 'country.alpha')).toBeUndefined();
    expect(transferred.economicOutputByRegion[region.id]).toBe(800);
    expect(controlledEconomicOutput(transferred, 'country.beta')).toBe(800);
  });
  it('never reports a partial controlled population when one owned Region is unavailable', () => {
    const incomplete = { ...state, regionOwnership: { 'region.one': 'country.alpha', 'region.two': 'country.alpha' }, populationByRegion: { 'region.one': 100, 'region.two': undefined }, economicOutputByRegion: { 'region.one': 500, 'region.two': undefined } };
    expect(controlledPopulation(incomplete, 'country.alpha')).toBeUndefined();
    expect(controlledEconomicOutput(incomplete, 'country.alpha')).toBeUndefined();
  });
  it('migrates v3 saves deterministically without altering population or ownership', () => {
    const v3 = { schemaVersion: 3, date: '2026-02-03', paused: false, speed: 5, territoryOwnership: { 'territory.alpha': 'country.beta' }, regionOwnership: { [region.id]: 'country.beta' }, populationByRegion: { [region.id]: 456 } };
    const migrated = migrateSimulationState(v3, [region], {}, { [region.id]: 789 });
    expect(migrated).toMatchObject({ schemaVersion: 6, date: '2026-02-03', paused: false, speed: 5 });
    expect(migrated.regionOwnership[region.id]).toBe('country.beta'); expect(migrated.populationByRegion[region.id]).toBe(456); expect(migrated.economicOutputByRegion[region.id]).toBe(789);
  });
  it('migrates v4 saves to an empty diplomacy baseline and preserves all prior state', () => {
    const v4 = { schemaVersion: 4, date: '2026-04-05', paused: false, speed: 2, territoryOwnership: { 'territory.alpha': 'country.beta' }, regionOwnership: { [region.id]: 'country.beta' }, populationByRegion: { [region.id]: 654 }, economicOutputByRegion: { [region.id]: 987 } };
    const migrated = migrateSimulationState(v4, [region]);
    expect(migrated).toMatchObject({ schemaVersion: 6, date: '2026-04-05', paused: false, speed: 2, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} });
    expect(migrated.territoryOwnership).toEqual(v4.territoryOwnership); expect(migrated.regionOwnership).toEqual(v4.regionOwnership); expect(migrated.populationByRegion).toEqual(v4.populationByRegion); expect(migrated.economicOutputByRegion).toEqual(v4.economicOutputByRegion);
  });
  it('migrates v5 saves to an empty war baseline while preserving diplomacy', () => {
    const v5 = { schemaVersion: 5, date: '2026-05-06', paused: false, speed: 5, territoryOwnership: { 'territory.alpha': 'country.alpha' }, regionOwnership: { [region.id]: 'country.alpha' }, populationByRegion: { [region.id]: 321 }, economicOutputByRegion: { [region.id]: 654 }, bilateralRelations: {}, claims: [{ id: 'claim.saved', claimantCountryId: 'country.beta', regionId: region.id, type: 'core', creationDate: '2026-01-01', status: 'active' }], explicitCasusBelli: [] };
    const context = { countryIds: new Set(['country.alpha', 'country.beta']), regionIds: new Set([region.id]) };
    const migrated = migrateSimulationState(v5, [region], {}, {}, context);
    expect(migrated).toMatchObject({ schemaVersion: 6, date: v5.date, paused: v5.paused, speed: v5.speed, wars: [], occupationByRegion: {} });
    expect(migrated.territoryOwnership).toEqual(v5.territoryOwnership); expect(migrated.regionOwnership).toEqual(v5.regionOwnership); expect(migrated.populationByRegion).toEqual(v5.populationByRegion); expect(migrated.economicOutputByRegion).toEqual(v5.economicOutputByRegion); expect(migrated.claims).toEqual(v5.claims);
  });
  it('rejects unsupported future save schemas instead of treating them as v1', () => {
    expect(() => migrateSimulationState({ schemaVersion: 7, date: '2030-01-01', paused: true, speed: 1, territoryOwnership: {} }, [region])).toThrow(/Unsupported simulation save schema version: 7/);
  });
});
