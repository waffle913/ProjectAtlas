import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const path = 'src/data/fiscal-rules.json';
const data = read(path);
const countries = read('src/data/entity-registry.json').countries;
const categories = ['personal', 'consumption', 'payroll', 'corporate'];
const ids = new Set(countries.map(c => c.id));
const keys = new Set();
for (const r of data.rules) {
  assert(ids.has(r.countryId)); assert(categories.includes(r.kind));
  const key = `${r.countryId}:${r.kind}`; assert(!keys.has(key)); keys.add(key);
  assert(['sourced', 'partial'].includes(r.status));
  assert(r.effectiveDate <= data.scenarioDate && r.referenceDate === data.scenarioDate);
  for (const field of ['currency', 'unit', 'scope', 'document', 'limitations', 'retrievedAt']) assert(r[field]);
  assert(new URL(r.source).protocol === 'https:');
  for (const x of [r, ...(r.bands ?? []), ...(r.employee ?? []), ...(r.employer ?? [])]) {
    if (x.rateBps !== undefined) assert(Number.isInteger(x.rateBps) && x.rateBps >= 0 && x.rateBps <= 10000);
  }
  if (r.bands) { assert.equal(r.bands[0].lower, 0); r.bands.forEach((b, i) => assert(Number.isSafeInteger(b.lower) && b.lower >= 0 && (!i || b.lower > r.bands[i - 1].lower))); }
  if (r.currency !== 'USD') assert(!r.bands && !r.employee && !r.employer && r.allowance === undefined, 'Local monetary rules need sourced FX');
}
const report = {
  version: data.version, referenceDate: data.scenarioDate,
  extractSha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
  stage: 'legal-data-reviewed; actual-engine-coverage-in-fiscal-initialization-report.json',
  totals: Object.fromEntries(categories.map(kind => [kind, { partial: data.rules.filter(r => r.kind === kind).length, unavailable: countries.length - data.rules.filter(r => r.kind === kind).length }])),
  countries: countries.map(c => ({ countryId: c.id, name: c.commonName,
    legal: Object.fromEntries(categories.map(kind => [kind, data.rules.find(r => r.countryId === c.id && r.kind === kind)?.status ?? 'unavailable'])),
    observedAggregates: { revenue: 'unavailable', spending: 'unavailable', debt: 'unavailable', interest: 'unavailable' },
    observedServices: { health: 'unavailable', education: 'unavailable', socialProtection: 'unavailable', infrastructure: 'unavailable' },
    simulationInitialization: 'see-fiscal-initialization-report.json',
  })),
};
const output = JSON.stringify(report, null, 2) + '\n';
const destination = 'src/data/fiscal-coverage-report.json';
if (process.argv.includes('--write')) writeFileSync(destination, output);
else assert.equal(readFileSync(destination, 'utf8'), output, 'Fiscal coverage report is stale');
console.log(JSON.stringify({ countries: countries.length, rules: data.rules.length, totals: report.totals, sha256: report.extractSha256 }, null, 2));

const execution = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'src/simulation/__tests__/fiscal.test.ts', 'src/simulation/__tests__/fiscalWorld.test.ts', '--reporter=verbose'], {
  stdio: 'inherit', env: { ...process.env, WRITE_FISCAL_REPORT: process.argv.includes('--write') ? '1' : '0' },
});
process.exit(execution.status ?? 1);
