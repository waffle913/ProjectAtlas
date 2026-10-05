import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const registryPath = 'src/data/political-registry.json';
const officesPath = 'src/data/political-offices.json';
const vpartyPath = 'src/data/source-snapshots/vparty-ideology-2022.json';
const bridgePath = 'src/data/source-snapshots/partyfacts-wikidata-2026-10-01.json';
const chairsPath = 'src/data/source-snapshots/wikidata-party-chairs-2026-10-01.json';
const evidencePath = 'src/data/source-snapshots/party-leadership-evidence-2026-01-01.json';
const sourcesPath = 'src/data/source-snapshots/party-leadership-2026-01-01.json';
const reportPath = 'src/data/party-leader-coverage-report.json';
const bytes = path => readFileSync(path);
const hash = input => createHash('sha256').update(input).digest('hex');
const registryBytes = bytes(registryPath);
const officesBytes = bytes(officesPath);
const vpartyBytes = bytes(vpartyPath);
const bridgeBytes = bytes(bridgePath);
const chairBytes = bytes(chairsPath);
const evidenceBytes = bytes(evidencePath);
const sourceBytes = bytes(sourcesPath);
const registry = JSON.parse(registryBytes);
const offices = JSON.parse(officesBytes);
const vparty = JSON.parse(vpartyBytes);
const bridges = JSON.parse(bridgeBytes);
const chairs = JSON.parse(chairBytes);
const evidence = JSON.parse(evidenceBytes);
const priorSources = JSON.parse(sourceBytes);
const parties = Object.values(registry.parties).sort((a, b) => a.id.localeCompare(b.id));
const partyBySourceId = new Map(parties.map(party => [party.sourceBasis.sourcePartyId, party]));
const bridgeByPartyFactsId = new Map(bridges.records.map(item => [String(item.partyFactsId), item]));
const priorMappingByPartyId = new Map(priorSources.mappings.map(mapping => [mapping.partyId, mapping]));
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
  limitations: [
    ...chairs.limitations,
    'P488 identifies a chairperson/presiding member, not necessarily the constitutional or electoral party leader. A chairperson is used as the gameplay party head only when the reviewed mapping records that source role explicitly.',
    'P580 without a P582 end date is not treated as evidence that a chairperson still held the role on the scenario date.',
  ],
};

assert.equal(registry.referenceDate, '2026-01-01');
assert.equal(vparty.referenceDate, registry.referenceDate);
assert.equal(bridges.referenceDate, registry.referenceDate);
assert.equal(chairs.referenceDate, registry.referenceDate);
assert.equal(evidence.referenceDate, registry.referenceDate);
assert.equal(chairs.licence, 'CC0-1.0');
assert.equal(bridges.licence, 'requires_confirmation');
assert.equal(bridges.sourceCommit, '61e04e83a4eff4e285bdb724cc11cc8bdf4beb16');
assert.equal(new Set(bridges.records.map(record => record.partyFactsId)).size, bridges.records.length);
assert.equal(new Set(bridges.records.map(record => record.wikidataPartyId)).size, bridges.records.length);
assert.equal(new Set(chairs.records.map(record => record.statementId)).size, chairs.records.length);
assert.deepEqual([...chairs.queryPartyIds].sort(), bridges.records.map(record => record.wikidataPartyId).sort());
assert.equal(chairs.queryResultRecordsSha256, hash(JSON.stringify(chairs.records)));
assert.ok(chairs.records.every(record => chairs.queryPartyIds.includes(record.partyId)));

