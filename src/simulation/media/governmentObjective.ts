/**
 * 0.32.6 — Media V2: government-objective model.
 *
 * Pure objective contract (docs/media-0.32.md). An AI government's objective is
 * modelled from a political issue with a priority and an ideological basis, never
 * a duplicate of the player's power or of the canonical government. An unknown
 * priority is `unavailable`, never zero. No `SimulationState` integration, no
 * schema/migration, no scheduler, no RNG.
 */

export const GOVERNMENT_OBJECTIVE_VERSION = 'government-objective-0.32-v1' as const;

/** Canonical owners of an objective's inputs — no second government/ideology engine. */
export const OBJECTIVE_OWNERS = Object.freeze({
  ideology: 'politics',  // 0.13 party platform
  mandate: 'governance', // 0.14 office
  resources: 'fiscal',   // 0.11 budget
} as const);

export const IDEOLOGICAL_BASES = Object.freeze(['sourced', 'modelled', 'unavailable'] as const);
export type IdeologicalBasis = typeof IDEOLOGICAL_BASES[number];

export interface GovernmentObjective {
  readonly id: string;
  readonly countryId: string;
  /** A 0.13 political issue id (goal). */
  readonly issueId: string;
  /** Priority (0..10000 bps); null = unavailable. */
  readonly priorityBps: number | null;
  readonly ideologicalBasis: IdeologicalBasis;
  readonly limitation: string;
}

export function validateGovernmentObjective(o: GovernmentObjective): void {
  if (!o || typeof o.id !== 'string' || !o.id.trim()) throw new Error('Government objective needs a non-empty id.');
  if (typeof o.countryId !== 'string' || !o.countryId.trim()) throw new Error('Government objective needs a non-empty country id.');
  if (typeof o.issueId !== 'string' || !o.issueId.trim()) throw new Error('Government objective needs a non-empty issue id.');
  if (o.priorityBps !== null && (!Number.isSafeInteger(o.priorityBps) || o.priorityBps < 0 || o.priorityBps > 10000)) throw new Error('priorityBps must be a whole number between 0 and 10000 or null.');
  if (!IDEOLOGICAL_BASES.includes(o.ideologicalBasis)) throw new Error(`Unknown ideological basis: ${String(o.ideologicalBasis)}.`);
  if (typeof o.limitation !== 'string' || !o.limitation.trim()) throw new Error('Government objective needs a limitation.');
}
