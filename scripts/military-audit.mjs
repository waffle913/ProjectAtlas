import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = name => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
const observations = read('military-observations'), registry = read('entity-registry');
assert.equal(observations.version, 'military-source-references-0.16-v1');
assert.equal(observations.scenarioDate, '2026-01-01');
assert.equal(new Set(observations.records.map(r => r.id)).size, observations.records.length);
for (const r of observations.records) {
  assert(registry.countries.some(c => c.id === r.countryId));
  assert.equal(r.status, 'partial');
  assert.equal(r.source.status, 'sourced'); assert.equal(r.source.referenceDate, observations.scenarioDate);
  for (const key of ['publisher', 'url', 'retrievedAt', 'licence', 'attribution', 'limitation']) assert.equal(typeof r.source[key], 'string');
  assert.equal(r.source.scenarioFixture, false); assert.equal(r.roundingPersons, 10);
  assert(Number.isSafeInteger(r.regularPersonnelReported) && r.regularPersonnelReported > 0);
  assert(Number.isSafeInteger(r.untrainedPersonnelReported) && r.untrainedPersonnelReported >= 0);
  assert(r.source.limitation.includes('not an exact conserved simulation stock'));
  assert(r.source.limitation.includes('remain unavailable'));
}
const uk = observations.records.find(r => r.id === 'uk-mod-regular-strength-2026-01-01');
assert(uk); assert.equal(uk.regularPersonnelReported, 136960); assert.equal(uk.untrainedPersonnelReported, 10720);
assert(uk.source.licence.includes('Open Government Licence v3.0'));
console.log(JSON.stringify({ audit: 'military-0.16', countries: registry.countries.length, partialHistoricalReferences: observations.records.length,
  admittedFactualOperativeCapabilities: 0, unavailableOperativeCapabilities: registry.countries.length,
  commercialRelease: 'Existing IPU incompatibility and unconfirmed political-source licences still block release; military OGL attribution is separate.',
  limitation: 'No empirical equipment, stock, salary, available-force or industrial calibration; synthetic mechanics tested separately.' }));
