import type { SimulationState } from '../../types';
import type { PoliticalRegistry } from '../politics/model';
import { politicalRegistry } from '../politics/registry';
import type { AuthorityCapability, GovernanceState, PoliticalOfficeRole, PoliticalPersonState, PoliticalProposal } from './model';
import { nationalExecutiveAuthority, type NationalExecutiveAuthority } from './officeEvidence';

/**
 * The two — and only two — political starting routes of a new game.
 *
 * `national_leader` is the person who actually exercises national governmental authority, which the
 * engine establishes from sourced institutional evidence (a president in a presidential system, a
 * head of government in a parliamentary or parliamentary-monarchy system). A ceremonial head of
 * state, or any office whose authority the available evidence does not resolve, is never presented
 * as a national leader and never receives invented capabilities to make it playable.
 *
 * `opposition_party_leader` is the leader of a party whose opposition status is established for the
 * start date. Party leadership alone grants no executive authority: whatever the person holds comes
 * from their own office, never from choosing this route.
 */
export const POLITICAL_START_PATHS = ['national_leader', 'opposition_party_leader'] as const;
export type PoliticalStartPath = typeof POLITICAL_START_PATHS[number];

export interface PoliticalStartPathDescriptor {
  title: string;
  summary: string;
  /** A route never grants a capability by itself; it only selects an existing institutional position. */
  grantsCapabilities: false;
  limitation: string;
}
export const POLITICAL_START_PATH_DESCRIPTORS: Readonly<Record<PoliticalStartPath, PoliticalStartPathDescriptor>> = {
  national_leader: {
    title: 'National leader',
    summary: 'The office that actually exercises national governmental authority at the start date, as established by the sourced executive system and the reconciled office evidence.',
    grantsCapabilities: false,
    limitation: 'A head of state is not automatically an executive: in a parliamentary or parliamentary-monarchy system the executive office is the head of government, and an office whose authority is unresolved is not offered as a national leader. Whether the president or the prime minister leads a semi-presidential system is not resolved by the current registry, so neither is asserted.',
  },
  opposition_party_leader: {
    title: 'Opposition party leader',
    summary: 'The leader of a registered party whose opposition status is established at the start date.',
    grantsCapabilities: false,
    limitation: 'Party leadership grants no public office, no executive capability and no government information beyond what the person already holds. A party whose government/opposition status is unavailable is never treated as being in opposition.',
  },
};

export type PartyGovernmentStatus = 'government' | 'opposition' | 'unavailable';
export type PartyGovernmentStatusBasis =
  | 'elections_coalition'
  | 'sourced_governing_bloc'
  | 'no_established_governing_bloc'
  | 'ambiguous_governing_bloc'
  | 'contradictory_registry_evidence'
  | 'unregistered_party';

export interface PartyGovernmentStatusResolution {
  partyId: string;
  countryId: string;
  status: PartyGovernmentStatus;
  basis: PartyGovernmentStatusBasis;
  limitation: string;
}

/** Everything the start selection needs from the canonical state plus the static registry. */
export interface StartSelectionContext {
  readonly date: string;
  readonly registry: PoliticalRegistry;
  readonly governingCoalition: (countryId: string) => readonly string[] | undefined;
  readonly dynamicPartyCountryId: (partyId: string) => string | undefined;
  readonly dynamicPartyIds: (countryId: string) => readonly string[];
}

const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Builds the start-selection context. The canonical dynamic elections state decides the current
 *  governing coalition; the static registry is the dated fallback, never a second government. */
