/**
 * 0.29.2 — Public services V2: health and establishments.
 *
 * Pure health-establishment contract (docs/services-0.29.md). Care is delivered,
 * never stocked; capacity is beds or an admitted capacity (null = unavailable);
 * outcome is distinct from mere spending (delivery is bounded by capacity and
 * personnel, the shortfall becomes a queue/backlog). No new canonical state, no
 * scheduler, no RNG, no migration.
 *
 * A result is typed by availability: `unavailable` capacity yields an
 * `unavailable` result with no asserted backlog (unknown is not a shortage);
 * `paused` yields no delivery for a known non-capacity reason; only a `computed`
 * result asserts material delivered/backlog figures.
 */

import { isWholeUsd } from '../finance/settlement';
import { checkedMul } from '../safeMath';
import type { AvailabilityStatus } from '../availability';

export interface HealthEstablishment {
  readonly id: string;
  /** Permanent Region anchor. */
  readonly regionId: string;
  /** Admitted beds/capacity; null = unavailable. */
  readonly capacity: number | null;
  /** Personnel (persons) required per unit of delivered care. */
  readonly personnelPerUnit: number;
  readonly status: 'operating' | 'paused' | 'unavailable';
}

export function validateHealthEstablishment(h: HealthEstablishment): void {
  if (!h || typeof h.id !== 'string' || !h.id.trim()) throw new Error('Health establishment needs a non-empty id.');
  if (typeof h.regionId !== 'string' || !h.regionId.trim()) throw new Error('Health establishment needs a non-empty permanent Region id.');
  if (h.capacity !== null && (!isWholeUsd(h.capacity) || h.capacity <= 0)) throw new Error('capacity must be a positive whole number or null.');
  if (!isWholeUsd(h.personnelPerUnit)) throw new Error('personnelPerUnit must be a non-negative whole number.');
  if (!['operating', 'paused', 'unavailable'].includes(h.status)) throw new Error(`Unknown status: ${String(h.status)}.`);
}

export interface CareDelivery {
  readonly status: AvailabilityStatus;
  readonly delivered: number;
  /** Meaningful only when status === 'computed'; null means "not asserted" (unavailable/paused). */
  readonly backlog: number | null;
  readonly personnelUsed: number;
}

/** Deliver care bounded by capacity and available personnel; the shortfall is a queue/backlog, never stock. */
export function deliverCare(h: HealthEstablishment, demandUnits: number, availablePersonnel: number): CareDelivery {
  validateHealthEstablishment(h);
  if (!isWholeUsd(demandUnits)) throw new Error('Demand must be a non-negative whole number.');
  if (!isWholeUsd(availablePersonnel)) throw new Error('Available personnel must be a non-negative whole number.');
  if (h.status === 'paused') return { status: 'paused', delivered: 0, backlog: null, personnelUsed: 0 };
  if (h.status === 'unavailable' || h.capacity === null) return { status: 'unavailable', delivered: 0, backlog: null, personnelUsed: 0 };
  const personnelBound = h.personnelPerUnit > 0 ? Math.floor(availablePersonnel / h.personnelPerUnit) : h.capacity;
  const delivered = Math.min(demandUnits, h.capacity, personnelBound);
  return { status: 'computed', delivered, backlog: demandUnits - delivered, personnelUsed: checkedMul(delivered, h.personnelPerUnit) };
}
