import type { SimulationState } from '../../types';
import { fiscalReformFingerprint, scheduleFiscalReform, validateFiscalReform } from '../fiscal/runtime';
import { dateValid } from '../fiscal/math';
import { POLITICAL_ISSUES, type OrganizationMembership, type PoliticalRegistry } from '../politics/model';
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
import { analyzeProposal, dynamicPartyGoalProfile, materialContextForProposal } from './analysis';
import { applyPartyInstitutionalInterest, evaluatePartyInstitutionalInterest } from './institutionalInterest';
import { allocatePartySeats, partyVoteDistributionFromAgreement } from './internalPartyDistribution';
import { buildLeadershipSuccessionEvidence, leadershipProfileFromEvidence } from './leadershipSuccession';
import { classifyProposalImpact, estimateParliamentarySupport, estimatePublicSupport } from './estimates';
import { AUTHORITY_CAPABILITIES, emptyGovernance, governanceFingerprint, proposalContract, type AuthorityCapability, type ConstitutionalAmendmentPayload, type ConstitutionalDisposition, type CoveredMetric, type FiscalProposalPayload, type GovernanceGoal, type GovernanceState, type GovernmentCabinet, type InstitutionalPowerTransfer, type LeadershipSuccession, type LegislativeVoteResult, type ParliamentarySupportEstimate, type PartyGoalProfile, type PartyProposalEvaluation, type PoliticalOfficeRole, type PoliticalPersonState, type PoliticalProposal, type Portfolio, type ProposalAnalysis, type ProposalEffect, type ProposalImpact, type ProposalKind, type ProposalMaterialContext, type ProposalPayload, type ProposalPayloadByKind, type PublicSupportEstimate } from './model';
import { rejectProtectedModification, scheduleConstitutionalAmendment } from '../constitution/runtime';
import { MATERIAL_KEYS } from '../constitution/model';
export { classifyProposalImpact, estimateParliamentarySupport, estimatePublicSupport } from './estimates';
const personId = (sequence: number) => `person.${sequence.toString().padStart(8, '0')}`;
const proposalId = (sequence: number) => `proposal.${sequence.toString().padStart(8, '0')}`;
const successionId = (sequence: number) => `succession.${sequence.toString().padStart(8, '0')}`;
const cloneGovernance = (state: SimulationState, governance: GovernanceState): SimulationState => ({ ...state, governance });
const requireCountry = (state: SimulationState, countryId: string) => { if (!state.engine.fidelityByCountry[countryId]) throw new Error(`Unknown Country: ${countryId}`); };
const requirePerson = (state: SimulationState, id: string) => { const person = state.governance.persons[id]; if (!person) throw new Error(`Unknown political person: ${id}`); return person; };
const requireControlled = (state: SimulationState, id: string) => { if (state.governance.player.controlledPersonId !== id) throw new Error('The proposer is not the controlled person.'); return requirePerson(state, id); };
/** Role-derived capabilities: the generic modelled constitutional abstraction. Authority is never
 *  granted automatically by role alone: a head of state receives no legislative initiative or vote,
 *  and a legislator sponsors nothing — only the authorized government leader (head of government)
 *  carries the legislative initiative. Ministers have no legislative powers at all; they suggest. */
const capabilitiesFor = (role: PoliticalOfficeRole): AuthorityCapability[] => role === 'head_of_government'
  ? ['sponsor_legislation', 'sponsor_fiscal_reform', 'sponsor_budget_reform', 'vote_legislation', 'access_government_information', 'command_military_operations']
  : role === 'head_of_state' ? ['access_government_information', 'command_military_operations']
  : role === 'legislator' ? ['vote_legislation'] : [];
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
  return state.governance?.initializedOn ? state.governance : { ...(state.governance ?? emptyGovernance()), initializedOn: state.date };
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
  if (partyId) {
    const countryId = partyCountryId(state, partyId);
    if (countryId === undefined) throw new Error('Party membership must reference a known party (registry or dynamically registered).');
    if (countryId !== person.countryId) throw new Error('Party membership must reference a party in the person\'s Country.');
  }
  const changed = { ...person, partyId, isPartyLeader: partyId ? person.isPartyLeader : false };
  let next = cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [person.id]: changed } });
  if (person.partyId && person.partyId !== partyId) next = syncPartyMembershipRecords(next, person.partyId);
  if (partyId) next = syncPartyMembershipRecords(next, partyId);
  return next;
}

/** The canonical party membership: PoliticalPersonState.partyId and the party organization's
 *  members (with the leadership role) are rebuilt from each other so they never tell two
 *  different memberships. Applies to registry and dynamic parties alike. */
export const syncPartyMembershipRecords = (state: SimulationState, partyId: string): SimulationState => {
  const organization = state.politics.organizations[partyId];
  if (!organization || organization.type !== 'party') return state;
  const members: Record<string, OrganizationMembership> = {};
  for (const person of Object.values(state.governance.persons)) {
    if (person.partyId !== partyId) continue;
    members[person.id] = { personId: person.id, role: person.isPartyLeader ? 'leader' : 'member', joinedOn: person.createdOn };
  }
  for (const [personId, existing] of Object.entries(organization.members)) {
    if (members[personId]) members[personId] = { ...members[personId], joinedOn: existing.joinedOn };
  }
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [partyId]: { ...organization, members } } } };
};

const partyCountryId = (state: SimulationState, partyId: string): string | undefined => {
  const registryParty = politicalRegistry.parties[partyId];
  if (registryParty) return registryParty.countryId;
  const organization = state.politics.organizations[partyId];
  return organization?.type === 'party' ? organization.countryId : undefined;
};

export function setPartyLeadership(state: SimulationState, personIdValue: string, isLeader: boolean): SimulationState {
  const person = requirePerson(state, personIdValue);
  if (isLeader && !person.partyId) throw new Error('A party leader must belong to a party.');
  if (isLeader && person.partyId) return replacePartyLeader(state, person.partyId, person.id);
  if (!isLeader && person.isPartyLeader && person.partyId) return replacePartyLeader(state, person.partyId);
  return cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [person.id]: { ...person, isPartyLeader: isLeader } } });
}

/** Replaces one party leader without deleting the former leader or changing player control.
 *  Registry and dynamic parties alike: a dynamic party has no sourced platform, so its successor's
 *  profile derives from the party's mutable organizational line. */
export function replacePartyLeader(state: SimulationState, partyId: string, successorPersonId?: string): SimulationState {
  const registryParty = politicalRegistry.parties[partyId];
  const dynamicOrganization = state.politics.organizations[partyId];
  if (!registryParty && !(dynamicOrganization?.type === 'party')) throw new Error(`Unknown political party: ${partyId}`);
  const partyCountryIdValue = registryParty?.countryId ?? dynamicOrganization?.countryId;
  if (!partyCountryIdValue) throw new Error(`Party ${partyId} has no Country.`);
  requireCountry(state, partyCountryIdValue);
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
    if (successor.id === previous.id || successor.partyId !== partyId || successor.countryId !== partyCountryIdValue || successor.status !== 'active') throw new Error('An existing successor must be a different active member of the same party and Country.');
    selection = 'existing_party_member';
  } else {
    const id = personId(state.governance.nextPersonSequence);
    if (state.governance.persons[id]) throw new Error(`Political person sequence is already in use: ${id}.`);
    const usedNames = new Set(Object.values(state.governance.persons).map(person => person.displayName));
    if (registryParty) {
      contextEvidence = buildLeadershipSuccessionEvidence(state, partyId, successionRecordId, politicalRegistry);
      successor = {
        id,
        displayName: fictionalLeaderName(state, partyId, `succession:${state.governance.nextSuccessionSequence}`, usedNames, partyCountryIdValue),
        countryId: partyCountryIdValue,
        createdOn: state.date,
        partyId,
        isPartyLeader: false,
        status: 'active' as const,
        leaderProfile: leadershipProfileFromEvidence(registryParty, contextEvidence),
        leaderProvenance: {
          basis: 'modelled_fallback' as const,
          method: 'internal_party_balance_succession_v3' as const,
          sourcePartyId: registryParty.sourceBasis.sourcePartyId,
          referenceDate: state.date,
          sourceLeaderStatus: 'unavailable' as const,
          limitation: 'Fictional post-replacement leader generated from the party platform and modelled internal/supporter/power-balance context. No real successor identity or personal ideology is asserted.',
        },
      };
    } else {
      successor = {
        id,
        displayName: fictionalLeaderName(state, partyId, `succession:${state.governance.nextSuccessionSequence}`, usedNames, partyCountryIdValue),
        countryId: partyCountryIdValue,
        createdOn: state.date,
        partyId,
        isPartyLeader: false,
        status: 'active' as const,
        leaderProfile: dynamicLeaderProfileFor(state, partyId, id),
        leaderProvenance: {
          basis: 'modelled_fallback' as const,
          method: 'party_platform_initial_v2' as const,
          sourcePartyId: partyId,
          referenceDate: state.date,
          sourceLeaderStatus: 'unavailable' as const,
          limitation: 'Dynamic party leader generated from the party\'s mutable organizational line; no sourced leadership evidence exists.',
        },
      };
    }
    next = cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [id]: successor }, nextPersonSequence: state.governance.nextPersonSequence + 1 });
    selection = 'modelled_internal_balance';
  }
  const currentGovernance = next.governance;
  const successorPerson = {
    ...successor,
    isPartyLeader: true,
    leaderProfile: successor.leaderProfile ?? (registryParty ? leaderProfileFor(partyId, successor.id, state, true) : dynamicLeaderProfileFor(state, partyId, successor.id)),
    leaderProvenance: successor.leaderProvenance ?? (registryParty
      ? leaderProvenance(partyId, 'bounded_party_platform_succession_v2', politicalRegistry, null)
      : { basis: 'modelled_fallback' as const, method: 'party_platform_initial_v2' as const, sourcePartyId: partyId, referenceDate: state.date, sourceLeaderStatus: 'unavailable' as const, limitation: 'Dynamic party leader; no sourced leadership evidence exists.' }),
  };
  const previousPerson = { ...currentGovernance.persons[previous.id], isPartyLeader: false };
  const id = successionRecordId;
  const succession: LeadershipSuccession = {
    id, partyId, countryId: partyCountryIdValue, previousPersonId: previous.id, newPersonId: successor.id,
    effectiveDate: state.date, selection,
    ...(contextEvidence ? { contextEvidence } : {}),
    playerHandoff: state.governance.player.controlledPersonId === previous.id
      ? { status: 'pending', previousPersonId: previous.id, successorPersonId: successor.id }
      : undefined,
  };
  let result = cloneGovernance(next, {
    ...currentGovernance,
    persons: { ...currentGovernance.persons, [previous.id]: previousPerson, [successor.id]: successorPerson },
    successions: { ...currentGovernance.successions, [id]: succession },
    successionOrder: [...currentGovernance.successionOrder, id],
    nextSuccessionSequence: currentGovernance.nextSuccessionSequence + 1,
  });
  // The leadership role is synchronized with the canonical party membership records.
  result = syncPartyMembershipRecords(result, partyId);
  return result;
}

