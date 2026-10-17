import { describe, it, expect } from 'vitest';
import {
  validateNegotiationProposal, resolveNegotiation, validateConcession, credibilityBps,
  type NegotiationProposal, type Concession,
} from '../diplomacy/negotiation';

const proposal = (over: Partial<NegotiationProposal> = {}): NegotiationProposal => ({
  id: 'p1', proposerCountryId: 'country-a', mandate: { basis: 'head_of_government' }, counterpartyId: 'country-b',
  offerClauseKind: 'defensive_guarantee', condition: 'if attacked', deadline: '2026-04-01',
  extendedDeadline: null, extendedOn: null, date: '2026-02-01', note: 'defensive guarantee offer',
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
    expect(() => validateNegotiationProposal(proposal({ extendedDeadline: '2026-03-01' }))).toThrow(/not earlier than the original deadline/);
    expect(() => validateNegotiationProposal(proposal({ extendedDeadline: '2026-06-01', extendedOn: null }))).toThrow(/authorized on a valid date/);
    expect(() => validateNegotiationProposal(proposal({ extendedDeadline: null, extendedOn: '2026-02-01' }))).toThrow(/must be null/);
  });

  it('resolves only by explicit decision or deadline — never from a relation threshold', () => {
    expect(resolveNegotiation(proposal(), 'accept', '2026-02-15')).toBe('accepted');
    expect(resolveNegotiation(proposal(), 'reject', '2026-02-15')).toBe('rejected');
    expect(resolveNegotiation(proposal(), null, '2026-02-15')).toBe('pending');
    expect(resolveNegotiation(proposal(), null, '2026-05-01')).toBe('expired');
    expect(() => resolveNegotiation(proposal(), null, '2026-01-15')).toThrow(/must not precede the proposal date/);
    expect(() => resolveNegotiation(proposal(), 'maybe' as never, '2026-02-15')).toThrow(/Unknown negotiation decision/);
  });

  it('refuses an acceptance after expiry unless an explicitly authorized extension exists', () => {
    expect(() => resolveNegotiation(proposal(), 'accept', '2026-05-01')).toThrow(/cannot be accepted after its deadline/);
    const extended = proposal({ extendedDeadline: '2026-06-01', extendedOn: '2026-03-01' });
    expect(resolveNegotiation(extended, 'accept', '2026-05-15')).toBe('accepted');
    expect(resolveNegotiation(extended, null, '2026-05-15')).toBe('pending');
    expect(resolveNegotiation(extended, null, '2026-06-15')).toBe('expired');
  });

  it('validates a bounded concession with a real mandate', () => {
    expect(() => validateConcession(concession())).not.toThrow();
    expect(() => validateConcession(concession({ mandate: { basis: 'unresolved' } }))).toThrow(/fails closed/);
    expect(() => validateConcession(concession({ kind: 'tariff_reduction', value: 20000 }))).toThrow(/between 0 and 10000/);
    expect(() => validateConcession(concession({ kind: 'relation_adjustment', value: 150 }))).toThrow(/between -100 and 100/);
    expect(() => validateConcession(concession({ value: 1.5 }))).toThrow(/safe integer/);
  });

  it('computes causal credibility, unavailable-safe, never zero from no evidence, and checked against overflow', () => {
    expect(credibilityBps({ honoredObligations: 3, violatedObligations: 1, coverage: 'computed' })).toBe(7500);
    expect(credibilityBps({ honoredObligations: 0, violatedObligations: 2, coverage: 'computed' })).toBe(0);
    expect(credibilityBps({ honoredObligations: 0, violatedObligations: 0, coverage: 'computed' })).toBeNull();
    expect(credibilityBps({ honoredObligations: 0, violatedObligations: 0, coverage: 'unavailable' })).toBeNull();
    expect(() => credibilityBps({ honoredObligations: Number.MAX_SAFE_INTEGER, violatedObligations: 1, coverage: 'computed' })).toThrow(/overflow/);
  });
});
