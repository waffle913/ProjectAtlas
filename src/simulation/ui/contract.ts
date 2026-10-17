/**
 * 0.33.1 — Interface V1: interface/state contract.
 *
 * Pure interface/state contract (docs/interface-0.33.md). The UI observes the one
 * canonical `SimulationState` and issues explicit commands — it is never a source
 * of truth and never mutates state directly. Public reads are always allowed;
 * authorized reads and commands require real office authority; only commands
 * mutate. No `SimulationState` integration, no schema/migration, no scheduler.
 */

export const UI_VERSION = 'ui-0.33-v1' as const;

export const UI_OWNERS = Object.freeze({
  state: 'engine', // the one canonical SimulationState
  ui: 'ui',        // observes state + issues commands (never a source of truth)
} as const);

export const UI_ACTION_KINDS = Object.freeze(['public_read', 'authorized_read', 'command'] as const);
export type UIActionKind = typeof UI_ACTION_KINDS[number];

/** Whether the UI may perform this kind of action; only public reads are authority-free. */
export function canPerformUIAction(kind: UIActionKind, hasAuthority: boolean): boolean {
  if (!UI_ACTION_KINDS.includes(kind)) throw new Error(`Unknown UI action kind: ${String(kind)}.`);
  if (kind === 'public_read') return true;
  return hasAuthority === true;
}

/** Only a command mutates canonical state; reads never do. */
export function isMutatingUIAction(kind: UIActionKind): boolean {
  if (!UI_ACTION_KINDS.includes(kind)) throw new Error(`Unknown UI action kind: ${String(kind)}.`);
  return kind === 'command';
}
