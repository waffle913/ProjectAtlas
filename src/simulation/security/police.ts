/**
 * 0.30.5 — Internal security V1: police.
 *
 * Pure police contract (docs/demography-0.30.md). Police resources stay in their
 * canonical owners (personnel = socioeconomy, stations = 0.24 assets, budget =
 * fiscal) — no second population, asset store or budget. A legal order is
 * authorized only by the office/institution that actually holds police power
 * under the 0.14/0.23 model; unresolved authority fails closed. Deployment is
 * bounded by real personnel availability and typed by availability: an
 * unavailable/paused station never fabricates a shortage (`unavailable != 0`).
 * No new canonical state, no scheduler, no RNG, no migration.
 */

import { isWholeUsd } from '../finance/settlement';
import { isSimulationDate } from '../date';
import type { AvailabilityStatus } from '../availability';

/** Canonical owners of police resources — no second population/asset/budget. */
export const POLICE_RESOURCE_OWNERS = Object.freeze({
  personnel: 'socioeconomy',
  stations: 'assets',
  budget: 'fiscal',
} as const);

export const POLICE_ORDER_KINDS = Object.freeze([
  'public_order', 'protection', 'patrol', 'emergency_enforcement',
] as const);
export type PoliceOrderKind = typeof POLICE_ORDER_KINDS[number];

/**
 * Who holds the power to direct the police. Maps to the existing 0.14 office
 * model: a parliamentary head of government (the reconciled executive) or a
 * presidential head of state (whose office is the reconciled executive).
 * Ministers — including the interior portfolio — hold no police power under the
 * current model (the 0.23 interior minister only makes an *advisory*
 * end-emergency recommendation), so no ministerial basis is represented.
 * `unresolved` fails closed — authority is never invented.
 */
export type PoliceAuthority =
  | { readonly basis: 'head_of_government' }
  | { readonly basis: 'presidential_head_of_state' }
  | { readonly basis: 'unresolved' };

export function validatePoliceAuthority(a: PoliceAuthority): void {
  if (!a || typeof a !== 'object') throw new Error('Police authority is required.');
  switch (a.basis) {
    case 'head_of_government':
    case 'presidential_head_of_state':
    case 'unresolved':
      break;
    default:
      throw new Error(`Unknown police authority basis: ${String((a as { basis?: unknown }).basis)}.`);
  }
}

/** An office/institution holds police power only if its authority is resolved; never inferred. */
export function canDirectPolice(a: PoliceAuthority): boolean {
  validatePoliceAuthority(a);
  return a.basis !== 'unresolved';
}

export interface PoliceOrder {
  readonly id: string;
  readonly countryId: string;
  /** Permanent Region anchor. */
  readonly regionId: string;
  readonly kind: PoliceOrderKind;
  readonly authority: PoliceAuthority;
  /** True only when the constitution emergency restriction `policePowersEnhanced` is actually active. */
  readonly emergencyPowersActive: boolean;
  readonly date: string;
  readonly note: string;
}

export function validatePoliceOrder(o: PoliceOrder): void {
  if (!o || typeof o.id !== 'string' || !o.id.trim()) throw new Error('Police order needs a non-empty id.');
  if (typeof o.countryId !== 'string' || !o.countryId.trim()) throw new Error('Police order needs a non-empty country id.');
  if (typeof o.regionId !== 'string' || !o.regionId.trim()) throw new Error('Police order needs a non-empty permanent Region id.');
  if (!POLICE_ORDER_KINDS.includes(o.kind)) throw new Error(`Unknown police order kind: ${String(o.kind)}.`);
  if (!canDirectPolice(o.authority)) throw new Error('A police order needs an authority that actually holds police power; unresolved authority fails closed.');
  if (typeof o.emergencyPowersActive !== 'boolean') throw new Error('emergencyPowersActive must be a boolean.');
  if (o.kind === 'emergency_enforcement' && !o.emergencyPowersActive) {
    throw new Error('An emergency_enforcement order requires active emergency police powers.');
  }
  if (!isSimulationDate(o.date)) throw new Error('Police order date must be a valid simulation date.');
  if (typeof o.note !== 'string' || !o.note.trim()) throw new Error('Police order needs a note.');
}

export interface PoliceStation {
  readonly id: string;
  /** Permanent Region anchor. */
  readonly regionId: string;
  /** Whole persons on strength; null = unavailable; 0 = documented zero strength. */
  readonly personnel: number | null;
  readonly status: 'operating' | 'paused' | 'unavailable';
}

export function validatePoliceStation(s: PoliceStation): void {
  if (!s || typeof s.id !== 'string' || !s.id.trim()) throw new Error('Police station needs a non-empty id.');
  if (typeof s.regionId !== 'string' || !s.regionId.trim()) throw new Error('Police station needs a non-empty permanent Region id.');
  if (s.personnel !== null && !isWholeUsd(s.personnel)) throw new Error('personnel must be a non-negative whole number or null.');
  if (!['operating', 'paused', 'unavailable'].includes(s.status)) throw new Error(`Unknown status: ${String(s.status)}.`);
}

export interface PoliceDeployment {
  readonly status: AvailabilityStatus;
  readonly deployed: number;
  /** Meaningful only when status === 'computed'; null = not asserted (unavailable/paused). */
  readonly backlog: number | null;
}

/** Deploy personnel to an order, bounded by station strength and available personnel. */
export function deployPolice(station: PoliceStation, personnelRequired: number, availablePersonnel: number | null): PoliceDeployment {
  validatePoliceStation(station);
  if (!isWholeUsd(personnelRequired)) throw new Error('personnelRequired must be a non-negative whole number.');
  if (availablePersonnel !== null && !isWholeUsd(availablePersonnel)) throw new Error('availablePersonnel must be a non-negative whole number or null.');
  if (station.status === 'paused') return { status: 'paused', deployed: 0, backlog: null };
  if (station.status === 'unavailable' || station.personnel === null) return { status: 'unavailable', deployed: 0, backlog: null };
  if (availablePersonnel === null) return { status: 'unavailable', deployed: 0, backlog: null };
  const deployed = Math.min(personnelRequired, station.personnel, availablePersonnel);
  return { status: 'computed', deployed, backlog: personnelRequired - deployed };
}
