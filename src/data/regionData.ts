import registryUrl from './region-registry.json?url';
import mappingUrl from './admin1-mapping.json?url';
import coverageUrl from './admin1-coverage-report.json?url';
import type { RegionEntity } from '../types';
import type { EntityRegistry } from './registry';

export interface RegionRegistry {
  schemaVersion: number;
  sourceSnapshot: { snapshotId: string; retrievedAt: string; sourceUrl: string; license: string; licenseUrl: string; limitations: string[] };
  geometryAssetsByCountry: Record<string, string>;
  regions: RegionEntity[];
}
export interface Admin1Mapping {
  schemaVersion: number;
  datasetId: string;
  featureIdProperty: string;
  features: Array<{ sourceId: string; regionId: string; countryId: string }>;
  excludedFeatures: Array<{ sourceId: string; sourceCountryCode: string; name: string; reason: string }>;
}
export interface RegionCoverageReport {
  schemaVersion: number;
  summary: { registeredCountries: number; totalRegions: number; countriesWithAdmin1: number; countriesUsingFallback: number; countriesPotentiallyIncompleteOrAmbiguous: number; mappedSourceFeatures: number; excludedSourceFeatures: number };
}
export interface LoadedRegionData {
  registry: RegionRegistry;
  mapping: Admin1Mapping;
  coverage: RegionCoverageReport;
  regionsById: Map<string, RegionEntity>;
  regionsByCountryId: Map<string, RegionEntity[]>;
}

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
export function validateRegionData(registry: RegionRegistry, mapping: Admin1Mapping, countries: EntityRegistry) {
  const errors: string[] = [];
  const countryIds = new Set(countries.countries.map(country => country.id));
  const territoryIds = new Set(countries.territories.map(territory => territory.id));
  const regionIds = new Set<string>();
  const isoCodes = new Map<string, string>();
  const countsByCountry = new Map<string, number>();
  for (const region of registry.regions) {
    if (!region.id || regionIds.has(region.id)) errors.push(`Duplicate or missing permanent Region ID: ${region.id}`);
    regionIds.add(region.id);
    if (!countryIds.has(region.parentCountryId) || !countryIds.has(region.initialOwnerCountryId)) errors.push(`Region references an unknown country: ${region.id}`);
    if (region.macroTerritoryId && !territoryIds.has(region.macroTerritoryId)) errors.push(`Region references an unknown macro territory: ${region.id}`);
    countsByCountry.set(region.parentCountryId, (countsByCountry.get(region.parentCountryId) ?? 0) + 1);
    if (region.iso31662) {
      if (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(region.iso31662)) errors.push(`Malformed ISO 3166-2 code: ${region.iso31662}`);
      const prior = isoCodes.get(region.iso31662);
      if (prior && prior !== region.id) errors.push(`Duplicate ISO 3166-2 code: ${region.iso31662}`);
      isoCodes.set(region.iso31662, region.id);
    }
    if (region.geographyMapping.status === 'unavailable' || region.geographyMapping.status === 'fallback_admin0') {
      const geography = region.geographyMapping;
      if (!geography.reason || !isDate(geography.checkedAt) || !geography.source?.datasetId) errors.push(`Missing geography lacks provenance: ${region.id}`);
      if (geography.status === 'fallback_admin0' && !territoryIds.has(geography.territoryId)) errors.push(`Fallback references an unknown territory: ${region.id}`);
    }
  }
  for (const countryId of countryIds) if (!countsByCountry.has(countryId)) errors.push(`Country has no gameplay Region: ${countryId}`);

  const sourceIds = new Set<string>();
  const sourcesByRegion = new Map<string, Set<string>>();
  for (const feature of mapping.features) {
    if (!feature.sourceId || sourceIds.has(feature.sourceId)) errors.push(`Displayed Admin-1 feature maps more than once: ${feature.sourceId}`);
    sourceIds.add(feature.sourceId);
    const region = registry.regions.find(item => item.id === feature.regionId);
    if (!region) errors.push(`Admin-1 feature references an unknown Region: ${feature.sourceId}`);
    else if (region.parentCountryId !== feature.countryId) errors.push(`Admin-1 feature country disagrees with its Region: ${feature.sourceId}`);
    const sources = sourcesByRegion.get(feature.regionId) ?? new Set<string>();
    sources.add(feature.sourceId);
    sourcesByRegion.set(feature.regionId, sources);
  }
  for (const region of registry.regions.filter(item => item.geographyMapping.status === 'mapped')) {
    if (region.geographyMapping.status !== 'mapped') continue;
    const mapped = sourcesByRegion.get(region.id) ?? new Set<string>();
    if (mapped.size !== region.geographyMapping.sourceFeatureIds.length || region.geographyMapping.sourceFeatureIds.some(id => !mapped.has(id))) errors.push(`Region mapping is incomplete: ${region.id}`);
  }
  const excludedIds = new Set<string>();
  for (const feature of mapping.excludedFeatures) {
    if (!feature.sourceId || !feature.reason || sourceIds.has(feature.sourceId) || excludedIds.has(feature.sourceId)) errors.push(`Invalid excluded Admin-1 feature: ${feature.sourceId}`);
    excludedIds.add(feature.sourceId);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return true;
}

export function indexRegionData(registry: RegionRegistry, mapping: Admin1Mapping, coverage: RegionCoverageReport, countries: EntityRegistry): LoadedRegionData {
  validateRegionData(registry, mapping, countries);
  const regionsById = new Map(registry.regions.map(region => [region.id, region]));
  const regionsByCountryId = new Map<string, RegionEntity[]>();
  for (const region of registry.regions) {
    const records = regionsByCountryId.get(region.parentCountryId) ?? [];
    records.push(region);
    regionsByCountryId.set(region.parentCountryId, records);
  }
  return { registry, mapping, coverage, regionsById, regionsByCountryId };
}

/** Binds replaceable source geometry to permanent Region IDs without deriving identity from the geometry. */
export function bindRegionGeometry(featureCollection: GeoJSON.FeatureCollection, mapping: Admin1Mapping, registry: RegionRegistry) {
  const bindings = new Map(mapping.features.map(feature => [feature.sourceId, feature]));
  const knownRegions = new Set(registry.regions.map(region => region.id));
  const seen = new Set<string>();
  const features = featureCollection.features.map(feature => {
    const sourceId = String(feature.properties?.[mapping.featureIdProperty] ?? '');
    const binding = bindings.get(sourceId);
    if (!binding) throw new Error(`Unmapped Admin-1 source feature: ${sourceId}`);
    if (!knownRegions.has(binding.regionId)) throw new Error(`Admin-1 source feature references an unknown Region: ${sourceId}`);
    if (seen.has(sourceId)) throw new Error(`Duplicate Admin-1 source feature: ${sourceId}`);
    if (!feature.geometry) throw new Error(`Admin-1 source feature has no geometry: ${sourceId}`);
    seen.add(sourceId);
    return { sourceId, regionId: binding.regionId, countryId: binding.countryId, geometry: feature.geometry };
  });
  return features;
}

export async function loadRegionData(countries: EntityRegistry) {
  const responses = await Promise.all([registryUrl, mappingUrl, coverageUrl].map(url => fetch(url)));
  if (responses.some(response => !response.ok)) throw new Error('One or more local Region data assets are unavailable.');
  const [registry, mapping, coverage] = await Promise.all(responses.map(response => response.json()));
  return indexRegionData(registry, mapping, coverage, countries);
}
