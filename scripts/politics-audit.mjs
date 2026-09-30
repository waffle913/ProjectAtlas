import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const registryPath = 'src/data/entity-registry.json';
const officesPath = 'src/data/political-offices.json';
const destination = 'src/data/politics-coverage-report.json';
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const offices = JSON.parse(readFileSync(officesPath, 'utf8'));
assert.equal(offices.referenceDate, '2026-01-01');
const countryIds = new Set(registry.countries.map(country => country.id));
const kindsByCountry = new Map();
for (const office of offices.offices) {
  assert(countryIds.has(office.countryId));
  const kinds = kindsByCountry.get(office.countryId) ?? new Set(); kinds.add(office.kind); kindsByCountry.set(office.countryId, kinds);
}
const countries = [...registry.countries].sort((a, b) => a.id.localeCompare(b.id)).map(country => {
  const kinds = kindsByCountry.get(country.id);
  const partial = kinds?.has('head_of_state') && kinds.has('head_of_government');
  return { countryId: country.id, name: country.commonName,
    institutions: partial ? 'partial' : 'unavailable', executiveSystem: 'unavailable', legislature: 'unavailable', electoralSystem: 'unavailable',
    partyBasis: 'modelled', seats: 'unavailable', coalition: 'unavailable', organizedInterests: 'modelled', opinionAnchor: 'modelled',
    evidence: partial ? { dataset: 'political-offices.json', referenceDate: offices.referenceDate, limitation: 'Office structure only; it does not establish institutional form, legislature, electoral rules, seats or coalition.' } : { limitation: 'No admissible national institutional snapshot applicable on 2026-01-01.' },
  };
});
const counts = status => countries.filter(country => country.institutions === status).length;
const report = { version: 'politics-coverage-0.13-v1', scenarioDate: '2026-01-01', generatedFrom: {
  entityRegistrySha256: createHash('sha256').update(readFileSync(registryPath)).digest('hex'),
  politicalOfficesSha256: createHash('sha256').update(readFileSync(officesPath)).digest('hex'),
}, assumptions: {
  visiblePartyIdentities: 'Three explicitly fictional, modelled analytical archetypes per Country.',
  organizedInterests: 'One fictional union and one fictional association per Country; membership remains unavailable.',
  opinion: 'Modelled from existing socioeconomic cohorts and current material conditions without polling or electoral calibration.',
}, totals: { countries: countries.length, institutionPartial: counts('partial'), institutionUnavailable: counts('unavailable'), legislatureUnavailable: countries.length, electoralSystemUnavailable: countries.length, seatsUnavailable: countries.length, coalitionUnavailable: countries.length, fictionalParties: countries.length * 3, fictionalOrganizations: countries.length * 2 }, countries };
assert.deepEqual(report.totals, { countries: 252, institutionPartial: 199, institutionUnavailable: 53, legislatureUnavailable: 252, electoralSystemUnavailable: 252, seatsUnavailable: 252, coalitionUnavailable: 252, fictionalParties: 756, fictionalOrganizations: 504 });
const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes('--write')) writeFileSync(destination, output);
else assert.equal(readFileSync(destination, 'utf8'), output, 'Politics coverage report is stale. Run npm run politics:audit:generate.');
console.log(JSON.stringify(report.totals, null, 2));
if (process.argv.includes('--write')) process.exit(0);

const test = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'src/simulation/__tests__/politics.test.ts', 'src/simulation/__tests__/politicsWorld.test.ts', '--reporter=verbose'], { stdio: 'inherit' });
process.exit(test.status ?? 1);
