import { describe, expect, it } from 'vitest';
import type { Country, RegionEntity, SimulationState } from '../../types';
import { transferRegion } from '../region';
import { migrateSimulationState, restoreSimulationState, serializeSimulationState } from '../save';

const region: RegionEntity = {
  id: 'region.permanent', parentCountryId: 'country.alpha', initialOwnerCountryId: 'country.alpha',
  macroTerritoryId: 'territory.alpha', commonName: 'Example', administrativeLevel: 1,
  externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'source', sourceFeatureIds: ['feature-a'] },
};
const state: SimulationState = {
  schemaVersion: 2, date: '2026-01-01', paused: true, speed: 1,
  territoryOwnership: { 'territory.alpha': 'country.alpha' },
  regionOwnership: { 'region.permanent': 'country.alpha' },
};

describe('Region ownership and saves', () => {
  it('transfers ownership without mutating the prior state or country identity', () => {
    const country: Country = { id: 'country.alpha', commonName: 'Alpha', externalIds: {}, entityType: 'sovereign_state', unMembership: 'member', sources: {}, kind: 'sovereign' };
    const frozenCountry = structuredClone(country);
    const next = transferRegion(state, region.id, 'country.alpha', 'country.beta');
    expect(next.regionOwnership[region.id]).toBe('country.beta');
    expect(state.regionOwnership[region.id]).toBe('country.alpha');
    expect(country).toEqual(frozenCountry);
  });
  it('preserves transferred ownership through save serialization and restoration', () => {
    const transferred = transferRegion(state, region.id, 'country.alpha', 'country.beta');
    const restored = restoreSimulationState(serializeSimulationState(transferred), [region]);
    expect(restored.regionOwnership[region.id]).toBe('country.beta');
    expect(restored.schemaVersion).toBe(2);
  });
  it('migrates territory-only saves without discarding their IDs or ownership', () => {
    const migrated = migrateSimulationState({ date: '2026-01-03', paused: false, speed: 2, territoryOwnership: { 'territory.alpha': 'country.beta' } }, [region]);
    expect(migrated.territoryOwnership['territory.alpha']).toBe('country.beta');
    expect(migrated.regionOwnership[region.id]).toBe('country.beta');
  });
  it('rejects unsupported future save schemas instead of treating them as v1', () => {
    expect(() => migrateSimulationState({ schemaVersion: 3, date: '2030-01-01', paused: true, speed: 1, territoryOwnership: {} }, [region])).toThrow(/Unsupported simulation save schema version: 3/);
  });
});
