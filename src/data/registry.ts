import entities from './entity-registry.json';
import naturalEarth from './natural-earth-mapping.json';

export interface EntityRegistry {
  schemaVersion: number;
  countries: Array<{
    id: string;
    label: string;
    externalIds: { isoAlpha2?: string; isoAlpha3?: string; unM49?: string };
  }>;
  territories: Array<{ id: string; label: string; initialOwnerCountryId: string }>;
}

export interface DatasetMapping {
  schemaVersion: number;
  datasetId: string;
  featureIdProperty: string;
  features: Array<{ sourceId: string; territoryId: string; countryId: string }>;
}

export const entityRegistry: EntityRegistry = entities;
export const naturalEarthMapping: DatasetMapping = naturalEarth;

/** IDs are assigned in the registry, never generated from source data at runtime. */
export function indexRegistry(registry: EntityRegistry, mapping: DatasetMapping) {
  if (registry.schemaVersion !== 1 || mapping.schemaVersion !== 1) {
    throw new Error('Unsupported entity registry or geographic mapping version.');
  }
  const unique = <T extends { id: string }>(entries: T[]) => {
    const result = new Map<string, T>();
    for (const entry of entries) {
      if (!entry.id || result.has(entry.id)) throw new Error('Duplicate or empty registry ID: ' + entry.id);
      result.set(entry.id, entry);
    }
    return result;
  };
  const countries = unique(registry.countries);
  const territories = unique(registry.territories);
  for (const territory of territories.values()) {
    if (countries.has(territory.id)) throw new Error('Entity ID shared by a country and territory.');
    if (!countries.has(territory.initialOwnerCountryId)) throw new Error('Unknown initial country owner: ' + territory.id);
  }
  const features = new Map<string, DatasetMapping['features'][number]>();
  const mappedTerritories = new Set<string>();
  for (const feature of mapping.features) {
    if (!feature.sourceId || features.has(feature.sourceId)) throw new Error('Duplicate or empty external feature ID.');
    if (!countries.has(feature.countryId) || !territories.has(feature.territoryId)) throw new Error('Geographic mapping references an unknown entity.');
    if (territories.get(feature.territoryId)!.initialOwnerCountryId !== feature.countryId) throw new Error('Geographic mapping disagrees with initial country ownership.');
    if (mappedTerritories.has(feature.territoryId)) throw new Error('Multiple features map to one territory; merge their geometry explicitly before import.');
    features.set(feature.sourceId, feature);
    mappedTerritories.add(feature.territoryId);
  }
  return { countries, territories, features };
}
