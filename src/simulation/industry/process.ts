/**
 * 0.28.2 — Industry V1: transformation chains.
 *
 * Pure industrial-process contract (docs/industry-0.28.md). A process consumes
 * material inputs and produces products, by-products, residues and a documented
 * material loss, with strict matter conservation. No new canonical state, no
 * scheduler, no RNG, no migration.
 *
 * Contract:
 * - a batch conserves matter exactly: sum(input quantities) ===
 *   sum(output quantities) + sum(by-product quantities) + residues + materialLoss
 *   (no net creation or destruction);
 * - production is bounded by the available inputs and by the batch capacity;
 *   energy/personnel are validated requirements, never part of the matter identity;
 * - `null` capacity is unavailable, never a fabricated zero.
 */

import { isWholeUsd } from '../finance/settlement';

export interface IndustrialProcess {
  readonly id: string;
  /** Material input quantities per batch. */
  readonly inputs: Readonly<Record<string, number>>;
  /** Product quantities per batch. */
  readonly outputs: Readonly<Record<string, number>>;
  /** By-product quantities per batch. */
  readonly byProducts: Readonly<Record<string, number>>;
  /** Residue quantity per batch (whole units). */
  readonly residues: number;
  /** Documented material loss per batch (closes the matter identity). */
  readonly materialLoss: number;
  readonly energyPerBatch: number;
  readonly personnelPerBatch: number;
  readonly costPerBatch: number;
  /** Batches per month; null = unavailable (no saturation cap). */
  readonly capacityPerBatch: number | null;
}

const sumValues = (r: Readonly<Record<string, number>>): number => Object.values(r).reduce((s, v) => s + v, 0);

function validateQuantityRecord(name: string, r: Readonly<Record<string, number>>, allowZero: boolean): void {
  for (const [id, qty] of Object.entries(r)) {
    if (!id.trim()) throw new Error(`${name} needs non-empty product ids.`);
    if (!isWholeUsd(qty) || (!allowZero && qty <= 0)) throw new Error(`${name} quantities must be ${allowZero ? 'non-negative' : 'positive'} whole numbers.`);
  }
}

export function validateProcess(p: IndustrialProcess): void {
  if (!p || typeof p.id !== 'string' || !p.id.trim()) throw new Error('Process needs a non-empty id.');
  validateQuantityRecord('inputs', p.inputs, false);
  validateQuantityRecord('outputs', p.outputs, false);
  validateQuantityRecord('byProducts', p.byProducts, true);
  if (!Object.keys(p.inputs).length) throw new Error('A process needs at least one material input.');
  if (!Object.keys(p.outputs).length) throw new Error('A process needs at least one output product.');
  if (!isWholeUsd(p.residues) || !isWholeUsd(p.materialLoss)) throw new Error('Residues and material loss must be non-negative whole numbers.');
  if (!isWholeUsd(p.energyPerBatch) || !isWholeUsd(p.personnelPerBatch) || !isWholeUsd(p.costPerBatch)) throw new Error('Energy/personnel/cost must be non-negative whole numbers.');
  if (p.capacityPerBatch !== null && (!isWholeUsd(p.capacityPerBatch) || p.capacityPerBatch <= 0)) throw new Error('capacityPerBatch must be a positive whole number or null.');
  const matterIn = sumValues(p.inputs);
  const matterOut = sumValues(p.outputs) + sumValues(p.byProducts) + p.residues + p.materialLoss;
  if (matterIn !== matterOut) throw new Error(`Process must conserve matter: inputs ${matterIn} != outputs ${matterOut}.`);
}

export interface ProcessResult {
  readonly batches: number;
  readonly outputs: Readonly<Record<string, number>>;
  readonly byProducts: Readonly<Record<string, number>>;
  readonly residues: number;
  readonly materialLoss: number;
  readonly energy: number;
  readonly personnel: number;
  readonly cost: number;
  readonly consumedInputs: Readonly<Record<string, number>>;
  readonly remainingInputs: Readonly<Record<string, number>>;
}

/** Run a process, bounded by available inputs and batch capacity; conserves matter per batch. */
export function runProcess(p: IndustrialProcess, availableInputs: Readonly<Record<string, number>>): ProcessResult {
  validateProcess(p);
  for (const [id, qty] of Object.entries(availableInputs)) {
    if (!isWholeUsd(qty)) throw new Error(`Available input ${id} must be a non-negative whole quantity.`);
  }
  let batches = Infinity;
  for (const [id, perBatch] of Object.entries(p.inputs)) {
    const avail = availableInputs[id] ?? 0;
    batches = Math.min(batches, Math.floor(avail / perBatch));
  }
  if (p.capacityPerBatch !== null) batches = Math.min(batches, p.capacityPerBatch);
  if (!Number.isFinite(batches)) batches = 0;

  const scale = (r: Readonly<Record<string, number>>) => Object.fromEntries(Object.entries(r).map(([id, qty]) => [id, batches * qty]));
  const consumedInputs = scale(p.inputs);
  const remainingInputs = Object.fromEntries(Object.entries(p.inputs).map(([id]) => [id, (availableInputs[id] ?? 0) - consumedInputs[id]]));
  return {
    batches,
    outputs: scale(p.outputs),
    byProducts: scale(p.byProducts),
    residues: batches * p.residues,
    materialLoss: batches * p.materialLoss,
    energy: batches * p.energyPerBatch,
    personnel: batches * p.personnelPerBatch,
    cost: batches * p.costPerBatch,
    consumedInputs,
    remainingInputs,
  };
}
