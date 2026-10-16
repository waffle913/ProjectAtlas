/**
 * 0.28.3 — Industry V1: capacities and bottlenecks.
 *
 * Pure capacity/bottleneck contract (docs/industry-0.28.md). Capacity is
 * bounded by utilization, maintenance outage and the available material inputs;
 * expansion happens through 0.24 construction, never magically. No new
 * canonical state, no scheduler, no RNG, no migration.
 *
 * `planBatches` is a material/capacity plan: the effective capacity profile
 * bounds the plan, and a known process-level batch cap (`capacityPerBatch`)
 * only further bounds it. Energy/personnel/funds are runtime resources applied
 * by `runProcess` (0.28.2), not part of this material plan.
 */

import { isWholeUsd } from '../finance/settlement';
import { checkedMul } from '../safeMath';
import { validateProcess, type IndustrialProcess } from './process';

export interface CapacityProfile {
  /** Designed batches per month. */
  readonly nominalBatchesPerMonth: number;
  /** Utilized fraction in bps (0–10,000). */
  readonly utilizationBps: number;
  /** Capacity lost to maintenance in bps (0–10,000). */
  readonly maintenanceOutageBps: number;
}

export function validateCapacityProfile(c: CapacityProfile): void {
  if (!isWholeUsd(c.nominalBatchesPerMonth)) throw new Error('Nominal batches must be a non-negative whole number.');
  for (const [name, bps] of [['utilizationBps', c.utilizationBps], ['maintenanceOutageBps', c.maintenanceOutageBps]] as const) {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new Error(`${name} must be an integer in [0, 10000].`);
  }
}

/** Effective batches per month after utilization and maintenance outage. Never negative. Overflow fails closed. */
export function effectiveBatchesPerMonth(c: CapacityProfile): number {
  validateCapacityProfile(c);
  const net = Math.max(0, c.utilizationBps - c.maintenanceOutageBps);
  return Math.floor(checkedMul(c.nominalBatchesPerMonth, net) / 10000);
}

export interface BatchPlan {
  readonly batches: number;
  /** Which constraint binds: 'capacity' or the id of the limiting input. */
  readonly binding: 'capacity' | string;
}

/** Plan production, bounded by material inputs and by effective capacity; report the binding constraint. */
export function planBatches(process: IndustrialProcess, availableInputs: Readonly<Record<string, number>>, profile: CapacityProfile): BatchPlan {
  validateProcess(process);
  validateCapacityProfile(profile);
  let batches = effectiveBatchesPerMonth(profile);
  // A known process-level cap further bounds the plan; an unavailable (null)
  // process cap does not — the profile already provides the finite bound.
  if (process.capacityPerBatch !== null) batches = Math.min(batches, process.capacityPerBatch);
  let binding: BatchPlan['binding'] = 'capacity';
  for (const [id, perBatch] of Object.entries(process.inputs)) {
    const avail = availableInputs[id] ?? 0;
    if (!isWholeUsd(avail)) throw new Error(`Available input ${id} must be a non-negative whole quantity.`);
    const fromInput = Math.floor(avail / perBatch);
    if (fromInput < batches) {
      batches = fromInput;
      binding = id;
    }
  }
  return { batches, binding };
}
