import { describe, it, expect } from 'vitest';
import {
  PAYMENT_PURPOSES, isWholeUsd, validateTreasuryBalance, validatePaymentOrder,
  settlePayments, assertSettlementConservation,
  type PaymentOrder, type TreasuryBalance,
} from '../finance/settlement';

const DATE = '2026-02-01';
const balance = (available: number, cash: number, committed: number): TreasuryBalance => ({ available, cash, committed });
const order = (id: string, amount: number, payer = 'treasury-a', payee = 'counterparty-b'): PaymentOrder => ({
  id, payer, payee, amount, date: DATE, purpose: 'goods_services',
});

describe('finance payments and settlement (0.26.3)', () => {
  it('settles a batch atomically and conserves the available balance', () => {
    const b = balance(1000, 1200, 200);
    const result = settlePayments(b, [order('p1', 300), order('p2', 500), order('p3', 200)]);
    expect(result.settled.map(o => o.id).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(result.refused).toEqual([]);
    expect(result.paidUsd).toBe(1000);
    expect(result.remainingAvailable).toBe(0);
    assertSettlementConservation(b, result);
  });

  it('refuses insufficient funds and never settles partially', () => {
    const b = balance(1000, 1000, 0);
    const result = settlePayments(b, [order('p1', 700), order('p2', 700)]);
    expect(result.settled.map(o => o.id)).toEqual(['p1']);
    expect(result.refused).toEqual([{ order: order('p2', 700), reason: 'insufficient_funds' }]);
    expect(result.paidUsd).toBe(700);
    expect(result.remainingAvailable).toBe(300);
    assertSettlementConservation(b, result);
  });

  it('settles a duplicate id exactly once and refuses the rest', () => {
    const b = balance(500, 500, 0);
    const result = settlePayments(b, [order('p1', 200), order('p1', 200), order('p2', 200)]);
    expect(result.settled.map(o => o.id)).toEqual(['p1', 'p2']);
    expect(result.refused).toEqual([{ order: order('p1', 200), reason: 'duplicate_id' }]);
    expect(result.paidUsd).toBe(400);
    assertSettlementConservation(b, result);
  });

  it('is order-invariant: the settled/refused split does not depend on array order', () => {
    const b = balance(1000, 1000, 0);
    const orders = [order('p1', 300), order('p2', 500), order('p3', 200), order('p4', 700)];
    const a = settlePayments(b, orders);
    const bRes = settlePayments(b, [...orders].reverse());
    expect(a.settled.map(o => o.id).sort()).toEqual(bRes.settled.map(o => o.id).sort());
    expect(a.refused.map(r => r.order.id).sort()).toEqual(bRes.refused.map(r => r.order.id).sort());
    expect(a.paidUsd).toBe(bRes.paidUsd);
  });

  it('rejects ambiguous duplicate ids (same id, conflicting amounts) instead of settling order-dependently', () => {
    const b = balance(1000, 1000, 0);
    expect(() => settlePayments(b, [order('p1', 200), order('p1', 500)])).toThrow(/Ambiguous duplicate payment id/);
  });

  it('rejects malformed orders (id, self-payment, amount, date, purpose)', () => {
    expect(() => validatePaymentOrder(order('', 100))).toThrow(/non-empty id/);
    expect(() => validatePaymentOrder({ ...order('p1', 100), payee: 'treasury-a' })).toThrow(/distinct payer and payee/);
    expect(() => validatePaymentOrder(order('p1', 0))).toThrow(/positive whole-USD/);
    expect(() => validatePaymentOrder(order('p1', -5))).toThrow(/positive whole-USD/);
    expect(() => validatePaymentOrder(order('p1', 1.5))).toThrow(/positive whole-USD/);
    expect(() => validatePaymentOrder({ ...order('p1', 100), date: 'not-a-date' })).toThrow(/valid simulation date/);
    expect(() => validatePaymentOrder({ ...order('p1', 100), purpose: 'nope' as never })).toThrow(/Unknown payment purpose/);
  });

  it('rejects an incoherent treasury balance (committed > cash, hidden balance)', () => {
    expect(() => validateTreasuryBalance(balance(100, 100, 200))).toThrow(/Committed cash cannot exceed cash/);
    expect(() => validateTreasuryBalance(balance(500, 1000, 200))).toThrow(/must equal cash minus committed/);
  });

  it('defines the whole-USD predicate for safe integers only', () => {
    expect(isWholeUsd(0)).toBe(true);
    expect(isWholeUsd(42)).toBe(true);
    expect(isWholeUsd(1.5)).toBe(false);
    expect(isWholeUsd(-1)).toBe(false);
    expect(isWholeUsd(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isWholeUsd(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it('restricts payment purposes to the declared vocabulary', () => {
    expect(PAYMENT_PURPOSES).toEqual(['debt_service', 'goods_services', 'transfer', 'refund', 'other']);
  });
});
