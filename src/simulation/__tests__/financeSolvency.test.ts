import { describe, it, expect } from 'vitest';
import {
  assessSolvency, creditCeiling, defaultedPrincipal, validateSolvencyIndicators,
  SOLVENCY_STATES, type SolvencyIndicators,
} from '../finance/solvency';
import type { DebtSchedule } from '../finance/debt';

const base: SolvencyIndicators = {
  debtStock: 1000, debtLimit: 2000, interestDue: 50, interestArrears: 0,
  arrears: 0, totalRevenue: 1000, availableCash: 500, annualOutput: 12000,
};
const sched = (obligations: DebtSchedule['obligations']): DebtSchedule => ({ date: '2026-03-01', obligations });

describe('finance default and solvency (0.26.6)', () => {
  it('is solvent when no arrears and interest burden is low', () => {
    const a = assessSolvency(base);
    expect(a.state).toBe('solvent');
    expect(a.reason).toBeNull();
    expect(a.interestCoverageBps).toBe(500); // 50 / 1000
    expect(a.debtToOutputBps).toBe(833);     // 1000 / 12000 (rounded down from 833.33)
  });

  it('is in default when interest arrears exist (failed debt service)', () => {
    const a = assessSolvency({ ...base, interestArrears: 10 });
    expect(a.state).toBe('in_default');
    expect(a.reason).toBe('interest_arrears');
  });

  it('is stressed when the debt stock breaches the debt limit', () => {
    const a = assessSolvency({ ...base, debtStock: 2500, debtLimit: 2000 });
    expect(a.state).toBe('stressed');
    expect(a.reason).toBe('debt_limit_exceeded');
  });

  it('is stressed when unpaid commitments exist', () => {
    const a = assessSolvency({ ...base, arrears: 100 });
    expect(a.state).toBe('stressed');
    expect(a.reason).toBe('commitment_arrears');
  });

  it('is stressed when interest consumes at least half of revenue', () => {
    const a = assessSolvency({ ...base, interestDue: 600, totalRevenue: 1000 });
    expect(a.state).toBe('stressed');
    expect(a.reason).toBe('interest_burden');
  });

  it('keeps coverage null when revenue is absent (unavailable != 0)', () => {
    const a = assessSolvency({ ...base, totalRevenue: 0, annualOutput: 0 });
    expect(a.interestCoverageBps).toBeNull();
    expect(a.debtToOutputBps).toBeNull();
    expect(a.state).toBe('solvent');
  });

  it('blocks new credit in default and keeps only debt-limit headroom otherwise', () => {
    const def = assessSolvency({ ...base, interestArrears: 10 });
    expect(creditCeiling(base, def)).toEqual({ usable: 0, blocked: true });
    const ok = assessSolvency(base);
    expect(creditCeiling(base, ok)).toEqual({ usable: 1000, blocked: false });
  });

  it('computes defaulted principal as matured-but-unrepaid obligations', () => {
    const schedule = sched([
      { id: 'a', principal: 1000, rateBps: 200, issuedDate: '2026-01-01', maturityDate: '2030-01-01', outstanding: 1000 },
      { id: 'b', principal: 500, rateBps: 400, issuedDate: '2026-01-01', maturityDate: '2026-02-01', outstanding: 500 },
    ]);
    expect(defaultedPrincipal(schedule, '2026-03-01')).toBe(500);
  });

  it('rejects negative or fractional solvency indicators', () => {
    expect(() => validateSolvencyIndicators({ ...base, debtStock: -1 })).toThrow(/non-negative whole-USD/);
    expect(() => validateSolvencyIndicators({ ...base, interestDue: 1.5 })).toThrow(/non-negative whole-USD/);
    expect(SOLVENCY_STATES).toEqual(['solvent', 'stressed', 'in_default']);
  });
});
