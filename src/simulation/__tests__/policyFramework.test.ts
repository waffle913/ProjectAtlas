import { beforeAll, describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { politicalRegistry } from '../politics/registry';
import type { PoliticalRegistry } from '../politics/model';
import { createFiscalProposal, createPoliticalPerson, assignPoliticalOffice, setControlledPerson, submitProposal, submitProposalForActor, resolveProposalVote, resolveProposalVoteForActor, withdrawProposalForActor, inspectProposalSupport, estimateParliamentarySupport } from '../governance/runtime';
import { derivePartyGoalProfile } from '../governance/analysis';
import { POLICY_CATEGORY_REGISTRY, type GovernanceGoal, type PartyGoalProfile } from '../governance/model';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';

let initial: SimulationState;
beforeAll(() => { initial = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs); }, 30_000);

function executive(state: SimulationState, countryId: string) {
  let next = createPoliticalPerson(state, { displayName: '0.22 policy-framework executive', countryId });
  const id = Object.keys(next.governance.persons).at(-1)!;
  next = setControlledPerson(assignPoliticalOffice(next, id, { role: 'head_of_government', countryId }), id);
  return { state: next, id };
}
const completeCountryIds = () => Object.values(politicalRegistry.countries).filter(country => {
  const institution = politicalRegistry.institutions[country.institutionId];
  return institution?.chambers.length && institution.chambers.every(chamber => chamber.seatAllocationStatus === 'sourced' && chamber.totalSeats !== undefined && (chamber.independentOtherSeats ?? 0) === 0 && Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0) === chamber.totalSeats);
}).map(country => country.countryId);
const resolvable = () => completeCountryIds().find(id => politicalRegistry.countries[id].partyIds.length && initial.fiscal.countries[id].annualBudget.incomeSupport > 0 && initial.fiscal.countries[id].annualBudget.infrastructure > 0)!;
function budgetDraft(state: SimulationState, personId: string, countryId: string) {
  const current = state.fiscal.countries[countryId].annualBudget;
  return createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { annualBudget: { ...current, infrastructure: current.infrastructure * 2 } } });
}

function resolvableFixture(adopted: boolean) {
  for (const countryId of completeCountryIds()) {
    const player = executive(initial, countryId);
    const state = budgetDraft(player.state, player.id, countryId);
    const proposal = state.governance.proposals[state.governance.proposalOrder.at(-1)!];
    const registry = structuredClone(politicalRegistry) as PoliticalRegistry;
    const analysis = inspectProposalSupport(state, proposal.id).analysis;
    const profiles: Record<string, PartyGoalProfile> = {};
    for (const partyId of registry.countries[countryId].partyIds) {
      const overrides: Partial<Record<GovernanceGoal, Partial<PartyGoalProfile['goals'][GovernanceGoal]>>> = {};
      for (const [goal, direction] of Object.entries(analysis.issueEffects) as Array<[GovernanceGoal, number]>) if (direction) overrides[goal] = { idealPointBps: direction > 0 === adopted ? 10_000 : 0, importanceBps: 10_000, compromiseToleranceBps: adopted ? 10_000 : 0, confidenceBps: 10_000, status: 'sourced_or_partial_prior' };
      profiles[partyId] = derivePartyGoalProfile(registry.parties[partyId], overrides);
    }
    const estimate = estimateParliamentarySupport(state, proposal, registry, profiles);
    if (estimate.coverage === 'complete' && estimate.chambers.every(chamber => Boolean(chamber.adopted) === adopted)) return { state, personId: player.id, proposalId: proposal.id, countryId, registry, profiles };
  }
  throw new Error(`No ${adopted ? 'adopted' : 'rejected'} deterministic fixture in current registry.`);
}

