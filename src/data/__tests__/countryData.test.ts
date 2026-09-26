import { describe, expect, it } from 'vitest';
import registryJson from '../entity-registry.json';
import factsJson from '../country-facts.json';
import officesJson from '../political-offices.json';
import mappingJson from '../natural-earth-mapping.json';
import { validateCountryData } from '../countryData';
import type { CountryFactsData, PoliticalOfficesData } from '../countryData';
import type { DatasetMapping, EntityRegistry } from '../registry';

const countryRegistry = registryJson as unknown as EntityRegistry;
const countryFacts = factsJson as unknown as CountryFactsData;
const politicalOffices = officesJson as unknown as PoliticalOfficesData;
const naturalEarthDatasetMapping = mappingJson as unknown as DatasetMapping;
const clone = <T>(value: T): T => structuredClone(value);
const validate = (registry = countryRegistry, facts = countryFacts, politics = politicalOffices, mapping = naturalEarthDatasetMapping) =>
  validateCountryData(registry, facts, politics, mapping);

describe('authoritative country data validation', () => {
  it('validates an authoritative registry broader than bundled map coverage', () => {
    expect(validate()).toBe(true);
    expect(countryRegistry.countries.filter(item => item.unMembership === 'member')).toHaveLength(193);
    const mappedTerritories = countryRegistry.territories.filter(item => item.geographicMapping.status === 'mapped');
    expect(mappedTerritories).toHaveLength(naturalEarthDatasetMapping.features.length);
    expect(countryRegistry.countries.length).toBeGreaterThan(new Set(naturalEarthDatasetMapping.features.map(item => item.countryId)).size);
    expect(new Set(naturalEarthDatasetMapping.features.map(item => item.sourceId)).size).toBe(naturalEarthDatasetMapping.features.length);
    expect(new Set(naturalEarthDatasetMapping.features.map(item => item.territoryId)).size).toBe(naturalEarthDatasetMapping.features.length);
  });

  it('requires explicit, sourced missing-data records and dated government types', () => {
    for (const record of countryFacts.countries) {
      for (const observation of Object.values(record.facts)) {
        expect(['available', 'unavailable']).toContain(observation.status);
        expect(observation.source.datasetId).toBeTruthy();
        if (observation.status === 'unavailable') {
          expect(observation.reason).toBeTruthy();
          expect(observation.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    }
    const governmentTypes = countryFacts.countries.map(item => item.facts.governmentType);
    expect(governmentTypes.filter(item => item.status === 'available').length).toBeGreaterThan(150);
    for (const item of governmentTypes.filter(item => item.status === 'available')) {
      if (item.status === 'available') expect(item.referenceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const territory of countryRegistry.territories.filter(item => item.geographicMapping.status === 'unavailable')) {
      if (territory.geographicMapping.status === 'unavailable') {
        expect(territory.geographicMapping.reason).toBeTruthy();
        expect(territory.geographicMapping.source.datasetId).toBeTruthy();
      }
    }
  });

  it('rejects duplicate ISO alpha-2, alpha-3 and M49 codes', () => {
    for (const field of ['isoAlpha2','isoAlpha3','unM49'] as const) {
      const registry = clone(countryRegistry);
      const coded = registry.countries.filter(country => country.externalIds[field]);
      coded[1].externalIds[field] = coded[0].externalIds[field];
      expect(() => validate(registry)).toThrow(new RegExp(`Duplicate ${field}`));
    }
  });
  it('rejects missing permanent IDs and broken sovereignty relationships', () => {
    const missing = clone(countryRegistry); missing.countries[0].id = '';
    expect(() => validate(missing)).toThrow(/missing a permanent ID/);
    const broken = clone(countryRegistry); broken.countries[0].sovereignCountryId = 'country.unknown';
    expect(() => validate(broken)).toThrow(/Broken sovereignty relationship/);
  });
  it('rejects references to unknown countries and territories', () => {
    const facts = clone(countryFacts); facts.countries[0].countryId = 'country.unknown';
    expect(() => validate(countryRegistry, facts)).toThrow(/Facts reference unknown country/);
    const mapping = clone(naturalEarthDatasetMapping); mapping.features[0].territoryId = 'territory.unknown';
    expect(() => validate(countryRegistry, countryFacts, politicalOffices, mapping)).toThrow(/Map references unknown territory/);
  });
  it('rejects malformed dates', () => {
    const politics = clone(politicalOffices);
    const available = politics.officeholders.find(item => item.status === 'available')!;
    if (available.status === 'available') available.referenceDate = '01/01/2026';
    expect(() => validate(countryRegistry, countryFacts, politics)).toThrow(/Malformed officeholder/);
  });
  it('rejects factual values without source metadata', () => {
    const facts = clone(countryFacts);
    const observation = Object.values(facts.countries[0].facts).find(item => item.status === 'available')!;
    delete (observation as { source?: unknown }).source;
    expect(() => validate(countryRegistry, facts)).toThrow(/Fact lacks valid provenance/);
  });
  it('rejects a displayed territory omitted from the registry', () => {
    const registry = clone(countryRegistry);
    const mappedId = naturalEarthDatasetMapping.features[0].territoryId;
    registry.territories = registry.territories.filter(item => item.id !== mappedId);
    expect(() => validate(registry)).toThrow(/Map references unknown territory/);
  });
  it('rejects unavailable geography without provenance', () => {
    const registry = clone(countryRegistry);
    const territory = registry.territories.find(item => item.geographicMapping.status === 'unavailable')!;
    if (territory.geographicMapping.status === 'unavailable') territory.geographicMapping.reason = '';
    expect(() => validate(registry)).toThrow(/Unavailable geography lacks provenance/);
  });
});
