import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const registryPath = 'src/data/political-registry.json';
const officesPath = 'src/data/political-offices.json';
const vpartyPath = 'src/data/source-snapshots/vparty-ideology-2022.json';
const bridgePath = 'src/data/source-snapshots/partyfacts-wikidata-2026-10-01.json';
const chairsPath = 'src/data/source-snapshots/wikidata-party-chairs-2026-10-01.json';
const sourcesPath = 'src/data/source-snapshots/party-leadership-2026-01-01.json';
const reportPath = 'src/data/party-leader-coverage-report.json';
const bytes = path => readFileSync(path);
const hash = input => createHash('sha256').update(input).digest('hex');
const registryBytes = bytes(registryPath);
const officesBytes = bytes(officesPath);
const vpartyBytes = bytes(vpartyPath);
const bridgeBytes = bytes(bridgePath);
const chairBytes = bytes(chairsPath);
const sourceBytes = bytes(sourcesPath);
const registry = JSON.parse(registryBytes);
const offices = JSON.parse(officesBytes);
const vparty = JSON.parse(vpartyBytes);
const bridges = JSON.parse(bridgeBytes);
const chairs = JSON.parse(chairBytes);
const priorSources = JSON.parse(sourceBytes);
const parties = Object.values(registry.parties).sort((a, b) => a.id.localeCompare(b.id));
const partyBySourceId = new Map(parties.map(party => [party.sourceBasis.sourcePartyId, party]));
const bridgeByPartyFactsId = new Map(bridges.records.map(item => [String(item.partyFactsId), item]));
const priorMappingByPartyId = new Map(priorSources.mappings.map(mapping => [mapping.partyId, mapping]));
const activeChairClaims = new Map();
const scenarioDate = registry.referenceDate;
const partyFactsSourceRecordId = 'partyfacts-wikidata-crosswalk-2026-10-01';
const wikidataSourceRecordId = 'wikidata-party-chair-snapshot-2026-10-01';
const partyFactsSourceRecord = {
  sourceRecordId: partyFactsSourceRecordId,
  publisher: bridges.publisher,
  url: bridges.sourceUrl,
  evidenceDate: bridges.retrievedAt,
  referenceDate: scenarioDate,
  retrievedAt: bridges.retrievedAt,
  licence: bridges.licence,
  attribution: bridges.attribution,
  claim: 'Provides Wikidata QIDs for Party Facts IDs already linked through the reviewed V-Party/IPU crosswalk.',
  snapshotPath: bridgePath,
  limitations: bridges.limitations,
};
const wikidataSourceRecord = {
  sourceRecordId: wikidataSourceRecordId,
  publisher: chairs.publisher,
  url: chairs.sourceUrl,
  evidenceDate: chairs.retrievedAt,
  referenceDate: scenarioDate,
  retrievedAt: chairs.retrievedAt,
  licence: chairs.licence,
  attribution: chairs.attribution,
  claim: 'Pinned Wikidata P488 chairperson claims with P580/P582 tenure qualifiers for the reviewed Party Facts/Wikidata party QIDs.',
  snapshotPath: chairsPath,
  limitations: chairs.limitations,
};

assert.equal(registry.referenceDate, '2026-01-01');
assert.equal(vparty.referenceDate, registry.referenceDate);
assert.equal(bridges.referenceDate, registry.referenceDate);
assert.equal(chairs.referenceDate, registry.referenceDate);
assert.equal(chairs.licence, 'CC0-1.0');
assert.equal(bridges.licence, 'requires_confirmation');
assert.equal(bridges.sourceCommit, '61e04e83a4eff4e285bdb724cc11cc8bdf4beb16');
assert.equal(new Set(bridges.records.map(record => record.partyFactsId)).size, bridges.records.length);
assert.equal(new Set(bridges.records.map(record => record.wikidataPartyId)).size, bridges.records.length);
assert.equal(new Set(chairs.records.map(record => record.statementId)).size, chairs.records.length);
assert.deepEqual([...chairs.queryPartyIds].sort(), bridges.records.map(record => record.wikidataPartyId).sort());
assert.equal(chairs.queryResultRecordsSha256, hash(JSON.stringify(chairs.records)));
assert.ok(chairs.records.every(record => chairs.queryPartyIds.includes(record.partyId)));