/** A dynamic party leader's modelled profile from the party's mutable organizational line. */
const dynamicLeaderProfileFor = (state: SimulationState, partyId: string, _personIdValue: string): NonNullable<PoliticalPersonState['leaderProfile']> => {
  const organization = state.politics.organizations[partyId];
  return Object.fromEntries(POLITICAL_ISSUES.map(issue => [issue, {
    valueBps: organization?.currentPositions?.[issue] ?? 5_000,
    confidenceBps: 5_000,
    status: 'modelled' as const,
    limitation: 'Modelled from the dynamic party\'s organizational line; no sourced ideology is asserted.',
  }]));
};

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
  // The canonical party membership is one reality: every person's partyId/leadership is reflected
  // in the party organization's members, never two different memberships.
  for (const party of orderedParties) next = syncPartyMembershipRecords(next, party.id);
  return initializeSourceOfficeholders(next, registry);
}

export function assignPoliticalOffice(state: SimulationState, personIdValue: string, input: { role: PoliticalOfficeRole; countryId: string; appointedOn?: string; capabilities?: AuthorityCapability[] }): SimulationState {
  const person = requirePerson(state, personIdValue); requireCountry(state, input.countryId);
  if (person.status !== 'active') throw new Error('Only an active person may receive a political office.');
  if (input.role === 'minister') throw new Error('A ministerial appointment goes through the canonical cabinet/portfolio (appointMinister), never through the generic office path.');
  if (person.office) throw new Error('This person already holds a political office; revoke it before assigning a new one. Offices are never silently overwritten.');
  const appointedOn = input.appointedOn ?? state.date;
  if (person.countryId !== input.countryId || !dateValid(appointedOn) || appointedOn > state.date || !state.governance.initializedOn || appointedOn < state.governance.initializedOn || appointedOn < person.createdOn) throw new Error('Office scope or appointment date is invalid.');
  // Capabilities are strictly framed by the role: no free injection beyond the role-derived set.
  const roleCapabilities = capabilitiesFor(input.role);
  if (input.capabilities !== undefined && input.capabilities.some(item => !roleCapabilities.includes(item))) throw new Error('Injected capabilities must be a subset of the role-derived authority.');
  const capabilities = [...new Set(input.capabilities ?? roleCapabilities)].sort();
  if (capabilities.some(item => !AUTHORITY_CAPABILITIES.includes(item))) throw new Error('Unknown authority capability.');
  const title = input.role === 'head_of_government' ? 'Head of Government' : input.role === 'head_of_state' ? 'Head of State' : 'Legislator';
  const office = { role: input.role, countryId: input.countryId, title, appointedOn, authorityProfile: { status: 'modelled_constitutional_abstraction' as const, capabilities, limitation: authorityLimitation } };
  const governance: GovernanceState = { ...state.governance, persons: { ...state.governance.persons, [person.id]: { ...person, office } } };
  if (input.role === 'head_of_government') {
    const cabinet = cabinetFor({ ...state, governance }, input.countryId);
    governance.cabinets = { ...governance.cabinets, [input.countryId]: { ...cabinet, lastHeadPersonId: person.id, actingHead: undefined } };
  }
  return cloneGovernance(state, governance);
}

/** Transfer a person into a political office: any office they currently hold is revoked first
 *  (a minister's portfolio reference is cleared), so a person is never simultaneously a portfolio
 *  minister and the head of government, and no office is ever silently overwritten. */
export function transferPoliticalOffice(state: SimulationState, personIdValue: string, input: { role: PoliticalOfficeRole; countryId: string; appointedOn?: string; capabilities?: AuthorityCapability[] }): SimulationState {
  const person = requirePerson(state, personIdValue);
  let next = state;
  if (person.office) {
    if (person.office.role === 'minister') {
      const cabinets = { ...next.governance.cabinets };
      for (const [countryId, cabinet] of Object.entries(cabinets)) {
        if (!Object.values(cabinet.portfolios).some(portfolio => portfolio.ministerPersonId === personIdValue)) continue;
        cabinets[countryId] = { ...cabinet, portfolios: Object.fromEntries(Object.entries(cabinet.portfolios).map(([portfolioId, portfolio]) => [portfolioId, portfolio.ministerPersonId === personIdValue ? { ...portfolio, ministerPersonId: undefined } : portfolio])) };
      }
      next = { ...next, governance: { ...next.governance, cabinets } };
    }
    next = revokePoliticalOffice(next, personIdValue);
  }
  return assignPoliticalOffice(next, personIdValue, input);
}

