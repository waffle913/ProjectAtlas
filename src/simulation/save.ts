import type { RegionEntity, SimulationState } from '../types';

export interface LegacySimulationStateV1 {
  schemaVersion?: 1;
  date: string;
  paused: boolean;
  speed: 1 | 2 | 5;
  territoryOwnership: Record<string, string | undefined>;
}

export function migrateSimulationState(save: LegacySimulationStateV1 | SimulationState, regions: RegionEntity[]): SimulationState {
  if (save.schemaVersion === 2) return {
    ...save,
    territoryOwnership: { ...save.territoryOwnership },
    regionOwnership: { ...save.regionOwnership },
  };
  const regionOwnership = Object.fromEntries(regions.map(region => [
    region.id,
    (region.macroTerritoryId && save.territoryOwnership[region.macroTerritoryId]) ?? region.initialOwnerCountryId,
  ]));
  return { ...save, schemaVersion: 2, territoryOwnership: { ...save.territoryOwnership }, regionOwnership };
}

export const serializeSimulationState = (state: SimulationState) => JSON.stringify(state);
export const restoreSimulationState = (serialized: string, regions: RegionEntity[]) =>
  migrateSimulationState(JSON.parse(serialized) as LegacySimulationStateV1 | SimulationState, regions);
