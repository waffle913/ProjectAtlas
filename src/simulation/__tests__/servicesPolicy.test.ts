import { describe, it, expect } from 'vitest';
import {
  validateServicePolicy, applyServicePolicy, type ServicePolicy,
} from '../services/policy';

const policy = (over: Partial<ServicePolicy> = {}): ServicePolicy => ({
  id: 'p1', sourceProposalId: 'prop-1', serviceFamily: 'health', capacityDelta: 50,
  institutionalLimit: 1000, authorizedOn: '2026-02-01',
  fundingCommitted: true, constructionComplete: true, personnelCommitted: true,
  note: 'funded 50 additional beds',
  ...over,
});

describe('public policy and reactions (0.29.8)', () => {
  it('validates a policy and rejects malformed ones', () => {
    expect(() => validateServicePolicy(policy())).not.toThrow();
    expect(() => validateServicePolicy(policy({ sourceProposalId: '' }))).toThrow(/source proposal id/);
    expect(() => validateServicePolicy(policy({ capacityDelta: 1.5 }))).toThrow(/safe integer/);
    expect(() => validateServicePolicy(policy({ authorizedOn: 'bad' }))).toThrow(/authorization date/);
    expect(() => validateServicePolicy(policy({ note: '' }))).toThrow(/note/);
  });

  it('A6: fails closed until funding, construction and personnel are all confirmed', () => {
    expect(() => applyServicePolicy(100, policy({ fundingCommitted: false }))).toThrow(/fail closed/);
    expect(() => applyServicePolicy(100, policy({ constructionComplete: false }))).toThrow(/fail closed/);
    expect(() => applyServicePolicy(100, policy({ personnelCommitted: false }))).toThrow(/fail closed/);
  });

  it('applies a real capacity change clamped to [0, institutionalLimit] once commissioned (never a magic multiplier)', () => {
    expect(applyServicePolicy(100, policy())).toBe(150);
    expect(applyServicePolicy(100, policy({ capacityDelta: -200 }))).toBe(0);
    expect(applyServicePolicy(900, policy({ capacityDelta: 200, institutionalLimit: 1000 }))).toBe(1000);
  });

  it('rejects fractional current capacity', () => {
    expect(() => applyServicePolicy(1.5, policy())).toThrow(/non-negative whole number/);
  });
});