export function startSelectionContext(state: SimulationState, registry: PoliticalRegistry = politicalRegistry): StartSelectionContext {
  const dynamic = Object.values(state.politics?.organizations ?? {})
    .filter(organization => organization.type === 'party' && Boolean(organization.countryId))
    .sort((a, b) => compareIds(a.organizationId, b.organizationId));
  const dynamicCountryByParty = new Map(dynamic.map(organization => [organization.organizationId, organization.countryId!]));
  const dynamicByCountry = new Map<string, string[]>();
  for (const organization of dynamic) {
    const ids = dynamicByCountry.get(organization.countryId!) ?? [];
    ids.push(organization.organizationId);
    dynamicByCountry.set(organization.countryId!, ids);
  }
  return {
    date: state.date,
    registry,
    governingCoalition: countryId => {
      const coalition = state.elections?.countries?.[countryId]?.government?.coalitionPartyIds;
      return coalition && coalition.length ? [...new Set(coalition)].sort(compareIds) : undefined;
    },
    dynamicPartyCountryId: partyId => dynamicCountryByParty.get(partyId),
    dynamicPartyIds: countryId => [...(dynamicByCountry.get(countryId) ?? [])].sort(compareIds),
  };
}

/** Country of a party registered either in the static registry or as a dynamic political
 *  organization. `undefined` means the party is unknown; it is never assumed to belong anywhere. */
export function registeredPartyCountryId(context: StartSelectionContext, partyId: string): string | undefined {
  const party = context.registry.parties[partyId];
  if (party) return party.countryId;
  return context.dynamicPartyCountryId(partyId);
}

/** Resolves a party's government/opposition status for the context date. Missing or contradictory
 *  evidence yields `unavailable`: absence of a governing bloc never implies opposition. */
export function resolvePartyGovernmentStatus(context: StartSelectionContext, countryId: string, partyId: string): PartyGovernmentStatusResolution {
  const country = context.registry.countries[countryId];
  const party = context.registry.parties[partyId];
  const registered = party
    ? party.countryId === countryId && Boolean(country?.partyIds.includes(partyId))
    : context.dynamicPartyCountryId(partyId) === countryId;
  if (!registered) return {
    partyId, countryId, status: 'unavailable', basis: 'unregistered_party',
    limitation: `Party ${partyId} is not registered in this Country; no government or opposition status is inferred.`,
  };
  const coalition = context.governingCoalition(countryId);
  if (coalition) return {
    partyId, countryId,
    status: coalition.includes(partyId) ? 'government' : 'opposition',
    basis: 'elections_coalition',
    limitation: 'Status derives from the canonical governing coalition, initialized from the sourced governing bloc and updated only by real elections/government formation.',
  };
  const institution = country ? context.registry.institutions[country.institutionId] : undefined;
  const bloc = [...new Set(institution?.governingPartyIds ?? [])].filter(id => country?.partyIds.includes(id)).sort(compareIds);
  if (!bloc.length) return {
    partyId, countryId, status: 'unavailable', basis: 'no_established_governing_bloc',
    limitation: 'No reconciled governing bloc is established for this Country on the reference date, so government and opposition status are unavailable — opposition is never inferred from absent data.',
  };
  if (institution!.governingBlocDerivations.some(derivation => derivation.ambiguous)) return {
    partyId, countryId, status: 'unavailable', basis: 'ambiguous_governing_bloc',
    limitation: 'The governing-bloc derivation is ambiguous for this Country; a party is never declared opposition from ambiguous composition evidence.',
  };
  const membership = bloc.includes(partyId);
  const declared = party?.governmentStatus;
  if (declared !== undefined && declared !== 'unavailable' && (declared === 'government') !== membership) return {
    partyId, countryId, status: 'unavailable', basis: 'contradictory_registry_evidence',
    limitation: 'The static registry party status contradicts the reconciled governing bloc; the status is reported unavailable rather than guessed.',
  };
  return {
    partyId, countryId, status: membership ? 'government' : 'opposition', basis: 'sourced_governing_bloc',
    limitation: 'Status derives from the sourced governing bloc of the static political registry.',
  };
}

