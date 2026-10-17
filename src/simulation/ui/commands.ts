/**
 * 0.33.6 — Interface V1: commands and powers.
 *
 * Command authorization derives from the canonical 0.14/0.23 office authority
 * model — a reconciled parliamentary head of government or a reconciled
 * presidential head of state — read from the actual `SimulationState` person
 * and office records. A caller-supplied mandate label is vocabulary only: it is
 * validated for well-formedness and mapped to a canonical basis for display, but
 * it NEVER grants authority. Unknown or malformed mandates are rejected
 * explicitly; unresolved authority fails closed. No second authority system.
 */

import type { SimulationState } from '../../types';
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

/** The canonical 0.14 reconciled authority basis this mandate corresponds to; null for unresolved.
 *  Vocabulary/display mapping only — this function never grants authority. */
export function canonicalCommandAuthorityBasisFor(m: CommandMandate): 'sourced_parliamentary_head_of_government' | 'sourced_presidential_head_of_state' | null {
  validateCommandMandate(m);
  if (m.basis === 'head_of_government') return 'sourced_parliamentary_head_of_government';
  if (m.basis === 'presidential_head_of_state') return 'sourced_presidential_head_of_state';
  return null;
}

/** Command authority derives from the canonical office actually held by the person in
 *  `SimulationState` — never from a caller-supplied mandate label. Unresolved/absent
 *  authority fails closed. */
export function canCommand(state: SimulationState, personId: string, countryId: string): boolean {
  const person = state.governance.persons[personId];
  if (!person || person.status !== 'active' || person.office?.countryId !== countryId) return false;
  const basis = person.office.evidence?.authorityBasis;
  return basis === 'sourced_parliamentary_head_of_government' || basis === 'sourced_presidential_head_of_state';
}

export interface UICommand {
  readonly id: string;
  readonly domain: string;
  /** Vocabulary label only; authorization comes from the canonical person/office, never this label. */
  readonly mandate: CommandMandate;
  readonly note: string;
}

export function validateUICommand(state: SimulationState, personId: string, countryId: string, c: UICommand): void {
  if (!c || typeof c.id !== 'string' || !c.id.trim()) throw new Error('UI command needs a non-empty id.');
  if (typeof c.domain !== 'string' || !(UI_DOMAINS as readonly string[]).includes(c.domain)) throw new Error(`Unknown UI domain: ${String(c.domain)}.`);
  validateCommandMandate(c.mandate);
  if (!canCommand(state, personId, countryId)) throw new Error('A UI command needs an office that actually holds authority; unresolved authority fails closed.');
  if (typeof c.note !== 'string' || !c.note.trim()) throw new Error('UI command needs a note.');
}
