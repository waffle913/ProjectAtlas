import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = name => JSON.parse(readFileSync(new URL(`../src/${name}.json`, import.meta.url), 'utf8'));
const registry = read('data/entity-registry');
// 0.20 introduces no factual treaty/organization baseline: coverage is explicit unavailable, never fabricated.
console.log(JSON.stringify({
  audit: 'multilateral-0.20',
  schema: 18,
  countries: registry.countries.length,
  factualTreatiesAdmitted: 0,
  factualOrganizationsAdmitted: 0,
  factualMembershipsAdmitted: 0,
  coverage: 'unavailable',
  limitation: 'No factual, licensed 2026 treaty, organization or membership baseline is admitted; all gameplay records are synthetic/modelled and the migration initializes an empty domain.',
  invariants: 'treaty lifecycle integrity, party/reference integrity, obligation/trigger integrity, compliance/violation consistency, membership, voting consistency and exactly-once adopted effects are enforced by multilateralInvariant and exercised in the multilateral test suite.',
}));
assert.equal(registry.countries.length, 252);