function candidateStatus(claims) {
  const active = claims.filter(claim => claim.rank !== 'DeprecatedRank' && claim.startDate
    && claim.startDate <= scenarioDate && (!claim.endDate || claim.endDate > scenarioDate));
  return new Set(active.map(claim => claim.chairId)).size === 1
    ? 'derived'
    : new Set(active.map(claim => claim.chairId)).size > 1 ? 'ambiguous' : 'unavailable';
}
assert.equal(candidateStatus([{ rank: 'NormalRank', startDate: '2025-01-01', endDate: null, chairId: 'Q1' }]), 'derived');
assert.equal(candidateStatus([
  { rank: 'NormalRank', startDate: '2025-01-01', endDate: null, chairId: 'Q1' },
  { rank: 'PreferredRank', startDate: '2025-02-01', endDate: null, chairId: 'Q2' },
]), 'ambiguous');
assert.equal(candidateStatus([{ rank: 'NormalRank', startDate: null, endDate: null, chairId: 'Q1' }]), 'unavailable');
assert.equal(candidateStatus([{ rank: 'NormalRank', startDate: '2026-01-02', endDate: null, chairId: 'Q1' }]), 'unavailable');

for (const claim of chairs.records) {
  if (claim.rank === 'DeprecatedRank' || !claim.startDate || claim.startDate > scenarioDate || claim.endDate && claim.endDate <= scenarioDate) continue;
  const claims = activeChairClaims.get(claim.partyId) ?? [];
  claims.push(claim);
  activeChairClaims.set(claim.partyId, claims);
}

const candidates = [];
for (const link of vparty.parties) {
  const party = partyBySourceId.get(link.sourcePartyId);
  const bridge = bridgeByPartyFactsId.get(String(link.partyFactsId));
  if (!party || !bridge) continue;
  assert.equal(link.linkMethod, 'reviewed_ipu_party_to_partyfacts_id_v1');
  assert.equal(party.sourceBasis.sourcePartyId, link.sourcePartyId);

  const claims = activeChairClaims.get(bridge.wikidataPartyId) ?? [];
  const claimsByChair = new Map();
  for (const claim of claims) {
    const matches = claimsByChair.get(claim.chairId) ?? [];
    matches.push(claim);
    claimsByChair.set(claim.chairId, matches);
  }
  const status = candidateStatus(claims);
  const exactClaims = [...claimsByChair.values()].flat().sort((a, b) => a.statementId.localeCompare(b.statementId));
  candidates.push({
    partyId: party.id,
    sourcePartyId: link.sourcePartyId,
    partyFactsId: link.partyFactsId,
    wikidataPartyId: bridge.wikidataPartyId,
    mappingStatus: status,
    chairIds: [...claimsByChair.keys()].sort(),
    statementIds: exactClaims.map(claim => claim.statementId),
    referenceDate: scenarioDate,
    limitation: status === 'derived'
      ? 'One stable-ID-linked Wikidata chair identity has a dated tenure applicable on the scenario date; the gameplay person remains fictional.'
      : status === 'ambiguous'
        ? 'Multiple distinct stable-ID-linked Wikidata chair identities have dated tenures applicable on the scenario date; no leader is selected.'
        : 'No uniquely supported dated Wikidata chair identity is available for this stable-ID-linked party on the scenario date.',
  });
}
candidates.sort((a, b) => a.partyId.localeCompare(b.partyId));
assert.equal(candidates.length, bridges.records.length, 'Every reviewed Party Facts bridge must resolve through the reviewed V-Party/IPU identifier crosswalk.');
assert.equal(new Set(candidates.map(candidate => candidate.partyId)).size, candidates.length);

const priorMappings = new Map(priorSources.mappings.map(mapping => [mapping.partyId, mapping]));
const mappings = candidates.filter(candidate => candidate.mappingStatus === 'derived').map(candidate => {
  const claim = chairs.records
    .filter(record => candidate.statementIds.includes(record.statementId))
    .sort((a, b) => a.statementId.localeCompare(b.statementId))[0];
  assert.ok(claim, `Missing exact Wikidata chair statement for ${candidate.partyId}.`);
  assert.ok(claim.chairId && claim.chairName, `Wikidata chair statement lacks a stable identity or label for ${candidate.partyId}.`);
  const prior = priorMappings.get(candidate.partyId);
  if (prior) {
    assert.equal(prior.sourcePersonId, claim.chairId, `Previously reviewed identity changed for ${candidate.partyId}.`);
    assert.equal(prior.sourcePersonName, claim.chairName, `Previously reviewed source name changed for ${candidate.partyId}.`);
  }
  return {
    ...prior,
    partyId: candidate.partyId,
    sourcePartyId: candidate.sourcePartyId,
    partyFactsId: candidate.partyFactsId,
    wikidataPartyId: candidate.wikidataPartyId,
    sourcePartyName: partyBySourceId.get(candidate.sourcePartyId).sourceBasis.sourcePartyName,
    sourcePersonId: claim.chairId,
    sourcePersonName: claim.chairName,
    ...(prior?.fictionalAnalogueName ? { fictionalAnalogueName: prior.fictionalAnalogueName } : {}),
    basis: 'derived_analogue',
    sourceStatus: 'derived',
    leaderRole: 'party_chairperson',
    chairStatementId: claim.statementId,
    sourceRecordIds: [...new Set([...(prior?.sourceRecordIds ?? []), partyFactsSourceRecordId, wikidataSourceRecordId])].sort(),
    referenceDate: scenarioDate,
  };
}).sort((a, b) => a.partyId.localeCompare(b.partyId));

