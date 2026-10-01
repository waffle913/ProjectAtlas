import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const registryPath = 'src/data/political-registry.json';
const officesPath = 'src/data/political-offices.json';
const sourcesPath = 'src/data/source-snapshots/party-leadership-2026-01-01.json';
const destination = 'src/data/party-leader-coverage-report.json';
const registryBytes = readFileSync(registryPath);
const officesBytes = readFileSync(officesPath);
const sourcesBytes = readFileSync(sourcesPath);
const registry = JSON.parse(registryBytes);
const offices = JSON.parse(officesBytes);
const sources = JSON.parse(sourcesBytes);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const parties = Object.values(registry.parties).sort((a, b) => a.id.localeCompare(b.id));
const officeholders = new Map(offices.officeholders.map(item => [item.officeId, item]));
const officeDefinitions = new Map(offices.offices.map(item => [item.id, item]));
const sourceRecords = new Map(sources.sourceRecords.map(item => [item.sourceRecordId, item]));

assert.equal(registry.referenceDate, '2026-01-01');
assert.equal(offices.referenceDate, registry.referenceDate);
assert.equal(sources.referenceDate, registry.referenceDate);
assert.equal(sources.coverageStatus, 'partial');
assert.ok(sources.mappings.length > 0, 'The reviewed crosswalk must use qualifying leadership evidence.');
assert.equal(new Set(sources.mappings.map(mapping => mapping.partyId)).size, sources.mappings.length, 'A gameplay party may have at most one reviewed leader mapping.');
assert.equal(new Set(sources.mappings.map(mapping => mapping.fictionalAnalogueName)).size, sources.mappings.length, 'Fictional analogue names must be unique.');

const pinnedSnapshots = Object.fromEntries(sources.reviewedSnapshots.map(snapshot => {
  const bytes = readFileSync(snapshot.path);
  assert.equal(sha256(bytes), snapshot.sha256, `Pinned source snapshot changed: ${snapshot.path}`);
  return [snapshot.snapshotId, sha256(bytes)];
}));

for (const record of sources.sourceRecords) {
  assert.ok(record.sourceRecordId && record.publisher && record.url && record.evidenceDate && record.referenceDate && record.retrievedAt && record.licence && record.attribution && record.claim);
  assert.equal(record.referenceDate, sources.referenceDate, `Source record is not scoped to the scenario date: ${record.sourceRecordId}`);
  assert.ok(Array.isArray(record.limitations) && record.limitations.length > 0, `Source limitations are missing: ${record.sourceRecordId}`);
  assert.equal(record.licence, 'requires_confirmation', `Unreviewed licence must remain blocked: ${record.sourceRecordId}`);
}

const partyById = new Map(parties.map(party => [party.id, party]));
for (const mapping of sources.mappings) {
  const party = partyById.get(mapping.partyId);
  assert.ok(party, `Unknown gameplay party in crosswalk: ${mapping.partyId}`);
  assert.equal(mapping.referenceDate, sources.referenceDate);
  assert.equal(mapping.sourcePartyId, party.sourceBasis.sourcePartyId, `Crosswalk source party ID mismatch: ${mapping.partyId}`);
  assert.equal(mapping.sourcePartyName, party.sourceBasis.sourcePartyName, `Crosswalk source party name mismatch: ${mapping.partyId}`);
  assert.equal(mapping.basis, 'derived_analogue');
  assert.equal(mapping.sourceStatus, 'derived');
  assert.ok(mapping.fictionalAnalogueName && mapping.sourcePersonId && mapping.sourcePersonName);

  const linkedRecords = mapping.sourceRecordIds.map(id => sourceRecords.get(id));
  assert.ok(linkedRecords.every(Boolean), `Crosswalk references an unpinned record: ${mapping.partyId}`);
  const partyLeaderEvidence = linkedRecords.find(record => !record.officeId);
  const officeEvidence = linkedRecords.find(record => record.officeId === mapping.officeholderMatch.officeId);
  assert.ok(partyLeaderEvidence && officeEvidence, `Crosswalk needs both party-leader and officeholder evidence: ${mapping.partyId}`);
  assert.equal(officeEvidence.snapshotPath, officesPath);

  const officeholder = officeholders.get(mapping.officeholderMatch.officeId);
  const office = officeDefinitions.get(mapping.officeholderMatch.officeId);
  assert.ok(officeholder && office, `Missing pinned officeholder record: ${mapping.partyId}`);
  assert.equal(officeholder.status, 'available');
  assert.equal(officeholder.referenceDate, sources.referenceDate);
  assert.equal(officeholder.person.id, `wikidata:${mapping.sourcePersonId}`, `Source identities do not exactly reconcile: ${mapping.partyId}`);
  assert.equal(officeholder.person.name, mapping.sourcePersonName);
  assert.equal(officeholder.startDate, mapping.officeholderMatch.startDate);
  assert.ok(officeholder.startDate <= sources.referenceDate);
  assert.equal(office.countryId, party.countryId);
  assert.equal(office.kind, 'head_of_government', 'Only an explicitly matching executive office is reconciled by this crosswalk.');

  const country = registry.countries[party.countryId];
  const institution = country && registry.institutions[country.institutionId];
  assert.equal(institution?.executiveSystemStatus, 'sourced', `Institutional executive-system evidence is unavailable: ${mapping.partyId}`);
  assert.ok(['parliamentary', 'monarchy_parliamentary'].includes(institution?.executiveSystem), `This party-to-office authority relationship is not resolved by this crosswalk: ${mapping.partyId}`);
}

