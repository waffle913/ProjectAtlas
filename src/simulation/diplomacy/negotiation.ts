/**
 * 0.31.2 — Diplomacy V2: negotiations, concessions and guarantees.
 *
 * Pure negotiation contract (docs/diplomacy-0.31.md). A proposal is resolved
 * only by an explicit accept/reject decision or by its deadline — never
 * automatically from a relation score crossing a threshold. A concession is a
 * dated, validated unilateral give from a mandated actor. Credibility is causal
 * (honored vs violated obligations) and unavailable-safe (`unavailable != 0`).
 * No `SimulationState` integration, no schema/migration, no scheduler, no RNG.
 */

import { isWholeUsd } from '../finance/settlement';
import { isSimulationDate } from '../date';
import { canConductDiplomacy, COMMITMENT_KINDS, type CommitmentKind, type DiplomaticMandate } from './contract';

export type NegotiationDecision = 'accepted' | 'rejected' | 'expired';

export interface NegotiationProposal {
  readonly id: string;
  readonly proposerCountryId: string;
  readonly mandate: DiplomaticMandate;
  readonly counterpartyId: string;
  /** The conditional commitment offered (an existing 0.20 clause kind); a guarantee is a conditional commitment. */
  readonly offerClauseKind: CommitmentKind;
  /** Explicit condition for the commitment; null = unconditional. */
  readonly condition: string | null;
  readonly deadline: string;
  readonly date: string;
  readonly note: string;
}

export function validateNegotiationProposal(p: NegotiationProposal): void {
  if (!p || typeof p.id !== 'string' || !p.id.trim()) throw new Error('Negotiation proposal needs a non-empty id.');
  if (typeof p.proposerCountryId !== 'string' || !p.proposerCountryId.trim()) throw new Error('Negotiation proposal needs a non-empty proposer country id.');
  if (typeof p.counterpartyId !== 'string' || !p.counterpartyId.trim()) throw new Error('Negotiation proposal needs a non-empty counterparty id.');
  if (p.proposerCountryId === p.counterpartyId) throw new Error('Negotiation proposal needs distinct proposer and counterparty.');
  if (!canConductDiplomacy(p.mandate)) throw new Error('A negotiation proposal needs a mandate that actually holds diplomatic power; unresolved authority fails closed.');
  if (!COMMITMENT_KINDS.includes(p.offerClauseKind)) throw new Error(`Unknown offer clause kind: ${String(p.offerClauseKind)}.`);
  if (p.condition !== null && (typeof p.condition !== 'string' || !p.condition.trim())) throw new Error('A condition must be a non-empty string or null.');
  if (!isSimulationDate(p.date)) throw new Error('Proposal date must be a valid simulation date.');
  if (!isSimulationDate(p.deadline)) throw new Error('Proposal deadline must be a valid simulation date.');
  if (p.deadline < p.date) throw new Error('Proposal deadline must not precede its date.');
  if (typeof p.note !== 'string' || !p.note.trim()) throw new Error('Negotiation proposal needs a note.');
}

/**
 * Resolve a proposal from an explicit decision and the current date. A proposal
 * is never auto-accepted from a relation score: `decision` is `null` while open,
 * and an undecided proposal past its deadline is `expired`.
 */
export function resolveNegotiation(p: NegotiationProposal, decision: 'accept' | 'reject' | null, onDate: string): NegotiationDecision {
  validateNegotiationProposal(p);
  if (!isSimulationDate(onDate)) throw new Error('Resolution date must be a valid simulation date.');
  if (decision === 'accept') return 'accepted';
  if (decision === 'reject') return 'rejected';
  if (onDate > p.deadline) return 'expired';
  return decision === null ? 'expired' : decision; // unreachable; kept exhaustive
}

export type ConcessionKind = 'relation_adjustment' | 'tariff_reduction';

export interface Concession {
  readonly id: string;
  readonly fromCountryId: string;
  readonly mandate: DiplomaticMandate;
  readonly toCountryId: string;
  readonly kind: ConcessionKind;
  /** Whole signed units: relation-score points for relation_adjustment, basis points for tariff_reduction. */
  readonly value: number;
  readonly date: string;
  readonly note: string;
}

export function validateConcession(c: Concession): void {
  if (!c || typeof c.id !== 'string' || !c.id.trim()) throw new Error('Concession needs a non-empty id.');
  if (typeof c.fromCountryId !== 'string' || !c.fromCountryId.trim()) throw new Error('Concession needs a non-empty from country id.');
  if (typeof c.toCountryId !== 'string' || !c.toCountryId.trim()) throw new Error('Concession needs a non-empty to country id.');
  if (c.fromCountryId === c.toCountryId) throw new Error('A concession needs distinct from and to countries.');
  if (!canConductDiplomacy(c.mandate)) throw new Error('A concession needs a mandate that actually holds diplomatic power; unresolved authority fails closed.');
  if (!['relation_adjustment', 'tariff_reduction'].includes(c.kind)) throw new Error(`Unknown concession kind: ${String(c.kind)}.`);
  if (!Number.isSafeInteger(c.value)) throw new Error('Concession value must be a safe integer.');
  if (c.kind === 'tariff_reduction' && (c.value < 0 || c.value > 10000)) throw new Error('tariff_reduction value must be between 0 and 10000 bps.');
  if (!isSimulationDate(c.date)) throw new Error('Concession date must be a valid simulation date.');
  if (typeof c.note !== 'string' || !c.note.trim()) throw new Error('Concession needs a note.');
}

export interface CredibilityRecord {
  readonly honoredObligations: number;
  readonly violatedObligations: number;
  readonly coverage: 'computed' | 'unavailable';
}

/** Causal credibility (0..10000 bps) from honored vs violated obligations; null = no evidence or unavailable (never zero). */
export function credibilityBps(record: CredibilityRecord): number | null {
  if (!record || record.coverage === 'unavailable') return null;
  if (!isWholeUsd(record.honoredObligations) || !isWholeUsd(record.violatedObligations)) throw new Error('Obligation counts must be non-negative whole numbers.');
  const total = record.honoredObligations + record.violatedObligations;
  if (total === 0) return null;
  return Math.round((record.honoredObligations / total) * 10000);
}