assert.equal(new Set(mappings.map(mapping => mapping.partyId)).size, mappings.length);
assert.equal(new Set(mappings.map(mapping => mapping.sourcePersonId)).size, mappings.length);
assert.equal(new Set(mappings.filter(mapping => mapping.fictionalAnalogueName).map(mapping => mapping.fictionalAnalogueName)).size, mappings.filter(mapping => mapping.fictionalAnalogueName).length);

const officeDefinitions = new Map(offices.offices.map(item => [item.id, item]));
const officeholdersByParty = new Map(parties.map(party => [party.id, offices.officeholders.filter(item => {
  const office = officeDefinitions.get(item.officeId);
  return item.status === 'available' && item.referenceDate === scenarioDate && item.person?.id
    && item.startDate && item.startDate <= scenarioDate && office?.countryId === party.countryId
    && ['head_of_government', 'head_of_state'].includes(office.kind);
})]));
const mappingsByParty = new Map(mappings.map(mapping => [mapping.partyId, mapping]));
const candidatesByParty = new Map(candidates.map(candidate => [candidate.partyId, candidate]));
const partyRecords = parties.map(party => {
  const mapping = mappingsByParty.get(party.id);
  const candidate = candidatesByParty.get(party.id);
  return {
    partyId: party.id,
    countryId: party.countryId,
    sourcePartyId: party.sourceBasis.sourcePartyId,
    gameplayLeaderBasis: mapping ? mapping.basis : 'modelled_fallback',
    sourceLeaderBasis: mapping ? mapping.sourceStatus : candidate?.mappingStatus ?? 'unavailable',
    mappingStatus: candidate?.mappingStatus ?? 'unavailable',
    sourcePersonId: mapping?.sourcePersonId ? `wikidata:${mapping.sourcePersonId}` : undefined,
    fictionalAnalogueName: mapping?.fictionalAnalogueName,
    partyFactsId: candidate?.partyFactsId,
    wikidataPartyId: candidate?.wikidataPartyId,
    referenceDate: scenarioDate,
    limitation: candidate?.limitation ?? 'No reviewed exact Party Facts identifier link is available; source leadership remains unavailable and the gameplay leader is fictional.',
  };
});

const reviewedSnapshots = [
  ['political-offices-2026-01-01', officesPath, officesBytes],
  ['political-registry-2026-01-01', registryPath, registryBytes],
  ['vparty-ideology-2022', vpartyPath, vpartyBytes],
  ['partyfacts-wikidata-2026-10-01', bridgePath, bridgeBytes],
  ['wikidata-party-chairs-2026-10-01', chairsPath, chairBytes],
].map(([snapshotId, path, content]) => ({ snapshotId, path, sha256: hash(content) }));

const generatedSources = {
  ...priorSources,
  schemaVersion: 3,
  retrievedAt: chairs.retrievedAt,
  coverageStatus: 'partial',
  reviewedSnapshots,
  sourceRecords: [
    ...priorSources.sourceRecords.filter(record => ![partyFactsSourceRecordId, wikidataSourceRecordId].includes(record.sourceRecordId)),
    partyFactsSourceRecord,
    wikidataSourceRecord,
  ].sort((a, b) => a.sourceRecordId.localeCompare(b.sourceRecordId)),
  partyCandidates: candidates,
  mappings,
  limitations: [
    'The structured pipeline reports every registered gameplay party. Exact Party Facts/Wikidata identifier coverage is partial; parties without reviewed ID links remain unavailable, never name-matched.',
    'Only one distinct Wikidata P488 chairperson with a P580 start on or before 2026-01-01 and no P582 end by that date is eligible. Multiple active identities are ambiguous and are not selected.',
    'The Wikidata extract was retrieved on 2026-10-01, after the scenario date; qualifiers support a dated tenure inference but do not establish what was publicly knowable on 2026-01-01.',
    'The Party Facts repository software licence is not treated as a data licence. Its crosswalk data remains requires_confirmation; commercial redistribution is not cleared.',
    'Wikidata chairperson identities provide provenance only. Gameplay persons remain fictional and receive no real-person ideology or policy preferences.',
  ],
};

