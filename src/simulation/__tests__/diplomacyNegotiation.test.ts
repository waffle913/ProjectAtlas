import { describe, it, expect } from 'vitest';
import {
  validateNegotiationProposal, resolveNegotiation, validateConcession, credibilityBps,
  type NegotiationProposal, type Concession,
} from '../diplomacy/negotiation';

const proposal = (over: Partial<NegotiationProposal> = {}): NegotiationProposal => ({
  id: 'p1', proposerCountryId: 'country-a', mandate: { basis: 'head_of_government' }, counterpartyId: 'country-b',
  offerClauseKind: 'defensive_guarantee', condition: 'if attacked', deadline: '2026-04-01', date: '2026-02-01', note: 'defensive guarantee offer',
  ...over,
});
const concession = (over: Partial<Concession> = {}): Concession => ({
  id: 'c1', fromCountryId: 'country-a', mandate: { basis: 'head_of_government' }, toCountryId: 'country-b',
  kind: 'relation_adjustment', value: 10, date: '2026-02-01', note: 'relation improvement',
  ...over,
});

describe('negotiations, concessions and guarantees (0.31.2)', () => {
  it('validates a proposal and rejects malformed ones', () => {
    expect(() => validateNegotiationProposal(proposal())).not.toThrow();
    expect(() => validateNegotiationProposal(proposal({ mandate: { basis: 'unresolved' } }))).toThrow(/fails closed/);
    expect(() => validateNegotiationProposal(proposal({ counterpartyId: 'country-a' }))).toThrow(/distinct/);
    expect(() => validateNegotiationProposal(proposal({ offerClauseKind: 'magic' as never }))).toThrow(/Unknown offer clause kind/);
    expect(() => validateNegotiationProposal(proposal({ deadline: '2026-01-01' }))).toThrow(/must not precede/);
  });

  it('resolves only by explicit decision or deadline — never from a relation threshold', () => {
    expect(resolveNegotiation(proposal(), 'accept', '2026-02-15')).toBe('accepted');
    expect(resolveNegotiation(proposal(), 'reject', '2026-02-15')).toBe('rejected');
    expect(resolveNegotiation(proposal(), null, '2026-05-01')).toBe('expired');
  });

  it('validates a concession with a real mandate and bounded tariff values', () => {
    expect(() => validateConcession(concession())).not.toThrow();
    expect(() => validateConcession(concession({ mandate: { basis: 'unresolved' } }))).toThrow(/fails closed/);
    expect(() => validateConcession(concession({ kind: 'tariff_reduction', value: 20000 }))).toThrow(/between 0 and 10000/);
    expect(() => validateConcession(concession({ value: 1.5 }))).toThrow(/safe integer/);
  });

  it('computes causal credibility, unavailable-safe and never zero from no evidence', () => {
    expect(credibilityBps({ honoredObligations: 3, violatedObligations: 1, coverage: 'computed' })).toBe(7500);
    expect(credibilityBps({ honoredObligations: 0, violatedObligations: 2, coverage: 'computed' })).toBe(0);
    expect(credibilityBps({ honoredObligations: 0, violatedObligations: 0, coverage: 'computed' })).toBeNull();
    expect(credibilityBps({ honoredObligations: 0, violatedObligations: 0, coverage: 'unavailable' })).toBeNull();
  });
});
