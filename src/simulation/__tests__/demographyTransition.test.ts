import { describe, it, expect } from 'vitest';
import {
  validateTransition, applyTransition, validatePopulationMove, applyMove,
  type DemographicTransition, type PopulationMove,
} from '../demography/transition';

const t = (over: Partial<DemographicTransition> = {}): DemographicTransition => ({
  id: 't1', cohortKey: 'low-left', kind: 'birth', count: 10, date: '2026-02-01',
  ...over,
});

const move = (over: Partial<PopulationMove> = {}): PopulationMove => ({
  id: 'm1', originCohortKey: 'low-left', destinationCohortKey: 'low-right', count: 10, date: '2026-02-01',
  ...over,
});

describe('demographic transitions (0.30.2)', () => {
  it('validates an intrinsic transition and rejects malformed ones', () => {
    expect(() => validateTransition(t())).not.toThrow();
    expect(() => validateTransition(t({ kind: 'move' as never }))).toThrow(/Unknown transition kind/);
    expect(() => validateTransition(t({ count: 0 }))).toThrow(/positive whole number/);
    expect(() => validateTransition(t({ date: 'bad' }))).toThrow(/valid simulation date/);
  });

  it('applies conserved intrinsic transitions (birth adds, death subtracts)', () => {
    expect(applyTransition(100, t())).toBe(110);
    expect(applyTransition(100, t({ kind: 'death' }))).toBe(90);
  });

  it('never makes a cohort population negative', () => {
    expect(() => applyTransition(5, t({ kind: 'death', count: 10 }))).toThrow(/negative/);
  });

  it('A8: internal movements are atomic, conserved transfers between two cohorts', () => {
    expect(() => validatePopulationMove(move())).not.toThrow();
    expect(() => validatePopulationMove(move({ destinationCohortKey: 'low-left' }))).toThrow(/distinct/);
    const r = applyMove(100, 50, move());
    expect(r).toEqual({ origin: 90, destination: 60 });
    expect(r.origin + r.destination).toBe(150); // conserved (100 + 50)
  });

  it('A8: a move never makes the origin cohort negative', () => {
    expect(() => applyMove(5, 50, move({ count: 10 }))).toThrow(/negative/);
  });

  it('A10: fails closed on safe-integer overflow (birth and move destination)', () => {
    expect(() => applyTransition(Number.MAX_SAFE_INTEGER, t({ count: 1 }))).toThrow(/overflow/);
    expect(() => applyMove(0, Number.MAX_SAFE_INTEGER, move({ count: 1 }))).toThrow(/overflow/);
  });
});
