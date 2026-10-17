import { describe, it, expect } from 'vitest';
import {
  validateProcess, runProcess, type IndustrialProcess, type ProcessResources,
} from '../industry/process';

// matter in 10 + 5 = 15; out 12 + 1 (by) + 1 (residue) + 1 (loss) = 15.
const process = (over: Partial<IndustrialProcess> = {}): IndustrialProcess => ({
  id: 'widget-line', unitOfAccount: 'unit', inputs: { steel: 10, plastic: 5 }, outputs: { widget: 12 },
  byProducts: { scrap: 1 }, residues: 1, materialLoss: 1,
  energyPerBatch: 50, personnelPerBatch: 3, costPerBatch: 200, capacityPerBatch: null,
  ...over,
});

const resources = (over: Partial<ProcessResources> = {}): ProcessResources => ({ energy: 1000, personnel: 100, funds: 10000, ...over });

describe('industry transformation chains (0.28.2)', () => {
  it('validates a matter-conserving process', () => {
    expect(() => validateProcess(process())).not.toThrow();
  });

  it('rejects a process that creates or destroys matter', () => {
    expect(() => validateProcess(process({ outputs: { widget: 13 } }))).toThrow(/must conserve matter/);
    expect(() => validateProcess(process({ materialLoss: 2 }))).toThrow(/must conserve matter/);
  });

  it('rejects missing inputs/outputs, malformed quantities and a missing unit of account', () => {
    expect(() => validateProcess(process({ inputs: {} }))).toThrow(/at least one material input/);
    expect(() => validateProcess(process({ outputs: {} }))).toThrow(/at least one output product/);
    expect(() => validateProcess(process({ inputs: { steel: 0 } }))).toThrow(/positive whole numbers/);
    expect(() => validateProcess(process({ capacityPerBatch: 0 }))).toThrow(/positive whole number or null/);
    expect(() => validateProcess(process({ unitOfAccount: '' }))).toThrow(/unit of account/);
  });

  it('runs bounded by available inputs and capacity, conserving matter per batch', () => {
    const r = runProcess(process({ capacityPerBatch: 100 }), { steel: 25, plastic: 20 }, resources());
    expect(r.batches).toBe(2);           // steel 25/10=2, plastic 20/5=4 -> 2
    expect(r.outputs.widget).toBe(24);
    expect(r.byProducts.scrap).toBe(2);
    expect(r.residues).toBe(2);
    expect(r.materialLoss).toBe(2);
    expect(r.consumedInputs.steel).toBe(20);
    expect(r.remainingInputs.steel).toBe(5);
    expect(r.energy).toBe(100);
    expect(r.cost).toBe(400);
  });

  it('saturates at the batch capacity', () => {
    const r = runProcess(process({ capacityPerBatch: 1 }), { steel: 100, plastic: 100 }, resources());
    expect(r.batches).toBe(1);
  });

  it('rejects fractional available inputs', () => {
    expect(() => runProcess(process({ capacityPerBatch: 100 }), { steel: 1.5, plastic: 10 }, resources())).toThrow(/non-negative whole quantity/);
  });

  it('A2: fails closed on unavailable (null) capacity instead of producing unbounded batches', () => {
    expect(() => runProcess(process(), { steel: 100, plastic: 100 }, resources())).toThrow(/unavailable/);
  });

  it('A3: production is bounded by available energy, personnel and funds', () => {
    const inputs = { steel: 1000, plastic: 1000 };
    expect(runProcess(process({ capacityPerBatch: 100 }), inputs, resources({ energy: 49 })).batches).toBe(0);      // 50/batch
    expect(runProcess(process({ capacityPerBatch: 100 }), inputs, resources({ personnel: 2 })).batches).toBe(0);   // 3/batch
    expect(runProcess(process({ capacityPerBatch: 100 }), inputs, resources({ funds: 199 })).batches).toBe(0);     // 200/batch
    expect(runProcess(process({ capacityPerBatch: 100 }), inputs, resources({ energy: 150 })).batches).toBe(3);    // 150/50=3
  });

  it('A10: fails closed on safe-integer overflow in scaled outputs', () => {
    const huge: IndustrialProcess = {
      id: 'huge', unitOfAccount: 'unit', inputs: { a: 1, c: 1 }, outputs: { b: 2 }, byProducts: {},
      residues: 0, materialLoss: 0, energyPerBatch: 0, personnelPerBatch: 0, costPerBatch: 0,
      capacityPerBatch: Number.MAX_SAFE_INTEGER,
    };
    expect(() => runProcess(huge, { a: Number.MAX_SAFE_INTEGER, c: Number.MAX_SAFE_INTEGER }, resources())).toThrow(/overflow/);
  });
});
