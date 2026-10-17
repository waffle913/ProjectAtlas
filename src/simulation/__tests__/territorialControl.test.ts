import { describe, it, expect } from 'vitest';
import {
  validateControlChange, applyAssetDamage, TERRITORIAL_CONTROL_OWNERS, type ControlChange,
} from '../operations/territorialControl';

const change = (over: Partial<ControlChange> = {}): ControlChange => ({
  id: 'c1', regionId: 'region-1', newControl: 'contested', newOccupation: true,
  date: '2026-02-01', note: 'contested region under occupation',
  ...over,
});

describe('operations and territorial control (0.31.8)', () => {
  it('names the three distinct layers — sovereignty never redrawn', () => {
    expect(TERRITORIAL_CONTROL_OWNERS.sovereignty).toBe('state.regionOwnership');
    expect(TERRITORIAL_CONTROL_OWNERS.control).toBe('operations.regionControl');
    expect(TERRITORIAL_CONTROL_OWNERS.occupation).toBe('operations.occupation');
  });

  it('validates a control change (effective control + occupation, never sovereignty)', () => {
    expect(() => validateControlChange(change())).not.toThrow();
    expect(() => validateControlChange(change({ newControl: 'foreign_controlled' }))).not.toThrow();
    expect(() => validateControlChange(change({ newControl: 'annexed' as never }))).toThrow(/Unknown control status/);
    expect(() => validateControlChange(change({ date: 'bad' }))).toThrow(/valid simulation date/);
  });

  it('applies bounded asset damage; never negative and never auto-repaired', () => {
    expect(applyAssetDamage(10000, 2500)).toBe(7500);
    expect(applyAssetDamage(2000, 2500)).toBe(0);
    expect(applyAssetDamage(7500, 2500)).toBe(5000); // a second hit still reduces (no auto-repair)
    expect(() => applyAssetDamage(10001, 100)).toThrow(/between 0 and 10000/);
    expect(() => applyAssetDamage(10000, -1)).toThrow(/between 0 and 10000/);
  });
});
