import type { SimulationState } from '../../types';
import { allocate } from '../socioeconomy/model';
import { fiscalReformFingerprint, scheduleFiscalReform, validateFiscalReform } from '../fiscal/runtime';
import { dateValid } from '../fiscal/math';
import { COHORT, POLITICAL_ISSUES, type PoliticalRegistry } from '../politics/model';
import { politicalRegistry } from '../politics/registry';
import { deterministicInteger } from '../rng';
import { addProposalResultBriefing } from '../information/runtime';
import { analyzeProposal, evaluatePartyProposal, evaluateProfileForPublic, GOVERNANCE_VOTE_THRESHOLDS } from './analysis';
import { AUTHORITY_CAPABILITIES, governanceFingerprint, type AuthorityCapability, type ChamberSupportEstimate, type FiscalProposalPayload, type GovernanceState, type LeadershipSuccession, type LegislativeVoteResult, type ParliamentarySupportEstimate, type PartyGoalProfile, type PoliticalOfficeRole, type PoliticalProposal, type ProposalAnalysis, type ProposalImpact, type PublicSupportEstimate } from './model';
const personId = (sequence: number) => `person.${sequence.toString().padStart(8, '0')}`;
const proposalId = (sequence: number) => `proposal.${sequence.toString().padStart(8, '0')}`;
const successionId = (sequence: number) => `succession.${sequence.toString().padStart(8, '0')}`;
const cloneGovernance = (state: SimulationState, governance: GovernanceState): SimulationState => ({ ...state, governance });
const requireCountry = (state: SimulationState, countryId: string) => { if (!state.engine.fidelityByCountry[countryId]) throw new Error(`Unknown Country: ${countryId}`); };
const requirePerson = (state: SimulationState, id: string) => { const person = state.governance.persons[id]; if (!person) throw new Error(`Unknown political person: ${id}`); return person; };
const requireControlled = (state: SimulationState, id: string) => { if (state.governance.player.controlledPersonId !== id) throw new Error('The proposer is not the controlled person.'); return requirePerson(state, id); };
const capabilitiesFor = (role: PoliticalOfficeRole): AuthorityCapability[] => role === 'head_of_government'
  ? ['sponsor_legislation', 'sponsor_fiscal_reform', 'sponsor_budget_reform', 'vote_legislation', 'access_government_information']
  : role === 'legislator' ? ['sponsor_legislation', 'vote_legislation'] : [];
const authorityLimitation = 'Generic modelled constitutional abstraction for gameplay; it is not an observed national constitutional rule.';
const leaderNameSyllables = ['Ari', 'Bel', 'Cor', 'Davi', 'Eli', 'Fari', 'Galen', 'Havi', 'Ira', 'Jori', 'Kavi', 'Lena', 'Mira', 'Navi', 'Oren', 'Pavi', 'Quin', 'Ravi', 'Sela', 'Tavi', 'Uma', 'Veli', 'Wren', 'Xavi', 'Yara', 'Zori'];
const leaderFamilySyllables = ['Aven', 'Borin', 'Ceren', 'Dalen', 'Evar', 'Feron', 'Galen', 'Halen', 'Iven', 'Jorin', 'Kalen', 'Lorin', 'Maren', 'Nerin', 'Ovan', 'Peren', 'Qorin', 'Ralen', 'Soren', 'Talen', 'Uren', 'Varen', 'Walen', 'Xeren', 'Yorin', 'Zalen'];
const LEADER_PROFILE_VARIATION_BPS = 250;
const SOURCE_LEADER_LIMITATION = 'No pinned, licensing-cleared party-leadership source applicable on 2026-01-01 is available in the ProjectAtlas political registry. The gameplay identity is fictional and is not a sourced real-person analogue.';

