import { describe, it, expect } from 'vitest';
import {
  validateOpinionShift, applyOpinionShift, mobilize, OPINION_OWNERS, type OpinionShift,
} from '../media/opinion';

const shift = (over: Partial<OpinionShift> = {}): OpinionShift => ({
  id: 'sh-1', regionId: 'region-1', cohortKey: null, deltaBps: 500,
  causeId: 'event-1', date: '2026-02-01', note: 'material event reaction',
  ...over,
});

describe('opinion and mobilization (0.32.5)', () => {
  it('names canonical owners and validates a causal shift', () => {
    expect(OPINION_OWNERS.opinion).toBe('politics.opinion');
    expect(() => validateOpinionShift(shift())).not.toThrow();
    expect(() => validateOpinionShift(shift({ deltaBps: 20000 }))).toThrow(/between -10000 and 10000/);
    expect(() => validateOpinionShift(shift({ causeId: '' }))).toThrow(/cause id/);
  });

  it('applies a causal shift clamped to [0, 10000], never negative', () => {
    expect(applyOpinionShift(5000, shift())).toBe(5500);
    expect(applyOpinionShift(5000, shift({ deltaBps: -8000 }))).toBe(0);
    expect(applyOpinionShift(9800, shift({ deltaBps: 500 }))).toBe(10000);
  });

  it('bounds mobilization by support and networks; unknown inputs are never zero', () => {
    expect(mobilize(6000, 8000)).toEqual({ status: 'computed', capacityBps: 6000 });
    expect(mobilize(null, 8000)).toEqual({ status: 'unavailable', capacityBps: null });
    expect(() => mobilize(20000, 8000)).toThrow(/between 0 and 10000/);
  });
});
