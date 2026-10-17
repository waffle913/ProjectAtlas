/**
 * 0.31.5 — Military V2: support chain.
 *
 * Pure support-chain contract (docs/diplomacy-0.31.md). Fuels, ammunition,
 * parts, maintenance, transport and personnel map onto their canonical owners
 * (0.16 military stocks/personnel, 0.17 trade transport); purchase contracts and
 * military products come from the existing 0.16 orders and 0.28 industry — never
 * a second supply engine. Every link is typed by availability: an unknown
 * requirement or stock yields `unavailable`, never a fabricated rupture
 * (`unavailable != 0`). No `SimulationState` integration, no schema/migration,
 * no scheduler, no RNG.
 */

import { isWholeUsd } from '../finance/settlement';
import type { AvailabilityStatus } from '../availability';

export const SUPPORT_CHAIN_VERSION = 'military-support-0.31-v1' as const;

export const SUPPORT_KINDS = Object.freeze(['fuel', 'ammunition', 'parts', 'maintenance', 'transport', 'personnel'] as const);
export type SupportKind = typeof SUPPORT_KINDS[number];

/** Canonical owners of each support element — no second supply/stock engine. */
export const SUPPORT_OWNERS: Readonly<Record<SupportKind, string>> = Object.freeze({
  fuel: 'military.consumables',       // 0.16 ConsumableStock
  ammunition: 'military.consumables', // 0.16 ConsumableStock
  parts: 'military.equipment',        // 0.16 EquipmentStock maintenance
  maintenance: 'military.equipment',  // 0.16 maintenanceClock/backlogUnitMonths
  transport: 'trade',                 // 0.17 trade routes (logistics)
  personnel: 'military',              // 0.16 assignments/trainees
});

export interface SupportLink {
  readonly id: string;
  readonly kind: SupportKind;
  /** Required quantity per month; null = unavailable (never zero). */
  readonly requiredPerMonth: number | null;
  /** Available quantity (known stock/capacity); null = unavailable (never zero). */
  readonly available: number | null;
}

export function validateSupportLink(l: SupportLink): void {
  if (!l || typeof l.id !== 'string' || !l.id.trim()) throw new Error('Support link needs a non-empty id.');
  if (!SUPPORT_KINDS.includes(l.kind)) throw new Error(`Unknown support kind: ${String(l.kind)}.`);
  if (l.requiredPerMonth !== null && (!isWholeUsd(l.requiredPerMonth) || l.requiredPerMonth <= 0)) throw new Error('requiredPerMonth must be a positive whole number or null.');
  if (l.available !== null && !isWholeUsd(l.available)) throw new Error('available must be a non-negative whole number or null.');
}

export interface SupportDelivery {
  readonly status: AvailabilityStatus;
  /** Meaningful only when status === 'computed'; null otherwise. */
  readonly delivered: number | null;
  /** Meaningful only when status === 'computed'; null = not asserted (unavailable). */
  readonly rupture: number | null;
}

/** Deliver one link from known stock; an unavailable requirement or stock never fabricates a rupture. */
export function deliverSupportLink(l: SupportLink): SupportDelivery {
  validateSupportLink(l);
  if (l.requiredPerMonth === null || l.available === null) return { status: 'unavailable', delivered: null, rupture: null };
  const delivered = Math.min(l.requiredPerMonth, l.available);
  return { status: 'computed', delivered, rupture: l.requiredPerMonth - delivered };
}

export interface SupportChainDelivery {
  readonly status: AvailabilityStatus;
  readonly links: readonly SupportDelivery[];
}

/**
 * Deliver a whole support chain. If any link is unavailable, the chain is
 * unavailable (a chain with an unknown stage cannot be asserted complete);
 * otherwise every link is computed.
 */
export function deliverSupportChain(links: readonly SupportLink[]): SupportChainDelivery {
  const seen = new Set<string>();
  for (const l of links) {
    validateSupportLink(l);
    if (seen.has(l.id)) throw new Error(`Duplicate support link id ${l.id}; a link id must be unique.`);
    seen.add(l.id);
  }
  const deliveries = links.map(deliverSupportLink);
  const status: AvailabilityStatus = deliveries.some((d) => d.status !== 'computed') ? 'unavailable' : 'computed';
  return { status, links: deliveries };
}
