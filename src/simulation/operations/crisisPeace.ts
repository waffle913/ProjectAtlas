/**
 * 0.31.9 — Military V2: crises, peace and security.
 *
 * Pure conflict/peace contract (docs/diplomacy-0.31.md). Force follows the real
 * causal chain — a dispute, a tension episode, a crisis, then an explicit
 * decision to use force — never a relation-score threshold. A peace agreement is
 * explicit: a truce, a peace, or a guarantee that instantiates the existing 0.20
 * defensive-guarantee clause. No `SimulationState` integration, no
 * schema/migration, no scheduler, no RNG.
 */

import { isSimulationDate } from '../date';

export const CRISIS_PEACE_VERSION = 'crisis-peace-0.31-v1' as const;

/** Canonical owners of each stage — no second conflict/peace store. */
export const CRISIS_PEACE_OWNERS = Object.freeze({
  disputes: 'claims',               // territorial claims + explicitCasusBelli (diplomacy.ts)
  tensions: 'international.episodes', // 0.18 pressure/severity
  crises: 'crisis',                 // 0.12 crisis engine
  useOfForce: 'operations',         // 0.19 war/deployment
  peace: 'multilateral',            // 0.20 treaties (peace/guarantee clauses)
} as const);

export interface ConflictEscalationPath {
  readonly id: string;
  readonly disputeId: string;
  readonly tensionEpisodeId: string;
  readonly crisisId: string;
  /** Explicit decision to use force; force never follows a relation-score threshold. */
  readonly decisionToUseForce: boolean;
  readonly date: string;
  readonly note: string;
}

export function validateConflictEscalationPath(p: ConflictEscalationPath): void {
  if (!p || typeof p.id !== 'string' || !p.id.trim()) throw new Error('Conflict escalation path needs a non-empty id.');
  if (typeof p.disputeId !== 'string' || !p.disputeId.trim()) throw new Error('Conflict escalation path needs a non-empty dispute id.');
  if (typeof p.tensionEpisodeId !== 'string' || !p.tensionEpisodeId.trim()) throw new Error('Conflict escalation path needs a non-empty tension episode id.');
  if (typeof p.crisisId !== 'string' || !p.crisisId.trim()) throw new Error('Conflict escalation path needs a non-empty crisis id.');
  if (typeof p.decisionToUseForce !== 'boolean') throw new Error('decisionToUseForce must be a boolean.');
  if (!isSimulationDate(p.date)) throw new Error('Escalation path date must be a valid simulation date.');
  if (typeof p.note !== 'string' || !p.note.trim()) throw new Error('Conflict escalation path needs a note.');
}

/** The outcome of an escalation path: force only on an explicit decision; otherwise de-escalated. */
export function escalationOutcome(p: ConflictEscalationPath): 'use_of_force' | 'de_escalated' {
  validateConflictEscalationPath(p);
  return p.decisionToUseForce ? 'use_of_force' : 'de_escalated';
}

export const PEACE_KINDS = Object.freeze(['truce', 'peace', 'guarantee'] as const);
export type PeaceKind = typeof PEACE_KINDS[number];

export interface PeaceAgreement {
  readonly id: string;
  readonly partyAId: string;
  readonly partyBId: string;
  readonly kind: PeaceKind;
  /** For a guarantee: the existing 0.20 defensive-guarantee clause; null otherwise. */
  readonly guaranteeClauseKind: 'defensive_guarantee' | null;
  readonly date: string;
  readonly note: string;
}

export function validatePeaceAgreement(a: PeaceAgreement): void {
  if (!a || typeof a.id !== 'string' || !a.id.trim()) throw new Error('Peace agreement needs a non-empty id.');
  if (typeof a.partyAId !== 'string' || !a.partyAId.trim()) throw new Error('Peace agreement needs a non-empty party A id.');
  if (typeof a.partyBId !== 'string' || !a.partyBId.trim()) throw new Error('Peace agreement needs a non-empty party B id.');
  if (a.partyAId === a.partyBId) throw new Error('Peace agreement needs distinct parties.');
  if (!PEACE_KINDS.includes(a.kind)) throw new Error(`Unknown peace kind: ${String(a.kind)}.`);
  if (a.kind === 'guarantee' && a.guaranteeClauseKind !== 'defensive_guarantee') throw new Error('A guarantee must instantiate the 0.20 defensive_guarantee clause.');
  if (a.kind !== 'guarantee' && a.guaranteeClauseKind !== null) throw new Error('Only a guarantee carries a defensive_guarantee clause.');
  if (!isSimulationDate(a.date)) throw new Error('Peace agreement date must be a valid simulation date.');
  if (typeof a.note !== 'string' || !a.note.trim()) throw new Error('Peace agreement needs a note.');
}
