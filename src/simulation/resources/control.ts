/**
 * 0.27.8 — Resources/energy V1: war, sovereignty and damage.
 *
 * Pure contract (docs/resources-0.27.md) for the interaction of resources with
 * sovereignty, effective control and war damage. No new canonical state, no
 * scheduler, no RNG, no migration — sovereignty stays canonical in
 * `state.regionOwnership`, and this module only reasons over explicit control
 * facts.
 *
 * Contract:
 * - sovereignty (owner), exploitation (operator) and effective control
 *   (controller) are three distinct ids; military occupation is a fourth,
 *   distinct fact — occupation is not sovereignty;
 * - the operator may exploit an installation only when it is the effective
 *   controller; sovereignty alone does not authorize exploitation under
 *   occupation;
 * - damage reduces capacity and is never auto-repaired at war's end; repair is
 *   explicit and bounded by the original capacity.
 */

import { isWholeUsd } from '../finance/settlement';

export interface InstallationControl {
  readonly installationId: string;
  /** Sovereign owner (from the canonical ownership map). */
  readonly sovereignOwnerId: string;
  /** Exploiter (operator) of the installation. */
  readonly operatorId: string;
  /** Effective controller (military situation). */
  readonly controllerId: string;
  /** Military occupier; null when not occupied. Occupation is not sovereignty. */
  readonly occupierId: string | null;
}

export function validateInstallationControl(c: InstallationControl): void {
  if (!c || typeof c.installationId !== 'string' || !c.installationId.trim()) throw new Error('Control needs a non-empty installation id.');
  if (typeof c.sovereignOwnerId !== 'string' || !c.sovereignOwnerId.trim()) throw new Error('Control needs a non-empty sovereign owner id.');
  if (typeof c.operatorId !== 'string' || !c.operatorId.trim()) throw new Error('Control needs a non-empty operator id.');
  if (typeof c.controllerId !== 'string' || !c.controllerId.trim()) throw new Error('Control needs a non-empty controller id.');
  if (c.occupierId !== null && (typeof c.occupierId !== 'string' || !c.occupierId.trim())) throw new Error('Occupier must be a non-empty id or null.');
}

export const isOccupied = (c: InstallationControl): boolean => c.occupierId !== null;

/** Sovereignty is retained only without occupation and with the sovereign as effective controller. */
export function sovereignControlRetained(c: InstallationControl): boolean {
  validateInstallationControl(c);
  return !isOccupied(c) && c.controllerId === c.sovereignOwnerId;
}

/** The operator may exploit only as the effective controller; sovereignty alone does not authorize exploitation under occupation. */
export function exploitAuthorized(c: InstallationControl): boolean {
  validateInstallationControl(c);
  return c.operatorId === c.controllerId;
}

/** Apply war damage as a basis-point reduction (0–10,000 bps); capacity never goes negative, null stays null. */
export function applyDamage(capacity: number | null, damageBps: number): number | null {
  if (capacity === null) return null;
  if (!isWholeUsd(capacity)) throw new Error('Capacity must be a non-negative whole quantity or null.');
  if (!Number.isInteger(damageBps) || damageBps < 0 || damageBps > 10000) throw new Error('damageBps must be an integer in [0, 10000].');
  return Math.floor((capacity * (10000 - damageBps)) / 10000);
}

/** Explicit repair, bounded by the original capacity; damage never auto-repairs. */
export function repairCapacity(originalCapacity: number, currentCapacity: number, repairAmount: number): number {
  for (const v of [originalCapacity, currentCapacity, repairAmount]) {
    if (!isWholeUsd(v)) throw new Error('Repair quantities must be non-negative whole numbers.');
  }
  if (currentCapacity > originalCapacity) throw new Error('Current capacity cannot exceed the original capacity.');
  return Math.min(originalCapacity, currentCapacity + repairAmount);
}