const sourceRecordById = new Map(generatedSources.sourceRecords.map(record => [record.sourceRecordId, record]));
for (const record of generatedSources.sourceRecords) {
  assert.ok(record.sourceRecordId && record.publisher && record.url && record.evidenceDate && record.referenceDate && record.retrievedAt && record.licence && record.attribution && record.claim);
  assert.equal(record.referenceDate, scenarioDate);
  assert.ok(Array.isArray(record.limitations) && record.limitations.length);
}
for (const mapping of mappings) {
  const party = parties.find(item => item.id === mapping.partyId);
  const bridge = bridgeByPartyFactsId.get(String(mapping.partyFactsId));
  const claim = chairs.records.find(item => item.statementId === mapping.chairStatementId);
  assert.ok(party && bridge && claim);
  assert.equal(mapping.sourcePartyId, party.sourceBasis.sourcePartyId);
  assert.equal(mapping.wikidataPartyId, bridge.wikidataPartyId);
  assert.equal(claim.partyId, bridge.wikidataPartyId);
  assert.equal(claim.chairId, mapping.sourcePersonId);
  assert.ok(claim.startDate && claim.startDate <= scenarioDate && (!claim.endDate || claim.endDate > scenarioDate));
  assert.ok(mapping.sourceRecordIds.every(id => sourceRecordById.has(id)));
}
for (const record of reviewedSnapshots) assert.equal(hash(bytes(record.path)), record.sha256);

const sourceOutput = `${JSON.stringify(generatedSources, null, 2)}\n`;
const report = {
  version: 'party-leader-coverage-0.15-v3',
  scenarioDate,
  generatedFrom: {
    politicalRegistrySha256: hash(registryBytes),
    officeholderSnapshotSha256: hash(officesBytes),
    leaderSourceSnapshotSha256: hash(sourceOutput),
    reviewedSourceSha256: Object.fromEntries(reviewedSnapshots.map(item => [item.snapshotId, item.sha256])),
  },
  methodology: 'Enumerate all gameplay parties, then join only reviewed IPU-to-Party-Facts IDs, exact Party Facts Wikidata QIDs, and a unique dated Wikidata P488 chairperson claim applicable on 2026-01-01. Ambiguous and unavailable records are not selected. Source identities remain provenance for fictional gameplay leaders; ideology is not inferred.',
  totals: {
    gameplayParties: parties.length,
    gameplayLeadersRequired: parties.length,
    partiesWithReviewedPartyFactsBridge: candidates.length,
    sourcedOrObservedLeaderBasis: partyRecords.filter(item => item.sourceLeaderBasis === 'sourced' || item.sourceLeaderBasis === 'observed').length,
    derivedLeaderMappings: partyRecords.filter(item => item.sourceLeaderBasis === 'derived').length,
    modelledFallbackGameplayLeaders: partyRecords.filter(item => item.gameplayLeaderBasis === 'modelled_fallback').length,
    unavailableSourceMappings: partyRecords.filter(item => item.mappingStatus === 'unavailable').length,
    ambiguousMappings: partyRecords.filter(item => item.mappingStatus === 'ambiguous').length,
    reconciledExecutiveOfficeholders: mappings.filter(mapping => officeholdersByParty.get(mapping.partyId).some(item => item.person?.id === `wikidata:${mapping.sourcePersonId}`)).length,
  },
  coverageStatus: generatedSources.coverageStatus,
  licensing: {
    partyFactsIdentifierCrosswalk: 'requires_confirmation; the repository software licence is not treated as a data licence.',
    wikidataChairClaims: 'CC0-1.0.',
    existingPrimaryPartyAndOfficeholderEvidence: 'requires_confirmation where source records specify it.',
    commercialRedistributionCleared: false,
  },
  sourceRecords: generatedSources.sourceRecords,
  parties: partyRecords,
};

assert.equal(report.totals.gameplayLeadersRequired, report.totals.gameplayParties);
assert.equal(report.totals.derivedLeaderMappings, mappings.length);
assert.equal(report.totals.derivedLeaderMappings + report.totals.modelledFallbackGameplayLeaders, parties.length);
assert.equal(report.totals.partiesWithReviewedPartyFactsBridge, candidates.length);
const reportOutput = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes('--write')) {
  writeFileSync(sourcesPath, sourceOutput);
  writeFileSync(reportPath, reportOutput);
} else {
  assert.equal(sourceOutput, sourceBytes.toString('utf8'), 'Party leader source pipeline is stale; run npm run information:audit:generate.');
  assert.equal(reportOutput, bytes(reportPath).toString('utf8'), 'Party leader coverage report is stale; run npm run information:audit:generate.');
}
console.log(JSON.stringify(report.totals));
