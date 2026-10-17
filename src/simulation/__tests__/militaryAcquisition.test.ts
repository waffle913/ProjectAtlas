import { describe, it, expect } from 'vitest';
import {
  validateAcquisitionOrder, planAcquisition, ACQUISITION_OWNERS, type AcquisitionOrder,
} from '../military/acquisition';

const order = (over: Partial<AcquisitionOrder> = {}): AcquisitionOrder => ({
  id: 'o1', item: 'personal', quantity: 25, factoryCapacityPerMonth: 10, fundedUsd: 100000,
  unitCostUsd: 1000, orderedOn: '2026-02-01', note: 'acquire personal equipment',
  ...over,
});

describe('military industry and acquisition (0.31.6)', () => {
  it('names canonical owners — no second order/factory/financing engine', () => {
    expect(ACQUISITION_OWNERS.orders).toBe('military.orders');
    expect(ACQUISITION_OWNERS.factory).toBe('industry');
    expect(ACQUISITION_OWNERS.financing).toBe('finance');
  });

  it('plans production bounded by factory capacity; never instant', () => {
    expect(planAcquisition(order())).toEqual({ status: 'computed', funded: true, totalCostUsd: 25000, monthsToComplete: 3 });
    expect(planAcquisition(order({ quantity: 1, factoryCapacityPerMonth: 100 })).monthsToComplete).toBe(1);
  });

  it('requires full funding before production can start', () => {
    expect(planAcquisition(order({ fundedUsd: null })).status).toBe('paused');
    expect(planAcquisition(order({ fundedUsd: 10000 })).status).toBe('paused'); // 10000 < 25000
  });

  it('types unavailable and documented-zero capacity, never fabricating a schedule', () => {
    expect(planAcquisition(order({ factoryCapacityPerMonth: null })).status).toBe('unavailable');
    expect(planAcquisition(order({ factoryCapacityPerMonth: 0 })).status).toBe('known_zero');
  });

  it('fails closed on overflow and malformed orders', () => {
    expect(() => planAcquisition(order({ quantity: Number.MAX_SAFE_INTEGER, unitCostUsd: 2 }))).toThrow(/overflow/);
    expect(() => validateAcquisitionOrder(order({ item: 'magic' as never }))).toThrow(/Unknown military item/);
    expect(() => validateAcquisitionOrder(order({ quantity: 0 }))).toThrow(/positive whole number/);
    expect(() => validateAcquisitionOrder(order({ unitCostUsd: 0 }))).toThrow(/positive whole number/);
  });
});
