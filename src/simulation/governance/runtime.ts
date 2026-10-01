import type { SimulationState } from '../../types';
import { allocate } from '../socioeconomy/model';
import { scheduleFiscalReform, validateFiscalReform } from '../fiscal/runtime';
import { dateValid } from '../fiscal/math';
import { type Budget, type TaxRule } from '../fiscal/model';
import { COHORT, POLITICAL_ISSUES, type PoliticalIssue, type PoliticalRegistry } from '../politics/model';
import { politicalRegistry } from '../politics/registry';
import { AUTHORITY_CAPABILITIES, governanceFingerprint, type AuthorityCapability, type ChamberSupportEstimate, type FiscalProposalPayload, type GovernanceState, type ParliamentarySupportEstimate, type PoliticalOfficeRole, type PoliticalProposal, type ProposalImpact, type PublicSupportEstimate } from './model';

const clampSigned = (value: number) => Math.max(-10_000, Math.min(10_000, Math.round(value)));
const personId = (sequence: number) => `person.${sequence.toString().padStart(8, '0')}`;
const proposalId = (sequence: number) => `proposal.${sequence.toString().padStart(8, '0')}`;
const cloneGovernance = (state: SimulationState, governance: GovernanceState): SimulationState => ({ ...state, governance });
const requireCountry = (state: SimulationState, countryId: string) => { if (!state.engine.fidelityByCountry[countryId]) throw new Error(`Unknown Country: ${countryId}`); };
const requirePerson = (state: SimulationState, id: string) => { const person = state.governance.persons[id]; if (!person) throw new Error(`Unknown political person: ${id}`); return person; };
const requireControlled = (state: SimulationState, id: string) => { if (state.governance.player.controlledPersonId !== id) throw new Error('The proposer is not the controlled person.'); return requirePerson(state, id); };
const capabilitiesFor = (role: PoliticalOfficeRole): AuthorityCapability[] => role === 'head_of_government'
  ? ['sponsor_legislation', 'sponsor_fiscal_reform', 'sponsor_budget_reform', 'vote_legislation']
  : role === 'legislator' ? ['sponsor_legislation', 'vote_legislation'] : [];
const authorityLimitation = 'Generic modelled constitutional abstraction for gameplay; it is not an observed national constitutional rule.';

export function initializeGovernance(state: SimulationState): GovernanceState {
  return state.governance?.initializedOn ? state.governance : { ...(state.governance ?? { version: 'governance-0.14-v1', player: {}, persons: {}, proposals: {}, proposalOrder: [], nextPersonSequence: 0, nextProposalSequence: 0 }), initializedOn: state.date };
}

export function createPoliticalPerson(state: SimulationState, input: { displayName: string; countryId: string; createdOn?: string; status?: 'active' | 'inactive' }): SimulationState {
  requireCountry(state, input.countryId);
  const createdOn = input.createdOn ?? state.date;
  if (!input.displayName.trim() || !dateValid(createdOn) || createdOn > state.date) throw new Error('Invalid political person identity or creation date.');
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
  if (partyId && politicalRegistry.parties[partyId]?.countryId !== person.countryId) throw new Error('Party membership must reference a party in the person\'s Country.');
  const changed = { ...person, partyId, isPartyLeader: partyId ? person.isPartyLeader : false };
  return cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [person.id]: changed } });
}

export function setPartyLeadership(state: SimulationState, personIdValue: string, isLeader: boolean): SimulationState {
  const person = requirePerson(state, personIdValue);
  if (isLeader && !person.partyId) throw new Error('A party leader must belong to a party.');
  return cloneGovernance(state, { ...state.governance, persons: { ...state.governance.persons, [person.id]: { ...person, isPartyLeader: isLeader } } });
}

