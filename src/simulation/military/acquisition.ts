/**
 * 0.31.6 — Military V2: industry and acquisition.
 *
 * Pure acquisition contract (docs/diplomacy-0.31.md). Orders, financing,
 * factory capacity and delivery delays map onto their canonical owners (0.16
 * `MilitaryOrder` + funded/paidUsd, 0.28 industrial capacity, 0.26 finance) —
 * no second order or production store. Production is never instant: a computed
 * plan always takes at least one month, is bounded by factory capacity, and
 * requires full funding before it can start. No `SimulationState` integration,
 * no schema/migration, no scheduler, no RNG.
 */

import { isWholeUsd } from '../finance/settlement';
import { checkedMul } from '../safeMath';
import { isSimulationDate } from '../date';
import { MILITARY_ITEMS, type MilitaryItem } from './model';
import type { AvailabilityStatus } from '../availability';

export const ACQUISITION_VERSION = 'military-acquisition-0.31-v1' as const;

/** Canonical owners — no second order/factory/financing engine. */
export const ACQUISITION_OWNERS = Object.freeze({
  orders: 'military.orders', // 0.16 MilitaryOrder
  factory: 'industry',       // 0.28 industrial capacity
  financing: 'finance',      // 0.26 finance + 0.16 funded/paidUsd
} as const);

export interface AcquisitionOrder {
  readonly id: string;
  readonly item: MilitaryItem;
  /** Positive whole units to acquire. */
  readonly quantity: number;
  /** Factory capacity (units/month) from 0.28 industry; null = unavailable; 0 = documented zero capacity. */
  readonly factoryCapacityPerMonth: number | null;
  /** Committed funds (whole USD); null = not yet funded. */
  readonly fundedUsd: number | null;
  /** Whole USD per unit. */
  readonly unitCostUsd: number;
  readonly orderedOn: string;
  readonly note: string;
}

export function validateAcquisitionOrder(o: AcquisitionOrder): void {
  if (!o || typeof o.id !== 'string' || !o.id.trim()) throw new Error('Acquisition order needs a non-empty id.');
  if (!MILITARY_ITEMS.includes(o.item)) throw new Error(`Unknown military item: ${String(o.item)}.`);
  if (!isWholeUsd(o.quantity) || o.quantity <= 0) throw new Error('quantity must be a positive whole number.');
  if (o.factoryCapacityPerMonth !== null && !isWholeUsd(o.factoryCapacityPerMonth)) throw new Error('factoryCapacityPerMonth must be a non-negative whole number or null.');
  if (o.fundedUsd !== null && !isWholeUsd(o.fundedUsd)) throw new Error('fundedUsd must be a non-negative whole number or null.');
  if (!isWholeUsd(o.unitCostUsd) || o.unitCostUsd <= 0) throw new Error('unitCostUsd must be a positive whole number.');
  if (!isSimulationDate(o.orderedOn)) throw new Error('orderedOn must be a valid simulation date.');
  if (typeof o.note !== 'string' || !o.note.trim()) throw new Error('Acquisition order needs a note.');
}

export interface AcquisitionPlan {
  readonly status: AvailabilityStatus;
  /** Whether the order is fully funded; null = not asserted (unavailable). */
  readonly funded: boolean | null;
  readonly totalCostUsd: number | null;
  /** Whole months to complete; always >= 1 when computed (never instant); null otherwise. */
  readonly monthsToComplete: number | null;
}

/** Plan an order: capacity, funding and delay; production is never instant and never unfunded. */
export function planAcquisition(o: AcquisitionOrder): AcquisitionPlan {
  validateAcquisitionOrder(o);
  const totalCostUsd = checkedMul(o.quantity, o.unitCostUsd);
  if (o.factoryCapacityPerMonth === null) return { status: 'unavailable', funded: null, totalCostUsd, monthsToComplete: null };
  if (o.fundedUsd === null || o.fundedUsd < totalCostUsd) return { status: 'paused', funded: false, totalCostUsd, monthsToComplete: null };
  if (o.factoryCapacityPerMonth === 0) return { status: 'known_zero', funded: true, totalCostUsd, monthsToComplete: null };
  const months = Math.ceil(o.quantity / o.factoryCapacityPerMonth);
  return { status: 'computed', funded: true, totalCostUsd, monthsToComplete: Math.max(1, months) };
}
