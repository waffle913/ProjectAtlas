import type { Country, Territory } from '../types';
import { normalizeEntityKind } from './normalization';

const cleanIso = (value?: string) => value && value !== '-99' ? value : undefined;
/** Stable across feature ordering; a source-data change intentionally produces a new fingerprint. */
const stableId = (prefix: string, value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `${prefix}.${(hash >>> 0).toString(36)}`;
};

/** Converts a published geographic snapshot into gameplay entities. Source geometry remains immutable. */
export function buildWorld(featureCollection: GeoJSON.FeatureCollection) {
  const countries = new Map<string, Country>();
  const territories: Territory[] = featureCollection.features.flatMap((feature) => {
    if (!feature.geometry) return [];
    const p = (feature.properties ?? {}) as Record<string, string>;
    const iso3 = cleanIso(p.ADM0_A3) ?? cleanIso(p.ISO_A3);
    const iso2 = cleanIso(p.ISO_A2);
    const name = p.NAME_EN ?? p.ADMIN ?? p.NAME ?? 'Unnamed territory';
    const sovereignty = p.SOVEREIGNT ?? p.ADMIN ?? name;
    const sourceClassification = `${p.TYPE ?? ''} / ${p.FEATURECLA ?? ''}`.trim();
    const kind = normalizeEntityKind(iso3, sourceClassification);
    const countryId = stableId('country', `${iso3 ?? ''}|${sovereignty}|${p.BRK_A3 ?? ''}`);
    if (!countries.has(countryId)) countries.set(countryId, {
      id: countryId, commonName: p.ADMIN ?? name, officialName: p.FORMAL_EN || undefined, iso2, iso3,
      kind, sourceClassification, continent: p.CONTINENT || undefined, subregion: p.SUBREGION || undefined,
      sources: {
        identity: { value: 'Natural Earth Admin 0', source: 'Natural Earth', sourceUrl: 'https://www.naturalearthdata.com/', asOf: '2022', note: 'Geographic identity and classification only; statistics are intentionally not inferred.' }
      }
    });
    const sourceFeatureId = p.NE_ID ?? p.WIKIDATAID ?? `${name}|${sovereignty}`;
    return [{ id: stableId('territory', `${sourceFeatureId}|${JSON.stringify(feature.geometry)}`), name, geometry: feature.geometry, ownerCountryId: countryId,
      sovereignty, kind, sourceClassification, sourceFeatureId }];
  });
  return { countries, territories };
}
