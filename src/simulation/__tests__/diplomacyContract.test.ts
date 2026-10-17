import { describe, it, expect } from 'vitest';
import {
  validateDiplomaticMandate, canConductDiplomacy, validateDiplomaticActor,
  validateDiplomaticCommitment, DIPLOMACY_OWNERS, type DiplomaticMandate, type DiplomaticCommitment,
} from '../diplomacy/contract';

const mandate = (over: Partial<DiplomaticMandate> = {}): DiplomaticMandate => ({ basis: 'head_of_government', ...over } as DiplomaticMandate);
const commitment = (over: Partial<DiplomaticCommitment> = {}): DiplomaticCommitment => ({
  id: 'c1', actorCountryId: 'country-a', mandate: mandate(), counterpartyId: 'country-b',
  clauseKind: 'non_aggression', date: '2026-02-01', note: 'mutual non-aggression commitment',
  ...over,
});

describe('diplomacy actor and commitment contract (0.31.1)', () => {
  it('names canonical owners and never a second treaty system', () => {
    expect(DIPLOMACY_OWNERS.clauses).toBe('multilateral.treaties[].clauses');
    expect(DIPLOMACY_OWNERS.obligations).toBe('multilateral.obligations');
    expect(DIPLOMACY_OWNERS.relations).toBe('bilateralRelations');
    expect(DIPLOMACY_OWNERS.decisions).toBe('multilateral.decisions');
  });

  it('resolves a mandate only from the real executive; unresolved fails closed', () => {
    expect(canConductDiplomacy(mandate())).toBe(true);
    expect(canConductDiplomacy(mandate({ basis: 'presidential_head_of_state' }))).toBe(true);
    expect(canConductDiplomacy(mandate({ basis: 'unresolved' }))).toBe(false);
    expect(() => validateDiplomaticMandate(mandate({ basis: 'foreign_portfolio' as never }))).toThrow(/Unknown diplomatic mandate basis/);
  });

  it('validates an actor and a commitment, and rejects malformed ones', () => {
    expect(() => validateDiplomaticActor({ actorCountryId: 'country-a', mandate: mandate() })).not.toThrow();
    expect(() => validateDiplomaticCommitment(commitment())).not.toThrow();
    expect(() => validateDiplomaticCommitment(commitment({ counterpartyId: 'country-a' }))).toThrow(/distinct/);
    expect(() => validateDiplomaticCommitment(commitment({ mandate: mandate({ basis: 'unresolved' }) }))).toThrow(/fails closed/);
    expect(() => validateDiplomaticCommitment(commitment({ clauseKind: 'magic' as never }))).toThrow(/Unknown commitment clause kind/);
    expect(() => validateDiplomaticCommitment(commitment({ date: 'bad' }))).toThrow(/valid simulation date/);
  });
});
