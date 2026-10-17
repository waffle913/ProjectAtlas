import { describe, it, expect } from 'vitest';
import {
  validateSupportLink, deliverSupportLink, deliverSupportChain, SUPPORT_OWNERS,
  type SupportLink,
} from '../military/supportChain';

const link = (over: Partial<SupportLink> = {}): SupportLink => ({
  id: 'l1', kind: 'fuel', requiredPerMonth: 100, available: 60, ...over,
});

describe('military support chain (0.31.5)', () => {
  it('names canonical owners — no second supply engine', () => {
    expect(SUPPORT_OWNERS.fuel).toBe('military.consumables');
    expect(SUPPORT_OWNERS.ammunition).toBe('military.consumables');
    expect(SUPPORT_OWNERS.parts).toBe('military.equipment');
    expect(SUPPORT_OWNERS.transport).toBe('trade');
    expect(SUPPORT_OWNERS.personnel).toBe('military');
  });

  it('delivers a link bounded by known stock; shortfall is a computed rupture', () => {
    expect(deliverSupportLink(link())).toEqual({ status: 'computed', delivered: 60, rupture: 40 });
    expect(deliverSupportLink(link({ available: 200 }))).toEqual({ status: 'computed', delivered: 100, rupture: 0 });
  });

  it('never fabricates a rupture for an unavailable requirement or stock', () => {
    expect(deliverSupportLink(link({ requiredPerMonth: null }))).toEqual({ status: 'unavailable', delivered: null, rupture: null });
    expect(deliverSupportLink(link({ available: null }))).toEqual({ status: 'unavailable', delivered: null, rupture: null });
  });

  it('delivers a whole chain; any unavailable link makes the chain unavailable', () => {
    expect(deliverSupportChain([link(), link({ id: 'l2', kind: 'ammunition', requiredPerMonth: 10, available: 10 })]).status).toBe('computed');
    expect(deliverSupportChain([link(), link({ id: 'l2', kind: 'ammunition', requiredPerMonth: null, available: 10 })]).status).toBe('unavailable');
    expect(() => deliverSupportChain([link(), link({ id: 'l1', kind: 'ammunition' })]).status).toThrow(/Duplicate support link id/);
  });

  it('rejects malformed links', () => {
    expect(() => validateSupportLink(link({ kind: 'magic' as never }))).toThrow(/Unknown support kind/);
    expect(() => validateSupportLink(link({ requiredPerMonth: 0 }))).toThrow(/positive whole number or null/);
    expect(() => validateSupportLink(link({ available: -1 }))).toThrow(/non-negative whole number or null/);
  });
});
