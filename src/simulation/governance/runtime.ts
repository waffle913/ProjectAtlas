import type { SimulationState } from '../../types';
import { fiscalReformFingerprint, scheduleFiscalReform, validateFiscalReform } from '../fiscal/runtime';
import { dateValid } from '../fiscal/math';
import { POLITICAL_ISSUES, type PoliticalRegistry } from '../politics/model';
import { politicalRegistry } from '../politics/registry';
import { deterministicInteger } from '../rng';
import { addProposalResultBriefing } from '../information/runtime';
import partyLeadershipSources from '../../data/source-snapshots/party-leadership-2026-01-01.json';
import politicalOffices from '../../data/political-offices.json';
import { assertInitialOfficeReconciliation } from './initialOfficeEvidence';
import { namePoolForCountry } from './namePools';
import entityRegistry from '../../data/entity-registry.json';
import { capabilitiesForReconciledAuthority, executiveAuthorityBasis } from './officeEvidence';
export { capabilitiesForReconciledAuthority } from './officeEvidence';
import { analyzeProposal } from './analysis';
import { buildLeadershipSuccessionEvidence, leadershipProfileFromEvidence } from './leadershipSuccession';
import { classifyProposalImpact, estimateParliamentarySupport, estimatePublicSupport } from './estimates';
import { AUTHORITY_CAPABILITIES, governanceFingerprint, proposalContract, type AuthorityCapability, type ChamberSupportEstimate, type ConstitutionalAmendmentPayload, type ConstitutionalDisposition, type FiscalProposalPayload, type GovernanceState, type GovernmentCabinet, type LeadershipSuccession, type LegislativeVoteResult, type ParliamentarySupportEstimate, type PartyGoalProfile, type PoliticalOfficeRole, type PoliticalPersonState, type PoliticalProposal, type Portfolio, type ProposalAnalysis, type ProposalEffect, type ProposalImpact, type PublicSupportEstimate } from './model';
import { rejectProtectedModification, applyConstitutionalAmendment, scheduleConstitutionalAmendment } from '../constitution/runtime';
export { classifyProposalImpact, estimateParliamentarySupport, estimatePublicSupport } from './estimates';
const personId = (sequence: number) => `person.${sequence.toString().padStart(8, '0')}`;
const proposalId = (sequence: number) => `proposal.${sequence.toString().padStart(8, '0')}`;
const successionId = (sequence: number) => `succession.${sequence.toString().padStart(8, '0')}`;
const cloneGovernance = (state: SimulationState, governance: GovernanceState): SimulationState => ({ ...state, governance });
const requireCountry = (state: SimulationState, countryId: string) => { if (!state.engine.fidelityByCountry[countryId]) throw new Error(`Unknown Country: ${countryId}`); };
const requirePerson = (state: SimulationState, id: string) => { const person = state.governance.persons[id]; if (!person) throw new Error(`Unknown political person: ${id}`); return person; };
const requireControlled = (state: SimulationState, id: string) => { if (state.governance.player.controlledPersonId !== id) throw new Error('The proposer is not the controlled person.'); return requirePerson(state, id); };
const capabilitiesFor = (role: PoliticalOfficeRole): AuthorityCapability[] => role === 'head_of_government'
  ? ['sponsor_legislation', 'sponsor_fiscal_reform', 'sponsor_budget_reform', 'vote_legislation', 'access_government_information', 'command_military_operations']
  : role === 'legislator' ? ['sponsor_legislation', 'vote_legislation'] : [];
const authorityLimitation = 'Generic modelled constitutional abstraction for gameplay; it is not an observed national constitutional rule.';
const LEADER_PROFILE_VARIATION_BPS = 250;
const SOURCE_LEADER_LIMITATION = 'No pinned, licensing-cleared party-leadership source applicable on 2026-01-01 is available in the ProjectAtlas political registry. The gameplay identity is fictional and is not a sourced real-person analogue.';
type ReviewedLeaderMapping = {
  partyId: string;
  sourcePartyId: string;
  sourcePartyName: string;
  partyFactsId: number;
  wikidataPartyId: string;
  sourcePersonId: string;
  sourcePersonName: string;
  fictionalAnalogueName: string;
  basis: 'derived_analogue';
  sourceStatus: 'derived';
  sourceRole: 'party_chairperson' | 'party_leader' | 'interim_party_leader';
  chairStatementId?: string;
  sourceRecordIds: string[];
  referenceDate: string;
  officeholderMatch?: { officeId: string; sourcePersonId: string; startDate: string; title: string };
};
const reviewedLeaderMapping = (mapping: typeof partyLeadershipSources.mappings[number]): ReviewedLeaderMapping => {
  if (mapping.sourceRole !== 'party_chairperson' && mapping.sourceRole !== 'party_leader' && mapping.sourceRole !== 'interim_party_leader') {
    throw new Error(`Unknown source role for reviewed party leader ${mapping.partyId}.`);
  }
  return { ...mapping, basis: 'derived_analogue', sourceStatus: 'derived', sourceRole: mapping.sourceRole };
};
const reviewedLeaderMappings = new Map<string, ReviewedLeaderMapping>(partyLeadershipSources.mappings.map(mapping => [mapping.partyId, reviewedLeaderMapping(mapping)]));
const ambiguousSourceLeaderPartyIds = new Set(partyLeadershipSources.partyCandidates.filter(candidate => candidate.mappingStatus === 'ambiguous').map(candidate => candidate.partyId));
const sourceOfficeById = new Map(politicalOffices.offices.map(office => [office.id, office]));
type SourceOfficeholder = typeof politicalOffices.officeholders[number];

function fictionalLeaderName(state: SimulationState, partyId: string, eventKey: string, usedNames: Set<string>, countryId: string) {
  const pool = namePoolForCountry(entityRegistry.countries.find(country => country.id === countryId) ?? {});
  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    const pick = (system: string, length: number) => deterministicInteger(state.engine.seed, { system, entityId: partyId, date: state.date, eventKey: `${eventKey}:${attempt}` }, 0, length);
    const given = pool.given[pick('party-leadership.given', pool.given.length)];
    const family = pool.family[pick('party-leadership.family', pool.family.length)];
    const name = attempt === 0 ? `${given} ${family}` : `${given} ${family} ${attempt + 1}`;
    if (!usedNames.has(name)) return name;
  }
  throw new Error(`Unable to produce a unique fictional leader identity for party ${partyId}.`);
}