function fictionalLeaderName(state: SimulationState, partyId: string, eventKey: string, usedNames: Set<string>) {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const pick = (system: string, length: number) => deterministicInteger(state.engine.seed, { system, entityId: partyId, date: state.date, eventKey: `${eventKey}:${attempt}` }, 0, length);
    const given = `${leaderNameSyllables[pick('party-leadership.given-a', leaderNameSyllables.length)]}${leaderNameSyllables[pick('party-leadership.given-b', leaderNameSyllables.length)].toLowerCase()}`;
    const family = `${leaderFamilySyllables[pick('party-leadership.family-a', leaderFamilySyllables.length)]}${leaderFamilySyllables[pick('party-leadership.family-b', leaderFamilySyllables.length)].toLowerCase()}`;
    const name = `${given} ${family}`;
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

function leaderProvenance(partyId: string, method: 'party_platform_initial_v1' | 'bounded_party_platform_succession_v1', registry: PoliticalRegistry = politicalRegistry) {
  return {
    status: 'modelled_fallback' as const,
    method,
    sourcePartyId: registry.parties[partyId].sourceBasis.sourcePartyId,
    referenceDate: registry.referenceDate,
    sourceLeaderStatus: 'unavailable' as const,
    limitation: SOURCE_LEADER_LIMITATION,
  };
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
  return cloneGovernance(state, { ...state.governance, player: { controlledPersonId: id } });
}

export function setPartyMembership(state: SimulationState, personIdValue: string, partyId?: string): SimulationState {
  const person = requirePerson(state, personIdValue);
  if (person.isPartyLeader && partyId !== person.partyId) throw new Error('Replace a party leader through the leadership succession command before changing membership.');
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
  const leaders = Object.values(state.governance.persons).filter(person => person.partyId === partyId && person.isPartyLeader && person.status === 'active');
  if (leaders.length !== 1) throw new Error(`Party ${partyId} must have exactly one active leader before succession.`);
  const previous = leaders[0];
  let next = state, successor;
  let selection: LeadershipSuccession['selection'];
  if (successorPersonId) {
    successor = requirePerson(state, successorPersonId);
    if (successor.id === previous.id || successor.partyId !== partyId || successor.countryId !== party.countryId || successor.status !== 'active') throw new Error('An existing successor must be a different active member of the same party and Country.');
    selection = 'existing_party_member';
  } else {
    const id = personId(state.governance.nextPersonSequence);
    if (state.governance.persons[id]) throw new Error(`Political person sequence is already in use: ${id}.`);
    const usedNames = new Set(Object.values(state.governance.persons).map(person => person.displayName));
    successor = {
      id,
      displayName: fictionalLeaderName(state, partyId, `succession:${state.governance.nextSuccessionSequence}`, usedNames),
      countryId: party.countryId,
      createdOn: state.date,
      partyId,
      isPartyLeader: false,
      status: 'active' as const,
      leaderProfile: leaderProfileFor(partyId, id, state, true),
      leaderProvenance: leaderProvenance(partyId, 'bounded_party_platform_succession_v1'),
    };
    next = cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [id]: successor }, nextPersonSequence: state.governance.nextPersonSequence + 1 });
    selection = 'modelled_fallback';
  }
  const currentGovernance = next.governance;
  const successorPerson = {
    ...successor,
    isPartyLeader: true,
    leaderProfile: successor.leaderProfile ?? leaderProfileFor(partyId, successor.id, state, true),
    leaderProvenance: successor.leaderProvenance ?? leaderProvenance(partyId, 'bounded_party_platform_succession_v1'),
  };
  const previousPerson = { ...currentGovernance.persons[previous.id], isPartyLeader: false };
  const id = successionId(currentGovernance.nextSuccessionSequence);
  const succession: LeadershipSuccession = {
    id, partyId, countryId: party.countryId, previousPersonId: previous.id, newPersonId: successor.id,
    effectiveDate: state.date, selection,
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
        leaderProvenance: existing.leaderProvenance ?? leaderProvenance(party.id, 'party_platform_initial_v1', registry),
      } } });
      continue;
    }
    const id = personId(next.governance.nextPersonSequence);
    if (next.governance.persons[id]) throw new Error(`Political person sequence is already in use: ${id}.`);
    const usedNames = new Set(Object.values(next.governance.persons).map(person => person.displayName));
    const leader = {
      id,
      displayName: fictionalLeaderName(next, party.id, 'initial', usedNames),
      countryId: party.countryId,
      createdOn: next.date,
      partyId: party.id,
      isPartyLeader: true,
      status: 'active' as const,
      leaderProfile: leaderProfileFor(party.id, id, next, false, registry),
      leaderProvenance: leaderProvenance(party.id, 'party_platform_initial_v1', registry),
    };
    next = cloneGovernance(next, { ...next.governance, persons: { ...next.governance.persons, [id]: leader }, nextPersonSequence: next.governance.nextPersonSequence + 1 });
  }
  return { ...next, governance: { ...next.governance, leadersInitializedOn: next.date } };
}