export interface StartingPersonAssessment {
  personId: string;
  displayName: string;
  countryId: string;
  path: PoliticalStartPath;
  eligible: boolean;
  /** Why the person cannot use this route. Empty exactly when `eligible` is true. */
  reasons: string[];
  /** The person's own reconciled national executive authority, whatever the route. */
  authority: NationalExecutiveAuthority;
  /** Present for the opposition route. */
  partyStatus?: PartyGovernmentStatusResolution;
}

/** Assesses one person against one start route. The route is a criterion over real institutional
 *  facts only: it never grants an office, a party or a capability. */
export function assessStartingPerson(context: StartSelectionContext, person: PoliticalPersonState, path: PoliticalStartPath, partyId?: string): StartingPersonAssessment {
  const authority = nationalExecutiveAuthority({ person, date: context.date, registry: context.registry });
  const reasons: string[] = [];
  if (person.status !== 'active') reasons.push('The person is inactive.');
  let partyStatus: PartyGovernmentStatusResolution | undefined;
  if (path === 'national_leader') {
    if (authority.status !== 'resolved') reasons.push(...authority.limitations);
  } else {
    if (person.status === 'active') {
      if (!person.isPartyLeader || !person.partyId) reasons.push('The person does not lead a registered party.');
      else if (partyId !== undefined && person.partyId !== partyId) reasons.push('The person does not lead the selected party.');
      else {
        partyStatus = resolvePartyGovernmentStatus(context, person.countryId, person.partyId);
        if (partyStatus.status === 'government') reasons.push('The party belongs to the current governing bloc, so it is not an opposition starting route.');
        else if (partyStatus.status === 'unavailable') reasons.push(partyStatus.limitation);
      }
    }
  }
  return {
    personId: person.id, displayName: person.displayName, countryId: person.countryId, path,
    eligible: reasons.length === 0, reasons, authority, ...(partyStatus ? { partyStatus } : {}),
  };
}

const personsOfCountry = (persons: readonly PoliticalPersonState[], countryId: string): PoliticalPersonState[] =>
  [...new Map(persons.filter(person => person.countryId === countryId).map(person => [person.id, person])).values()].sort((a, b) => compareIds(a.id, b.id));

/** Assessments for every recorded person of a Country, in stable id order (never registry or
 *  insertion order), including the people who are not eligible and why. */
export function startingPersonAssessments(context: StartSelectionContext, persons: readonly PoliticalPersonState[], countryId: string, path: PoliticalStartPath, partyId?: string): StartingPersonAssessment[] {
  return personsOfCountry(persons, countryId).map(person => assessStartingPerson(context, person, path, partyId));
}

/** Deterministic list of the people who may use a start route. `partyId` narrows the opposition
 *  route to one party; it never widens admission. */
export function startingPersonCandidates(context: StartSelectionContext, persons: readonly PoliticalPersonState[], countryId: string, path: PoliticalStartPath, partyId?: string): PoliticalPersonState[] {
  const assessments = new Map(startingPersonAssessments(context, persons, countryId, path, partyId).map(assessment => [assessment.personId, assessment]));
  return personsOfCountry(persons, countryId).filter(person => assessments.get(person.id)?.eligible);
}

export interface StartingOfficeSummary {
  role: PoliticalOfficeRole;
  title: string;
  authorityStatus: NationalExecutiveAuthority['status'];
  authorityBasis?: NationalExecutiveAuthority['basis'];
  executiveSystem: NationalExecutiveAuthority['system'];
  capabilities: AuthorityCapability[];
  /** Capabilities this office deliberately does not carry (e.g. the parliamentary suffrage), so an
   *  unavailable or non-modelled power is presented as such rather than silently missing. */
  withheldCapabilities: AuthorityCapability[];
  limitations: string[];
}

export interface StartingPersonOption {
  personId: string;
  displayName: string;
  countryId: string;
  paths: PoliticalStartPath[];
  partyId?: string;
  isPartyLeader: boolean;
  partyStatus?: PartyGovernmentStatusResolution;
  office?: StartingOfficeSummary;
  provenanceBasis?: NonNullable<PoliticalPersonState['leaderProvenance']>['basis'];
  provenanceLimitation?: string;
}

