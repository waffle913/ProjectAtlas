import type { SimulationState } from '../types';

export function transferRegion(state: SimulationState, regionId: string, fromCountryId: string, toCountryId: string): SimulationState {
  for (const countryId of [fromCountryId, toCountryId]) {
    if (!Object.hasOwn(state.engine.fidelityByCountry, countryId)) throw new Error(`Unknown Country ID: ${countryId}`);
  }
  const owner = state.regionOwnership[regionId];
  if (owner !== fromCountryId) throw new Error(`Region ${regionId} is not owned by ${fromCountryId}`);
  if (toCountryId !== fromCountryId && state.wars.some(war => war.status === 'active' && war.targetRegionId === regionId)) {
    throw new Error(`Region ${regionId} is an active war objective; sovereignty requires an explicit war resolution.`);
  }
  const occupation = state.occupationByRegion[regionId];
  if (toCountryId !== fromCountryId && occupation && state.wars.some(war => war.id === occupation.warId && war.status === 'active')) {
    throw new Error(`Region ${regionId} is occupied under an active war; sovereignty requires an explicit war resolution.`);
  }
  return { ...state, regionOwnership: { ...state.regionOwnership, [regionId]: toCountryId } };
}

/** Saved initialization/audit persons under current sovereignty; not simulated population. */
export function controlledBaselinePopulation(state: SimulationState, countryId: string) {
  const regions = Object.entries(state.regionOwnership).filter(([, owner]) => owner === countryId).map(([regionId]) => regionId);
  if (!regions.length || regions.some(regionId => state.populationByRegion[regionId] === undefined)) return undefined;
  return regions.reduce((total, regionId) => total + state.populationByRegion[regionId]!, 0);
}

export function originalBaselinePopulation(state: SimulationState, countryId: string, initialOwners: Record<string, string>) {
  const regions = Object.entries(initialOwners).filter(([, owner]) => owner === countryId).map(([regionId]) => regionId);
  if (!regions.length || regions.some(regionId => state.populationByRegion[regionId] === undefined)) return undefined;
  return regions.reduce((total, regionId) => total + state.populationByRegion[regionId]!, 0);
}

/** Saved initialization/audit USD/year under current sovereignty; not monthly output. */
export function controlledBaselineAnnualOutput(state: SimulationState, countryId: string) {
  const regions = Object.entries(state.regionOwnership).filter(([, owner]) => owner === countryId).map(([regionId]) => regionId);
  if (!regions.length || regions.some(regionId => state.economicOutputByRegion[regionId] === undefined)) return undefined;
  return regions.reduce((total, regionId) => total + state.economicOutputByRegion[regionId]!, 0);
}

export function originalBaselineAnnualOutput(state: SimulationState, countryId: string, initialOwners: Record<string, string>) {
  const regions = Object.entries(initialOwners).filter(([, owner]) => owner === countryId).map(([regionId]) => regionId);
  if (!regions.length || regions.some(regionId => state.economicOutputByRegion[regionId] === undefined)) return undefined;
  return regions.reduce((total, regionId) => total + state.economicOutputByRegion[regionId]!, 0);
}

/** Current person stock under sovereignty; unknown or empty coverage is unavailable. */
export function simulatedPopulationByCountry(state: SimulationState, countryId: string) {
  return currentCountryTotal(state, countryId, id => state.socioeconomy.regions[id]?.population);
}

/** Current booked output in USD/month, not the saved annual GDP reference. */
export function simulatedMonthlyOutputByCountry(state: SimulationState, countryId: string) {
  return currentCountryTotal(state, countryId, id => state.socioeconomy.regions[id]?.economy?.output);
}

function currentCountryTotal(state: SimulationState, countryId: string, value: (regionId: string) => number | undefined): number | undefined {
  const ids = Object.keys(state.regionOwnership).filter(id => state.regionOwnership[id] === countryId).sort();
  if (!ids.length) return undefined;
  let total = 0;
  for (const id of ids) {
    const amount = value(id);
    if (amount === undefined) return undefined;
    if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(total + amount)) throw new Error('Invalid simulated Country aggregate.');
    total += amount;
  }
  return total;
}
