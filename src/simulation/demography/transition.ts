/**
 * 0.30.2 — Demography/migration V2: births, deaths and internal movements.
 *
 * Pure demographic-transition contract (docs/demography-0.30.md). Births and
 * deaths change a cohort intrinsically; internal movements are atomic transfers
 * between two cohorts, so population is never created or destroyed by a move.
 * No new canonical state, no scheduler, no RNG, no migration.
 */

import { isWholeUsd } from '../finance/settlement';
import { isSimulationDate } from '../date';
import { checkedAdd, checkedSub } from '../safeMath';

export type TransitionKind = 'birth' | 'death';

export interface DemographicTransition {
  readonly id: string;
  readonly cohortKey: string;
  readonly kind: TransitionKind;
  readonly count: number;
  readonly date: string;
}

const DELTA: Record<TransitionKind, -1 | 1> = { birth: 1, death: -1 };

export function validateTransition(t: DemographicTransition): void {
  if (!t || typeof t.id !== 'string' || !t.id.trim()) throw new Error('Transition needs a non-empty id.');
  if (typeof t.cohortKey !== 'string' || !t.cohortKey.trim()) throw new Error('Transition needs a non-empty cohort key.');
  if (!['birth', 'death'].includes(t.kind)) throw new Error(`Unknown transition kind: ${String(t.kind)}.`);
  if (!isWholeUsd(t.count) || t.count <= 0) throw new Error('count must be a positive whole number.');
  if (!isSimulationDate(t.date)) throw new Error('Transition date must be a valid simulation date.');
}

/** Apply a birth/death to a cohort population; population never goes negative. */
export function applyTransition(population: number, t: DemographicTransition): number {
  validateTransition(t);
  if (!isWholeUsd(population)) throw new Error('population must be a non-negative whole number.');
  const next = t.kind === 'birth' ? checkedAdd(population, t.count) : checkedSub(population, t.count);
  if (next < 0) throw new Error('Transition would make the cohort population negative.');
  return next;
}

/**
 * An internal movement is an atomic, conserved transfer between two cohorts. A
 * move never changes total population; it only relocates `count` people from the
 * origin cohort to the destination cohort (a single identified event, never two
 * independent `move_in`/`move_out` deltas that could create population).
 */
export interface PopulationMove {
  readonly id: string;
  readonly originCohortKey: string;
  readonly destinationCohortKey: string;
  readonly count: number;
  readonly date: string;
}

export function validatePopulationMove(m: PopulationMove): void {
  if (!m || typeof m.id !== 'string' || !m.id.trim()) throw new Error('Move needs a non-empty id.');
  if (typeof m.originCohortKey !== 'string' || !m.originCohortKey.trim()) throw new Error('Move needs a non-empty origin cohort key.');
  if (typeof m.destinationCohortKey !== 'string' || !m.destinationCohortKey.trim()) throw new Error('Move needs a non-empty destination cohort key.');
  if (m.originCohortKey === m.destinationCohortKey) throw new Error('Move needs distinct origin and destination cohorts.');
  if (!isWholeUsd(m.count) || m.count <= 0) throw new Error('count must be a positive whole number.');
  if (!isSimulationDate(m.date)) throw new Error('Move date must be a valid simulation date.');
}

export interface PopulationMoveResult {
  readonly origin: number;
  readonly destination: number;
}

/** Apply one move atomically; total (origin + destination) is conserved and origin never goes negative. */
export function applyMove(originPopulation: number, destinationPopulation: number, m: PopulationMove): PopulationMoveResult {
  validatePopulationMove(m);
  if (!isWholeUsd(originPopulation) || !isWholeUsd(destinationPopulation)) throw new Error('Populations must be non-negative whole numbers.');
  const origin = checkedSub(originPopulation, m.count);
  if (origin < 0) throw new Error('Move would make the origin cohort population negative.');
  return { origin, destination: checkedAdd(destinationPopulation, m.count) };
}
