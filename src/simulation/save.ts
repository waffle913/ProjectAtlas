import type { RegionEntity, SimulationState } from '../types';
import { validateDiplomacyState, type DiplomacyContext } from './diplomacy';
import { validateWarState } from './war';

export interface LegacySimulationStateV1 {
  schemaVersion?: 1;
  date: string;
  paused: boolean;
  speed: 1 | 2 | 5;
  territoryOwnership: Record<string, string | undefined>;
}
type DiplomacyFields = 'bilateralRelations' | 'claims' | 'explicitCasusBelli';
type WarFields = 'wars' | 'occupationByRegion';
export interface SimulationStateV2 extends Omit<SimulationState, 'schemaVersion' | 'populationByRegion' | 'economicOutputByRegion' | DiplomacyFields | WarFields> { schemaVersion: 2 }
export interface SimulationStateV3 extends Omit<SimulationState, 'schemaVersion' | 'economicOutputByRegion' | DiplomacyFields | WarFields> { schemaVersion: 3 }
export interface SimulationStateV4 extends Omit<SimulationState, 'schemaVersion' | DiplomacyFields | WarFields> { schemaVersion: 4 }
export interface SimulationStateV5 extends Omit<SimulationState, 'schemaVersion' | WarFields> { schemaVersion: 5 }

export function migrateSimulationState(save: unknown, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}, baselineEconomicOutput: Record<string, number | undefined> = {}, diplomacyContext?: DiplomacyContext): SimulationState {
  if (!save || typeof save !== 'object') throw new Error('Malformed simulation save.');
  const version = (save as { schemaVersion?: unknown }).schemaVersion;
  if (version === 6) {
    const current = save as SimulationState;
    if (!current.populationByRegion || Object.values(current.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0)) || !current.economicOutputByRegion || Object.values(current.economicOutputByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0)) || !current.bilateralRelations || !Array.isArray(current.claims) || !Array.isArray(current.explicitCasusBelli) || !Array.isArray(current.wars) || !current.occupationByRegion) throw new Error('Malformed v6 simulation state.');
    const migrated: SimulationState = {
      ...current,
      territoryOwnership: { ...current.territoryOwnership },
      regionOwnership: { ...current.regionOwnership },
      populationByRegion: { ...current.populationByRegion },
      economicOutputByRegion: { ...current.economicOutputByRegion },
      bilateralRelations: Object.fromEntries(Object.entries(current.bilateralRelations).map(([key, relation]) => [key, { ...relation }])),
      claims: current.claims.map(claim => ({ ...claim })),
      explicitCasusBelli: current.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })),
      wars: current.wars.map(war => ({ ...war, declarationCasusBelli: { ...war.declarationCasusBelli, targetRegionIds: war.declarationCasusBelli.targetRegionIds ? [...war.declarationCasusBelli.targetRegionIds] : undefined } })),
      occupationByRegion: Object.fromEntries(Object.entries(current.occupationByRegion).map(([regionId, occupation]) => [regionId, { ...occupation }])),
    };
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v6 simulation save.');
    validateDiplomacyState(migrated, diplomacyContext);
    validateWarState(migrated, diplomacyContext);
    return migrated;
  }
  if (version !== undefined && version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5) throw new Error(`Unsupported simulation save schema version: ${String(version)}`);
  if (version === 5) {
    const current = save as SimulationStateV5;
    if (!current.populationByRegion || !current.economicOutputByRegion || !current.bilateralRelations || !Array.isArray(current.claims) || !Array.isArray(current.explicitCasusBelli)) throw new Error('Malformed v5 simulation state.');
    const migrated: SimulationState = { ...current, schemaVersion: 6, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: Object.fromEntries(Object.entries(current.bilateralRelations).map(([key, relation]) => [key, { ...relation }])), claims: current.claims.map(claim => ({ ...claim })), explicitCasusBelli: current.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })), wars: [], occupationByRegion: {} };
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v5 simulation save migration.');
    validateDiplomacyState(migrated, diplomacyContext); validateWarState(migrated, diplomacyContext); return migrated;
  }
  if (version === 4) {
    const current = save as SimulationStateV4;
    if (!current.populationByRegion || !current.economicOutputByRegion || Object.values(current.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0)) || Object.values(current.economicOutputByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Malformed v4 simulation state.');
    return { ...current, schemaVersion: 6, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} };
  }
  if (version === 3) {
    const current = save as SimulationStateV3;
    if (!current.populationByRegion || Object.values(current.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Malformed v3 simulation population state.');
    return { ...current, schemaVersion: 6, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} };
  }
  if (version === 2) {
    const current = save as SimulationStateV2;
    if (!current.territoryOwnership || !current.regionOwnership || !current.date || ![1, 2, 5].includes(current.speed)) throw new Error('Malformed v2 simulation save.');
    return { ...current, schemaVersion: 6, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: Object.fromEntries(regions.map(region => [region.id, baselinePopulation[region.id]])), economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} };
  }
  const legacy = save as LegacySimulationStateV1;
  if (!legacy.territoryOwnership || !legacy.date || ![1, 2, 5].includes(legacy.speed)) throw new Error('Malformed legacy simulation save.');
  const regionOwnership = Object.fromEntries(regions.map(region => [
    region.id,
    (region.macroTerritoryId && legacy.territoryOwnership[region.macroTerritoryId]) ?? region.initialOwnerCountryId,
  ]));
  return { ...legacy, schemaVersion: 6, territoryOwnership: { ...legacy.territoryOwnership }, regionOwnership, populationByRegion: Object.fromEntries(regions.map(region => [region.id, baselinePopulation[region.id]])), economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} };
}

export const serializeSimulationState = (state: SimulationState) => JSON.stringify(state);
export const restoreSimulationState = (serialized: string, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}, baselineEconomicOutput: Record<string, number | undefined> = {}, diplomacyContext?: DiplomacyContext) =>
  migrateSimulationState(JSON.parse(serialized), regions, baselinePopulation, baselineEconomicOutput, diplomacyContext);