const sourceRecordsById = new Map([
  ...priorSources.sourceRecords.filter(record => !evidence.sources.some(item => item.sourceRecordId === record.sourceRecordId)),
  ...evidence.sources,
  partyFactsSourceRecord,
  wikidataSourceRecord,
].map(record => [record.sourceRecordId, record]));
const sourceRecords = [...sourceRecordsById.values()].sort((a, b) => a.sourceRecordId.localeCompare(b.sourceRecordId));
const sourceRecordById = new Map(sourceRecords.map(record => [record.sourceRecordId, record]));
const analogueNames = new Map(evidence.fictionalAnalogueNames.map(item => [`${item.partyFactsId}:${item.sourcePersonId}`, item.name]));
assert.equal(analogueNames.size, evidence.fictionalAnalogueNames.length, 'Fictional analogue table keys must be unique.');
assert.equal(new Set(evidence.fictionalAnalogueNames.map(item => item.name)).size, evidence.fictionalAnalogueNames.length, 'Fictional analogue names must be unique.');
assert.ok(evidence.fictionalAnalogueNames.every(item => item.name.trim() && !item.name.includes('\n')));
const overrideByPartyFactsId = new Map();
for (const override of evidence.primarySourceOverrides) {
  const matches = overrideByPartyFactsId.get(String(override.partyFactsId)) ?? [];
  matches.push(override);
  overrideByPartyFactsId.set(String(override.partyFactsId), matches);
  const bridge = bridgeByPartyFactsId.get(String(override.partyFactsId));
  assert.ok(bridge, `Primary evidence override has no exact Party Facts bridge: ${override.partyFactsId}.`);
  assert.equal(bridge.wikidataPartyId, override.wikidataPartyId, `Primary evidence override party identifier mismatch: ${override.partyFactsId}.`);
  assert.ok(['party_chairperson', 'party_leader', 'interim_party_leader'].includes(override.sourceRole));
  assert.equal(override.appliesOnScenarioDate, true);
  assert.ok(override.evidenceDate && override.evidenceDate <= scenarioDate);
  assert.ok(sourceRecordById.has(override.sourceRecordId), `Primary evidence source record is missing: ${override.sourceRecordId}.`);
  assert.equal(sourceRecordById.get(override.sourceRecordId).evidenceDate, override.evidenceDate);
  if (override.fictionalAnalogueName) {
    assert.equal(analogueNames.get(`${override.partyFactsId}:${override.sourcePersonId}`), override.fictionalAnalogueName);
    assert.notEqual(override.fictionalAnalogueName, override.sourcePersonName);
  }
  if (override.identitySourceRecordId) assert.ok(sourceRecordById.has(override.identitySourceRecordId));
  if (override.officeholderMatch) {
    const { officeholderMatch } = override;
    const sourceOfficeholder = offices.officeholders.find(item => item.officeId === officeholderMatch.officeId);
    assert.equal(officeholderMatch.sourcePersonId, override.sourcePersonId);
    assert.equal(sourceOfficeholder?.status, 'available');
    assert.equal(sourceOfficeholder?.referenceDate, scenarioDate);
    assert.equal(sourceOfficeholder?.person?.id, `wikidata:${override.sourcePersonId}`);
    assert.equal(sourceOfficeholder?.startDate, officeholderMatch.startDate);
    assert.ok(sourceRecordById.has(officeholderMatch.sourceRecordId));
    assert.equal(sourceRecordById.get(officeholderMatch.sourceRecordId).officeId, officeholderMatch.officeId);
  }
}
function resolveEvidence(claims, primaryOverrides) {
  const datedClaims = claims.filter(claim => claim.rank !== 'DeprecatedRank' && claim.startDate && claim.endDate
    && claim.startDate <= scenarioDate && claim.endDate > scenarioDate);
  const positiveEvidence = [
    ...datedClaims.map(claim => ({
      sourcePersonId: claim.chairId,
      sourcePersonName: claim.chairName,
      sourceRole: 'party_chairperson',
      statementId: claim.statementId,
      sourceRecordIds: [wikidataSourceRecordId],
      evidenceDate: claim.startDate,
    })),
    ...primaryOverrides.filter(item => item.appliesOnScenarioDate === true).map(item => ({
      sourcePersonId: item.sourcePersonId,
      sourcePersonName: item.sourcePersonName,
      sourceRole: item.sourceRole,
      statementId: undefined,
      sourceRecordIds: [item.sourceRecordId, ...(item.identitySourceRecordId ? [item.identitySourceRecordId] : [])],
      evidenceDate: item.evidenceDate,
    })),
  ];
  const byIdentity = new Map();
  for (const item of positiveEvidence) {
    const matches = byIdentity.get(item.sourcePersonId) ?? [];
    matches.push(item);
    byIdentity.set(item.sourcePersonId, matches);
  }
  const identities = [...byIdentity.keys()].sort();
  const selectedId = identities.length === 1 ? identities[0] : undefined;
  const unresolvedConflictingOpenClaim = selectedId && claims.some(claim =>
    claim.rank !== 'DeprecatedRank'
    && claim.startDate
    && claim.startDate <= scenarioDate
    && !claim.endDate
    && claim.chairId !== selectedId
    && !primaryOverrides.some(item => item.sourcePersonId === selectedId && item.evidenceDate > claim.startDate),
  );
  const status = identities.length > 1 || unresolvedConflictingOpenClaim
    ? 'ambiguous'
    : identities.length === 1 ? 'derived' : 'unavailable';
  return {
    status,
    selected: status === 'derived'
      ? byIdentity.get(selectedId).sort((a, b) => a.sourceRole.localeCompare(b.sourceRole) || a.evidenceDate.localeCompare(b.evidenceDate))[0]
      : undefined,
    evidence: positiveEvidence,
    datedClaims,
  };
}

