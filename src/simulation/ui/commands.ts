/**
 * 0.33.6 — Interface V1: commands and powers.
 *
 * Command authorization derives from the canonical 0.14/0.23 office authority
 * model — a reconciled parliamentary head of government or a reconciled
 * presidential head of state. Unknown or malformed mandates are rejected
 * explicitly; unresolved authority fails closed. No second authority system.
 */

import { canPerformUIAction } from './contract';
import { UI_DOMAINS } from './navigation';

export type CommandMandate =
  | { readonly basis: 'head_of_government' }
  | { readonly basis: 'presidential_head_of_state' }
  | { readonly basis: 'unresolved' };

export function validateCommandMandate(m: CommandMandate): void {
  if (!m || typeof m !== 'object') throw new Error('Command mandate is required.');
  switch (m.basis) {
    case 'head_of_government':
    case 'presidential_head_of_state':
    case 'unresolved':
      break;
    default:
      throw new Error(`Unknown command mandate basis: ${String((m as { basis?: unknown }).basis)}.`);
  }
}

/** The canonical 0.14 reconciled authority basis this mandate corresponds to; null for unresolved. */
export function canonicalCommandAuthorityBasisFor(m: CommandMandate): 'sourced_parliamentary_head_of_government' | 'sourced_presidential_head_of_state' | null {
  validateCommandMandate(m);
  if (m.basis === 'head_of_government') return 'sourced_parliamentary_head_of_government';
  if (m.basis === 'presidential_head_of_state') return 'sourced_presidential_head_of_state';
  return null;
}

/** Command authority only from a resolved, canonical office basis; unknown throws, unresolved fails closed. */
export function canCommand(m: CommandMandate): boolean {
  validateCommandMandate(m);
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
  if (typeof c.domain !== 'string' || !(UI_DOMAINS as readonly string[]).includes(c.domain)) throw new Error(`Unknown UI domain: ${String(c.domain)}.`);
  if (!canCommand(c.mandate)) throw new Error('A UI command needs a mandate that actually holds authority; unresolved fails closed.');
  if (typeof c.note !== 'string' || !c.note.trim()) throw new Error('UI command needs a note.');
}
