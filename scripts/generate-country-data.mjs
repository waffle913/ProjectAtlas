import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const registry = await readJson('src/data/entity-registry.json');
const mapping = await readJson('src/data/natural-earth-mapping.json');
const geography = await readJson('public/data/natural-earth-admin-0.geojson');
const retrievedAt = '2026-09-26';
const source = (name, url, datasetId) => ({ name, url, datasetId, retrievedAt });
const sources = {
  un: source('United Nations Statistics Division M49', 'https://unstats.un.org/unsd/methodology/m49/overview', 'UNSD-M49'),
  iso: source('ISO 3166 Maintenance Agency', 'https://www.iso.org/obp/ui/#search/code/', 'ISO-3166-1'),
  wb: source('World Bank World Development Indicators', 'https://api.worldbank.org/v2/', 'WDI'),
  rest: source('World Countries dataset by mledoze', 'https://github.com/mledoze/countries', 'mledoze-countries'),
  wikidata: source('Wikidata', 'https://query.wikidata.org/', 'Wikidata-SPARQL'),
};
const datedOfficialSources = {
  venezuela: source('Government of Venezuela', 'https://mppre.gob.ve/', 'Venezuela-Government'),
  guineaBissau: source('Guinea-Bissau News Agency', 'https://ang.gw/', 'ANG-Guinea-Bissau'),
  somaliland: source('Presidency of the Republic of Somaliland', 'https://slpresidency.com/', 'Somaliland-Presidency'),
  northernCyprus: source('Turkish Republic of Northern Cyprus Public Information Office', 'https://pio.mfa.gov.ct.tr/en/', 'TRNC-PIO'),
  kosovo: source('Government of the Republic of Kosovo', 'https://www.rks-gov.net/EN', 'Kosovo-Government'),
  taiwan: source('Government Portal of the Republic of China (Taiwan)', 'https://www.taiwan.gov.tw/', 'Taiwan-Government'),
};

const strip = text => text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const unHtml = await (await fetch(sources.un.url)).text();
const unRows = [...unHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => strip(cell[1]))).filter(row => row.length >= 12);
const unByIso3 = new Map();
for (const row of unRows.filter(row => /^[A-Z]{3}$/.test(row[11]))) if (!unByIso3.has(row[11])) unByIso3.set(row[11], { commonName: row[8], m49: row[9], iso2: row[10], iso3: row[11], continent: row[3], subregion: row[5] });
const [mledozeCommit] = await (await fetch('https://api.github.com/repos/mledoze/countries/commits?path=countries.json&until=2026-01-01T23:59:59Z&per_page=1', { headers: { 'User-Agent': 'ProjectAtlas/0.2' } })).json();
const mledozeReferenceDate = mledozeCommit.commit.committer.date.slice(0, 10);
sources.rest = source('World Countries dataset by mledoze', mledozeCommit.html_url, `mledoze-countries@${mledozeCommit.sha}`);
const restCountries = await (await fetch(`https://raw.githubusercontent.com/mledoze/countries/${mledozeCommit.sha}/countries.json`)).json();
const restByIso3 = new Map(restCountries.map(country => [country.cca3, country]));

const indicatorCodes = ['SP.POP.TOTL', 'AG.SRF.TOTL.K2', 'AG.LND.TOTL.K2', 'NY.GDP.MKTP.CD', 'NY.GDP.PCAP.CD'];
const indicatorData = {};
for (const code of indicatorCodes) {
  const payload = await (await fetch(`https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=2020:2025`)).json();
  const latest = new Map();
  for (const row of payload[1] ?? []) if (row.value !== null && /^[A-Z]{3}$/.test(row.countryiso3code) && !latest.has(row.countryiso3code)) latest.set(row.countryiso3code, row);
  indicatorData[code] = latest;
}