export interface StartingPartyOption {
  partyId: string;
  displayName: string;
  status: PartyGovernmentStatus;
  statusBasis: PartyGovernmentStatusBasis;
  limitation: string;
  /** Eligible leaders of this party for the opposition route (empty for a governing party). */
  leaderPersonIds: string[];
}

export interface StartingPathOptions {
  path: PoliticalStartPath;
  descriptor: PoliticalStartPathDescriptor;
  candidates: StartingPersonOption[];
  unavailable: Array<{ personId: string; displayName: string; reasons: string[] }>;
}

export interface CountryStartingOptions {
  countryId: string;
  playable: boolean;
  parties: StartingPartyOption[];
  paths: Record<PoliticalStartPath, StartingPathOptions>;
  /** Country-level reasons why a route is unavailable, ready for presentation. */
  unavailableReasons: string[];
}

const officeSummary = (authority: NationalExecutiveAuthority): StartingOfficeSummary | undefined => authority.role === undefined ? undefined : {
  role: authority.role,
  title: authority.title ?? authority.role,
  authorityStatus: authority.status,
  ...(authority.basis ? { authorityBasis: authority.basis } : {}),
  executiveSystem: authority.system,
  capabilities: [...authority.capabilities],
  withheldCapabilities: [...authority.withheldCapabilities],
  limitations: [...authority.limitations],
};

/** The canonical starting-point API: everything a start screen needs for one Country, with the
 *  admissible people, the admissible opposition parties, and the reasons for every gap. */
export function countryStartingOptions(state: SimulationState, countryId: string, registry: PoliticalRegistry = politicalRegistry): CountryStartingOptions {
  const context = startSelectionContext(state, registry);
  const persons = Object.values(state.governance.persons);
  const partyIds = [...new Set([...(registry.countries[countryId]?.partyIds ?? []), ...context.dynamicPartyIds(countryId)])].sort(compareIds);
  const assessments: Record<PoliticalStartPath, StartingPersonAssessment[]> = {
    national_leader: startingPersonAssessments(context, persons, countryId, 'national_leader'),
    opposition_party_leader: startingPersonAssessments(context, persons, countryId, 'opposition_party_leader'),
  };
  const options = new Map<string, StartingPersonOption>();
  for (const path of POLITICAL_START_PATHS) for (const assessment of assessments[path]) {
    if (!assessment.eligible) continue;
    const person = state.governance.persons[assessment.personId];
    const existing = options.get(assessment.personId);
    const partyStatus = assessment.partyStatus ?? existing?.partyStatus;
    const office = officeSummary(assessment.authority);
    options.set(assessment.personId, {
      personId: assessment.personId,
      displayName: assessment.displayName,
      countryId: assessment.countryId,
      paths: [...(existing?.paths ?? []), path],
      ...(person.partyId ? { partyId: person.partyId } : {}),
      isPartyLeader: person.isPartyLeader,
      ...(partyStatus ? { partyStatus } : {}),
      ...(office ? { office } : {}),
      ...(person.leaderProvenance ? { provenanceBasis: person.leaderProvenance.basis, provenanceLimitation: person.leaderProvenance.limitation } : {}),
    });
  }
  const parties: StartingPartyOption[] = partyIds.map(partyId => {
    const resolution = resolvePartyGovernmentStatus(context, countryId, partyId);
    return {
      partyId,
      displayName: registry.parties[partyId]?.displayName ?? state.politics?.organizations?.[partyId]?.displayName ?? partyId,
      status: resolution.status,
      statusBasis: resolution.basis,
      limitation: resolution.limitation,
      leaderPersonIds: assessments.opposition_party_leader.filter(assessment => assessment.eligible && state.governance.persons[assessment.personId]?.partyId === partyId).map(assessment => assessment.personId),
    };
  });
  const paths = Object.fromEntries(POLITICAL_START_PATHS.map(path => [path, {
    path,
    descriptor: POLITICAL_START_PATH_DESCRIPTORS[path],
    candidates: [...options.values()].filter(option => option.paths.includes(path)).sort((a, b) => compareIds(a.personId, b.personId)),
    unavailable: assessments[path].filter(assessment => !assessment.eligible).map(assessment => ({ personId: assessment.personId, displayName: assessment.displayName, reasons: [...assessment.reasons] })),
  }])) as Record<PoliticalStartPath, StartingPathOptions>;
  const unavailableReasons: string[] = [];
  if (paths.national_leader.candidates.length === 0) unavailableReasons.push(`No reconciled officeholder of this Country exercises a resolved national executive authority on ${state.date}; no authority is invented to make an officeholder playable.`);
  if (paths.opposition_party_leader.candidates.length === 0) unavailableReasons.push(`No registered party of this Country has an established opposition status on ${state.date}; opposition is never inferred from missing political data.`);
  return { countryId, playable: unavailableReasons.length < POLITICAL_START_PATHS.length, parties, paths, unavailableReasons };
}

