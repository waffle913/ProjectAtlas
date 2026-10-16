/** Deliver transport bounded by capacity, energy and personnel; the shortfall is a backlog. */

import { isWholeUsd } from '../finance/settlement';

export interface TransportAsset {
  readonly id: string;
  readonly regionId: string;
  /** Reference to the underlying 0.24 asset (never a second asset store). */
  readonly assetId: string;
  /** Admitted capacity (trips/units per month); null = unavailable. */
  readonly capacityPerMonth: number | null;
  readonly energyPerUnit: number;
  readonly personnelPerUnit: number;
  readonly status: 'operating' | 'paused' | 'unavailable';
}

export function validateTransportAsset(t: TransportAsset): void {
  if (!t || typeof t.id !== 'string' || !t.id.trim()) throw new Error('Transport asset needs a non-empty id.');
  if (typeof t.regionId !== 'string' || !t.regionId.trim()) throw new Error('Transport asset needs a non-empty permanent Region id.');
  if (typeof t.assetId !== 'string' || !t.assetId.trim()) throw new Error('Transport asset needs a non-empty 0.24 asset id.');
  if (t.capacityPerMonth !== null && (!isWholeUsd(t.capacityPerMonth) || t.capacityPerMonth <= 0)) throw new Error('capacityPerMonth must be a positive whole number or null.');
  if (!isWholeUsd(t.energyPerUnit) || !isWholeUsd(t.personnelPerUnit)) throw new Error('energyPerUnit and personnelPerUnit must be non-negative whole numbers.');
  if (!['operating', 'paused', 'unavailable'].includes(t.status)) throw new Error(`Unknown status: ${String(t.status)}.`);
}

export interface TransportDelivery {
  readonly delivered: number;
  readonly shortfall: number;
  readonly energyUsed: number;
  readonly personnelUsed: number;
}

/** Deliver transport bounded by capacity, energy and personnel; the shortfall is a backlog. */
export function deliverTransport(t: TransportAsset, demandUnits: number, energyAvailable: number, personnelAvailable: number): TransportDelivery {
  validateTransportAsset(t);
  if (!isWholeUsd(demandUnits) || !isWholeUsd(energyAvailable) || !isWholeUsd(personnelAvailable)) {
    throw new Error('Demand, energy and personnel must be non-negative whole numbers.');
  }
  if (t.status !== 'operating' || t.capacityPerMonth === null) return { delivered: 0, shortfall: demandUnits, energyUsed: 0, personnelUsed: 0 };
  const energyBound = t.energyPerUnit > 0 ? Math.floor(energyAvailable / t.energyPerUnit) : t.capacityPerMonth;
  const personnelBound = t.personnelPerUnit > 0 ? Math.floor(personnelAvailable / t.personnelPerUnit) : t.capacityPerMonth;
  const delivered = Math.min(demandUnits, t.capacityPerMonth, energyBound, personnelBound);
  return { delivered, shortfall: demandUnits - delivered, energyUsed: delivered * t.energyPerUnit, personnelUsed: delivered * t.personnelPerUnit };
}