export function revokePoliticalOffice(state: SimulationState, personIdValue: string): SimulationState {
  const person = requirePerson(state, personIdValue); const { office: _office, ...withoutOffice } = person;
  const governance: GovernanceState = { ...state.governance, persons: { ...state.governance.persons, [person.id]: withoutOffice } };
  if (person.office?.role === 'head_of_government') {
    const cabinet = cabinetFor(state, person.office.countryId);
    governance.cabinets = { ...governance.cabinets, [person.office.countryId]: { ...cabinet, lastHeadPersonId: person.id } };
  }
  return cloneGovernance(state, governance);
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
    case 'constitutional_amendment': return ['sponsor_legislation', 'access_government_information'];
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

/** Validate a constitutional amendment payload: material keys must be canonical and it must change
 *  something. Every nested value is validated before adoption — enums, thresholds, durations, ages,
 *  terms, rights levels, judicial rules, electoral rules and territorial rules — so an invalid
 *  payload is rejected at the earliest step, never only at replacement. The locked
 *  vacancySuccession rule (temporary/permanent succession) is never amendable. */
const PARLIAMENT_POWERS = ['decisive', 'legislative_and_censure', 'legislative', 'weak_legislative', 'consultative', 'none', 'unavailable'] as const;
const HEAD_OF_STATE_SELECTIONS = ['popular_direct', 'popular_indirect', 'parliamentary', 'appointed', 'hereditary', 'other', 'unavailable'] as const;
const GOVERNMENT_APPOINTMENTS = ['elected_directly', 'chosen_by_parliament', 'appointed_by_head_of_state', 'unavailable'] as const;
const GOVERNMENT_RESPONSIBILITIES = ['none', 'government_censurable', 'leader_censurable', 'unavailable'] as const;
const SUFFRAGE_MODES = ['universal', 'restricted', 'unavailable'] as const;
const PARLIAMENTARY_SYSTEMS = ['majoritarian', 'proportional', 'mixed', 'unavailable'] as const;
const REFERENDUM_RULES = ['never', 'always', 'principal_only', 'unavailable'] as const;
const TERRITORIAL_ORGANIZATIONS = ['unitary', 'federal', 'unavailable'] as const;
const REGIONAL_AUTONOMIES = ['none', 'autonomous_region_elected_leader', 'unavailable'] as const;
const JUDICIAL_COURTS = ['exists', 'none', 'unavailable'] as const;
const JUDICIAL_APPOINTMENTS = ['executive', 'parliament', 'shared', 'unavailable'] as const;
const JUDICIAL_TERMS = ['years', 'life', 'unavailable'] as const;
const JUDICIAL_TIMINGS = ['before_promulgation', 'after_promulgation', 'both', 'none', 'unavailable'] as const;
const JUDICIAL_EFFECTS = ['annul', 'declare_incompatibility', 'advisory_only', 'unavailable'] as const;
const RIGHT_LEVELS: Record<string, readonly string[]> = {
  expression: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'], press: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  assembly: ['guaranteed', 'authorization_required', 'strongly_restricted', 'not_guaranteed', 'unavailable'], association: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  religion: ['guaranteed', 'limited', 'official_plus_tolerance', 'official_plus_restrictions', 'not_guaranteed', 'unavailable'],
  equalityBeforeLaw: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'], antiDiscrimination: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  privateProperty: ['strong', 'guaranteed_with_legal_expropriation', 'weak', 'not_guaranteed', 'unavailable'], privacy: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  fairTrial: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'], protectionFromArbitraryArrest: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  strike: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'], union: ['guaranteed', 'guaranteed_with_restrictions', 'not_guaranteed', 'unavailable'],
  vote: ['constitutional', 'ordinary_law_only', 'unavailable'], health: ['constitutional_right', 'state_objective_not_justiciable', 'not_constitutionalized', 'unavailable'],
  education: ['constitutional_right', 'state_objective_not_justiciable', 'not_constitutionalized', 'unavailable'], socialProtection: ['constitutional_right', 'state_objective_not_justiciable', 'not_constitutionalized', 'unavailable'],
};
const invalid = (message: string): never => { throw new Error(message); };
const enumValue = (value: unknown, allowed: readonly string[], label: string): void => {
  if (value !== undefined && !allowed.includes(value as string)) invalid(`Invalid constitutional amendment ${label}: ${String(value)}.`);
};
const thresholdBps = (value: unknown, label: string): void => {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10_000)) invalid(`Invalid constitutional amendment ${label}: thresholds must be integers in 0..10000.`);
};
const positiveInt = (value: unknown, label: string): void => {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) <= 0)) invalid(`Invalid constitutional amendment ${label}: a positive integer is required.`);
};
const nonEmptyStrings = (value: unknown, label: string): void => {
  if (value !== undefined && (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || !item.trim()))) invalid(`Invalid constitutional amendment ${label}: a non-empty list of identifiers is required.`);
};
function validateConstitutionalAmendmentPayload(state: SimulationState, countryId: string, payload: ConstitutionalAmendmentPayload): void {
  const unknown = [...(payload.materialKeysToProtect ?? []), ...(payload.materialKeysToUnprotect ?? [])].filter(key => !(MATERIAL_KEYS as readonly string[]).includes(key));
  if (unknown.length) throw new Error(`Unknown material keys cannot be constitutionally protected: ${unknown.join(', ')}.`);
  const changed = Boolean(payload.materialKeysToProtect?.length || payload.materialKeysToUnprotect?.length || payload.rightsChanges || payload.parliamentChanges || payload.executiveChanges || payload.electionChanges || payload.judicialChanges || payload.territoryChanges || payload.amendmentChanges);
  if (!changed) throw new Error('A constitutional amendment payload must change something.');
  const government = payload.executiveChanges?.government;
  if (government && 'vacancySuccession' in government) throw new Error('vacancySuccession is a locked project succession rule (temporary/permanent) and cannot be amended.');
  // Nested value validation before adoption.
  if (payload.rightsChanges) for (const [field, value] of Object.entries(payload.rightsChanges)) enumValue(value, RIGHT_LEVELS[field] ?? [], `rights.${field}`);
  if (payload.parliamentChanges) {
    const parliament = payload.parliamentChanges;
    enumValue(parliament.power, PARLIAMENT_POWERS, 'parliament.power');
    if (parliament.dissolutionHolder !== undefined && !['executive', 'parliament', 'unavailable'].includes(parliament.dissolutionHolder)) invalid('Invalid constitutional amendment parliament.dissolutionHolder.');
    if (parliament.chambers !== undefined && (!Number.isSafeInteger(parliament.chambers) || parliament.chambers < 0)) invalid('Invalid constitutional amendment parliament.chambers.');
    positiveInt(parliament.termYears, 'parliament.termYears');
  }
  if (payload.executiveChanges?.headOfState) {
    const head = payload.executiveChanges.headOfState;
    enumValue(head.selectionMethod, HEAD_OF_STATE_SELECTIONS, 'headOfState.selectionMethod');
    enumValue(head.suffrageMode, SUFFRAGE_MODES, 'headOfState.suffrageMode');
    positiveInt(head.termYears, 'headOfState.termYears');
    positiveInt(head.maxTerms, 'headOfState.maxTerms');
  }
  if (government) {
    enumValue(government.appointmentMode, GOVERNMENT_APPOINTMENTS, 'government.appointmentMode');
    enumValue(government.responsibility, GOVERNMENT_RESPONSIBILITIES, 'government.responsibility');
  }
  if (payload.electionChanges) {
    const election = payload.electionChanges;
    enumValue(election.suffrage, SUFFRAGE_MODES, 'election.suffrage');
    if (election.mandatoryVoting !== undefined && typeof election.mandatoryVoting !== 'boolean' && election.mandatoryVoting !== 'unavailable') invalid('Invalid constitutional amendment election.mandatoryVoting.');
    enumValue(election.parliamentarySystem, PARLIAMENTARY_SYSTEMS, 'election.parliamentarySystem');
    if (election.rounds !== undefined && election.rounds !== 1 && election.rounds !== 2 && election.rounds !== 'unavailable') invalid('Invalid constitutional amendment election.rounds.');
    thresholdBps(election.thresholdBps, 'election.thresholdBps');
    if (election.votingAge !== undefined && (!Number.isSafeInteger(election.votingAge) || election.votingAge < 1 || election.votingAge > 120)) invalid('Invalid constitutional amendment election.votingAge: ages must be integers in 1..120.');
  }
  if (payload.judicialChanges) {
    const judicial = payload.judicialChanges;
    enumValue(judicial.courtExists, JUDICIAL_COURTS, 'judicialReview.courtExists');
    enumValue(judicial.appointment, JUDICIAL_APPOINTMENTS, 'judicialReview.appointment');
    enumValue(judicial.term, JUDICIAL_TERMS, 'judicialReview.term');
    positiveInt(judicial.termYears, 'judicialReview.termYears');
    enumValue(judicial.timing, JUDICIAL_TIMINGS, 'judicialReview.timing');
    enumValue(judicial.effect, JUDICIAL_EFFECTS, 'judicialReview.effect');
    if (judicial.accessors !== undefined) {
      if (!Array.isArray(judicial.accessors) || judicial.accessors.some(item => !['executive', 'government', 'parliament', 'parliamentary_parties', 'citizens'].includes(item))) invalid('Invalid constitutional amendment judicialReview.accessors.');
    }
  }
  if (payload.territoryChanges) {
    const territory = payload.territoryChanges;
    enumValue(territory.organization, TERRITORIAL_ORGANIZATIONS, 'territory.organization');
    enumValue(territory.regionalAutonomy, REGIONAL_AUTONOMIES, 'territory.regionalAutonomy');
    nonEmptyStrings(territory.delegatedCompetences, 'territory.delegatedCompetences');
    if (territory.regionalAutonomy === 'autonomous_region_elected_leader' && !territory.regionIds?.length) throw new Error('Granting regional autonomy requires the Regions it applies to (territoryChanges.regionIds).');
    if (territory.regionIds !== undefined) {
      nonEmptyStrings(territory.regionIds, 'territory.regionIds');
      for (const regionId of territory.regionIds) {
        if (state.regionOwnership[regionId] !== countryId) throw new Error(`Region ${regionId} is not owned by ${countryId}; autonomy cannot be devolved to it.`);
      }
    }
    if (territory.sovereigntyTransfer !== undefined) {
      nonEmptyStrings(territory.sovereigntyTransfer.regionIds, 'territory.sovereigntyTransfer.regionIds');
      if (typeof territory.sovereigntyTransfer.toCountryId !== 'string' || !territory.sovereigntyTransfer.toCountryId.trim()) throw new Error('A constitutional sovereignty transfer requires a recipient Country.');
      for (const regionId of territory.sovereigntyTransfer.regionIds) {
        if (state.regionOwnership[regionId] !== countryId) throw new Error(`Region ${regionId} is not owned by ${countryId}; its sovereignty cannot be transferred.`);
      }
    }
  }
  if (payload.amendmentChanges) {
    thresholdBps(payload.amendmentChanges.parliamentaryThresholdBps, 'amendment.parliamentaryThresholdBps');
    enumValue(payload.amendmentChanges.referendum, REFERENDUM_RULES, 'amendment.referendum');
    if (payload.amendmentChanges.procedureStatus !== undefined && !['sourced', 'modelled'].includes(payload.amendmentChanges.procedureStatus)) invalid('Invalid constitutional amendment amendment.procedureStatus.');
  }
}

/** Propose a constitutional amendment (principal or secondary disposition). Requires legislation authority. */
export function createConstitutionalAmendmentProposal(state: SimulationState, input: { proposerPersonId: string; countryId: string; effectiveDate: string; payload: ConstitutionalAmendmentPayload }): SimulationState {
  const proposer = requirePerson(state, input.proposerPersonId); requireCountry(state, input.countryId);
  if (proposer.countryId !== input.countryId) throw new Error('Proposal Country does not match proposer scope.');
  if (!dateValid(input.effectiveDate) || input.effectiveDate < state.date) throw new Error('The effective date must be a valid simulation date not before today.');
  validateConstitutionalAmendmentPayload(state, input.countryId, input.payload);
  // Automatic principal/secondary classification: a rights or structural change is principal; a
  // material-key protection/removal is secondary. The disposition is derived, never freely chosen.
  const disposition: ConstitutionalDisposition = input.payload.rightsChanges || input.payload.parliamentChanges || input.payload.executiveChanges || input.payload.electionChanges || input.payload.judicialChanges || input.payload.territoryChanges || input.payload.amendmentChanges ? 'principal' : 'secondary';
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

export function replaceDraftProposal<K extends ProposalKind>(state: SimulationState, proposalIdValue: string, input: { effectiveDate?: string; payload?: ProposalPayloadByKind[K] }, actorPersonId?: string): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal) throw new Error('Unknown political proposal.');
  if (proposal.status !== 'draft') throw new Error('Submitted proposal content is immutable.');
  // Only the actor authorized to draft the text may modify it: the proposal's own proposer (or the
  // controlled person acting as them). The opposition negotiates and sets conditions; it never
  // edits the government's draft directly.
  if (actorPersonId !== undefined) {
    const actor = requirePerson(state, actorPersonId);
    if (actor.id !== proposal.proposerPersonId) throw new Error('Only the proposal\'s proposer may modify this draft.');
  } else {
    requireControlled(state, proposal.proposerPersonId);
  }
  const effectiveDate = input.effectiveDate ?? proposal.effectiveDate;
  if (!dateValid(effectiveDate) || effectiveDate < proposal.createdOn) throw new Error('The effective date must be a valid simulation date not before the proposal was created.');
  const payload = (input.payload ?? proposal.payload) as ProposalPayloadByKind[K];
  if (proposal.kind === 'fiscal_reform') {
    validatePayload(state, proposal.countryId, effectiveDate, payload as FiscalProposalPayload);
  } else if (proposal.kind === 'constitutional_amendment') {
    validateConstitutionalAmendmentPayload(state, proposal.countryId, payload as ConstitutionalAmendmentPayload);
  }
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
  if (proposal.kind === 'constitutional_amendment') validateConstitutionalAmendmentPayload(state, proposal.countryId, proposal.payload);
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
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || !['draft', 'submitted', 'consulted'].includes(proposal.status)) throw new Error('Proposal cannot be withdrawn.');
  const actor = requirePerson(state, actorPersonId);
  if (actor.id !== proposal.proposerPersonId) throw new Error('Only the proposer can withdraw this proposal.');
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, status: 'withdrawn', resolvedOn: state.date } } });
}

