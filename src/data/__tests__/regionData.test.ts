/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bindRegionGeometry, validateRegionData } from '../regionData';
import type { Admin1Mapping, RegionCoverageReport, RegionRegistry } from '../regionData';
import type { EntityRegistry } from '../registry';

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const registry = read<RegionRegistry>('src/data/region-registry.json');
const mapping = read<Admin1Mapping>('src/data/admin1-mapping.json');
const coverage = read<RegionCoverageReport>('src/data/admin1-coverage-report.json');
const countries = read<EntityRegistry>('src/data/entity-registry.json');
const source = read<GeoJSON.FeatureCollection>('src/data/source-snapshots/natural-earth-admin1-v5.1.2.geojson');
const overview = read<GeoJSON.FeatureCollection>('public/data/admin1/overview.geojson');
const identities = read<{
  schemaVersion: number;
  regions: Array<{ id: string; status: 'active' | 'retired'; parentCountryId: string; commonName: string; iso31662?: string; stableExternalIds: Record<string, string[]> }>;
  reservedRegionIds: Array<{ id: string; status: 'reserved'; reason: string }>;
}>('src/data/region-id-assignments.json');
const clone = <T>(value: T): T => structuredClone(value);

describe('persistent global Region registry', () => {
  it('has unique permanent IDs, valid countries, unique ISO codes and at least one Region per country', () => {
    expect(validateRegionData(registry, mapping, countries)).toBe(true);
    expect(new Set(registry.regions.map(region => region.id)).size).toBe(registry.regions.length);
    expect(new Set(registry.regions.map(region => region.parentCountryId)).size).toBe(countries.countries.length);
    const isoCodes = registry.regions.flatMap(region => region.iso31662 ? [region.iso31662] : []);
    expect(new Set(isoCodes).size).toBe(isoCodes.length);
    expect(coverage.summary.totalRegions).toBe(registry.regions.length);
  });
  it('keeps authoritative identity records free of Natural Earth identifiers', () => {
    expect(identities.schemaVersion).toBe(2);
    const active = identities.regions.filter(identity => identity.status === 'active');
    expect(active.map(identity => identity.id).sort()).toEqual(registry.regions.map(region => region.id).sort());
    const allKnownIds = [...identities.regions.map(identity => identity.id), ...identities.reservedRegionIds.map(identity => identity.id)];
    expect(new Set(allKnownIds).size).toBe(allKnownIds.length);
    for (const identity of identities.regions) {
      expect(identity.parentCountryId).toBeTruthy();
      expect(identity.commonName).toBeTruthy();
      expect(JSON.stringify(identity)).not.toMatch(/natural[-_ ]?earth|adm1_code|sourceFeature/i);
    }
    expect(mapping.features.every(feature => feature.sourceAdmin1Code)).toBe(true);
  });
  it('maps every displayed source feature exactly once while allowing multipart Regions', () => {
    expect(new Set(mapping.features.map(feature => feature.sourceId)).size).toBe(mapping.features.length);
    const counts = new Map<string, number>();
    for (const feature of mapping.features) counts.set(feature.regionId, (counts.get(feature.regionId) ?? 0) + 1);
    expect([...counts.values()].some(count => count > 1)).toBe(true);
    const bindingBySource = new Map(mapping.features.map(feature => [feature.sourceId, feature]));
    expect(overview.features).toHaveLength(mapping.features.length);
    for (const feature of overview.features) {
      const binding = bindingBySource.get(String(feature.properties?.sourceId));
      expect(binding?.regionId).toBe(feature.properties?.regionId);
    }
  });
  it('keeps Region IDs stable when source geometry and feature ordering change', () => {
    const sampleMappings = mapping.features.slice(0, 20);
    const sourceById = new Map(source.features.map(feature => [String(feature.properties?.ne_id), feature]));
    const sample: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: sampleMappings.map(item => clone(sourceById.get(item.sourceId)!)) };
    const replacement = clone(sample);
    replacement.features.reverse();
    replacement.features.forEach(feature => { feature.geometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] }; });
    const before = bindRegionGeometry(sample, mapping, registry).map(item => item.regionId).sort();
    const after = bindRegionGeometry(replacement, mapping, registry).map(item => item.regionId).sort();
    expect(after).toEqual(before);
  });
  it('rejects duplicate ISO codes and missing geography provenance', () => {
    const duplicate = clone(registry);
    const coded = duplicate.regions.filter(region => region.iso31662);
    coded[1].iso31662 = coded[0].iso31662;
    expect(() => validateRegionData(duplicate, mapping, countries)).toThrow(/Duplicate ISO/);
    const missing = clone(registry);
    const unavailable = missing.regions.find(region => region.geographyMapping.status !== 'mapped')!;
    if (unavailable.geographyMapping.status !== 'mapped') unavailable.geographyMapping.reason = '';
    expect(() => validateRegionData(missing, mapping, countries)).toThrow(/lacks provenance/);
  });
});
