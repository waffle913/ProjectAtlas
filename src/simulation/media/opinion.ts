/**
 * 0.32.5 — Media V2: opinion and mobilization.
 *
 * Pure opinion/mobilization contract (docs/media-0.32.md). Opinion shifts are
 * dated, bounded and causal — they carry the material event/statement that
 * caused them, never a magic modifier. Mobilization capacity is bounded by real
 * support and networks and typed by availability (`unavailable != 0`). No
 * `SimulationState` integration, no schema/migration, no scheduler, no RNG.
 */

import { isSimulationDate } from '../date';
import type { AvailabilityStatus } from '../availability';

export const OPINION_OWNERS = Object.freeze({
  opinion: 'politics.opinion', // 0.13 Region/cohort opinion
  support: 'politics.support', // 0.13 party support
} as const);

export interface OpinionShift {
  readonly id: string;
  /** Permanent Region id. */
  readonly regionId: string;
  /** Cohort key; null = whole-region aggregate. */
  readonly cohortKey: string | null;
  /** Signed basis-point delta, bounded to [-10000, 10000]. */
  readonly deltaBps: number;
  /** The material event/statement that caused the shift (provenance). */
  readonly causeId: string;
  readonly date: string;
  readonly note: string;
}

export function validateOpinionShift(o: OpinionShift): void {
  if (!o || typeof o.id !== 'string' || !o.id.trim()) throw new Error('Opinion shift needs a non-empty id.');
  if (typeof o.regionId !== 'string' || !o.regionId.trim()) throw new Error('Opinion shift needs a non-empty permanent Region id.');
  if (o.cohortKey !== null && (typeof o.cohortKey !== 'string' || !o.cohortKey.trim())) throw new Error('cohortKey must be a non-empty string or null.');
  if (!Number.isSafeInteger(o.deltaBps) || o.deltaBps < -10000 || o.deltaBps > 10000) throw new Error('deltaBps must be a whole number between -10000 and 10000.');
  if (typeof o.causeId !== 'string' || !o.causeId.trim()) throw new Error('Opinion shift needs a non-empty cause id.');
  if (!isSimulationDate(o.date)) throw new Error('Opinion shift date must be a valid simulation date.');
  if (typeof o.note !== 'string' || !o.note.trim()) throw new Error('Opinion shift needs a note.');
}

/** Apply a causal opinion shift, clamped to [0, 10000] bps; never negative, never a magic modifier. */
export function applyOpinionShift(opinionBps: number, shift: OpinionShift): number {
  validateOpinionShift(shift);
  if (!Number.isSafeInteger(opinionBps) || opinionBps < 0 || opinionBps > 10000) throw new Error('opinionBps must be a whole number between 0 and 10000.');
  return Math.max(0, Math.min(10000, opinionBps + shift.deltaBps));
}

export interface MobilizationCapacity {
  readonly status: AvailabilityStatus;
  /** Mobilization capacity (0..10000 bps); null when not asserted. */
  readonly capacityBps: number | null;
}

/** Mobilization capacity bounded by real support and networks; unknown inputs are never zero. */
export function mobilize(supportBps: number | null, networkBps: number | null): MobilizationCapacity {
  if (supportBps === null || networkBps === null) return { status: 'unavailable', capacityBps: null };
  if (!Number.isSafeInteger(supportBps) || supportBps < 0 || supportBps > 10000) throw new Error('supportBps must be a whole number between 0 and 10000.');
  if (!Number.isSafeInteger(networkBps) || networkBps < 0 || networkBps > 10000) throw new Error('networkBps must be a whole number between 0 and 10000.');
  return { status: 'computed', capacityBps: Math.min(supportBps, networkBps) };
}