function leaderProfileFor(partyId: string, personIdValue: string, state: SimulationState, succession: boolean, registry: PoliticalRegistry = politicalRegistry) {
  const party = registry.parties[partyId];
  if (!party) throw new Error(`Unknown political party: ${partyId}`);
  return Object.fromEntries(POLITICAL_ISSUES.map(issue => {
    const position = party.issuePositions[issue];
    const variation = succession
      ? deterministicInteger(state.engine.seed, { system: 'party-leadership.profile', entityId: partyId, date: state.date, eventKey: `${personIdValue}:${issue}` }, -LEADER_PROFILE_VARIATION_BPS, LEADER_PROFILE_VARIATION_BPS + 1)
      : 0;
    return [issue, {
      valueBps: Math.max(0, Math.min(10_000, position.preferenceBps + variation)),
      confidenceBps: position.confidenceBps,
      status: succession || party.ideologicalBasis.status === 'modelled_fallback' ? 'modelled' as const : 'derived' as const,
      limitation: succession
        ? `Modelled bounded variation of at most ${LEADER_PROFILE_VARIATION_BPS} basis points around the validated fictional party position; this profile does not affect simulation decisions.`
        : `Derived from the fictional party's validated position; no individual real-person belief is asserted. ${party.ideologicalBasis.limitation}`,
    }];
  }));
}

type LeaderProvenance = NonNullable<PoliticalPersonState['leaderProvenance']>;

function leaderProvenance(
  partyId: string,
  method: 'party_platform_initial_v2' | 'bounded_party_platform_succession_v2',
  registry: PoliticalRegistry = politicalRegistry,
  mappingOverride?: ReviewedLeaderMapping | null,
): LeaderProvenance {
  const mapping = mappingOverride === undefined ? reviewedLeaderMappings.get(partyId) : mappingOverride ?? undefined;
  if (mapping && mapping.referenceDate === registry.referenceDate
    && mapping.basis === 'derived_analogue'
    && mapping.sourceStatus === 'derived') {
    if (!mapping.fictionalAnalogueName.trim() || mapping.fictionalAnalogueName === mapping.sourcePersonName) {
      throw new Error(`Reviewed party leader mapping for ${partyId} has no valid fictional analogue.`);
    }
    return {
      basis: mapping.basis,
      method: 'reviewed_party_leadership_evidence_v1',
      sourcePartyId: registry.parties[partyId].sourceBasis.sourcePartyId,
      referenceDate: registry.referenceDate,
      sourceLeaderStatus: mapping.sourceStatus,
      sourceLeader: {
        id: `wikidata:${mapping.sourcePersonId}`,
        name: mapping.sourcePersonName,
        sourceRole: mapping.sourceRole,
        sourceRecordIds: [...mapping.sourceRecordIds],
      },
      limitation: `The fictional gameplay leader is derived from a dated source role (${mapping.sourceRole}) through reviewed stable party identifiers. Source identity is provenance only; no personal ideology is inferred.`,
    };
  }
  return {
    basis: 'modelled_fallback' as const,
    method,
    sourcePartyId: registry.parties[partyId].sourceBasis.sourcePartyId,
    referenceDate: registry.referenceDate,
    sourceLeaderStatus: ambiguousSourceLeaderPartyIds.has(partyId) ? 'ambiguous' as const : 'unavailable' as const,
    limitation: ambiguousSourceLeaderPartyIds.has(partyId)
      ? 'Multiple dated Party Facts/Wikidata chairperson identities match this party on 2026-01-01; the gameplay leader remains fictional and no source person is selected.'
      : SOURCE_LEADER_LIMITATION,
  };
}

