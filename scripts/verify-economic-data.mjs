import { readFileSync } from 'node:fs'; import { spawnSync } from 'node:child_process';
const files = ['src/data/region-economic-baselines.json', 'src/data/economic-coverage-report.json'], before = new Map(files.map(path => [path, readFileSync(path, 'utf8')]));
const run = spawnSync(process.execPath, ['scripts/generate-economic-data.mjs'], { encoding: 'utf8' }); if (run.status) { process.stderr.write(run.stderr); process.exit(run.status ?? 1); }
const changed = files.filter(path => readFileSync(path, 'utf8') !== before.get(path)); if (changed.length) { console.error(`Generated economic data is stale: ${changed.join(', ')}`); process.exit(1); }
console.log('Economic artifacts reproduce identically from committed country facts and demographics.');
