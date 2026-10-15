/**
 * 0.25.4 — Employment, wages and income accounting.
 *
 * Pure, read-only derivation layer over the single canonical socioeconomic
 * engine. It connects the productive activities of 0.25.2 to the existing
 * `employed`/`unemployed`/`householdIncome` stocks/flows without ever adding a
 * second population, employment or income engine:
 *
 * - labour demand is attributed across activities proportionally to their
 *   attributed output (largest remainder, deterministic);
 * - the wage is the household income per employed worker (the income side of the
 *   labour chain; the employer-side labour cost already lives in the fiscal
 *   ledger as `labourCost`);
 * - every aggregate is conserved: `employed + unemployed + reserved === labourForce`
 *   and `sum(activity.wageBillUsd) === householdIncome`.
 *
 * Military and construction reservations share the one labour universe: a
 * reserved worker is never simultaneously an employed civilian worker, and the
 * reservation total is never a second population. Strikes are not modelled here
 * (they belong to unions in a later milestone) and are preserved, not bypassed.
 */

import type { SimulationState } from '../../types';
import { allocate, ratio } from '../socioeconomy/model';
import { decomposeRegionalProduction, type ProductiveActivity } from './production';

export interface ActivityLabourAccount {
  activityId: string;
  regionId: string;
  /** Civilian workers attributed to this activity (part of the canonical `employed`). */
  employedPersons: number;
  /** Household income per employed worker, USD/worker/month (income side). */
  wageUsdPerWorkerPerMonth: number;
  /** Wage bill attributed to this activity, USD/month (part of `householdIncome`). */
  wageBillUsd: number;
  /** Output attributed to this activity, USD/month. */
  outputUsd: number;
}

export interface LabourConservation {
  labourForce: number;
  employed: number;
  unemployed: number;
  /** military + construction reservations sharing the same labour universe. */
  reserved: number;
  /** true when employed + unemployed + reserved === labourForce. */
  conserved: boolean;
}

export const labourReservations = (militaryReserved: number, constructionReserved: number): number =>
  militaryReserved + constructionReserved;

/**
 * Attribute the Region's canonical employment and household income across its
 * productive activities. Returns the per-activity labour accounts plus the
 * labour-conservation record. `activities` defaults to `decomposeRegionalProduction`
 * (the 0.25.2 attribution). Pure: never mutates state.
 */
export function decomposeLabour(
  state: SimulationState,
  regionId: string,
  militaryReserved: number,
  constructionReserved: number,
  activities?: readonly ProductiveActivity[],
): { accounts: ActivityLabourAccount[]; conservation: LabourConservation } {
  const economy = state.socioeconomy.regions[regionId]?.economy;
  const reserved = labourReservations(militaryReserved, constructionReserved);
  if (!economy) {
    return { accounts: [], conservation: { labourForce: 0, employed: 0, unemployed: 0, reserved, conserved: false } };
  }
  const acts = activities ?? decomposeRegionalProduction(state, regionId, reserved);
  const { employed, householdIncome, labourForce, unemployed } = economy;
  const wageRate = employed > 0 ? ratio(householdIncome, 1, employed) : 0;
  const totalOutput = acts.reduce((sum, activity) => sum + activity.outputUsd, 0);
  const employedPerActivity = totalOutput > 0
    ? allocate(employed, acts.map(activity => activity.outputUsd))
    : acts.map((_activity, index) => index === 0 ? employed : 0);
  // Largest-remainder wage bill: sum(wageBillUsd) === householdIncome exactly, so the
  // multi-activity decomposition never fabricates or loses income through rounding.
  const wageBillByActivity = employed > 0 ? allocate(householdIncome, employedPerActivity) : acts.map(() => 0);
  const accounts = acts.map((activity, index) => {
    const employedPersons = employedPerActivity[index];
    const wageBillUsd = wageBillByActivity[index];
    return {
      activityId: activity.activityId,
      regionId,
      employedPersons,
      wageUsdPerWorkerPerMonth: wageRate,
      wageBillUsd,
      outputUsd: activity.outputUsd,
    };
  });
  return {
    accounts,
    conservation: { labourForce, employed, unemployed, reserved, conserved: employed + unemployed + reserved === labourForce },
  };
}
