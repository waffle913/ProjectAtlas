import { describe, it, expect } from 'vitest';
import {
  validateTransformation, transform, type TransformationRecord,
} from '../resources/transformation';

// input 100 = product 80 + byProduct 10 + residue 5 + loss 5 (conserving).
const rec = (over: Partial<TransformationRecord> = {}): TransformationRecord => ({
  id: 'smelt-a', inputResourceId: 'ore', productId: 'metal',
  byProductId: 'slag', residueId: 'tailings',
  inputPerBatch: 100, productPerBatch: 80, byProductPerBatch: 10, residuePerBatch: 5, lossPerBatch: 5,
  costPerBatch: 50, capacityPerBatch: 10,
  ...over,
});

describe('resources refining/transformation (0.27.4)', () => {
  it('accepts a matter-conserving transformation', () => {
    expect(() => validateTransformation(rec())).not.toThrow();
  });

  it('rejects a transformation that creates or destroys matter', () => {
    expect(() => validateTransformation(rec({ productPerBatch: 90 }))).toThrow(/must conserve matter/);
    expect(() => validateTransformation(rec({ lossPerBatch: 15 }))).toThrow(/must conserve matter/);
  });

  it('rejects malformed quantities and empty ids', () => {
    expect(() => validateTransformation(rec({ id: '' }))).toThrow(/non-empty id/);
    expect(() => validateTransformation(rec({ inputPerBatch: 0 }))).toThrow(/positive whole quantity/);
    expect(() => validateTransformation(rec({ capacityPerBatch: 0 }))).toThrow(/capacityPerBatch positive/);
    expect(() => validateTransformation(rec({ productPerBatch: -1 }))).toThrow(/non-negative whole number/);
  });

  it('transforms input into products/by-products/residues/loss, conserving matter exactly', () => {
    const r = transform(rec(), 250);
    expect(r.batches).toBe(2);            // floor(250/100)=2, capacity 10
    expect(r.product).toBe(160);
    expect(r.byProduct).toBe(20);
    expect(r.residue).toBe(10);
    expect(r.loss).toBe(10);
    expect(r.cost).toBe(100);
    expect(r.remainingInput).toBe(50);
    expect(r.product + r.byProduct + r.residue + r.loss).toBe(2 * 100);
  });

  it('saturates at the installation batch capacity', () => {
    const r = transform(rec({ capacityPerBatch: 1 }), 1000);
    expect(r.batches).toBe(1);
    expect(r.remainingInput).toBe(900);
  });

  it('rejects a fractional input quantity', () => {
    expect(() => transform(rec(), 1.5)).toThrow(/non-negative whole quantity/);
  });
});
