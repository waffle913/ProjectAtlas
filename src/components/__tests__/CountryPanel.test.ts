import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Country } from '../../types';
import type { CountryFactsRecord } from '../../data/countryData';
import { CountryPanel } from '../CountryPanel';

const source = { name: 'TestSource', url: 'https://example.com/gdp', datasetId: 'ds.1', retrievedAt: '2026-01-01' };
const country = {
  id: 'country.a', commonName: 'Atlantis', officialName: 'Republic of Atlantis',
  externalIds: { isoAlpha2: 'AT' }, entityType: 'sovereign_state', unMembership: 'member',
  capital: 'Capital City', continent: 'Testland', unSubregion: 'Test subregion',
  sources: { identity: [source] },
} as unknown as Country;

const factsRecord = {
  countryId: 'country.a',
  facts: { nominalGdpUsd: { status: 'available', value: 123, source, referenceDate: '2025-01-01', isEstimate: false } },
} as unknown as CountryFactsRecord;

describe('CountryPanel provenance gating', () => {
  it('shows ordinary facts but hides detailed source links by default', () => {
    const markup = renderToStaticMarkup(createElement(CountryPanel, { country, factsRecord }));
    expect(markup).toContain('Atlantis');
    expect(markup).toContain('123');
    expect(markup).not.toContain('https://example.com/gdp');
    expect(markup).not.toContain('TestSource');
  });

  it('shows detailed provenance when the setting is enabled', () => {
    const markup = renderToStaticMarkup(createElement(CountryPanel, { country, factsRecord, showProvenance: true }));
    expect(markup).toContain('https://example.com/gdp');
    expect(markup).toContain('TestSource');
  });
});
