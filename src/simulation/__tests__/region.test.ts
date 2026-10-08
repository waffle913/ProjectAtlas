import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptySocioeconomy } from '../../simulation/socioeconomy/model';
import { describe, expect, it } from 'vitest';
import type { Country, RegionEntity, SimulationState } from '../../types';
import { controlledBaselineAnnualOutput, controlledBaselinePopulation, transferRegion } from '../region';
import { migrateSimulationState, restoreSimulationState, serializeSimulationState } from '../save';
import { createEngineState } from '../state';
import { validateSimulationInvariants } from '../invariants';

const region: RegionEntity = {
  id: 'region.permanent', parentCountryId: 'country.alpha', initialOwnerCountryId: 'country.alpha',
  macroTerritoryId: 'territory.alpha', commonName: 'Example', administrativeLevel: 1,
  externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'source', sourceFeatureIds: ['feature-a'] },
};
const state: SimulationState = {
  schemaVersion: 19, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: true, speed: 1,
  territoryOwnership: { 'territory.alpha': 'country.alpha' },
  regionOwnership: { 'region.permanent': 'country.alpha' },
  populationByRegion: { 'region.permanent': 12345 },
  economicOutputByRegion: { 'region.permanent': 200_000_000_000 },
  bilateralRelations: {}, claims: [], explicitCasusBelli: [],
  wars: [], occupationByRegion: {}, engine: createEngineState(['country.alpha', 'country.beta']),
};

