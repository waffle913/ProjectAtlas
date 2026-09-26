import type { SimulationState } from '../types';

export function transferRegion(state: SimulationState, regionId: string, fromCountryId: string, toCountryId: string): SimulationState {
  const owner = state.regionOwnership[regionId];
  if (owner !== fromCountryId) throw new Error(`Region ${regionId} is not owned by ${fromCountryId}`);
  return { ...state, regionOwnership: { ...state.regionOwnership, [regionId]: toCountryId } };
}
