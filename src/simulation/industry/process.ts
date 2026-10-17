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
 *   (no net creation or destruction). Every quantity is denominated in the
 *   process's single declared `unitOfAccount`, so incompatible units can never
 *   be summed implicitly (no kg + litres + units without an explicit conversion);
 * - production is bounded by the available inputs, the batch capacity, and the
 *   available energy/personnel/funds; energy/personnel/cost are validated
 *   requirements, never part of the matter identity;
 * - `null` capacity is unavailable: running a process without a known capacity
 *   fails closed (never an infinite capacity);
 * - every output quantity is a safe integer; overflow fails closed.
 */

import { isWholeUsd } from '../finance/settlement';
import { checkedMul } from '../safeMath';

export interface IndustrialProcess {
  readonly id: string;
  /** Physical unit every quantity in this process shares (e.g. 'kg', 'litre', 'unit'). */
  readonly unitOfAccount: string;
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
  /** Batches per month; null = unavailable (running fails closed). */
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
  if (typeof p.unitOfAccount !== 'string' || !p.unitOfAccount.trim()) throw new Error('Process needs a declared unit of account (a single physical unit shared by all its quantities).');
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

/** Available non-material resources that bound a production run. */
export interface ProcessResources {
  /** Whole units of energy available for the run. */
  readonly energy: number;
  /** Whole persons available for the run. */
  readonly personnel: number;
  /** Whole-USD funds available for the run. */
  readonly funds: number;
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

/**
 * Run a process, bounded by available inputs, batch capacity and available
 * energy/personnel/funds; conserves matter per batch. Unknown capacity fails
 * closed; a known resource shortfall produces zero (never beyond resources).
 */
export function runProcess(
  p: IndustrialProcess,
  availableInputs: Readonly<Record<string, number>>,
  resources: ProcessResources,
): ProcessResult {
  validateProcess(p);
  for (const [id, qty] of Object.entries(availableInputs)) {
    if (!isWholeUsd(qty)) throw new Error(`Available input ${id} must be a non-negative whole quantity.`);
  }
  if (!resources || !isWholeUsd(resources.energy) || !isWholeUsd(resources.personnel) || !isWholeUsd(resources.funds)) {
    throw new Error('Available energy/personnel/funds must be non-negative whole numbers.');
  }
  if (p.capacityPerBatch === null) {
    throw new Error('Process capacity is unavailable; production cannot be bounded (fail closed).');
  }
  let batches = p.capacityPerBatch;
  for (const [id, perBatch] of Object.entries(p.inputs)) {
    const avail = availableInputs[id] ?? 0;
    batches = Math.min(batches, Math.floor(avail / perBatch));
  }
  if (p.energyPerBatch > 0) batches = Math.min(batches, Math.floor(resources.energy / p.energyPerBatch));
  if (p.personnelPerBatch > 0) batches = Math.min(batches, Math.floor(resources.personnel / p.personnelPerBatch));
  if (p.costPerBatch > 0) batches = Math.min(batches, Math.floor(resources.funds / p.costPerBatch));

  const scale = (r: Readonly<Record<string, number>>) => Object.fromEntries(Object.entries(r).map(([id, qty]) => [id, checkedMul(batches, qty)]));
  const consumedInputs = scale(p.inputs);
  const remainingInputs = Object.fromEntries(Object.entries(p.inputs).map(([id]) => [id, (availableInputs[id] ?? 0) - consumedInputs[id]]));
  return {
    batches,
    outputs: scale(p.outputs),
    byProducts: scale(p.byProducts),
    residues: checkedMul(batches, p.residues),
    materialLoss: checkedMul(batches, p.materialLoss),
    energy: checkedMul(batches, p.energyPerBatch),
    personnel: checkedMul(batches, p.personnelPerBatch),
    cost: checkedMul(batches, p.costPerBatch),
    consumedInputs,
    remainingInputs,
  };
}
