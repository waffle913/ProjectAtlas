import { describe, it, expect } from 'vitest';
import {
  validateInformationSource, validateInformationItem, canPropagate,
  INFORMATION_LAYERS, type InformationSource, type InformationItem,
} from '../media/contract';

const source = (over: Partial<InformationSource> = {}): InformationSource => ({
  id: 'src-1', publisher: 'publisher', url: 'https://example', referenceDate: '2026-01-01',
  retrievalDate: '2026-01-02', licence: 'CC-BY', attribution: 'publisher', limitation: 'none',
  ...over,
});
const item = (over: Partial<InformationItem> = {}): InformationItem => ({
  id: 'it-1', layer: 'government-information', sourceId: 'src-1', coverage: 'modelled',
  confidenceBps: 8000, value: { unemploymentBps: 7200 }, observedAt: '2026-02-01', note: 'labour briefing',
  ...over,
});

describe('information contract (0.32.1)', () => {
  it('names the three distinct layers', () => {
    expect(INFORMATION_LAYERS).toEqual(['reality', 'government-information', 'public-perception']);
  });

  it('validates dated provenance; unknown url/licence/attribution are never zero', () => {
    expect(() => validateInformationSource(source())).not.toThrow();
    expect(() => validateInformationSource(source({ url: null, licence: null, attribution: null }))).not.toThrow();
    expect(() => validateInformationSource(source({ publisher: '' }))).toThrow(/publisher/);
    expect(() => validateInformationSource(source({ referenceDate: 'bad' }))).toThrow(/referenceDate/);
  });

  it('validates an item with coverage/confidence; unknown confidence is never zero', () => {
    expect(() => validateInformationItem(item())).not.toThrow();
    expect(() => validateInformationItem(item({ confidenceBps: null }))).not.toThrow();
    expect(() => validateInformationItem(item({ layer: 'hidden' as never }))).toThrow(/Unknown information layer/);
    expect(() => validateInformationItem(item({ confidenceBps: 20000 }))).toThrow(/between 0 and 10000/);
    expect(() => validateInformationItem(item({ coverage: 'fabricated' as never }))).toThrow(/Unknown coverage/);
  });

  it('propagates between layers only through an explicit access grant — never automatic', () => {
    expect(canPropagate('reality', 'government-information', 'government_access')).toBe(true);
    expect(canPropagate('reality', 'government-information', 'none')).toBe(false);
    expect(canPropagate('government-information', 'public-perception', 'public_disclosure')).toBe(true);
    expect(canPropagate('government-information', 'public-perception', 'none')).toBe(false);
    expect(canPropagate('reality', 'public-perception', 'public_disclosure')).toBe(false); // never direct
    expect(canPropagate('public-perception', 'reality', 'none')).toBe(false); // never backwards
  });
});
