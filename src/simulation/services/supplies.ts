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
import type { SimulationState } from '../../types';
import type { ServiceFamily } from './contract';
import type { TradeCategory } from '../trade/model';

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

/**
 * Static registry of admitted service supply requirements keyed by service
 * family. EMPTY by design: no admitted real supply-requirement data exists for
 * 2026-01-01, and no synthetic entry is invented here. An entry's `itemId` names
 * a canonical `TradeCategory` whose `TradeStock` is the sole physical source.
 */
export const SERVICE_SUPPLY_REQUIREMENTS: Readonly<Partial<Record<ServiceFamily, readonly SupplyRequirement[]>>> = Object.freeze({});

/** Meet a service family's admitted supply requirements from the canonical
 *  `TradeStock`. Returns `undefined` when no requirement is admitted or no
 *  required item has a configured store (unavailable is never a zero-binding
 *  stock). A shortfall is a supply rupture, never a fabricated quantity. */
export function meetServiceSupplies(
  state: SimulationState,
  countryId: string,
  family: ServiceFamily,
  registry: Readonly<Partial<Record<ServiceFamily, readonly SupplyRequirement[]>>> = SERVICE_SUPPLY_REQUIREMENTS,
): SupplyOutcome[] | undefined {
  const requirements = registry[family];
  if (!requirements || requirements.length === 0) return undefined;
  const markets = state.trade.countries[countryId]?.markets ?? {};
  const known = requirements.filter((r) => markets[r.itemId as TradeCategory]?.stock !== undefined);
  if (known.length === 0) return undefined; // no admitted store -> no binding
  const available = Object.fromEntries(known.map((r) => [r.itemId, markets[r.itemId as TradeCategory]!.stock!.quantity]));
  return meetSupplies(known, available);
}

/** Supply factor (bps) bounding a service family's delivery: the minimum over
 *  admitted requirements of delivered/required. 10,000 = no rupture; lower =
 *  bounded delivery. `undefined` = no admitted requirement (no binding). */
export function serviceSupplyFactorBps(
  state: SimulationState,
  countryId: string,
  family: ServiceFamily,
  registry: Readonly<Partial<Record<ServiceFamily, readonly SupplyRequirement[]>>> = SERVICE_SUPPLY_REQUIREMENTS,
): number | undefined {
  const outcomes = meetServiceSupplies(state, countryId, family, registry);
  if (!outcomes || outcomes.length === 0) return undefined;
  let factor = 10000;
  for (const o of outcomes) {
    const required = o.delivered + o.rupture;
    factor = Math.min(factor, required ? Math.floor((o.delivered * 10000) / required) : 0);
  }
  return factor;
}
