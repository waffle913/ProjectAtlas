import type { RegionEntity, SimulationState } from '../types';
import type { DiplomacyContext } from './diplomacy';
import { assertSimulationInvariants, type InvariantContext } from './invariants';
import { cloneSimulationState, createEngineState } from './state';

export interface LegacySimulationStateV1 { schemaVersion?: 1; date: string; paused: boolean; speed: 1 | 2 | 5; territoryOwnership: Record<string, string | undefined> }
type DiplomacyFields = 'bilateralRelations' | 'claims' | 'explicitCasusBelli';
type WarFields = 'wars' | 'occupationByRegion';
type EngineFields = 'engine';
export interface SimulationStateV2 extends Omit<SimulationState, 'schemaVersion' | 'populationByRegion' | 'economicOutputByRegion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 2 }
export interface SimulationStateV3 extends Omit<SimulationState, 'schemaVersion' | 'economicOutputByRegion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 3 }
export interface SimulationStateV4 extends Omit<SimulationState, 'schemaVersion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 4 }
export interface SimulationStateV5 extends Omit<SimulationState, 'schemaVersion' | WarFields | EngineFields> { schemaVersion: 5 }
export interface SimulationStateV6 extends Omit<SimulationState, 'schemaVersion' | EngineFields> { schemaVersion: 6 }

const countryIdsFor = (state: { territoryOwnership: Record<string, string | undefined>; regionOwnership?: Record<string, string | undefined> }, regions: readonly RegionEntity[], context?: DiplomacyContext) =>
  context?.countryIds ?? new Set([
    ...regions.flatMap(region => [region.parentCountryId, region.initialOwnerCountryId]),
    ...Object.values(state.territoryOwnership),
    ...Object.values(state.regionOwnership ?? {}),
  ].filter((id): id is string => Boolean(id)));
const withEngine = (state: Omit<SimulationState, 'schemaVersion' | 'engine'>, regions: readonly RegionEntity[], context?: DiplomacyContext): SimulationState => ({ ...state, schemaVersion: 7, engine: createEngineState(countryIdsFor(state, regions, context)) });
const validationContext = (regions: RegionEntity[], context: DiplomacyContext): InvariantContext => ({ ...context, regions });

export function migrateSimulationState(save: unknown, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}, baselineEconomicOutput: Record<string, number | undefined> = {}, diplomacyContext?: DiplomacyContext): SimulationState {
  if (!save || typeof save !== 'object') throw new Error('Malformed simulation save.');
  const version = (save as { schemaVersion?: unknown }).schemaVersion;
  if (version === 7) {
    const current = save as SimulationState;
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v7 simulation save.');
    if (!current.engine || typeof current.engine.seed !== 'string' || !Number.isSafeInteger(current.engine.tick) || !current.engine.fidelityByCountry || !Array.isArray(current.engine.pendingFidelityTransitions) || !Array.isArray(current.engine.recentFidelityTransitions) || !Array.isArray(current.engine.pendingImmediateUpdates) || !Array.isArray(current.engine.dirtyDomains)) throw new Error('Malformed v7 simulation engine state.');
    const restored = cloneSimulationState(current);
    assertSimulationInvariants(restored, validationContext(regions, diplomacyContext), 'reload');
    return restored;
  }
  if (version !== undefined && ![1, 2, 3, 4, 5, 6].includes(version as number)) throw new Error(`Unsupported simulation save schema version: ${String(version)}`);

  let migrated: SimulationState;
  if (version === 6) {
    const current = save as SimulationStateV6;
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v6 simulation save migration.');
    if (!current.populationByRegion || !current.economicOutputByRegion || !current.bilateralRelations || !Array.isArray(current.claims) || !Array.isArray(current.explicitCasusBelli) || !Array.isArray(current.wars) || !current.occupationByRegion) throw new Error('Malformed v6 simulation state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: Object.fromEntries(Object.entries(current.bilateralRelations).map(([key, relation]) => [key, { ...relation }])), claims: current.claims.map(claim => ({ ...claim })), explicitCasusBelli: current.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })), wars: current.wars.map(war => ({ ...war, declarationCasusBelli: { ...war.declarationCasusBelli, targetRegionIds: war.declarationCasusBelli.targetRegionIds ? [...war.declarationCasusBelli.targetRegionIds] : undefined } })), occupationByRegion: Object.fromEntries(Object.entries(current.occupationByRegion).map(([id, occupation]) => [id, { ...occupation }])) }, regions, diplomacyContext);
  } else if (version === 5) {
    const current = save as SimulationStateV5;
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v5 simulation save migration.');
    if (!current.populationByRegion || !current.economicOutputByRegion || !current.bilateralRelations || !Array.isArray(current.claims) || !Array.isArray(current.explicitCasusBelli)) throw new Error('Malformed v5 simulation state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: Object.fromEntries(Object.entries(current.bilateralRelations).map(([key, relation]) => [key, { ...relation }])), claims: current.claims.map(claim => ({ ...claim })), explicitCasusBelli: current.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })), wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else if (version === 4) {
    const current = save as SimulationStateV4;
    if (!current.populationByRegion || !current.economicOutputByRegion || Object.values(current.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0)) || Object.values(current.economicOutputByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Malformed v4 simulation state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else if (version === 3) {
    const current = save as SimulationStateV3;
    if (!current.populationByRegion || Object.values(current.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Malformed v3 simulation population state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else if (version === 2) {
    const current = save as SimulationStateV2;
    if (!current.territoryOwnership || !current.regionOwnership || !current.date || ![1, 2, 5].includes(current.speed)) throw new Error('Malformed v2 simulation save.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: Object.fromEntries(regions.map(region => [region.id, baselinePopulation[region.id]])), economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else {
    const legacy = save as LegacySimulationStateV1;
    if (!legacy.territoryOwnership || !legacy.date || ![1, 2, 5].includes(legacy.speed)) throw new Error('Malformed legacy simulation save.');
    const regionOwnership = Object.fromEntries(regions.map(region => [region.id, (region.macroTerritoryId && legacy.territoryOwnership[region.macroTerritoryId]) ?? region.initialOwnerCountryId]));
    migrated = withEngine({ ...legacy, territoryOwnership: { ...legacy.territoryOwnership }, regionOwnership, populationByRegion: Object.fromEntries(regions.map(region => [region.id, baselinePopulation[region.id]])), economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  }
  if (diplomacyContext) assertSimulationInvariants(migrated, validationContext(regions, diplomacyContext), 'reload');
  return migrated;
}

export function serializeSimulationState(state: SimulationState, context?: InvariantContext) {
  if (context) assertSimulationInvariants(state, context, 'save');
  return JSON.stringify(state);
}
export const restoreSimulationState = (serialized: string, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}, baselineEconomicOutput: Record<string, number | undefined> = {}, diplomacyContext?: DiplomacyContext) => migrateSimulationState(JSON.parse(serialized), regions, baselinePopulation, baselineEconomicOutput, diplomacyContext);
