/**
 * 0.29.5 — Public services V2: housing.
 *
 * Pure housing contract (docs/services-0.29.md). Housing is a stock of dwelling
 * units with availability/quality/maintenance; allocation is bounded by
 * availability and the shortfall is a backlog, never a fabricated unit. Rent
 * rules stay out of scope until the human decides the gate. No new canonical
 * state, no scheduler, no RNG, no migration.
 *
 * Allocation returns the *next* stock (occupied units advanced), so a caller
 * that threads the returned stock forward cannot allocate the same units twice.
 */

import { isWholeUsd } from '../finance/settlement';
import { checkedAdd } from '../safeMath';
import { isRentRulesInScope } from './contract';

export interface HousingStock {
  readonly id: string;
  readonly regionId: string;
  readonly totalUnits: number;
  readonly occupiedUnits: number;
  /** Quality in bps (0–10,000); 10,000 = full quality. */
  readonly qualityBps: number;
  readonly maintenanceCostPerUnit: number;
}

export function validateHousingStock(h: HousingStock): void {
  if (!h || typeof h.id !== 'string' || !h.id.trim()) throw new Error('Housing stock needs a non-empty id.');
  if (typeof h.regionId !== 'string' || !h.regionId.trim()) throw new Error('Housing stock needs a non-empty permanent Region id.');
  if (!isWholeUsd(h.totalUnits) || !isWholeUsd(h.occupiedUnits)) throw new Error('Units must be non-negative whole numbers.');
  if (h.occupiedUnits > h.totalUnits) throw new Error('Occupied units cannot exceed total units.');
  if (!Number.isInteger(h.qualityBps) || h.qualityBps < 0 || h.qualityBps > 10000) throw new Error('qualityBps must be an integer in [0, 10000].');
  if (!isWholeUsd(h.maintenanceCostPerUnit)) throw new Error('maintenanceCostPerUnit must be a non-negative whole-USD amount.');
}

export const availableUnits = (h: HousingStock): number => h.totalUnits - h.occupiedUnits;

export interface HousingAllocation {
  readonly allocated: number;
  readonly backlog: number;
  /** The stock after this allocation is committed (occupied units advanced). */
  readonly next: HousingStock;
}

/** Allocate up to `demand`, bounded by available units; returns the committed next stock (no double-allocation when threaded). */
export function allocateHousing(h: HousingStock, demandUnits: number): HousingAllocation {
  validateHousingStock(h);
  if (!isWholeUsd(demandUnits)) throw new Error('Demand must be a non-negative whole number.');
  const allocated = Math.min(demandUnits, availableUnits(h));
  const next: HousingStock = { ...h, occupiedUnits: checkedAdd(h.occupiedUnits, allocated) };
  return { allocated, backlog: demandUnits - allocated, next };
}

/** Rent rules are BLOCKED_DESIGN until the human decides the gate; any rent application must fail closed. */
export function applyRent(_h: HousingStock, _units: number): never {
  if (!isRentRulesInScope()) throw new Error('Rent rules are BLOCKED_DESIGN until the housing rent-rules decision.');
  throw new Error('Rent rules are not implemented in 0.29.');
}
