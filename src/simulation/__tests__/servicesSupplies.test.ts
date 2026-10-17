import { describe, it, expect } from 'vitest';
import {
  validateSupplyRequirement, meetSupply, meetSupplies, type SupplyRequirement,
} from '../services/supplies';

const req = (over: Partial<SupplyRequirement> = {}): SupplyRequirement => ({
  id: 'r1', itemId: 'insulin', requiredPerMonth: 100, essential: true,
  ...over,
});

describe('service supplies (0.29.3)', () => {
  it('validates a requirement and rejects malformed ones', () => {
    expect(() => validateSupplyRequirement(req())).not.toThrow();
    expect(() => validateSupplyRequirement(req({ id: '' }))).toThrow(/non-empty id/);
    expect(() => validateSupplyRequirement(req({ requiredPerMonth: 0 }))).toThrow(/positive whole quantity/);
    expect(() => validateSupplyRequirement(req({ essential: 'yes' as never }))).toThrow(/boolean/);
  });

  it('meets a requirement from available stock; the shortfall is a supply rupture', () => {
    expect(meetSupply(req(), 120)).toEqual({ itemId: 'insulin', delivered: 100, rupture: 0 });
    expect(meetSupply(req(), 40)).toEqual({ itemId: 'insulin', delivered: 40, rupture: 60 });
  });

  it('meets a set of requirements, each bounded by its available stock', () => {
    const outcomes = meetSupplies([req(), req({ id: 'r2', itemId: 'oxygen', requiredPerMonth: 50 })], { insulin: 80, oxygen: 60 });
    expect(outcomes).toEqual([
      { itemId: 'insulin', delivered: 80, rupture: 20 },
      { itemId: 'oxygen', delivered: 50, rupture: 0 },
    ]);
  });

  it('A4: never double-attributes a shared stock across requirements on the same item', () => {
    const outcomes = meetSupplies(
      [req({ id: 'r1', requiredPerMonth: 70 }), req({ id: 'r2', requiredPerMonth: 70 })],
      { insulin: 80 },
    );
    expect(outcomes).toEqual([
      { itemId: 'insulin', delivered: 70, rupture: 0 },
      { itemId: 'insulin', delivered: 10, rupture: 60 },
    ]);
  });

  it('A4: serves essential requirements before non-essential ones (deterministic)', () => {
    const outcomes = meetSupplies(
      [req({ id: 'r1', requiredPerMonth: 70, essential: false }), req({ id: 'r2', requiredPerMonth: 70, essential: true })],
      { insulin: 80 },
    );
    expect(outcomes).toEqual([
      { itemId: 'insulin', delivered: 10, rupture: 60 },   // non-essential served second
      { itemId: 'insulin', delivered: 70, rupture: 0 },    // essential served first
    ]);
  });

  it('A4: fails closed on an ambiguous duplicate requirement id', () => {
    expect(() => meetSupplies([req({ id: 'r1' }), req({ id: 'r1' })], { insulin: 200 })).toThrow(/duplicate/);
  });

  it('rejects fractional available stock', () => {
    expect(() => meetSupply(req(), 1.5)).toThrow(/non-negative whole quantity/);
  });
});
