/**
 * 0.29.3 — Public services V2: medicines, consumables, energy, maintenance.
 *
 * Pure supply contract (docs/services-0.29.md). A service's physical needs
 * (medicines, consumables, energy, maintenance) are met from available stock;
 * the shortfall is a supply rupture, never a fabricated quantity. No new
 * canonical state, no scheduler, no RNG, no migration — the canonical stock
 * store remains `state.trade` `TradeStock`.
 *
 * A set of requirements is met transactionally: the available stock of one
 * `itemId` is shared across all requirements on that item, so it is never
 * double-attributed. Allocation is deterministic — essential requirements are
 * served first (stable within each group), then non-essential, in input order.
 * Duplicate requirement ids are ambiguous and fail closed.
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

/** Meet a single requirement from a known available quantity; the shortfall is a supply rupture. */
export function meetSupply(r: SupplyRequirement, available: number): SupplyOutcome {
  validateSupplyRequirement(r);
  if (!isWholeUsd(available)) throw new Error('Available must be a non-negative whole quantity.');
  const delivered = Math.min(r.requiredPerMonth, available);
  return { itemId: r.itemId, delivered, rupture: r.requiredPerMonth - delivered };
}

/**
 * Meet a set of requirements transactionally against shared available stock.
 * `available` is the caller's known stock per item (absence = a documented zero).
 * Allocation is essential-first (stable), so a shared item is never attributed
 * to more than one requirement beyond what is actually in stock.
 */
export function meetSupplies(
  requirements: readonly SupplyRequirement[],
  available: Readonly<Record<string, number>>,
): SupplyOutcome[] {
  for (const r of requirements) validateSupplyRequirement(r);
  for (const [id, qty] of Object.entries(available)) {
    if (!isWholeUsd(qty)) throw new Error(`Available stock ${id} must be a non-negative whole quantity.`);
  }
  const seen = new Set<string>();
  for (const r of requirements) {
    if (seen.has(r.id)) throw new Error(`Ambiguous duplicate supply requirement id ${r.id}; a requirement id must be unique.`);
    seen.add(r.id);
  }

  // Essential-first, stable within each group (Array.prototype.sort is stable).
  const order = requirements
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.essential ? 1 : 0) - (a.r.essential ? 1 : 0) || a.i - b.i);

  const remaining = new Map<string, number>(Object.entries(available));
  const byIndex = new Map<number, SupplyOutcome>();
  for (const { r, i } of order) {
    const inStock = remaining.get(r.itemId) ?? 0;
    const delivered = Math.min(r.requiredPerMonth, inStock);
    remaining.set(r.itemId, inStock - delivered);
    byIndex.set(i, { itemId: r.itemId, delivered, rupture: r.requiredPerMonth - delivered });
  }
  // Return outcomes in the original input order so indexes align with the input.
  return requirements.map((_, i) => byIndex.get(i)!);
}