assert.equal(resolveEvidence([{ rank: 'NormalRank', startDate: '2024-01-01', endDate: null, chairId: 'Q-old' }], []).status, 'unavailable');
assert.equal(resolveEvidence([{ rank: 'NormalRank', startDate: '2024-01-01', endDate: '2027-01-01', chairId: 'Q1' }], []).status, 'derived');
assert.equal(resolveEvidence([
  { rank: 'NormalRank', startDate: '2024-01-01', endDate: '2027-01-01', chairId: 'Q1' },
  { rank: 'NormalRank', startDate: '2025-01-01', endDate: '2027-01-01', chairId: 'Q2' },
], []).status, 'ambiguous');
assert.equal(resolveEvidence([
  { rank: 'NormalRank', startDate: '2024-01-01', endDate: '2027-01-01', chairId: 'Q1' },
  { rank: 'PreferredRank', startDate: '2024-01-01', endDate: null, chairId: 'Q2' },
], []).status, 'ambiguous');
const staleChairReplacementFixture = resolveEvidence(
  [{ rank: 'PreferredRank', startDate: '2024-03-08', endDate: null, chairId: 'Q-old' }],
  [{ sourcePersonId: 'Q-new', sourcePersonName: 'New Chair', sourceRole: 'party_chairperson', sourceRecordId: 'fixture-primary', evidenceDate: '2025-10-29', appliesOnScenarioDate: true }],
);
assert.equal(staleChairReplacementFixture.status, 'derived');
assert.equal(staleChairReplacementFixture.selected.sourcePersonId, 'Q-new');

