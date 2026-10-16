import { describe, it, expect } from 'vitest';
import {
  validateTransition, applyTransition, type DemographicTransition,
} from '../demography/transition';

const t = (over: Partial<DemographicTransition> = {}): DemographicTransition => ({
  id: 't1', cohortKey: 'low-left', kind: 'birth', count: 10, date: '2026-02-01',
  ...over,
});

describe('demographic transitions (0.30.2)', () => {
  it('validates a transition and rejects malformed ones', () => {
    expect(() => validateTransition(t())).not.toThrow();
    expect(() => validateTransition(t({ kind: 'zombie' as never }))).toThrow(/Unknown transition kind/);
    expect(() => validateTransition(t({ count: 0 }))).toThrow(/positive whole number/);
    expect(() => validateTransition(t({ date: 'bad' }))).toThrow(/valid simulation date/);
  });

  it('applies conserved transitions (birth/move_in add, death/move_out subtract)', () => {
    expect(applyTransition(100, t())).toBe(110);
    expect(applyTransition(100, t({ kind: 'death' }))).toBe(90);
    expect(applyTransition(100, t({ kind: 'move_in' }))).toBe(110);
    expect(applyTransition(100, t({ kind: 'move_out' }))).toBe(90);
  });

  it('never makes a cohort population negative', () => {
    expect(() => applyTransition(5, t({ kind: 'death', count: 10 }))).toThrow(/negative/);
  });
});
