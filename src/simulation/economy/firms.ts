/**
 * 0.25.6 — Aggregate firms, activity and investment accounting.
 *
 * Pure, read-only derivation over the single canonical socioeconomic + fiscal
 * engine. Firms are represented as one aggregate per Region, never as millions
 * of individual firms. The aggregate firm account reuses the fiscal firm-side
 * ledgers already booked (labour cost, taxable business surplus, retained
 * surplus) and the canonical `output` as revenue.
 *
 * Investment is never free: the affordable investment is bounded by the retained
 * business surplus, and it consumes real resources — labour at the 0.24
 * construction daily cost and construction materials — reusing the 0.24
 * construction/asset path. Competition, concentration and monopolies are
 * deliberately deferred until their design is explicitly framed.
 */

import type { SimulationState } from '../../types';
import {
  CONSTRUCTION_DAILY_COST_PER_WORKER_USD,
  CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY,
  CONSTRUCTION_MATERIAL_CATEGORY,
} from '../assets/model';

export interface AggregateFirmAccount {
  regionId: string;
  /** Aggregate firm revenue = the Region's realized output. */
  revenueUsd: number;
  /** Employer-side labour cost (fiscal `labourCost`, or household income before fiscal). */
  labourCostUsd: number;
  /** Modelled taxable surplus base (fiscal `businessSurplus`). */
  businessSurplusUsd: number;
  /** Surplus retained after corporate tax (fiscal `retainedBusinessSurplus`). */
  retainedSurplusUsd: number;
  /** Explicitly aggregate — not millions of individual firms. */
  firmRepresentation: 'aggregate';
}

export function aggregateFirmAccount(state: SimulationState, regionId: string): AggregateFirmAccount | undefined {
  const economy = state.socioeconomy.regions[regionId]?.economy;
  if (!economy) return undefined;
  const fiscal = state.fiscal.regions[regionId];
  const labourCostUsd = fiscal?.labourCost ?? economy.householdIncome;
  const businessSurplusUsd = fiscal?.businessSurplus ?? Math.max(0, economy.output - labourCostUsd);
  const retainedSurplusUsd = fiscal?.retainedBusinessSurplus ?? businessSurplusUsd;
  return {
    regionId,
    revenueUsd: economy.output,
    labourCostUsd,
    businessSurplusUsd,
    retainedSurplusUsd,
    firmRepresentation: 'aggregate',
  };
}

export interface InvestmentPlan {
  regionId: string;
  retainedSurplusUsd: number;
  /** Investment funded from retained surplus — never negative, never free money. */
  affordableInvestmentUsd: number;
  /** Modelled labour requirement at the 0.24 construction daily cost. */
  workerDaysRequired: number;
  /** Modelled construction-material requirement (0.24 construction path). */
  constructionMaterialUnitsRequired: number;
  materialCategory: typeof CONSTRUCTION_MATERIAL_CATEGORY;
  note: string;
}

export function investmentPlan(state: SimulationState, regionId: string): InvestmentPlan | undefined {
  const account = aggregateFirmAccount(state, regionId);
  if (!account) return undefined;
  const affordable = account.retainedSurplusUsd;
  const workerDaysRequired = affordable > 0 ? Math.max(1, Math.ceil(affordable / CONSTRUCTION_DAILY_COST_PER_WORKER_USD)) : 0;
  const constructionMaterialUnitsRequired = workerDaysRequired * CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY;
  return {
    regionId,
    retainedSurplusUsd: account.retainedSurplusUsd,
    affordableInvestmentUsd: affordable,
    workerDaysRequired,
    constructionMaterialUnitsRequired,
    materialCategory: CONSTRUCTION_MATERIAL_CATEGORY,
    note: 'Aggregate investment is funded from retained business surplus and consumes real labour (at the 0.24 construction daily cost) and construction materials — never free, and it uses the 0.24 construction/asset path. Competition/concentration/monopolies are deferred until explicitly framed.',
  };
}
