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
    const a = allocateHousing(stock(), 80);
    expect(a.allocated).toBe(80);
    expect(a.backlog).toBe(0);
    expect(a.next.occupiedUnits).toBe(480);
    const b = allocateHousing(stock(), 150);
    expect(b.allocated).toBe(100);
    expect(b.backlog).toBe(50);
  });

  it('A14: threading the committed stock prevents double-allocating the same units', () => {
    const first = allocateHousing(stock(), 80);
    const second = allocateHousing(first.next, 80);
    expect(second.allocated).toBe(20); // only 20 of the original 100 remain
    expect(second.backlog).toBe(60);
    expect(second.next.occupiedUnits).toBe(500);
  });

  it('fails closed on rent rules while BLOCKED_DESIGN', () => {
    expect(() => applyRent(stock(), 10)).toThrow(/BLOCKED_DESIGN/);
  });
});