const candidates = [];
for (const link of vparty.parties) {
  const party = partyBySourceId.get(link.sourcePartyId);
  const bridge = bridgeByPartyFactsId.get(String(link.partyFactsId));
  if (!party || !bridge) continue;
  assert.equal(link.linkMethod, 'reviewed_ipu_party_to_partyfacts_id_v1');
  assert.equal(party.sourceBasis.sourcePartyId, link.sourcePartyId);

  const claims = chairs.records.filter(claim => claim.partyId === bridge.wikidataPartyId);
  const resolved = resolveEvidence(claims, overrideByPartyFactsId.get(String(link.partyFactsId)) ?? []);
  const datedClaims = resolved.datedClaims.sort((a, b) => a.statementId.localeCompare(b.statementId));
  const allScenarioStartClaims = claims.filter(claim => claim.rank !== 'DeprecatedRank' && claim.startDate && claim.startDate <= scenarioDate)
    .sort((a, b) => a.statementId.localeCompare(b.statementId));
  candidates.push({
    partyId: party.id,
    sourcePartyId: link.sourcePartyId,
    partyFactsId: link.partyFactsId,
    wikidataPartyId: bridge.wikidataPartyId,
    mappingStatus: resolved.status,
    sourcePersonId: resolved.selected?.sourcePersonId,
    sourcePersonName: resolved.selected?.sourcePersonName,
    sourceRole: resolved.selected?.sourceRole,
    fictionalAnalogueName: resolved.selected
      ? analogueNames.get(`${link.partyFactsId}:${resolved.selected.sourcePersonId}`)
      : undefined,
    sourceRecordIds: resolved.selected?.sourceRecordIds,
    chairIds: [...new Set(allScenarioStartClaims.map(claim => claim.chairId))].sort(),
    statementIds: allScenarioStartClaims.map(claim => claim.statementId),
    qualifyingStatementIds: datedClaims.map(claim => claim.statementId),
    referenceDate: scenarioDate,
    limitation: resolved.status === 'derived'
      ? resolved.selected.sourceRole === 'party_chairperson'
        ? 'A source-dated P488 chairperson identity is used as the fictional gameplay party head; this does not claim that the chairperson is the constitutional or electoral party leader.'
        : 'A reviewed, dated primary party source explicitly identifies this person in the recorded party role near the scenario date; the gameplay identity remains fictional.'
      : resolved.status === 'ambiguous'
        ? 'Conflicting positively applicable party-leadership identities are present; no source person is selected.'
        : 'The available evidence does not positively establish a unique party-head identity on the scenario date. Missing P582 is not treated as continued tenure.',
  });
}
candidates.sort((a, b) => a.partyId.localeCompare(b.partyId));
assert.equal(candidates.length, bridges.records.length, 'Every reviewed Party Facts bridge must resolve through the reviewed V-Party/IPU identifier crosswalk.');
assert.equal(new Set(candidates.map(candidate => candidate.partyId)).size, candidates.length);

const priorMappings = new Map(priorSources.mappings.map(mapping => [mapping.partyId, mapping]));
const mappings = candidates.filter(candidate => candidate.mappingStatus === 'derived').map(candidate => {
  const override = (overrideByPartyFactsId.get(String(candidate.partyFactsId)) ?? [])
    .find(item => item.sourcePersonId === candidate.sourcePersonId);
  const claim = chairs.records
    .filter(record => candidate.qualifyingStatementIds.includes(record.statementId) && record.chairId === candidate.sourcePersonId)
    .sort((a, b) => a.statementId.localeCompare(b.statementId))[0];
  assert.ok(claim || override, `Missing positive dated evidence for ${candidate.partyId}.`);
  assert.ok(candidate.fictionalAnalogueName, `Missing reviewed fictional analogue name for ${candidate.partyId}.`);
  assert.notEqual(candidate.fictionalAnalogueName, candidate.sourcePersonName, `Fictional analogue matches source identity for ${candidate.partyId}.`);
  const prior = priorMappings.get(candidate.partyId);
  const officeholderMatch = prior?.sourcePersonId === candidate.sourcePersonId && prior.officeholderMatch
    ? prior.officeholderMatch
    : override?.officeholderMatch;
  const officeholderSourceRecordId = officeholderMatch?.sourceRecordId
    ?? prior?.sourceRecordIds.find(id => sourceRecordById.get(id)?.officeId === officeholderMatch?.officeId)
    ?? sourceRecords.find(record => record.officeId === officeholderMatch?.officeId)?.sourceRecordId;
  if (officeholderMatch) assert.ok(officeholderSourceRecordId, `Missing source record for officeholder reconciliation: ${candidate.partyId}.`);
  return {
    ...(officeholderMatch ? { officeholderMatch } : {}),
    partyId: candidate.partyId,
    sourcePartyId: candidate.sourcePartyId,
    partyFactsId: candidate.partyFactsId,
    wikidataPartyId: candidate.wikidataPartyId,
    sourcePartyName: partyBySourceId.get(candidate.sourcePartyId).sourceBasis.sourcePartyName,
    sourcePersonId: candidate.sourcePersonId,
    sourcePersonName: candidate.sourcePersonName,
    fictionalAnalogueName: candidate.fictionalAnalogueName,
    basis: 'derived_analogue',
    sourceStatus: 'derived',
    sourceRole: candidate.sourceRole,
    gameplayRole: 'party_head',
    chairStatementId: claim?.statementId,
    sourceRecordIds: [...new Set([
      ...(candidate.sourceRecordIds ?? []),
      ...(claim ? [wikidataSourceRecordId] : []),
      ...(officeholderSourceRecordId ? [officeholderSourceRecordId] : []),
      partyFactsSourceRecordId,
    ])].sort(),
    referenceDate: scenarioDate,
  };
}).sort((a, b) => a.partyId.localeCompare(b.partyId));

