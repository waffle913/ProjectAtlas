import { describe, it, expect } from 'vitest';
import {
  INDUSTRY_VERSION, NOMENCLATURES, PRODUCTS, SECTORS, ACTIVITIES, NOMENCLATURE_MAPPINGS,
  validateNomenclatureMapping, INDUSTRY_DECISIONS, isCompetitionInScope,
} from '../industry/contract';

const mapping = (over: Partial<Parameters<typeof validateNomenclatureMapping>[0]> = {}) => ({
  subjectId: 'p1', nomenclature: 'hs' as const, code: '8703', coverage: 'sourced' as const, note: 'dated provenance',
  ...over,
});

describe('industry product/sector/nomenclature contract (0.28.1)', () => {
  it('declares the version and the external nomenclatures', () => {
    expect(INDUSTRY_VERSION).toBe('industry-0.28-v1');
    expect(NOMENCLATURES).toEqual(['isic', 'nace', 'hs', 'cpc', 'prodcom']);
  });

  it('admits no real product/sector/activity inventory or mapping (no fabricated industrial data)', () => {
    expect(PRODUCTS).toEqual({});
    expect(SECTORS).toEqual({});
    expect(ACTIVITIES).toEqual({});
    expect(NOMENCLATURE_MAPPINGS).toEqual({});
  });

  it('validates a nomenclature mapping and rejects malformed ones', () => {
    expect(() => validateNomenclatureMapping(mapping())).not.toThrow();
    expect(() => validateNomenclatureMapping(mapping({ subjectId: '' }))).toThrow(/non-empty subject id/);
    expect(() => validateNomenclatureMapping(mapping({ nomenclature: 'iso' as never }))).toThrow(/Unknown nomenclature/);
    expect(() => validateNomenclatureMapping(mapping({ code: '' }))).toThrow(/non-empty nomenclature code/);
    expect(() => validateNomenclatureMapping(mapping({ coverage: 'bogus' as never }))).toThrow(/Unknown coverage/);
    expect(() => validateNomenclatureMapping(mapping({ coverage: 'sourced', note: '' }))).toThrow(/provenance note/);
    expect(() => validateNomenclatureMapping(mapping({ note: 5 as unknown as string }))).toThrow(/string note/);
  });

  it('keeps competition/market-structure mechanisms undecided (BLOCKED_DESIGN)', () => {
    expect(INDUSTRY_DECISIONS.map(d => d.id)).toEqual(['competition_market_structures']);
    expect(INDUSTRY_DECISIONS[0].status).toBe('undecided');
    expect(isCompetitionInScope()).toBe(false);
  });
});
