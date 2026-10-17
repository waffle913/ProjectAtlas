import { describe, it, expect } from 'vitest';
import {
  validateCoercionMeasure, internationalActionKindFor, COERCION_OWNERS,
  type CoercionMeasure,
} from '../diplomacy/sanctions';

const measure = (over: Partial<CoercionMeasure> = {}): CoercionMeasure => ({
  id: 'm1', actorCountryId: 'country-a', mandate: { basis: 'head_of_government' }, targetCountryId: 'country-b',
  kind: 'sanction', direction: 'import', categories: ['energy'], date: '2026-02-01', note: 'targeted energy sanctions',
  ...over,
});

describe('sanctions, embargoes and dependencies (0.31.3)', () => {
  it('maps each coercion kind with an explicit direction onto an existing system', () => {
    expect(COERCION_OWNERS.condemnation).toBe('international.actions');
    expect(COERCION_OWNERS.sanction).toBe('international.actions');
    expect(COERCION_OWNERS.embargo).toBe('international.actions');
    expect(COERCION_OWNERS.intervention).toBe('operations');
    expect(internationalActionKindFor('sanction', 'import')).toBe('import_restriction');
    expect(internationalActionKindFor('sanction', 'export')).toBe('export_restriction');
    expect(internationalActionKindFor('embargo', 'export')).toBe('export_restriction');
    expect(internationalActionKindFor('condemnation', null)).toBe('condemnation');
    expect(internationalActionKindFor('intervention', null)).toBeNull();
  });

  it('validates a trade control with a direction, categories and a real mandate', () => {
    expect(() => validateCoercionMeasure(measure())).not.toThrow();
    expect(() => validateCoercionMeasure(measure({ kind: 'embargo', direction: 'export', categories: ['energy', 'food'] }))).not.toThrow();
    expect(() => validateCoercionMeasure(measure({ mandate: { basis: 'unresolved' } }))).toThrow(/fails closed/);
    expect(() => validateCoercionMeasure(measure({ targetCountryId: 'country-a' }))).toThrow(/distinct/);
    expect(() => validateCoercionMeasure(measure({ direction: null }))).toThrow(/import or export direction/);
    expect(() => validateCoercionMeasure(measure({ categories: [] }))).toThrow(/at least one/);
    expect(() => validateCoercionMeasure(measure({ categories: ['magic' as never] }))).toThrow(/known trade categories/);
  });

  it('rejects trade direction/categories on non-trade coercion', () => {
    expect(() => validateCoercionMeasure(measure({ kind: 'condemnation', direction: null, categories: [] }))).not.toThrow();
    expect(() => validateCoercionMeasure(measure({ kind: 'condemnation', direction: 'import', categories: [] }))).toThrow(/must not carry a direction/);
    expect(() => validateCoercionMeasure(measure({ kind: 'intervention', direction: null, categories: ['energy'] }))).toThrow(/not a trade control/);
  });
});
