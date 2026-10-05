import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildPartyProfile } from './politics-party-profile.mjs';

const inputPath = 'src/data/source-snapshots/ipu-parline-politics-2026-01-01.json';
const interestsPath = 'src/data/source-snapshots/organized-interests-2026-01-01.json';
const ideologyPath = 'src/data/source-snapshots/vparty-ideology-2022.json';
const outputPath = 'src/data/political-registry.json';
const source = JSON.parse(readFileSync(inputPath, 'utf8'));
const interests = JSON.parse(readFileSync(interestsPath, 'utf8'));
const ideologySource = JSON.parse(readFileSync(ideologyPath, 'utf8'));
const entities = JSON.parse(readFileSync('src/data/entity-registry.json', 'utf8'));
const ipuByCountry = new Map(source.countries.map(country => [country.countryId, country]));
const ideologyBySourcePartyId = new Map(ideologySource.parties.map(party => [party.sourcePartyId, party]));
const interestsByCountry = new Map();
for (const item of interests.organizations) interestsByCountry.set(item.countryId, [...(interestsByCountry.get(item.countryId) ?? []), item]);
const families = ['Civic Alliance', 'Social Forum', 'National League', 'Reform Movement', 'Democratic Union', 'Popular Assembly', 'Liberal Coalition', 'Community Congress', 'Green Initiative', 'Labour Front', 'Republican Group', 'Progressive List'];
// Recognizable fictional analogues: keep the party's identifiable family/stem and swap a
// generic structural word (Party/Parti/etc.) for a deterministic fictional structural term,
// so the gameplay party is a recognizable analogue of its sourced party without copying the
// real name verbatim. Ideology is NOT inferred from the name.
const STRUCTURAL_WORDS = new Set(['party', 'parti', 'partido', 'partei', 'partid', 'partie', 'partia', 'movement', 'mouvement', 'movimiento', 'union', 'unie', 'unionen', 'alliance', 'allianz', 'alianza', 'bloc', 'bloque', 'coalition', 'coalicion', 'coalitie', 'front', 'frente', 'league', 'liga', 'list', 'lista', 'liste', 'forum', 'foro', 'congress', 'congreso', 'assembly', 'asamblea', 'group', 'groupe', 'grupo', 'vereinigung', 'volkspartei', 'bund', 'allianssi', 'liitto']);
const STRUCTURAL_ANALOGUES = ['Bloc', 'Alliance', 'Union', 'Movement', 'Group', 'Coalition'];
const strip = value => (value ?? '').replace(/[.,;'"()]/g, '');
const partyDisplayName = (sourceName) => {
  const words = strip(sourceName).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'National Movement';
  const lower = words.map(word => word.toLowerCase());
  const structuralIndex = lower.findIndex(word => STRUCTURAL_WORDS.has(word));
  let analogueIndex = parseInt(sha(sourceName).slice(0, 8), 16) % STRUCTURAL_ANALOGUES.length;
  let analogue = STRUCTURAL_ANALOGUES[analogueIndex];
  if (structuralIndex !== -1 && analogue.toLowerCase() === words[structuralIndex].toLowerCase()) {
    analogue = STRUCTURAL_ANALOGUES[(analogueIndex + 1) % STRUCTURAL_ANALOGUES.length];
  }
  if (structuralIndex === -1) return `${sourceName} ${analogue}`;
  const stem = words.slice(0, structuralIndex).join(' ');
  const suffix = words.slice(structuralIndex + 1).join(' ');
  return `${stem} ${analogue}${suffix ? ` ${suffix}` : ''}`.trim();
};
const sha = value => createHash('sha256').update(value).digest('hex');
const shaSnapshot = path => sha(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
const provenance = (status, limitation, basis = source.source) => ({ status, referenceDate: source.referenceDate, retrievedAt: source.retrievedAt, source: basis.publisher, sourceUrl: basis.url, limitation });
const partyId = (countryId, sourceId) => `party:${countryId}:${sha(sourceId).slice(0, 12)}`;
const organizationId = (countryId, sourceId) => `organization:${countryId}:${sha(sourceId).slice(0, 12)}`;
const normalizedName = value => (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const executive = evidence => {
  const system = evidence?.politicalSystem, subsystem = evidence?.politicalSubsystem;
  if (system === 'parliamentary_system' && subsystem === 'constitutional_monarchy') return { kind: 'monarchy_parliamentary', status: 'sourced' };
  if (system === 'parliamentary_system' && ['parliamentary', 'parliamentary_ceremonial_president'].includes(subsystem)) return { kind: 'parliamentary', status: 'sourced' };
  if (system === 'presidential_parliamentary') return { kind: 'semi_presidential', status: 'sourced' };
  if (system === 'presidential_system') return { kind: 'presidential', status: 'sourced' };
  if (['monarchy', 'communist_system'].includes(system)) return { kind: 'other', status: 'sourced' };
  if (system === 'transitional_system') return { kind: 'other', status: 'partial' };
  return { kind: 'unavailable', status: 'unavailable' };
};
const matchGovernment = (texts, parties) => {
  const derivations = [], matched = new Set();
  for (const sourceText of texts.filter(Boolean)) {
    const text = normalizedName(sourceText), candidates = parties.filter(([, name]) => { const normalized = normalizedName(name); return normalized.length >= 4 && text.includes(normalized); });
    const counts = new Map(candidates.map(item => [normalizedName(item[1]), candidates.filter(other => normalizedName(other[1]) === normalizedName(item[1])).length]));
    const unambiguous = candidates.filter(item => counts.get(normalizedName(item[1])) === 1);
    for (const [id] of unambiguous) matched.add(id);
    derivations.push({ sourceText, method: 'normalized_source_party_name_substring_v1', matchedPartyIds: unambiguous.map(([id]) => id), ambiguous: candidates.length !== unambiguous.length });
  }
  return { ids: [...matched].sort(), derivations };
};

const registry = { version: 'political-registry-0.13-v4', referenceDate: source.referenceDate, sourceSnapshotSha256: shaSnapshot(inputPath), organizedInterestsSourceSha256: shaSnapshot(interestsPath), ideologySourceSnapshotSha256: shaSnapshot(ideologyPath), countries: {}, institutions: {}, parties: {}, organizations: {} };
for (const entity of [...entities.countries].sort((a, b) => a.id.localeCompare(b.id))) {
  const evidence = ipuByCountry.get(entity.id), institutionId = `institution:${entity.id}:national`, executiveSystem = executive(evidence);
  const allocations = evidence?.chambers.filter(chamber => chamber.election?.fullAllocation) ?? [];
  const sourceParties = new Map();
  for (const chamber of allocations) for (const seat of chamber.election.seats) sourceParties.set(seat.sourcePartyId, seat.sourcePartyName);
  const sortedParties = [...sourceParties].sort(([a], [b]) => a.localeCompare(b));
  const ids = sortedParties.map(([sourceId]) => partyId(entity.id, sourceId));
  const government = matchGovernment((evidence?.chambers ?? []).map(chamber => chamber.election?.governmentPartyText), sortedParties.map(([id, name]) => [partyId(entity.id, id), name]));
  sortedParties.forEach(([sourceId, sourceName], index) => {
    const id = partyId(entity.id, sourceId);
    registry.parties[id] = { id, countryId: entity.id, displayName: partyDisplayName(sourceName), fictional: true,
      provenance: provenance('modelled_fallback', 'Fictional gameplay identity mapped one-to-one to a sourced electoral seat entry. Ideological evidence, when present, is separately qualified.'), sourceBasis: { sourcePartyId: sourceId, sourcePartyName: sourceName }, ...buildPartyProfile({ sourcePartyId: sourceId, sourcePartyName: sourceName }, ideologyBySourcePartyId.get(sourceId)),
      currentSeats: allocations.reduce((sum, chamber) => sum + (chamber.election.seats.find(seat => seat.sourcePartyId === sourceId)?.seats ?? 0), 0), governmentStatus: government.ids.length ? (government.ids.includes(id) ? 'government' : 'opposition') : 'unavailable' };
  });
  const chambers = (evidence?.chambers ?? []).map(chamber => {
    const full = chamber.election?.fullAllocation === true, seatsByParty = full ? Object.fromEntries(chamber.election.seats.map(seat => [partyId(entity.id, seat.sourcePartyId), seat.seats])) : {}, status = full ? 'sourced' : 'unavailable';
    return { id: `chamber:${chamber.sourceChamberId}`, countryId: entity.id, displayName: chamber.displayName, totalSeats: chamber.totalSeats, seatsByParty, independentOtherSeats: full ? chamber.election.independentOtherSeats : undefined, seatAllocationStatus: status,
      electoralRule: { kind: chamber.electoralRule, status: chamber.electoralRule === 'other' ? 'partial' : 'sourced', provenance: provenance(chamber.electoralRule === 'other' ? 'partial' : 'sourced', 'IPU Parline electoral-system classification applicable at the scenario date.') }, electionDate: chamber.election?.electionDate, termStart: chamber.election?.firstSessionDate, termEnd: chamber.election?.nextElectionDate, electionProcess: chamber.election ? 'current' : 'unavailable', provenance: provenance('sourced', full ? 'IPU chamber and latest complete election allocation on or before the scenario date.' : 'IPU chamber metadata; a complete reconciled seat allocation was not available.') };
  });
  const institutionStatus = evidence ? 'partial' : 'unavailable';
  registry.institutions[institutionId] = { id: institutionId, countryId: entity.id, executiveSystem: executiveSystem.kind, executiveSystemStatus: executiveSystem.status, executiveSystemProvenance: provenance(executiveSystem.status, executiveSystem.status === 'unavailable' ? 'No applicable IPU political-system record.' : executiveSystem.status === 'partial' ? `IPU category ${evidence.politicalSystem} is transitional and maps only to the generic other bucket.` : `Deterministic mapping from IPU ${evidence.politicalSystem}${evidence.politicalSubsystem ? ` / ${evidence.politicalSubsystem}` : ''}.`), legislatureKind: evidence?.legislatureKind ?? 'unavailable', chambers, governingPartyIds: government.ids, governingBlocDerivations: government.derivations, confidenceArrangement: 'unavailable', lastElectionDate: chambers.map(c => c.electionDate).filter(Boolean).sort().at(-1), nextElectionDate: chambers.map(c => c.termEnd).filter(Boolean).sort()[0], electionProcess: chambers.some(c => c.electionProcess === 'current') ? 'current' : 'unavailable', provenance: provenance(institutionStatus, evidence ? 'Legislature and chambers sourced from IPU Parline; executive classification is separately qualified and governing-party matches are derived.' : 'No admissible IPU national parliamentary record applicable at the scenario date; absence does not prove non-applicability.') };
  const orgs = interestsByCountry.get(entity.id) ?? [], organizationIds = [];
  orgs.forEach((item, index) => { const id = organizationId(entity.id, item.sourceId), basis = interests.sources[item.sourceKey]; organizationIds.push(id); registry.organizations[id] = { id, countryId: entity.id, type: item.type, displayName: `${entity.commonName} ${item.type === 'union' ? 'Workers Federation' : 'Enterprise Forum'}${index > 1 ? ` ${index}` : ''}`, fictional: true, sourceBasis: { sourceOrganizationId: item.sourceId, sourceOrganizationName: item.sourceName }, representedInterests: item.type === 'union' ? ['labour', 'income_security', 'public_services'] : ['enterprise', 'infrastructure', 'fiscal_policy'], representedCohorts: item.type === 'union' ? ['low', 'middle'] : ['middle', 'high'], issuePriorities: item.type === 'union' ? ['labour_protection', 'income_security', 'public_services'] : ['infrastructure', 'fiscal_distribution', 'public_order'], membership: { status: 'unavailable' }, provenance: provenance('partial', 'Source establishes an affiliated organization and country, while gameplay identity/interests are modelled and membership is unavailable.', basis) }; });
  const electoral = chambers.length && chambers.every(c => c.electoralRule.status === 'sourced') ? 'sourced' : chambers.length ? 'partial' : 'unavailable';
  const ideologyStatuses = ids.map(id => registry.parties[id].ideologicalBasis.status), partyIdeology = !ids.length ? 'unavailable' : ideologyStatuses.some(status => status === 'sourced' || status === 'partial') ? 'partial' : 'modelled_fallback';
  registry.countries[entity.id] = { countryId: entity.id, institutionId, partyIds: ids, organizationIds, coverage: { institutions: institutionStatus, executiveSystem: executiveSystem.status, legislature: evidence ? 'sourced' : 'unavailable', electoralSystem: electoral, partyBasis: ids.length ? 'sourced' : 'unavailable', partyIdeology, seats: allocations.length ? 'sourced' : 'unavailable', coalition: government.ids.length ? 'partial' : 'unavailable', organizedInterests: organizationIds.length ? 'partial' : 'unavailable', opinionAnchor: 'modelled_fallback' } };
}
const output = `${JSON.stringify(registry, null, 2)}\n`;
if (process.argv.includes('--check')) { if (readFileSync(outputPath, 'utf8') !== output) throw new Error('Political registry is stale. Run npm run politics:data:generate.'); } else writeFileSync(outputPath, output);
const counts = Object.values(registry.countries).map(country => country.partyIds.length);
console.log(JSON.stringify({ countries: counts.length, parties: counts.reduce((a, b) => a + b, 0), organizations: Object.keys(registry.organizations).length, partyCountMin: Math.min(...counts), partyCountMax: Math.max(...counts), distinctPartyCounts: [...new Set(counts)].sort((a, b) => a - b), chambers: Object.values(registry.institutions).flatMap(item => item.chambers).length, representedSeats: Object.values(registry.institutions).flatMap(item => item.chambers).reduce((sum, item) => sum + (item.seatAllocationStatus === 'sourced' ? item.totalSeats ?? 0 : 0), 0) }, null, 2));
