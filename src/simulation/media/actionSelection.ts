/**
 * 0.32.7 — Media V2: political action selection.
 *
 * Pure action-selection contract (docs/media-0.32.md). An AI government selects
 * an action by a deterministic comparison of expected net value and confidence,
 * breaking ties by id. Unavailable choices are excluded; if nothing is positive
 * or everything is unavailable, the government chooses not to act (null). No
 * reaction is fixed by "what the player does". No `SimulationState` integration,
 * no schema/migration, no scheduler, no RNG.
 */

export const ACTION_SELECTION_VERSION = 'action-selection-0.32-v1' as const;

export interface ActionChoice {
  readonly id: string;
  readonly optionId: string;
  /** Expected net value in basis points (signed); null = unavailable. */
  readonly expectedNetBps: number | null;
  /** Confidence (0..10000 bps); null = unavailable. */
  readonly confidenceBps: number | null;
}

export function validateActionChoice(c: ActionChoice): void {
  if (!c || typeof c.id !== 'string' || !c.id.trim()) throw new Error('Action choice needs a non-empty id.');
  if (typeof c.optionId !== 'string' || !c.optionId.trim()) throw new Error('Action choice needs a non-empty option id.');
  if (c.expectedNetBps !== null && (!Number.isSafeInteger(c.expectedNetBps) || c.expectedNetBps < -10000 || c.expectedNetBps > 10000)) throw new Error('expectedNetBps must be a whole number between -10000 and 10000 or null.');
  if (c.confidenceBps !== null && (!Number.isSafeInteger(c.confidenceBps) || c.confidenceBps < 0 || c.confidenceBps > 10000)) throw new Error('confidenceBps must be a whole number between 0 and 10000 or null.');
}

/** Deterministic selection: max (expectedNetBps * confidenceBps), ties by id; null = choose not to act. */
export function selectAction(choices: readonly ActionChoice[]): string | null {
  const seen = new Set<string>();
  let best: { key: number; id: string } | null = null;
  for (const c of choices) {
    validateActionChoice(c);
    if (seen.has(c.id)) throw new Error(`Duplicate action choice id ${c.id}.`);
    seen.add(c.id);
    if (c.expectedNetBps === null || c.confidenceBps === null) continue; // unavailable → excluded
    const key = c.expectedNetBps * c.confidenceBps;
    if (key <= 0) continue; // not positive → not selected
    if (best === null || key > best.key || (key === best.key && c.id < best.id)) best = { key, id: c.id };
  }
  return best?.id ?? null;
}
