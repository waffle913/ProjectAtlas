import type { SimulationState } from '../types';

export function transferTerritory(state: SimulationState, territoryId: string, fromCountryId: string, toCountryId: string): SimulationState {
  const owner = state.territoryOwnership[territoryId];
  if (owner !== fromCountryId) throw new Error(`Territory ${territoryId} is not owned by ${fromCountryId}`);
  return {...state, territoryOwnership: {...state.territoryOwnership, [territoryId]: toCountryId}};
}
