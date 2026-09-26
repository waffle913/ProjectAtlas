import type { Country, Territory } from '../types';
import { entityRegistry, naturalEarthMapping, indexRegistry } from './registry';
import type { EntityRegistry, DatasetMapping } from './registry';

/** Converts a published geographic snapshot into gameplay entities. Source geometry remains immutable. */
export function buildWorld(
  featureCollection: GeoJSON.FeatureCollection,
  mapping: DatasetMapping = naturalEarthMapping,
  registry: EntityRegistry = entityRegistry,
) {
  const index = indexRegistry(registry, mapping);
  const seen = new Set<string>();
  const countries = new Map<string, Country>();
  const territories: Territory[] = featureCollection.features.flatMap((feature) => {
    if (!feature.geometry) throw new Error('Geographic feature has no geometry.');
    const p = (feature.properties ?? {}) as Record<string, string>;
    const sourceFeatureId = String(p[mapping.featureIdProperty] ?? '');
    const binding = index.features.get(sourceFeatureId);
    if (!binding) throw new Error('Unmapped geographic feature in ' + mapping.datasetId + ': ' + sourceFeatureId + '. Update the entity mapping explicitly.');
    if (seen.has(sourceFeatureId)) throw new Error('Duplicate geographic feature: ' + sourceFeatureId);
    seen.add(sourceFeatureId);
    const countryEntity = index.countries.get(binding.countryId)!;
    const territoryEntity = index.territories.get(binding.territoryId)!;
    const kind = countryEntity.entityType === 'sovereign_state' ? 'sovereign' : countryEntity.entityType === 'dependency' ? 'dependency' : ['disputed','partially_recognized'].includes(countryEntity.entityType) ? 'disputed' : 'other';
    const countryId = countryEntity.id;
    if (!countries.has(countryId)) countries.set(countryId, {
      id: countryId, commonName: countryEntity.commonName, officialName: countryEntity.officialName,
      externalIds: countryEntity.externalIds, entityType: countryEntity.entityType,
      sovereignCountryId: countryEntity.sovereignCountryId, capital: countryEntity.capital,
      continent: countryEntity.continent, unSubregion: countryEntity.unSubregion,
      sources: countryEntity.sources, kind,
    });
    return [{ id: territoryEntity.id, name: territoryEntity.label, geometry: feature.geometry, ownerCountryId: territoryEntity.initialOwnerCountryId,
      kind, sourceFeatureId, sourceDatasetId: mapping.datasetId,
      sourceMetadata: { naturalEarth: { admin: p.ADMIN, sovereign: p.SOVEREIGNT, type: p.TYPE, adm0A3: p.ADM0_A3 } } }];
  });
  if (seen.size !== index.features.size) throw new Error('Geographic dataset is missing mapped features: ' + mapping.datasetId);
  return { countries, territories };
}
