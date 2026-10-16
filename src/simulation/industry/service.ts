/**
 * 0.28.4 — Industry V1: service sectors.
 *
 * Pure service-sector contract (docs/industry-0.28.md). A service is delivered,
 * not stocked: it has no material inventory, only capacity, personnel, cost,
 * revenue and material purchases. No new canonical state, no scheduler, no RNG,
 * no migration.
 *
 * Contract:
 * - a service is never turned into an arbitrary material stock; undelivered
 *   demand is a shortfall, not a stored quantity;
 * - delivery is bounded by service capacity and available personnel;
 * - `null` capacity is unavailable, never a fabricated zero.
 */

import { isWholeUsd } from '../finance/settlement';
import { INSTALLATION_STATUSES, type InstallationStatus } from '../resources/installation';

export interface ServiceSector {
  readonly id: string;
  /** Personnel required per unit of delivered service. */
  readonly personnelPerUnit: number;
  /** Deliverable units per month; null = unavailable. */
  readonly capacityPerMonth: number | null;
  /** Whole-USD operating cost per month. */
  readonly costPerMonth: number;
  /** Whole-USD price per delivered unit. */
  readonly pricePerUnit: number;
  /** Material purchases per month (product id -> quantity), consumed, not stocked. */
  readonly purchases: Readonly<Record<string, number>>;
  readonly status: InstallationStatus;
}

export function validateServiceSector(s: ServiceSector): void {
  if (!s || typeof s.id !== 'string' || !s.id.trim()) throw new Error('Service sector needs a non-empty id.');
  if (!isWholeUsd(s.personnelPerUnit)) throw new Error('personnelPerUnit must be a non-negative whole number.');
  if (s.capacityPerMonth !== null && (!isWholeUsd(s.capacityPerMonth) || s.capacityPerMonth <= 0)) throw new Error('capacityPerMonth must be a positive whole number or null.');
  if (!isWholeUsd(s.costPerMonth) || !isWholeUsd(s.pricePerUnit)) throw new Error('Cost and price must be non-negative whole-USD amounts.');
  for (const [id, qty] of Object.entries(s.purchases)) {
    if (!id.trim()) throw new Error('Purchases need non-empty product ids.');
    if (!isWholeUsd(qty)) throw new Error(`Purchase ${id} must be a non-negative whole quantity.`);
  }
  if (!INSTALLATION_STATUSES.includes(s.status)) throw new Error(`Unknown status: ${String(s.status)}.`);
}

export interface ServiceDelivery {
  readonly delivered: number;
  readonly shortfall: number;
  readonly revenue: number;
  readonly personnelUsed: number;
}

/** Deliver up to `demandUnits`, bounded by capacity and available personnel; the rest is a shortfall, never stock. */
export function deliverService(s: ServiceSector, demandUnits: number, availablePersonnel: number): ServiceDelivery {
  validateServiceSector(s);
  if (!isWholeUsd(demandUnits)) throw new Error('Demand must be a non-negative whole number.');
  if (!isWholeUsd(availablePersonnel)) throw new Error('Available personnel must be a non-negative whole number.');
  if (s.status !== 'operating' || s.capacityPerMonth === null) return { delivered: 0, shortfall: demandUnits, revenue: 0, personnelUsed: 0 };
  const capacityBound = s.personnelPerUnit > 0 ? Math.floor(availablePersonnel / s.personnelPerUnit) : s.capacityPerMonth;
  const delivered = Math.min(demandUnits, s.capacityPerMonth, capacityBound);
  return { delivered, shortfall: demandUnits - delivered, revenue: delivered * s.pricePerUnit, personnelUsed: delivered * s.personnelPerUnit };
}
