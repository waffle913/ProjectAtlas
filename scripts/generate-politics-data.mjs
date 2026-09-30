import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const inputPath = 'src/data/source-snapshots/ipu-parline-politics-2026-01-01.json';
const entityPath = 'src/data/entity-registry.json';
const outputPath = 'src/data/political-registry.json';
const source = JSON.parse(readFileSync(inputPath, 'utf8'));
const entities = JSON.parse(readFileSync(entityPath, 'utf8'));
const ipuByCountry = new Map(source.countries.map(country => [country.countryId, country]));
const issues = ['fiscal_distribution', 'public_services', 'labour_protection', 'income_security', 'infrastructure', 'public_order'];
const ideologies = ['fiscal_redistribution', 'market_intervention', 'public_services', 'labour_protection', 'social_progressivism', 'migration_openness', 'national_integration', 'decentralization', 'civil_liberties'];
const families = ['Civic Alliance', 'Social Forum', 'National League', 'Reform Movement', 'Democratic Union', 'Popular Assembly', 'Liberal Coalition', 'Community Congress', 'Green Initiative', 'Labour Front', 'Republican Group', 'Progressive List'];
const hash = text => parseInt(createHash('sha256').update(text).digest('hex').slice(0, 8), 16);
const provenance = (status, limitation) => ({ status, referenceDate: source.referenceDate, retrievedAt: source.retrievedAt, source: source.source.publisher, sourceUrl: source.source.url, limitation });
const na = entity => ['dependency', 'special_status'].includes(entity.entityType);
const partyId = (countryId, sourceId) => `party:${countryId}:${createHash('sha256').update(sourceId).digest('hex').slice(0, 12)}`;
const profile = (seed, dimension) => 1_500 + hash(`${seed}:${dimension}`) % 7_001;
const normalizedName = value => (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const registry = { version: 'political-registry-0.13-v2', referenceDate: source.referenceDate, sourceSnapshotSha256: createHash('sha256').update(readFileSync(inputPath)).digest('hex'), countries: {}, institutions: {}, parties: {}, organizations: {} };
for (const entity of [...entities.countries].sort((a, b) => a.id.localeCompare(b.id))) {
  const evidence = ipuByCountry.get(entity.id), institutionId = `institution:${entity.id}:national`;
  const allocations = evidence?.chambers.filter(chamber => chamber.election?.fullAllocation) ?? [];
  const sourceParties = new Map();
  for (const chamber of allocations) for (const seat of chamber.election.seats) sourceParties.set(seat.sourcePartyId, seat.sourcePartyName);
  const sortedParties = [...sourceParties].sort(([a], [b]) => a.localeCompare(b));
  const ids = sortedParties.map(([sourceId]) => partyId(entity.id, sourceId));
  const governmentTexts = (evidence?.chambers ?? []).map(chamber => normalizedName(chamber.election?.governmentPartyText)).filter(Boolean);
  const governmentIds = sortedParties.filter(([, sourceName]) => { const name = normalizedName(sourceName); return name.length >= 4 && governmentTexts.some(text => text.includes(name)); }).map(([sourceId]) => partyId(entity.id, sourceId));
  sortedParties.forEach(([sourceId, sourceName], index) => {
    const id = partyId(entity.id, sourceId), seed = `${entity.externalIds.isoAlpha2}:${sourceId}`;
    registry.parties[id] = { id, countryId: entity.id, displayName: `${entity.commonName} ${families[index % families.length]}${index >= families.length ? ` ${Math.floor(index / families.length) + 1}` : ''}`, fictional: true,
      provenance: provenance('modelled_fallback', 'Fictional gameplay identity mapped one-to-one to a sourced electoral seat entry. Name and positions are synthetic and make no claim about the real party.'),
      sourceBasis: { sourcePartyId: sourceId, sourcePartyName: sourceName }, ideology: Object.fromEntries(ideologies.map(key => [key, profile(seed, key)])),
      issuePositions: Object.fromEntries(issues.map(key => [key, { preferenceBps: profile(seed, key), intensityBps: 5_000 + hash(`${seed}:${key}:intensity`) % 2_501, confidenceBps: 4_000, materialInterests: [], ideologicalPrior: 'deterministic fictional profile' }])),
      constituencies: [], currentSeats: allocations.reduce((sum, chamber) => sum + (chamber.election.seats.find(seat => seat.sourcePartyId === sourceId)?.seats ?? 0), 0), governmentStatus: governmentIds.length ? (governmentIds.includes(id) ? 'government' : 'opposition') : 'unavailable' };
  });
  const chambers = (evidence?.chambers ?? []).map(chamber => {
    const full = chamber.election?.fullAllocation === true;
    const seatsByParty = full ? Object.fromEntries(chamber.election.seats.map(seat => [partyId(entity.id, seat.sourcePartyId), seat.seats])) : {};
    const status = full ? 'sourced' : 'unavailable';
    return { id: `chamber:${chamber.sourceChamberId}`, countryId: entity.id, displayName: chamber.displayName, totalSeats: chamber.totalSeats,
      seatsByParty, independentOtherSeats: full ? chamber.election.independentOtherSeats : undefined, seatAllocationStatus: status,
      electoralRule: { kind: chamber.electoralRule, status: chamber.electoralRule === 'other' ? 'partial' : 'sourced', provenance: provenance(chamber.electoralRule === 'other' ? 'partial' : 'sourced', 'IPU Parline electoral-system classification applicable at the scenario date.') },
      electionDate: chamber.election?.electionDate, termStart: chamber.election?.firstSessionDate, termEnd: chamber.election?.nextElectionDate, electionProcess: chamber.election ? 'current' : 'unavailable',
      provenance: provenance('sourced', full ? 'IPU chamber and latest complete election allocation on or before the scenario date.' : 'IPU chamber metadata; a complete reconciled seat allocation was not available.') };
  });
  const noApplicability = !evidence && na(entity), institutionStatus = evidence ? 'partial' : noApplicability ? 'not_applicable' : 'unavailable';
  registry.institutions[institutionId] = { id: institutionId, countryId: entity.id, executiveSystem: 'unavailable', legislatureKind: evidence?.legislatureKind ?? (noApplicability ? 'none' : 'unavailable'), chambers,
    governingPartyIds: governmentIds, confidenceArrangement: evidence ? 'unavailable' : noApplicability ? 'not_applicable' : 'unavailable',
    lastElectionDate: chambers.map(c => c.electionDate).filter(Boolean).sort().at(-1), nextElectionDate: chambers.map(c => c.termEnd).filter(Boolean).sort()[0], electionProcess: chambers.some(c => c.electionProcess === 'current') ? 'current' : 'unavailable',
    provenance: provenance(institutionStatus, evidence ? 'Legislature and chambers sourced from IPU Parline; executive system and coalition remain unavailable.' : noApplicability ? 'No separate national legislature is applicable to this entity type.' : 'No admissible IPU national parliamentary record applicable at the scenario date.') };
  const electoral = chambers.length && chambers.every(c => c.electoralRule.status === 'sourced') ? 'sourced' : chambers.length ? 'partial' : noApplicability ? 'not_applicable' : 'unavailable';
  registry.countries[entity.id] = { countryId: entity.id, institutionId, partyIds: ids, organizationIds: [], coverage: { institutions: institutionStatus, legislature: evidence ? 'sourced' : noApplicability ? 'not_applicable' : 'unavailable', electoralSystem: electoral,
    partyBasis: ids.length ? 'sourced' : noApplicability ? 'not_applicable' : 'unavailable', seats: allocations.length ? 'sourced' : noApplicability ? 'not_applicable' : 'unavailable', coalition: governmentIds.length ? 'sourced' : noApplicability ? 'not_applicable' : 'unavailable', organizedInterests: noApplicability ? 'not_applicable' : 'unavailable', opinionAnchor: 'modelled_fallback' } };
}
const output = `${JSON.stringify(registry, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(outputPath, 'utf8') !== output) throw new Error('Political registry is stale. Run npm run politics:data:generate.');
} else writeFileSync(outputPath, output);
const counts = Object.values(registry.countries).map(country => country.partyIds.length);
console.log(JSON.stringify({ countries: counts.length, parties: counts.reduce((a, b) => a + b, 0), partyCountMin: Math.min(...counts), partyCountMax: Math.max(...counts), distinctPartyCounts: [...new Set(counts)].sort((a, b) => a - b), chambers: Object.values(registry.institutions).flatMap(item => item.chambers).length, representedSeats: Object.values(registry.institutions).flatMap(item => item.chambers).reduce((sum, item) => sum + (item.seatAllocationStatus === 'sourced' ? item.totalSeats ?? 0 : 0), 0) }, null, 2));
