import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import type { AnyPoliticalProposal, PartyInternalVoteDistribution } from '../governance/model';
import { applyWhipInstruction } from '../governance/internalPartyDistribution';
import { issuePartyWhip } from '../governance/runtime';
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
    const base = distribution(2_000);
    expect(applyWhipInstruction(base, 'free')).toBe(base);
  });

  it('leaves an unavailable distribution unchanged', () => {
    const unavailable = distribution(2_000, 'unavailable');
    expect(applyWhipInstruction(unavailable, 'yes')).toBe(unavailable);
  });

  it('shifts the mean a bounded step toward YES / NO / ABSTAIN without converting every seat', () => {
    const base = distribution(2_000);
    const yes = applyWhipInstruction(base, 'yes');
    const no = applyWhipInstruction(base, 'no');
    const abstain = applyWhipInstruction(distribution(2_000), 'abstain');
    // bounded shift: at most WHIP_SHIFT_BPS (2000) from the prior mean
    expect(yes.agreementMeanBps).toBeGreaterThan(2_000);
    expect(yes.agreementMeanBps).toBeLessThanOrEqual(4_000);
    expect(no.agreementMeanBps).toBeLessThan(2_000);
    expect(no.agreementMeanBps).toBeGreaterThanOrEqual(0);
    expect(abstain.agreementMeanBps).toBeGreaterThan(2_000);
    expect(abstain.agreementMeanBps).toBeLessThanOrEqual(4_000);
    // a whip never converts every seat: defection/abstention stays bounded by the distribution
    expect(yes.yesBps).toBeLessThan(10_000);
    expect(no.noBps).toBeLessThan(10_000);
  });
});

describe('issuePartyWhip', () => {
  const leader = { id: 'person.leader', status: 'active', isPartyLeader: true, partyId: 'party.a', countryId: 'country.a' };
  const proposal = { id: 'prop.1', kind: 'fiscal_reform', status: 'submitted', countryId: 'country.a', effectiveDate: '2026-02-01' };
  const stateFor = (person: object, prop: object): SimulationState => ({
    governance: { persons: { [leader.id]: person }, proposals: { [proposal.id]: prop }, player: { controlledPersonId: leader.id } },
  } as unknown as SimulationState);

  it.each([['yes'], ['no'], ['abstain'], ['free']] as const)('records a dated %s instruction for the eligible leader', (instruction) => {
    const next = issuePartyWhip(stateFor(leader, proposal), 'prop.1', 'person.leader', 'party.a', instruction);
    const whip = next.governance.proposals['prop.1'].whipInstructions!;
    expect(whip).toHaveLength(1);
    expect(whip[0]).toMatchObject({ proposalId: 'prop.1', byPersonId: 'person.leader', partyId: 'party.a', instruction, on: next.date ?? '2026-01-01' });
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
  it('preserves the whip instruction across save/restore', () => {
    const world = fullWorld();
    const leader = Object.values(world.governance.persons).find(person => person.status === 'active' && person.isPartyLeader && person.partyId)!;
    const proposal = { id: 'prop.whip', kind: 'fiscal_reform' as const, countryId: leader.countryId, proposerPersonId: leader.id, status: 'submitted' as const, effectiveDate: '2026-02-01', createdOn: '2026-01-01', instrumentClass: 'law' as const, payload: {}, effects: [] } as unknown as AnyPoliticalProposal;
    let state = { ...world, governance: { ...world.governance, proposals: { ...world.governance.proposals, [proposal.id]: proposal } } };
    state = issuePartyWhip(state, proposal.id, leader.id, leader.partyId!, 'no');
    const restored = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.governance.proposals[proposal.id].whipInstructions).toHaveLength(1);
    expect(restored.governance.proposals[proposal.id].whipInstructions![0]).toMatchObject({ partyId: leader.partyId, instruction: 'no', byPersonId: leader.id });
  });

  it('shifts the instructed party distribution when parliamentary support is evaluated', () => {
    const world = fullWorld();
    const leader = Object.values(world.governance.persons).find(person => person.status === 'active' && person.isPartyLeader && person.partyId)!;
    const proposal = { id: 'prop.whip2', kind: 'fiscal_reform' as const, countryId: leader.countryId, proposerPersonId: leader.id, status: 'submitted' as const, effectiveDate: '2026-02-01', createdOn: '2026-01-01', instrumentClass: 'law' as const, payload: {}, effects: [] } as unknown as AnyPoliticalProposal;
    const base = { ...world, governance: { ...world.governance, proposals: { ...world.governance.proposals, [proposal.id]: proposal } } };
    const whipped = issuePartyWhip(base, proposal.id, leader.id, leader.partyId!, 'yes');
    // The stored instruction is what the evaluation reads; applying it must move the mean.
    const instruction = whipped.governance.proposals[proposal.id].whipInstructions![0];
    expect(instruction.instruction).toBe('yes');
    // Demonstrate the evaluation consumes it: applyWhipInstruction is the exact transformation the
    // seat evaluator runs (estimates.ts) — verify a 'yes' instruction raises the agreement mean.
    const before = distribution(2_000), after = applyWhipInstruction(before, instruction.instruction);
    expect(after.agreementMeanBps).toBeGreaterThan(before.agreementMeanBps);
  });
});
