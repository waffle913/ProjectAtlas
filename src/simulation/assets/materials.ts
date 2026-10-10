import type { SimulationState } from '../../types';
import { CONSTRUCTION_DAYS_PER_MONTH, CONSTRUCTION_MATERIAL_CATEGORY, CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY } from './model';

/**
 * Materials currently available to a Country's construction sites: the canonical
 * Trade stock quantity of the construction-material category. Construction
 * consumes by decrementing this stock directly (no parallel materials truth).
 * An absent stock or market is a shortage (zero), never free material.
 */
export const availableConstructionMaterials = (state: SimulationState, countryId: string): number =>
  state.trade?.countries?.[countryId]?.markets?.[CONSTRUCTION_MATERIAL_CATEGORY]?.stock?.quantity ?? 0;

/**
 * 0.24.5D — modelled monthly construction-material requirement of a Country: the
 *  reserved workers of its active, funded projects × daily material rate × modelled
 *  month. This is the causal demand the Trade engine imports to satisfy, so an active
 *  project feeds import need without a parallel material system.
 */
export const constructionMaterialDemandPerMonth = (state: SimulationState, countryId: string): number => {
  let workers = 0;
  for (const project of Object.values(state.assets?.projects ?? {})) {
    if (project.countryId !== countryId || project.status !== 'active' || project.reservedWorkers === undefined || project.committedUsd === undefined) continue;
    workers += project.reservedWorkers;
  }
  return workers * CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY * CONSTRUCTION_DAYS_PER_MONTH;
};

/** Consume construction materials from the canonical Trade stock (quantity down, consumed up). */
export const consumeConstructionMaterials = (state: SimulationState, countryId: string, quantity: number): SimulationState => {
  const market = state.trade?.countries?.[countryId]?.markets?.[CONSTRUCTION_MATERIAL_CATEGORY];
  if (!market?.stock || quantity <= 0) return state;
  return {
    ...state,
    trade: { ...state.trade, countries: { ...state.trade.countries, [countryId]: {
      ...state.trade.countries[countryId],
      markets: { ...state.trade.countries[countryId].markets, [CONSTRUCTION_MATERIAL_CATEGORY]: {
        ...market,
        stock: { ...market.stock, quantity: market.stock.quantity - quantity, consumed: market.stock.consumed + quantity },
      } },
    } } },
  };
};
