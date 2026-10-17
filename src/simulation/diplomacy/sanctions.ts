/**
 * 0.31.3 — Diplomacy V2: sanctions, embargoes and dependencies.
 *
 * Pure coercion contract (docs/diplomacy-0.31.md). Sanctions, embargoes and
 * condemnations map onto the existing 0.18 international-action system — an
 * import-side or export-side restriction is explicit and never silently
 * misclassified; an intervention is a 0.19 military operation, never a trade
 * control. Circumvention is only representable when it is actually modelled —
 * it is not modelled here. No `SimulationState` integration, no
 * schema/migration, no scheduler, no RNG.
 */

import { TRADE_CATEGORIES, type TradeCategory } from '../trade/model';
import { canConductDiplomacy, type DiplomaticMandate } from './contract';
import { isSimulationDate } from '../date';

export const COERCION_KINDS = Object.freeze(['condemnation', 'sanction', 'embargo', 'intervention'] as const);
export type CoercionKind = typeof COERCION_KINDS[number];

/** Canonical owners: each coercion kind maps onto an existing system — no second sanctions system. */
export const COERCION_OWNERS: Readonly<Record<CoercionKind, string>> = Object.freeze({
  condemnation: 'international.actions', // 0.18 InternationalAction 'condemnation'
  sanction: 'international.actions',     // 0.18 import/export restriction (targeted)
  embargo: 'international.actions',      // 0.18 import/export restriction (broad)
  intervention: 'operations',            // 0.19 military operations — NOT a trade control
});

/** The 0.18 `InternationalAction` kind a coercion measure corresponds to; null for a non-trade control. */
export function internationalActionKindFor(kind: CoercionKind, direction: 'import' | 'export' | null): 'condemnation' | 'import_restriction' | 'export_restriction' | null {
  switch (kind) {
    case 'condemnation': return 'condemnation';
    case 'sanction':
    case 'embargo': return direction === 'export' ? 'export_restriction' : 'import_restriction';
    case 'intervention': return null;
    default: throw new Error(`Unknown coercion kind: ${String(kind)}.`);
  }
}

export interface CoercionMeasure {
  readonly id: string;
  readonly actorCountryId: string;
  readonly mandate: DiplomaticMandate;
  readonly targetCountryId: string;
  readonly kind: CoercionKind;
  /** Import/export side for sanction/embargo; null for condemnation/intervention. */
  readonly direction: 'import' | 'export' | null;
  /** Affected trade categories; required for sanction/embargo, empty for condemnation/intervention. */
  readonly categories: readonly TradeCategory[];
  readonly date: string;
  readonly note: string;
}

export function validateCoercionMeasure(m: CoercionMeasure): void {
  if (!m || typeof m.id !== 'string' || !m.id.trim()) throw new Error('Coercion measure needs a non-empty id.');
  if (typeof m.actorCountryId !== 'string' || !m.actorCountryId.trim()) throw new Error('Coercion measure needs a non-empty actor country id.');
  if (typeof m.targetCountryId !== 'string' || !m.targetCountryId.trim()) throw new Error('Coercion measure needs a non-empty target country id.');
  if (m.actorCountryId === m.targetCountryId) throw new Error('A coercion measure needs distinct actor and target.');
  if (!canConductDiplomacy(m.mandate)) throw new Error('A coercion measure needs a mandate that actually holds diplomatic power; unresolved authority fails closed.');
  if (!COERCION_KINDS.includes(m.kind)) throw new Error(`Unknown coercion kind: ${String(m.kind)}.`);
  if (!Array.isArray(m.categories) || !m.categories.every((c) => (TRADE_CATEGORIES as readonly string[]).includes(c))) {
    throw new Error('categories must be an array of known trade categories.');
  }
  if (m.kind === 'sanction' || m.kind === 'embargo') {
    if (m.direction !== 'import' && m.direction !== 'export') throw new Error('A sanction or embargo needs an import or export direction.');
    if (m.categories.length === 0) throw new Error('A sanction or embargo needs at least one affected trade category.');
  } else {
    if (m.direction !== null) throw new Error('A condemnation or intervention is not a trade control and must not carry a direction.');
    if (m.categories.length > 0) throw new Error('A condemnation or intervention is not a trade control and must not carry trade categories.');
  }
  if (!isSimulationDate(m.date)) throw new Error('Coercion measure date must be a valid simulation date.');
  if (typeof m.note !== 'string' || !m.note.trim()) throw new Error('Coercion measure needs a note.');
}
