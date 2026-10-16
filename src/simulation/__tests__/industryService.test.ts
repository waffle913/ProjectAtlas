import { describe, it, expect } from 'vitest';
import {
  validateServiceSector, deliverService, type ServiceSector, type ServiceResources,
} from '../industry/service';

const sector = (over: Partial<ServiceSector> = {}): ServiceSector => ({
  id: 'legal-a', personnelPerUnit: 2, capacityPerMonth: 100, costPerMonth: 5000,
  pricePerUnit: 120, purchases: { paper: 10 }, status: 'operating',
  ...over,
});

const resources = (over: Partial<ServiceResources> = {}): ServiceResources => ({ funds: 5000, purchases: { paper: 10 }, ...over });

describe('industry service sectors (0.28.4)', () => {
  it('validates a service sector and rejects malformed ones', () => {
    expect(() => validateServiceSector(sector())).not.toThrow();
    expect(() => validateServiceSector(sector({ id: '' }))).toThrow(/non-empty id/);
    expect(() => validateServiceSector(sector({ capacityPerMonth: 0 }))).toThrow(/positive whole number or null/);
    expect(() => validateServiceSector(sector({ pricePerUnit: -1 }))).toThrow(/non-negative whole-USD/);
    expect(() => validateServiceSector(sector({ purchases: { '': 1 } }))).toThrow(/non-empty product ids/);
  });

  it('delivers bounded by capacity and personnel; the rest is a shortfall, never stock', () => {
    const r = deliverService(sector(), 80, 200, resources());
    expect(r.status).toBe('computed');
    expect(r.delivered).toBe(80);
    expect(r.shortfall).toBe(0);
    expect(r.revenue).toBe(9600);
    expect(r.personnelUsed).toBe(160);
  });

  it('bounds delivery by personnel availability', () => {
    const r = deliverService(sector(), 100, 40, resources()); // 40 personnel / 2 = 20 units
    expect(r.delivered).toBe(20);
    expect(r.shortfall).toBe(80);
  });

  it('A7: delivers nothing typed when not operating or capacity unavailable, without asserting a shortage', () => {
    const paused = deliverService(sector({ status: 'paused' }), 50, 200, resources());
    expect(paused).toMatchObject({ status: 'paused', delivered: 0, shortfall: null });
    const unknown = deliverService(sector({ capacityPerMonth: null }), 50, 200, resources());
    expect(unknown).toMatchObject({ status: 'unavailable', delivered: 0, shortfall: null });
  });

  it('A3: cannot operate through a budget or purchase shortage', () => {
    const noFunds = deliverService(sector(), 50, 200, resources({ funds: 1000 }));
    expect(noFunds.delivered).toBe(0);
    expect(noFunds.shortfall).toBe(50);
    const noPaper = deliverService(sector(), 50, 200, resources({ purchases: { paper: 9 } }));
    expect(noPaper.delivered).toBe(0);
    expect(noPaper.shortfall).toBe(50);
  });

  it('rejects fractional demand or personnel', () => {
    expect(() => deliverService(sector(), 1.5, 200, resources())).toThrow(/non-negative whole number/);
    expect(() => deliverService(sector(), 50, 1.5, resources())).toThrow(/non-negative whole number/);
  });
});
