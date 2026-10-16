import { describe, it, expect } from 'vitest';
import {
  validatePoliceAuthority, canDirectPolice, validatePoliceOrder, validatePoliceStation,
  deployPolice, type PoliceAuthority, type PoliceOrder, type PoliceStation,
} from '../security/police';

const authority = (over: Partial<PoliceAuthority> = {}): PoliceAuthority => ({ basis: 'head_of_government', ...over } as PoliceAuthority);
const order = (over: Partial<PoliceOrder> = {}): PoliceOrder => ({
  id: 'o1', countryId: 'country-a', regionId: 'region-1', kind: 'public_order',
  authority: authority(), emergencyPowersActive: false, date: '2026-02-01', note: 'maintain public order',
  ...over,
});
const station = (over: Partial<PoliceStation> = {}): PoliceStation => ({
  id: 's1', regionId: 'region-1', personnel: 20, status: 'operating', ...over,
});

describe('police (0.30.5)', () => {
  it('resolves authority only from the office that holds it; unresolved fails closed', () => {
    expect(canDirectPolice(authority())).toBe(true);
    expect(canDirectPolice(authority({ basis: 'presidential_head_of_state' }))).toBe(true);
    expect(canDirectPolice(authority({ basis: 'interior_portfolio', portfolioId: 'interior' }))).toBe(true);
    expect(canDirectPolice(authority({ basis: 'unresolved' }))).toBe(false);
    expect(() => validatePoliceAuthority(authority({ basis: 'interior_portfolio', portfolioId: '' }))).toThrow(/portfolio id/);
    expect(() => validatePoliceAuthority(authority({ basis: 'rebel' as never }))).toThrow(/Unknown police authority basis/);
  });

  it('validates an order and gates emergency enforcement on real active powers', () => {
    expect(() => validatePoliceOrder(order())).not.toThrow();
    expect(() => validatePoliceOrder(order({ kind: 'emergency_enforcement', emergencyPowersActive: true }))).not.toThrow();
    expect(() => validatePoliceOrder(order({ kind: 'emergency_enforcement', emergencyPowersActive: false }))).toThrow(/active emergency police powers/);
    expect(() => validatePoliceOrder(order({ authority: authority({ basis: 'unresolved' }) }))).not.toThrow(); // unresolved authority is representable, just never directs
    expect(() => validatePoliceOrder(order({ kind: 'arrest' as never }))).toThrow(/Unknown police order kind/);
    expect(() => validatePoliceOrder(order({ date: 'bad' }))).toThrow(/valid simulation date/);
  });

  it('deploys personnel bounded by station strength and availability; shortfall is a computed backlog', () => {
    expect(deployPolice(station(), 10, 50)).toEqual({ status: 'computed', deployed: 10, backlog: 0 });
    expect(deployPolice(station(), 30, 50)).toEqual({ status: 'computed', deployed: 20, backlog: 10 });
    expect(deployPolice(station(), 10, 5)).toEqual({ status: 'computed', deployed: 5, backlog: 5 });
  });

  it('never fabricates a shortage for unavailable/paused stations', () => {
    expect(deployPolice(station({ personnel: null }), 10, 50)).toEqual({ status: 'unavailable', deployed: 0, backlog: null });
    expect(deployPolice(station({ status: 'unavailable' }), 10, 50)).toEqual({ status: 'unavailable', deployed: 0, backlog: null });
    expect(deployPolice(station({ status: 'paused' }), 10, 50)).toEqual({ status: 'paused', deployed: 0, backlog: null });
  });

  it('rejects malformed stations', () => {
    expect(() => validatePoliceStation(station({ personnel: 0 }))).toThrow(/positive whole number or null/);
    expect(() => validatePoliceStation(station({ status: 'destroyed' as never }))).toThrow(/Unknown status/);
    expect(() => deployPolice(station({ personnel: 0 }), 10, 50)).toThrow(/positive whole number or null/);
  });
});