function initializeSourceOfficeholders(state: SimulationState, registry: PoliticalRegistry): SimulationState {
  if (state.date !== registry.referenceDate || state.date !== politicalOffices.referenceDate) return state;
  const grouped = new Map<string, Array<{ record: SourceOfficeholder; definition: typeof politicalOffices.offices[number] }>>();
  for (const record of politicalOffices.officeholders) {
    if (record.status !== 'available' || record.referenceDate !== state.date || record.startDate && record.startDate > state.date || !record.person?.id) continue;
    const definition = sourceOfficeById.get(record.officeId);
    if (!definition || !['head_of_government', 'head_of_state'].includes(definition.kind) || !state.engine.fidelityByCountry[definition.countryId]) continue;
    const key = `${definition.countryId}:${record.person.id}`;
    const roles = grouped.get(key) ?? [];
    roles.push({ record, definition });
    grouped.set(key, roles);
  }

  let next = state;
  for (const [, records] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const firstRecord = records[0];
    if (!firstRecord?.record.person?.id) continue;
    records.sort((a, b) => a.definition.kind.localeCompare(b.definition.kind) || a.definition.id.localeCompare(b.definition.id));
    const countryId = firstRecord.definition.countryId;
    const sourcePersonId = firstRecord.record.person.id;
    const sourceQid = sourcePersonId.startsWith('wikidata:') ? sourcePersonId.slice('wikidata:'.length) : undefined;
    const mapping = sourceQid
      ? [...reviewedLeaderMappings.values()].find(item => item.sourcePersonId === sourceQid && registry.parties[item.partyId]?.countryId === countryId && item.referenceDate === state.date)
      : undefined;
    const partyLeader = Object.values(next.governance.persons).find(person =>
      person.countryId === countryId && person.leaderProvenance?.sourceLeader?.id === sourcePersonId);
    const alreadyMaterialized = Object.values(next.governance.persons).find(person =>
      person.countryId === countryId && person.office?.evidence?.sourcePersonId === sourcePersonId);
    let person = partyLeader ?? alreadyMaterialized;
    if (person?.office && !person.office.evidence) continue;

    const country = registry.countries[countryId];
    const institution = country ? registry.institutions[country.institutionId] : undefined;
    const system = institution?.executiveSystemStatus === 'sourced' ? institution.executiveSystem : 'unavailable';
    const preferredRole = system === 'presidential'
      ? 'head_of_state'
      : system === 'parliamentary' || system === 'monarchy_parliamentary' ? 'head_of_government' : undefined;
    const selected = records.find(item => item.definition.kind === preferredRole)
      ?? records.find(item => item.definition.kind === 'head_of_government')
      ?? records[0];
    const role = selected.definition.kind as PoliticalOfficeRole;
    const authorityBasis = executiveAuthorityBasis(system, role);
    const capabilities = capabilitiesForReconciledAuthority(authorityBasis);
    const mappedOfficeTitle = mapping?.officeholderMatch?.officeId === selected.definition.id
      ? mapping.officeholderMatch.title
      : undefined;
    const title = mappedOfficeTitle ?? selected.definition.title;
    const capabilityLimitation = authorityBasis === 'sourced_parliamentary_head_of_government'
      ? 'A dated source officeholder match and sourced parliamentary/monarchy-parliamentary system support this generic modelled executive gameplay profile. It is not a complete legal powers inventory.'
      : authorityBasis === 'sourced_presidential_head_of_state'
        ? 'A dated source officeholder match and sourced presidential system support this generic modelled executive gameplay profile. It is not a complete legal powers inventory.'
        : 'The officeholder identity is reconciled, but available institutional evidence does not resolve this office\'s gameplay authority. No executive capabilities are inferred; this does not assert that the real office has no powers.';
    const sourceOfficeIds = records.map(item => item.definition.id).sort();
    const sourceRecordIds = [...new Set([
      ...(mapping?.sourceRecordIds ?? []),
      ...records.map(item => item.record.source.datasetId),
    ])].sort();
    const office = {
      role,
      countryId,
      title,
      appointedOn: state.date,
      evidence: {
        status: 'source_reconciled' as const,
        sourceOfficeId: selected.definition.id,
        sourceOfficeIds,
        sourcePersonId,
        referenceDate: state.date,
        effectiveFrom: selected.record.startDate,
        sourceRecordIds,
        authorityBasis,
      },
      authorityProfile: {
        status: 'modelled_constitutional_abstraction' as const,
        capabilities,
        limitation: capabilityLimitation,
      },
    };
    if (!person) {
      const id = personId(next.governance.nextPersonSequence);
      if (next.governance.persons[id]) throw new Error(`Political person sequence is already in use: ${id}.`);
      const usedNames = new Set(Object.values(next.governance.persons).map(item => item.displayName));
      if (selected.record.person?.name) usedNames.add(selected.record.person.name);
      person = {
        id,
        displayName: fictionalLeaderName(next, `officeholder:${sourcePersonId}`, `initial-officeholder:${countryId}`, usedNames, countryId),
        countryId,
        createdOn: state.date,
        isPartyLeader: false,
        status: 'active',
      };
      next = cloneGovernance(next, {
        ...next.governance,
        persons: { ...next.governance.persons, [id]: { ...person, office } },
        nextPersonSequence: next.governance.nextPersonSequence + 1,
      });
    } else {
      next = cloneGovernance(next, {
        ...next.governance,
        persons: { ...next.governance.persons, [person.id]: { ...person, office } },
      });
    }
  }
  assertInitialOfficeReconciliation(next, registry);
  return next;
}

export function initializeGovernance(state: SimulationState): GovernanceState {
  return state.governance?.initializedOn ? state.governance : { ...(state.governance ?? { version: 'governance-0.14-v1', player: {}, persons: {}, proposals: {}, proposalOrder: [], nextPersonSequence: 0, nextProposalSequence: 0, successions: {}, successionOrder: [], nextSuccessionSequence: 0 }), initializedOn: state.date };
}

export function createPoliticalPerson(state: SimulationState, input: { displayName: string; countryId: string; createdOn?: string; status?: 'active' | 'inactive' }): SimulationState {
  requireCountry(state, input.countryId);
  const createdOn = input.createdOn ?? state.date;
  if (!input.displayName.trim() || !dateValid(createdOn) || createdOn > state.date || !state.governance.initializedOn || createdOn < state.governance.initializedOn) throw new Error('Invalid political person identity or creation date.');
  const id = personId(state.governance.nextPersonSequence);
  const person = { id, displayName: input.displayName.trim(), countryId: input.countryId, createdOn, isPartyLeader: false, status: input.status ?? 'active' } as const;
  return cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [id]: person }, nextPersonSequence: state.governance.nextPersonSequence + 1 });
}

export function setControlledPerson(state: SimulationState, id?: string): SimulationState {
  if (id) requirePerson(state, id);
  const controlledId = state.governance.player.controlledPersonId;
  if (id !== controlledId && Object.values(state.governance.successions ?? {}).some(succession =>
    succession.playerHandoff?.status === 'pending' && succession.playerHandoff.previousPersonId === controlledId)) throw new Error('Resolve the pending leadership handoff before changing player control.');
  return cloneGovernance(state, { ...state.governance, player: { controlledPersonId: id } });
}

export function setPartyMembership(state: SimulationState, personIdValue: string, partyId?: string): SimulationState {
  const person = requirePerson(state, personIdValue);
  if (person.isPartyLeader && partyId !== person.partyId) throw new Error('Replace a party leader through the leadership succession command before changing membership.');
  if (partyId !== person.partyId && Object.values(state.governance.successions ?? {}).some(succession =>
    succession.previousPersonId === person.id || succession.newPersonId === person.id)) throw new Error('Party membership referenced by leadership succession history cannot be changed.');
  if (partyId && politicalRegistry.parties[partyId]?.countryId !== person.countryId) throw new Error('Party membership must reference a party in the person\'s Country.');
  const changed = { ...person, partyId, isPartyLeader: partyId ? person.isPartyLeader : false };
  return cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [person.id]: changed } });
}

export function setPartyLeadership(state: SimulationState, personIdValue: string, isLeader: boolean): SimulationState {
  const person = requirePerson(state, personIdValue);
  if (isLeader && !person.partyId) throw new Error('A party leader must belong to a party.');
  if (isLeader && person.partyId) return replacePartyLeader(state, person.partyId, person.id);
  if (!isLeader && person.isPartyLeader && person.partyId) return replacePartyLeader(state, person.partyId);
  return cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [person.id]: { ...person, isPartyLeader: isLeader } } });
}

