import { describe, it, expect } from 'vitest';
import {
  validateDebtObligation, validateDebtSchedule,
  schedulePrincipalOutstanding, scheduleInterestDue, scheduleMaturitiesDue,
  maturedOutstanding, reconcileSchedule, amortizePrincipal,
  type DebtObligation, type DebtSchedule,
} from '../finance/debt';

const ob = (id: string, principal: number, rateBps: number, outstanding = principal, maturity = '2030-01-01'): DebtObligation => ({
  id, principal, rateBps, issuedDate: '2026-01-01', maturityDate: maturity, outstanding,
});
const sched = (obligations: DebtObligation[], date = '2026-02-01'): DebtSchedule => ({ date, obligations });

describe('finance loans/bonds and debt schedules (0.26.4)', () => {
  it('sums outstanding principal', () => {
    expect(schedulePrincipalOutstanding(sched([ob('a', 1000, 200), ob('b', 500, 400, 300)]))).toBe(1300);
  });

  it('accrues monthly interest with the fiscal ratio formula (outstanding × rateBps / 120000)', () => {
    const schedule = sched([ob('a', 1_200_000, 200), ob('b', 120_000, 1000)]);
    expect(scheduleInterestDue(schedule)).toBe(2000 + 1000);
  });

  it('reconciles exactly to the canonical debt stock and rejects any mismatch', () => {
    const schedule = sched([ob('a', 1000, 200), ob('b', 500, 400, 300)]);
    expect(() => reconcileSchedule(schedule, 1300)).not.toThrow();
    expect(() => reconcileSchedule(schedule, 1400)).toThrow(/does not reconcile/);
  });

  it('amortizes deterministically (earliest maturity first) and conserves principal', () => {
    const schedule = sched([
      ob('a', 1000, 200, 1000, '2030-01-01'),
      ob('b', 500, 400, 500, '2027-01-01'),
    ]);
    const result = amortizePrincipal(schedule, 800);
    expect(result.paidUsd).toBe(800);
    expect(result.remainingPaymentUsd).toBe(0);
    const byId = Object.fromEntries(result.schedule.obligations.map(o => [o.id, o.outstanding]));
    expect(byId.b).toBe(0);
    expect(byId.a).toBe(700);
    expect(schedulePrincipalOutstanding(result.schedule)).toBe(700);
  });

  it('returns leftover payment when the schedule is fully repaid', () => {
    const schedule = sched([ob('a', 1000, 200)]);
    const result = amortizePrincipal(schedule, 1500);
    expect(result.paidUsd).toBe(1000);
    expect(result.remainingPaymentUsd).toBe(500);
    expect(schedulePrincipalOutstanding(result.schedule)).toBe(0);
  });

  it('reports maturities and matured-but-unrepaid obligations', () => {
    const schedule = sched([
      ob('a', 1000, 200, 1000, '2030-01-01'),
      ob('b', 500, 400, 500, '2026-06-01'),
    ]);
    expect(scheduleMaturitiesDue(schedule, '2026-12-31')).toBe(500);
    expect(maturedOutstanding(schedule, '2026-12-31').map(o => o.id)).toEqual(['b']);
  });

  it('rejects malformed obligations (principal, rate, outstanding, dates)', () => {
    expect(() => validateDebtObligation(ob('a', 0, 200))).toThrow(/positive whole-USD/);
    expect(() => validateDebtObligation(ob('a', 1000, -1))).toThrow(/non-negative integer basis-point rate/);
    expect(() => validateDebtObligation({ ...ob('a', 1000, 200), outstanding: 1001 })).toThrow(/within \[0, principal\]/);
    expect(() => validateDebtObligation({ ...ob('a', 1000, 200), maturityDate: '2025-12-31' })).toThrow(/cannot precede/);
  });

  it('rejects duplicate obligation ids in a schedule', () => {
    expect(() => validateDebtSchedule(sched([ob('a', 1000, 200), ob('a', 500, 200)]))).toThrow(/Duplicate obligation id/);
  });

  it('rejects an invalid schedule inside amortization', () => {
    expect(() => amortizePrincipal(sched([ob('a', 1000, 200), ob('a', 500, 200)]), 100)).toThrow(/Duplicate obligation id/);
  });
});
