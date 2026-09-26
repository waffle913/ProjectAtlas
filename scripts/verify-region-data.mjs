import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

const generatedFiles = [
  'src/data/region-registry.json',
  'src/data/admin1-mapping.json',
  'src/data/admin1-coverage-report.json',
];
const runtimeRoot = 'public/data/admin1';
const listFiles = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? listFiles(join(directory, entry.name)) : [join(directory, entry.name)]));
  return nested.flat();
};
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const snapshot = async () => {
  const files = [...generatedFiles, ...(await listFiles(runtimeRoot))].sort();
  return new Map(await Promise.all(files.map(async file => [relative('.', file).replaceAll('\\', '/'), await digest(file)])));
};
const before = await snapshot();
const result = spawnSync(process.execPath, ['scripts/generate-region-data.mjs'], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 10_000_000 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);
const after = await snapshot();
const paths = new Set([...before.keys(), ...after.keys()]);
const changed = [...paths].filter(path => before.get(path) !== after.get(path));
if (changed.length) {
  console.error(`Generated Region data was stale: ${changed.slice(0, 20).join(', ')}${changed.length > 20 ? ` and ${changed.length - 20} more` : ''}.`);
  process.exit(1);
}
console.log('Generated Region registry and runtime geography match the pinned source snapshot.');
