import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { politicalRegistry } from '../politics/registry';
import type { PoliticalRegistry } from '../politics/model';
import type { GovernanceGoal, PartyGoalProfile } from '../governance/model';
import { derivePartyGoalProfile, analyzeProposal } from '../governance/analysis';
import { derivePartyInstitutionalStake } from '../governance/institutionalInterest';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { runElection } from '../elections/runtime';
import { evaluatePartyInstitutionalInterest } from '../governance/institutionalInterest';
import { createFiscalProposal, createPoliticalPerson, assignPoliticalOffice, setControlledPerson, submitProposalForActor, resolveProposalVoteForActor, overrideParliamentaryRejection, decideConsultativeProposal, censureGovernment, appointMinister, runGovernmentSuccession, revokePoliticalOffice, estimateParliamentarySupport, inspectProposalSupport, createConstitutionalAmendmentProposal, holdReferendum } from '../governance/runtime';

let initial: ReturnType<typeof initializeNewGame>;
beforeAll(() => { initial = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs); }, 30_000);

const completeCountryIds = () => Object.values(politicalRegistry.countries).filter(country => {
  const institution = politicalRegistry.institutions[country.institutionId];
  return Boolean(institution?.chambers.length && institution.chambers.every(chamber => chamber.seatAllocationStatus === 'sourced' && chamber.totalSeats !== undefined && (chamber.independentOtherSeats ?? 0) === 0 && Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0) === chamber.totalSeats));
}).map(country => country.countryId);

function executive(state = initial, countryId = worldCountryIds[0]) {
  let next = createPoliticalPerson(state, { displayName: `0.23 governance executive ${countryId}`, countryId });
  const id = Object.keys(next.governance.persons).at(-1)!;
  return setControlledPerson(assignPoliticalOffice(next, id, { role: 'head_of_government', countryId }), id);
}

function legislator(state: ReturnType<typeof executive>, countryId = worldCountryIds[0]) {
  let next = createPoliticalPerson(state, { displayName: `0.23 governance legislator ${countryId}`, countryId });
  const id = Object.keys(next.governance.persons).at(-1)!;
  return { state: assignPoliticalOffice(next, id, { role: 'legislator', countryId }), id };
}

function fiscalDraft(state: ReturnType<typeof executive>, personId: string, countryId: string) {
  const current = state.fiscal.countries[countryId].annualBudget;
  return createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { annualBudget: { ...current, infrastructure: current.infrastructure * 2 } } });
}

/** Find a deterministic country fixture whose parliamentary estimate is complete and matches the
 *  requested adoption outcome, mirroring the validated policy-framework fixture selection. */
function findFixture(adopted: boolean) {
  for (const countryId of completeCountryIds()) {
    const base = executive(initial, countryId);
    const personId = base.governance.player.controlledPersonId!;
    let next = fiscalDraft(base, personId, countryId);
    const proposalId = next.governance.proposalOrder.at(-1)!;
    const registry = structuredClone(politicalRegistry) as PoliticalRegistry;
    const analysis = inspectProposalSupport(next, proposalId).analysis;
    const profiles: Record<string, PartyGoalProfile> = {};
    for (const partyId of politicalRegistry.countries[countryId].partyIds) {
      const overrides: Partial<Record<GovernanceGoal, Partial<PartyGoalProfile['goals'][GovernanceGoal]>>> = {};
      for (const [goal, direction] of Object.entries(analysis.issueEffects) as Array<[GovernanceGoal, number]>) {
        if (direction) overrides[goal] = { idealPointBps: direction > 0 === adopted ? 10_000 : 0, importanceBps: 10_000, compromiseToleranceBps: adopted ? 10_000 : 0, confidenceBps: 10_000, status: 'sourced_or_partial_prior' };
      }
      profiles[partyId] = derivePartyGoalProfile(politicalRegistry.parties[partyId], overrides);
    }
    const estimate = estimateParliamentarySupport(next, next.governance.proposals[proposalId], registry, profiles);
    if (estimate.coverage === 'complete' && estimate.chambers.every(chamber => Boolean(chamber.adopted) === adopted)) {
      next = submitProposalForActor(next, proposalId, personId);
      return { state: next, proposalId, personId, countryId, registry, profiles };
    }
  }
  throw new Error(`No ${adopted ? 'adopted' : 'rejected'} deterministic fixture in the current registry.`);
}