export function withdrawProposal(state: SimulationState, proposalIdValue: string): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || !['draft', 'submitted', 'consulted'].includes(proposal.status)) throw new Error('Proposal cannot be withdrawn.');
  requireControlled(state, proposal.proposerPersonId);
  return withdrawProposalForActor(state, proposalIdValue, proposal.proposerPersonId);
}

/** A pre-vote negotiation between the government and a party leader: support conditions are
 *  recorded (and may bind a later whip instruction); the government may then voluntarily modify
 *  the draft text through replaceDraftProposal. The opposition negotiates and sets conditions —
 *  it never edits the government's draft directly. */
export function holdPreVoteNegotiation(state: SimulationState, proposalIdValue: string, actorPersonId: string, partyId: string, conditions: string[], supportCommitment?: 'support' | 'oppose' | 'conditional'): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue];
  if (!proposal || !['draft', 'submitted'].includes(proposal.status)) throw new Error('Only a draft or submitted proposal may be negotiated.');
  if (!Array.isArray(conditions) || conditions.length === 0 || conditions.some(condition => typeof condition !== 'string' || !condition.trim())) throw new Error('Negotiation conditions must be a non-empty list of statements.');
  const actor = requirePerson(state, actorPersonId);
  const isProposer = actor.id === proposal.proposerPersonId;
  const isPartyLeader = actor.partyId === partyId && actor.isPartyLeader && actor.countryId === proposal.countryId;
  if (!isProposer && !isPartyLeader) throw new Error('Only the proposal\'s proposer or the party\'s leader may conduct the pre-vote negotiation.');
  const negotiations = [...(proposal.negotiations ?? []), {
    on: state.date, proposalId: proposal.id, byPersonId: actorPersonId, partyId,
    conditions: conditions.map(condition => condition.trim()),
    ...(supportCommitment ? { supportCommitment } : {}),
  }];
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, negotiations } } });
}

/** A party leader issues a whip instruction for a submitted proposal. The internal vote
 *  distribution and defections then determine how far the parliamentarians follow the line. */
export function issuePartyWhip(state: SimulationState, proposalIdValue: string, byPersonId: string, partyId: string, instruction: 'yes' | 'no' | 'abstain' | 'free'): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue];
  if (!proposal || proposal.status !== 'submitted') throw new Error('Only a submitted proposal may receive a whip instruction.');
  const person = requirePerson(state, byPersonId);
  if (!person.isPartyLeader || person.partyId !== partyId || person.countryId !== proposal.countryId || person.status !== 'active') throw new Error('Only the active leader of the instructed party may issue a whip instruction.');
  const whipInstructions = [...(proposal.whipInstructions ?? []).filter(existing => existing.partyId !== partyId), {
    on: state.date, proposalId: proposal.id, byPersonId, partyId, instruction,
  }];
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, whipInstructions } } });
}

/** Global toggle of spontaneous ministerial proposal generation. The internal suggestion system
 *  remains a separate, non-legislative channel either way. */
export function setSpontaneousMinisterialProposals(state: SimulationState, enabled: boolean): SimulationState {
  return cloneGovernance(state, { ...state.governance, settings: { spontaneousMinisterialProposalsEnabled: enabled } });
}

/** An internal ministerial suggestion: a real minister holding a real portfolio proposes a policy
 *  to the head of government. The suggestion never holds the legislative initiative — only the
 *  head of government can accept it into a real draft. */
export function suggestMinisterialProposal(state: SimulationState, ministerPersonId: string, portfolioId: string, subject: string, kind: ProposalKind, suggestedPayload?: ProposalPayloadByKind[ProposalKind]): SimulationState {
  if (!state.governance.settings.spontaneousMinisterialProposalsEnabled) throw new Error('Spontaneous ministerial proposals are disabled by the global toggle.');
  const minister = requirePerson(state, ministerPersonId);
  if (minister.status !== 'active' || minister.office?.role !== 'minister') throw new Error('Only an active minister may make a suggestion.');
  const countryId = minister.office.countryId;
  const cabinet = state.governance.cabinets[countryId];
  const portfolio = cabinet?.portfolios[portfolioId];
  if (!portfolio || portfolio.ministerPersonId !== ministerPersonId) throw new Error('The minister must hold the portfolio they suggest from.');
  if (!subject?.trim()) throw new Error('A suggestion requires a subject.');
  if (suggestedPayload !== undefined) {
    if (kind === 'fiscal_reform') {
      const payload = suggestedPayload as ProposalPayloadByKind['fiscal_reform'];
      if (!payload.policy && !payload.annualBudget) throw new Error('A fiscal suggestion payload must carry a policy or an annual budget.');
      validatePayload(state, countryId, state.date, payload);
    } else {
      validateConstitutionalAmendmentPayload(state, countryId, suggestedPayload as ProposalPayloadByKind['constitutional_amendment']);
    }
  }
  const id = `suggestion.${state.governance.nextSuggestionSequence.toString().padStart(8, '0')}`;
  const suggestions = [...state.governance.ministerialSuggestions, {
    id, on: state.date, countryId, byPersonId: ministerPersonId, portfolioId, kind, subject: subject.trim(),
    ...(suggestedPayload ? { suggestedPayload: structuredClone(suggestedPayload) } : {}),
    status: 'pending' as const,
  }];
  return cloneGovernance(state, { ...state.governance, ministerialSuggestions: suggestions, nextSuggestionSequence: state.governance.nextSuggestionSequence + 1 });
}

/** The head of government accepts an internal ministerial suggestion into a real draft proposal of
 *  their own authorship: the suggestion gains a proposer with the legislative initiative, never the
 *  minister. */
export function acceptMinisterialSuggestion(state: SimulationState, suggestionId: string, actorPersonId: string, effectiveDate: string): SimulationState {
  const suggestion = state.governance.ministerialSuggestions.find(item => item.id === suggestionId);
  if (!suggestion || suggestion.status !== 'pending') throw new Error('Only a pending suggestion can be accepted.');
  const actor = requirePerson(state, actorPersonId);
  if (!isHeadOfGovernment(state, actorPersonId, suggestion.countryId)) throw new Error('Only the head of government may accept a ministerial suggestion.');
  if (!dateValid(effectiveDate) || effectiveDate < state.date) throw new Error('The effective date must be a valid simulation date not before today.');
  let next = state;
  let proposalIdValue: string | undefined;
  if (suggestion.kind === 'fiscal_reform') {
    const payload = suggestion.suggestedPayload as FiscalProposalPayload | undefined;
    if (!payload || (!payload.policy && !payload.annualBudget)) throw new Error('A fiscal suggestion without a policy or budget payload cannot be accepted.');
    next = createFiscalProposal(next, { proposerPersonId: actor.id, countryId: suggestion.countryId, effectiveDate, payload });
  } else {
    const payload = suggestion.suggestedPayload as ConstitutionalAmendmentPayload | undefined;
    if (!payload) throw new Error('A constitutional suggestion without a payload cannot be accepted.');
    next = createConstitutionalAmendmentProposal(next, { proposerPersonId: actor.id, countryId: suggestion.countryId, effectiveDate, payload });
  }
  proposalIdValue = next.governance.proposalOrder[next.governance.proposalOrder.length - 1];
  const ministerialSuggestions = next.governance.ministerialSuggestions.map(item => item.id === suggestionId ? { ...item, status: 'accepted' as const, acceptedIntoProposalId: proposalIdValue, resolvedOn: state.date } : item);
  return cloneGovernance(next, { ...next.governance, ministerialSuggestions });
}

/** The head of government declines an internal ministerial suggestion. */
export function declineMinisterialSuggestion(state: SimulationState, suggestionId: string, actorPersonId: string): SimulationState {
  const suggestion = state.governance.ministerialSuggestions.find(item => item.id === suggestionId);
  if (!suggestion || suggestion.status !== 'pending') throw new Error('Only a pending suggestion can be declined.');
  const actor = requirePerson(state, actorPersonId);
  if (!isHeadOfGovernment(state, actorPersonId, suggestion.countryId)) throw new Error('Only the head of government may decline a ministerial suggestion.');
  const ministerialSuggestions = state.governance.ministerialSuggestions.map(item => item.id === suggestionId ? { ...item, status: 'declined' as const, resolvedOn: state.date } : item);
  return cloneGovernance(state, { ...state.governance, ministerialSuggestions });
}

