import { describe, it, expect } from 'vitest';
import {
  validateTreasuryLedger, treasuryConservation, treasuryDebtConservation,
  assertTreasuryConservation, debtServiceOrders, borrowingCapacity,
  settleDebtService, type TreasuryLedger,
} from '../finance/treasury';
import { assertSettlementConservation } from '../finance/settlement';

const balanced = (): TreasuryLedger => ({
  openingCash: 1000, closingCash: 700, committed: 0, openingDebt: 5000, closingDebt: 5200,
  totalRevenue: 2000, borrowed: 500, repaid: 300, totalSpending: 2500,
  interestPaid: 100, interestDue: 100, financingNeed: 300, debtLimit: 6000, monthlyBorrowingLimit: 1000,
});

describe('finance public treasury and credit (0.26.7)', () => {
  it('conserves cash flow and debt stock on a balanced ledger', () => {
    const t = balanced();
    expect(treasuryConservation(t)).toBe(true);
    expect(treasuryDebtConservation(t)).toBe(true);
    expect(() => assertTreasuryConservation(t)).not.toThrow();
  });

  it('rejects an unbalanced cash flow or debt stock', () => {
    expect(() => assertTreasuryConservation({ ...balanced(), closingCash: 700, repaid: 200 })).toThrow(/cash flow does not conserve/);
    expect(() => assertTreasuryConservation({ ...balanced(), closingDebt: 5100 })).toThrow(/debt stock does not conserve/);
  });

  it('rejects negative or fractional ledger values', () => {
    expect(() => validateTreasuryLedger({ ...balanced(), openingCash: -1 })).toThrow(/non-negative whole-USD/);
    expect(() => validateTreasuryLedger({ ...balanced(), interestDue: 1.5 })).toThrow(/non-negative whole-USD/);
  });

  it('expresses debt service as payment orders (interest and principal)', () => {
    const orders = debtServiceOrders(balanced(), '2026-03-01');
    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({ id: 'interest-2026-03-01', amount: 100, purpose: 'debt_service' });
    expect(orders[1]).toMatchObject({ id: 'principal-2026-03-01', amount: 300, purpose: 'debt_service' });
  });

  it('computes causal borrowing capacity as the min of the monthly limit and debt headroom', () => {
    expect(borrowingCapacity(balanced())).toBe(800); // min(1000, 6000-5200)
    expect(borrowingCapacity({ ...balanced(), debtLimit: 5150 })).toBe(0); // no headroom
  });

  it('settles debt service against closing cash, interest first, conserving the balance', () => {
    const t = balanced();
    const result = settleDebtService(t, '2026-03-01');
    expect(result.settled.map(o => o.id)).toEqual(['interest-2026-03-01', 'principal-2026-03-01']);
    expect(result.paidUsd).toBe(400);
    expect(result.remainingAvailable).toBe(300);
    assertSettlementConservation({ available: t.closingCash, cash: t.closingCash, committed: 0 }, result);
  });

  it('refuses principal before interest when closing cash is short', () => {
    const t = { ...balanced(), closingCash: 150 };
    const result = settleDebtService(t, '2026-03-01');
    expect(result.settled.map(o => o.id)).toEqual(['interest-2026-03-01']);
    expect(result.refused.map(r => r.order.id)).toEqual(['principal-2026-03-01']);
  });

  it('settles debt service against UNCOMMITTED cash only (committed cash is reserved)', () => {
    const t = { ...balanced(), closingCash: 1000, committed: 400 };
    const result = settleDebtService(t, '2026-03-01');
    expect(result.paidUsd).toBe(400);          // interest 100 + principal 300
    expect(result.remainingAvailable).toBe(200); // 1000 - 400 committed - 400 paid
  });

  it('rejects committed cash exceeding closing cash', () => {
    expect(() => validateTreasuryLedger({ ...balanced(), committed: 800 })).toThrow(/cannot exceed closing cash/);
  });
});
