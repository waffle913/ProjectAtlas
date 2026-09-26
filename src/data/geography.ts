import type { Country, EntityKind, Territory } from '../types';

const kindFor = (p: Record<string, string>): EntityKind => {
  const text = `${p.TYPE ?? ''} ${p.FEATURECLA ?? ''}`.toLowerCase();
  if (text.includes('disputed') || text.includes('indeterminate')) return 'disputed';
  if (text.includes('dependency') || text.includes('territory')) return 'dependency';
  if (text.includes('sovereign country') || text.includes('country')) return 'sovereign';
  return 'other';
};
const cleanIso = (value?: string) => value && value !== '-99' ? value : undefined;

/** Converts a published geographic snapshot into gameplay entities. Source geometry remains immutable. */
export function buildWorld(featureCollection: GeoJSON.FeatureCollection) {
  const countries = new Map<string, Country>();
  const territories: Territory[] = featureCollection.features.flatMap((feature, index) => {
    if (!feature.geometry) return [];
    const p = (feature.properties ?? {}) as Record<string, string>;
    const iso3 = cleanIso(p.ADM0_A3) ?? cleanIso(p.ISO_A3) ?? `NE-${index}`;
    const iso2 = cleanIso(p.ISO_A2);
    const kind = kindFor(p);
    const name = p.NAME_EN ?? p.ADMIN ?? p.NAME ?? iso3;
    if (!countries.has(iso3)) countries.set(iso3, {
      id: iso3, commonName: p.ADMIN ?? name, officialName: p.FORMAL_EN || undefined, iso2, iso3,
      kind, continent: p.CONTINENT || undefined, subregion: p.SUBREGION || undefined,
      sources: {
        identity: { value: 'Natural Earth Admin 0', source: 'Natural Earth', sourceUrl: 'https://www.naturalearthdata.com/', asOf: '2022', note: 'Geographic identity and classification only; statistics are intentionally not inferred.' }
      }
    });
    return [{ id: `ne-admin0-${index}`, name, geometry: feature.geometry, ownerCountryId: iso3,
      sovereignty: p.SOVEREIGNT ?? p.ADMIN ?? name, kind, sourceFeatureId: String(feature.id ?? index) }];
  });
  return { countries, territories };
}
