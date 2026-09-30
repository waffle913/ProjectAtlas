import type { Country, RegionEntity, SimulationState } from '../types';
import { cloneSimulationState } from './state';

/** Coherent access to canonical simulation state and immutable identity registries. */
export interface CanonicalWorld {
  readonly state: SimulationState;
  readonly countriesById: ReadonlyMap<string, Country>;
  readonly regionsById: ReadonlyMap<string, RegionEntity>;
  snapshot(): SimulationState;
  ownerOfRegion(regionId: string): string | undefined;
  occupierOfRegion(regionId: string): string | undefined;
}

export function canonicalWorld(state: SimulationState, countriesById: ReadonlyMap<string, Country>, regionsById: ReadonlyMap<string, RegionEntity>): CanonicalWorld {
  return {
    state, countriesById, regionsById,
    snapshot: () => cloneSimulationState(state),
    ownerOfRegion: regionId => state.regionOwnership[regionId],
    occupierOfRegion: regionId => state.occupationByRegion[regionId]?.occupierCountryId,
  };
}

export interface SimulationDelta { readonly fromTick: number; readonly toTick: number; readonly date: string; readonly changedDomains: readonly string[] }
const structurallyEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => structurallyEqual(value, right[index]));
  const leftRecord = left as Record<string, unknown>, rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord), rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.hasOwn(rightRecord, key) && structurallyEqual(leftRecord[key], rightRecord[key]));
};
export const simulationDelta = (before: SimulationState, after: SimulationState): SimulationDelta => ({
  fromTick: before.engine.tick,
  toTick: after.engine.tick,
  date: after.date,
  changedDomains: [
    structurallyEqual(before.crisis, after.crisis) ? undefined : 'crisis',
    structurallyEqual(before.politics, after.politics) ? undefined : 'politics',
    structurallyEqual(before.fiscal, after.fiscal) ? undefined : 'fiscal',
    structurallyEqual(before.socioeconomy, after.socioeconomy) ? undefined : 'socioeconomy',
    before.date === after.date ? undefined : 'time',
    structurallyEqual(before.regionOwnership, after.regionOwnership) ? undefined : 'sovereignty',
    structurallyEqual(before.occupationByRegion, after.occupationByRegion) ? undefined : 'occupation',
    structurallyEqual(before.wars, after.wars) ? undefined : 'war',
    structurallyEqual(before.engine.fidelityByCountry, after.engine.fidelityByCountry) ? undefined : 'fidelity',
  ].filter((value): value is string => Boolean(value)),
});