export function assignPoliticalOffice(state: SimulationState, personIdValue: string, input: { role: PoliticalOfficeRole; countryId: string; appointedOn?: string; capabilities?: AuthorityCapability[] }): SimulationState {
  const person = requirePerson(state, personIdValue); requireCountry(state, input.countryId);
  const appointedOn = input.appointedOn ?? state.date;
  if (person.countryId !== input.countryId || !dateValid(appointedOn) || appointedOn > state.date || !state.governance.initializedOn || appointedOn < state.governance.initializedOn || appointedOn < person.createdOn) throw new Error('Office scope or appointment date is invalid.');
  const capabilities = [...new Set(input.capabilities ?? capabilitiesFor(input.role))].sort();
  if (capabilities.some(item => !AUTHORITY_CAPABILITIES.includes(item))) throw new Error('Unknown authority capability.');
  const office = { role: input.role, countryId: input.countryId, appointedOn, authorityProfile: { status: 'modelled_constitutional_abstraction' as const, capabilities, limitation: authorityLimitation } };
  return cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [person.id]: { ...person, office } } });
}

export function revokePoliticalOffice(state: SimulationState, personIdValue: string): SimulationState {
  const person = requirePerson(state, personIdValue); const { office: _office, ...withoutOffice } = person;
  return cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [person.id]: withoutOffice } });
}

function validatePayload(state: SimulationState, countryId: string, effectiveDate: string, payload: FiscalProposalPayload) {
  validateFiscalReform(state, { countryId, effectiveDate, ...payload });
}

export function createFiscalProposal(state: SimulationState, input: { proposerPersonId: string; countryId: string; effectiveDate: string; payload: FiscalProposalPayload }): SimulationState {
  const proposer = requirePerson(state, input.proposerPersonId); requireCountry(state, input.countryId);
  if (proposer.countryId !== input.countryId) throw new Error('Proposal Country does not match proposer scope.');
  validatePayload(state, input.countryId, input.effectiveDate, input.payload);
  const id = proposalId(state.governance.nextProposalSequence);
  const proposal: PoliticalProposal = { id, countryId: input.countryId, proposerPersonId: proposer.id, createdOn: state.date, kind: 'fiscal_reform', payload: structuredClone(input.payload), status: 'draft', effectiveDate: input.effectiveDate };
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [id]: proposal }, proposalOrder: [...state.governance.proposalOrder, id], nextProposalSequence: state.governance.nextProposalSequence + 1 });
}

export function replaceDraftProposal(state: SimulationState, proposalIdValue: string, input: { effectiveDate?: string; payload?: FiscalProposalPayload }): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal) throw new Error('Unknown political proposal.');
  if (proposal.status !== 'draft') throw new Error('Submitted proposal content is immutable.');
  const effectiveDate = input.effectiveDate ?? proposal.effectiveDate, payload = input.payload ?? proposal.payload;
  validatePayload(state, proposal.countryId, effectiveDate, payload);
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, effectiveDate, payload: structuredClone(payload) } } });
}

const hasCapability = (proposal: PoliticalProposal, person: ReturnType<typeof requirePerson>, capability: AuthorityCapability) => person.office?.countryId === proposal.countryId && person.office.authorityProfile.capabilities.includes(capability);
export function hasPoliticalAuthority(state: SimulationState, personIdValue: string, countryId: string, capability: AuthorityCapability): boolean {
  const person = state.governance.persons[personIdValue];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && person.office.authorityProfile.capabilities.includes(capability));
}
export function submitProposal(state: SimulationState, proposalIdValue: string): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || proposal.status !== 'draft') throw new Error('Only a draft proposal can be submitted.');
  const proposer = requireControlled(state, proposal.proposerPersonId);
  if (!hasCapability(proposal, proposer, 'sponsor_legislation') || proposal.payload.policy && !hasCapability(proposal, proposer, 'sponsor_fiscal_reform') || proposal.payload.annualBudget && !hasCapability(proposal, proposer, 'sponsor_budget_reform')) throw new Error('Controlled person lacks authority to submit this reform.');
  validatePayload(state, proposal.countryId, proposal.effectiveDate, proposal.payload);
  const frozen = structuredClone(proposal); frozen.status = 'submitted'; frozen.submittedOn = state.date; frozen.submittedPayloadFingerprint = governanceFingerprint({ effectiveDate: frozen.effectiveDate, payload: frozen.payload });
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: frozen } });
}

