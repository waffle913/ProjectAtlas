import type { Country, Territory } from '../types';
import { normalizeEntityKind } from './normalization';
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
    const { isoAlpha2: iso2, isoAlpha3: iso3, unM49 } = countryEntity.externalIds;
    const name = p.NAME_EN ?? p.ADMIN ?? p.NAME ?? 'Unnamed territory';
    const sovereignty = p.SOVEREIGNT ?? p.ADMIN ?? name;
    const sourceClassification = `${p.TYPE ?? ''} / ${p.FEATURECLA ?? ''}`.trim();
    const kind = normalizeEntityKind(p.ADM0_A3, sourceClassification);
    const countryId = countryEntity.id;
    if (!countries.has(countryId)) countries.set(countryId, {
      id: countryId, commonName: p.ADMIN ?? countryEntity.label, officialName: p.FORMAL_EN || undefined, iso2, iso3, unM49,
      kind, sourceClassification, continent: p.CONTINENT || undefined, subregion: p.SUBREGION || undefined,
      sources: {
        identity: { value: 'Natural Earth Admin 0', source: 'Natural Earth', sourceUrl: 'https://www.naturalearthdata.com/', asOf: '2022', note: 'Geographic identity and classification only; statistics are intentionally not inferred.' }
      }
    });
    return [{ id: territoryEntity.id, name, geometry: feature.geometry, ownerCountryId: territoryEntity.initialOwnerCountryId,
      sovereignty, kind, sourceClassification, sourceFeatureId, sourceDatasetId: mapping.datasetId }];
  });
  if (seen.size !== index.features.size) throw new Error('Geographic dataset is missing mapped features: ' + mapping.datasetId);
  return { countries, territories };
}
