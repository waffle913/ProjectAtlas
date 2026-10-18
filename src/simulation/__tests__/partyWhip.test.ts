import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import type { PartyInternalVoteDistribution } from '../governance/model';
import { applyWhipInstruction } from '../governance/internalPartyDistribution';
import { assignPoliticalOffice, createFiscalProposal, createPoliticalPerson, estimateParliamentarySupport, issuePartyWhip, setControlledPerson, submitProposal } from '../governance/runtime';
import { politicalRegistry } from '../politics/registry';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { restoreSimulationState, serializeSimulationState } from '../save';

const fullWorld = () => initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);

const distribution = (mean: number, status: 'modelled_common_prior' | 'unavailable' = 'modelled_common_prior'): PartyInternalVoteDistribution => ({
  method: 'continuous_issue_distribution_v1', yesBps: 2_000, noBps: 4_000, abstainBps: 4_000, unknownBps: 0,
  agreementMeanBps: mean, agreementHalfSpreadBps: 4_000, coverage: 'complete', status, limitation: 'test distribution',
});

describe('applyWhipInstruction', () => {
  it('leaves the distribution unchanged for FREE VOTE', () => {
    const base = distribution(4_000);
    expect(applyWhipInstruction(base, 'free')).toBe(base);
  });

  it('leaves an unavailable distribution unchanged', () => {
    const unavailable = distribution(4_000, 'unavailable');
    expect(applyWhipInstruction(unavailable, 'yes')).toBe(unavailable);
  });

  it('shifts the mean a bounded step toward YES / NO / ABSTAIN without saturating the fixture', () => {
    const yes = applyWhipInstruction(distribution(4_000), 'yes');
    const no = applyWhipInstruction(distribution(4_000), 'no');
    const abstain = applyWhipInstruction(distribution(4_000), 'abstain');
    expect(yes.agreementMeanBps).toBeGreaterThan(4_000);
    expect(yes.agreementMeanBps).toBeLessThanOrEqual(6_000);
    expect(no.agreementMeanBps).toBeLessThan(4_000);
    expect(no.agreementMeanBps).toBeGreaterThanOrEqual(2_000);
    expect(abstain.agreementMeanBps).toBeGreaterThan(4_000);
    expect(abstain.agreementMeanBps).toBeLessThanOrEqual(5_000);
    // defections stay bounded: a whip does not convert the whole distribution
    expect(yes.yesBps).toBeLessThan(10_000);
    expect(yes.abstainBps).toBeGreaterThan(0);
    expect(no.noBps).toBeLessThan(10_000);
    expect(no.abstainBps).toBeGreaterThan(0);
  });
});

describe('issuePartyWhip', () => {
  const leader = { id: 'person.leader', status: 'active', isPartyLeader: true, partyId: 'party.a', countryId: 'country.a' };
  const proposal = { id: 'prop.1', kind: 'fiscal_reform' as const, status: 'submitted' as const, countryId: 'country.a', effectiveDate: '2026-02-01' };
  const stateFor = (person: object, prop: object): SimulationState => ({
    governance: { persons: { [leader.id]: person }, proposals: { [proposal.id]: prop }, player: { controlledPersonId: leader.id } },
    date: '2026-01-01',
  } as unknown as SimulationState);

  it.each([['yes'], ['no'], ['abstain'], ['free']] as const)('records a dated %s instruction for the eligible leader', (instruction) => {
    const next = issuePartyWhip(stateFor(leader, proposal), 'prop.1', 'person.leader', 'party.a', instruction);
    const whip = next.governance.proposals['prop.1'].whipInstructions!;
    expect(whip).toHaveLength(1);
    expect(whip[0]).toMatchObject({ proposalId: 'prop.1', byPersonId: 'person.leader', partyId: 'party.a', instruction, on: '2026-01-01' });
  });

  it('replaces an existing instruction for the same party rather than stacking', () => {
    const first = issuePartyWhip(stateFor(leader, proposal), 'prop.1', 'person.leader', 'party.a', 'yes');
    const second = issuePartyWhip(first, 'prop.1', 'person.leader', 'party.a', 'no');
    const whips = second.governance.proposals['prop.1'].whipInstructions!;
    expect(whips).toHaveLength(1);
    expect(whips[0].instruction).toBe('no');
  });

  it('refuses a non-leader, a different party, a different country, and a non-submitted proposal', () => {
    const base = stateFor(leader, proposal);
    expect(() => issuePartyWhip(base, 'prop.1', 'person.leader', 'party.a', 'yes')).not.toThrow();
    expect(() => issuePartyWhip(base, 'prop.1', 'person.leader', 'party.other', 'yes')).toThrow(/leader of the instructed party/);
    expect(() => issuePartyWhip(stateFor({ ...leader, isPartyLeader: false }, proposal), 'prop.1', 'person.leader', 'party.a', 'yes')).toThrow(/leader of the instructed party/);
    expect(() => issuePartyWhip(stateFor({ ...leader, countryId: 'country.b' }, proposal), 'prop.1', 'person.leader', 'party.a', 'yes')).toThrow(/leader of the instructed party/);
    for (const status of ['draft', 'enacted', 'rejected', 'withdrawn']) {
      expect(() => issuePartyWhip(stateFor(leader, { ...proposal, status }), 'prop.1', 'person.leader', 'party.a', 'yes')).toThrow(/Only a submitted proposal/);
    }
  });
});

