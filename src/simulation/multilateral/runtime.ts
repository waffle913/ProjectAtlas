import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { isSimulationDate as validDate } from '../date';
import { hasInternationalAuthority } from '../international/runtime';
import { createExplicitCasusBelli, getRelation } from '../diplomacy';
import { applyInternationalAction } from '../international/runtime';
import { MULTILATERAL_MODEL, emptyMultilateral, multilateralDecisionId, multilateralObligationId, multilateralOrganizationId, multilateralTreatyId, multilateralViolationId, validTradeCategory, type MembershipRole, type Organization, type OrganizationDecision, type OrganizationDecisionPayload, type Treaty, type TreatyClause, type TreatyObligation, type TreatyViolation, type VoteChoice } from './model';

/** Initializes the empty multilateral domain; migration never fabricates treaties, organizations or memberships. */
export function initializeMultilateral(state: SimulationState): SimulationState {
  if (state.multilateral?.initializedOn) return state;
  return { ...state, multilateral: emptyMultilateral(state.date) };
}

export const hasTreatyAuthority = (state: SimulationState, countryId: string, personId: string): boolean => hasInternationalAuthority(state, countryId, personId);

function requireAuthority(state: SimulationState, countryId: string, personId: string) {
  if (!hasTreatyAuthority(state, countryId, personId)) throw new Error('Treaty action requires the controlled active person to hold a resolved executive office with government-information access in this Country.');
}

function partyOf(state: SimulationState, personId: string): string | undefined {
  return state.governance.persons[personId]?.countryId;
}

function addEvent(treaty: Treaty, date: string, kind: Treaty['history'][number]['kind'], countryId: string | undefined, detail: string): Treaty {
  return { ...treaty, history: [...treaty.history, { date, kind, countryId, detail }] };
}

function replaceTreaty(state: SimulationState, treaty: Treaty): SimulationState {
  return { ...state, multilateral: { ...state.multilateral, treaties: { ...state.multilateral.treaties, [treaty.id]: treaty } } };
}