export function withdrawProposal(state: SimulationState, proposalIdValue: string): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || !['draft', 'submitted'].includes(proposal.status)) throw new Error('Proposal cannot be withdrawn.');
  requireControlled(state, proposal.proposerPersonId);
  return cloneGovernance(state, { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: { ...proposal, status: 'withdrawn', resolvedOn: state.date } } });
}

export function classifyProposalImpact(state: SimulationState, proposal: PoliticalProposal, analysisOverride?: ProposalAnalysis): ProposalImpact {
  const analysis = analysisOverride ?? analyzeProposal(state, proposal), issueDirectionsBps = Object.fromEntries(POLITICAL_ISSUES.map(issue => [issue, analysis.issueEffects[issue]])) as ProposalImpact['issueDirectionsBps'];
  const drivers = analysis.expectedConsequences.filter(item => POLITICAL_ISSUES.includes(item.goal as never)).map(item => ({ issue: item.goal as typeof POLITICAL_ISSUES[number], directionBps: item.directionBps, source: item.source, explanation: item.explanation }));
  return { issueDirectionsBps, drivers, method: 'fiscal_delta_v1', limitation: analysis.limitations.join(' ') };
}

export function estimatePublicSupport(state: SimulationState, proposal: PoliticalProposal, analysisOverride?: ProposalAnalysis): PublicSupportEstimate {
  const analysis = analysisOverride ?? analyzeProposal(state, proposal), impact = classifyProposalImpact(state, proposal, analysis); let yes = 0, no = 0, neutral = 0, unknown = 0, representedPersons = 0, knownPersons = 0, unknownPersons = 0, confidenceWeighted = 0;
  for (const [regionId, regional] of Object.entries(state.politics.regionalOpinion).sort(([a], [b]) => a.localeCompare(b))) {
    if (regional.countryId !== proposal.countryId) continue;
    const cohorts = state.socioeconomy.regions[regionId]?.cohorts ?? [];
    for (const [cohortId, opinion] of Object.entries(regional.cohorts).sort(([a], [b]) => a.localeCompare(b))) {
      const persons = cohorts.find(item => `${item.income}:${item.orientation}` === cohortId)?.persons ?? 0; if (!persons) continue;
      const goals = {} as PartyGoalProfile['goals']; POLITICAL_ISSUES.forEach((issue, index) => { const ideal = opinion[COHORT.preferences][index], importance = opinion[COHORT.salience][index], confidence = Math.min(7_000, opinion[COHORT.engagement]); goals[issue] = { idealPointBps: ideal, importanceBps: importance, compromiseToleranceBps: Math.max(1_500, Math.min(9_000, Math.round(8_000 - importance * 0.4 - Math.abs(ideal - 5_000) * 0.2))), confidenceBps: confidence, status: 'modelled_fallback' }; }); goals.fiscal_sustainability = { idealPointBps: 8_500, importanceBps: 2_000, compromiseToleranceBps: 7_500, confidenceBps: 1_000, status: 'modelled_common_constraint' };
      const evaluation = evaluateProfileForPublic(analysis, { partyId: `cohort:${cohortId}`, goals }), engaged = Math.max(1, opinion[COHORT.engagement]), weight = persons * engaged; representedPersons += persons; confidenceWeighted += evaluation.confidenceBps * persons;
      const eligible = evaluation.confidenceBps >= GOVERNANCE_VOTE_THRESHOLDS.minimumConfidenceBps && evaluation.coverage !== 'unavailable';
      if (!eligible) { unknown += weight; unknownPersons += persons; } else { knownPersons += persons; if (evaluation.agreementBps >= GOVERNANCE_VOTE_THRESHOLDS.yesAgreementBps) yes += weight; else if (evaluation.agreementBps <= GOVERNANCE_VOTE_THRESHOLDS.noAgreementBps) no += weight; else neutral += weight; }
    }
  }
  const totals = allocate(10_000, [yes, no, neutral, unknown || (!yes && !no && !neutral ? 1 : 0)]), coverage = !representedPersons || !knownPersons ? 'unavailable' : unknownPersons || analysis.coverage !== 'complete' ? 'partial' : 'complete';
  return { supportBps: totals[0], opposeBps: totals[1], neutralBps: totals[2], unknownBps: totals[3], confidenceBps: representedPersons ? Math.round(confidenceWeighted / representedPersons) : 0, coverage, representedPersons, knownPersons, unknownPersons, drivers: impact.drivers };
}