assert.equal(new Set(mappings.map(mapping => mapping.partyId)).size, mappings.length);
assert.equal(new Set(mappings.map(mapping => mapping.sourcePersonId)).size, mappings.length);
assert.equal(new Set(mappings.map(mapping => mapping.fictionalAnalogueName)).size, mappings.length);
assert.ok(mappings.every(mapping => mapping.fictionalAnalogueName !== mapping.sourcePersonName));
assert.deepEqual([...analogueNames.keys()].sort(), mappings.map(mapping => `${mapping.partyFactsId}:${mapping.sourcePersonId}`).sort(), 'The hand-reviewed analogue table must exactly cover the accepted mappings.');

const officeDefinitions = new Map(offices.offices.map(item => [item.id, item]));
const officeholdersByParty = new Map(parties.map(party => [party.id, offices.officeholders.filter(item => {
  const office = officeDefinitions.get(item.officeId);
  return item.status === 'available' && item.referenceDate === scenarioDate && item.person?.id
    && item.startDate && item.startDate <= scenarioDate && office?.countryId === party.countryId
    && ['head_of_government', 'head_of_state'].includes(office.kind);
})]));
const availableExecutiveRecords = offices.officeholders.filter(item => {
  const office = officeDefinitions.get(item.officeId);
  return item.status === 'available' && item.referenceDate === scenarioDate && item.person?.id
    && (!item.startDate || item.startDate <= scenarioDate) && office
    && ['head_of_government', 'head_of_state'].includes(office.kind);
});
const executiveIdentities = new Set(availableExecutiveRecords.map(item => `${officeDefinitions.get(item.officeId).countryId}:${item.person.id}`));
const partyLeaderExecutiveMatches = mappings.filter(mapping => officeholdersByParty.get(mapping.partyId).some(item => item.person?.id === `wikidata:${mapping.sourcePersonId}`)).length;
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
  ['party-leadership-evidence-2026-01-01', evidencePath, evidenceBytes],
].map(([snapshotId, path, content]) => ({ snapshotId, path, sha256: hash(content) }));

const generatedSources = {
  ...priorSources,
  schemaVersion: 3,
  retrievedAt: chairs.retrievedAt,
  coverageStatus: 'partial',
  reviewedSnapshots,
  sourceRecords,
  partyCandidates: candidates,
  mappings,
  limitations: [
    'The structured pipeline reports every registered gameplay party. Exact Party Facts/Wikidata identifier coverage is partial; parties without reviewed ID links remain unavailable, never name-matched.',
    'A Wikidata P488 claim qualifies only when P580 and P582 explicitly bound a tenure interval containing 2026-01-01. A missing P582 is not evidence that tenure continued.',
    'A manually reviewed, dated primary source may override incomplete P488 coverage when it explicitly names the person and party role near the scenario date; conflicting positive evidence remains ambiguous.',
    'P488 means chairperson/presiding member, not necessarily constitutional or electoral party leader. The source role and the gameplay party-head role are recorded separately.',
    'The Wikidata extract was retrieved on 2026-10-01, after the scenario date; qualifiers support a dated tenure inference but do not establish what was publicly knowable on 2026-01-01.',
    'The Party Facts repository software licence is not treated as a data licence. Its crosswalk data remains requires_confirmation; commercial redistribution is not cleared.',
    'Wikidata chairperson identities provide provenance only. Gameplay persons remain fictional and receive no real-person ideology or policy preferences.',
  ],
};