/** Reconcile every persisted office capability of a Country with the constitution currently in
 *  force (evidence-based authority or role-derived profile). Called after a constitutional
 *  amendment changes institutional powers, so persisted capabilities never go stale. */
export function reconcileOfficeCapabilitiesForCountry(state: SimulationState, countryId: string): SimulationState {
  let persons = state.governance.persons;
  let changed = false;
  for (const [id, person] of Object.entries(persons)) {
    if (person.status !== 'active' || person.office?.countryId !== countryId) continue;
    const office = person.office;
    const capabilities = office.evidence
      ? capabilitiesForReconciledAuthority(office.evidence.authorityBasis)
      : capabilitiesFor(office.role);
    if (JSON.stringify(office.authorityProfile.capabilities) !== JSON.stringify(capabilities)) {
      persons = { ...persons, [id]: { ...person, office: { ...office, authorityProfile: { ...office.authorityProfile, capabilities } } } };
      changed = true;
    }
  }
  return changed ? cloneGovernance(state, { ...state.governance, persons }) : state;
}

export function inspectProposalSupport(state: SimulationState, proposalIdValue: string, registry: PoliticalRegistry = politicalRegistry, profiles: Record<string, PartyGoalProfile | undefined> = {}) {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal) throw new Error('Unknown political proposal.');
  const analysis = analyzeProposal(state, proposal); return structuredClone({ analysis, impact: classifyProposalImpact(state, proposal, analysis), publicEstimate: estimatePublicSupport(state, proposal, analysis), parliamentaryEstimate: estimateParliamentarySupport(state, proposal, registry, profiles, analysis), informationStatus: 'engine_debug_reality' as const });
}

export function resolveProposalVoteForActor(state: SimulationState, proposalIdValue: string, actorPersonId: string, registry: PoliticalRegistry = politicalRegistry, profiles: Record<string, PartyGoalProfile | undefined> = {}): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || proposal.status !== 'submitted') throw new Error('Only an unresolved submitted proposal can be voted.');
  const actor = requirePerson(state, actorPersonId);
  // Triggering the vote procedure belongs to the canonical authority that presented the bill: a
  // random legislator can never trigger a resolution of the government's text at will.
  if (actor.id !== proposal.proposerPersonId) throw new Error('Only the proposal\'s proposer (the authority that presented the bill) may trigger its parliamentary resolution.');
  if (!hasCapability(proposal, actor, 'vote_legislation')) throw new Error('Actor lacks authority to resolve this legislative vote.');
  const analysis = analyzeProposal(state, proposal), publicEstimate = estimatePublicSupport(state, proposal, analysis), parliamentaryEstimate = estimateParliamentarySupport(state, proposal, registry, profiles, analysis), expired = state.date > proposal.effectiveDate;
  const parliamentPower = state.constitution.countries[proposal.countryId]?.parliament.power;
  const legislativeInstrument = proposal.instrumentClass !== 'administrative_action';
  // parliament.power === 'none' means an explicit executive decision without any parliamentary
  // vote: a legislator's vote call never turns into an automatic adoption. The executive decides
  // through decideExecutiveProposal, never here.
  if (legislativeInstrument && parliamentPower === 'none') throw new Error('This parliament has no legislative power: there is no parliamentary vote to resolve. The executive must decide the proposal explicitly.');
  let next = state;
  if (legislativeInstrument && parliamentPower === 'consultative' && !expired) {
    // Non-binding parliamentary opinion: recorded, then the executive decides separately.
    const consulted = { ...proposal, status: 'consulted' as const, analysis, evaluationVersion: 'situational-plurality-0.15-v2' as const, publicEstimate, parliamentaryEstimate } as PoliticalProposal;
    return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: consulted } });
  }
  let outcome: LegislativeVoteResult['outcome'];
  let reason: LegislativeVoteResult['reason'];
  if (expired) { outcome = 'unavailable'; reason = 'effective_date_expired'; }
  else if (parliamentaryEstimate.coverage !== 'complete') { outcome = 'unavailable'; reason = 'institutional_data_unavailable'; }
  else {
    // weak_legislative still votes by ordinary majority; a rejection is provisional and may later be
    // overridden explicitly by the executive (a separate command), never silently re-decided here.
    outcome = parliamentaryEstimate.chambers.every(item => item.adopted) ? 'adopted' : 'rejected';
    reason = undefined;
  }
  const protectedViolation = outcome === 'adopted' && proposal.kind === 'fiscal_reform' ? rejectProtectedModification(state, proposal.countryId, proposal.instrumentClass, proposal.payload) : undefined;
  const amendmentReason = outcome === 'adopted' && proposal.kind === 'constitutional_amendment' ? amendmentProcedureReason(state, proposal, parliamentaryEstimate, publicEstimate) : undefined;
  // A referendum that is required but not yet held never finalizes the proposal as rejected: the
  // parliamentary estimates are recorded and the proposal stays submitted, so the referendum can be
  // held next and the same resolution then proceeds (Parliament -> referendum order).
  if (amendmentReason === 'referendum_pending') {
    const awaiting = { ...proposal, analysis, publicEstimate, parliamentaryEstimate } as PoliticalProposal;
    return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: awaiting } });
  }
  const blocked = Boolean(protectedViolation || amendmentReason);
  // The parliamentary estimate records the chamber opinion as evaluated — never rewritten to look
  // like a rejection when the block came from the constitutional procedure (referendum/threshold) or
  // a protected material key. The rejection reason is what distinguishes those outcomes.
  const effectiveOutcome = blocked ? 'rejected' : outcome;
  const effectiveReason = amendmentReason ?? (protectedViolation ? 'constitutionally_protected' as const : reason);
  const voteResult: LegislativeVoteResult = { ...parliamentaryEstimate, outcome: effectiveOutcome, resolvedOn: state.date, reason: effectiveReason };
  let scheduledFiscalReformSequence: number | undefined, enactmentReference: PoliticalProposal['enactmentReference'], protectedMaterialKeys: string[] | undefined, unprotectedMaterialKeys: string[] | undefined;
  if (effectiveOutcome === 'adopted') {
    // Enactment marks the instrument adopted BEFORE scheduling its pending effect, so the scheduled
    // pending is strictly bound to the canonical enacted instrument.
    const enacting = cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, status: 'enacted' as const } } });
    const enacted = proposalEnactFor(enacting, proposal); next = enacted.next; scheduledFiscalReformSequence = enacted.fiscalReformSequence; protectedMaterialKeys = enacted.protectedMaterialKeys; unprotectedMaterialKeys = enacted.unprotectedMaterialKeys;
    enactmentReference = enacted.fiscalReformSequence !== undefined && enacted.reformFingerprint !== undefined ? { fiscalReformSequence: enacted.fiscalReformSequence, reformFingerprint: enacted.reformFingerprint } : undefined;
  }
  const resolved = { ...proposal, status: effectiveOutcome === 'adopted' ? 'enacted' as const : effectiveOutcome, resolvedOn: state.date, analysis, evaluationVersion: 'situational-plurality-0.15-v2', publicEstimate, parliamentaryEstimate, voteResult, scheduledFiscalReformSequence, enactmentReference, effects: effectiveOutcome === 'adopted' ? proposalEffectsFor(proposal, { fiscalReformSequence: scheduledFiscalReformSequence, reformFingerprint: enactmentReference?.reformFingerprint, protectedMaterialKeys, unprotectedMaterialKeys }) : [] } as PoliticalProposal;
  next = { ...next, governance: { ...next.governance, proposals: { ...next.governance.proposals, [proposal.id]: resolved } } };
  return addProposalResultBriefing(next, resolved);
}

/** Hold a real constitutional referendum. Only amendments the constitution requires a referendum for
 *  may be put to one, the recorded outcome (adopted/rejected) is what the amendment procedure then
 *  checks — never a silent re-derivation from the public estimate — and an already-held referendum
 *  can never be replayed to overwrite its result. The outcome represents participation, abstention
 *  and the suffrage rules in force, not a bare support > oppose comparison. */
export function holdReferendum(state: SimulationState, proposalIdValue: string, actorPersonId: string): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue];
  if (!proposal || !['submitted', 'consulted'].includes(proposal.status)) throw new Error('Only a submitted or consulted proposal may be put to a referendum.');
  if (proposal.kind !== 'constitutional_amendment') throw new Error('Only a constitutional amendment may be put to a referendum.');
  if (proposal.referendumResult) throw new Error('This referendum has already been held; its result cannot be replayed or overwritten.');
  if (!isExecutiveActor(state, actorPersonId, proposal.countryId)) throw new Error('Only the executive head may call a referendum.');
  const amendment = state.constitution.countries[proposal.countryId]?.amendment;
  const required = amendment?.referendum === 'always' || (amendment?.referendum === 'principal_only' && proposal.constitutionalDisposition === 'principal');
  if (!required) throw new Error('This amendment does not require a referendum under the constitution.');
  const publicEstimate = estimatePublicSupport(state, proposal, proposal.analysis);
  const participation = referendumParticipation(state, proposal.countryId);
  const abstainBps = Math.max(0, Math.min(10_000, publicEstimate.neutralBps + publicEstimate.unknownBps));
  const supportBps = publicEstimate.supportBps, opposeBps = publicEstimate.opposeBps;
  const electionRules = state.constitution.countries[proposal.countryId]?.election;
  const eligibility = referendumEligibility(electionRules);
  const adopted = participation.participationBps > 0 && supportBps > opposeBps;
  const coverage: 'complete' | 'partial' | 'unavailable' = publicEstimate.coverage === 'unavailable' ? 'unavailable' : (publicEstimate.coverage === 'complete' && eligibility.coverage === 'complete' ? 'complete' : 'partial');
  const referendumResult = {
    heldOn: state.date,
    adopted,
    supportBps,
    opposeBps,
    abstainBps,
    participationBps: participation.participationBps,
    coverage,
    limitation: `Participation ${participation.participationBps} bps of the represented population under the suffrage rules in force; abstention/unknown ${abstainBps} bps. ${eligibility.limitation}`,
  };
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, publicEstimate, referendumResult } } });
}