export function estimateParliamentarySupport(state: SimulationState, proposal: PoliticalProposal, registry: PoliticalRegistry = politicalRegistry, profiles: Record<string, PartyGoalProfile | undefined> = {}, analysisOverride?: ProposalAnalysis): ParliamentarySupportEstimate {
  const institution = registry.institutions[registry.countries[proposal.countryId]?.institutionId];
  if (!institution || institution.legislatureKind === 'none' || institution.legislatureKind === 'unavailable' || !institution.chambers.length) return { yesSeats: 0, noSeats: 0, abstainSeats: 0, unavailableSeats: 0, totalSeats: 0, chambers: [], coverage: 'unavailable', confidenceBps: 0, procedure: 'modelled_procedure_v1' };
  const analysis = analysisOverride ?? analyzeProposal(state, proposal), chambers: ChamberSupportEstimate[] = institution.chambers.map(chamber => {
    if (chamber.seatAllocationStatus !== 'sourced' || chamber.totalSeats === undefined) return { chamberId: chamber.id, yesSeats: 0, noSeats: 0, abstainSeats: 0, unavailableSeats: chamber.totalSeats ?? 0, totalSeats: chamber.totalSeats, coverage: 'unavailable', partyEvaluations: [] };
    let yesSeats = 0, noSeats = 0, abstainSeats = 0, unknownSeats = 0; const partyEvaluations: NonNullable<ChamberSupportEstimate['partyEvaluations']> = [];
    for (const [partyId, seats] of Object.entries(chamber.seatsByParty).sort(([a], [b]) => a.localeCompare(b))) { const evaluation = evaluatePartyProposal(state, proposal, partyId, registry, profiles[partyId], analysis); partyEvaluations.push({ ...evaluation, seats }); if (evaluation.vote === 'yes') yesSeats += seats; else if (evaluation.vote === 'no') noSeats += seats; else if (evaluation.vote === 'abstain') abstainSeats += seats; else unknownSeats += seats; }
    let unavailableSeats = unknownSeats + (chamber.independentOtherSeats ?? 0), allocated = yesSeats + noSeats + abstainSeats + unavailableSeats;
    if (allocated !== chamber.totalSeats) unavailableSeats = Math.max(unavailableSeats, chamber.totalSeats - yesSeats - noSeats - abstainSeats);
    const knownSeats = yesSeats + noSeats + abstainSeats, coverage = allocated !== chamber.totalSeats ? 'unavailable' : unavailableSeats === 0 ? 'complete' : knownSeats ? 'partial' : 'unavailable';
    return { chamberId: chamber.id, yesSeats, noSeats, abstainSeats, unavailableSeats, totalSeats: chamber.totalSeats, coverage, adopted: coverage === 'complete' ? yesSeats > noSeats : undefined, partyEvaluations };
  });
  const totalSeats = chambers.reduce((n, item) => n + (item.totalSeats ?? 0), 0), yesSeats = chambers.reduce((n, item) => n + item.yesSeats, 0), noSeats = chambers.reduce((n, item) => n + item.noSeats, 0), abstainSeats = chambers.reduce((n, item) => n + item.abstainSeats, 0), unavailableSeats = chambers.reduce((n, item) => n + item.unavailableSeats, 0);
  const coverage = chambers.every(item => item.coverage === 'complete') ? 'complete' : chambers.some(item => item.coverage !== 'unavailable') ? 'partial' : 'unavailable';
  const confidenceWeight = chambers.reduce((sum, chamber) => sum + (chamber.partyEvaluations ?? []).reduce((partySum, evaluation) => partySum + evaluation.confidenceBps * evaluation.seats, 0), 0);
  return { yesSeats, noSeats, abstainSeats, unavailableSeats, totalSeats, chambers, coverage, confidenceBps: totalSeats ? Math.round(confidenceWeight / totalSeats) : 0, procedure: 'modelled_procedure_v1' };
}

