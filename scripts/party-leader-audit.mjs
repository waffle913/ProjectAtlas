import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const registryPath = 'src/data/political-registry.json';
const sourcesPath = 'src/data/source-snapshots/party-leadership-2026-01-01.json';
const destination = 'src/data/party-leader-coverage-report.json';
const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
const sources = JSON.parse(readFileSync(sourcesPath, 'utf8'));
const parties = Object.values(registry.parties).sort((a, b) => a.id.localeCompare(b.id));
assert.equal(registry.referenceDate, '2026-01-01');
assert.equal(sources.referenceDate, registry.referenceDate);
assert.equal(sources.coverageStatus, 'unavailable');
assert.equal(sources.mappings.length, 0, 'A source mapping requires a reviewed, admissible evidence record.');

const sourceHashes = Object.fromEntries(sources.reviewedSnapshots.map(snapshot => {
  const bytes = readFileSync(snapshot.path);
  return [snapshot.snapshotId, createHash('sha256').update(bytes).digest('hex')];
}));
const partyRecords = parties.map(party => ({
  partyId: party.id,
  countryId: party.countryId,
  sourcePartyId: party.sourceBasis.sourcePartyId,
  gameplayLeaderBasis: 'modelled_fallback',
  sourceLeaderBasis: 'unavailable',
  mappingStatus: 'unavailable',
  referenceDate: registry.referenceDate,
  limitation: sources.limitation,
}));
const report = {
  version: 'party-leader-coverage-0.15-v1',
  scenarioDate: registry.referenceDate,
  generatedFrom: {
    politicalRegistrySha256: createHash('sha256').update(readFileSync(registryPath)).digest('hex'),
    leaderSourceSnapshotSha256: createHash('sha256').update(readFileSync(sourcesPath)).digest('hex'),
    reviewedSourceSha256: sourceHashes,
  },
  methodology: 'Only pinned records with a reviewed source-party crosswalk and an explicitly applicable 2026-01-01 leadership observation can support a sourced leader basis. Institutional, seat, ideology-only or unlinked officeholder evidence is not promoted to an individual party-leader claim.',
  totals: {
    gameplayParties: parties.length,
    gameplayLeadersRequired: parties.length,
    sourcedOrObservedLeaderBasis: partyRecords.filter(item => item.sourceLeaderBasis === 'sourced_or_observed').length,
    derivedLeaderMappings: partyRecords.filter(item => item.sourceLeaderBasis === 'derived').length,
    modelledFallbackGameplayLeaders: partyRecords.filter(item => item.gameplayLeaderBasis === 'modelled_fallback').length,
    unavailableSourceMappings: partyRecords.filter(item => item.mappingStatus === 'unavailable').length,
    ambiguousMappings: partyRecords.filter(item => item.mappingStatus === 'ambiguous').length,
  },
  licensing: {
    vPartyDataset: 'requires_confirmation; used only as historical party-position evidence, not a leader identity source.',
    ipuDataset: 'CC BY-NC-SA 4.0; reviewed only for institutional/seat evidence, not party leadership.',
    noLeaderDataRedistributed: true,
  },
  parties: partyRecords,
};
assert.equal(report.totals.modelledFallbackGameplayLeaders, parties.length);
assert.equal(report.totals.unavailableSourceMappings, parties.length);
const output = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes('--write')) writeFileSync(destination, output);
else assert.equal(readFileSync(destination, 'utf8'), output, 'Party leader coverage report is stale; run npm run leaders:audit:generate.');
console.log(JSON.stringify(report.totals));
