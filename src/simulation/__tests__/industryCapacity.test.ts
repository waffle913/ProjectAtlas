import { describe, it, expect } from 'vitest';
import {
  validateCapacityProfile, effectiveBatchesPerMonth, planBatches, type CapacityProfile,
} from '../industry/capacity';
import type { IndustrialProcess } from '../industry/process';

const profile = (over: Partial<CapacityProfile> = {}): CapacityProfile => ({
  nominalBatchesPerMonth: 100, utilizationBps: 10000, maintenanceOutageBps: 0, ...over,
});
const process: IndustrialProcess = {
  id: 'p', inputs: { steel: 10 }, outputs: { widget: 8 }, byProducts: {},
  residues: 0, materialLoss: 2, energyPerBatch: 0, personnelPerBatch: 0, costPerBatch: 0, capacityPerBatch: null,
};

describe('industry capacities and bottlenecks (0.28.3)', () => {
  it('validates a capacity profile and rejects bad bps', () => {
    expect(() => validateCapacityProfile(profile())).not.toThrow();
    expect(() => validateCapacityProfile(profile({ utilizationBps: 20000 }))).toThrow(/utilizationBps/);
    expect(() => validateCapacityProfile(profile({ maintenanceOutageBps: -1 }))).toThrow(/maintenanceOutageBps/);
  });

  it('computes effective batches after utilization and maintenance, never negative', () => {
    expect(effectiveBatchesPerMonth(profile())).toBe(100);
    expect(effectiveBatchesPerMonth(profile({ utilizationBps: 7000 }))).toBe(70);
    expect(effectiveBatchesPerMonth(profile({ utilizationBps: 7000, maintenanceOutageBps: 3000 }))).toBe(40);
    expect(effectiveBatchesPerMonth(profile({ maintenanceOutageBps: 10000 }))).toBe(0);
  });

  it('plans production bounded by effective capacity and inputs, reporting the binding constraint', () => {
    expect(planBatches(process, { steel: 1000 }, profile({ nominalBatchesPerMonth: 10 }))).toEqual({ batches: 10, binding: 'capacity' });
    expect(planBatches(process, { steel: 35 }, profile({ nominalBatchesPerMonth: 100 }))).toEqual({ batches: 3, binding: 'steel' });
  });

  it('rejects fractional available inputs', () => {
    expect(() => planBatches(process, { steel: 1.5 }, profile())).toThrow(/non-negative whole quantity/);
  });
});
