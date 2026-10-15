/**
 * 0.26.6 — Finance V1: default and solvency semantics (pure derivation).
 *
 * Deterministic solvency assessment over the canonical fiscal surfaces, in the
 * same style as 0.26.1/0.26.3/0.26.4: no new canonical state, no scheduler
 * task, no RNG, no migration. The canonical owners remain the fiscal
 * `FiscalCountry` (debt, debtLimit) and `account` (interestDue, interestArrears,
 * arrears, totalRevenue, cash).
 *
 * Contract:
 * - default is never magical: it is derived only from real material inability —
 *   unpaid interest (interest arrears), breached debt limit, unpaid commitments
 *   or an unsustainable interest burden — never from a random event or a flat
 *   modifier;
 * - `unavailable != 0`: when revenue or output is absent, the corresponding
 *   ratio is `null`, never a fabricated zero;
 * - a sovereign default blocks new credit (usable borrowing ceiling = 0);
 *   a stressed State keeps only the remaining headroom under its debt limit.
 */

import { integer, ratio } from '../socioeconomy/model';
import { isWholeUsd } from './settlement';
import { maturedOutstanding, type DebtSchedule } from './debt';

export const SOLVENCY_STATES = Object.freeze(['solvent', 'stressed', 'in_default'] as const);
export type SolvencyState = typeof SOLVENCY_STATES[number];

export interface SolvencyIndicators {
  readonly debtStock: number;      // canonical debt
  readonly debtLimit: number;      // canonical debt ceiling
  readonly interestDue: number;    // monthly interest obligation
  readonly interestArrears: number; // unpaid interest (stock)
  readonly arrears: number;        // unpaid commitments (stock)
  readonly totalRevenue: number;   // monthly revenue
  readonly availableCash: number;  // uncommitted cash
  readonly annualOutput: number;   // annual output anchor (debt-to-output)
}

export interface SolvencyAssessment {
  readonly state: SolvencyState;
  /** interestDue / revenue in bps; null when revenue is absent (unavailable != 0). */
  readonly interestCoverageBps: number | null;
  /** debt / annual output in bps; null when output is absent. */
  readonly debtToOutputBps: number | null;
  readonly unpaidInterest: number;
  readonly unpaidCommitments: number;
  readonly reason: 'interest_arrears' | 'debt_limit_exceeded' | 'commitment_arrears' | 'interest_burden' | null;
}

export function validateSolvencyIndicators(i: SolvencyIndicators): void {
  const values = [i.debtStock, i.debtLimit, i.interestDue, i.interestArrears, i.arrears, i.totalRevenue, i.availableCash, i.annualOutput];
  for (const value of values) {
    if (!isWholeUsd(value)) throw new Error('Solvency indicators must be non-negative whole-USD safe integers.');
  }
}

export function assessSolvency(i: SolvencyIndicators): SolvencyAssessment {
  validateSolvencyIndicators(i);
  const interestCoverageBps = i.totalRevenue > 0 ? Math.min(10000, ratio(i.interestDue, 10000, i.totalRevenue)) : null;
  const debtToOutputBps = i.annualOutput > 0 ? ratio(i.debtStock, 10000, i.annualOutput) : null;

  let state: SolvencyState = 'solvent';
  let reason: SolvencyAssessment['reason'] = null;
  if (i.interestArrears > 0) {
    state = 'in_default'; reason = 'interest_arrears';
  } else if (i.debtStock > i.debtLimit) {
    state = 'stressed'; reason = 'debt_limit_exceeded';
  } else if (i.arrears > 0) {
    state = 'stressed'; reason = 'commitment_arrears';
  } else if (interestCoverageBps !== null && interestCoverageBps >= 5000) {
    state = 'stressed'; reason = 'interest_burden';
  }

  return { state, interestCoverageBps, debtToOutputBps, unpaidInterest: i.interestArrears, unpaidCommitments: i.arrears, reason };
}

export interface CreditCeiling {
  /** New borrowing available now (whole USD). */
  readonly usable: number;
  /** True when a sovereign default blocks new credit entirely. */
  readonly blocked: boolean;
}

/** Causal credit consequence: a default blocks new borrowing; otherwise only the debt-limit headroom remains. */
export function creditCeiling(i: SolvencyIndicators, a: SolvencyAssessment): CreditCeiling {
  validateSolvencyIndicators(i);
  if (a.state === 'in_default') return { usable: 0, blocked: true };
  return { usable: Math.max(0, i.debtLimit - i.debtStock), blocked: false };
}

/** Concrete default losses: principal of obligations matured but not repaid by `date`. */
export function defaultedPrincipal(schedule: DebtSchedule, date: string): number {
  return maturedOutstanding(schedule, date).reduce((sum, o) => integer(sum + o.outstanding), 0);
}
