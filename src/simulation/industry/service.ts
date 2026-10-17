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
 * - delivery is bounded by service capacity, available personnel, available
 *   funds (the monthly operating cost) and the availability of the declared
 *   material purchases — a service cannot operate through a shortage;
 * - `null` capacity is unavailable and yields an `unavailable` result, never a
 *   fabricated zero or shortage.
 */

import { isWholeUsd } from '../finance/settlement';
import { checkedMul } from '../safeMath';
import type { AvailabilityStatus } from '../availability';
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
  readonly status: AvailabilityStatus;
  readonly delivered: number;
  /** Meaningful only when status === 'computed'; null means "not asserted". */
  readonly shortfall: number | null;
  readonly revenue: number;
  readonly personnelUsed: number;
  /** Material purchases actually consumed this month (zero when the service could not operate). */
  readonly purchasesUsed: Readonly<Record<string, number>>;
}

/** Available non-material resources for a service month. */
export interface ServiceResources {
  /** Whole-USD funds available to cover the monthly operating cost. */
  readonly funds: number;
  /** Known available quantities of the service's material purchases. */
  readonly purchases: Readonly<Record<string, number>>;
}

const emptyPurchases = (s: ServiceSector): Record<string, number> => Object.fromEntries(Object.keys(s.purchases).map((id) => [id, 0]));

/**
 * Deliver up to `demandUnits`, bounded by capacity, personnel, funds (monthly
 * operating cost) and material purchases; the rest is a shortfall, never stock.
 * A service cannot operate through a budget or purchase shortage.
 */
export function deliverService(s: ServiceSector, demandUnits: number, availablePersonnel: number, resources: ServiceResources): ServiceDelivery {
  validateServiceSector(s);
  if (!isWholeUsd(demandUnits)) throw new Error('Demand must be a non-negative whole number.');
  if (!isWholeUsd(availablePersonnel)) throw new Error('Available personnel must be a non-negative whole number.');
  if (!resources || !isWholeUsd(resources.funds)) throw new Error('Available funds must be a non-negative whole-USD amount.');
  for (const [id, qty] of Object.entries(resources.purchases)) {
    if (!isWholeUsd(qty)) throw new Error(`Available purchase ${id} must be a non-negative whole quantity.`);
  }

  if (s.status === 'paused' || s.status === 'planned') return { status: 'paused', delivered: 0, shortfall: null, revenue: 0, personnelUsed: 0, purchasesUsed: emptyPurchases(s) };
  if (s.status === 'decommissioned' || s.status === 'unavailable') return { status: 'unavailable', delivered: 0, shortfall: null, revenue: 0, personnelUsed: 0, purchasesUsed: emptyPurchases(s) };
  if (s.capacityPerMonth === null) return { status: 'unavailable', delivered: 0, shortfall: null, revenue: 0, personnelUsed: 0, purchasesUsed: emptyPurchases(s) };

  // Causal gates: the service cannot operate without its monthly cost or material purchases.
  const fundsOk = resources.funds >= s.costPerMonth;
  const purchasesOk = Object.entries(s.purchases).every(([id, qty]) => (resources.purchases[id] ?? 0) >= qty);
  if (!fundsOk || !purchasesOk) return { status: 'computed', delivered: 0, shortfall: demandUnits, revenue: 0, personnelUsed: 0, purchasesUsed: emptyPurchases(s) };

  const capacityBound = s.personnelPerUnit > 0 ? Math.floor(availablePersonnel / s.personnelPerUnit) : s.capacityPerMonth;
  const delivered = Math.min(demandUnits, s.capacityPerMonth, capacityBound);
  return {
    status: 'computed',
    delivered,
    shortfall: demandUnits - delivered,
    revenue: checkedMul(delivered, s.pricePerUnit),
    personnelUsed: checkedMul(delivered, s.personnelPerUnit),
    purchasesUsed: { ...s.purchases },
  };
}
