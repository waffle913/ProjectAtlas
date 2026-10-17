/**
 * 0.29.8 — Public services V2: public policy and reactions.
 *
 * Pure policy-effect contract (docs/services-0.29.md). A law/budget creates real
 * service capacity through existing mechanisms, bounded by institutional limits;
 * it is never a magic multiplier. No new canonical state, no scheduler, no RNG,
 * no migration.
 *
 * A capacity change is applied only once the causal chain is complete. The
 * policy carries a dated authorization and three orchestrator-confirmed gates —
 * funding committed, construction complete, personnel committed. Until all
 * three are confirmed the change fails closed: a bare note and a `capacityDelta`
 * can never raise capacity. The legal/asset/budget engines that produce those
 * confirmations (0.11 fiscal, 0.24 construction, 0.10/0.25 labour) are validated
 * at engine integration, not fabricated here.
 */

import { isWholeUsd } from '../finance/settlement';
import { isSimulationDate } from '../date';
import { checkedAdd, checkedSub } from '../safeMath';
import { SERVICE_FAMILIES, type ServiceFamily } from './contract';

export interface ServicePolicy {
  readonly id: string;
  /** The proposal/law that authorized the change (0.14/0.22 governance). */
  readonly sourceProposalId: string;
  /** The service family the policy affects. */
  readonly serviceFamily: ServiceFamily;
  /** Signed whole-unit capacity delta. */
  readonly capacityDelta: number;
  /** Institutional ceiling for this capacity (never exceeded). */
  readonly institutionalLimit: number;
  /** Date the authorizing proposal was adopted (simulation date). */
  readonly authorizedOn: string;
  /** Orchestrator-confirmed causal gates; capacity applies only when all are true. */
  readonly fundingCommitted: boolean;
  readonly constructionComplete: boolean;
  readonly personnelCommitted: boolean;
  readonly note: string;
}

export function validateServicePolicy(p: ServicePolicy): void {
  if (!p || typeof p.id !== 'string' || !p.id.trim()) throw new Error('Policy needs a non-empty id.');
  if (typeof p.sourceProposalId !== 'string' || !p.sourceProposalId.trim()) throw new Error('Policy needs a non-empty source proposal id.');
  if (!SERVICE_FAMILIES.includes(p.serviceFamily)) throw new Error(`Unknown service family: ${String(p.serviceFamily)}.`);
  if (!Number.isSafeInteger(p.capacityDelta)) throw new Error('capacityDelta must be a safe integer.');
  if (!isWholeUsd(p.institutionalLimit)) throw new Error('institutionalLimit must be a non-negative whole number.');
  if (!isSimulationDate(p.authorizedOn)) throw new Error('Policy needs a valid authorization date (authorizedOn).');
  if (typeof p.fundingCommitted !== 'boolean' || typeof p.constructionComplete !== 'boolean' || typeof p.personnelCommitted !== 'boolean') {
    throw new Error('Policy funding/construction/personnel gates must be booleans.');
  }
  if (typeof p.note !== 'string' || !p.note.trim()) throw new Error('Policy needs a note describing the causal effect.');
}

/**
 * Apply a policy to a capacity, clamped to [0, institutionalLimit]; a real change,
 * never a magic multiplier. Fails closed until funding, construction and
 * personnel are all confirmed (no capacity from a bare note + delta).
 */
export function applyServicePolicy(currentCapacity: number, p: ServicePolicy): number {
  validateServicePolicy(p);
  if (!isWholeUsd(currentCapacity)) throw new Error('currentCapacity must be a non-negative whole number.');
  if (!p.fundingCommitted || !p.constructionComplete || !p.personnelCommitted) {
    throw new Error('Policy capacity is not commissioned: funding/construction/personnel gates are not all confirmed (fail closed).');
  }
  const next = p.capacityDelta >= 0 ? checkedAdd(currentCapacity, p.capacityDelta) : checkedSub(currentCapacity, -p.capacityDelta);
  return Math.max(0, Math.min(p.institutionalLimit, next));
}
