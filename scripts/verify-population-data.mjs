import { readFileSync } from 'node:fs'; import { spawnSync } from 'node:child_process';
import { hashJson, validateSpatialWeightsArtifact } from './worldpop-zonal.mjs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const weights = read('src/data/population-spatial-weights.json'), audit = read('src/data/population-spatial-audit.json'), manifest = read('src/data/population-source-manifest.json'), regions = read('src/data/region-registry.json').regions;
validateSpatialWeightsArtifact(weights, regions, manifest);
const { sha256, ...auditBody } = audit;
if (hashJson(auditBody) !== sha256 || weights.audit.sha256 !== sha256) { console.error('Population spatial audit checksum does not match the accepted weights.'); process.exit(1); }
const files = ['src/data/region-demographics.json', 'src/data/population-coverage-report.json']; const before = new Map(files.map(path => [path, readFileSync(path, 'utf8')]));
const run = spawnSync(process.execPath, ['scripts/generate-population-data.mjs'], { encoding: 'utf8' }); if (run.status) { process.stderr.write(run.stderr); process.exit(run.status ?? 1); }
const changed = files.filter(path => readFileSync(path, 'utf8') !== before.get(path)); if (changed.length) { console.error(`Generated population data is stale: ${changed.join(', ')}`); process.exit(1); }
console.log('Population artifacts reproduce identically from pinned compact inputs.');
