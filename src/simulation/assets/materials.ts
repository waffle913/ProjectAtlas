import type { SimulationState } from '../../types';
import { CONSTRUCTION_MATERIAL_CATEGORY } from './model';

/**
 * Total physical materials consumed by a Country's construction projects, across
 * all statuses (consumed materials are physically gone and never returned).
 * Pure and side-effect-free so both the assets runtime and tests can use it.
 */
export const constructionMaterialsConsumed = (state: SimulationState, countryId: string): number => {
  let total = 0;
  for (const project of Object.values(state.assets?.projects ?? {})) {
    if (project.countryId === countryId && project.consumedMaterials !== undefined) {
      total += project.consumedMaterials;
    }
  }
  return total;
};

/**
 * Materials still available to a Country's construction sites, from the trade
 * stock of the construction-material category minus what has already been
 * consumed (0.24.5B reservation-by-consumption: consumed materials are never
 * reusable). An absent stock or absent market is a shortage (zero), never free
 * material.
 */
export const availableConstructionMaterials = (state: SimulationState, countryId: string): number => {
  const stock = state.trade?.countries?.[countryId]?.markets?.[CONSTRUCTION_MATERIAL_CATEGORY]?.stock?.quantity ?? 0;
  return Math.max(0, stock - constructionMaterialsConsumed(state, countryId));
};
