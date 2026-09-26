import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const normalize = value => String(value ?? '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const validIso31662 = value => /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(value ?? '');

export async function loadAdmin1Model() {
  const metadata = await readJson('src/data/source-snapshots/natural-earth-admin1-metadata.json');
  const [source, countryRegistry] = await Promise.all([
    readJson(`src/data/source-snapshots/natural-earth-admin1-v${metadata.version}.geojson`),
    readJson('src/data/entity-registry.json'),
  ]);
  const countriesById = new Map(countryRegistry.countries.map(country => [country.id, country]));
  const countriesByIso3 = new Map(countryRegistry.countries.flatMap(country => country.externalIds.isoAlpha3 ? [[country.externalIds.isoAlpha3, country]] : []));
  const countriesByName = new Map(countryRegistry.countries.map(country => [country.commonName, country]));
  const territoryByCountry = new Map(countryRegistry.territories.map(territory => [territory.initialOwnerCountryId, territory]));
  const aliases = new Map([
    ['ALD', countriesByIso3.get('ALA')], ['CYN', countriesByName.get('Northern Cyprus')],
    ['KOS', countriesByName.get('Kosovo')], ['PSX', countriesByIso3.get('PSE')],
    ['SAH', countriesByIso3.get('ESH')], ['SDS', countriesByIso3.get('SSD')],
    ['SOL', countriesByName.get('Somaliland')], ['ESB', countriesByIso3.get('GBR')],
    ['WSB', countriesByIso3.get('GBR')], ['USG', countriesByIso3.get('CUB')],
    ['KAB', countriesByIso3.get('KAZ')], ['CSI', countriesByIso3.get('AUS')],
    ['ATC', countriesByIso3.get('AUS')], ['CLP', countriesByIso3.get('FRA')],
  ]);
  const excludedCodes = new Map([
    ['KAS', 'Siachen Glacier is disputed and the country registry has no neutral entity to own this source feature.'],
    ['PGA', 'The Spratly Islands are disputed and the country registry has no neutral entity to own this source feature.'],
  ]);

  const mapped = [];
  const excluded = [];
  for (const feature of source.features) {
    const properties = feature.properties ?? {};
    const sourceId = String(properties.ne_id ?? '');
    const excludedReason = excludedCodes.get(properties.adm0_a3);
    const country = countriesByIso3.get(properties.gu_a3)
      ?? countriesByIso3.get(properties.adm0_a3)
      ?? aliases.get(properties.adm0_a3);
    if (!sourceId || excludedReason || !country) {
      excluded.push({
        sourceId,
        sourceCountryCode: properties.adm0_a3,
        name: properties.name,
        reason: excludedReason ?? 'No reviewed ProjectAtlas country mapping exists for this Natural Earth feature.',
      });
      continue;
    }
    const sourceIso = validIso31662(properties.iso_3166_2) ? properties.iso_3166_2 : undefined;
    mapped.push({ feature, properties, sourceId, country, sourceIso });
  }

  const grouped = new Map();
  for (const record of mapped) {
    const groupKey = `${record.country.id}|${record.sourceIso ?? 'no-iso'}|${normalize(record.properties.name)}`;
    const records = grouped.get(groupKey) ?? [];
    records.push(record);
    grouped.set(groupKey, records);
  }
  const isoGroups = new Map();
  for (const [groupKey, records] of grouped) {
    if (!records[0].sourceIso) continue;
    const keys = isoGroups.get(records[0].sourceIso) ?? [];
    keys.push(groupKey);
    isoGroups.set(records[0].sourceIso, keys);
  }
  const ambiguousIsoCodes = new Set([...isoGroups].filter(([, keys]) => keys.length > 1).map(([iso]) => iso));

  const candidateGroups = [...grouped.values()].map(records => {
    records.sort((a, b) => String(a.properties.adm1_code).localeCompare(String(b.properties.adm1_code)));
    const first = records[0];
    const sourceCodes = records.map(record => String(record.properties.adm1_code));
    const iso31662 = first.sourceIso && !ambiguousIsoCodes.has(first.sourceIso) ? first.sourceIso : undefined;
    return {
      assignmentKey: `natural-earth:${sourceCodes[0]}`,
      country: first.country,
      macroTerritory: territoryByCountry.get(first.country.id),
      name: first.properties.name_en ?? first.properties.name,
      localType: first.properties.type_en ?? first.properties.type ?? undefined,
      administrativeLevel: 1,
      iso31662,
      candidateIso31662: first.sourceIso && !iso31662 ? first.sourceIso : undefined,
      sourceCodes,
      sourceIds: records.map(record => record.sourceId),
      wikidataIds: [...new Set(records.map(record => record.properties.wikidataid).filter(Boolean))],
      records,
      ambiguous: Boolean(first.properties.note || !iso31662 || records.some(record => record.properties.note)),
      notes: [...new Set(records.map(record => record.properties.note).filter(Boolean))],
    };
  }).sort((a, b) => a.assignmentKey.localeCompare(b.assignmentKey));

  const candidateByCountry = new Map();
  for (const group of candidateGroups) {
    const groups = candidateByCountry.get(group.country.id) ?? [];
    groups.push(group);
    candidateByCountry.set(group.country.id, groups);
  }
  const singleGroupCountryIds = new Set([...candidateByCountry].filter(([, groups]) => groups.length === 1).map(([countryId]) => countryId));
  for (const group of candidateGroups.filter(item => singleGroupCountryIds.has(item.country.id))) {
    for (const record of group.records) excluded.push({
      sourceId: record.sourceId,
      sourceCountryCode: record.properties.adm0_a3,
      name: record.properties.name,
      reason: 'A single source feature does not establish a reliable subnational division; ProjectAtlas uses an explicit national fallback region.',
    });
  }
  const regionGroups = candidateGroups.filter(group => !singleGroupCountryIds.has(group.country.id));
  const groupsByCountry = new Map();
  for (const group of regionGroups) {
    const groups = groupsByCountry.get(group.country.id) ?? [];
    groups.push(group);
    groupsByCountry.set(group.country.id, groups);
  }
  const fallbackCountries = countryRegistry.countries.filter(country => !groupsByCountry.has(country.id));
  return { metadata, source, countryRegistry, countriesById, territoryByCountry, regionGroups, groupsByCountry, fallbackCountries, excluded };
}
