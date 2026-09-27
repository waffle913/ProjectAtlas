import { createGunzip } from 'node:zlib';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { stableJson } from './population-model.mjs';
const rawPath = '.cache/population/WPP2024_Demographic_Indicators_Medium.csv.gz';
const manifest = JSON.parse(readFileSync('src/data/population-source-manifest.json', 'utf8'));
const digest = createHash('sha256').update(readFileSync(rawPath)).digest('hex');
if (digest !== manifest.wppSource.sha256) throw new Error(`WPP source checksum mismatch: ${digest}`);
const registry = JSON.parse(readFileSync('src/data/entity-registry.json', 'utf8'));
const countryByM49 = new Map(registry.countries.filter(item => item.externalIds.unM49).map(item => [item.externalIds.unM49, item]));
const lines = createInterface({ input: createReadStream(rawPath).pipe(createGunzip()), crlfDelay: Infinity });
let headers; const records = [];
for await (const line of lines) {
  if (!headers) { headers = line.split(','); continue; }
  const cells = line.split(','); const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
  if (row.LocTypeName !== 'Country/Area' || row.Time !== '2026' || !row.SDMX_code) continue;
  const country = countryByM49.get(row.SDMX_code.padStart(3, '0')); if (!country) continue;
  const value = Math.round(Number(row.TPopulation1Jan) * 1000);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid WPP population for ${row.Location}`);
  records.push({ countryId: country.id, value, referenceDate: '2026-01-01', isEstimate: true, isProjection: true, source: manifest.wppSource.publicationSource });
}
records.sort((a, b) => a.countryId.localeCompare(b.countryId));
writeFileSync('src/data/source-snapshots/wpp2024-population-2026-01-01.json', stableJson({ schemaVersion: 1, sourceSnapshot: manifest.snapshotId, records }));
console.log(`Extracted ${records.length} country/area population observations from the pinned WPP source.`);
