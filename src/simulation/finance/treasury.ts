/**
 * 0.26.7 — Finance V1: public treasury and credit.
 *
 * Pure derivation that ties the existing fiscal financing loop (0.11/0.25.9) to
 * the 0.26.3 settlement primitives, without a second ledger. The canonical
 * owner of every value remains the fiscal `FiscalCountry` / `account`; this
 * module reads those values, expresses debt service as payment orders and
 * asserts conservation — it never writes fiscal state (no double fiscal
 * entries).
 *
 * Conservation identities (mirroring `runFiscalMonth`):
 * - cash flow:   openingCash + totalRevenue + borrowed === totalSpending + repaid + closingCash;
 * - debt stock:  openingDebt  + borrowed      === closingDebt   + repaid.
 *
 * A ledger that violates either identity is rejected, never silently accepted.
 */

import { isWholeUsd, settlePayments, type PaymentOrder, type TreasuryBalance, type SettlementResult } from './settlement';

export interface TreasuryLedger {
  readonly openingCash: number;
  readonly closingCash: number;
  /** Cash already reserved (e.g. committed construction funding) inside closingCash. */
  readonly committed: number;
  readonly openingDebt: number;
  readonly closingDebt: number;
  readonly totalRevenue: number;
  readonly borrowed: number;
  readonly repaid: number;
  readonly totalSpending: number;
  readonly interestPaid: number;
  readonly interestDue: number;
  readonly financingNeed: number;
  readonly debtLimit: number;
  readonly monthlyBorrowingLimit: number;
}

export function validateTreasuryLedger(t: TreasuryLedger): void {
  const values = [
    t.openingCash, t.closingCash, t.committed, t.openingDebt, t.closingDebt, t.totalRevenue,
    t.borrowed, t.repaid, t.totalSpending, t.interestPaid, t.interestDue,
    t.financingNeed, t.debtLimit, t.monthlyBorrowingLimit,
  ];
  for (const value of values) {
    if (!isWholeUsd(value)) throw new Error('Treasury ledger values must be non-negative whole-USD safe integers.');
  }
  if (t.committed > t.closingCash) throw new Error('Committed cash cannot exceed closing cash.');
}

export function treasuryConservation(t: TreasuryLedger): boolean {
  return t.openingCash + t.totalRevenue + t.borrowed === t.totalSpending + t.repaid + t.closingCash;
}

export function treasuryDebtConservation(t: TreasuryLedger): boolean {
  return t.openingDebt + t.borrowed === t.closingDebt + t.repaid;
}

export function assertTreasuryConservation(t: TreasuryLedger): void {
  validateTreasuryLedger(t);
  if (!treasuryConservation(t)) throw new Error('Treasury cash flow does not conserve (openingCash + revenue + borrowed !== spending + repaid + closingCash).');
  if (!treasuryDebtConservation(t)) throw new Error('Treasury debt stock does not conserve (openingDebt + borrowed !== closingDebt + repaid).');
}

/** Express the booked debt service as payment orders (interest first, then principal). */
export function debtServiceOrders(t: TreasuryLedger, date: string): PaymentOrder[] {
  const orders: PaymentOrder[] = [];
  if (t.interestPaid > 0) orders.push({ id: `interest-${date}`, payer: 'treasury', payee: 'creditors', amount: t.interestPaid, date, purpose: 'debt_service' });
  if (t.repaid > 0) orders.push({ id: `principal-${date}`, payer: 'treasury', payee: 'creditors', amount: t.repaid, date, purpose: 'debt_service' });
  return orders;
}

/** Causal borrowing capacity: the monthly limit bounded by the remaining debt-limit headroom. */
export function borrowingCapacity(t: TreasuryLedger): number {
  return Math.min(t.monthlyBorrowingLimit, Math.max(0, t.debtLimit - t.closingDebt));
}

/** Settle the treasury's debt service against its UNCOMMITTED closing cash (links 0.26.3 to the treasury). */
export function settleDebtService(t: TreasuryLedger, date: string): SettlementResult {
  validateTreasuryLedger(t);
  const available = t.closingCash - t.committed;
  const balance: TreasuryBalance = { available, cash: t.closingCash, committed: t.committed };
  return settlePayments(balance, debtServiceOrders(t, date));
}
