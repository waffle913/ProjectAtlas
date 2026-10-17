/**
 * 0.33.7–0.33.9 — Interface V1: decisions, consequences, time and gameplay paths.
 *
 * Pure frame contract (docs/interface-0.33.md). A decision's consequences are
 * explained with uncertainty and provenance; time is displayed without a
 * mandatory hourly simulation, and only grave events may pause. Gameplay paths
 * (governing, opposition, succession, crisis, war, budget) are named without
 * exposing non-existent engine functions. No `SimulationState` integration, no
 * schema/migration, no scheduler.
 */

export const GAMEPLAY_PATHS = Object.freeze(['governing', 'opposition', 'succession', 'crisis', 'war', 'budget'] as const);
export type GameplayPath = typeof GAMEPLAY_PATHS[number];

export interface ConsequenceView {
  readonly id: string;
  readonly decisionId: string;
  /** Uncertainty/confidence (0..10000 bps); null = unavailable. */
  readonly confidenceBps: number | null;
  readonly explanation: string;
}

export function validateConsequenceView(c: ConsequenceView): void {
  if (!c || typeof c.id !== 'string' || !c.id.trim()) throw new Error('Consequence view needs a non-empty id.');
  if (typeof c.decisionId !== 'string' || !c.decisionId.trim()) throw new Error('Consequence view needs a non-empty decision id.');
  if (c.confidenceBps !== null && (!Number.isSafeInteger(c.confidenceBps) || c.confidenceBps < 0 || c.confidenceBps > 10000)) throw new Error('confidenceBps must be a whole number between 0 and 10000 or null.');
  if (typeof c.explanation !== 'string' || !c.explanation.trim()) throw new Error('Consequence view needs an explanation.');
}

/** Only a grave or urgent notification may pause; routine/important alerts never interrupt. */
export function mayPause(alertSeverity: 'routine' | 'important' | 'urgent' | 'grave'): boolean {
  return alertSeverity === 'grave' || alertSeverity === 'urgent';
}
