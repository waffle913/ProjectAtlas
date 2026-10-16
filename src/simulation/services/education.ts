/**
 * 0.29.4 — Public services V2: education and training.
 *
 * Pure education contract (docs/services-0.29.md). Enrolment is delivered, never
 * stocked; capacity is admitted seats (`null` = unavailable); a pathway takes
 * time — skills/labour effects are temporal, never instant from spending. No
 * new canonical state, no scheduler, no RNG, no migration.
 *
 * A result is typed by availability: `unavailable` capacity yields an
 * `unavailable` result with no asserted backlog (unknown is not a shortage).
 */

import { isWholeUsd } from '../finance/settlement';
import { checkedMul } from '../safeMath';
import type { AvailabilityStatus } from '../availability';

export interface EducationEstablishment {
  readonly id: string;
  readonly regionId: string;
  /** Admitted seats/capacity; null = unavailable. */
  readonly capacity: number | null;
  readonly personnelPerUnit: number;
  readonly status: 'operating' | 'paused' | 'unavailable';
}

export function validateEducationEstablishment(e: EducationEstablishment): void {
  if (!e || typeof e.id !== 'string' || !e.id.trim()) throw new Error('Education establishment needs a non-empty id.');
  if (typeof e.regionId !== 'string' || !e.regionId.trim()) throw new Error('Education establishment needs a non-empty permanent Region id.');
  if (e.capacity !== null && (!isWholeUsd(e.capacity) || e.capacity <= 0)) throw new Error('capacity must be a positive whole number or null.');
  if (!isWholeUsd(e.personnelPerUnit)) throw new Error('personnelPerUnit must be a non-negative whole number.');
  if (!['operating', 'paused', 'unavailable'].includes(e.status)) throw new Error(`Unknown status: ${String(e.status)}.`);
}

export interface EnrolmentResult {
  readonly status: AvailabilityStatus;
  readonly enrolled: number;
  /** Meaningful only when status === 'computed'; null means "not asserted". */
  readonly backlog: number | null;
  readonly personnelUsed: number;
}

/** Enrol students bounded by capacity and available personnel; the shortfall is a backlog. */
export function enrol(e: EducationEstablishment, demandUnits: number, availablePersonnel: number): EnrolmentResult {
  validateEducationEstablishment(e);
  if (!isWholeUsd(demandUnits)) throw new Error('Demand must be a non-negative whole number.');
  if (!isWholeUsd(availablePersonnel)) throw new Error('Available personnel must be a non-negative whole number.');
  if (e.status === 'paused') return { status: 'paused', enrolled: 0, backlog: null, personnelUsed: 0 };
  if (e.status === 'unavailable' || e.capacity === null) return { status: 'unavailable', enrolled: 0, backlog: null, personnelUsed: 0 };
  const personnelBound = e.personnelPerUnit > 0 ? Math.floor(availablePersonnel / e.personnelPerUnit) : e.capacity;
  const enrolled = Math.min(demandUnits, e.capacity, personnelBound);
  return { status: 'computed', enrolled, backlog: demandUnits - enrolled, personnelUsed: checkedMul(enrolled, e.personnelPerUnit) };
}

export interface Pathway {
  readonly id: string;
  readonly durationMonths: number;
  readonly enrolment: number;
  readonly monthsElapsed: number;
}

export function validatePathway(p: Pathway): void {
  if (!p || typeof p.id !== 'string' || !p.id.trim()) throw new Error('Pathway needs a non-empty id.');
  if (!Number.isInteger(p.durationMonths) || p.durationMonths <= 0) throw new Error('durationMonths must be a positive integer.');
  if (!isWholeUsd(p.enrolment)) throw new Error('enrolment must be a non-negative whole number.');
  if (!isWholeUsd(p.monthsElapsed) || p.monthsElapsed > p.durationMonths) throw new Error('monthsElapsed must be within [0, durationMonths].');
}

/** A pathway graduates only after its full duration — temporal skill formation, never instant. */
export const graduates = (p: Pathway): boolean => p.monthsElapsed >= p.durationMonths;