/** Replaces one party leader without deleting the former leader or changing player control. */
export function replacePartyLeader(state: SimulationState, partyId: string, successorPersonId?: string): SimulationState {
  const party = politicalRegistry.parties[partyId];
  if (!party) throw new Error(`Unknown political party: ${partyId}`);
  requireCountry(state, party.countryId);
  if (Object.values(state.governance.successions ?? {}).some(succession =>
    succession.partyId === partyId && succession.playerHandoff?.status === 'pending')) throw new Error('Resolve the pending player handoff before another succession for this party.');
  const leaders = Object.values(state.governance.persons).filter(person => person.partyId === partyId && person.isPartyLeader && person.status === 'active');
  if (leaders.length !== 1) throw new Error(`Party ${partyId} must have exactly one active leader before succession.`);
  const previous = leaders[0];
  const successionRecordId = successionId(state.governance.nextSuccessionSequence);
  let next = state, successor;
  let selection: LeadershipSuccession['selection'];
  let contextEvidence: LeadershipSuccession['contextEvidence'];
  if (successorPersonId) {
    successor = requirePerson(state, successorPersonId);
    if (successor.id === previous.id || successor.partyId !== partyId || successor.countryId !== party.countryId || successor.status !== 'active') throw new Error('An existing successor must be a different active member of the same party and Country.');
    selection = 'existing_party_member';
  } else {
    const id = personId(state.governance.nextPersonSequence);
    if (state.governance.persons[id]) throw new Error(`Political person sequence is already in use: ${id}.`);
    const usedNames = new Set(Object.values(state.governance.persons).map(person => person.displayName));
    contextEvidence = buildLeadershipSuccessionEvidence(state, partyId, successionRecordId, politicalRegistry);
    successor = {
      id,
      displayName: fictionalLeaderName(state, partyId, `succession:${state.governance.nextSuccessionSequence}`, usedNames, party.countryId),
      countryId: party.countryId,
      createdOn: state.date,
      partyId,
      isPartyLeader: false,
      status: 'active' as const,
      leaderProfile: leadershipProfileFromEvidence(party, contextEvidence),
      leaderProvenance: {
        basis: 'modelled_fallback' as const,
        method: 'internal_party_balance_succession_v3' as const,
        sourcePartyId: party.sourceBasis.sourcePartyId,
        referenceDate: state.date,
        sourceLeaderStatus: 'unavailable' as const,
        limitation: 'Fictional post-replacement leader generated from the party platform and modelled internal/supporter/power-balance context. No real successor identity or personal ideology is asserted.',
      },
    };
    next = cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [id]: successor }, nextPersonSequence: state.governance.nextPersonSequence + 1 });
    selection = 'modelled_internal_balance';
  }
  const currentGovernance = next.governance;
  const successorPerson = {
    ...successor,
    isPartyLeader: true,
    leaderProfile: successor.leaderProfile ?? leaderProfileFor(partyId, successor.id, state, true),
    leaderProvenance: successor.leaderProvenance ?? leaderProvenance(partyId, 'bounded_party_platform_succession_v2', politicalRegistry, null),
  };
  const previousPerson = { ...currentGovernance.persons[previous.id], isPartyLeader: false };
  const id = successionRecordId;
  const succession: LeadershipSuccession = {
    id, partyId, countryId: party.countryId, previousPersonId: previous.id, newPersonId: successor.id,
    effectiveDate: state.date, selection,
    ...(contextEvidence ? { contextEvidence } : {}),
    playerHandoff: state.governance.player.controlledPersonId === previous.id
      ? { status: 'pending', previousPersonId: previous.id, successorPersonId: successor.id }
      : undefined,
  };
  return cloneGovernance(next, {
    ...currentGovernance,
    persons: { ...currentGovernance.persons, [previous.id]: previousPerson, [successor.id]: successorPerson },
    successions: { ...currentGovernance.successions, [id]: succession },
    successionOrder: [...currentGovernance.successionOrder, id],
    nextSuccessionSequence: currentGovernance.nextSuccessionSequence + 1,
  });
}

export function resolvePlayerHandoff(state: SimulationState, successionIdValue: string, choice: 'continue' | 'switch'): SimulationState {
  const succession = state.governance.successions[successionIdValue];
  if (!succession?.playerHandoff || succession.playerHandoff.status !== 'pending') throw new Error('This leadership succession has no pending player handoff.');
  if (state.governance.player.controlledPersonId !== succession.playerHandoff.previousPersonId) throw new Error('Player control changed before the handoff was resolved.');
  const playerHandoff: NonNullable<LeadershipSuccession['playerHandoff']> = {
    ...succession.playerHandoff,
    status: choice === 'continue' ? 'continued' : 'switched',
    decidedOn: state.date,
  };
  return {
    ...state,
    governance: {
      ...state.governance,
      player: { controlledPersonId: choice === 'switch' ? succession.playerHandoff.successorPersonId : state.governance.player.controlledPersonId },
      successions: { ...state.governance.successions, [succession.id]: { ...succession, playerHandoff } },
    },
  };
}

