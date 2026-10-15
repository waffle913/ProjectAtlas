/**
 * 0.25.7 — Domestic prices and markets.
 *
 * Pure, read-only derivation over the single canonical socioeconomic engine.
 * A domestic price is derived causally from the Region's supply (realized
 * output), demand, and the resulting shortage/surplus, with a bounded monthly
 * step so it can never oscillate absurdly — mirroring the 0.17 trade price
 * bound (5% per month). Unit labour cost is exposed as a modelled cost
 * indicator, kept distinct from the price index.
 *
 * Price status is always `modelled` here: no observed/derived domestic price
 * data is admitted for 2026-01-01, and a modelled price is never presented as
 * an observation (the `PriceStatus` vocabulary keeps observed/derived/modelled/
 * unavailable distinct). A shortage only moves the price; it never adds a magic
 * penalty — consequences pass through existing material/crisis mechanisms.
 */

import type { SimulationState } from '../../types';
import { ratio } from '../socioeconomy/model';
import type { PriceStatus } from './model';

export const PRICE_MODEL = Object.freeze({
  baselineBps: 10000,
  /** Maximum monthly move, mirroring the 0.17 trade price bound (5%). */
  monthlyStepBps: 500,
  floorBps: 5000,
  ceilingBps: 20000,
});

export type PricePressure = 'up' | 'down' | 'none';

/** Bounded price step: at most ±monthlyStepBps, clamped to the floor/ceiling. */
export function adjustDomesticPrice(priorBps: number, pressure: PricePressure): number {
  const step = pressure === 'up' ? PRICE_MODEL.monthlyStepBps : pressure === 'down' ? -PRICE_MODEL.monthlyStepBps : 0;
  return Math.max(PRICE_MODEL.floorBps, Math.min(PRICE_MODEL.ceilingBps, priorBps + step));
}

export interface DomesticMarketPrice {
  regionId: string;
  status: PriceStatus;
  supplyUsd: number;
  demandUsd: number;
  shortageUsd: number;
  surplusUsd: number;
  /** Modelled unit labour cost as basis points of output (cost indicator, not the price). */
  unitLabourCostBps: number;
  pressure: PricePressure;
  /** Modelled domestic price index, basis points (10000 = baseline). */
  priceBps: number;
  note: string;
}

export function domesticMarketPrice(state: SimulationState, regionId: string, priorPriceBps = PRICE_MODEL.baselineBps): DomesticMarketPrice | undefined {
  const economy = state.socioeconomy.regions[regionId]?.economy;
  if (!economy) return undefined;
  const supply = economy.output;
  const demand = economy.demand;
  const shortageUsd = Math.max(0, demand - supply);
  const surplusUsd = Math.max(0, supply - demand);
  const labourCost = state.fiscal.regions[regionId]?.labourCost ?? economy.householdIncome;
  const unitLabourCostBps = supply > 0 ? ratio(labourCost, 10000, supply) : 0;
  const pressure: PricePressure = shortageUsd > 0 ? 'up' : surplusUsd > 0 ? 'down' : 'none';
  return {
    regionId,
    status: 'modelled',
    supplyUsd: supply,
    demandUsd: demand,
    shortageUsd,
    surplusUsd,
    unitLabourCostBps,
    pressure,
    priceBps: adjustDomesticPrice(priorPriceBps, pressure),
    note: 'Modelled domestic price index from supply/demand shortage-surplus with a bounded monthly step (never oscillates absurdly). A shortage only moves the price; it adds no arbitrary penalty. Observed/derived domestic prices remain unavailable for 2026-01-01.',
  };
}
