import type { SimulationState } from '../types';

export function transferRegion(state: SimulationState, regionId: string, fromCountryId: string, toCountryId: string): SimulationState {
  const owner = state.regionOwnership[regionId];
  if (owner !== fromCountryId) throw new Error(`Region ${regionId} is not owned by ${fromCountryId}`);
  return { ...state, regionOwnership: { ...state.regionOwnership, [regionId]: toCountryId } };
}

export function controlledPopulation(state: SimulationState, countryId: string) {
  const regions = Object.entries(state.regionOwnership).filter(([, owner]) => owner === countryId).map(([regionId]) => regionId);
  if (!regions.length || regions.some(regionId => state.populationByRegion[regionId] === undefined)) return undefined;
  return regions.reduce((total, regionId) => total + state.populationByRegion[regionId]!, 0);
}

export function originalPopulation(state: SimulationState, countryId: string, initialOwners: Record<string, string>) {
  const regions = Object.entries(initialOwners).filter(([, owner]) => owner === countryId).map(([regionId]) => regionId);
  if (!regions.length || regions.some(regionId => state.populationByRegion[regionId] === undefined)) return undefined;
  return regions.reduce((total, regionId) => total + state.populationByRegion[regionId]!, 0);
}

export function controlledEconomicOutput(state: SimulationState, countryId: string) {
  const regions = Object.entries(state.regionOwnership).filter(([, owner]) => owner === countryId).map(([regionId]) => regionId);
  if (!regions.length || regions.some(regionId => state.economicOutputByRegion[regionId] === undefined)) return undefined;
  return regions.reduce((total, regionId) => total + state.economicOutputByRegion[regionId]!, 0);
}

export function originalEconomicOutput(state: SimulationState, countryId: string, initialOwners: Record<string, string>) {
  const regions = Object.entries(initialOwners).filter(([, owner]) => owner === countryId).map(([regionId]) => regionId);
  if (!regions.length || regions.some(regionId => state.economicOutputByRegion[regionId] === undefined)) return undefined;
  return regions.reduce((total, regionId) => total + state.economicOutputByRegion[regionId]!, 0);
}
