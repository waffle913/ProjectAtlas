/**
 * 0.25.2A — Productive activity vocabulary and factor grounding.
 *
 * Pure vocabulary and derivation. Like 0.24.1A and 0.25.1, this module is NOT
 * integrated into `SimulationState`, the save schema, migrations, the scheduler,
 * the RNG or any other engine system. It expresses the existing regional
 * production as grounded in its factors — labour, capital (0.24 assets), inputs
 * (trade stocks) and productivity — without ever adding to or duplicating the
 * canonical aggregate output.
 *
 * Contractual rules (docs/economy-0.25.md):
 *
 * - The single production source stays `state.socioeconomy.regions[regionId].economy`.
 *   Activities are a decomposition/attribution of that source, never a second GDP.
 * - `sum(activity.outputUsd) === economy.output` and the asset-backed activities
 *   never add output on top of the baseline: capital/inputs can only attribute or
 *   constrain, never create new material output from nowhere.
 * - An asset contributes usable capital only when its physical capacity is
 *   actually available (`assetAvailability !== 'unavailable'`) and its amount is
 *   known. An asset whose capacity is `unavailable` is never a zero-but-binding
 *   constraint, and a Region with no assets is `not_applicable` (no capital
 *   constraint), not zero.
 * - The asset-type -> USD-capacity mapping (`ASSET_TYPE_CAPACITY_REGISTRY`) starts
 *   EMPTY: no real asset-type data is admitted for 2026-01-01, so an asset-backed
 *   activity currently attributes zero USD output and records its physical
 *   capacity honestly instead of inventing a productivity.
 */

import type { SimulationState } from '../../types';
import type { AssetRecord, AssetCoverageStatus } from '../assets/model';
import { assetAvailability } from '../assets/model';
import type { TradeCategory } from '../trade/model';
import type { ActivityId, SectorId } from './model';

// ---------------------------------------------------------------------------
// Production factors.
// ---------------------------------------------------------------------------

export interface LabourFactor {
  unit: 'PERSONS';
  labourForce: number;
  employed: number;
  /** military + construction reservations reconciled against the same labour force. */
  reserved: number;
  unemployed: number;
}

export interface CapitalFactor {
  /** Physical capacity unit of the contributing assets ('n/a' when not_applicable). */
  unit: string;
  /** Usable physical capacity when a single consistent unit exists; absent when
   *  units are mixed or every asset capacity is unavailable (never a zero-as-unknown). */
  amount?: number;
  coverage: AssetCoverageStatus;
  /** Assets in the Region backing this factor (identity only, never a second territorial truth). */
  assetIds: string[];
  note: string;
}

export interface InputFactor {
  category: TradeCategory;
  unit: string;
  /** Admitted input requirement per unit of output; absent = not_admitted (0.25.3 scope). */
  requiredPerOutput?: number;
  /** Available stock quantity; null = unavailable (never a zero-as-unknown). */
  available: number | null;
  coverage: 'admitted' | 'not_admitted' | 'unavailable';
}

export interface ProductivityFactor {
  unit: 'USD_PER_WORKER_PER_MONTH';
  outputUsd: number;
  workers: number;
}

export interface ProductiveFactors {
  labour: LabourFactor;
  capital: CapitalFactor;
  inputs: InputFactor[];
  productivity: ProductivityFactor;
}

// ---------------------------------------------------------------------------
// Productive activity.
// ---------------------------------------------------------------------------

export interface ProductiveActivity {
  /** Deterministic diagnostic id (derived, not canonical saved identity). */
  activityId: ActivityId;
  regionId: string;
  /** Sector binding; absent until the 0.25.2 registry maps assets to sectors. */
  sectorId?: SectorId;
  coverage: 'modelled' | 'asset_backed';
  factors: ProductiveFactors;
  /** USD/month production capacity attributable to this activity. */
  capacityUsd: number;
  /** USD/month output attributed to this activity (part of the canonical economy.output). */
  outputUsd: number;
}

/**
 * Asset-type -> capacity mapping. EMPTY by design: there is no admitted real
 * asset-type data for 2026-01-01, and no synthetic mapping is invented here.
 * Later sub-milestones (or an explicit synthetic scenario) may admit entries.
 */
export const ASSET_TYPE_CAPACITY_REGISTRY: Readonly<Record<string, {
  sectorId: SectorId;
  capacityUsdPerUnit: number;
  unit: string;
  note: string;
}>> = Object.freeze({});

// ---------------------------------------------------------------------------
// Factor derivation (pure, read-only).
// ---------------------------------------------------------------------------

export const regionalLabourFactor = (state: SimulationState, regionId: string, reserved: number): LabourFactor | undefined => {
  const economy = state.socioeconomy.regions[regionId]?.economy;
  if (!economy) return undefined;
  return {
    unit: 'PERSONS',
    labourForce: economy.labourForce,
    employed: economy.employed,
    reserved,
    unemployed: economy.unemployed,
  };
};

export const regionalProductivityFactor = (state: SimulationState, regionId: string): ProductivityFactor | undefined => {
  const economy = state.socioeconomy.regions[regionId]?.economy;
  if (!economy) return undefined;
  return { unit: 'USD_PER_WORKER_PER_MONTH', outputUsd: economy.productivity.outputUsd, workers: economy.productivity.workers };
};