for (const record of generatedSources.sourceRecords) {
  assert.ok(record.sourceRecordId && record.publisher && record.url && record.evidenceDate && record.referenceDate && record.retrievedAt && record.licence && record.attribution && record.claim);
  assert.equal(record.referenceDate, scenarioDate);
  assert.ok(Array.isArray(record.limitations) && record.limitations.length);
}
for (const mapping of mappings) {
  const party = parties.find(item => item.id === mapping.partyId);
  const bridge = bridgeByPartyFactsId.get(String(mapping.partyFactsId));
  const claim = mapping.chairStatementId ? chairs.records.find(item => item.statementId === mapping.chairStatementId) : undefined;
  const override = (overrideByPartyFactsId.get(String(mapping.partyFactsId)) ?? []).find(item => item.sourcePersonId === mapping.sourcePersonId);
  assert.ok(party && bridge && (claim || override));
  assert.equal(mapping.sourcePartyId, party.sourceBasis.sourcePartyId);
  assert.equal(mapping.wikidataPartyId, bridge.wikidataPartyId);
  if (claim) {
    assert.equal(claim.partyId, bridge.wikidataPartyId);
    assert.equal(claim.chairId, mapping.sourcePersonId);
    assert.ok(claim.startDate && claim.endDate && claim.startDate <= scenarioDate && claim.endDate > scenarioDate);
  }
  assert.ok(mapping.fictionalAnalogueName && mapping.fictionalAnalogueName !== mapping.sourcePersonName);
  assert.ok(['party_chairperson', 'party_leader', 'interim_party_leader'].includes(mapping.sourceRole));
  assert.equal(mapping.gameplayRole, 'party_head');
  assert.ok(mapping.sourceRecordIds.every(id => sourceRecordById.has(id)));
}
for (const record of reviewedSnapshots) assert.equal(hash(bytes(record.path)), record.sha256);

const sourceOutput = `${JSON.stringify(generatedSources, null, 2)}\n`;
const report = {
  version: 'party-leader-coverage-0.15-v4',
  scenarioDate,
  generatedFrom: {
    politicalRegistrySha256: hash(registryBytes),
    officeholderSnapshotSha256: hash(officesBytes),
    leaderSourceSnapshotSha256: hash(sourceOutput),
    reviewedSourceSha256: Object.fromEntries(reviewedSnapshots.map(item => [item.snapshotId, item.sha256])),
  },
  methodology: 'Enumerate every gameplay party. Join only reviewed IPU-to-Party-Facts IDs and exact Wikidata party QIDs. Select a source person only from a P488 claim with explicit P580/P582 bounds containing 2026-01-01, or a reviewed dated primary-source override explicitly identifying the party role near that date. Missing P582 is not continued tenure; conflicting positive evidence is ambiguous. Every selected identity has a hand-reviewed fictional analogue. P488 chairperson is recorded as such and is not silently equated with every system’s constitutional/electoral party leader.',
  totals: {
    gameplayParties: parties.length,
    partiesInvestigated: parties.length,
    gameplayLeadersRequired: parties.length,
    partiesWithReviewedPartyFactsBridge: candidates.length,
    sourcedOrObservedLeaderBasis: partyRecords.filter(item => item.sourceLeaderBasis === 'sourced' || item.sourceLeaderBasis === 'observed').length,
    derivedLeaderMappings: partyRecords.filter(item => item.sourceLeaderBasis === 'derived').length,
    modelledFallbackGameplayLeaders: partyRecords.filter(item => item.gameplayLeaderBasis === 'modelled_fallback').length,
    unavailableSourceMappings: partyRecords.filter(item => item.mappingStatus === 'unavailable').length,
    ambiguousMappings: partyRecords.filter(item => item.mappingStatus === 'ambiguous').length,
    availableExecutiveOfficeholderRecords: availableExecutiveRecords.length,
    reconciledExecutiveOfficeholders: executiveIdentities.size,
    executiveOfficeholdersMatchingPartyLeaders: partyLeaderExecutiveMatches,
    standaloneExecutivePersons: executiveIdentities.size - partyLeaderExecutiveMatches,
    mappingsWithoutFictionalAnalogue: mappings.filter(mapping => !mapping.fictionalAnalogueName).length,
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