describe('party whip persistence and parliamentary consumption', () => {
  const completeCountryIds = () => Object.values(politicalRegistry.countries).filter(country => {
    const institution = politicalRegistry.institutions[country.institutionId];
    return Boolean(institution?.chambers.length && institution.chambers.every(chamber => chamber.seatAllocationStatus === 'sourced' && chamber.totalSeats !== undefined && Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0) === chamber.totalSeats));
  }).map(country => country.countryId).sort();

  function whipFixture(): { state: SimulationState; proposalId: string; leaderId: string; partyId: string } {
    const world = fullWorld();
    const countryId = completeCountryIds().find(id => politicalRegistry.countries[id].partyIds.length && world.fiscal.countries[id]?.annualBudget?.infrastructure > 0)!;
    let state = createPoliticalPerson(world, { displayName: 'Whip Proposer', countryId });
    const proposerId = Object.keys(state.governance.persons).at(-1)!;
    state = setControlledPerson(state, proposerId);
    state = assignPoliticalOffice(state, proposerId, { role: 'head_of_government', countryId });
    const budget = state.fiscal.countries[countryId].annualBudget;
    state = createFiscalProposal(state, { proposerPersonId: proposerId, countryId, effectiveDate: '2026-02-01', payload: { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } } });
    const proposalId = state.governance.proposalOrder.at(-1)!;
    state = submitProposal(state, proposalId);
    const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId].institutionId];
    const representedPartyIds = new Set(institution.chambers.flatMap(chamber => Object.keys(chamber.seatsByParty)));
    const leader = Object.values(state.governance.persons).find(person => person.status === 'active' && person.isPartyLeader && person.partyId && person.countryId === countryId && representedPartyIds.has(person.partyId))!;
    return { state, proposalId, leaderId: leader.id, partyId: leader.partyId! };
  }

  it('preserves the whip instruction across save/restore', () => {
    const fixture = whipFixture();
    const whipped = issuePartyWhip(fixture.state, fixture.proposalId, fixture.leaderId, fixture.partyId, 'no');
    const restored = restoreSimulationState(serializeSimulationState(whipped, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.governance.proposals[fixture.proposalId].whipInstructions).toHaveLength(1);
    expect(restored.governance.proposals[fixture.proposalId].whipInstructions![0]).toMatchObject({ partyId: fixture.partyId, instruction: 'no', byPersonId: fixture.leaderId });
  });

  it('shifts the instructed party distribution when parliamentary support is evaluated', () => {
    const fixture = whipFixture();
    const proposal = fixture.state.governance.proposals[fixture.proposalId];
    const baseline = estimateParliamentarySupport(fixture.state, proposal);
    const whipped = estimateParliamentarySupport(issuePartyWhip(fixture.state, fixture.proposalId, fixture.leaderId, fixture.partyId, 'yes'), proposal);
    const evalFor = (support: ReturnType<typeof estimateParliamentarySupport>) => support.chambers
      .flatMap(chamber => chamber.partyEvaluations ?? [])
      .find(evaluation => evaluation.partyId === fixture.partyId)!;
    expect(evalFor(whipped).internalDistribution!.agreementMeanBps).toBeGreaterThan(evalFor(baseline).internalDistribution!.agreementMeanBps);
  });
});