/** Countries offering at least one authorized start route on the current state. */
export function selectableStartingCountryIds(state: SimulationState, registry: PoliticalRegistry = politicalRegistry): Set<string> {
  const context = startSelectionContext(state, registry);
  const countryIds = new Set<string>();
  for (const person of Object.values(state.governance.persons).sort((a, b) => compareIds(a.id, b.id))) {
    if (countryIds.has(person.countryId)) continue;
    if (POLITICAL_START_PATHS.some(path => assessStartingPerson(context, person, path).eligible)) countryIds.add(person.countryId);
  }
  return countryIds;
}

/** The authorized start routes a person may use. Empty means the person cannot start a new game. */
export function startingPathsForPerson(state: SimulationState, personId: string, registry: PoliticalRegistry = politicalRegistry): PoliticalStartPath[] {
  const person = state.governance.persons[personId];
  if (!person) return [];
  const context = startSelectionContext(state, registry);
  return POLITICAL_START_PATHS.filter(path => assessStartingPerson(context, person, path).eligible);
}

/** Start-time guard: a new game may only begin as one of the two authorized routes. Succession,
 *  player handoff and historical saves keep using `setControlledPerson` unchanged — this guard is
 *  deliberately scoped to the new-game entry point, never to player control in general. */
export function assertAuthorizedStartingPerson(state: SimulationState, personId: string, registry: PoliticalRegistry = politicalRegistry): PoliticalStartPath[] {
  const person = state.governance.persons[personId];
  if (!person) throw new Error(`Unknown political person: ${personId}.`);
  const context = startSelectionContext(state, registry);
  const paths = POLITICAL_START_PATHS.filter(path => assessStartingPerson(context, person, path).eligible);
  if (paths.length === 0) {
    const reasons = [...new Set(POLITICAL_START_PATHS.flatMap(path => assessStartingPerson(context, person, path).reasons))];
    throw new Error(`Person ${personId} is not an authorized new-game starting route: ${reasons.join(' ')}`);
  }
  return paths;
}

export function unresolvedFiscalProposals(governance: GovernanceState, countryId: string, personId: string): PoliticalProposal[] {
  return governance.proposalOrder.map(id => governance.proposals[id]).filter(proposal =>
    proposal.countryId === countryId && proposal.proposerPersonId === personId
    && proposal.kind === 'fiscal_reform' && (proposal.status === 'draft' || proposal.status === 'submitted'),
  );
}

export function selectUnresolvedFiscalProposal(governance: GovernanceState, countryId: string, personId: string, selectedId?: string): PoliticalProposal | undefined {
  const proposals = unresolvedFiscalProposals(governance, countryId, personId);
  return proposals.find(proposal => proposal.id === selectedId) ?? proposals.at(-1);
}
