/**
 * 0.33.6 — Interface V1: commands and powers.
 *
 * Pure command contract (docs/interface-0.33.md). A UI command is authorized only
 * by the office actually held (0.14); an unresolved authority fails closed and a
 * command without authority is refused. No `SimulationState` integration, no
 * schema/migration, no scheduler.
 */

import { canPerformUIAction } from './contract';

export type CommandMandate =
  | { readonly basis: 'head_of_government' }
  | { readonly basis: 'presidential_head_of_state' }
  | { readonly basis: 'unresolved' };

export function canCommand(m: CommandMandate): boolean {
  return canPerformUIAction('command', m.basis !== 'unresolved');
}

export interface UICommand {
  readonly id: string;
  readonly domain: string;
  readonly mandate: CommandMandate;
  readonly note: string;
}

export function validateUICommand(c: UICommand): void {
  if (!c || typeof c.id !== 'string' || !c.id.trim()) throw new Error('UI command needs a non-empty id.');
  if (typeof c.domain !== 'string' || !c.domain.trim()) throw new Error('UI command needs a non-empty domain.');
  if (!canCommand(c.mandate)) throw new Error('A UI command needs a mandate that actually holds authority; unresolved fails closed.');
  if (typeof c.note !== 'string' || !c.note.trim()) throw new Error('UI command needs a note.');
}
