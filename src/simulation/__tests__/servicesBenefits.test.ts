import { describe, it, expect } from 'vitest';
import {
  validateBenefitRule, benefitPayments, type BenefitRule,
} from '../services/benefits';

const rule = (over: Partial<BenefitRule> = {}): BenefitRule => ({
  id: 'b1', kind: 'pension', eligibilityNote: 'documented legal eligibility',
  monthlyAmountPerRecipient: 100, eligiblePopulation: 1000, budgetAvailable: 50000,
  ...over,
});

describe('pensions and benefits (0.29.6)', () => {
  it('validates a rule and rejects malformed ones', () => {
    expect(() => validateBenefitRule(rule())).not.toThrow();
    expect(() => validateBenefitRule(rule({ kind: 'childcare' as never }))).toThrow(/Unknown benefit kind/);
    expect(() => validateBenefitRule(rule({ monthlyAmountPerRecipient: 0 }))).toThrow(/positive whole-USD/);
    expect(() => validateBenefitRule(rule({ eligibilityNote: '' }))).toThrow(/eligibility note/);
  });

  it('pays bounded by budget; the unserved eligible population is a shortfall, never an invented exclusion', () => {
    const r = benefitPayments(rule());
    expect(r.recipients).toBe(500);       // 50000 / 100
    expect(r.totalPaid).toBe(50000);
    expect(r.shortfall).toBe(50000);      // (1000 - 500) * 100
  });

  it('pays everyone when budget suffices', () => {
    const r = benefitPayments(rule({ budgetAvailable: 200000 }));
    expect(r.recipients).toBe(1000);
    expect(r.shortfall).toBe(0);
  });

  it('rejects fractional budget', () => {
    expect(() => benefitPayments(rule({ budgetAvailable: 1.5 }))).toThrow(/non-negative whole-USD/);
  });
});
