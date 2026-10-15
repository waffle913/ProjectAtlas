/**
 * 0.25.8 — International trade integration.
 *
 * Pure, read-only view that connects the 0.25 production/stocks/needs layers to
 * the single canonical 0.17 trade engine — never a second trade engine. Exports
 * are a destination of the already-counted domestic output envelope, never an
 * additive GDP; the 0.25 production ceiling (capital + inputs, see 0.25.2B and
 * 0.25.3) bounds exportable supply. The trade balance is derived accounting,
 * not a good-economy meter.
 */

import type { SimulationState } from '../../types';
import { countryProductionCeilingUsd } from './production';

/** Sum of a Country's sovereign Regions' realized output — the sole production source. */
export function countryDomesticOutputUsd(state: SimulationState, countryId: string): number {
  let total = 0;
  for (const [regionId, region] of Object.entries(state.socioeconomy.regions)) {
    if (state.regionOwnership[regionId] === countryId) total += region.economy?.output ?? 0;
  }
  return total;
}

export interface CountryTradePosition {
  countryId: string;
  /** Sum of sovereign Regions' realized output (the sole production source). */
  domesticOutputUsd: number;
  /** 0.25 capital+input ceiling; absent = no admitted binding. */
  productionCeilingUsd?: number;
  /** FOB value of this Country's exports (from canonical trade flows). */
  exportValueUsd: number;
  /** Landed value of this Country's imports (from canonical trade flows). */
  importValueUsd: number;
  /** exports - imports (derived accounting, not a good-economy meter). */
  balanceUsd: number;
  note: string;
}

export function countryTradePosition(state: SimulationState, countryId: string): CountryTradePosition {
  const domesticOutputUsd = countryDomesticOutputUsd(state, countryId);
  const productionCeilingUsd = countryProductionCeilingUsd(state, countryId);
  let exportValueUsd = 0;
  let importValueUsd = 0;
  for (const flow of state.trade.flows) {
    if (flow.exporterId === countryId) exportValueUsd += flow.valueUsd;
    if (flow.importerId === countryId) importValueUsd += flow.landedUsd;
  }
  return {
    countryId,
    domesticOutputUsd,
    ...(productionCeilingUsd !== undefined ? { productionCeilingUsd } : {}),
    exportValueUsd,
    importValueUsd,
    balanceUsd: exportValueUsd - importValueUsd,
    note: 'Exports are a destination of the already-counted domestic output envelope (never a second GDP); the 0.25 production ceiling (capital+inputs) bounds exportable supply. Balance is derived accounting, not a good-economy meter.',
  };
}