async function officeholders(property) {
  const query = `SELECT ?iso3 ?person ?personLabel ?start ?end WHERE { ?country wdt:P298 ?iso3; p:${property} ?statement. ?statement ps:${property} ?person. OPTIONAL { ?statement pq:P580 ?start. } OPTIONAL { ?statement pq:P582 ?end. } FILTER((!BOUND(?start) || ?start <= "2026-01-01T00:00:00Z"^^xsd:dateTime) && (!BOUND(?end) || ?end >= "2026-01-01T00:00:00Z"^^xsd:dateTime)) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const response = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'ProjectAtlas/0.2 (github.com/waffle913/ProjectAtlas)' } });
  const bindings = (await response.json()).results.bindings;
  const grouped = new Map();
  for (const binding of bindings) {
    const row = { personId: binding.person.value.split('/').at(-1), personName: binding.personLabel.value, startDate: binding.start?.value.slice(0,10), endDate: binding.end?.value.slice(0,10) };
    const existing = grouped.get(binding.iso3.value);
    if (!existing || (row.startDate ?? '') > (existing.startDate ?? '')) grouped.set(binding.iso3.value, row);
  }
  return grouped;
}
const [headsOfState, headsOfGovernment] = await Promise.all([officeholders('P35'), officeholders('P6')]);
for (const iso3 of ['CHL','TCD','PER','VEN','BWA','GNB','SYR']) if (!headsOfGovernment.has(iso3) && headsOfState.has(iso3)) headsOfGovernment.set(iso3, headsOfState.get(iso3));
const unlabeledPeople = [...new Set([...headsOfState.values(), ...headsOfGovernment.values()].filter(record => /^Q\d+$/.test(record.personName)).map(record => record.personId))];
const manualPersonNames = { Q22686: 'Donald Trump', Q5771800: 'Claudia Sheinbaum', Q3052772: 'Emmanuel Macron', Q1780398: 'Ulf Kristersson', Q42478807: 'Đuro Macut' };
if (unlabeledPeople.length) {
  const response = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=${unlabeledPeople.join('|')}`, { headers: { 'User-Agent': 'ProjectAtlas/0.2' } });
  const entities = (await response.json()).entities;
  for (const record of [...headsOfState.values(), ...headsOfGovernment.values()]) if (/^Q\d+$/.test(record.personName)) record.personName = entities[record.personId]?.labels?.en?.value ?? manualPersonNames[record.personId] ?? record.personName;
}

const featureBySourceId = new Map(geography.features.map(feature => [String(feature.properties.NE_ID), feature]));
const bindingByCountry = new Map(mapping.features.map(binding => [binding.countryId, binding]));
const registryLabel = country => country.commonName ?? country.label ?? country.sourceMetadata?.naturalEarth?.admin;
const idByLabel = new Map(registry.countries.map(country => [registryLabel(country), country.id]));
const idByIso3 = new Map(registry.countries.filter(country => country.externalIds?.isoAlpha3).map(country => [country.externalIds.isoAlpha3, country.id]));
const codeFixes = { France: 'FRA', Norway: 'NOR', Palestine: 'PSE', 'Western Sahara': 'ESH', Taiwan: 'TWN' };
const typeOverrides = {
  'Western Sahara': 'disputed', 'Northern Cyprus': 'partially_recognized', Somaliland: 'partially_recognized', Kosovo: 'partially_recognized',
  Palestine: 'partially_recognized', 'State of Palestine': 'partially_recognized', Taiwan: 'partially_recognized', Antarctica: 'special_status',
  'Falkland Islands': 'dependency', 'Falkland Islands (Malvinas)': 'dependency', Greenland: 'dependency', 'French Southern and Antarctic Lands': 'dependency', 'French Southern Territories': 'dependency', 'Puerto Rico': 'dependency', 'New Caledonia': 'dependency',
};
const sovereignLabels = { 'Falkland Islands': 'United Kingdom', 'Falkland Islands (Malvinas)': 'United Kingdom', Greenland: 'Denmark', 'French Southern and Antarctic Lands': 'France', 'French Southern Territories': 'France', 'Puerto Rico': 'United States of America', 'New Caledonia': 'France' };
const sovereignIso3 = { 'Falkland Islands': 'GBR', 'Falkland Islands (Malvinas)': 'GBR', Greenland: 'DNK', 'French Southern and Antarctic Lands': 'FRA', 'French Southern Territories': 'FRA', 'Puerto Rico': 'USA', 'New Caledonia': 'FRA' };
const profileOverrides = {
  Taiwan: { officialName: 'Republic of China (Taiwan)', continent: 'Asia', unSubregion: 'Eastern Asia', capital: 'Taipei', source: datedOfficialSources.taiwan },
  'Northern Cyprus': { officialName: 'Turkish Republic of Northern Cyprus', continent: 'Asia', unSubregion: 'Western Asia', capital: 'North Nicosia', source: datedOfficialSources.northernCyprus },
  Somaliland: { officialName: 'Republic of Somaliland', continent: 'Africa', unSubregion: 'Sub-Saharan Africa', capital: 'Hargeisa', source: datedOfficialSources.somaliland },
  Kosovo: { officialName: 'Republic of Kosovo', continent: 'Europe', unSubregion: 'Southern Europe', capital: 'Pristina', source: datedOfficialSources.kosovo },
  Antarctica: { continent: 'Antarctica' },
};
const clean = value => value && value !== '-99' && value !== '-099' ? String(value) : undefined;

