import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const generatedFiles = [
  'src/data/entity-registry.json',
  'src/data/country-facts.json',
  'src/data/political-offices.json',
];
const before = new Map(generatedFiles.map(file => [file, readFileSync(file, 'utf8')]));
const result = spawnSync(process.execPath, ['scripts/generate-country-data.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

const changed = generatedFiles.filter(file => readFileSync(file, 'utf8') !== before.get(file));
if (changed.length) {
  console.error(`Generated country data was stale: ${changed.join(', ')}. Commit the regenerated files.`);
  process.exit(1);
}
console.log('Generated country data matches the pinned source snapshots.');
