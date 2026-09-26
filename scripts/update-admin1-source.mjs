import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const version = '5.1.2';
const commit = 'f1890d9f152c896d250a77557a5751a93d494776';
const retrievedAt = new Date().toISOString().slice(0, 10);
const sourceUrl = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit}/geojson/ne_10m_admin_1_states_provinces.geojson`;
const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status} ${response.statusText}`);
const bytes = Buffer.from(await response.arrayBuffer());
const snapshot = JSON.parse(bytes.toString('utf8'));
if (snapshot.type !== 'FeatureCollection' || snapshot.features.length < 4_000) {
  throw new Error('Downloaded Natural Earth Admin-1 snapshot is incomplete or malformed.');
}

const output = new URL('../src/data/source-snapshots/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL(`natural-earth-admin1-v${version}.geojson`, output), bytes);
await writeFile(new URL('natural-earth-admin1-metadata.json', output), JSON.stringify({
  snapshotId: `natural-earth-admin1-${version}@${commit}`,
  version,
  commit,
  retrievedAt,
  sourceUrl,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  featureCount: snapshot.features.length,
  license: 'Public domain',
  licenseUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
  limitations: [
    'Natural Earth labels the 10m Admin-1 layer beta and does not guarantee complete or current global coverage.',
    'Boundaries are cartographic source data and do not express a ProjectAtlas legal position.',
  ],
}, null, 2) + '\n');
console.log(`Pinned Natural Earth Admin-1 ${version}: ${snapshot.features.length} features, ${bytes.length} bytes.`);