export function assignPoliticalOffice(state: SimulationState, personIdValue: string, input: { role: PoliticalOfficeRole; countryId: string; appointedOn?: string; capabilities?: AuthorityCapability[] }): SimulationState {
  const person = requirePerson(state, personIdValue); requireCountry(state, input.countryId);
  const appointedOn = input.appointedOn ?? state.date;
  if (person.countryId !== input.countryId || !dateValid(appointedOn) || appointedOn > state.date) throw new Error('Office scope or appointment date is invalid.');
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

const ruleRate = (rule: TaxRule | null) => !rule ? 0 : rule.kind === 'personal' ? Math.round((rule.bands ?? []).reduce((n, band) => n + band.rateBps, 0) / Math.max(1, rule.bands?.length ?? 0)) : rule.kind === 'payroll' ? [...(rule.employee ?? []), ...(rule.employer ?? [])].reduce((n, item) => n + item.rateBps, 0) : rule.rateBps ?? 0;
const relativeBudgetDelta = (before: Budget, after: Budget, keys: (keyof Budget)[]) => { const oldValue = keys.reduce((n, key) => n + before[key], 0), delta = keys.reduce((n, key) => n + after[key] - before[key], 0); return oldValue ? clampSigned(delta * 5_000 / oldValue) : delta > 0 ? 5_000 : 0; };
export function classifyProposalImpact(state: SimulationState, proposal: PoliticalProposal): ProposalImpact {
  const current = state.fiscal.countries[proposal.countryId]; if (!current) throw new Error('Proposal Country has no fiscal state.');
  const issueDirectionsBps = Object.fromEntries(POLITICAL_ISSUES.map(issue => [issue, 0])) as Record<PoliticalIssue, number>, drivers: ProposalImpact['drivers'] = [];
  const add = (issue: PoliticalIssue, directionBps: number, source: string, explanation: string) => { if (!directionBps) return; issueDirectionsBps[issue] = clampSigned(issueDirectionsBps[issue] + directionBps); drivers.push({ issue, directionBps: clampSigned(directionBps), source, explanation }); };
  if (proposal.payload.policy) {
    const before = current.policy, after = proposal.payload.policy;
    const personal = ruleRate(after.personal) - ruleRate(before.personal), corporate = ruleRate(after.corporate) - ruleRate(before.corporate);
    add('fiscal_distribution', personal, 'policy.personal', `Representative personal-tax schedule changes by ${personal} bps.`);
    add('fiscal_distribution', Math.round(corporate / 2), 'policy.corporate', `Corporate statutory rate changes by ${corporate} bps; half-weighted as a distributional direction.`);
  }
  if (proposal.payload.annualBudget) {
    const before = current.annualBudget, after = proposal.payload.annualBudget;
    add('public_services', relativeBudgetDelta(before, after, ['health', 'education']), 'annualBudget.health+education', 'Direction derived from the real health and education appropriation delta.');
    add('income_security', relativeBudgetDelta(before, after, ['pensions', 'incomeSupport']), 'annualBudget.pensions+incomeSupport', 'Direction derived from the real pensions and income-support appropriation delta.');
    add('infrastructure', relativeBudgetDelta(before, after, ['infrastructure']), 'annualBudget.infrastructure', 'Direction derived from the real infrastructure appropriation delta.');
  }
  return { issueDirectionsBps, drivers, method: 'fiscal_delta_v1', limitation: 'Directional political classification of explicit fiscal deltas; this is not an economic forecast.' };
}

function stance(preferences: number[], salience: number[], impact: ProposalImpact) {
  let score = 0, weight = 0;
  POLITICAL_ISSUES.forEach((issue, index) => { const direction = impact.issueDirectionsBps[issue]; if (!direction) return; const issueWeight = Math.abs(direction) * Math.max(1, salience[index]); score += (preferences[index] - 5_000) * direction * issueWeight; weight += 5_000 * issueWeight; });
  return weight ? score / weight : 0;
}

export function estimatePublicSupport(state: SimulationState, proposal: PoliticalProposal): PublicSupportEstimate {
  const impact = classifyProposalImpact(state, proposal); let yes = 0, no = 0, neutral = 0, representedPersons = 0;
  for (const [regionId, regional] of Object.entries(state.politics.regionalOpinion).sort(([a], [b]) => a.localeCompare(b))) {
    if (regional.countryId !== proposal.countryId) continue;
    const cohorts = state.socioeconomy.regions[regionId]?.cohorts ?? [];
    for (const [cohortId, opinion] of Object.entries(regional.cohorts).sort(([a], [b]) => a.localeCompare(b))) {
      const persons = cohorts.find(item => `${item.income}:${item.orientation}` === cohortId)?.persons ?? 0; if (!persons) continue;
      representedPersons += persons; const score = stance(opinion[COHORT.preferences], opinion[COHORT.salience], impact), engaged = Math.max(1, opinion[COHORT.engagement]);
      if (score > 500) yes += persons * engaged; else if (score < -500) no += persons * engaged; else neutral += persons * engaged;
    }
  }
  const totals = allocate(10_000, [yes, no, neutral || (!yes && !no ? 1 : 0)]);
  return { supportBps: totals[0], opposeBps: totals[1], neutralBps: totals[2], coverage: representedPersons ? 'complete' : 'unavailable', representedPersons, drivers: impact.drivers };
}

function partyVote(proposal: PoliticalProposal, partyId: string, impact: ProposalImpact, registry: PoliticalRegistry): 'yes' | 'no' | 'abstain' {
  const party = registry.parties[partyId]; if (!party) return 'abstain';
  const active = POLITICAL_ISSUES.filter(issue => impact.issueDirectionsBps[issue] !== 0);
  if (!active.length) return 'abstain';
  let score = 0, confidence = 0;
  for (const issue of active) { const position = party.issuePositions[issue], direction = impact.issueDirectionsBps[issue]; score += (position.preferenceBps - 5_000) * direction * position.intensityBps * position.confidenceBps; confidence += position.confidenceBps; }
  const normalized = score / Math.max(1, active.length * 10_000 * 10_000 * 10_000);
  const meanConfidence = confidence / active.length;
  if (meanConfidence < 1_000 || Math.abs(normalized) < 0.02) return 'abstain';
  return normalized > 0 ? 'yes' : 'no';
}
const partyConfidence = (partyId: string, impact: ProposalImpact, registry: PoliticalRegistry) => {
  const party = registry.parties[partyId], active = POLITICAL_ISSUES.filter(issue => impact.issueDirectionsBps[issue] !== 0); if (!party || !active.length) return 0;
  return Math.round(active.reduce((sum, issue) => sum + party.issuePositions[issue].confidenceBps, 0) / active.length);
};

export function estimateParliamentarySupport(state: SimulationState, proposal: PoliticalProposal, registry: PoliticalRegistry = politicalRegistry): ParliamentarySupportEstimate {
  const institution = registry.institutions[registry.countries[proposal.countryId]?.institutionId], impact = classifyProposalImpact(state, proposal);
  if (!institution || institution.legislatureKind === 'none' || institution.legislatureKind === 'unavailable' || !institution.chambers.length) return { yesSeats: 0, noSeats: 0, abstainSeats: 0, unavailableSeats: 0, totalSeats: 0, chambers: [], coverage: 'unavailable', confidenceBps: 0, procedure: 'modelled_procedure_v1' };
  const chambers: ChamberSupportEstimate[] = institution.chambers.map(chamber => {
    if (chamber.seatAllocationStatus !== 'sourced' || chamber.totalSeats === undefined) return { chamberId: chamber.id, yesSeats: 0, noSeats: 0, abstainSeats: 0, unavailableSeats: chamber.totalSeats ?? 0, totalSeats: chamber.totalSeats, coverage: 'unavailable' };
    let yesSeats = 0, noSeats = 0, abstainSeats = 0;
    for (const [partyId, seats] of Object.entries(chamber.seatsByParty).sort(([a], [b]) => a.localeCompare(b))) { const vote = partyVote(proposal, partyId, impact, registry); if (vote === 'yes') yesSeats += seats; else if (vote === 'no') noSeats += seats; else abstainSeats += seats; }
    const unavailableSeats = chamber.independentOtherSeats ?? 0, allocated = yesSeats + noSeats + abstainSeats + unavailableSeats;
    const coverage = allocated === chamber.totalSeats ? unavailableSeats ? 'partial' : 'complete' : 'unavailable';
    return { chamberId: chamber.id, yesSeats, noSeats, abstainSeats, unavailableSeats: coverage === 'unavailable' ? Math.max(unavailableSeats, chamber.totalSeats - yesSeats - noSeats - abstainSeats) : unavailableSeats, totalSeats: chamber.totalSeats, coverage, adopted: coverage === 'complete' ? yesSeats > noSeats : undefined };
  });
  const totalSeats = chambers.reduce((n, item) => n + (item.totalSeats ?? 0), 0), yesSeats = chambers.reduce((n, item) => n + item.yesSeats, 0), noSeats = chambers.reduce((n, item) => n + item.noSeats, 0), abstainSeats = chambers.reduce((n, item) => n + item.abstainSeats, 0), unavailableSeats = chambers.reduce((n, item) => n + item.unavailableSeats, 0);
  const coverage = chambers.every(item => item.coverage === 'complete') ? 'complete' : chambers.some(item => item.coverage !== 'unavailable') ? 'partial' : 'unavailable';
  const confidenceWeight = institution.chambers.reduce((sum, chamber) => sum + Object.entries(chamber.seatsByParty).reduce((partySum, [partyId, seats]) => partySum + partyConfidence(partyId, impact, registry) * seats, 0), 0);
  return { yesSeats, noSeats, abstainSeats, unavailableSeats, totalSeats, chambers, coverage, confidenceBps: totalSeats ? Math.round(confidenceWeight / totalSeats) : 0, procedure: 'modelled_procedure_v1' };
}

export function inspectProposalSupport(state: SimulationState, proposalIdValue: string, registry: PoliticalRegistry = politicalRegistry) {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal) throw new Error('Unknown political proposal.');
  return structuredClone({ impact: classifyProposalImpact(state, proposal), publicEstimate: estimatePublicSupport(state, proposal), parliamentaryEstimate: estimateParliamentarySupport(state, proposal, registry), informationStatus: 'engine_debug_reality' as const });
}