/** Real participation of a constitutional referendum under the suffrage rules in force. */
const referendumParticipation = (state: SimulationState, countryId: string): { participationBps: number } => {
  const country = state.politics.countries[countryId];
  const electionRules = state.constitution.countries[countryId]?.election;
  let turnedOut = 0, persons = 0;
  for (const regionId of [...(country?.regionIds ?? [])].sort()) {
    const socio = state.socioeconomy.regions[regionId];
    const opinion = state.politics.regionalOpinion[regionId];
    if (!socio || !opinion) continue;
    for (const cohort of socio.cohorts) {
      if (cohort.persons <= 0) continue;
      const cohortOpinion = opinion.cohorts[`${cohort.income}:${cohort.orientation}`];
      if (!cohortOpinion) continue;
      persons += cohort.persons;
      const engagement = cohortOpinion[3];
      const turnoutBps = electionRules?.mandatoryVoting === true ? 10_000 : engagement;
      turnedOut += Math.round(cohort.persons * turnoutBps / 10_000);
    }
  }
  return { participationBps: persons > 0 ? Math.min(10_000, Math.round(turnedOut * 10_000 / persons)) : 0 };
};

const referendumEligibility = (electionRules: { suffrage: string; votingAge?: number } | undefined): { coverage: 'complete' | 'partial' | 'unavailable'; limitation: string } => {
  if (!electionRules) return { coverage: 'unavailable', limitation: 'No constitutional election rules are available; electorate coverage is unknown.' };
  if (electionRules.suffrage === 'restricted') return { coverage: 'partial', limitation: 'Suffrage is constitutionally restricted, but the sourced eligibility structure is unavailable; the ineligible share remains unknown.' };
  if (electionRules.votingAge !== undefined) return { coverage: 'partial', limitation: `A voting age (${electionRules.votingAge}) is in force, but no sourced age structure exists; the under-age share remains unknown.` };
  if (electionRules.suffrage === 'universal') return { coverage: 'complete', limitation: 'Universal suffrage with no voting age in force.' };
  return { coverage: 'unavailable', limitation: 'The suffrage rule is unavailable; electorate coverage is unknown.' };
};

/** Decide a consulted (consultative-parliament) proposal: the parliamentary opinion is non-binding,
 *  so the executive enacts or rejects it explicitly. */
export function decideConsultativeProposal(state: SimulationState, proposalIdValue: string, actorPersonId: string, decision: 'enact' | 'reject'): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue];
  if (!proposal || proposal.status !== 'consulted') throw new Error('Only a consulted proposal may receive an executive decision.');
  const parliamentPower = state.constitution.countries[proposal.countryId]?.parliament.power;
  if (parliamentPower !== 'consultative') throw new Error('Only a consultative parliament opinion requires an executive decision.');
  if (!isExecutiveActor(state, actorPersonId, proposal.countryId)) throw new Error('Only the executive head may decide a consulted proposal.');
  if (state.date > proposal.effectiveDate) throw new Error('The proposal has expired and cannot be decided.');
  const parliamentaryEstimate = proposal.parliamentaryEstimate ?? estimateParliamentarySupport(state, proposal, politicalRegistry, {}, proposal.analysis);
  if (decision === 'reject') {
    const voteResult: LegislativeVoteResult = { ...parliamentaryEstimate, outcome: 'rejected', resolvedOn: state.date, reason: 'executive_decision' };
    const resolved = { ...proposal, status: 'rejected' as const, resolvedOn: state.date, voteResult } as PoliticalProposal;
    return addProposalResultBriefing(cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: resolved } }), resolved);
  }
  if (proposal.kind === 'fiscal_reform') {
    const protectedViolation = rejectProtectedModification(state, proposal.countryId, proposal.instrumentClass, proposal.payload);
    if (protectedViolation) throw new Error(protectedViolation);
  }
  if (proposal.kind === 'constitutional_amendment') {
    const publicEstimate = proposal.publicEstimate ?? estimatePublicSupport(state, proposal, proposal.analysis);
    const amendmentReason = amendmentProcedureReason(state, proposal, parliamentaryEstimate, publicEstimate);
    if (amendmentReason) throw new Error(`The constitutional amendment procedure blocks the decision: ${amendmentReason}.`);
  }
  const enacted = proposalEnactFor(cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, status: 'enacted' as const } } }), proposal);
  const scheduledFiscalReformSequence = enacted.fiscalReformSequence;
  const enactmentReference = enacted.fiscalReformSequence !== undefined && enacted.reformFingerprint !== undefined ? { fiscalReformSequence: enacted.fiscalReformSequence, reformFingerprint: enacted.reformFingerprint } : undefined;
  const voteResult: LegislativeVoteResult = { ...parliamentaryEstimate, outcome: 'adopted', resolvedOn: state.date, reason: 'executive_decision' };
  const resolved = { ...proposal, status: 'enacted' as const, resolvedOn: state.date, voteResult, scheduledFiscalReformSequence, enactmentReference, effects: proposalEffectsFor(proposal, { fiscalReformSequence: scheduledFiscalReformSequence, reformFingerprint: enactmentReference?.reformFingerprint, protectedMaterialKeys: enacted.protectedMaterialKeys, unprotectedMaterialKeys: enacted.unprotectedMaterialKeys }) } as PoliticalProposal;
  return addProposalResultBriefing(cloneGovernance(enacted.next, { ...enacted.next.governance, proposals: { ...enacted.next.governance.proposals, [proposal.id]: resolved } }), resolved);
}

/** Decide a proposal when the constitution grants the parliament no legislative power at all
 *  (parliament.power === 'none'): the adoption is an explicit executive decision, never an
 *  automatic result of a legislator's vote call. */
export function decideExecutiveProposal(state: SimulationState, proposalIdValue: string, actorPersonId: string, decision: 'enact' | 'reject'): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue];
  if (!proposal || proposal.status !== 'submitted') throw new Error('Only an unresolved submitted proposal may receive an executive decision.');
  const parliamentPower = state.constitution.countries[proposal.countryId]?.parliament.power;
  if (parliamentPower !== 'none') throw new Error('Only a parliament without legislative power puts the explicit decision in the executive.');
  if (!isExecutiveActor(state, actorPersonId, proposal.countryId)) throw new Error('Only the executive head may decide the proposal.');
  if (state.date > proposal.effectiveDate) throw new Error('The proposal has expired and cannot be decided.');
  const analysis = analyzeProposal(state, proposal);
  const publicEstimate = estimatePublicSupport(state, proposal, analysis);
  const parliamentaryEstimate = estimateParliamentarySupport(state, proposal, politicalRegistry, {}, analysis);
  if (decision === 'reject') {
    const voteResult: LegislativeVoteResult = { ...parliamentaryEstimate, outcome: 'rejected', resolvedOn: state.date, reason: 'executive_decision' };
    const resolved = { ...proposal, status: 'rejected' as const, resolvedOn: state.date, analysis, evaluationVersion: 'situational-plurality-0.15-v2' as const, publicEstimate, parliamentaryEstimate, voteResult } as PoliticalProposal;
    return addProposalResultBriefing(cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: resolved } }), resolved);
  }
  if (proposal.kind === 'fiscal_reform') {
    const protectedViolation = rejectProtectedModification(state, proposal.countryId, proposal.instrumentClass, proposal.payload);
    if (protectedViolation) throw new Error(protectedViolation);
  }
  if (proposal.kind === 'constitutional_amendment') {
    const amendmentReason = amendmentProcedureReason(state, proposal, parliamentaryEstimate, publicEstimate);
    if (amendmentReason) throw new Error(`The constitutional amendment procedure blocks the decision: ${amendmentReason}.`);
  }
  const enacted = proposalEnactFor(cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, status: 'enacted' as const } } }), proposal);
  const scheduledFiscalReformSequence = enacted.fiscalReformSequence;
  const enactmentReference = enacted.fiscalReformSequence !== undefined && enacted.reformFingerprint !== undefined ? { fiscalReformSequence: enacted.fiscalReformSequence, reformFingerprint: enacted.reformFingerprint } : undefined;
  const voteResult: LegislativeVoteResult = { ...parliamentaryEstimate, outcome: 'adopted', resolvedOn: state.date, reason: 'no_parliamentary_vote_required' };
  const resolved = { ...proposal, status: 'enacted' as const, resolvedOn: state.date, analysis, evaluationVersion: 'situational-plurality-0.15-v2' as const, publicEstimate, parliamentaryEstimate, voteResult, scheduledFiscalReformSequence, enactmentReference, effects: proposalEffectsFor(proposal, { fiscalReformSequence: scheduledFiscalReformSequence, reformFingerprint: enactmentReference?.reformFingerprint, protectedMaterialKeys: enacted.protectedMaterialKeys, unprotectedMaterialKeys: enacted.unprotectedMaterialKeys }) } as PoliticalProposal;
  return addProposalResultBriefing(cloneGovernance(enacted.next, { ...enacted.next.governance, proposals: { ...enacted.next.governance.proposals, [proposal.id]: resolved } }), resolved);
}