const profiles = [];
for (const old of registry.countries) {
  const baseLabel = registryLabel(old);
  const binding = bindingByCountry.get(old.id);
  const debug = featureBySourceId.get(binding.sourceId)?.properties ?? {};
  const candidateIso3 = clean(old.externalIds?.isoAlpha3) ?? codeFixes[baseLabel];
  const un = candidateIso3 ? unByIso3.get(candidateIso3) : undefined;
  const rest = candidateIso3 ? restByIso3.get(candidateIso3) : undefined;
  const iso3 = un?.iso3 ?? (['TWN'].includes(candidateIso3) ? candidateIso3 : undefined);
  const iso2 = un?.iso2 ?? (candidateIso3 === 'TWN' ? 'TW' : undefined);
  const m49 = un?.m49 ?? (candidateIso3 === 'TWN' ? '158' : undefined);
  const entityType = typeOverrides[baseLabel] ?? old.entityType ?? (rest?.independent === false ? 'dependency' : 'sovereign_state');
  const sovereignCountryId = old.sovereignCountryId ?? (sovereignIso3[baseLabel] ? idByIso3.get(sovereignIso3[baseLabel]) : sovereignLabels[baseLabel] ? idByLabel.get(sovereignLabels[baseLabel]) : undefined);
  const override = profileOverrides[baseLabel] ?? {};
  profiles.push({
    id: old.id, commonName: un?.commonName ?? rest?.name?.common ?? baseLabel,
    officialName: override.officialName ?? rest?.name?.official,
    externalIds: { ...(iso2 && { isoAlpha2: iso2 }), ...(iso3 && { isoAlpha3: iso3 }), ...(m49 && { unM49: m49 }) },
    entityType, ...(sovereignCountryId && { sovereignCountryId }),
    continent: override.continent ?? un?.continent, unSubregion: override.unSubregion ?? un?.subregion, capital: override.capital ?? rest?.capital?.[0],
    sources: { identity: [sources.un, sources.iso], details: [...(rest ? [sources.rest] : []), ...(override.source ? [override.source] : [])] },
    sourceMetadata: { naturalEarth: { datasetId: mapping.datasetId, featureId: binding.sourceId, wikidataId: debug.WIKIDATAID, admin: debug.ADMIN, sovereign: debug.SOVEREIGNT, type: debug.TYPE, adm0A3: debug.ADM0_A3 } },
  });
}

