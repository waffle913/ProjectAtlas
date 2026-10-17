/**
 * 0.31.1 — Diplomacy V2: actor and commitment contract.
 *
 * Pure vocabulary/accounting contract (parallel to 0.25.1/0.26.1/0.27.1/0.28.1/
 * 0.29.1/0.30.1). It names the canonical owners of diplomatic actors, relations,
 * disputes, decisions, clauses and obligations — never a second treaty system —
 * and defines the authority (mandate) a diplomatic actor must actually hold.
 * No `SimulationState` integration, no schema/migration, no scheduler, no RNG.
 */

import { isSimulationDate } from '../date';

export const DIPLOMACY_VERSION = 'diplomacy-0.31-v1' as const;

/**
 * Where each diplomatic concept already lives in canonical state. A 0.31
 * commitment references these owners; it never introduces a parallel treaty,
 * relation, dispute or decision store.
 */
export const DIPLOMACY_OWNERS = Object.freeze({
  actors: 'governance',          // countries + persons/offices (0.13/0.14/0.23)
  relations: 'bilateralRelations', // diplomacy.ts + international.episodes (0.18)
  disputes: 'claims',            // territorial claims + explicitCasusBelli (diplomacy.ts)
  decisions: 'multilateral.decisions',
  clauses: 'multilateral.treaties[].clauses',
  obligations: 'multilateral.obligations',
} as const);

/**
 * Who actually holds the power to act diplomatically for a country. Mirrors the
 * 0.14 office model: a parliamentary head of government or a presidential head
 * of state (the reconciled executives). Ministers hold no diplomatic capability
 * in the current model (the foreign-affairs portfolio is not yet modelled), so
 * no portfolio basis is represented. `unresolved` fails closed — authority is
 * never invented.
 */
export type DiplomaticMandate =
  | { readonly basis: 'head_of_government' }
  | { readonly basis: 'presidential_head_of_state' }
  | { readonly basis: 'unresolved' };

export function validateDiplomaticMandate(m: DiplomaticMandate): void {
  if (!m || typeof m !== 'object') throw new Error('Diplomatic mandate is required.');
  switch (m.basis) {
    case 'head_of_government':
    case 'presidential_head_of_state':
    case 'unresolved':
      break;
    default:
      throw new Error(`Unknown diplomatic mandate basis: ${String((m as { basis?: unknown }).basis)}.`);
  }
}

/** An actor holds diplomatic power only if its mandate is resolved; never inferred. */
export function canConductDiplomacy(m: DiplomaticMandate): boolean {
  validateDiplomaticMandate(m);
  return m.basis !== 'unresolved';
}

/** Mirrors the 0.20 `TreatyClause` kinds exactly — a commitment never invents a new clause type. */
export const COMMITMENT_KINDS = Object.freeze([
  'defensive_guarantee', 'non_aggression', 'trade_commitment', 'sanctions_commitment', 'recognition',
] as const);
export type CommitmentKind = typeof COMMITMENT_KINDS[number];

export interface DiplomaticActor {
  readonly actorCountryId: string;
  readonly mandate: DiplomaticMandate;
}

export function validateDiplomaticActor(a: DiplomaticActor): void {
  if (!a || typeof a.actorCountryId !== 'string' || !a.actorCountryId.trim()) throw new Error('Diplomatic actor needs a non-empty country id.');
  validateDiplomaticMandate(a.mandate);
}

/** A dated commitment made by an actor under a resolved mandate; it instantiates an existing clause kind. */
export interface DiplomaticCommitment {
  readonly id: string;
  readonly actorCountryId: string;
  readonly mandate: DiplomaticMandate;
  /** The other party the commitment is made toward. */
  readonly counterpartyId: string;
  readonly clauseKind: CommitmentKind;
  readonly date: string;
  readonly note: string;
}

export function validateDiplomaticCommitment(c: DiplomaticCommitment): void {
  if (!c || typeof c.id !== 'string' || !c.id.trim()) throw new Error('Diplomatic commitment needs a non-empty id.');
  if (typeof c.actorCountryId !== 'string' || !c.actorCountryId.trim()) throw new Error('Diplomatic commitment needs a non-empty actor country id.');
  if (typeof c.counterpartyId !== 'string' || !c.counterpartyId.trim()) throw new Error('Diplomatic commitment needs a non-empty counterparty id.');
  if (c.actorCountryId === c.counterpartyId) throw new Error('A diplomatic commitment needs distinct actor and counterparty.');
  if (!canConductDiplomacy(c.mandate)) throw new Error('A diplomatic commitment needs a mandate that actually holds diplomatic power; unresolved authority fails closed.');
  if (!COMMITMENT_KINDS.includes(c.clauseKind)) throw new Error(`Unknown commitment clause kind: ${String(c.clauseKind)}.`);
  if (!isSimulationDate(c.date)) throw new Error('Commitment date must be a valid simulation date.');
  if (typeof c.note !== 'string' || !c.note.trim()) throw new Error('Diplomatic commitment needs a note.');
}
