/**
 * 0.31.7 — Military V2: training, availability and command.
 *
 * Pure training/command contract (docs/diplomacy-0.31.md). Command authority
 * mirrors the 0.14 capability model — `command_military_operations` is held by a
 * head of government or a head of state, never by a minister/legislator, and
 * unresolved authority fails closed. Training and reconstitution are time-bounded
 * (never instant), constrained by instructor capacity / recruitment rate, and
 * typed by availability. No second military-power table, no `SimulationState`
 * integration, no schema/migration, no scheduler, no RNG.
 */

import { isWholeUsd } from '../finance/settlement';
import { checkedMul } from '../safeMath';
import { isSimulationDate } from '../date';
import type { AvailabilityStatus } from '../availability';

export const TRAINING_COMMAND_VERSION = 'military-training-command-0.31-v1' as const;

export const TRAINING_COMMAND_OWNERS = Object.freeze({
  command: 'governance.capabilities',   // 0.14 command_military_operations
  training: 'military.trainees',        // 0.16 TrainingCohort
  reconstitution: 'military.parameters', // 0.16 recruitmentPerMonth
} as const);

export type CommandMandate =
  | { readonly basis: 'head_of_government' }
  | { readonly basis: 'head_of_state' }
  | { readonly basis: 'unresolved' };

export function validateCommandMandate(m: CommandMandate): void {
  if (!m || typeof m !== 'object') throw new Error('Command mandate is required.');
  switch (m.basis) {
    case 'head_of_government':
    case 'head_of_state':
    case 'unresolved':
      break;
    default:
      throw new Error(`Unknown command mandate basis: ${String((m as { basis?: unknown }).basis)}.`);
  }
}

/** Command authority mirrors 0.14: head of government or head of state hold `command_military_operations`; never inferred. */
export function canCommandMilitary(m: CommandMandate): boolean {
  validateCommandMandate(m);
  return m.basis !== 'unresolved';
}

export interface TrainingProgram {
  readonly id: string;
  readonly countryId: string;
  /** Whole persons to train. */
  readonly persons: number;
  /** Whole months required for one training cohort; >= 1 (never instant). */
  readonly monthsRequired: number;
  /** Persons trainable at once (instructor-bounded); null = unavailable; 0 = documented zero capacity. */
  readonly instructorCapacity: number | null;
  readonly date: string;
  readonly note: string;
}

export function validateTrainingProgram(t: TrainingProgram): void {
  if (!t || typeof t.id !== 'string' || !t.id.trim()) throw new Error('Training program needs a non-empty id.');
  if (typeof t.countryId !== 'string' || !t.countryId.trim()) throw new Error('Training program needs a non-empty country id.');
  if (!isWholeUsd(t.persons) || t.persons <= 0) throw new Error('persons must be a positive whole number.');
  if (!isWholeUsd(t.monthsRequired) || t.monthsRequired <= 0) throw new Error('monthsRequired must be a positive whole number.');
  if (t.instructorCapacity !== null && !isWholeUsd(t.instructorCapacity)) throw new Error('instructorCapacity must be a non-negative whole number or null.');
  if (!isSimulationDate(t.date)) throw new Error('Training date must be a valid simulation date.');
  if (typeof t.note !== 'string' || !t.note.trim()) throw new Error('Training program needs a note.');
}

export interface TrainingPlan {
  readonly status: AvailabilityStatus;
  /** Whole months to complete; >= 1 when computed (never instant); null otherwise. */
  readonly monthsToComplete: number | null;
}

/** Plan a training program: bounded by instructor capacity and cohort duration; never instant. */
export function planTraining(t: TrainingProgram): TrainingPlan {
  validateTrainingProgram(t);
  if (t.instructorCapacity === null) return { status: 'unavailable', monthsToComplete: null };
  if (t.instructorCapacity === 0) return { status: 'known_zero', monthsToComplete: null };
  const batches = Math.ceil(t.persons / t.instructorCapacity);
  return { status: 'computed', monthsToComplete: checkedMul(t.monthsRequired, batches) };
}

export interface ReconstitutionRequirement {
  readonly id: string;
  readonly countryId: string;
  /** Whole personnel lost, to be reconstituted. */
  readonly lostPersonnel: number;
  /** Whole persons recruited per month; null = unavailable; 0 = documented zero rate. */
  readonly recruitmentPerMonth: number | null;
  readonly date: string;
  readonly note: string;
}

export function validateReconstitutionRequirement(r: ReconstitutionRequirement): void {
  if (!r || typeof r.id !== 'string' || !r.id.trim()) throw new Error('Reconstitution requirement needs a non-empty id.');
  if (typeof r.countryId !== 'string' || !r.countryId.trim()) throw new Error('Reconstitution requirement needs a non-empty country id.');
  if (!isWholeUsd(r.lostPersonnel) || r.lostPersonnel <= 0) throw new Error('lostPersonnel must be a positive whole number.');
  if (r.recruitmentPerMonth !== null && !isWholeUsd(r.recruitmentPerMonth)) throw new Error('recruitmentPerMonth must be a non-negative whole number or null.');
  if (!isSimulationDate(r.date)) throw new Error('Reconstitution date must be a valid simulation date.');
  if (typeof r.note !== 'string' || !r.note.trim()) throw new Error('Reconstitution requirement needs a note.');
}

/** Plan reconstitution of losses: bounded by recruitment rate; never instant, never fabricated. */
export function planReconstitution(r: ReconstitutionRequirement): TrainingPlan {
  validateReconstitutionRequirement(r);
  if (r.recruitmentPerMonth === null) return { status: 'unavailable', monthsToComplete: null };
  if (r.recruitmentPerMonth === 0) return { status: 'known_zero', monthsToComplete: null };
  return { status: 'computed', monthsToComplete: Math.ceil(r.lostPersonnel / r.recruitmentPerMonth) };
}