/** Gives every registered gameplay party one deterministic fictional leader. */
export function initializePartyLeaders(state: SimulationState, registry: PoliticalRegistry = politicalRegistry): SimulationState {
  let next = { ...state, governance: initializeGovernance(state) };
  const orderedParties = Object.values(registry.parties)
    .filter(party => Boolean(next.engine.fidelityByCountry[party.countryId]))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const party of orderedParties) {
    const leaders = Object.values(next.governance.persons).filter(person => person.partyId === party.id && person.isPartyLeader && person.status === 'active');
    if (leaders.length > 1) throw new Error(`Party ${party.id} has multiple active leaders.`);
    if (leaders.length === 1) {
      const existing = leaders[0];
      if (existing.leaderProfile && existing.leaderProvenance) continue;
      next = cloneGovernance(next, { ...next.governance, persons: { ...next.governance.persons, [existing.id]: {
        ...existing,
        leaderProfile: existing.leaderProfile ?? leaderProfileFor(party.id, existing.id, next, false, registry),
        leaderProvenance: existing.leaderProvenance ?? leaderProvenance(party.id, 'party_platform_initial_v2', registry, null),
      } } });
      continue;
    }
    const id = personId(next.governance.nextPersonSequence);
    if (next.governance.persons[id]) throw new Error(`Political person sequence is already in use: ${id}.`);
    const usedNames = new Set(Object.values(next.governance.persons).map(person => person.displayName));
    const mapping = next.date === registry.referenceDate ? reviewedLeaderMappings.get(party.id) : undefined;
    const provenance = leaderProvenance(party.id, 'party_platform_initial_v2', registry, mapping ?? null);
    const displayName = mapping && provenance.basis !== 'modelled_fallback'
      ? mapping.fictionalAnalogueName
      : fictionalLeaderName(next, party.id, 'initial', usedNames, party.countryId);
    if (usedNames.has(displayName)) throw new Error(`Initial party leader analogue name is not unique: ${displayName}.`);
    const leader = {
      id,
      displayName,
      countryId: party.countryId,
      createdOn: next.date,
      partyId: party.id,
      isPartyLeader: true,
      status: 'active' as const,
      leaderProfile: leaderProfileFor(party.id, id, next, false, registry),
      leaderProvenance: provenance,
    };
    next = cloneGovernance(next, { ...next.governance, persons: { ...next.governance.persons, [id]: leader }, nextPersonSequence: next.governance.nextPersonSequence + 1 });
  }
  if (!next.governance.leadersInitializedOn && orderedParties.length > 0) {
    next = { ...next, governance: { ...next.governance, leadersInitializedOn: next.date } };
  }
  return initializeSourceOfficeholders(next, registry);
}

export function assignPoliticalOffice(state: SimulationState, personIdValue: string, input: { role: PoliticalOfficeRole; countryId: string; appointedOn?: string; capabilities?: AuthorityCapability[] }): SimulationState {
  const person = requirePerson(state, personIdValue); requireCountry(state, input.countryId);
  if (person.status !== 'active') throw new Error('Only an active person may receive a political office.');
  const appointedOn = input.appointedOn ?? state.date;
  if (person.countryId !== input.countryId || !dateValid(appointedOn) || appointedOn > state.date || !state.governance.initializedOn || appointedOn < state.governance.initializedOn || appointedOn < person.createdOn) throw new Error('Office scope or appointment date is invalid.');
  const capabilities = [...new Set(input.capabilities ?? capabilitiesFor(input.role))].sort();
  if (capabilities.some(item => !AUTHORITY_CAPABILITIES.includes(item))) throw new Error('Unknown authority capability.');
  const title = input.role === 'head_of_government' ? 'Head of Government' : input.role === 'head_of_state' ? 'Head of State' : 'Legislator';
  const office = { role: input.role, countryId: input.countryId, title, appointedOn, authorityProfile: { status: 'modelled_constitutional_abstraction' as const, capabilities, limitation: authorityLimitation } };
  return cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [person.id]: { ...person, office } } });
}

export function revokePoliticalOffice(state: SimulationState, personIdValue: string): SimulationState {
  const person = requirePerson(state, personIdValue); const { office: _office, ...withoutOffice } = person;
  return cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [person.id]: withoutOffice } });
}

function validatePayload(state: SimulationState, countryId: string, effectiveDate: string, payload: FiscalProposalPayload) {
  validateFiscalReform(state, { countryId, effectiveDate, ...payload });
}

/** Typed dispatch: the authority capabilities required to submit a proposal of this kind. */
function proposalSubmitCapabilities(proposal: PoliticalProposal): AuthorityCapability[] {
  switch (proposal.kind) {
    case 'fiscal_reform': {
      const capabilities: AuthorityCapability[] = ['sponsor_legislation'];
      if (proposal.payload.policy) capabilities.push('sponsor_fiscal_reform');
      if (proposal.payload.annualBudget) capabilities.push('sponsor_budget_reform');
      return capabilities;
    }
    case 'constitutional_amendment': return ['sponsor_legislation'];
  }
}

/** Typed dispatch: the effect a proposal of this kind records once adopted. */
function proposalEffectsFor(proposal: PoliticalProposal, enactment: { fiscalReformSequence?: number; reformFingerprint?: string; protectedMaterialKeys?: string[]; unprotectedMaterialKeys?: string[] }): ProposalEffect[] {
  switch (proposal.kind) {
    case 'fiscal_reform': return [{ category: 'fiscal_reform', fiscalReformSequence: enactment.fiscalReformSequence!, reformFingerprint: enactment.reformFingerprint! }];
    case 'constitutional_amendment': return [{ category: 'constitutional_amendment', disposition: proposal.constitutionalDisposition ?? 'secondary', protectedMaterialKeys: enactment.protectedMaterialKeys ?? [], unprotectedMaterialKeys: enactment.unprotectedMaterialKeys ?? [] }];
  }
}

/** Typed dispatch: enact the adopted proposal through its owning subsystem exactly once. */
function proposalEnactFor(state: SimulationState, proposal: PoliticalProposal): { next: SimulationState; fiscalReformSequence?: number; reformFingerprint?: string; protectedMaterialKeys?: string[]; unprotectedMaterialKeys?: string[] } {
  switch (proposal.kind) {
    case 'fiscal_reform': {
      const fiscalReformSequence = state.fiscal.nextSequence;
      const reformInput = { countryId: proposal.countryId, effectiveDate: proposal.effectiveDate, ...structuredClone(proposal.payload), origin: { type: 'governance_proposal' as const, proposalId: proposal.id, proposalFingerprint: proposal.submittedPayloadFingerprint! } };
      const reformFingerprint = fiscalReformFingerprint(reformInput);
      return { next: scheduleFiscalReform(state, reformInput), fiscalReformSequence, reformFingerprint };
    }
    case 'constitutional_amendment': {
      const next = scheduleConstitutionalAmendment(state, { id: proposal.id, countryId: proposal.countryId, effectiveDate: proposal.effectiveDate, payload: proposal.payload });
      return { next, protectedMaterialKeys: proposal.payload.materialKeysToProtect ?? [], unprotectedMaterialKeys: proposal.payload.materialKeysToUnprotect ?? [] };
    }
  }
}