const usableCapacity = (asset: AssetRecord): number | undefined => {
  const amount = asset.capacity.amount;
  if (amount === undefined) return undefined;
  return assetAvailability(asset.operatingStatus, asset.physicalCondition) !== 'unavailable' ? amount : undefined;
};

/** Capital factor for a Region: usable physical capacity of the assets sited there.
 *  `not_applicable` means the Region has no assets (no capital constraint), never
 *  that its baseline production is zero. Mixed physical units are not summed. */
export const regionalCapitalFactor = (state: SimulationState, regionId: string): CapitalFactor => {
  const assets = Object.values(state.assets.assets).filter(asset => asset.regionId === regionId);
  if (assets.length === 0) {
    return { unit: 'n/a', coverage: 'not_applicable', assetIds: [], note: 'No physical assets in this Region; capital is not a binding factor (baseline modelled capacity applies).' };
  }
  const contributing = assets.filter(asset => usableCapacity(asset) !== undefined);
  const units = [...new Set(contributing.map(asset => asset.capacity.unit))];
  const amount = units.length === 1 ? contributing.reduce((sum, asset) => sum + (usableCapacity(asset) ?? 0), 0) : undefined;
  const coverage: AssetCoverageStatus = contributing.length === assets.length && assets.every(asset => asset.capacity.coverage === assets[0].capacity.coverage)
    ? assets[0].capacity.coverage
    : 'partial';
  return {
    unit: units.length === 1 ? units[0] : 'mixed',
    ...(amount !== undefined ? { amount } : {}),
    coverage,
    assetIds: assets.map(asset => asset.assetId).sort(),
    note: units.length > 1 ? 'Mixed physical capacity units are not aggregated; a compatible unit mapping must be admitted first.' : (contributing.length < assets.length ? 'Some assets are currently unavailable (out_of_service/degraded) and contribute no usable capacity.' : 'Usable physical capacity of available assets.'),
  };
};

/** Input factors: no admitted input requirements exist in 0.25.2 (0.25.3 stocks). */
export const regionalInputFactors = (_state: SimulationState, _regionId: string): InputFactor[] => [];

// ---------------------------------------------------------------------------
// Activity decomposition (conservation-tested).
// ---------------------------------------------------------------------------

export const baselineActivityId = (regionId: string): ActivityId => `activity.baseline.${regionId}`;
export const assetActivityId = (regionId: string, assetId: string): ActivityId => `activity.asset.${regionId}.${assetId}`;

/**
 * Decompose a Region's existing production into a modelled baseline activity plus
 * one asset-backed activity per sited asset. The baseline carries the full
 * canonical `productionCapacity`/`output`; asset-backed activities attribute zero
 * USD until `ASSET_TYPE_CAPACITY_REGISTRY` admits a real (or explicitly synthetic)
 * mapping — so the aggregate is conserved exactly and no output is fabricated.
 */
export function decomposeRegionalProduction(state: SimulationState, regionId: string, reserved = 0): ProductiveActivity[] {
  const region = state.socioeconomy.regions[regionId];
  const economy = region?.economy;
  if (!economy) return [];
  const labour = regionalLabourFactor(state, regionId, reserved);
  const productivity = regionalProductivityFactor(state, regionId);
  const capital = regionalCapitalFactor(state, regionId);
  const inputs = regionalInputFactors(state, regionId);
  if (!labour || !productivity) return [];

  const baseFactors: ProductiveFactors = { labour, capital, inputs, productivity };
  const activities: ProductiveActivity[] = [{
    activityId: baselineActivityId(regionId),
    regionId,
    coverage: 'modelled',
    factors: baseFactors,
    capacityUsd: economy.productionCapacity,
    outputUsd: economy.output,
  }];

  for (const asset of Object.values(state.assets.assets)) {
    if (asset.regionId !== regionId) continue;
    const usable = usableCapacity(asset);
    const mapped = ASSET_TYPE_CAPACITY_REGISTRY[asset.assetTypeId];
    activities.push({
      activityId: assetActivityId(regionId, asset.assetId),
      regionId,
      ...(mapped ? { sectorId: mapped.sectorId } : {}),
      coverage: 'asset_backed',
      factors: {
        labour,
        capital: {
          unit: asset.capacity.unit,
          ...(usable !== undefined ? { amount: usable } : {}),
          coverage: asset.capacity.coverage,
          assetIds: [asset.assetId],
          note: usable === undefined ? 'Asset capacity currently unavailable (never a zero-baseline).' : 'Physical capital backing for this activity.',
        },
        inputs,
        productivity,
      },
      // USD attribution is 0 until a capacity mapping is admitted; the physical
      // capacity above is the honest representation (no fabricated productivity).
      capacityUsd: 0,
      outputUsd: 0,
    });
  }

  return activities;
}

/** Conservation: the baseline activity carries the aggregate exactly. */
export const totalAttributedOutput = (activities: readonly ProductiveActivity[]): number =>
  activities.reduce((sum, activity) => sum + activity.outputUsd, 0);