export function resolveProposalVote(state: SimulationState, proposalIdValue: string, registry: PoliticalRegistry = politicalRegistry): SimulationState {
  const proposal = state.governance.proposals[proposalIdValue]; if (!proposal || proposal.status !== 'submitted') throw new Error('Only an unresolved submitted proposal can be voted.');
  const proposer = requireControlled(state, proposal.proposerPersonId);
  if (!hasCapability(proposal, proposer, 'vote_legislation')) throw new Error('Controlled person lacks authority to resolve this legislative vote.');
  const publicEstimate = estimatePublicSupport(state, proposal), parliamentaryEstimate = estimateParliamentarySupport(state, proposal, registry);
  const outcome = parliamentaryEstimate.coverage !== 'complete' ? 'unavailable' : parliamentaryEstimate.chambers.every(item => item.adopted) ? 'adopted' : 'rejected';
  const voteResult = { ...parliamentaryEstimate, outcome, resolvedOn: state.date } as const;
  let next = state, scheduledFiscalReformSequence: number | undefined;
  if (outcome === 'adopted') { scheduledFiscalReformSequence = state.fiscal.nextSequence; next = scheduleFiscalReform(state, { countryId: proposal.countryId, effectiveDate: proposal.effectiveDate, ...structuredClone(proposal.payload) }); }
  const resolved: PoliticalProposal = { ...proposal, status: outcome === 'adopted' ? 'enacted' : outcome, resolvedOn: state.date, publicEstimate, parliamentaryEstimate, voteResult, scheduledFiscalReformSequence };
  return { ...next, governance: { ...next.governance, proposals: { ...next.governance.proposals, [proposal.id]: resolved } } };
}

export const inspectGovernance = (state: SimulationState) => structuredClone(state.governance);
export const inspectPlayer = (state: SimulationState) => structuredClone(state.governance.player.controlledPersonId ? state.governance.persons[state.governance.player.controlledPersonId] : undefined);
export const inspectProposal = (state: SimulationState, id: string) => structuredClone(state.governance.proposals[id]);
