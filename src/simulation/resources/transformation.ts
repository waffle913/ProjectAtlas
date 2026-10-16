/**
 * 0.27.4 — Resources/energy V1: refining and primary transformation.
 *
 * Pure transformation contract (docs/resources-0.27.md). A transformation turns
 * an input resource into a primary product plus by-products, residues and a
 * documented loss, with strict matter conservation. No new canonical state, no
 * scheduler, no RNG, no migration.
 *
 * Contract:
 * - a batch consumes `inputPerBatch` and produces `productPerBatch` +
 *   `byProductPerBatch` + `residuePerBatch` + `lossPerBatch`; the sum of the
 *   four outputs equals the input exactly — no net creation of matter;
 * - output is bounded by the installation's batch capacity (saturation), and by
 *   the available input;
 * - `unavailable != 0`: an unknown capacity or ratio is absent, never a
 *   fabricated zero.
 */

import { isWholeUsd } from '../finance/settlement';

export interface TransformationRecord {
  readonly id: string;
  readonly inputResourceId: string;
  /** Primary refined product id. */
  readonly productId: string;
  readonly byProductId?: string;
  readonly residueId?: string;
  /** Aggregate quantity of input consumed per batch. */
  readonly inputPerBatch: number;
  readonly productPerBatch: number;
  readonly byProductPerBatch: number;
  readonly residuePerBatch: number;
  /** Documented loss per batch; the residual that closes the conservation identity. */
  readonly lossPerBatch: number;
  /** Whole-USD cost per batch. */
  readonly costPerBatch: number;
  /** Batches per month the installation can run (saturation ceiling). */
  readonly capacityPerBatch: number;
}

export function validateTransformation(t: TransformationRecord): void {
  if (!t || typeof t.id !== 'string' || !t.id.trim()) throw new Error('Transformation needs a non-empty id.');
  if (typeof t.inputResourceId !== 'string' || !t.inputResourceId.trim()) throw new Error('Transformation needs a non-empty input resource id.');
  if (typeof t.productId !== 'string' || !t.productId.trim()) throw new Error('Transformation needs a non-empty product id.');
  if (!isWholeUsd(t.inputPerBatch) || t.inputPerBatch <= 0) throw new Error('inputPerBatch must be a positive whole quantity.');
  for (const [name, value] of [['productPerBatch', t.productPerBatch], ['byProductPerBatch', t.byProductPerBatch], ['residuePerBatch', t.residuePerBatch], ['lossPerBatch', t.lossPerBatch], ['costPerBatch', t.costPerBatch], ['capacityPerBatch', t.capacityPerBatch]] as const) {
    if (!isWholeUsd(value) || (name === 'capacityPerBatch' ? value <= 0 : value < 0)) throw new Error(`${name} must be a non-negative whole number (capacityPerBatch positive).`);
  }
  const outputs = t.productPerBatch + t.byProductPerBatch + t.residuePerBatch + t.lossPerBatch;
  if (outputs !== t.inputPerBatch) {
    throw new Error(`Transformation must conserve matter: inputPerBatch ${t.inputPerBatch} != outputs ${outputs} (no net creation).`);
  }
}

export interface TransformationResult {
  readonly batches: number;
  readonly product: number;
  readonly byProduct: number;
  readonly residue: number;
  readonly loss: number;
  readonly cost: number;
  readonly remainingInput: number;
}

/** Transform available input into products, bounded by input and batch capacity; conserves matter exactly. */
export function transform(t: TransformationRecord, inputQuantity: number): TransformationResult {
  validateTransformation(t);
  if (!isWholeUsd(inputQuantity)) throw new Error('Input quantity must be a non-negative whole quantity.');
  const batches = Math.min(Math.floor(inputQuantity / t.inputPerBatch), t.capacityPerBatch);
  const consumed = batches * t.inputPerBatch;
  return {
    batches,
    product: batches * t.productPerBatch,
    byProduct: batches * t.byProductPerBatch,
    residue: batches * t.residuePerBatch,
    loss: batches * t.lossPerBatch,
    cost: batches * t.costPerBatch,
    remainingInput: inputQuantity - consumed,
  };
}
