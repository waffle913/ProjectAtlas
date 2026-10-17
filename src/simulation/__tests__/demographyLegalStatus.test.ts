import { describe, it, expect } from 'vitest';
import {
  validateLegalStatusRule, assessIntegration, type LegalStatusRule,
} from '../demography/legalStatus';

const rule = (over: Partial<LegalStatusRule> = {}): LegalStatusRule => ({
  id: 'r1', countryId: 'country-a', kind: 'residence', basis: 'documented_law',
  legalInstrumentRef: 'law:residence-2025', serviceAccess: ['health', 'education'],
  note: 'documented residence law',
  ...over,
});

describe('legal statuses and integration (0.30.4)', () => {
  it('validates a documented rule and rejects malformed ones', () => {
    expect(() => validateLegalStatusRule(rule())).not.toThrow();
    expect(() => validateLegalStatusRule(rule({ kind: 'noble' as never }))).toThrow(/Unknown legal status kind/);
    expect(() => validateLegalStatusRule(rule({ basis: 'documented_law', legalInstrumentRef: null }))).toThrow(/legal instrument/);
    expect(() => validateLegalStatusRule(rule({ basis: 'documented_law', serviceAccess: null }))).toThrow(/explicit service access/);
    expect(() => validateLegalStatusRule(rule({ serviceAccess: ['health', 'magic' as never] }))).toThrow(/known service families/);
    expect(() => validateLegalStatusRule(rule({ serviceAccess: 'health' as never }))).toThrow(/array of known service families/);
  });

  it('treats unavailable as unknown, never zero rights/services', () => {
    expect(() => validateLegalStatusRule(rule({ basis: 'unavailable', legalInstrumentRef: null, serviceAccess: null }))).not.toThrow();
    expect(() => validateLegalStatusRule(rule({ basis: 'unavailable', legalInstrumentRef: 'law:x', serviceAccess: null }))).toThrow(/fabricate/);
    expect(() => validateLegalStatusRule(rule({ basis: 'unavailable', legalInstrumentRef: null, serviceAccess: ['health'] }))).toThrow(/unavailable != zero/);
  });

  it('assesses integration contextually and bounds it to [0, 10000] bps', () => {
    const full = assessIntegration({ residenceMonths: 60, employed: true, serviceAccessCount: 6 });
    expect(full.indexBps).toBe(10000);
    expect(assessIntegration({ residenceMonths: 0, employed: false, serviceAccessCount: 0 }).indexBps).toBe(0);
    expect(assessIntegration({ residenceMonths: 30, employed: true, serviceAccessCount: 3 }).indexBps).toBe(6500);
  });

  it('rejects invalid integration contexts', () => {
    expect(() => assessIntegration({ residenceMonths: -1, employed: false, serviceAccessCount: 0 })).toThrow(/non-negative/);
    expect(() => assessIntegration({ residenceMonths: 1, employed: false, serviceAccessCount: 7 })).toThrow(/between 0 and 6/);
  });
});
