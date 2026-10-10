import type { SimulationState } from '../../types';
import { CONSTRUCTION_MATERIAL_CATEGORY } from './model';

/**
 * Materials currently available to a Country's construction sites: the canonical
 * Trade stock quantity of the construction-material category. Construction
 * consumes by decrementing this stock directly (no parallel materials truth).
 * An absent stock or market is a shortage (zero), never free material.
 */
export const availableConstructionMaterials = (state: SimulationState, countryId: string): number =>
  state.trade?.countries?.[countryId]?.markets?.[CONSTRUCTION_MATERIAL_CATEGORY]?.stock?.quantity ?? 0;

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
