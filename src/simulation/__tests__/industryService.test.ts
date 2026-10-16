import { describe, it, expect } from 'vitest';
import {
  validateServiceSector, deliverService, type ServiceSector,
} from '../industry/service';

const sector = (over: Partial<ServiceSector> = {}): ServiceSector => ({
  id: 'legal-a', personnelPerUnit: 2, capacityPerMonth: 100, costPerMonth: 5000,
  pricePerUnit: 120, purchases: { paper: 10 }, status: 'operating',
  ...over,
});

describe('industry service sectors (0.28.4)', () => {
  it('validates a service sector and rejects malformed ones', () => {
    expect(() => validateServiceSector(sector())).not.toThrow();
    expect(() => validateServiceSector(sector({ id: '' }))).toThrow(/non-empty id/);
    expect(() => validateServiceSector(sector({ capacityPerMonth: 0 }))).toThrow(/positive whole number or null/);
    expect(() => validateServiceSector(sector({ pricePerUnit: -1 }))).toThrow(/non-negative whole-USD/);
    expect(() => validateServiceSector(sector({ purchases: { '': 1 } }))).toThrow(/non-empty product ids/);
  });

  it('delivers bounded by capacity and personnel; the rest is a shortfall, never stock', () => {
    const r = deliverService(sector(), 80, 200);
    expect(r.delivered).toBe(80);
    expect(r.shortfall).toBe(0);
    expect(r.revenue).toBe(9600);
    expect(r.personnelUsed).toBe(160);
  });

  it('bounds delivery by personnel availability', () => {
    const r = deliverService(sector(), 100, 40); // 40 personnel / 2 = 20 units
    expect(r.delivered).toBe(20);
    expect(r.shortfall).toBe(80);
  });

  it('delivers nothing when not operating or capacity unavailable', () => {
    expect(deliverService(sector({ status: 'paused' }), 50, 200).delivered).toBe(0);
    expect(deliverService(sector({ capacityPerMonth: null }), 50, 200).delivered).toBe(0);
  });

  it('rejects fractional demand or personnel', () => {
    expect(() => deliverService(sector(), 1.5, 200)).toThrow(/non-negative whole number/);
    expect(() => deliverService(sector(), 50, 1.5)).toThrow(/non-negative whole number/);
  });
});