/** Propose a constitutional amendment (principal or secondary disposition). Requires legislation authority. */
export function createConstitutionalAmendmentProposal(state: SimulationState, input: { proposerPersonId: string; countryId: string; effectiveDate: string; payload: ConstitutionalAmendmentPayload }): SimulationState {
  const proposer = requirePerson(state, input.proposerPersonId); requireCountry(state, input.countryId);
  if (proposer.countryId !== input.countryId) throw new Error('Proposal Country does not match proposer scope.');
  // Automatic principal/secondary classification: a rights or structural change is principal; a
  // material-key protection/removal is secondary. The disposition is derived, never freely chosen.
  const disposition: ConstitutionalDisposition = input.payload.rightsChanges || input.payload.parliamentChanges || input.payload.executiveChanges || input.payload.electionChanges || input.payload.judicialChanges || input.payload.territoryChanges ? 'principal' : 'secondary';
  const id = proposalId(state.governance.nextProposalSequence);
  const proposal: PoliticalProposal = { id, countryId: input.countryId, proposerPersonId: proposer.id, createdOn: state.date, kind: 'constitutional_amendment', instrumentClass: 'constitutional_amendment', constitutionalDisposition: disposition, payload: structuredClone(input.payload), status: 'draft', effectiveDate: input.effectiveDate, effects: [] };
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [id]: proposal }, proposalOrder: [...state.governance.proposalOrder, id], nextProposalSequence: state.governance.nextProposalSequence + 1 });
}

export function createFiscalProposal(state: SimulationState, input: { proposerPersonId: string; countryId: string; effectiveDate: string; payload: FiscalProposalPayload }): SimulationState {
  const proposer = requirePerson(state, input.proposerPersonId); requireCountry(state, input.countryId);
  if (proposer.countryId !== input.countryId) throw new Error('Proposal Country does not match proposer scope.');
  validatePayload(state, input.countryId, input.effectiveDate, input.payload);
  const id = proposalId(state.governance.nextProposalSequence);
  const proposal: PoliticalProposal = { id, countryId: input.countryId, proposerPersonId: proposer.id, createdOn: state.date, kind: 'fiscal_reform', instrumentClass: proposalContract('fiscal_reform').defaultInstrumentClass, payload: structuredClone(input.payload), status: 'draft', effectiveDate: input.effectiveDate, effects: [] };
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [id]: proposal }, proposalOrder: [...state.governance.proposalOrder, id], nextProposalSequence: state.governance.nextProposalSequence + 1 });
}

export function replaceDraftProposal(state: SimulationState, proposalIdValue: string, input: { effectiveDate?: string; payload?: FiscalProposalPayload }): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal) throw new Error('Unknown political proposal.');
  if (proposal.status !== 'draft') throw new Error('Submitted proposal content is immutable.');
  const effectiveDate = input.effectiveDate ?? proposal.effectiveDate, payload = input.payload ?? proposal.payload;
  if (proposal.kind === 'fiscal_reform') validatePayload(state, proposal.countryId, effectiveDate, payload as FiscalProposalPayload);
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, effectiveDate, payload: structuredClone(payload) } as PoliticalProposal } });
}

const hasCapability = (proposal: PoliticalProposal, person: ReturnType<typeof requirePerson>, capability: AuthorityCapability) => person.status === 'active' && person.office?.countryId === proposal.countryId && person.office.authorityProfile.capabilities.includes(capability);

export function hasPoliticalAuthority(state: SimulationState, personIdValue: string, countryId: string, capability: AuthorityCapability): boolean {
  const person = state.governance.persons[personIdValue];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && person.office.authorityProfile.capabilities.includes(capability));
}
export function submitProposalForActor(state: SimulationState, proposalIdValue: string, actorPersonId: string): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || proposal.status !== 'draft') throw new Error('Only a draft proposal can be submitted.');
  const actor = requirePerson(state, actorPersonId);
  // Locked gameplay rule: only the true proposer presents the bill; another authorized person
  // may suggest ideas but does not submit another proposer's draft. AI acts through its own leader.
  if (actor.id !== proposal.proposerPersonId) throw new Error('Only the proposal\'s proposer may submit this draft.');
  if (proposalSubmitCapabilities(proposal).some(capability => !hasCapability(proposal, actor, capability))) throw new Error('Actor lacks authority to submit this reform.');
  if (proposal.kind === 'fiscal_reform') validatePayload(state, proposal.countryId, proposal.effectiveDate, proposal.payload);
  const frozen = structuredClone(proposal); frozen.status = 'submitted'; frozen.submittedOn = state.date; frozen.submittedPayloadFingerprint = governanceFingerprint({ effectiveDate: frozen.effectiveDate, payload: frozen.payload });
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: frozen } });
}

export function submitProposal(state: SimulationState, proposalIdValue: string): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || proposal.status !== 'draft') throw new Error('Only a draft proposal can be submitted.');
  requireControlled(state, proposal.proposerPersonId);
  return submitProposalForActor(state, proposalIdValue, proposal.proposerPersonId);
}

/** Withdrawal is a proposer's procedural right, not an exercise of current office power:
 *  only the proposal's original proposer may withdraw it, and no capability is re-checked.
 *  The player wrapper additionally requires the controlled person. */
export function withdrawProposalForActor(state: SimulationState, proposalIdValue: string, actorPersonId: string): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || !['draft', 'submitted'].includes(proposal.status)) throw new Error('Proposal cannot be withdrawn.');
  const actor = requirePerson(state, actorPersonId);
  if (actor.id !== proposal.proposerPersonId) throw new Error('Only the proposer can withdraw this proposal.');
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, status: 'withdrawn', resolvedOn: state.date } } });
}

export function withdrawProposal(state: SimulationState, proposalIdValue: string): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || !['draft', 'submitted'].includes(proposal.status)) throw new Error('Proposal cannot be withdrawn.');
  requireControlled(state, proposal.proposerPersonId);
  return withdrawProposalForActor(state, proposalIdValue, proposal.proposerPersonId);
}

