/**
 * 0.31.8 — Military V2: operations and territorial control.
 *
 * Pure territorial-control contract (docs/diplomacy-0.31.md). Sovereignty,
 * effective control and occupation are three distinct layers: sovereignty lives
 * in `state.regionOwnership` (0.9) and is never changed by a control change —
 * control and occupation are extended from the 0.19 operations model, never
 * annexation-by-pixel-movement. Asset damage is bounded and never auto-repaired.
 * No `SimulationState` integration, no schema/migration, no scheduler, no RNG.
 */

import { isWholeUsd } from '../finance/settlement';
import { isSimulationDate } from '../date';
import type { RegionControl } from './model';

export const TERRITORIAL_CONTROL_VERSION = 'territorial-control-0.31-v1' as const;

/** Canonical owners of the three distinct layers — no second ownership/control store. */
export const TERRITORIAL_CONTROL_OWNERS = Object.freeze({
  sovereignty: 'state.regionOwnership', // 0.9 canonical sovereignty (never redrawn)
  control: 'operations.regionControl',  // 0.19 effective control
  occupation: 'state.occupationByRegion', // top-level canonical occupation map (distinct from sovereignty)
  assets: 'assets',                     // 0.24 asset store (damage)
} as const);

export interface ControlChange {
  readonly id: string;
  /** Permanent Region id — geometry is never redrawn. */
  readonly regionId: string;
  /** Effective control after the change; it never implies sovereignty. */
  readonly newControl: RegionControl;
  /** Occupation status; occupation is distinct from sovereignty and from effective control. */
  readonly newOccupation: boolean;
  readonly date: string;
  readonly note: string;
}

export function validateControlChange(c: ControlChange): void {
  if (!c || typeof c.id !== 'string' || !c.id.trim()) throw new Error('Control change needs a non-empty id.');
  if (typeof c.regionId !== 'string' || !c.regionId.trim()) throw new Error('Control change needs a non-empty permanent Region id.');
  if (!['sovereign_controlled', 'contested', 'foreign_controlled'].includes(c.newControl)) throw new Error(`Unknown control status: ${String(c.newControl)}.`);
  if (typeof c.newOccupation !== 'boolean') throw new Error('newOccupation must be a boolean.');
  if (!isSimulationDate(c.date)) throw new Error('Control change date must be a valid simulation date.');
  if (typeof c.note !== 'string' || !c.note.trim()) throw new Error('Control change needs a note.');
}

/** Apply bounded damage to an asset's integrity (0..10000 bps); never negative, never auto-repaired. */
export function applyAssetDamage(assetIntegrityBps: number, damageBps: number): number {
  if (!isWholeUsd(assetIntegrityBps) || assetIntegrityBps > 10000) throw new Error('assetIntegrityBps must be a whole number between 0 and 10000.');
  if (!isWholeUsd(damageBps) || damageBps > 10000) throw new Error('damageBps must be a whole number between 0 and 10000.');
  return Math.max(0, assetIntegrityBps - damageBps);
}