/** Constitutional amendment procedure (threshold + referendum) shared by the normal vote and the
 *  executive override, so an override can never bypass a constitutional requirement. A referendum
 *  that is required but not yet held is `referendum_pending` — it never permanently rejects the
 *  proposal; only a held referendum that said no is `referendum_failed`. */
function amendmentProcedureReason(state: SimulationState, proposal: PoliticalProposal, parliamentaryEstimate: ParliamentarySupportEstimate, publicEstimate: PublicSupportEstimate): 'constitutional_threshold' | 'referendum_failed' | 'referendum_pending' | 'constitutional_procedure_unavailable' | undefined {
  const amendment = state.constitution.countries[proposal.countryId]?.amendment;
  if (!amendment || amendment.parliamentaryThresholdBps === undefined || amendment.referendum === 'unavailable') return 'constitutional_procedure_unavailable';
  // The supermajority threshold governs a binding parliamentary vote. A parliament with no
  // legislative power (`none`) has no vote to fail it, and a consultative parliament's opinion is
  // non-binding, so the threshold is not_applicable there; the referendum requirement still applies.
  const parliamentPower = state.constitution.countries[proposal.countryId]?.parliament.power;
  const bindingVote = parliamentPower !== undefined && !['none', 'consultative'].includes(parliamentPower);
  if (bindingVote && parliamentaryEstimate.totalSeats > 0 && parliamentaryEstimate.yesSeats * 10000 < amendment.parliamentaryThresholdBps * parliamentaryEstimate.totalSeats) return 'constitutional_threshold';
  const referendumRequired = amendment.referendum === 'always' || (amendment.referendum === 'principal_only' && proposal.constitutionalDisposition === 'principal');
  if (referendumRequired) {
    if (!proposal.referendumResult) return 'referendum_pending';
    if (!proposal.referendumResult.adopted) return 'referendum_failed';
  }
  return undefined;
}

const isExecutiveActor = (state: SimulationState, personId: string, countryId: string): boolean => {
  const person = state.governance.persons[personId];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && ['head_of_government', 'head_of_state'].includes(person.office.role));
};

/** Explicit executive override of a weak-legislature parliamentary rejection. The parliamentary
 *  rejection is recorded as-is; this command is the separate constitutional procedure that enacts it. */
export function overrideParliamentaryRejection(state: SimulationState, proposalIdValue: string, actorPersonId: string): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue];
  if (!proposal || proposal.status !== 'rejected' || proposal.voteResult?.outcome !== 'rejected') throw new Error('Only a parliamentary rejection can be overridden.');
  if (proposal.voteResult.reason) throw new Error('A rejection for a constitutional reason cannot be overridden.');
  const parliamentPower = state.constitution.countries[proposal.countryId]?.parliament.power;
  if (parliamentPower !== 'weak_legislative') throw new Error('Only a weak legislature\'s rejection may be overridden by the executive.');
  const actor = requirePerson(state, actorPersonId);
  if (!isExecutiveActor(state, actorPersonId, proposal.countryId)) throw new Error('Only the executive head may override a parliamentary rejection.');
  if (state.date > proposal.effectiveDate) throw new Error('The proposal has expired and cannot be overridden.');
  const parliamentaryEstimate = proposal.parliamentaryEstimate ?? estimateParliamentarySupport(state, proposal, politicalRegistry, {}, proposal.analysis);
  if (proposal.kind === 'fiscal_reform') {
    const protectedViolation = rejectProtectedModification(state, proposal.countryId, proposal.instrumentClass, proposal.payload);
    if (protectedViolation) throw new Error(protectedViolation);
  }
  if (proposal.kind === 'constitutional_amendment') {
    const publicEstimate = proposal.publicEstimate ?? estimatePublicSupport(state, proposal, proposal.analysis);
    const amendmentReason = amendmentProcedureReason(state, proposal, parliamentaryEstimate, publicEstimate);
    if (amendmentReason) throw new Error(`The constitutional amendment procedure blocks the override: ${amendmentReason}.`);
  }
  const enacted = proposalEnactFor(cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, status: 'enacted' as const } } }), proposal);
  const scheduledFiscalReformSequence = enacted.fiscalReformSequence;
  const enactmentReference = enacted.fiscalReformSequence !== undefined && enacted.reformFingerprint !== undefined ? { fiscalReformSequence: enacted.fiscalReformSequence, reformFingerprint: enacted.reformFingerprint } : undefined;
  const voteResult: LegislativeVoteResult = { ...parliamentaryEstimate, outcome: 'adopted', resolvedOn: state.date, reason: 'executive_override' };
  const resolved = { ...proposal, status: 'enacted' as const, resolvedOn: state.date, voteResult, scheduledFiscalReformSequence, enactmentReference, effects: proposalEffectsFor(proposal, { fiscalReformSequence: scheduledFiscalReformSequence, reformFingerprint: enactmentReference?.reformFingerprint, protectedMaterialKeys: enacted.protectedMaterialKeys, unprotectedMaterialKeys: enacted.unprotectedMaterialKeys }) } as PoliticalProposal;
  const next = { ...enacted.next, governance: { ...enacted.next.governance, proposals: { ...enacted.next.governance.proposals, [proposal.id]: resolved } } };
  return addProposalResultBriefing(next, resolved);
}

/** The chamber responsible for confidence: the first chamber of the sourced institution (the
 *  modelled confidence chamber, typically the lower house). Chambers not responsible for
 *  confidence never vote a censure; a censure is never a blind sum of all chambers. */
const confidenceChamberIdsFor = (state: SimulationState, countryId: string): string[] => {
  const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId]?.institutionId];
  if (institution?.chambers.length) return [institution.chambers[0].id];
  const entry = state.elections.countries[countryId];
  const first = entry ? Object.keys(entry.chambers)[0] : undefined;
  return first ? [first] : [];
};

const clampAgreement = (value: number) => Math.max(0, Math.min(10_000, Math.round(value)));

const materialOutcomeFor = (context: ProposalMaterialContext, goal: GovernanceGoal): CoveredMetric | undefined => {
  if (goal === 'fiscal_distribution') return context.fiscalDistribution;
  if (goal === 'public_services') return context.publicServices;
  if (goal === 'income_security') return context.incomeSecurity;
  if (goal === 'infrastructure') return context.infrastructure;
  if (goal === 'labour_protection') return context.unemployment;
  if (goal === 'fiscal_sustainability') return context.fiscalSustainability;
  return undefined;
};

/** Each party's evaluation of the government's material record, from its own positions — never
 *  one common baseline shared by all parties. Used by censure and by the parliamentary
 *  dissolution motion. */
export const governmentRecordPartyEvaluation = (state: SimulationState, countryId: string, partyId: string): Pick<PartyProposalEvaluation, 'agreementBps' | 'confidenceBps' | 'coverage' | 'positiveDrivers' | 'negativeDrivers' | 'tradeoffs'> => {
  const party = politicalRegistry.parties[partyId];
  const profile = party ? dynamicPartyGoalProfile(state, party) : undefined;
  const context = materialContextForProposal(state, { countryId } as PoliticalProposal);
  if (!profile) return { agreementBps: 5_000, confidenceBps: 0, coverage: 'unavailable', positiveDrivers: [], negativeDrivers: ['Unknown party profile.'], tradeoffs: [] };
  let weighted = 0, weights = 0, confidenceWeighted = 0, evaluable = 0;
  const positiveDrivers: string[] = [];
  for (const issue of POLITICAL_ISSUES) {
    const preference = profile.goals[issue];
    const outcome = materialOutcomeFor(context, issue)?.valueBps;
    if (outcome === undefined) continue;
    evaluable += 1;
    const dissatisfaction = Math.abs(outcome - preference.idealPointBps);
    const weight = Math.max(1, preference.importanceBps);
    weighted += (clampAgreement(5_000 + (dissatisfaction - 2_500)) - 5_000) * weight;
    weights += weight;
    confidenceWeighted += preference.confidenceBps * weight;
    if (dissatisfaction >= 5_000) positiveDrivers.push(`${issue}: the government's record (${outcome} bps) is far from the party's position (${preference.idealPointBps} bps).`);
  }
  const coverage: PartyProposalEvaluation['coverage'] = evaluable === 0 ? 'unavailable' : evaluable === POLITICAL_ISSUES.length ? 'complete' : 'partial';
  return {
    agreementBps: weights ? clampAgreement(5_000 + Math.round(weighted / weights)) : 5_000,
    confidenceBps: weights ? clampAgreement(Math.round(confidenceWeighted / weights)) : 0,
    coverage, positiveDrivers, negativeDrivers: [], tradeoffs: [],
  };
};

/** A real censure procedure: a legislator moves no-confidence in the confidence chamber(s), each
 *  party's own positions (not a single common baseline) plus institutional self-interest decide,
 *  the internal vote distribution models defections, the seats of the responsible chamber(s)
 *  decide deterministically, and an adopted motion removes the head of government (and, for a
 *  government censure, the cabinet). Independents never enter the denominator: they cannot
 *  produce a vote in the model. An adopted censure triggers the constitutional consequence
 *  (parliament-chosen succession or a due direct election), so no Country stays headless. */
