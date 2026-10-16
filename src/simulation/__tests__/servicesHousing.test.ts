import { describe, it, expect } from 'vitest';
import {
  validateHousingStock, availableUnits, allocateHousing, applyRent, type HousingStock,
} from '../services/housing';

const stock = (over: Partial<HousingStock> = {}): HousingStock => ({
  id: 'hs1', regionId: 'region-7', totalUnits: 500, occupiedUnits: 400,
  qualityBps: 8000, maintenanceCostPerUnit: 50,
  ...over,
});

describe('housing (0.29.5)', () => {
  it('validates a housing stock and rejects malformed ones', () => {
    expect(() => validateHousingStock(stock())).not.toThrow();
    expect(() => validateHousingStock(stock({ occupiedUnits: 600 }))).toThrow(/cannot exceed total units/);
    expect(() => validateHousingStock(stock({ qualityBps: 20000 }))).toThrow(/qualityBps/);
  });

  it('allocates bounded by available units; the shortfall is a backlog', () => {
    expect(availableUnits(stock())).toBe(100);
    expect(allocateHousing(stock(), 80)).toEqual({ allocated: 80, backlog: 0 });
    expect(allocateHousing(stock(), 150)).toEqual({ allocated: 100, backlog: 50 });
  });

  it('fails closed on rent rules while BLOCKED_DESIGN', () => {
    expect(() => applyRent(stock(), 10)).toThrow(/BLOCKED_DESIGN/);
  });
});
