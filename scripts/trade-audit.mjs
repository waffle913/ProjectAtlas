import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { normalizeTradeSnapshot } from './lib/trade-source.mjs';
const [data, registry, snapshot] = await Promise.all([
  new URL('../src/data/trade-observations.json', import.meta.url), new URL('../src/data/entity-registry.json', import.meta.url),
  new URL('../src/data/source-snapshots/statcan-trade-2024-2026-10-03.json', import.meta.url),
].map(async file => JSON.parse(await readFile(file, 'utf8'))));
const normalized = normalizeTradeSnapshot(snapshot, registry);
const corruptions = [
  s => { s.fxSource.referenceDate = '2030-12-31'; },
  s => { s.fxSource.retrievedAt = '2024-01-01'; },
  s => { s.fxSource.licence = ''; },
  s => { s.fxSource.publisher = ''; },
  s => { s.rows[0].points[0].releaseTime = '2024-13-99T08:30:00'; },
  s => { s.rows[0].points[0].releaseTime = '2024-02-30T08:30'; },
  s => { s.rows[0].points[0].releaseTime = '2026-02-19T27:30'; },
  s => { s.rows[0].points[0].securityLevelCode = 1; },
];
for (const edit of corruptions) {
  const changed = structuredClone(snapshot); edit(changed);
  assert.throws(() => normalizeTradeSnapshot(changed, registry));
}
if (process.argv.includes('--write')) {
  data.records = [...data.records.filter(r => r.id.startsWith('census.')).map(r => ({
    ...r, availableOn: r.source.publishedOn ?? r.source.retrievedAt,
  })), ...normalized];
  await writeFile(new URL('../src/data/trade-observations.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
}
assert.deepEqual(data.records.filter(r => r.id.startsWith('statcan.')), normalized);
assert.equal(data.records.length, 62);
assert.equal(new Set(data.records.map(r => r.id)).size, 62);
const known = new Set(registry.countries.map(c => c.id));
for (const r of data.records) {
  assert(known.has(r.importerId) && known.has(r.exporterId) && r.importerId !== r.exporterId);
  assert(Number.isSafeInteger(r.annualValueUsd) && r.annualValueUsd >= 0);
  assert.equal(r.source.referenceDate, '2024-12-31');
  assert.equal(r.temporalStatus, 'historical_prior'); assert.equal(r.coverage, 'partial');
  assert.equal(r.availableOn, '2026-10-03');
  assert.equal(r.quantity, undefined); assert.equal(r.quantityUnit, undefined);
  for (const source of [r.source, ...r.inputs ?? []]) for (const field of [
    'publisher', 'dataset', 'url', 'referenceDate', 'retrievedAt', 'licence', 'attribution', 'limitation',
  ]) assert(typeof source[field] === 'string' && source[field].trim(), `Missing ${field} in ${r.id}`);
}
const census = data.records.filter(r => r.id.startsWith('census.'));
assert(census.every(r => r.aggregateOnly === true));
assert.deepEqual(census.map(r => r.annualValueUsd).sort((a, b) => a - b), [350605600000, 411771600000]);
assert(normalized.every(r => r.source.publishedOn < r.availableOn && r.source.licence.includes('Statistics Canada Open Licence')
  && r.inputs[0].licence.includes('paid-product notice') && r.inputs[0].publishedOn === null));
console.info(`TRADE_SOURCE_AUDIT ${JSON.stringify({ records: 62, categoryObservations: 60, aggregateReferences: 2,
  rawSeries: 72, rawMonthlyPoints: 864, referenceYear: 2024, quantityCoverage: 'unavailable',
  operativePhysicalBaseline: 'unavailable', earliestGovernmentAdmission: '2026-10-03',
  rejectedSourceCorruptions: corruptions.length,
  licence: 'StatCan Open Licence; Census federal factual statistics; Bank of Canada attribution and pre-sale free-content notice',
})}`);
