/**
 * 0.29.8 — Public services V2: public policy and reactions.
 *
 * Pure policy-effect contract (docs/services-0.29.md). A law/budget creates real
 * service capacity through existing mechanisms, bounded by institutional limits;
 * it is never a magic multiplier. No new canonical state, no scheduler, no RNG,
 * no migration.
 */

import { isWholeUsd } from '../finance/settlement';

export interface ServicePolicy {
  readonly id: string;
  /** The proposal/law that authorized the change (0.14/0.22 governance). */
  readonly sourceProposalId: string;
  /** The service family the policy affects. */
  readonly serviceFamily: string;
  /** Signed whole-unit capacity delta. */
  readonly capacityDelta: number;
  /** Institutional ceiling for this capacity (never exceeded). */
  readonly institutionalLimit: number;
  readonly note: string;
}

export function validateServicePolicy(p: ServicePolicy): void {
  if (!p || typeof p.id !== 'string' || !p.id.trim()) throw new Error('Policy needs a non-empty id.');
  if (typeof p.sourceProposalId !== 'string' || !p.sourceProposalId.trim()) throw new Error('Policy needs a non-empty source proposal id.');
  if (typeof p.serviceFamily !== 'string' || !p.serviceFamily.trim()) throw new Error('Policy needs a non-empty service family.');
  if (!Number.isSafeInteger(p.capacityDelta)) throw new Error('capacityDelta must be a safe integer.');
  if (!isWholeUsd(p.institutionalLimit)) throw new Error('institutionalLimit must be a non-negative whole number.');
  if (typeof p.note !== 'string' || !p.note.trim()) throw new Error('Policy needs a note describing the causal effect.');
}

/** Apply a policy to a capacity, clamped to [0, institutionalLimit]; a real change, never a magic multiplier. */
export function applyServicePolicy(currentCapacity: number, p: ServicePolicy): number {
  validateServicePolicy(p);
  if (!isWholeUsd(currentCapacity)) throw new Error('currentCapacity must be a non-negative whole number.');
  return Math.max(0, Math.min(p.institutionalLimit, currentCapacity + p.capacityDelta));
}
