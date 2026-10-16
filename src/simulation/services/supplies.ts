/**
 * 0.29.3 — Public services V2: medicines, consumables, energy, maintenance.
 *
 * Pure supply contract (docs/services-0.29.md). A service's physical needs
 * (medicines, consumables, energy, maintenance) are met from available stock;
 * the shortfall is a supply rupture, never a fabricated quantity. No new
 * canonical state, no scheduler, no RNG, no migration — the canonical stock
 * store remains `state.trade` `TradeStock`.
 */

import { isWholeUsd } from '../finance/settlement';

export interface SupplyRequirement {
  readonly id: string;
  /** The item needed (medicine/consumable/energy/maintenance). */
  readonly itemId: string;
  /** Required quantity per month. */
  readonly requiredPerMonth: number;
  readonly essential: boolean;
}

export function validateSupplyRequirement(r: SupplyRequirement): void {
  if (!r || typeof r.id !== 'string' || !r.id.trim()) throw new Error('Supply requirement needs a non-empty id.');
  if (typeof r.itemId !== 'string' || !r.itemId.trim()) throw new Error('Supply requirement needs a non-empty item id.');
  if (!isWholeUsd(r.requiredPerMonth) || r.requiredPerMonth <= 0) throw new Error('requiredPerMonth must be a positive whole quantity.');
  if (typeof r.essential !== 'boolean') throw new Error('essential must be a boolean.');
}

export interface SupplyOutcome {
  readonly itemId: string;
  readonly delivered: number;
  readonly rupture: number;
}

/** Meet a requirement from available stock; the shortfall is a supply rupture. */
export function meetSupply(r: SupplyRequirement, available: number): SupplyOutcome {
  validateSupplyRequirement(r);
  if (!isWholeUsd(available)) throw new Error('Available must be a non-negative whole quantity.');
  const delivered = Math.min(r.requiredPerMonth, available);
  return { itemId: r.itemId, delivered, rupture: r.requiredPerMonth - delivered };
}

/** Meet a set of requirements; each is bounded by its available stock. */
export function meetSupplies(requirements: readonly SupplyRequirement[], available: Readonly<Record<string, number>>): SupplyOutcome[] {
  return requirements.map((r) => meetSupply(r, available[r.itemId] ?? 0));
}