describe('Region ownership and saves', () => {
  it.each(['country.unknown', 'toString', '__proto__'])('rejects unregistered sovereignty endpoints, including inherited fidelity keys: %s', unknown => {
    const before = structuredClone(state);
    expect(() => transferRegion(state, region.id, 'country.alpha', unknown)).toThrow(/Unknown Country ID/);
    expect(() => transferRegion(state, region.id, unknown, 'country.beta')).toThrow(/Unknown Country ID/);
    const corrupted = { ...state, regionOwnership: { ...state.regionOwnership, [region.id]: unknown } };
    expect(() => transferRegion(corrupted, region.id, unknown, 'country.beta')).toThrow(/Unknown Country ID/);
    expect(state).toEqual(before);
  });
  it('permits a registered no-op without changing any canonical branch', () => {
    const next = transferRegion(state, region.id, 'country.alpha', 'country.alpha');
    expect(next).toEqual(state); expect(next.engine).toBe(state.engine);
  });
  it.each([1, 2, 3, 4])('always validates the final canonical state for schema %s without optional diplomacy context', schemaVersion => {
    const legacy = {
      schemaVersion, date: '2031-04-05', paused: false, speed: 2,
      territoryOwnership: { 'territory.alpha': 'country.beta' },
      ...(schemaVersion >= 2 ? { regionOwnership: { [region.id]: 'country.beta' } } : {}),
      ...(schemaVersion >= 3 ? { populationByRegion: { [region.id]: 654 } } : {}),
      ...(schemaVersion >= 4 ? { economicOutputByRegion: { [region.id]: 987 } } : {}),
    };
    const migrated = migrateSimulationState(legacy, [region], { [region.id]: 654 }, { [region.id]: 987 });
    const context = { regions: [region], regionIds: new Set([region.id]), countryIds: new Set(['country.alpha', 'country.beta']) };
    expect(validateSimulationInvariants(migrated, context, 'reload').valid).toBe(true);
    expect(migrated.date).toBe(legacy.date);
    expect(migrated.regionOwnership[region.id]).toBe('country.beta');
    expect(migrated.populationByRegion[region.id]).toBe(654);
    expect(migrated.economicOutputByRegion[region.id]).toBe(987);
    expect(() => migrateSimulationState({ ...legacy, paused: 'invalid' }, [region], { [region.id]: 654 }, { [region.id]: 987 })).toThrow(/pause/);
    expect(() => migrateSimulationState({ ...legacy, date: '2026-02-30' }, [region])).toThrow();
    if (schemaVersion >= 2) {
      expect(() => migrateSimulationState({ ...legacy, regionOwnership: { [region.id]: 'country.unexplained' } }, [region])).toThrow(/Unexplained legacy Country/);
      expect(() => migrateSimulationState({ ...legacy, regionOwnership: { [region.id]: 'country.beta', 'region.unknown': 'country.beta' } }, [region])).toThrow(/unknown Region/);
    }
  });
  it('transfers ownership without mutating the prior state or country identity', () => {
    const country: Country = { id: 'country.alpha', commonName: 'Alpha', externalIds: {}, entityType: 'sovereign_state', unMembership: 'member', sources: {}, kind: 'sovereign' };
    const frozenCountry = structuredClone(country);
    const next = transferRegion(state, region.id, 'country.alpha', 'country.beta');
    expect(next.regionOwnership[region.id]).toBe('country.beta');
    expect(state.regionOwnership[region.id]).toBe('country.alpha');
    expect(next.populationByRegion[region.id]).toBe(12_345);
    expect(next.economicOutputByRegion[region.id]).toBe(200_000_000_000);
    expect(controlledBaselinePopulation(next, 'country.alpha')).toBeUndefined();
    expect(controlledBaselinePopulation(next, 'country.beta')).toBe(12_345);
    expect(controlledBaselineAnnualOutput(next, 'country.alpha')).toBeUndefined();
    expect(controlledBaselineAnnualOutput(next, 'country.beta')).toBe(200_000_000_000);
    expect(country).toEqual(frozenCountry);
  });
  it('preserves transferred ownership through save serialization and restoration', () => {
    const transferred = transferRegion(state, region.id, 'country.alpha', 'country.beta');
    const restored = restoreSimulationState(serializeSimulationState(transferred), [region], {}, {}, { countryIds: new Set(['country.alpha', 'country.beta']), regionIds: new Set([region.id]) });
    expect(restored.regionOwnership[region.id]).toBe('country.beta');
    expect(restored.schemaVersion).toBe(19);
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
  it('assigns fidelity to every Country known through Regions when migrating without a diplomacy context', () => {
    const secondRegion: RegionEntity = { ...region, id: 'region.second', parentCountryId: 'country.beta', initialOwnerCountryId: 'country.beta', macroTerritoryId: 'territory.beta', commonName: 'Second', geographyMapping: { status: 'mapped', datasetId: 'source', sourceFeatureIds: ['feature-b'] } };
    const regions = [region, secondRegion];
    const migrated = migrateSimulationState({ date: '2026-01-03', paused: false, speed: 1, territoryOwnership: { 'territory.alpha': 'country.alpha', 'territory.beta': 'country.beta' } }, regions, { [region.id]: 500, [secondRegion.id]: 700 }, { [region.id]: 800, [secondRegion.id]: 900 });
    expect(migrated.engine.fidelityByCountry).toEqual({ 'country.alpha': 'Standard', 'country.beta': 'Standard' });
    const registryContext = { countryIds: new Set(['country.alpha', 'country.beta']), regionIds: new Set(regions.map(item => item.id)), regions };
    expect(validateSimulationInvariants(migrated, registryContext, 'reload')).toEqual({ valid: true, violations: [] });
  });
  it('migrates v2 population deterministically and transfers control without changing inhabitants', () => {
    const v2 = { schemaVersion: 2, date: '2026-01-01', paused: true, speed: 1, territoryOwnership: { 'territory.alpha': 'country.alpha' }, regionOwnership: { [region.id]: 'country.alpha' } };
    const context = { countryIds: new Set(['country.alpha', 'country.beta']), regionIds: new Set([region.id]) };
    const migrated = migrateSimulationState(v2, [region], { [region.id]: 900 }, { [region.id]: 800 }, context);
    const transferred = transferRegion(migrated, region.id, 'country.alpha', 'country.beta');
    expect(transferred.populationByRegion[region.id]).toBe(900);
    expect(controlledBaselinePopulation(transferred, 'country.beta')).toBe(900);
    expect(controlledBaselinePopulation(transferred, 'country.alpha')).toBeUndefined();
    expect(transferred.economicOutputByRegion[region.id]).toBe(800);
    expect(controlledBaselineAnnualOutput(transferred, 'country.beta')).toBe(800);
  });
  it('never reports a partial controlled population when one owned Region is unavailable', () => {
    const incomplete = { ...state, regionOwnership: { 'region.one': 'country.alpha', 'region.two': 'country.alpha' }, populationByRegion: { 'region.one': 100, 'region.two': undefined }, economicOutputByRegion: { 'region.one': 500, 'region.two': undefined } };
    expect(controlledBaselinePopulation(incomplete, 'country.alpha')).toBeUndefined();
    expect(controlledBaselineAnnualOutput(incomplete, 'country.alpha')).toBeUndefined();
  });
  it('migrates v3 saves deterministically without altering population or ownership', () => {
    const v3 = { schemaVersion: 3, date: '2026-02-03', paused: false, speed: 5, territoryOwnership: { 'territory.alpha': 'country.beta' }, regionOwnership: { [region.id]: 'country.beta' }, populationByRegion: { [region.id]: 456 } };
    const migrated = migrateSimulationState(v3, [region], {}, { [region.id]: 789 });
    expect(migrated).toMatchObject({ schemaVersion: 19, date: '2026-02-03', paused: false, speed: 5 });
    expect(migrated.regionOwnership[region.id]).toBe('country.beta'); expect(migrated.populationByRegion[region.id]).toBe(456); expect(migrated.economicOutputByRegion[region.id]).toBe(789);
  });
  it('migrates v4 saves to an empty diplomacy baseline and preserves all prior state', () => {
    const v4 = { schemaVersion: 4, date: '2026-04-05', paused: false, speed: 2, territoryOwnership: { 'territory.alpha': 'country.beta' }, regionOwnership: { [region.id]: 'country.beta' }, populationByRegion: { [region.id]: 654 }, economicOutputByRegion: { [region.id]: 987 } };
    const migrated = migrateSimulationState(v4, [region]);
    expect(migrated).toMatchObject({ schemaVersion: 19, date: '2026-04-05', paused: false, speed: 2, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} });
    expect(migrated.territoryOwnership).toEqual(v4.territoryOwnership); expect(migrated.regionOwnership).toEqual(v4.regionOwnership); expect(migrated.populationByRegion).toEqual(v4.populationByRegion); expect(migrated.economicOutputByRegion).toEqual(v4.economicOutputByRegion);
  });
  it('migrates v5 saves to an empty war baseline while preserving diplomacy', () => {
    const v5 = { schemaVersion: 5, date: '2026-05-06', paused: false, speed: 5, territoryOwnership: { 'territory.alpha': 'country.alpha' }, regionOwnership: { [region.id]: 'country.alpha' }, populationByRegion: { [region.id]: 321 }, economicOutputByRegion: { [region.id]: 654 }, bilateralRelations: {}, claims: [{ id: 'claim.saved', claimantCountryId: 'country.beta', regionId: region.id, type: 'core', creationDate: '2026-01-01', status: 'active' }], explicitCasusBelli: [] };
    const context = { countryIds: new Set(['country.alpha', 'country.beta']), regionIds: new Set([region.id]) };
    const migrated = migrateSimulationState(v5, [region], {}, {}, context);
    expect(migrated).toMatchObject({ schemaVersion: 19, date: v5.date, paused: v5.paused, speed: v5.speed, wars: [], occupationByRegion: {} });
    expect(migrated.territoryOwnership).toEqual(v5.territoryOwnership); expect(migrated.regionOwnership).toEqual(v5.regionOwnership); expect(migrated.populationByRegion).toEqual(v5.populationByRegion); expect(migrated.economicOutputByRegion).toEqual(v5.economicOutputByRegion); expect(migrated.claims).toEqual(v5.claims);
  });
  it('migrates v6 saves by adding deterministic engine state without changing the world', () => {
    const { engine: _engine, ...v6Body } = state;
    const v6 = { ...v6Body, schemaVersion: 6 };
    const context = { countryIds: new Set(['country.alpha', 'country.beta']), regionIds: new Set([region.id]) };
    const migrated = migrateSimulationState(v6, [region], {}, {}, context);
    expect(migrated.schemaVersion).toBe(19);
    expect(migrated.engine).toMatchObject({ seed: 'project-atlas-2026', tick: 0, fidelityByCountry: { 'country.alpha': 'Standard', 'country.beta': 'Standard' } });
    expect(migrated.regionOwnership).toEqual(state.regionOwnership);
    expect(migrated.populationByRegion).toEqual(state.populationByRegion);
    expect(migrated.economicOutputByRegion).toEqual(state.economicOutputByRegion);
  });
  it('rejects unsupported future save schemas instead of treating them as v1', () => {
    expect(() => migrateSimulationState({ schemaVersion: 20, date: '2030-01-01', paused: true, speed: 1, territoryOwnership: {} }, [region])).toThrow(/Unsupported simulation save schema version: 20/);
  });
});