describe('0.22 generic policy framework', () => {
  it('backfills instrumentClass and typed effects for a pre-0.22 fiscal proposal on migration', () => {
    const fixture = resolvableFixture(true);
    let state = submitProposal(fixture.state, fixture.proposalId);
    state = resolveProposalVote(state, fixture.proposalId, fixture.registry, fixture.profiles);
    expect(state.governance.proposals[fixture.proposalId].status).toBe('enacted');
    // Simulate a pre-0.22 save by stripping the new fields.
    const stripped = structuredClone(state) as unknown as { governance: { proposals: Record<string, Record<string, unknown>> } };
    const raw = stripped.governance.proposals[fixture.proposalId] as Record<string, unknown>;
    delete raw.instrumentClass; delete raw.effects;
    const restored = restoreSimulationState(JSON.stringify(stripped), worldRegions, {}, {}, worldContext);
    const migrated = restored.governance.proposals[fixture.proposalId];
    expect(migrated.instrumentClass).toBe('law');
    expect(migrated.effects).toHaveLength(1);
    expect(migrated.effects[0].fiscalReformSequence).toBe(migrated.enactmentReference!.fiscalReformSequence);
    expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  }, 60_000);

  it('records the fiscal effect exactly once and never re-applies after reload', () => {
    const fixture = resolvableFixture(true);
    let state = submitProposal(fixture.state, fixture.proposalId);
    state = resolveProposalVote(state, fixture.proposalId, fixture.registry, fixture.profiles);
    const reformsBefore = state.fiscal.reforms.length;
    expect(state.governance.proposals[fixture.proposalId].effects).toHaveLength(1);
    const restored = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.governance.proposals[fixture.proposalId].effects).toHaveLength(1);
    expect(restored.fiscal.reforms).toHaveLength(reformsBefore);
    expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  }, 60_000);

  it('records no typed effect before adoption and none for rejection', () => {
    const countryId = resolvable(), player = executive(initial, countryId);
    let state = budgetDraft(player.state, player.id, countryId);
    const proposalId = state.governance.proposalOrder[0];
    expect(state.governance.proposals[proposalId].effects).toEqual([]);
    state = submitProposal(state, proposalId);
    expect(state.governance.proposals[proposalId].effects).toEqual([]);
    state = { ...state, date: '2026-02-02' };
    state = resolveProposalVote(state, proposalId);
    const proposal = state.governance.proposals[proposalId];
    if (proposal.status === 'enacted') expect(proposal.effects).toHaveLength(1);
    else expect(proposal.effects).toEqual([]);
  }, 60_000);

  it('keeps pedagogical descriptions out of serialized saves', () => {
    const countryId = resolvable(), player = executive(initial, countryId);
    const state = budgetDraft(player.state, player.id, countryId);
    const serialized = serializeSimulationState(state, worldContext);
    expect(serialized).not.toContain(POLICY_CATEGORY_REGISTRY.fiscal_reform.summary);
    expect(serialized).not.toContain('tradeoffs');
  });

  it('rejects a proposal with an unknown instrument class rather than granting arbitrary effect', () => {
    const countryId = resolvable(), player = executive(initial, countryId);
    const state = budgetDraft(player.state, player.id, countryId);
    const proposalId = state.governance.proposalOrder[0];
    const forged = structuredClone(state) as unknown as { governance: { proposals: Record<string, { instrumentClass: string }> } };
    forged.governance.proposals[proposalId].instrumentClass = 'decree_by_fiat';
    expect(() => assertSimulationInvariants(forged as unknown as SimulationState, worldContext, 'save')).toThrow(/Invalid instrument class/);
  });

  it('marks support inspection as engine-debug reality, not a government estimate', () => {
    const countryId = resolvable(), player = executive(initial, countryId);
    const state = budgetDraft(player.state, player.id, countryId);
    const proposalId = state.governance.proposalOrder[0];
    const support = inspectProposalSupport(state, proposalId);
    expect(support.informationStatus).toBe('engine_debug_reality');
  });

  it('rejects an unknown proposal kind and an instrument class changed after submission', () => {
    const fixture = resolvableFixture(true);
    const forged = structuredClone(fixture.state) as unknown as { governance: { proposals: Record<string, { kind: string; instrumentClass: string }> } };
    forged.governance.proposals[fixture.proposalId].kind = 'naval_expansion';
    expect(() => assertSimulationInvariants(forged as unknown as SimulationState, worldContext, 'save')).toThrow(/Unknown proposal kind/);
    const submitted = submitProposal(fixture.state, fixture.proposalId);
    const changed = structuredClone(submitted) as unknown as { governance: { proposals: Record<string, { instrumentClass: string }> } };
    changed.governance.proposals[fixture.proposalId].instrumentClass = 'constitutional_amendment';
    expect(() => assertSimulationInvariants(changed as unknown as SimulationState, worldContext, 'save')).toThrow(/not the 0.22 default/);
  });

  it('rejects a forged typed effect at reload instead of repairing it', () => {
    const fixture = resolvableFixture(true);
    let state = submitProposal(fixture.state, fixture.proposalId);
    state = resolveProposalVoteForActor(state, fixture.proposalId, fixture.personId, fixture.registry, fixture.profiles);
    expect(state.governance.proposals[fixture.proposalId].status).toBe('enacted');
    const forged = structuredClone(state) as unknown as { governance: { proposals: Record<string, { effects: Array<{ reformFingerprint: string }> }> } };
    forged.governance.proposals[fixture.proposalId].effects[0].reformFingerprint = 'forged-fingerprint';
    expect(() => restoreSimulationState(JSON.stringify(forged), worldRegions, {}, {}, worldContext)).toThrow(/matching typed effect/);
  });

  it('rejects a cross-domain effect category and a constitutional disposition in 0.22', () => {
    const fixture = resolvableFixture(true);
    let state = submitProposal(fixture.state, fixture.proposalId);
    state = resolveProposalVoteForActor(state, fixture.proposalId, fixture.personId, fixture.registry, fixture.profiles);
    const crossDomain = structuredClone(state) as unknown as { governance: { proposals: Record<string, { effects: Array<{ category: string }> }> } };
    crossDomain.governance.proposals[fixture.proposalId].effects[0].category = 'other_domain';
    expect(() => assertSimulationInvariants(crossDomain as unknown as SimulationState, worldContext, 'save')).toThrow(/Invalid typed effects/);
    const disposition = structuredClone(state) as unknown as { governance: { proposals: Record<string, { constitutionalDisposition: string }> } };
    disposition.governance.proposals[fixture.proposalId].constitutionalDisposition = 'secondary';
    expect(() => assertSimulationInvariants(disposition as unknown as SimulationState, worldContext, 'save')).toThrow(/not representable in 0.22/);
  });

  it('lets a non-controlled authorized actor use the engine path while the player wrapper stays restricted', () => {
    const fixture = resolvableFixture(true);
    const actor = createPoliticalPerson(fixture.state, { displayName: 'Non-controlled authorized minister', countryId: fixture.countryId });
    const actorId = Object.keys(actor.governance.persons).at(-1)!;
    let state = assignPoliticalOffice(actor, actorId, { role: 'head_of_government', countryId: fixture.countryId });
    const current = state.fiscal.countries[fixture.countryId].annualBudget;
    state = createFiscalProposal(state, { proposerPersonId: actorId, countryId: fixture.countryId, effectiveDate: '2026-02-01', payload: { annualBudget: { ...current, infrastructure: current.infrastructure * 2 } } });
    const proposalId = state.governance.proposalOrder.at(-1)!;
    // The player wrapper requires the controlled person, so it rejects a non-controlled proposer.
    expect(() => submitProposal(state, proposalId)).toThrow(/not the controlled person/);
    // The engine command checks real office powers, not governance.player.controlledPersonId.
    state = submitProposalForActor(state, proposalId, actorId);
    expect(state.governance.proposals[proposalId].status).toBe('submitted');
  });
});
