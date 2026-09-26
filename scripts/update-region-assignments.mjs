import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { loadAdmin1Model } from './admin1-model.mjs';

const output = new URL('../src/data/region-id-assignments.json', import.meta.url);
let assignments = { schemaVersion: 1, regions: {} };
try { assignments = JSON.parse(await readFile(output, 'utf8')); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const model = await loadAdmin1Model();
const required = [
  ...model.regionGroups.map(group => group.assignmentKey),
  ...model.fallbackCountries.map(country => `fallback:${country.id}`),
];
let added = 0;
for (const key of required) {
  if (assignments.regions[key]) continue;
  assignments.regions[key] = { regionId: `region.${randomUUID()}` };
  added += 1;
}
await writeFile(output, JSON.stringify(assignments, null, 2) + '\n');
console.log(`Region assignments: ${required.length} active, ${added} newly allocated, ${Object.keys(assignments.regions).length} retained.`);
