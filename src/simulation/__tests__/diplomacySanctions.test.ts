import { describe, it, expect } from 'vitest';
import {
  validateCoercionMeasure, internationalActionKindFor, COERCION_OWNERS,
  type CoercionMeasure,
} from '../diplomacy/sanctions';

const measure = (over: Partial<CoercionMeasure> = {}): CoercionMeasure => ({
  id: 'm1', actorCountryId: 'country-a', mandate: { basis: 'head_of_government' }, targetCountryId: 'country-b',
  kind: 'sanction', categories: ['energy'], date: '2026-02-01', note: 'targeted energy sanctions',
  ...over,
});

describe('sanctions, embargoes and dependencies (0.31.3)', () => {
  it('maps each coercion kind onto an existing system, never a second one', () => {
    expect(COERCION_OWNERS.condemnation).toBe('international.actions');
    expect(COERCION_OWNERS.sanction).toBe('international.actions');
    expect(COERCION_OWNERS.embargo).toBe('international.actions');
    expect(COERCION_OWNERS.intervention).toBe('operations');
    expect(internationalActionKindFor('condemnation')).toBe('condemnation');
    expect(internationalActionKindFor('sanction')).toBe('import_restriction');
    expect(internationalActionKindFor('intervention')).toBeNull();
  });

  it('validates a trade control with categories and a real mandate', () => {
    expect(() => validateCoercionMeasure(measure())).not.toThrow();
    expect(() => validateCoercionMeasure(measure({ kind: 'embargo', categories: ['energy', 'food'] }))).not.toThrow();
    expect(() => validateCoercionMeasure(measure({ mandate: { basis: 'unresolved' } }))).toThrow(/fails closed/);
    expect(() => validateCoercionMeasure(measure({ targetCountryId: 'country-a' }))).toThrow(/distinct/);
    expect(() => validateCoercionMeasure(measure({ categories: [] }))).toThrow(/at least one/);
    expect(() => validateCoercionMeasure(measure({ categories: ['magic' as never] }))).toThrow(/known trade categories/);
  });

  it('rejects trade categories on non-trade coercion', () => {
    expect(() => validateCoercionMeasure(measure({ kind: 'condemnation', categories: [] }))).not.toThrow();
    expect(() => validateCoercionMeasure(measure({ kind: 'condemnation', categories: ['energy'] }))).toThrow(/not a trade control/);
    expect(() => validateCoercionMeasure(measure({ kind: 'intervention', categories: ['energy'] }))).toThrow(/not a trade control/);
  });
});
