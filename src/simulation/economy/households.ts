/**
 * 0.25.5 — Household needs and spending accounting.
 *
 * Pure, read-only derivation over the single canonical socioeconomic + fiscal
 * engine. Aggregate household demand is driven by disposable income (the fiscal
 * `HouseholdFlow.disposable`, or the socioeconomic `incomeByGroup` before fiscal
 * initialization) through the existing consumption propensities, then split into
 * essential and discretionary demand through the existing modelled essential
 * shares. Realized consumption stays the canonical `Economy.consumptionByGroup`;
 * this layer only exposes the needs/shortage view of it.
 *
 * Shortages are material, never an arbitrary penalty: an unmet essential demand
 * is reported as `essentialShortfallUsd` and the existing `basicNeedsCoverageBps`
 * indicator, and any consequence flows through the existing crisis mechanisms.
 * The essential/discretionary shares are central model priors (`MODEL`), not
 * empirical poverty thresholds — they stay labelled `modelled`.
 */

import type { SimulationState } from '../../types';
import { MODEL, ratio } from '../socioeconomy/model';

export interface HouseholdSpendingAccount {
  regionId: string;
  /** Demand side: disposable income -> propensity-weighted demand -> essential/discretionary split. */
  disposableByGroup: number[];
  demandByGroup: number[];
  essentialDemandByGroup: number[];
  discretionaryDemandByGroup: number[];
  demandTotal: number;
  essentialDemandTotal: number;
  discretionaryDemandTotal: number;
  /** Realized side (canonical `Economy`). */
  consumptionByGroup: number[];
  consumptionTotal: number;
  essentialConsumptionTotal: number;
  /** Needs coverage and material shortage (never an arbitrary penalty). */
  needsCoverageBps: number;
  essentialShortfallUsd: number;
  shortageUsd: number;
}

/** Essential consumption per group mirrors the engine's `evolve` rule:
 *  min(initial essential reference, realized consumption x essential share). */
const essentialConsumptionByGroup = (economy: { consumptionByGroup: number[]; essentialReferenceByGroup: number[] }): number[] =>
  economy.consumptionByGroup.map((consumption, i) => Math.min(economy.essentialReferenceByGroup[i], ratio(consumption, MODEL.essentialBps[i], 10000)));

export function householdSpending(state: SimulationState, regionId: string): HouseholdSpendingAccount | undefined {
  const economy = state.socioeconomy.regions[regionId]?.economy;
  if (!economy) return undefined;
  const disposable = state.fiscal.regions[regionId]?.disposable ?? economy.incomeByGroup;
  const demandByGroup = disposable.map((value, i) => ratio(value, MODEL.consumptionBps[i], 10000));
  const essentialDemandByGroup = demandByGroup.map((value, i) => ratio(value, MODEL.essentialBps[i], 10000));
  const discretionaryDemandByGroup = demandByGroup.map((value, i) => value - essentialDemandByGroup[i]);
  const essentialConsumption = essentialConsumptionByGroup(economy);
  const essentialConsumptionTotal = essentialConsumption.reduce((a, b) => a + b, 0);
  const essentialReferenceTotal = economy.essentialReferenceByGroup.reduce((a, b) => a + b, 0);
  // Unmet essential need is measured against the initial calibrated essential
  // reference (income-independent): a production shortage lowers realized
  // essential consumption below that baseline, never below a collapsing demand.
  const essentialShortfallUsd = Math.max(0, essentialReferenceTotal - essentialConsumptionTotal);
  return {
    regionId,
    disposableByGroup: disposable,
    demandByGroup,
    essentialDemandByGroup,
    discretionaryDemandByGroup,
    demandTotal: demandByGroup.reduce((a, b) => a + b, 0),
    essentialDemandTotal: essentialDemandByGroup.reduce((a, b) => a + b, 0),
    discretionaryDemandTotal: discretionaryDemandByGroup.reduce((a, b) => a + b, 0),
    consumptionByGroup: economy.consumptionByGroup,
    consumptionTotal: economy.consumption,
    essentialConsumptionTotal,
    needsCoverageBps: economy.basicNeedsCoverageBps,
    essentialShortfallUsd,
    shortageUsd: economy.shortage,
  };
}
