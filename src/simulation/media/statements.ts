/**
 * 0.32.3 — Media V2: statements and political communication.
 *
 * Pure statement contract (docs/media-0.32.md). A statement is a dated public
 * communication by a person, party, union or association. A statement is never a
 * law: it has no policy effect and never mutates canonical state. Its reach is
 * bounded by the actor's credibility and the audience's interest, and is
 * availability-typed (`unavailable != 0`). No `SimulationState` integration, no
 * schema/migration, no scheduler, no RNG.
 */

import { isSimulationDate } from '../date';
import type { AvailabilityStatus } from '../availability';

export const STATEMENT_ACTOR_KINDS = Object.freeze(['person', 'party', 'union', 'association'] as const);
export type StatementActorKind = typeof STATEMENT_ACTOR_KINDS[number];

/** A statement never has a policy effect — it is not a law and never mutates state. */
export const STATEMENT_EFFECT = 'none' as const;

export interface Statement {
  readonly id: string;
  readonly actorId: string;
  readonly actorKind: StatementActorKind;
  readonly content: string;
  readonly date: string;
  readonly note: string;
}

export function validateStatement(s: Statement): void {
  if (!s || typeof s.id !== 'string' || !s.id.trim()) throw new Error('Statement needs a non-empty id.');
  if (typeof s.actorId !== 'string' || !s.actorId.trim()) throw new Error('Statement needs a non-empty actor id.');
  if (!STATEMENT_ACTOR_KINDS.includes(s.actorKind)) throw new Error(`Unknown statement actor kind: ${String(s.actorKind)}.`);
  if (typeof s.content !== 'string' || !s.content.trim()) throw new Error('Statement needs non-empty content.');
  if (!isSimulationDate(s.date)) throw new Error('Statement date must be a valid simulation date.');
  if (typeof s.note !== 'string' || !s.note.trim()) throw new Error('Statement needs a note.');
}

export interface StatementReach {
  readonly status: AvailabilityStatus;
  /** Effective reach (0..10000 bps); null when not asserted. */
  readonly reachBps: number | null;
}

/** Reach is bounded by the actor's credibility and the audience's interest; unknown inputs are never zero. */
export function statementReach(credibilityBps: number | null, audienceInterestBps: number | null): StatementReach {
  if (credibilityBps === null || audienceInterestBps === null) return { status: 'unavailable', reachBps: null };
  if (!Number.isSafeInteger(credibilityBps) || credibilityBps < 0 || credibilityBps > 10000) throw new Error('credibilityBps must be a whole number between 0 and 10000.');
  if (!Number.isSafeInteger(audienceInterestBps) || audienceInterestBps < 0 || audienceInterestBps > 10000) throw new Error('audienceInterestBps must be a whole number between 0 and 10000.');
  return { status: 'computed', reachBps: Math.min(credibilityBps, audienceInterestBps) };
}
