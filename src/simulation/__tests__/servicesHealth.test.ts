import { describe, it, expect } from 'vitest';
import {
  validateHealthEstablishment, deliverCare, type HealthEstablishment,
} from '../services/health';

const hospital = (over: Partial<HealthEstablishment> = {}): HealthEstablishment => ({
  id: 'h1', regionId: 'region-7', capacity: 100, personnelPerUnit: 3, status: 'operating',
  ...over,
});

describe('health establishments (0.29.2)', () => {
  it('validates an establishment and rejects malformed ones', () => {
    expect(() => validateHealthEstablishment(hospital())).not.toThrow();
    expect(() => validateHealthEstablishment(hospital({ id: '' }))).toThrow(/non-empty id/);
    expect(() => validateHealthEstablishment(hospital({ capacity: 0 }))).toThrow(/positive whole number or null/);
    expect(() => validateHealthEstablishment(hospital({ status: 'destroyed' as never }))).toThrow(/Unknown status/);
  });

  it('delivers care bounded by capacity and personnel; the shortfall is a backlog, never stock', () => {
    const r = deliverCare(hospital(), 80, 300);
    expect(r.status).toBe('computed');
    expect(r.delivered).toBe(80);
    expect(r.backlog).toBe(0);
    expect(r.personnelUsed).toBe(240);
  });

  it('bounds delivery by personnel availability', () => {
    const r = deliverCare(hospital(), 100, 90); // 90 / 3 = 30 units
    expect(r.delivered).toBe(30);
    expect(r.backlog).toBe(70);
  });

  it('A7: unavailable capacity is typed unavailable, never a fabricated shortage', () => {
    const r = deliverCare(hospital({ capacity: null }), 50, 300);
    expect(r).toMatchObject({ status: 'unavailable', delivered: 0, backlog: null });
    const paused = deliverCare(hospital({ status: 'paused' }), 50, 300);
    expect(paused).toMatchObject({ status: 'paused', delivered: 0, backlog: null });
  });

  it('rejects fractional demand or personnel', () => {
    expect(() => deliverCare(hospital(), 1.5, 300)).toThrow(/non-negative whole number/);
  });
});