/** Propose a new treaty. The submitted payload (parties, clauses, entry-into-force and withdrawal rules) is immutable once proposed. */
export function proposeTreaty(state: SimulationState, personId: string, input: { title: string; parties: string[]; clauses: TreatyClause[]; entryIntoForce: Treaty['entryIntoForce']; withdrawal: Treaty['withdrawal'] }): SimulationState {
  const countryId = partyOf(state, personId);
  if (!countryId) throw new Error('Treaty proposal requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  const parties = [...new Set(input.parties)].sort();
  if (parties.length < 2 || !parties.includes(countryId) || parties.some(party => !state.engine.fidelityByCountry[party])) throw new Error('Treaty parties must include the proposer and at least two registered Countries.');
  if (!input.title.trim()) throw new Error('Treaty title is required.');
  if (input.entryIntoForce.requiredRatifications < 1 || input.entryIntoForce.requiredRatifications > parties.length) throw new Error('Treaty entry-into-force rule exceeds its party count.');
  if (!Number.isSafeInteger(input.withdrawal.noticeDays) || input.withdrawal.noticeDays < 0) throw new Error('Treaty withdrawal notice must be a non-negative integer.');
  for (const clause of input.clauses) {
    const ids = clause.kind === 'defensive_guarantee' ? [clause.protectedCountryId, clause.obligatedCountryId]
      : clause.kind === 'non_aggression' ? [clause.partyAId, clause.partyBId]
      : clause.kind === 'trade_commitment' ? [clause.importerId, clause.exporterId]
      : clause.kind === 'sanctions_commitment' ? [clause.actorCountryId, clause.targetCountryId]
      : [clause.recognizedCountryId, clause.recognizingCountryId];
    if (ids.some(id => !parties.includes(id))) throw new Error('Treaty clause references a Country outside the treaty parties.');
  }
  const id = multilateralTreatyId(state.multilateral.nextTreatySequence);
  const treaty: Treaty = {
    id, title: input.title, parties, proposalDate: state.date, signatories: {}, ratifications: {},
    entryIntoForce: input.entryIntoForce, withdrawal: input.withdrawal, withdrawals: {}, status: 'proposed',
    clauses: input.clauses, provenance: { status: 'synthetic', limitation: 'Gameplay treaty; not an observed real-world agreement.' },
    history: [{ date: state.date, kind: 'proposed', countryId, detail: `Proposed by ${countryId}.` }],
  };
  return { ...state, multilateral: { ...state.multilateral, treaties: { ...state.multilateral.treaties, [id]: treaty }, treatyOrder: [...state.multilateral.treatyOrder, id], nextTreatySequence: state.multilateral.nextTreatySequence + 1 } };
}

export function signTreaty(state: SimulationState, treatyId: string, personId: string): SimulationState {
  const treaty = state.multilateral.treaties[treatyId];
  if (!treaty) throw new Error(`Unknown treaty: ${treatyId}`);
  const countryId = partyOf(state, personId);
  if (!countryId) throw new Error('Signing requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (!treaty.parties.includes(countryId)) throw new Error('Only a treaty party may sign.');
  if (!['proposed', 'signed'].includes(treaty.status)) throw new Error('This treaty can no longer be signed.');
  if (treaty.signatories[countryId]) throw new Error('This Country has already signed the treaty.');
  let next: Treaty = { ...treaty, signatories: { ...treaty.signatories, [countryId]: state.date }, status: 'signed' };
  next = addEvent(next, state.date, 'signed', countryId, `${countryId} signed.`);
  if (next.entryIntoForce.kind === 'signature' && next.parties.every(party => next.signatories[party])) {
    next = { ...next, status: 'active', activeOn: state.date };
    next = addEvent(next, state.date, 'entered_into_force', undefined, 'All parties signed; treaty entered into force.');
  }
  return replaceTreaty(state, next);
}

export function ratifyTreaty(state: SimulationState, treatyId: string, personId: string): SimulationState {
  const treaty = state.multilateral.treaties[treatyId];
  if (!treaty) throw new Error(`Unknown treaty: ${treatyId}`);
  const countryId = partyOf(state, personId);
  if (!countryId) throw new Error('Ratification requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (!treaty.parties.includes(countryId)) throw new Error('Only a treaty party may ratify.');
  if (treaty.status !== 'signed') throw new Error('Ratification requires a signed treaty.');
  if (!treaty.signatories[countryId]) throw new Error('A Country must sign before it ratifies.');
  if (treaty.ratifications[countryId]) throw new Error('This Country has already ratified the treaty.');
  const next: Treaty = { ...treaty, ratifications: { ...treaty.ratifications, [countryId]: state.date } };
  return replaceTreaty(state, addEvent(next, state.date, 'ratified', countryId, `${countryId} ratified.`));
}

export function activateTreaty(state: SimulationState, treatyId: string, personId: string): SimulationState {
  const treaty = state.multilateral.treaties[treatyId];
  if (!treaty) throw new Error(`Unknown treaty: ${treatyId}`);
  const countryId = partyOf(state, personId);
  if (!countryId) throw new Error('Activation requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (!treaty.parties.includes(countryId)) throw new Error('Only a treaty party may activate.');
  if (treaty.status !== 'signed') throw new Error('Only a signed treaty can be activated.');
  if (treaty.entryIntoForce.kind !== 'ratification') throw new Error('This treaty activates on signature, not a separate ratification step.');
  const ratified = treaty.parties.filter(party => treaty.ratifications[party]).length;
  if (ratified < treaty.entryIntoForce.requiredRatifications) throw new Error('The required ratification threshold has not been met.');
  let next: Treaty = { ...treaty, status: 'active', activeOn: state.date };
  next = addEvent(next, state.date, 'entered_into_force', countryId, 'Required ratifications met; treaty entered into force.');
  return replaceTreaty(state, next);
}

export function withdrawTreaty(state: SimulationState, treatyId: string, personId: string): SimulationState {
  const treaty = state.multilateral.treaties[treatyId];
  if (!treaty) throw new Error(`Unknown treaty: ${treatyId}`);
  const countryId = partyOf(state, personId);
  if (!countryId) throw new Error('Withdrawal requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (!treaty.parties.includes(countryId)) throw new Error('Only a treaty party may withdraw.');
  if (['terminated', 'expired'].includes(treaty.status)) throw new Error('This treaty is already terminated or expired.');
  if (treaty.withdrawals[countryId]) throw new Error('This Country has already withdrawn.');
  const withdrawals = { ...treaty.withdrawals, [countryId]: state.date };
  let next: Treaty = { ...treaty, withdrawals };
  next = addEvent(next, state.date, 'withdrawn', countryId, `${countryId} withdrew.`);
  if (next.parties.filter(party => !next.withdrawals[party]).length < 2) {
    next = { ...next, status: 'terminated', terminatedOn: state.date };
    next = addEvent(next, state.date, 'terminated', undefined, 'Fewer than two parties remain; treaty terminated.');
  }
  return replaceTreaty(state, next);
}

export function terminateTreaty(state: SimulationState, treatyId: string, personId: string): SimulationState {
  const treaty = state.multilateral.treaties[treatyId];
  if (!treaty) throw new Error(`Unknown treaty: ${treatyId}`);
  const countryId = partyOf(state, personId);
  if (!countryId) throw new Error('Termination requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (!treaty.parties.includes(countryId)) throw new Error('Only a treaty party may terminate.');
  if (!['active', 'suspended'].includes(treaty.status)) throw new Error('Only an active or suspended treaty may be terminated.');
  let next: Treaty = { ...treaty, status: 'terminated', terminatedOn: state.date };
  next = addEvent(next, state.date, 'terminated', countryId, `${countryId} terminated the treaty.`);
  return replaceTreaty(state, next);
}

export function validateTreatyDate(value: string): boolean {
  return validDate(value);
}

/** Applies active trade-commitment tariffs to represented 0.17 routes; never creates routes, goods, money or demand. */
export function applyTreatyTradeCommitments(state: SimulationState): SimulationState {
  const commitments: Extract<TreatyClause, { kind: 'trade_commitment' }>[] = [];
  for (const treaty of Object.values(state.multilateral.treaties)) {
    if (treaty.status !== 'active') continue;
    for (const clause of treaty.clauses) if (clause.kind === 'trade_commitment') commitments.push(clause);
  }
  if (!commitments.length) return state;
  const routes = state.trade.routes.map(route => {
    const commitment = commitments.find(c => c.exporterId === route.exporterId && c.importerId === route.importerId && c.categories.includes(route.category));
    return commitment ? { ...route, tariffBps: commitment.tariffBps } : route;
  });
  return { ...state, trade: { ...state.trade, routes } };
}

/** Monthly deterministic trigger evaluation: records defensive-guarantee obligations and non-aggression violations exactly once per war. */
export function runMultilateralMonth(state: SimulationState): SimulationState {
  if (!state.multilateral?.initializedOn) return state;
  let next = applyTreatyTradeCommitments(state);
  const activeWars = next.wars.filter(war => war.status === 'active');
  for (const treaty of Object.values(next.multilateral.treaties)) {
    if (treaty.status !== 'active') continue;
    const sinceOn = treaty.activeOn ?? treaty.proposalDate;
    for (const clause of treaty.clauses) {
      if (clause.kind === 'defensive_guarantee') {
        for (const war of activeWars) {
          if (war.defenderCountryId !== clause.protectedCountryId || war.attackerCountryId === clause.obligatedCountryId || war.startDate < sinceOn) continue;
          const exists = Object.values(next.multilateral.obligations).some(o => o.treatyId === treaty.id && o.warId === war.id);
          if (exists) continue;
          const id = multilateralObligationId(next.multilateral.nextObligationSequence);
          const obligation: TreatyObligation = { id, treatyId: treaty.id, kind: 'defensive_guarantee', protectedCountryId: clause.protectedCountryId, obligatedCountryId: clause.obligatedCountryId, warId: war.id, triggeredOn: next.date, status: 'pending' };
          next = { ...next, multilateral: { ...next.multilateral, obligations: { ...next.multilateral.obligations, [id]: obligation }, obligationOrder: [...next.multilateral.obligationOrder, id], nextObligationSequence: next.multilateral.nextObligationSequence + 1 } };
        }
      } else if (clause.kind === 'non_aggression') {
        for (const war of activeWars) {
          const isViolation = (war.attackerCountryId === clause.partyAId && war.defenderCountryId === clause.partyBId) || (war.attackerCountryId === clause.partyBId && war.defenderCountryId === clause.partyAId);
          if (!isViolation || war.startDate < sinceOn) continue;
          const exists = Object.values(next.multilateral.violations).some(v => v.treatyId === treaty.id && v.warId === war.id);
          if (exists) continue;
          const id = multilateralViolationId(next.multilateral.nextViolationSequence);
          const violation: TreatyViolation = { id, treatyId: treaty.id, kind: 'non_aggression', violatingCountryId: war.attackerCountryId, violatedAgainstCountryId: war.defenderCountryId, warId: war.id, violatedOn: next.date, detail: `${war.attackerCountryId} declared war on ${war.defenderCountryId}, violating the non-aggression obligation.` };
          next = { ...next, multilateral: { ...next.multilateral, violations: { ...next.multilateral.violations, [id]: violation }, violationOrder: [...next.multilateral.violationOrder, id], nextViolationSequence: next.multilateral.nextViolationSequence + 1 } };
        }
      }
    }
  }
  for (const decisionId of [...next.multilateral.decisionOrder]) {
    const decision = next.multilateral.decisions[decisionId];
    if (decision?.status === 'open' && decision.votingClosesOn <= next.date) {
      next = closeDecision(next, decisionId);
    }
  }
  return next;
}

/** The obligated guarantor honors (gains a retaliation casus belli) or violates (records the refusal) a triggered guarantee. */
export function resolveObligation(state: SimulationState, obligationId: string, personId: string, honor: boolean): SimulationState {
  const obligation = state.multilateral.obligations[obligationId];
  if (!obligation) throw new Error(`Unknown obligation: ${obligationId}`);
  const countryId = state.governance.persons[personId]?.countryId;
  if (!countryId) throw new Error('Obligation resolution requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (countryId !== obligation.obligatedCountryId) throw new Error('Only the obligated Country may resolve this guarantee.');
  if (obligation.status !== 'pending') throw new Error('This obligation has already been resolved.');
  const war = state.wars.find(item => item.id === obligation.warId);
  if (!war || war.status !== 'active') throw new Error('The qualifying war is no longer active.');
  let next: SimulationState = { ...state, multilateral: { ...state.multilateral, obligations: { ...state.multilateral.obligations, [obligationId]: { ...obligation, status: honor ? 'honored' : 'violated', resolvedOn: state.date } } } };
  if (honor) {
    next = createExplicitCasusBelli(next, { id: `cb.guarantee:${obligation.id}`, issuerCountryId: obligation.obligatedCountryId, targetCountryId: war.attackerCountryId, type: 'retaliation', creationDate: state.date, reason: `Defensive guarantee honored for ${obligation.protectedCountryId}.` }, { countryIds: new Set(Object.keys(state.engine.fidelityByCountry)), regionIds: new Set(Object.keys(state.regionOwnership)) });
  }
  return next;
}

export function establishOrganization(state: SimulationState, personId: string, input: { title: string; votingRule: Organization['votingRule'] }): SimulationState {
  const countryId = state.governance.persons[personId]?.countryId;
  if (!countryId) throw new Error('Establishing an organization requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (!input.title.trim()) throw new Error('Organization title is required.');
  if (!['majority', 'supermajority', 'unanimity'].includes(input.votingRule.kind)) throw new Error('Organization voting rule is invalid.');
  const id = multilateralOrganizationId(state.multilateral.nextOrganizationSequence);
  const organization: Organization = {
    id, title: input.title, establishedOn: state.date,
    members: { [countryId]: { role: 'member', joinedOn: state.date } },
    votingRule: input.votingRule,
    provenance: { status: 'synthetic', limitation: 'Gameplay organization; not an observed real-world organization.' },
    history: [{ date: state.date, kind: 'established', countryId, detail: `Established by ${countryId}.` }],
  };
  return { ...state, multilateral: { ...state.multilateral, organizations: { ...state.multilateral.organizations, [id]: organization }, organizationOrder: [...state.multilateral.organizationOrder, id], nextOrganizationSequence: state.multilateral.nextOrganizationSequence + 1 } };
}

export function joinOrganization(state: SimulationState, organizationId: string, personId: string, role: MembershipRole = 'member'): SimulationState {
  const organization = state.multilateral.organizations[organizationId];
  if (!organization) throw new Error(`Unknown organization: ${organizationId}`);
  const countryId = state.governance.persons[personId]?.countryId;
  if (!countryId) throw new Error('Accession requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (organization.members[countryId]) throw new Error('This Country is already a member or observer.');
  const next: Organization = {
    ...organization,
    members: { ...organization.members, [countryId]: { role, joinedOn: state.date } },
    history: [...organization.history, { date: state.date, kind: 'accession', countryId, detail: `${countryId} acceded as ${role}.` }],
  };
  return { ...state, multilateral: { ...state.multilateral, organizations: { ...state.multilateral.organizations, [organizationId]: next } } };
}

export function withdrawFromOrganization(state: SimulationState, organizationId: string, personId: string): SimulationState {
  const organization = state.multilateral.organizations[organizationId];
  if (!organization) throw new Error(`Unknown organization: ${organizationId}`);
  const countryId = state.governance.persons[personId]?.countryId;
  if (!countryId) throw new Error('Withdrawal requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (!organization.members[countryId]) throw new Error('This Country is not a member or observer.');
  const members = { ...organization.members }; delete members[countryId];
  const next: Organization = { ...organization, members, history: [...organization.history, { date: state.date, kind: 'withdrawal', countryId, detail: `${countryId} withdrew.` }] };
  return { ...state, multilateral: { ...state.multilateral, organizations: { ...state.multilateral.organizations, [organizationId]: next } } };
}

function nextDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validateDecisionPayload(payload: OrganizationDecisionPayload, state: SimulationState): void {
  const country = (id: string) => { if (!state.engine.fidelityByCountry[id]) throw new Error(`Unknown Country: ${id}`); };
  if (payload.kind === 'condemnation') { country(payload.targetCountryId); if (!payload.reason.trim()) throw new Error('Condemnation requires a reason.'); }
  else if (payload.kind === 'coordinated_sanctions') { country(payload.targetCountryId); if (!payload.categories.length || payload.categories.some(c => !validTradeCategory(c))) throw new Error('Coordinated sanctions require valid trade categories.'); }
  else if (payload.kind === 'membership') { country(payload.applicantCountryId); if (!['member', 'observer'].includes(payload.role)) throw new Error('Membership role is invalid.'); }
  else if (payload.kind === 'trade_commitment') { country(payload.importerId); country(payload.exporterId); if (payload.importerId === payload.exporterId || !payload.categories.length || payload.categories.some(c => !validTradeCategory(c)) || (payload.tariffBps !== null && (!Number.isSafeInteger(payload.tariffBps) || payload.tariffBps < 0 || payload.tariffBps > 10000))) throw new Error('Trade commitment payload is invalid.'); }
}

export function proposeDecision(state: SimulationState, organizationId: string, personId: string, payload: OrganizationDecisionPayload, votingDurationDays = 30): SimulationState {
  const organization = state.multilateral.organizations[organizationId];
  if (!organization) throw new Error(`Unknown organization: ${organizationId}`);
  const countryId = state.governance.persons[personId]?.countryId;
  if (!countryId) throw new Error('Proposing requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (organization.members[countryId]?.role !== 'member') throw new Error('Only a voting member may propose a decision.');
  validateDecisionPayload(payload, state);
  const id = multilateralDecisionId(state.multilateral.nextDecisionSequence);
  const decision: OrganizationDecision = { id, organizationId, proposerCountryId: countryId, proposerPersonId: personId, payload, proposalDate: state.date, votingClosesOn: nextDate(state.date, votingDurationDays), status: 'open', votes: {}, appliedEffectIds: [] };
  return { ...state, multilateral: { ...state.multilateral, decisions: { ...state.multilateral.decisions, [id]: decision }, decisionOrder: [...state.multilateral.decisionOrder, id], nextDecisionSequence: state.multilateral.nextDecisionSequence + 1 } };
}

export function voteOnDecision(state: SimulationState, decisionId: string, personId: string, choice: VoteChoice): SimulationState {
  const decision = state.multilateral.decisions[decisionId];
  if (!decision) throw new Error(`Unknown decision: ${decisionId}`);
  if (decision.status !== 'open') throw new Error('Voting has closed.');
  const organization = state.multilateral.organizations[decision.organizationId];
  const countryId = state.governance.persons[personId]?.countryId;
  if (!countryId) throw new Error('Voting requires a controlled active person.');
  requireAuthority(state, countryId, personId);
  if (organization.members[countryId]?.role !== 'member') throw new Error('Only voting members may vote.');
  if (!['yes', 'no', 'abstain', 'unknown'].includes(choice)) throw new Error('Invalid vote choice.');
  return { ...state, multilateral: { ...state.multilateral, decisions: { ...state.multilateral.decisions, [decisionId]: { ...decision, votes: { ...decision.votes, [countryId]: choice } } } } };
}

function evaluateDecision(decision: OrganizationDecision, organization: Organization): 'adopted' | 'rejected' {
  const eligible = Object.keys(organization.members).filter(id => organization.members[id].role === 'member');
  if (!eligible.length) return 'rejected';
  let yes = 0, no = 0, abstain = 0;
  for (const id of eligible) {
    const vote = decision.votes[id] ?? 'unknown';
    if (vote === 'yes') yes += 1; else if (vote === 'no') no += 1; else if (vote === 'abstain') abstain += 1;
  }
  const cast = yes + no + abstain;
  if (!cast) return 'rejected';
  const rule = organization.votingRule;
  if (rule.quorumBps !== undefined && cast * 10000 < rule.quorumBps * eligible.length) return 'rejected';
  if (rule.kind === 'majority') return yes > no ? 'adopted' : 'rejected';
  if (rule.kind === 'supermajority') return yes * 10000 >= (rule.thresholdBps ?? 6667) * (yes + no) ? 'adopted' : 'rejected';
  return no === 0 && yes > 0 ? 'adopted' : 'rejected';
}

export function closeDecision(state: SimulationState, decisionId: string): SimulationState {
  const decision = state.multilateral.decisions[decisionId];
  if (!decision) throw new Error(`Unknown decision: ${decisionId}`);
  if (decision.status !== 'open') return state;
  const organization = state.multilateral.organizations[decision.organizationId];
  const result = evaluateDecision(decision, organization);
  let next: SimulationState = { ...state, multilateral: { ...state.multilateral, decisions: { ...state.multilateral.decisions, [decisionId]: { ...decision, status: result === 'adopted' ? 'adopted' as const : 'rejected' as const, result, adoptedOn: result === 'adopted' ? state.date : undefined } } } };
  if (result === 'adopted') next = applyDecisionEffects(next, decisionId);
  return next;
}

function applyDecisionEffects(state: SimulationState, decisionId: string): SimulationState {
  const decision = state.multilateral.decisions[decisionId];
  if (!decision || decision.result !== 'adopted' || decision.appliedEffectIds.length) return state;
  const organization = state.multilateral.organizations[decision.organizationId];
  const members = Object.keys(organization.members).filter(id => organization.members[id].role === 'member');
  const payload = decision.payload;
  const applied: string[] = [];
  let next = state;
  if (payload.kind === 'condemnation') {
    for (const member of members) {
      next = applyInternationalAction(next, { actorCountryId: member, targetCountryId: payload.targetCountryId, kind: 'condemnation', categories: [], declaredByPersonId: decision.proposerPersonId, provenance: 'modelled', limitation: payload.reason });
      applied.push(`condemnation:${member}:${decisionId}`);
    }
  } else if (payload.kind === 'coordinated_sanctions') {
    for (const member of members) {
      next = applyInternationalAction(next, { actorCountryId: member, targetCountryId: payload.targetCountryId, kind: payload.restriction, categories: payload.categories, declaredByPersonId: decision.proposerPersonId, provenance: 'modelled', limitation: `Coordinated multilateral decision ${decisionId}.` });
      applied.push(`sanction:${member}:${decisionId}`);
    }
  } else if (payload.kind === 'membership') {
    const org = next.multilateral.organizations[decision.organizationId];
    if (!org.members[payload.applicantCountryId]) {
      const updated: Organization = { ...org, members: { ...org.members, [payload.applicantCountryId]: { role: payload.role, joinedOn: next.date } }, history: [...org.history, { date: next.date, kind: 'accession', countryId: payload.applicantCountryId, detail: `Admitted by decision ${decisionId}.` }] };
      next = { ...next, multilateral: { ...next.multilateral, organizations: { ...next.multilateral.organizations, [decision.organizationId]: updated } } };
    }
    applied.push(`membership:${payload.applicantCountryId}`);
  } else if (payload.kind === 'trade_commitment') {
    next = { ...next, trade: { ...next.trade, routes: next.trade.routes.map(route => route.exporterId === payload.exporterId && route.importerId === payload.importerId && payload.categories.includes(route.category) ? { ...route, tariffBps: payload.tariffBps } : route) } };
    applied.push(`trade:${payload.exporterId}:${payload.importerId}`);
  }
  return { ...next, multilateral: { ...next.multilateral, decisions: { ...next.multilateral.decisions, [decisionId]: { ...next.multilateral.decisions[decisionId], appliedEffectIds: [...next.multilateral.decisions[decisionId].appliedEffectIds, ...applied] } } } };
}

export const registerMultilateralTasks = (scheduler: SimulationScheduler) => scheduler
  .register({ id: 'multilateral.ai', cadence: 'monthly', priority: MULTILATERAL_MODEL.schedulerPriority - 1, run: runMultilateralAI })
  .register({ id: 'multilateral.monthly', cadence: 'monthly', priority: MULTILATERAL_MODEL.schedulerPriority, run: runMultilateralMonth });

function aiControlledCountry(state: SimulationState): string | undefined {
  const personId = state.governance.player.controlledPersonId;
  return personId ? state.governance.persons[personId]?.countryId : undefined;
}

function aiShouldSign(state: SimulationState, countryId: string, treaty: Treaty): boolean {
  const others = treaty.parties.filter(party => party !== countryId);
  const protectsSelf = treaty.clauses.some(clause => clause.kind === 'defensive_guarantee' && clause.protectedCountryId === countryId);
  return protectsSelf || others.every(other => getRelation(state, countryId, other).score >= 0);
}

function aiVote(state: SimulationState, countryId: string, decision: OrganizationDecision): VoteChoice {
  const payload = decision.payload;
  if (payload.kind === 'condemnation' || payload.kind === 'coordinated_sanctions') {
    const relation = getRelation(state, countryId, payload.targetCountryId);
    return relation.status === 'hostile' ? 'yes' : relation.status === 'friendly' ? 'no' : 'abstain';
  }
  if (payload.kind === 'membership') {
    const relation = getRelation(state, countryId, payload.applicantCountryId);
    return relation.status === 'friendly' ? 'yes' : relation.status === 'hostile' ? 'no' : 'abstain';
  }
  if (payload.kind === 'trade_commitment') {
    return getRelation(state, countryId, payload.exporterId).status === 'hostile' ? 'no' : 'yes';
  }
  return 'abstain';
}

/** Bounded deterministic V1 diplomatic AI: acts only for non-player Countries, from represented relations and clause/payload context, never fabricated knowledge. */
export function runMultilateralAI(state: SimulationState): SimulationState {
  if (!state.multilateral?.initializedOn) return state;
  let next = state;
  const playerCountry = aiControlledCountry(state);
  for (const treaty of Object.values(next.multilateral.treaties)) {
    for (const countryId of treaty.parties) {
      if (countryId === playerCountry) continue;
      if (treaty.status === 'proposed' && !treaty.signatories[countryId] && aiShouldSign(next, countryId, treaty)) {
        next = { ...next, multilateral: { ...next.multilateral, treaties: { ...next.multilateral.treaties, [treaty.id]: { ...treaty, signatories: { ...treaty.signatories, [countryId]: next.date }, status: 'signed', history: [...treaty.history, { date: next.date, kind: 'signed', countryId, detail: `${countryId} signed.` }] } } } };
      }
    }
    const signed = next.multilateral.treaties[treaty.id];
    if (signed.status === 'signed' && signed.entryIntoForce.kind === 'ratification') {
      for (const countryId of signed.parties) {
        if (countryId === playerCountry || !signed.signatories[countryId] || signed.ratifications[countryId]) continue;
        if (aiShouldSign(next, countryId, signed)) {
          next = { ...next, multilateral: { ...next.multilateral, treaties: { ...next.multilateral.treaties, [signed.id]: { ...signed, ratifications: { ...signed.ratifications, [countryId]: next.date }, history: [...signed.history, { date: next.date, kind: 'ratified', countryId, detail: `${countryId} ratified.` }] } } } };
        }
      }
    }
  }
  for (const decision of Object.values(next.multilateral.decisions)) {
    if (decision.status !== 'open') continue;
    const organization = next.multilateral.organizations[decision.organizationId];
    for (const countryId of Object.keys(organization.members)) {
      if (countryId === playerCountry || organization.members[countryId].role !== 'member' || decision.votes[countryId]) continue;
      const choice = aiVote(next, countryId, decision);
      next = { ...next, multilateral: { ...next.multilateral, decisions: { ...next.multilateral.decisions, [decision.id]: { ...decision, votes: { ...decision.votes, [countryId]: choice } } } } };
    }
  }
  for (const obligation of Object.values(next.multilateral.obligations)) {
    if (obligation.status !== 'pending' || obligation.obligatedCountryId === playerCountry) continue;
    const honor = getRelation(next, obligation.obligatedCountryId, obligation.protectedCountryId).status === 'friendly';
    next = { ...next, multilateral: { ...next.multilateral, obligations: { ...next.multilateral.obligations, [obligation.id]: { ...obligation, status: honor ? 'honored' : 'violated', resolvedOn: next.date } } } };
  }
  return next;
}