export function censureGovernment(state: SimulationState, countryId: string, actorPersonId: string): SimulationState {
  const responsibility = state.constitution.countries[countryId]?.government.responsibility ?? 'unavailable';
  if (!['government_censurable', 'leader_censurable'].includes(responsibility)) throw new Error('This Country\'s constitution does not provide for censure.');
  const actor = requirePerson(state, actorPersonId);
  if (!(actor.office?.countryId === countryId && actor.office.role === 'legislator')) throw new Error('Only a legislator may move a censure motion.');
  const entry = state.elections.countries[countryId];
  if (!entry) throw new Error('No parliamentary seat record for this Country.');
  const confidenceChamberIds = confidenceChamberIdsFor(state, countryId);
  if (!confidenceChamberIds.length) throw new Error('No chamber responsible for confidence is known; a censure cannot be evaluated.');
  const seats: Record<string, number> = {};
  let votingSeats = 0;
  for (const chamber of Object.values(entry.chambers)) {
    if (!confidenceChamberIds.includes(chamber.chamberId)) continue;
    votingSeats += Math.max(0, chamber.totalSeats - chamber.independentOtherSeats);
    for (const [partyId, count] of Object.entries(chamber.seatsByParty)) seats[partyId] = (seats[partyId] ?? 0) + count;
  }
  const censureEffect: InstitutionalPowerTransfer = {
    id: 'censure.confidence', lever: 'confidence_power', from: 'executive', to: 'none',
    confidenceBps: 10_000, coverage: 'complete', source: 'censure_motion',
    explanation: 'A successful censure removes the current executive.',
  };
  let yesSeats = 0, noSeats = 0, abstainSeats = 0;
  for (const partyId of politicalRegistry.countries[countryId]?.partyIds ?? []) {
    const partySeats = seats[partyId] ?? 0;
    if (partySeats <= 0) continue;
    const material = governmentRecordPartyEvaluation(state, countryId, partyId);
    const interest = evaluatePartyInstitutionalInterest(state, countryId, partyId, politicalRegistry, [censureEffect], material);
    const applied = applyPartyInstitutionalInterest(material, interest);
    // The party's own positions, its internal distribution and its defections decide how its seats
    // split — a party never votes as one block on a single common material baseline.
    const distribution = partyVoteDistributionFromAgreement(applied.agreementBps, applied.confidenceBps, applied.coverage,
      'Censure-vote internal plurality derived from the party\'s own evaluation of the government\'s material record; modelled, never observed faction data.');
    const allocation = allocatePartySeats(partySeats, distribution, { proposalId: 'censure', chamberId: confidenceChamberIds[0], partyId });
    yesSeats += allocation.yesSeats;
    noSeats += allocation.noSeats;
    abstainSeats += allocation.abstainSeats;
  }
  if (votingSeats <= 0 || yesSeats * 2 <= votingSeats) throw new Error('The censure motion fails without a majority of the chamber responsible for confidence.');
  let next = state;
  const head = Object.values(next.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
  if (head) next = revokePoliticalOffice(next, head.id);
  const kind = responsibility === 'government_censurable' ? 'government' : 'leader';
  if (responsibility === 'government_censurable') {
    const cabinet = next.governance.cabinets[countryId];
    if (cabinet) {
      let persons = next.governance.persons;
      for (const portfolio of Object.values(cabinet.portfolios)) {
        if (portfolio.ministerPersonId) persons = { ...persons, [portfolio.ministerPersonId]: { ...persons[portfolio.ministerPersonId], office: undefined } };
      }
      next = { ...next, governance: { ...next.governance, persons, cabinets: { ...next.governance.cabinets, [countryId]: { ...cabinet, viceLeaderPersonId: undefined, portfolios: Object.fromEntries(Object.entries(cabinet.portfolios).map(([id, portfolio]) => [id, { ...portfolio, ministerPersonId: undefined }])) } } } };
    }
  }
  const cabinet = next.governance.cabinets[countryId] ?? { countryId, portfolios: {} };
  next = { ...next, governance: { ...next.governance, cabinets: { ...next.governance.cabinets, [countryId]: { ...cabinet, censureEvents: [...(cabinet.censureEvents ?? []), { on: state.date, byPersonId: actorPersonId, kind }] } } } };
  // The constitutional consequence of an adopted censure: the Country is never left indefinitely
  // without a head of government on the modelled appointment paths.
  const appointmentMode = state.constitution.countries[countryId]?.government.appointmentMode ?? 'unavailable';
  if (appointmentMode === 'chosen_by_parliament') {
    const leading = Object.entries(seats).sort((a, b) => b[1] - a[1])[0];
    if (leading) {
      const leader = Object.values(next.governance.persons).find(p => p.status === 'active' && p.countryId === countryId && p.partyId === leading[0] && p.isPartyLeader);
      if (leader && leader.id !== head?.id) {
        next = transferPoliticalOffice(next, leader.id, { role: 'head_of_government', countryId });
        next = { ...next, elections: { ...next.elections, countries: { ...next.elections.countries, [countryId]: { ...entry, government: { coalitionPartyIds: [leading[0]], confidence: leading[1] * 2 > votingSeats ? 'majority' : 'minority' } } } } };
      }
    }
  } else if (appointmentMode === 'elected_directly') {
    // The recurring direct-election procedure runs at its own deadline; the censure makes it due now.
    next = { ...next, elections: { ...next.elections, countries: { ...next.elections.countries, [countryId]: { ...entry, nextDirectElectionDate: state.date } } } };
  }
  return next;
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

const cabinetFor = (state: SimulationState, countryId: string): GovernmentCabinet => state.governance.cabinets?.[countryId] ?? { countryId, portfolios: {}, censureEvents: [] };

/** Appoint a minister to a portfolio. Requires the head-of-government office. A person holding any
 *  other office is never silently overwritten: they must be removed from their current office first. */
export function appointMinister(state: SimulationState, countryId: string, actorPersonId: string, ministerPersonId: string, portfolioId: string, portfolioName: string): SimulationState {
  if (!isHeadOfGovernment(state, actorPersonId, countryId)) throw new Error('Only the head of government may appoint ministers.');
  const minister = state.governance.persons[ministerPersonId];
  if (!minister || minister.countryId !== countryId) throw new Error('Minister is not a person of this Country.');
  if (minister.office) throw new Error('This person already holds a political office; remove that office before appointing them as minister.');
  const cabinet = cabinetFor(state, countryId);
  if (Object.values(cabinet.portfolios).some(p => p.ministerPersonId === ministerPersonId)) throw new Error('This person already holds a portfolio.');
  const portfolio: Portfolio = { id: portfolioId, name: portfolioName, ministerPersonId };
  const office = { role: 'minister' as const, countryId, title: portfolioName, appointedOn: state.date, authorityProfile: { status: 'modelled_constitutional_abstraction' as const, capabilities: capabilitiesFor('minister'), limitation: 'Derived from constitutional office.' } };
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
 *  the constitution's vacancy-succession rule. Temporary succession records the predecessor so they
 *  may resume the office when active again. */
export function runGovernmentSuccession(state: SimulationState): SimulationState {
  let next = state;
  for (const [countryId, cabinet] of Object.entries(state.governance.cabinets ?? {})) {
    // Temporary succession return: the recorded predecessor resumes once active again.
    const acting = cabinet.actingHead;
    if (acting?.kind === 'deputy_temporary') {
      const predecessor = next.governance.persons[acting.predecessorPersonId];
      const actingPerson = next.governance.persons[acting.personId];
      if (predecessor && predecessor.status === 'active' && predecessor.id !== acting.personId) {
        next = revokePoliticalOffice(next, acting.personId);
        next = transferPoliticalOffice(next, predecessor.id, { role: 'head_of_government', countryId });
        continue;
      }
      if (!actingPerson || actingPerson.status !== 'active' || actingPerson.office?.role !== 'head_of_government') {
        // The acting arrangement lapsed; clear it.
        next = { ...next, governance: { ...next.governance, cabinets: { ...next.governance.cabinets, [countryId]: { ...cabinet, actingHead: undefined } } } };
      }
    }
    if (!cabinet.viceLeaderPersonId) continue;
    const head = Object.values(next.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
    if (head) continue;
    const vacancy = state.constitution.countries[countryId]?.government.vacancySuccession ?? 'unavailable';
    if (vacancy === 'unavailable') continue;
    const vice = next.governance.persons[cabinet.viceLeaderPersonId];
    if (!vice || vice.status !== 'active') continue;
    const predecessorId = cabinet.lastHeadPersonId;
    if (vacancy === 'deputy_permanent') {
      const predecessor = predecessorId ? next.governance.persons[predecessorId] : Object.values(next.governance.persons).find(p => p.id !== vice.id && p.office?.countryId === countryId && p.office.role === 'head_of_government');
      if (predecessor) next = revokePoliticalOffice(next, predecessor.id);
    }
    // The deputy takes over the head-of-government office through a real transfer: a deputy who was
    // a portfolio minister leaves the portfolio, so a head of government is never simultaneously
    // referenced as a minister.
    next = transferPoliticalOffice(next, vice.id, { role: 'head_of_government', countryId });
    if (vacancy === 'deputy_temporary' && predecessorId && predecessorId !== vice.id) {
      next = { ...next, governance: { ...next.governance, cabinets: { ...next.governance.cabinets, [countryId]: { ...cabinet, actingHead: { personId: vice.id, predecessorPersonId: predecessorId, since: state.date, kind: 'deputy_temporary' } } } } };
    } else if (vacancy === 'deputy_permanent') {
      next = { ...next, governance: { ...next.governance, cabinets: { ...next.governance.cabinets, [countryId]: { ...cabinet, lastHeadPersonId: vice.id, actingHead: undefined } } } };
    }
  }
  return next;
}

export const registerGovernmentTasks = (scheduler: import('../scheduler').SimulationScheduler) => scheduler.register({ id: 'government.monthly', cadence: 'monthly', priority: 450, run: runGovernmentSuccession });