describe('0.23 governance procedures', () => {
  it('lets a none-power parliament proceed without a vote and a consultative parliament record a non-binding opinion', () => {
    const fixture = findFixture(true);
    const withPower = (power: 'none' | 'consultative') => ({ ...fixture.state, constitution: { ...fixture.state.constitution, countries: { ...fixture.state.constitution.countries, [fixture.countryId]: { ...fixture.state.constitution.countries[fixture.countryId], parliament: { ...fixture.state.constitution.countries[fixture.countryId].parliament, power } } } } });
    const noneResolved = resolveProposalVoteForActor(withPower('none'), fixture.proposalId, fixture.personId, fixture.registry, fixture.profiles);
    expect(noneResolved.governance.proposals[fixture.proposalId].status).toBe('enacted');
    expect(noneResolved.governance.proposals[fixture.proposalId].voteResult?.reason).toBe('no_parliamentary_vote_required');
    const consulted = resolveProposalVoteForActor(withPower('consultative'), fixture.proposalId, fixture.personId, fixture.registry, fixture.profiles);
    expect(consulted.governance.proposals[fixture.proposalId].status).toBe('consulted');
    expect(consulted.governance.proposals[fixture.proposalId].parliamentaryEstimate).toBeDefined();
    expect(consulted.governance.proposals[fixture.proposalId].voteResult).toBeUndefined();
    const enacted = decideConsultativeProposal(consulted, fixture.proposalId, fixture.personId, 'enact');
    expect(enacted.governance.proposals[fixture.proposalId].status).toBe('enacted');
    expect(enacted.governance.proposals[fixture.proposalId].voteResult?.reason).toBe('executive_decision');
  });

  it('records a weak-legislature rejection and enacts only through an explicit executive override', () => {
    const fixture = findFixture(false);
    const withPower = { ...fixture.state, constitution: { ...fixture.state.constitution, countries: { ...fixture.state.constitution.countries, [fixture.countryId]: { ...fixture.state.constitution.countries[fixture.countryId], parliament: { ...fixture.state.constitution.countries[fixture.countryId].parliament, power: 'weak_legislative' as const } } } } };
    const rejected = resolveProposalVoteForActor(withPower, fixture.proposalId, fixture.personId, fixture.registry, fixture.profiles);
    expect(rejected.governance.proposals[fixture.proposalId].status).toBe('rejected');
    expect(rejected.governance.proposals[fixture.proposalId].voteResult?.outcome).toBe('rejected');
    expect(rejected.governance.proposals[fixture.proposalId].voteResult?.reason).toBeUndefined();
    const overridden = overrideParliamentaryRejection(rejected, fixture.proposalId, fixture.personId);
    expect(overridden.governance.proposals[fixture.proposalId].status).toBe('enacted');
    expect(overridden.governance.proposals[fixture.proposalId].voteResult?.reason).toBe('executive_override');
    expect(overridden.governance.proposals[fixture.proposalId].effects).toHaveLength(1);
  });

  it('runs a censure procedure that removes the head of government only when the constitution provides it', () => {
    const countryId = worldCountryIds[0];
    const base = executive(initial, countryId);
    const { state: legislated, id: legislatorId } = legislator(base, countryId);
    const withoutCensure = { ...legislated, constitution: { ...legislated.constitution, countries: { ...legislated.constitution.countries, [countryId]: { ...legislated.constitution.countries[countryId], government: { ...legislated.constitution.countries[countryId].government, responsibility: 'unavailable' as const } } } } };
    expect(() => censureGovernment(withoutCensure, countryId, legislatorId)).toThrow(/does not provide for censure/);
    const headBefore = Object.values(legislated.governance.persons).find(p => p.office?.countryId === countryId && p.office.role === 'head_of_government')!;
    const partyIds = politicalRegistry.countries[countryId].partyIds;
    const [govParty, oppParty] = partyIds;
    const dynamicElections = structuredClone(legislated.elections);
    for (const chamber of Object.values(dynamicElections.countries[countryId].chambers)) if (oppParty) chamber.seatsByParty = { [oppParty]: chamber.totalSeats };
    dynamicElections.countries[countryId].government.coalitionPartyIds = govParty ? [govParty] : [];
    const withResponsibility = { ...legislated, fiscal: { ...legislated.fiscal, countries: { ...legislated.fiscal.countries, [countryId]: { ...legislated.fiscal.countries[countryId], debt: 1_000_000, debtLimit: 1_000_000 } } }, elections: { ...legislated.elections, countries: { ...legislated.elections.countries, [countryId]: { ...dynamicElections.countries[countryId] } } }, constitution: { ...legislated.constitution, countries: { ...legislated.constitution.countries, [countryId]: { ...legislated.constitution.countries[countryId], government: { ...legislated.constitution.countries[countryId].government, responsibility: 'government_censurable' as const } } } } };
    const censured = censureGovernment(withResponsibility, countryId, legislatorId);
    expect(censured.governance.persons[headBefore.id].office).toBeUndefined();
    expect(censured.governance.cabinets[countryId].censureEvents).toHaveLength(1);
    expect(censured.governance.cabinets[countryId].censureEvents![0].kind).toBe('government');
  });

  it('validates an amendment payload at creation and submission, never only at replacement', () => {
    const countryId = worldCountryIds[0];
    const base = executive(initial, countryId);
    const personId = base.governance.player.controlledPersonId!;
    expect(() => createConstitutionalAmendmentProposal(base, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { materialKeysToProtect: ['bogus.key'] } })).toThrow(/Unknown material keys/);
    expect(() => createConstitutionalAmendmentProposal(base, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: {} })).toThrow(/must change something/);
    const created = createConstitutionalAmendmentProposal(base, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { materialKeysToProtect: ['fiscal.corporate'] } });
    const proposalId = created.governance.proposalOrder.at(-1)!;
    // A tampered payload is rejected at submission, not only when the draft is replaced.
    const tampered = { ...created, governance: { ...created.governance, proposals: { ...created.governance.proposals, [proposalId]: { ...created.governance.proposals[proposalId], payload: { materialKeysToProtect: ['fabricated.key'] } as never } } } };
    expect(() => submitProposalForActor(tampered, proposalId, personId)).toThrow(/Unknown material keys/);
  });

  it('analyzes constitutional amendments so parliament, parties and referendum evaluate their content', () => {
    const countryId = completeCountryIds()[0];
    let base = executive(initial, countryId);
    base = { ...base, constitution: { ...base.constitution, countries: { ...base.constitution.countries, [countryId]: { ...base.constitution.countries[countryId], rights: { ...base.constitution.countries[countryId].rights, strike: 'not_guaranteed' } } } } };
    const personId = base.governance.player.controlledPersonId!;
    let next = createConstitutionalAmendmentProposal(base, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { rightsChanges: { strike: 'guaranteed' }, materialKeysToProtect: ['fiscal.annualBudget.health'], parliamentChanges: { power: 'none' } } });
    const proposalId = next.governance.proposalOrder.at(-1)!;
    const analysis = inspectProposalSupport(next, proposalId).analysis;
    expect(analysis.genuinelyNeutral).toBe(false);
    expect(analysis.expectedConsequences.some(c => c.goal === 'labour_protection' && c.coverage !== 'unavailable')).toBe(true);
    expect(analysis.expectedConsequences.some(c => c.goal === 'public_services' && c.coverage !== 'unavailable')).toBe(true);
    expect(Array.isArray(analysis.institutionalEffects)).toBe(true);
    expect(analysis.institutionalEffects!.some(e => e.lever === 'legislative_initiative')).toBe(true);
    // The modelled amendment procedure is usable: never blocked as unavailable.
    next = submitProposalForActor(next, proposalId, personId);
    next = resolveProposalVoteForActor(next, proposalId, personId);
    expect(next.governance.proposals[proposalId].voteResult?.reason).not.toBe('constitutional_procedure_unavailable');
  });

  it('holds a real constitutional referendum and never enacts a required-but-unheld one', () => {
    const countryId = worldCountryIds[0];
    let base = executive(initial, countryId);
    const personId = base.governance.player.controlledPersonId!;
    // A principal amendment under a constitution that requires a referendum for every amendment.
    base = { ...base, constitution: { ...base.constitution, countries: { ...base.constitution.countries, [countryId]: { ...base.constitution.countries[countryId], parliament: { ...base.constitution.countries[countryId].parliament, power: 'none' }, amendment: { ...base.constitution.countries[countryId].amendment, referendum: 'always' } } } } };
    let next = createConstitutionalAmendmentProposal(base, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { rightsChanges: { strike: 'guaranteed' } } });
    const proposalId = next.governance.proposalOrder.at(-1)!;
    next = submitProposalForActor(next, proposalId, personId);
    // Without a held referendum the amendment procedure blocks even a no-vote parliament.
    next = resolveProposalVoteForActor(next, proposalId, personId);
    expect(next.governance.proposals[proposalId].status).toBe('rejected');
    expect(next.governance.proposals[proposalId].voteResult?.reason).toBe('referendum_failed');
    // A second, held referendum records a real outcome.
    next = createConstitutionalAmendmentProposal(base, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { rightsChanges: { strike: 'guaranteed' } } });
    const secondId = next.governance.proposalOrder.at(-1)!;
    next = submitProposalForActor(next, secondId, personId);
    next = holdReferendum(next, secondId, personId);
    const referendum = next.governance.proposals[secondId].referendumResult;
    expect(referendum).toBeDefined();
    expect(referendum!.adopted).toBe(referendum!.supportBps > referendum!.opposeBps);
    next = resolveProposalVoteForActor(next, secondId, personId);
    const resolved = next.governance.proposals[secondId];
    expect(resolved.status).toBe(referendum!.adopted ? 'enacted' : 'rejected');
    if (!referendum!.adopted) expect(resolved.voteResult?.reason).toBe('referendum_failed');
    expect(assertSimulationInvariants(next, worldContext, 'save')).toBe(true);
  });

  it('wires institutional stakes to the dynamic election state, not the historical registry', () => {
    const countryId = completeCountryIds()[0];
    const base = executive(initial, countryId);
    const [first, second] = politicalRegistry.countries[countryId].partyIds;
    if (!first || !second) return;
    const dynamicElections = structuredClone(base.elections);
    const dynamic = dynamicElections.countries[countryId];
    for (const chamber of Object.values(dynamic.chambers)) chamber.seatsByParty = { [second]: chamber.totalSeats };
    dynamic.government.coalitionPartyIds = [second];
    const state = { ...base, elections: dynamicElections };
    const registry = structuredClone(politicalRegistry);
    const country = registry.countries[countryId];
    const institution = registry.institutions[country.institutionId];
    institution.governingPartyIds = [first];
    institution.governingBlocDerivations = [{ sourceText: 'Synthetic test-only governing bloc.', method: 'normalized_source_party_name_substring_v1', matchedPartyIds: [first], ambiguous: false }];
    country.coverage.coalition = 'sourced';
    const dynamicStake = derivePartyInstitutionalStake(registry, countryId, second, 'executive', state);
    const registryStake = derivePartyInstitutionalStake(registry, countryId, second, 'executive');
    expect(dynamicStake.stakeBps).toBe(10_000);
    expect(registryStake.stakeBps).toBe(0);
  });

  it('versions institutional stakes so a saved evaluation survives a future election', () => {
    const countryId = completeCountryIds()[0];
    const base = executive(initial, countryId);
    const partyId = politicalRegistry.countries[countryId].partyIds[0];
    const withCoalition = { ...base, elections: { ...base.elections, countries: { ...base.elections.countries, [countryId]: { ...base.elections.countries[countryId], government: { coalitionPartyIds: [partyId], confidence: 'majority' as const } } } } };
    const effect = { id: 'test.confidence', lever: 'confidence_power' as const, from: 'executive' as const, to: 'none' as const, confidenceBps: 10_000, coverage: 'complete' as const, source: 'test', explanation: 'test' };
    const material = { agreementBps: 6_000, confidenceBps: 10_000, coverage: 'complete' as const };
    const before = evaluatePartyInstitutionalInterest(withCoalition, countryId, partyId, politicalRegistry, [effect], material);
    expect(before.stakesFingerprint).toBeDefined();
    // A later election changes seats/coalition; the recorded fingerprint is intrinsic to the recorded stakes.
    const afterElection = runElection(withCoalition, countryId);
    const after = evaluatePartyInstitutionalInterest(afterElection, countryId, partyId, politicalRegistry, [effect], material);
    expect(before.method).toBe('situational_institutional_interest_v1');
    expect(after.method).toBe('situational_institutional_interest_v1');
  });

  it('keeps a recorded institutional vote valid under the invariants after a later election', () => {
    const fixture = findFixture(true);
    let state = resolveProposalVoteForActor(fixture.state, fixture.proposalId, fixture.personId, fixture.registry, fixture.profiles);
    const proposal = state.governance.proposals[fixture.proposalId];
    expect(proposal.status).toBe('enacted');
    expect(proposal.voteResult?.chambers.every(chamber => chamber.partyEvaluations?.every(evaluation => evaluation.institutionalInterest?.method === 'situational_institutional_interest_v1'))).toBe(true);
    // The recorded evaluation passes the invariants as saved.
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
    // A later election replaces the parliament: the saved evaluation must stay valid (versioned stakes,
    // never recomputed against the current parliament).
    state = { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [fixture.countryId]: { ...state.constitution.countries[fixture.countryId], election: { ...state.constitution.countries[fixture.countryId].election, parliamentarySystem: 'proportional', rounds: 1 } } } } };
    state = runElection(state, fixture.countryId);
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
    const restored = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  });

  it('never overwrites an existing office when appointing a minister', () => {
    const base = executive();
    const headId = base.governance.player.controlledPersonId!;
    expect(() => appointMinister(base, worldCountryIds[0], headId, headId, 'portfolio.finance', 'Finance')).toThrow(/already holds a political office/);
  });

  it('appoints a minister and survives invariants and save/reload', () => {
    const countryId = worldCountryIds[0];
    const base = executive(initial, countryId);
    const headId = base.governance.player.controlledPersonId!;
    const withPerson = createPoliticalPerson(base, { displayName: 'Minister candidate', countryId });
    const ministerId = Object.keys(withPerson.governance.persons).at(-1)!;
    let state = appointMinister(withPerson, countryId, headId, ministerId, 'portfolio.finance', 'Finance');
    expect(state.governance.persons[ministerId].office?.role).toBe('minister');
    expect(state.governance.cabinets[countryId].portfolios['portfolio.finance'].ministerPersonId).toBe(ministerId);
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
    const restored = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.governance.persons[ministerId].office?.role).toBe('minister');
    expect(restored.governance.cabinets[countryId].portfolios['portfolio.finance'].ministerPersonId).toBe(ministerId);
    expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  });

  it('lets a temporary succession predecessor resume the office once active again', () => {
    const countryId = worldCountryIds[0];
    const base = executive(initial, countryId);
    const headId = base.governance.player.controlledPersonId!;
    const withVice = createPoliticalPerson(base, { displayName: '0.23 governance vice', countryId });
    const viceId = Object.keys(withVice.governance.persons).at(-1)!;
    // Remove every head-of-government office in the Country so the vacancy is real.
    let next = withVice;
    for (const pid of Object.keys(next.governance.persons)) {
      const person = next.governance.persons[pid];
      if (person.office?.countryId === countryId && person.office.role === 'head_of_government') next = revokePoliticalOffice(next, pid);
    }
    next = { ...next, governance: { ...next.governance, persons: { ...next.governance.persons, [headId]: { ...next.governance.persons[headId], status: 'inactive' as const } }, cabinets: { ...next.governance.cabinets, [countryId]: { countryId, viceLeaderPersonId: viceId, portfolios: {}, lastHeadPersonId: headId } } } };
    next = { ...next, constitution: { ...next.constitution, countries: { ...next.constitution.countries, [countryId]: { ...next.constitution.countries[countryId], government: { ...next.constitution.countries[countryId].government, vacancySuccession: 'deputy_temporary' as const } } } } };
    next = runGovernmentSuccession(next);
    expect(next.governance.persons[viceId].office?.role).toBe('head_of_government');
    expect(next.governance.persons[viceId].office?.title).toContain('acting');
    expect(next.governance.cabinets[countryId].actingHead?.predecessorPersonId).toBe(headId);
    // The predecessor resumes when active again.
    next = { ...next, governance: { ...next.governance, persons: { ...next.governance.persons, [headId]: { ...next.governance.persons[headId], status: 'active' as const } } } };
    next = runGovernmentSuccession(next);
    expect(next.governance.persons[headId].office?.role).toBe('head_of_government');
    expect(next.governance.persons[viceId].office).toBeUndefined();
    expect(next.governance.cabinets[countryId].actingHead).toBeUndefined();
  });
});
