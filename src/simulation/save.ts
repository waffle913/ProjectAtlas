import type { RegionEntity, SimulationState } from '../types';

export interface LegacySimulationStateV1 {
  schemaVersion?: 1;
  date: string;
  paused: boolean;
  speed: 1 | 2 | 5;
  territoryOwnership: Record<string, string | undefined>;
}

export function migrateSimulationState(save: unknown, regions: RegionEntity[]): SimulationState {
  if (!save || typeof save !== 'object') throw new Error('Malformed simulation save.');
  const version = (save as { schemaVersion?: unknown }).schemaVersion;
  if (version === 2) {
    const current = save as SimulationState;
    return {
      ...current,
      territoryOwnership: { ...current.territoryOwnership },
      regionOwnership: { ...current.regionOwnership },
    };
  }
  if (version !== undefined && version !== 1) throw new Error(`Unsupported simulation save schema version: ${String(version)}`);
  const legacy = save as LegacySimulationStateV1;
  if (!legacy.territoryOwnership || !legacy.date || ![1, 2, 5].includes(legacy.speed)) throw new Error('Malformed legacy simulation save.');
  const regionOwnership = Object.fromEntries(regions.map(region => [
    region.id,
    (region.macroTerritoryId && legacy.territoryOwnership[region.macroTerritoryId]) ?? region.initialOwnerCountryId,
  ]));
  return { ...legacy, schemaVersion: 2, territoryOwnership: { ...legacy.territoryOwnership }, regionOwnership };
}

export const serializeSimulationState = (state: SimulationState) => JSON.stringify(state);
export const restoreSimulationState = (serialized: string, regions: RegionEntity[]) =>
  migrateSimulationState(JSON.parse(serialized), regions);