export function inspectProposalSupport(state: SimulationState, proposalIdValue: string, registry: PoliticalRegistry = politicalRegistry, profiles: Record<string, PartyGoalProfile | undefined> = {}) {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal) throw new Error('Unknown political proposal.');
  const analysis = analyzeProposal(state, proposal); return structuredClone({ analysis, impact: classifyProposalImpact(state, proposal, analysis), publicEstimate: estimatePublicSupport(state, proposal, analysis), parliamentaryEstimate: estimateParliamentarySupport(state, proposal, registry, profiles, analysis), informationStatus: 'engine_debug_reality' as const });
}

export function resolveProposalVoteForActor(state: SimulationState, proposalIdValue: string, actorPersonId: string, registry: PoliticalRegistry = politicalRegistry, profiles: Record<string, PartyGoalProfile | undefined> = {}): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || proposal.status !== 'submitted') throw new Error('Only an unresolved submitted proposal can be voted.');
  const actor = requirePerson(state, actorPersonId);
  if (!hasCapability(proposal, actor, 'vote_legislation')) throw new Error('Actor lacks authority to resolve this legislative vote.');
  const analysis = analyzeProposal(state, proposal), publicEstimate = estimatePublicSupport(state, proposal, analysis), parliamentaryEstimate = estimateParliamentarySupport(state, proposal, registry, profiles, analysis), expired = state.date > proposal.effectiveDate;
  const parliamentPower = state.constitution.countries[proposal.countryId]?.parliament.power;
  const legislativeInstrument = proposal.instrumentClass !== 'administrative_action';
  let powerBlockedReason: 'parliament_has_no_legislative_power' | 'parliamentary_opinion_non_binding' | undefined;
  if (legislativeInstrument) {
    if (parliamentPower === 'none') powerBlockedReason = 'parliament_has_no_legislative_power';
    else if (parliamentPower === 'consultative') powerBlockedReason = 'parliamentary_opinion_non_binding';
  }
  // weak_legislative requires a 2/3 supermajority; below that the executive's position is not overridden.
  const weakLegislativeOverride = parliamentPower === 'weak_legislative' && parliamentaryEstimate.totalSeats > 0 && parliamentaryEstimate.yesSeats * 3 >= parliamentaryEstimate.totalSeats * 2;
  const parliamentAdopts = parliamentaryEstimate.chambers.every(item => item.adopted) && (parliamentPower !== 'weak_legislative' || weakLegislativeOverride);
  const outcome = expired || powerBlockedReason !== undefined || parliamentaryEstimate.coverage !== 'complete' ? 'unavailable' : parliamentAdopts ? 'adopted' : 'rejected';
  const reason = expired ? 'effective_date_expired' as const : powerBlockedReason ?? (parliamentaryEstimate.coverage !== 'complete' ? 'institutional_data_unavailable' as const : undefined);
  const protectedViolation = outcome === 'adopted' && proposal.kind === 'fiscal_reform' ? rejectProtectedModification(state, proposal.countryId, proposal.instrumentClass, proposal.payload) : undefined;
  let amendmentReason: 'constitutional_threshold' | 'referendum_failed' | 'constitutional_procedure_unavailable' | undefined;
  if (proposal.kind === 'constitutional_amendment' && outcome === 'adopted') {
    const amendment = state.constitution.countries[proposal.countryId]?.amendment;
    if (!amendment || amendment.parliamentaryThresholdBps === undefined || amendment.referendum === 'unavailable') amendmentReason = 'constitutional_procedure_unavailable';
    else {
      if (parliamentaryEstimate.totalSeats > 0 && parliamentaryEstimate.yesSeats * 10000 < amendment.parliamentaryThresholdBps * parliamentaryEstimate.totalSeats) amendmentReason = 'constitutional_threshold';
      if (!amendmentReason) {
        const referendumRequired = amendment.referendum === 'always' || (amendment.referendum === 'principal_only' && proposal.constitutionalDisposition === 'principal');
        if (referendumRequired && publicEstimate.supportBps <= publicEstimate.opposeBps) amendmentReason = 'referendum_failed';
      }
    }
  }
  const blocked = Boolean(protectedViolation || amendmentReason);
  const effectiveParliamentaryEstimate = blocked ? { ...parliamentaryEstimate, chambers: parliamentaryEstimate.chambers.map(chamber => ({ ...chamber, adopted: false as const })) } : parliamentaryEstimate;
  const effectiveOutcome = blocked ? 'rejected' : outcome;
  const effectiveReason = amendmentReason ?? (protectedViolation ? 'constitutionally_protected' as const : reason);
  const voteResult: LegislativeVoteResult = { ...effectiveParliamentaryEstimate, outcome: effectiveOutcome, resolvedOn: state.date, reason: effectiveReason };
  let next = state, scheduledFiscalReformSequence: number | undefined, enactmentReference: PoliticalProposal['enactmentReference'], protectedMaterialKeys: string[] | undefined, unprotectedMaterialKeys: string[] | undefined;
  if (effectiveOutcome === 'adopted') {
    const enacted = proposalEnactFor(state, proposal); next = enacted.next; scheduledFiscalReformSequence = enacted.fiscalReformSequence; protectedMaterialKeys = enacted.protectedMaterialKeys; unprotectedMaterialKeys = enacted.unprotectedMaterialKeys;
    enactmentReference = enacted.fiscalReformSequence !== undefined && enacted.reformFingerprint !== undefined ? { fiscalReformSequence: enacted.fiscalReformSequence, reformFingerprint: enacted.reformFingerprint } : undefined;
  }
  const resolved = { ...proposal, status: effectiveOutcome === 'adopted' ? 'enacted' as const : effectiveOutcome, resolvedOn: state.date, analysis, evaluationVersion: 'situational-plurality-0.15-v2', publicEstimate, parliamentaryEstimate: effectiveParliamentaryEstimate, voteResult, scheduledFiscalReformSequence, enactmentReference, effects: effectiveOutcome === 'adopted' ? proposalEffectsFor(proposal, { fiscalReformSequence: scheduledFiscalReformSequence, reformFingerprint: enactmentReference?.reformFingerprint, protectedMaterialKeys, unprotectedMaterialKeys }) : [] } as PoliticalProposal;
  next = { ...next, governance: { ...next.governance, proposals: { ...next.governance.proposals, [proposal.id]: resolved } } };
  return addProposalResultBriefing(next, resolved);
}

