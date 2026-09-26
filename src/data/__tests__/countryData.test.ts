import { describe, expect, it } from 'vitest';
import { countryFacts, countryRegistry, naturalEarthDatasetMapping, politicalOffices, validateCountryData } from '../countryData';

const clone = <T>(value: T): T => structuredClone(value);
describe('authoritative country data validation', () => {
  it('validates the complete bundled registry and political territory coverage', () => {
    expect(validateCountryData()).toBe(true);
    expect(new Set(naturalEarthDatasetMapping.features.map(item => item.countryId)).size).toBe(countryRegistry.countries.length);
    expect(new Set(naturalEarthDatasetMapping.features.map(item => item.territoryId)).size).toBe(countryRegistry.territories.length);
  });
  it('rejects duplicate ISO alpha-2, alpha-3 and M49 codes', () => {
    for (const field of ['isoAlpha2','isoAlpha3','unM49'] as const) {
      const registry = clone(countryRegistry); registry.countries[1].externalIds[field] = registry.countries[0].externalIds[field];
      expect(() => validateCountryData(registry)).toThrow(new RegExp(`Duplicate ${field}`));
    }
  });
  it('rejects missing permanent IDs and broken sovereignty relationships', () => {
    const missing = clone(countryRegistry); missing.countries[0].id = '';
    expect(() => validateCountryData(missing)).toThrow(/missing a permanent ID/);
    const broken = clone(countryRegistry); broken.countries[0].sovereignCountryId = 'country.unknown';
    expect(() => validateCountryData(broken)).toThrow(/Broken sovereignty relationship/);
  });
  it('rejects references to unknown countries and territories', () => {
    const facts = clone(countryFacts); facts.countries[0].countryId = 'country.unknown';
    expect(() => validateCountryData(countryRegistry, facts)).toThrow(/Facts reference unknown country/);
    const mapping = clone(naturalEarthDatasetMapping); mapping.features[0].territoryId = 'territory.unknown';
    expect(() => validateCountryData(countryRegistry, countryFacts, politicalOffices, mapping)).toThrow(/Map references unknown territory/);
  });
  it('rejects malformed dates', () => {
    const politics = clone(politicalOffices); politics.officeholders[0].referenceDate = '01/01/2026';
    expect(() => validateCountryData(countryRegistry, countryFacts, politics)).toThrow(/Malformed officeholder/);
  });
  it('rejects factual values without source metadata', () => {
    const facts = clone(countryFacts); delete (facts.countries[0].facts.population as Partial<typeof facts.countries[0]['facts']['population']>).source;
    expect(() => validateCountryData(countryRegistry, facts)).toThrow(/Fact lacks valid provenance/);
  });
  it('rejects a displayed territory omitted from the registry', () => {
    const registry = clone(countryRegistry); registry.territories.splice(0, 1);
    expect(() => validateCountryData(registry)).toThrow(/Map references unknown territory/);
  });
});