const mappings = new Map(sources.mappings.map(mapping => [mapping.partyId, mapping]));
const partyRecords = parties.map(party => {
  const mapping = mappings.get(party.id);
  return {
    partyId: party.id,
    countryId: party.countryId,
    sourcePartyId: party.sourceBasis.sourcePartyId,
    gameplayLeaderBasis: mapping ? mapping.basis : 'modelled_fallback',
    sourceLeaderBasis: mapping ? mapping.sourceStatus : 'unavailable',
    mappingStatus: mapping ? 'derived' : 'unavailable',
    sourcePersonId: mapping?.sourcePersonId,
    fictionalAnalogueName: mapping?.fictionalAnalogueName,
    referenceDate: registry.referenceDate,
    limitation: mapping
      ? 'A fictional gameplay analogue uses the exact reviewed source identity as provenance only; personal ideology is not inferred.'
      : sources.limitations.at(-1),
  };
});

const report = {
  version: 'party-leader-coverage-0.15-v2',
  scenarioDate: registry.referenceDate,
  generatedFrom: {
    politicalRegistrySha256: sha256(registryBytes),
    officeholderSnapshotSha256: sha256(officesBytes),
    leaderSourceSnapshotSha256: sha256(sourcesBytes),
    reviewedSourceSha256: pinnedSnapshots,
  },
  methodology: 'Only hand-reviewed source-party links paired with an exact source-person match to a dated, available 2026-01-01 executive officeholder record and sourced parliamentary institutional evidence are counted as derived analogues. Source identity is provenance only; individual political beliefs are not inferred. Other mappings remain unavailable/modelled.',
  totals: {
    gameplayParties: parties.length,
    gameplayLeadersRequired: parties.length,
    sourcedOrObservedLeaderBasis: partyRecords.filter(item => item.sourceLeaderBasis === 'sourced' || item.sourceLeaderBasis === 'observed').length,
    derivedLeaderMappings: partyRecords.filter(item => item.sourceLeaderBasis === 'derived').length,
    modelledFallbackGameplayLeaders: partyRecords.filter(item => item.gameplayLeaderBasis === 'modelled_fallback').length,
    unavailableSourceMappings: partyRecords.filter(item => item.mappingStatus === 'unavailable').length,
    ambiguousMappings: partyRecords.filter(item => item.mappingStatus === 'ambiguous').length,
    reconciledExecutiveOfficeholders: sources.mappings.length,
  },
  coverageStatus: sources.coverageStatus,
  licensing: {
    allMappedLeadershipSources: 'requires_confirmation; attribution is recorded but does not grant reuse rights.',
    officeholderSnapshot: 'requires_confirmation; its transport/query service is not treated as a data licence.',
    commercialRedistributionCleared: false,
  },
  sourceRecords: sources.sourceRecords,
  parties: partyRecords,
};

assert.equal(report.totals.gameplayLeadersRequired, report.totals.gameplayParties);
assert.equal(report.totals.derivedLeaderMappings, sources.mappings.length);
assert.equal(report.totals.modelledFallbackGameplayLeaders + report.totals.derivedLeaderMappings, parties.length);
const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes('--write')) writeFileSync(destination, output);
else assert.equal(readFileSync(destination, 'utf8'), output, 'Party leader coverage report is stale; run npm run information:audit:generate.');
console.log(JSON.stringify(report.totals));
