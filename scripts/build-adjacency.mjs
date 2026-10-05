import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Derives a deterministic, symmetric land-adjacency registry from the pinned,
// committed Admin-1 geometry assets. Adjacency is defined as two Regions sharing
// at least one exact boundary vertex (the assets are topologically clean after
// mapshaper `keep-shapes` simplification, so shared borders share vertices).
// This never invents borders: only exact shared vertices create an edge, and
// Regions without mappable geometry are recorded as explicitly unavailable.
const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const registry = await readJson('src/data/region-registry.json');
if (registry.schemaVersion !== 2) throw new Error('Unsupported Region registry schema.');

const countriesDir = fileURLToPath(new URL('public/data/admin1/countries', root));
const files = (await readdir(countriesDir)).filter(name => name.endsWith('.geojson')).sort();
const keyScale = 10000;
const pointKey = ([x, y]) => `${(Math.round(x * keyScale) / keyScale).toFixed(4)}|${(Math.round(y * keyScale) / keyScale).toFixed(4)}`;

const pointToRegions = new Map();
const seenRegions = new Set();
for (const file of files) {
  const collection = JSON.parse(await readFile(join(countriesDir, file), 'utf8'));
  for (const feature of collection.features) {
    const regionId = feature.properties?.regionId;
    if (!regionId) throw new Error(`Geometry feature lacks a bound Region ID in ${file}.`);
    seenRegions.add(regionId);
    const rings = feature.geometry?.type === 'Polygon'
      ? feature.geometry.coordinates
      : feature.geometry?.type === 'MultiPolygon'
        ? feature.geometry.coordinates.flat()
        : [];
    for (const ring of rings) {
      for (const point of ring) {
        const key = pointKey(point);
        const regions = pointToRegions.get(key);
        if (!regions) pointToRegions.set(key, new Set([regionId]));
        else regions.add(regionId);
      }
    }
  }
}

const neighbours = new Map();
for (const regions of pointToRegions.values()) {
  if (regions.size < 2) continue;
  for (const a of regions) for (const b of regions) {
    if (a === b) continue;
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    if (!neighbours.has(b)) neighbours.set(b, new Set());
    neighbours.get(a).add(b);
    neighbours.get(b).add(a);
  }
}

const adjacency = {};
const unavailable = {};
for (const region of registry.regions) {
  const ids = neighbours.get(region.id);
  if (region.geographyMapping.status === 'mapped' && ids?.size) {
    adjacency[region.id] = [...ids].sort();
  } else if (region.geographyMapping.status === 'mapped') {
    unavailable[region.id] = 'Mapped Admin-1 geometry shares no boundary vertices with any other Region.';
  } else {
    unavailable[region.id] = region.geographyMapping.status === 'fallback_admin0'
      ? 'Admin-0 fallback territory has no first-order adjacency derivation.'
      : 'No mappable Admin-1 geometry is available for this Region.';
  }
}

const source = registry.sourceSnapshot;
const output = {
  schemaVersion: 1,
  derivedFrom: {
    regionRegistrySchemaVersion: registry.schemaVersion,
    snapshotId: source.snapshotId,
    retrievedAt: source.retrievedAt,
    sourceUrl: source.sourceUrl,
    license: source.license,
    licenseUrl: source.licenseUrl,
    method: 'Exact shared boundary vertices across committed simplified Admin-1 geometry; symmetric, sorted unique neighbours, no self-edges.',
    limitations: [...(source.limitations ?? []), 'Adjacency is derived from display geometry; enclaves, tunnels and ferries are not represented.'],
  },
  adjacency,
  unavailable,
};

let edgeCount = 0;
for (const ids of Object.values(adjacency)) edgeCount += ids.length;
const unavailableCount = Object.keys(unavailable).length;
await writeFile(new URL('src/data/land-adjacency.json', root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`land-adjacency: ${Object.keys(adjacency).length} mapped Regions with ${edgeCount / 2} undirected edges; ${unavailableCount} Regions explicit unavailable.`);