export function inspectProposalSupport(state: SimulationState, proposalIdValue: string, registry: PoliticalRegistry = politicalRegistry, profiles: Record<string, PartyGoalProfile | undefined> = {}) {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal) throw new Error('Unknown political proposal.');
  const analysis = analyzeProposal(state, proposal); return structuredClone({ analysis, impact: classifyProposalImpact(state, proposal, analysis), publicEstimate: estimatePublicSupport(state, proposal, analysis), parliamentaryEstimate: estimateParliamentarySupport(state, proposal, registry, profiles, analysis), informationStatus: 'engine_debug_reality' as const });
}

export function resolveProposalVote(state: SimulationState, proposalIdValue: string, registry: PoliticalRegistry = politicalRegistry, profiles: Record<string, PartyGoalProfile | undefined> = {}): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || proposal.status !== 'submitted') throw new Error('Only an unresolved submitted proposal can be voted.');
  const proposer = requireControlled(state, proposal.proposerPersonId);
  if (!hasCapability(proposal, proposer, 'vote_legislation')) throw new Error('Controlled person lacks authority to resolve this legislative vote.');
  const analysis = analyzeProposal(state, proposal), publicEstimate = estimatePublicSupport(state, proposal, analysis), parliamentaryEstimate = estimateParliamentarySupport(state, proposal, registry, profiles, analysis), expired = state.date > proposal.effectiveDate;
  const outcome = expired || parliamentaryEstimate.coverage !== 'complete' ? 'unavailable' : parliamentaryEstimate.chambers.every(item => item.adopted) ? 'adopted' : 'rejected', reason = expired ? 'effective_date_expired' as const : parliamentaryEstimate.coverage !== 'complete' ? 'institutional_data_unavailable' as const : undefined;
  const voteResult: LegislativeVoteResult = { ...parliamentaryEstimate, outcome, resolvedOn: state.date, reason };
  let next = state, scheduledFiscalReformSequence: number | undefined, enactmentReference: PoliticalProposal['enactmentReference'];
  if (outcome === 'adopted') { scheduledFiscalReformSequence = state.fiscal.nextSequence; const reformInput = { countryId: proposal.countryId, effectiveDate: proposal.effectiveDate, ...structuredClone(proposal.payload), origin: { type: 'governance_proposal' as const, proposalId: proposal.id, proposalFingerprint: proposal.submittedPayloadFingerprint! } }; enactmentReference = { fiscalReformSequence: scheduledFiscalReformSequence, reformFingerprint: fiscalReformFingerprint(reformInput) }; next = scheduleFiscalReform(state, reformInput); }
  const resolved: PoliticalProposal = { ...proposal, status: outcome === 'adopted' ? 'enacted' : outcome, resolvedOn: state.date, analysis, evaluationVersion: 'situational-0.14-v2', publicEstimate, parliamentaryEstimate, voteResult, scheduledFiscalReformSequence, enactmentReference };
  next = { ...next, governance: { ...next.governance, proposals: { ...next.governance.proposals, [proposal.id]: resolved } } };
  return addProposalResultBriefing(next, resolved);
}

export const inspectGovernance = (state: SimulationState) => structuredClone(state.governance);
export const inspectPlayer = (state: SimulationState) => structuredClone(state.governance.player.controlledPersonId ? state.governance.persons[state.governance.player.controlledPersonId] : undefined);
export const inspectProposal = (state: SimulationState, id: string) => structuredClone(state.governance.proposals[id]);
