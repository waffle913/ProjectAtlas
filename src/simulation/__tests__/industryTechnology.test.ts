import { describe, it, expect } from 'vitest';
import {
  validateTechnologyLink, applyCapacityEffect, type TechnologyLink,
} from '../industry/technology';

const link = (over: Partial<TechnologyLink> = {}): TechnologyLink => ({
  id: 'l1', technologyId: 't1', domain: 'military', targetProductId: 'artillery', capacityMultiplierBps: 12000,
  ...over,
});

describe('industry military/civilian technology (0.28.7)', () => {
  it('validates a technology link and rejects malformed ones', () => {
    expect(() => validateTechnologyLink(link())).not.toThrow();
    expect(() => validateTechnologyLink(link({ id: '' }))).toThrow(/non-empty id/);
    expect(() => validateTechnologyLink(link({ domain: 'space' as never }))).toThrow(/Unknown domain/);
    expect(() => validateTechnologyLink(link({ capacityMultiplierBps: -1 }))).toThrow(/non-negative integer bps/);
  });

  it('applies a production-capacity effect (never a readiness change)', () => {
    expect(applyCapacityEffect(1000, 12000)).toBe(1200);
    expect(applyCapacityEffect(1000, 10000)).toBe(1000);
    expect(applyCapacityEffect(1000, 8000)).toBe(800);
  });

  it('keeps null capacity unavailable', () => {
    expect(applyCapacityEffect(null, 12000)).toBeNull();
  });

  it('rejects fractional base capacity', () => {
    expect(() => applyCapacityEffect(1.5, 10000)).toThrow(/non-negative whole number or null/);
  });
});
