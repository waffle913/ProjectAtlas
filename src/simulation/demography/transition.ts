/**
 * 0.30.2 — Demography/migration V2: births, deaths and internal movements.
 *
 * Pure demographic-transition contract (docs/demography-0.30.md). Transitions
 * are dated and conserved; population never changes magically. No new canonical
 * state, no scheduler, no RNG, no migration.
 */

import { isWholeUsd } from '../finance/settlement';
import { isSimulationDate } from '../date';

export type TransitionKind = 'birth' | 'death' | 'move_in' | 'move_out';

export interface DemographicTransition {
  readonly id: string;
  readonly cohortKey: string;
  readonly kind: TransitionKind;
  readonly count: number;
  readonly date: string;
}

const DELTA: Record<TransitionKind, -1 | 1> = { birth: 1, move_in: 1, death: -1, move_out: -1 };

export function validateTransition(t: DemographicTransition): void {
  if (!t || typeof t.id !== 'string' || !t.id.trim()) throw new Error('Transition needs a non-empty id.');
  if (typeof t.cohortKey !== 'string' || !t.cohortKey.trim()) throw new Error('Transition needs a non-empty cohort key.');
  if (!['birth', 'death', 'move_in', 'move_out'].includes(t.kind)) throw new Error(`Unknown transition kind: ${String(t.kind)}.`);
  if (!isWholeUsd(t.count) || t.count <= 0) throw new Error('count must be a positive whole number.');
  if (!isSimulationDate(t.date)) throw new Error('Transition date must be a valid simulation date.');
}

export interface PopulationDelta {
  readonly kind: TransitionKind;
  readonly count: number;
}

/** Apply a transition to a cohort population; population never goes negative (no magical change). */
export function applyTransition(population: number, t: DemographicTransition): number {
  validateTransition(t);
  if (!isWholeUsd(population)) throw new Error('population must be a non-negative whole number.');
  const next = population + DELTA[t.kind] * t.count;
  if (next < 0) throw new Error('Transition would make the cohort population negative.');
  return next;
}
