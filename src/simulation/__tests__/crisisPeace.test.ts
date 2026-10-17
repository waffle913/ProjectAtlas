import { describe, it, expect } from 'vitest';
import {
  validateConflictEscalationPath, escalationOutcome, validatePeaceAgreement, CRISIS_PEACE_OWNERS,
  type ConflictEscalationPath, type PeaceAgreement,
} from '../operations/crisisPeace';

const path = (over: Partial<ConflictEscalationPath> = {}): ConflictEscalationPath => ({
  id: 'p1', disputeId: 'claim-1', tensionEpisodeId: 'ep-1', crisisId: 'crisis-1',
  decisionToUseForce: true, date: '2026-02-01', note: 'escalation chain',
  ...over,
});
const agreement = (over: Partial<PeaceAgreement> = {}): PeaceAgreement => ({
  id: 'a1', partyAId: 'country-a', partyBId: 'country-b', kind: 'truce',
  guaranteeClauseKind: null, date: '2026-03-01', note: 'temporary truce',
  ...over,
});

describe('crises, peace and security (0.31.9)', () => {
  it('names canonical owners of the conflict/peace chain', () => {
    expect(CRISIS_PEACE_OWNERS.disputes).toBe('claims');
    expect(CRISIS_PEACE_OWNERS.tensions).toBe('international.episodes');
    expect(CRISIS_PEACE_OWNERS.crises).toBe('crisis');
    expect(CRISIS_PEACE_OWNERS.useOfForce).toBe('operations');
  });

  it('requires the full dispute → tension → crisis → decision chain; force only on explicit decision', () => {
    expect(() => validateConflictEscalationPath(path())).not.toThrow();
    expect(escalationOutcome(path())).toBe('use_of_force');
    expect(escalationOutcome(path({ decisionToUseForce: false }))).toBe('de_escalated');
    expect(() => validateConflictEscalationPath(path({ crisisId: '' }))).toThrow(/crisis id/);
  });

  it('validates truce/peace/guarantee with correct clause usage', () => {
    expect(() => validatePeaceAgreement(agreement())).not.toThrow();
    expect(() => validatePeaceAgreement(agreement({ kind: 'peace' }))).not.toThrow();
    expect(() => validatePeaceAgreement(agreement({ kind: 'guarantee', guaranteeClauseKind: 'defensive_guarantee' }))).not.toThrow();
    expect(() => validatePeaceAgreement(agreement({ kind: 'guarantee' }))).toThrow(/defensive_guarantee clause/);
    expect(() => validatePeaceAgreement(agreement({ guaranteeClauseKind: 'defensive_guarantee' }))).toThrow(/Only a guarantee/);
    expect(() => validatePeaceAgreement(agreement({ partyBId: 'country-a' }))).toThrow(/distinct/);
  });
});
