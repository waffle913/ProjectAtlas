import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = name => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
const adjacency = read('land-adjacency');
const regions = read('region-registry');
assert.equal(adjacency.schemaVersion, 1);
const regionIds = new Set(regions.regions.map(region => region.id));
const graph = adjacency.adjacency;
const unavailable = adjacency.unavailable;
let edges = 0;
for (const [regionId, neighbours] of Object.entries(graph)) {
  assert(regionIds.has(regionId), `Adjacency references unknown Region ${regionId}.`);
  assert(Array.isArray(neighbours));
  assert.equal(new Set(neighbours).size, neighbours.length, `Duplicate neighbour for ${regionId}.`);
  assert.deepEqual([...neighbours].sort(), neighbours, `Unsorted neighbours for ${regionId}.`);
  assert(!neighbours.includes(regionId), `Self-edge for ${regionId}.`);
  for (const neighbour of neighbours) {
    assert(regionIds.has(neighbour), `Unknown neighbour ${neighbour}.`);
    assert(graph[neighbour]?.includes(regionId), `Asymmetric edge ${regionId}<->${neighbour}.`);
  }
  edges += neighbours.length;
}
for (const region of regions.regions) {
  const hasEdges = Boolean(graph[region.id]?.length);
  const isUnavailable = region.id in unavailable;
  assert(hasEdges !== isUnavailable, `Region ${region.id} is neither adjacent nor explicitly unavailable.`);
  if (isUnavailable) assert(unavailable[region.id].trim(), `Empty unavailable reason for ${region.id}.`);
}
console.log(JSON.stringify({
  audit: 'operations-0.19-adjacency',
  mappedRegions: Object.keys(graph).length,
  undirectedEdges: edges / 2,
  explicitUnavailableRegions: Object.keys(unavailable).length,
  totalRegions: regions.regions.length,
  derivedFrom: adjacency.derivedFrom.snapshotId,
  determinism: 'sorted unique symmetric no-self-edge over permanent Region IDs; derived once from pinned committed geometry, never per tick and never serialized into saves.',
  runtimeInvariants: 'deployment/supply/engagement/component conservation, occupation/control/sovereignty separation and war-goal coherence are enforced by the operations and war invariants exercised in the operations test suite.',
}));
