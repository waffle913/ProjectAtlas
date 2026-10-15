/**
 * 0.26.3 — Finance V1: payments and settlement primitives.
 *
 * Pure, deterministic settlement semantics over the canonical treasury balance
 * (docs/finance-0.26.md). This is a vocabulary/behavior module in the same sense
 * as the 0.25 derivation layer: it introduces NO new canonical state, no
 * scheduler task, no RNG, no migration and no second ledger.
 *
 * Contract (docs/finance-0.26.md "payments and settlement"):
 * - a payment order names a payer, a payee, a whole-USD amount, a date and a
 *   purpose; it is settled atomically or refused, never partially;
 * - fund availability is checked against the payer's `TreasuryBalance.available`
 *   (uncommitted cash only); an order with insufficient funds is refused, not
 *   silently dropped, and no money is created to cover it;
 * - no double spending: an order id settles at most once (duplicate ids are
 *   refused, never settled twice);
 * - balance conservation: `paidUsd + remainingAvailable === balance.available`,
 *   exactly, for every batch.
 *
 * Results are order-invariant: the same set of orders produces the same
 * settled/refused split regardless of array order.
 */

import { isSimulationDate } from '../date';
import type { CounterpartyId, PaymentId } from './contract';

export const PAYMENT_PURPOSES = Object.freeze([
  'debt_service', 'goods_services', 'transfer', 'refund', 'other',
] as const);
export type PaymentPurpose = typeof PAYMENT_PURPOSES[number];

export interface PaymentOrder {
  /** Permanent opaque identifier, unique per settlement batch. */
  readonly id: PaymentId;
  /** Who pays. */
  readonly payer: CounterpartyId;
  /** Who receives. */
  readonly payee: CounterpartyId;
  /** Whole USD, a positive safe integer. */
  readonly amount: number;
  /** Simulation date the payment settles on. */
  readonly date: string;
  readonly purpose: PaymentPurpose;
}

export interface TreasuryBalance {
  /** Uncommitted funds available for settlement (whole USD). */
  readonly available: number;
  /** Total cash stock (whole USD). */
  readonly cash: number;
  /** Cash already reserved (e.g. committed construction funding), not spendable. */
  readonly committed: number;
}

export interface SettlementResult {
  readonly settled: readonly PaymentOrder[];
  readonly refused: readonly { order: PaymentOrder; reason: 'insufficient_funds' | 'duplicate_id' }[];
  /** Sum of settled amounts. */
  readonly paidUsd: number;
  /** available - paidUsd; never negative. */
  readonly remainingAvailable: number;
}

/** A whole-USD amount is a non-negative safe integer. */
export function isWholeUsd(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount >= 0;
}

export function validateTreasuryBalance(balance: TreasuryBalance): void {
  if (!isWholeUsd(balance.cash) || !isWholeUsd(balance.committed) || !isWholeUsd(balance.available)) {
    throw new Error('Treasury balance amounts must be non-negative whole-USD safe integers.');
  }
  if (balance.committed > balance.cash) throw new Error('Committed cash cannot exceed cash.');
  if (balance.available !== balance.cash - balance.committed) {
    throw new Error('Available funds must equal cash minus committed (no hidden balance).');
  }
}

export function validatePaymentOrder(order: PaymentOrder): void {
  if (!order || typeof order.id !== 'string' || !order.id.trim()) throw new Error('Payment order needs a non-empty id.');
  if (typeof order.payer !== 'string' || !order.payer.trim()) throw new Error('Payment order needs a non-empty payer.');
  if (typeof order.payee !== 'string' || !order.payee.trim()) throw new Error('Payment order needs a non-empty payee.');
  if (order.payer === order.payee) throw new Error('A payment order needs distinct payer and payee (a self-transfer is not a settlement).');
  if (!isWholeUsd(order.amount) || order.amount <= 0) throw new Error('Payment amount must be a positive whole-USD safe integer.');
  if (!isSimulationDate(order.date)) throw new Error('Payment date must be a valid simulation date.');
  if (!PAYMENT_PURPOSES.includes(order.purpose)) throw new Error(`Unknown payment purpose: ${String(order.purpose)}.`);
}

/**
 * Settle a batch of orders atomically against one payer's treasury balance.
 * Deterministic: orders are processed in stable (id) order, so the result does
 * not depend on input array order. Every order is either settled exactly once
 * or refused; no order is dropped silently.
 */
export function settlePayments(balance: TreasuryBalance, orders: readonly PaymentOrder[]): SettlementResult {
  validateTreasuryBalance(balance);
  for (const order of orders) validatePaymentOrder(order);

  const ordered = [...orders].sort((a, b) => a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const settled: PaymentOrder[] = [];
  const refused: { order: PaymentOrder; reason: 'insufficient_funds' | 'duplicate_id' }[] = [];
  let remaining = balance.available;
  let paidUsd = 0;

  for (const order of ordered) {
    if (seen.has(order.id)) {
      refused.push({ order, reason: 'duplicate_id' });
      continue;
    }
    seen.add(order.id);
    if (order.amount > remaining) {
      refused.push({ order, reason: 'insufficient_funds' });
      continue;
    }
    remaining -= order.amount;
    paidUsd += order.amount;
    settled.push(order);
  }

  return { settled, refused, paidUsd, remainingAvailable: remaining };
}

/** Conservation check for a settlement result: paid + remaining === available. */
export function assertSettlementConservation(balance: TreasuryBalance, result: SettlementResult): void {
  validateTreasuryBalance(balance);
  const paid = result.settled.reduce((sum, o) => sum + o.amount, 0);
  if (paid !== result.paidUsd) throw new Error('Settled amounts do not reconcile with the reported paid total.');
  if (result.remainingAvailable < 0) throw new Error('Settlement over-spent the available balance.');
  if (result.paidUsd + result.remainingAvailable !== balance.available) {
    throw new Error('Settlement violates balance conservation.');
  }
}