const registryV2 = { schemaVersion: 2, countries: profiles, territories: registry.territories };
const observation = (row, isEstimate) => row ? { value: row.value, source: sources.wb, referenceDate: row.date, isEstimate } : undefined;
const facts = profiles.map(profile => {
  const iso3 = profile.externalIds.isoAlpha3;
  const rest = iso3 ? restByIso3.get(iso3) : undefined;
  return { countryId: profile.id, facts: {
    population: observation(indicatorData['SP.POP.TOTL'].get(iso3), true),
    totalAreaKm2: observation(indicatorData['AG.SRF.TOTL.K2'].get(iso3), false),
    landAreaKm2: observation(indicatorData['AG.LND.TOTL.K2'].get(iso3), false),
    nominalGdpUsd: observation(indicatorData['NY.GDP.MKTP.CD'].get(iso3), true),
    gdpPerCapitaUsd: observation(indicatorData['NY.GDP.PCAP.CD'].get(iso3), true),
    currencies: rest?.currencies ? { value: Object.entries(rest.currencies).map(([code, currency]) => ({ code, name: currency.name, symbol: currency.symbol })), source: sources.rest, referenceDate: mledozeReferenceDate, isEstimate: false } : undefined,
    languages: rest?.languages ? { value: Object.values(rest.languages), source: sources.rest, referenceDate: mledozeReferenceDate, isEstimate: false } : undefined,
  }};
});

const offices = [];
const holders = [];
const manualOfficeholders = {
  'Venezuela (Bolivarian Republic of)': {
    head_of_state: { personId: 'Q58132', personName: 'Nicolás Maduro', startDate: '2025-01-10', source: datedOfficialSources.venezuela },
    head_of_government: { personId: 'Q58132', personName: 'Nicolás Maduro', startDate: '2025-01-10', source: datedOfficialSources.venezuela },
  },
  'Guinea-Bissau': { head_of_state: { personId: 'Q136640489', personName: 'Horta Inta-A', startDate: '2025-11-27', source: datedOfficialSources.guineaBissau } },
  'Northern Cyprus': {
    head_of_state: { personId: 'Q47188815', personName: 'Tufan Erhürman', startDate: '2025-10-24', source: sources.wikidata },
    head_of_government: { personId: 'Q12812869', personName: 'Ünal Üstel', startDate: '2022-05-12', source: sources.wikidata },
  },
  Somaliland: {
    head_of_state: { personId: 'Q4664994', personName: 'Abdirahman Mohamed Abdullahi', startDate: '2024-12-12', source: datedOfficialSources.somaliland },
    head_of_government: { personId: 'Q4664994', personName: 'Abdirahman Mohamed Abdullahi', startDate: '2024-12-12', source: datedOfficialSources.somaliland },
  },
  Kosovo: {
    head_of_state: { personId: 'Q13047644', personName: 'Vjosa Osmani', startDate: '2021-04-04', endDate: '2026-04-04', source: sources.wikidata },
    head_of_government: { personId: 'Q441633', personName: 'Albin Kurti', startDate: '2021-03-22', source: sources.wikidata },
  },
};
for (const profile of profiles.filter(p => ['sovereign_state','partially_recognized'].includes(p.entityType))) {
  const iso3 = profile.externalIds.isoAlpha3;
  for (const [kind, title, records] of [['head_of_state','Head of State',headsOfState], ['head_of_government','Head of Government',headsOfGovernment]]) {
    const officeId = `office:${profile.id}:${kind}`;
    offices.push({ id: officeId, countryId: profile.id, kind, title });
    const record = (iso3 ? records.get(iso3) : undefined) ?? manualOfficeholders[profile.commonName]?.[kind];
    if (record) holders.push({ officeId, person: { id: `wikidata:${record.personId}`, name: record.personName }, startDate: record.startDate, endDate: record.endDate, referenceDate: '2026-01-01', source: record.source ?? sources.wikidata });
  }
}

await writeFile(new URL('src/data/entity-registry.json', root), JSON.stringify(registryV2, null, 2) + '\n');
await writeFile(new URL('src/data/country-facts.json', root), JSON.stringify({ schemaVersion: 1, observationsAsOf: '2026-01-01', countries: facts }, null, 2) + '\n');
await writeFile(new URL('src/data/political-offices.json', root), JSON.stringify({ schemaVersion: 1, referenceDate: '2026-01-01', offices, officeholders: holders }, null, 2) + '\n');
console.log(`Generated ${profiles.length} profiles, ${facts.length} fact records, ${offices.length} offices, ${holders.length} officeholders.`);