export function resolveProposalVote(state: SimulationState, proposalIdValue: string, registry: PoliticalRegistry = politicalRegistry, profiles: Record<string, PartyGoalProfile | undefined> = {}): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || proposal.status !== 'submitted') throw new Error('Only an unresolved submitted proposal can be voted.');
  requireControlled(state, proposal.proposerPersonId);
  return resolveProposalVoteForActor(state, proposalIdValue, proposal.proposerPersonId, registry, profiles);
}

export const inspectGovernance = (state: SimulationState) => structuredClone(state.governance);
export const inspectPlayer = (state: SimulationState) => structuredClone(state.governance.player.controlledPersonId ? state.governance.persons[state.governance.player.controlledPersonId] : undefined);
export const inspectProposal = (state: SimulationState, id: string) => structuredClone(state.governance.proposals[id]);

const isHeadOfGovernment = (state: SimulationState, personId: string, countryId: string): boolean => {
  const person = state.governance.persons[personId];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && person.office.role === 'head_of_government');
};

const cabinetFor = (state: SimulationState, countryId: string): GovernmentCabinet => state.governance.cabinets[countryId] ?? { countryId, portfolios: {} };

/** Appoint a minister to a portfolio. Requires the head-of-government office. */
export function appointMinister(state: SimulationState, countryId: string, actorPersonId: string, ministerPersonId: string, portfolioId: string, portfolioName: string): SimulationState {
  if (!isHeadOfGovernment(state, actorPersonId, countryId)) throw new Error('Only the head of government may appoint ministers.');
  const minister = state.governance.persons[ministerPersonId];
  if (!minister || minister.countryId !== countryId) throw new Error('Minister is not a person of this Country.');
  if (minister.office?.role === 'minister' && minister.office.countryId === countryId) throw new Error('This person already holds a ministerial office.');
  const cabinet = cabinetFor(state, countryId);
  if (Object.values(cabinet.portfolios).some(p => p.ministerPersonId === ministerPersonId)) throw new Error('This person already holds a portfolio.');
  const portfolio: Portfolio = { id: portfolioId, name: portfolioName, ministerPersonId };
  const office = { role: 'minister' as const, countryId, title: portfolioName, appointedOn: state.date, authorityProfile: minister.office?.authorityProfile ?? { status: 'modelled_constitutional_abstraction' as const, capabilities: [], limitation: 'Derived from constitutional office.' } };
  return { ...state, governance: { ...state.governance, persons: { ...state.governance.persons, [ministerPersonId]: { ...minister, office } }, cabinets: { ...state.governance.cabinets, [countryId]: { ...cabinet, portfolios: { ...cabinet.portfolios, [portfolioId]: portfolio } } } } };
}

/** Remove a minister from office and clear their ministerial portfolio. */
export function removeMinister(state: SimulationState, countryId: string, actorPersonId: string, ministerPersonId: string): SimulationState {
  if (!isHeadOfGovernment(state, actorPersonId, countryId)) throw new Error('Only the head of government may remove ministers.');
  const cabinet = cabinetFor(state, countryId);
  const portfolios: Record<string, Portfolio> = {};
  for (const [id, portfolio] of Object.entries(cabinet.portfolios)) portfolios[id] = portfolio.ministerPersonId === ministerPersonId ? { ...portfolio, ministerPersonId: undefined } : portfolio;
  const minister = state.governance.persons[ministerPersonId];
  const persons = minister && minister.office?.role === 'minister' ? { ...state.governance.persons, [ministerPersonId]: { ...minister, office: undefined } } : state.governance.persons;
  return { ...state, governance: { ...state.governance, persons, cabinets: { ...state.governance.cabinets, [countryId]: { ...cabinet, portfolios } } } };
}

/** Appoint the deputy head of government. */
export function appointViceLeader(state: SimulationState, countryId: string, actorPersonId: string, vicePersonId: string): SimulationState {
  if (!isHeadOfGovernment(state, actorPersonId, countryId)) throw new Error('Only the head of government may appoint a deputy.');
  const vice = state.governance.persons[vicePersonId];
  if (!vice || vice.countryId !== countryId) throw new Error('Deputy is not a person of this Country.');
  const cabinet = cabinetFor(state, countryId);
  return { ...state, governance: { ...state.governance, cabinets: { ...state.governance.cabinets, [countryId]: { ...cabinet, viceLeaderPersonId: vicePersonId } } } };
}

/** Monthly succession: when the head of government is inactive, the deputy takes over according to
 *  the constitution's vacancy-succession rule. */
export function runGovernmentSuccession(state: SimulationState): SimulationState {
  let next = state;
  for (const [countryId, cabinet] of Object.entries(state.governance.cabinets ?? {})) {
    if (!cabinet.viceLeaderPersonId) continue;
    const head = Object.values(state.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
    if (head) continue;
    const vacancy = state.constitution.countries[countryId]?.government.vacancySuccession ?? 'unavailable';
    if (vacancy === 'unavailable') continue;
    const vice = state.governance.persons[cabinet.viceLeaderPersonId];
    if (!vice || vice.status !== 'active') continue;
    // Temporary succession keeps the deputy as an acting head; permanent succession is a full transfer.
    const title = vacancy === 'deputy_permanent' ? 'Head of government' : 'Head of government (acting)';
    const office = { role: 'head_of_government' as const, countryId, title, appointedOn: state.date, authorityProfile: vice.office?.authorityProfile ?? { status: 'modelled_constitutional_abstraction' as const, capabilities: [], limitation: 'Derived from constitutional succession.' } };
    next = { ...next, governance: { ...next.governance, persons: { ...next.governance.persons, [vice.id]: { ...vice, office } } } };
  }
  return next;
}

export const registerGovernmentTasks = (scheduler: import('../scheduler').SimulationScheduler) => scheduler.register({ id: 'government.monthly', cadence: 'monthly', priority: 450, run: runGovernmentSuccession });
