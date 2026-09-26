import { mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../src/data/source-snapshots/', import.meta.url);
await mkdir(output, { recursive: true });
const retrievedAt = new Date().toISOString().slice(0, 10);
const write = (name, data) => writeFile(new URL(name, output), JSON.stringify(data, null, 2) + '\n');
const strip = text => text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

const unUrl = 'https://unstats.un.org/unsd/methodology/m49/overview';
const unHtml = await (await fetch(unUrl)).text();
const rows = [...unHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => strip(cell[1]))).filter(row => row.length >= 12);
const m49 = new Map();
for (const row of rows.filter(row => /^[A-Z]{3}$/.test(row[11]))) if (!m49.has(row[11])) m49.set(row[11], { commonName: row[8], unM49: row[9], isoAlpha2: row[10], isoAlpha3: row[11], continent: row[3], unSubregion: row[5] });
await write('un-m49.json', { snapshotId: `UNSD-M49@${retrievedAt}`, retrievedAt, sourceUrl: unUrl, entities: [...m49.values()] });

const [commit] = await (await fetch('https://api.github.com/repos/mledoze/countries/commits?path=countries.json&until=2026-01-01T23:59:59Z&per_page=1', { headers: { 'User-Agent': 'ProjectAtlas/0.2' } })).json();
const countries = await (await fetch(`https://raw.githubusercontent.com/mledoze/countries/${commit.sha}/countries.json`)).json();
await write('world-countries.json', { snapshotId: `mledoze-countries@${commit.sha}`, referenceDate: commit.commit.committer.date.slice(0,10), retrievedAt, sourceUrl: commit.html_url, countries: countries.map(country => ({ name: country.name, isoAlpha2: country.cca2, isoAlpha3: country.cca3, unM49: country.ccn3, independent: country.independent, unMember: country.unMember, capital: country.capital, continent: country.region, subregion: country.subregion, area: country.area, currencies: country.currencies, languages: country.languages })) });

const indicators = {};
for (const code of ['SP.POP.TOTL','AG.SRF.TOTL.K2','AG.LND.TOTL.K2','NY.GDP.MKTP.CD','NY.GDP.PCAP.CD']) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=2020:2025`;
  const payload = await (await fetch(url)).json();
  const latest = new Map();
  for (const row of payload[1] ?? []) if (row.value !== null && /^[A-Z]{3}$/.test(row.countryiso3code) && !latest.has(row.countryiso3code)) latest.set(row.countryiso3code, { value: row.value, referenceDate: row.date });
  indicators[code] = Object.fromEntries(latest);
}
await write('world-bank.json', { snapshotId: `WDI@${retrievedAt}`, retrievedAt, sourceUrl: 'https://api.worldbank.org/v2/', indicators });

async function wikidataQuery(query) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'ProjectAtlas/0.2 (github.com/waffle913/ProjectAtlas)' } });
  return (await response.json()).results.bindings;
}
async function officeholders(property) {
  const query = `SELECT ?iso3 ?person ?personLabel ?start ?end WHERE { ?country wdt:P298 ?iso3; p:${property} ?statement. ?statement ps:${property} ?person. OPTIONAL { ?statement pq:P580 ?start. } OPTIONAL { ?statement pq:P582 ?end. } FILTER((!BOUND(?start) || ?start <= "2026-01-01T00:00:00Z"^^xsd:dateTime) && (!BOUND(?end) || ?end >= "2026-01-01T00:00:00Z"^^xsd:dateTime)) SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const grouped = new Map();
  for (const binding of await wikidataQuery(query)) {
    const record = { personId: binding.person.value.split('/').at(-1), personName: binding.personLabel.value, startDate: binding.start?.value.slice(0,10), endDate: binding.end?.value.slice(0,10) };
    const existing = grouped.get(binding.iso3.value);
    if (!existing || (record.startDate ?? '') > (existing.startDate ?? '')) grouped.set(binding.iso3.value, record);
  }
  return Object.fromEntries(grouped);
}
const [headsOfState, headsOfGovernment] = await Promise.all([officeholders('P35'), officeholders('P6')]);
await write('wikidata-offices.json', { snapshotId: `Wikidata-offices@${retrievedAt}`, referenceDate: '2026-01-01', retrievedAt, sourceUrl: 'https://query.wikidata.org/', headsOfState, headsOfGovernment });

const forms = {};
const governmentQuery = 'SELECT ?iso3 ?form ?formLabel WHERE { ?country wdt:P298 ?iso3; wdt:P122 ?form. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }';
for (const binding of await wikidataQuery(governmentQuery)) {
  const record = { id: binding.form.value.split('/').at(-1), name: binding.formLabel.value };
  (forms[binding.iso3.value] ??= []).push(record);
}
await write('wikidata-government-types.json', { snapshotId: `Wikidata-government-types@${retrievedAt}`, referenceDate: retrievedAt, retrievedAt, sourceUrl: 'https://query.wikidata.org/', forms });
console.log(`Pinned ${m49.size} UN M49 areas, ${countries.length} country profiles and World Bank/Wikidata observations.`);
