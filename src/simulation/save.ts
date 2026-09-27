import type { RegionEntity, SimulationState } from '../types';

export interface LegacySimulationStateV1 {
  schemaVersion?: 1;
  date: string;
  paused: boolean;
  speed: 1 | 2 | 5;
  territoryOwnership: Record<string, string | undefined>;
}
export interface SimulationStateV2 extends Omit<SimulationState, 'schemaVersion' | 'populationByRegion'> { schemaVersion: 2 }

export function migrateSimulationState(save: unknown, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}): SimulationState {
  if (!save || typeof save !== 'object') throw new Error('Malformed simulation save.');
  const version = (save as { schemaVersion?: unknown }).schemaVersion;
  if (version === 3) {
    const current = save as SimulationState;
    if (!current.populationByRegion || Object.values(current.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Malformed v3 simulation population state.');
    return {
      ...current,
      territoryOwnership: { ...current.territoryOwnership },
      regionOwnership: { ...current.regionOwnership },
      populationByRegion: { ...current.populationByRegion },
    };
  }
  if (version !== undefined && version !== 1 && version !== 2) throw new Error(`Unsupported simulation save schema version: ${String(version)}`);
  if (version === 2) {
    const current = save as SimulationStateV2;
    if (!current.territoryOwnership || !current.regionOwnership || !current.date || ![1, 2, 5].includes(current.speed)) throw new Error('Malformed v2 simulation save.');
    return { ...current, schemaVersion: 3, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: Object.fromEntries(regions.map(region => [region.id, baselinePopulation[region.id]])) };
  }
  const legacy = save as LegacySimulationStateV1;
  if (!legacy.territoryOwnership || !legacy.date || ![1, 2, 5].includes(legacy.speed)) throw new Error('Malformed legacy simulation save.');
  const regionOwnership = Object.fromEntries(regions.map(region => [
    region.id,
    (region.macroTerritoryId && legacy.territoryOwnership[region.macroTerritoryId]) ?? region.initialOwnerCountryId,
  ]));
  return { ...legacy, schemaVersion: 3, territoryOwnership: { ...legacy.territoryOwnership }, regionOwnership, populationByRegion: Object.fromEntries(regions.map(region => [region.id, baselinePopulation[region.id]])) };
}

export const serializeSimulationState = (state: SimulationState) => JSON.stringify(state);
export const restoreSimulationState = (serialized: string, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}) =>
  migrateSimulationState(JSON.parse(serialized), regions, baselinePopulation);
