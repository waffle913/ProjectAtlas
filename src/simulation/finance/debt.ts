/**
 * 0.26.4 — Finance V1: loans, bonds and debt schedules.
 *
 * Pure, deterministic debt-schedule semantics that reconcile to the canonical
 * public-debt stock (docs/finance-0.26.md). Like 0.26.1/0.26.3 it introduces NO
 * new canonical state, no scheduler task, no RNG and no migration: the debt
 * stock's canonical owner remains `state.fiscal.countries[countryId].debt`, and
 * a `DebtSchedule` is an admitted/reconciled view over it.
 *
 * Contract:
 * - a debt obligation is a dated liability (id, principal, annual rate in bps,
 *   issue date, maturity date, outstanding principal). Its outstanding is a
 *   whole-USD amount within [0, principal];
 * - monthly interest is `ratio(outstanding, rateBps, 120000)` per obligation —
 *   the same formula the fiscal engine uses (`interestRateBps` on `FiscalCountry`),
 *   so a schedule and the fiscal ledger stay consistent;
 * - no money without a matching liability: `reconcileSchedule` requires
 *   `sum(outstanding) === debtStock`; a schedule that does not reconcile is
 *   rejected, never silently accepted;
 * - amortization is deterministic (earliest maturity first, then id) and
 *   conserves principal exactly;
 * - obligation-level schedules require admitted (sourced) or explicitly
 *   synthetic obligation data. This module never fabricates real issue/maturity
 *   dates, coupons or creditors for 2026-01-01.
 */

import { integer, ratio } from '../socioeconomy/model';
import { isSimulationDate } from '../date';
import { isWholeUsd } from './settlement';
import type { LoanId } from './contract';

export interface DebtObligation {
  /** Permanent opaque identifier of the loan/bond. */
  readonly id: LoanId;
  /** Original principal, a positive whole-USD safe integer. */
  readonly principal: number;
  /** Annual interest rate in basis points (10,000 bps = 100%), non-negative integer. */
  readonly rateBps: number;
  readonly issuedDate: string;
  readonly maturityDate: string;
  /** Remaining principal, a whole-USD safe integer in [0, principal]. */
  readonly outstanding: number;
}

export interface DebtSchedule {
  /** As-of simulation date. */
  readonly date: string;
  readonly obligations: readonly DebtObligation[];
}

export function validateDebtObligation(o: DebtObligation): void {
  if (!o || typeof o.id !== 'string' || !o.id.trim()) throw new Error('Debt obligation needs a non-empty id.');
  if (!isWholeUsd(o.principal) || o.principal <= 0) throw new Error('Obligation principal must be a positive whole-USD safe integer.');
  if (!Number.isInteger(o.rateBps) || o.rateBps < 0) throw new Error('Obligation rate must be a non-negative integer basis-point rate.');
  if (!isWholeUsd(o.outstanding) || o.outstanding > o.principal) throw new Error('Outstanding principal must be a whole-USD amount within [0, principal].');
  if (!isSimulationDate(o.issuedDate) || !isSimulationDate(o.maturityDate)) throw new Error('Obligation dates must be valid simulation dates.');
  if (o.maturityDate < o.issuedDate) throw new Error('Maturity date cannot precede the issue date.');
}

export function validateDebtSchedule(schedule: DebtSchedule): void {
  if (!schedule || !isSimulationDate(schedule.date)) throw new Error('Debt schedule needs a valid as-of date.');
  const ids = new Set<string>();
  for (const o of schedule.obligations) {
    validateDebtObligation(o);
    if (ids.has(o.id)) throw new Error(`Duplicate obligation id: ${o.id}.`);
    ids.add(o.id);
  }
}

/** Total outstanding principal (whole USD). */
export function schedulePrincipalOutstanding(schedule: DebtSchedule): number {
  validateDebtSchedule(schedule);
  return schedule.obligations.reduce((sum, o) => integer(sum + o.outstanding), 0);
}

/** Monthly interest across all outstanding obligations (matches the fiscal `ratio(debt, rateBps, 120000)` formula). */
export function scheduleInterestDue(schedule: DebtSchedule): number {
  validateDebtSchedule(schedule);
  return schedule.obligations.reduce((sum, o) => integer(sum + ratio(o.outstanding, o.rateBps, 120000)), 0);
}

/** Total principal of obligations whose maturity is on or before `date`. */
export function scheduleMaturitiesDue(schedule: DebtSchedule, date: string): number {
  if (!isSimulationDate(date)) throw new Error('Maturity query needs a valid simulation date.');
  validateDebtSchedule(schedule);
  return schedule.obligations
    .filter((o) => o.maturityDate <= date)
    .reduce((sum, o) => integer(sum + o.outstanding), 0);
}

/** Obligations already matured but not fully repaid (the 0.26.6 default surface). */
export function maturedOutstanding(schedule: DebtSchedule, date: string): DebtObligation[] {
  if (!isSimulationDate(date)) throw new Error('Maturity query needs a valid simulation date.');
  validateDebtSchedule(schedule);
  return schedule.obligations
    .filter((o) => o.maturityDate <= date && o.outstanding > 0)
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate) || a.id.localeCompare(b.id));
}

/** Require the schedule to reconcile exactly with the canonical debt stock (no money without a matching liability). */
export function reconcileSchedule(schedule: DebtSchedule, debtStock: number): void {
  validateDebtSchedule(schedule);
  integer(debtStock);
  const outstanding = schedulePrincipalOutstanding(schedule);
  if (outstanding !== debtStock) {
    throw new Error(`Debt schedule outstanding ${outstanding} does not reconcile with the canonical debt stock ${debtStock}.`);
  }
}

export interface AmortizationResult {
  readonly schedule: DebtSchedule;
  readonly paidUsd: number;
  readonly remainingPaymentUsd: number;
}

/** Deterministic principal amortization: earliest maturity first, then id. Conserves principal exactly. */
export function amortizePrincipal(schedule: DebtSchedule, paymentUsd: number): AmortizationResult {
  if (!isWholeUsd(paymentUsd)) throw new Error('Principal payment must be a non-negative whole-USD safe integer.');
  validateDebtSchedule(schedule);
  const ordered = [...schedule.obligations].sort((a, b) => a.maturityDate.localeCompare(b.maturityDate) || a.id.localeCompare(b.id));
  let remaining = paymentUsd;
  const obligations = ordered.map((o) => {
    if (remaining <= 0 || o.outstanding === 0) return o;
    const applied = Math.min(o.outstanding, remaining);
    remaining = integer(remaining - applied);
    return { ...o, outstanding: integer(o.outstanding - applied) };
  });
  return { schedule: { date: schedule.date, obligations }, paidUsd: paymentUsd - remaining, remainingPaymentUsd: remaining };
}
