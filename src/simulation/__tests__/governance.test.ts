/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { advanceSimulationDays } from '../engine';
import { requestFidelityTransition, applyPendingFidelityTransitions } from '../fidelity';
import { assertSimulationInvariants, validateFidelityConservation } from '../invariants';
import { politicalRegistry } from '../politics/registry';
import type { PoliticalRegistry } from '../politics/model';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { assignPoliticalOffice, createFiscalProposal, createPoliticalPerson, estimateParliamentarySupport, estimatePublicSupport, inspectGovernance, inspectPlayer, inspectProposalSupport, replaceDraftProposal, resolveProposalVote, revokePoliticalOffice, setControlledPerson, setPartyLeadership, setPartyMembership, submitProposal, withdrawProposal } from '../governance/runtime';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { simulationDelta } from '../world';

const fullWorld = () => initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
let initial: SimulationState;
beforeAll(() => { initial = fullWorld(); }, 30_000);

const completeCountryIds = () => Object.values(politicalRegistry.countries).filter(country => {
  const institution = politicalRegistry.institutions[country.institutionId];
  return institution?.chambers.length && institution.chambers.every(chamber => chamber.seatAllocationStatus === 'sourced' && chamber.totalSeats !== undefined && (chamber.independentOtherSeats ?? 0) === 0 && Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0) === chamber.totalSeats);
}).map(country => country.countryId).sort();

function playerFor(state: SimulationState, countryId: string, name = 'Player Person') {
  let next = createPoliticalPerson(state, { displayName: name, countryId });
  const id = Object.keys(next.governance.persons).at(-1)!;
  next = setControlledPerson(next, id);
  next = assignPoliticalOffice(next, id, { role: 'head_of_government', countryId });
  return { state: next, id };
}

function budgetProposal(state: SimulationState, personId: string, countryId: string, factor: 2 | 0) {
  const current = state.fiscal.countries[countryId].annualBudget;
  return createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { annualBudget: { ...current, infrastructure: factor ? current.infrastructure * factor : 0 } } });
}

function findResolvable(adopted: boolean) {
  for (const countryId of completeCountryIds()) {
    const player = playerFor(initial, countryId), candidates = [budgetProposal(player.state, player.id, countryId, 2)];
    for (const state of candidates) {
      const proposal = state.governance.proposals[state.governance.proposalOrder.at(-1)!], registry = structuredClone(politicalRegistry) as PoliticalRegistry;
      const impact = inspectProposalSupport(state, proposal.id).impact;
      for (const partyId of registry.countries[countryId].partyIds) for (const issue of Object.keys(impact.issueDirectionsBps) as Array<keyof typeof impact.issueDirectionsBps>) {
        const direction = impact.issueDirectionsBps[issue]; if (!direction) continue;
        registry.parties[partyId].issuePositions[issue] = { ...registry.parties[partyId].issuePositions[issue], preferenceBps: direction > 0 === adopted ? 9_000 : 1_000, intensityBps: 10_000, confidenceBps: 10_000, ideologicalPrior: 'explicit governance vote test evidence' };
      }
      const estimate = estimateParliamentarySupport(state, proposal, registry);
      if (estimate.coverage === 'complete' && estimate.chambers.every(chamber => Boolean(chamber.adopted) === adopted)) return { state, personId: player.id, proposalId: proposal.id, countryId, registry };
    }
  }
  throw new Error(`No ${adopted ? 'adopted' : 'rejected'} deterministic fixture in current registry.`);
}

describe('governance 0.14 player and political decisions', () => {
  it('initializes a fresh game with no invented person or proposal', () => {
    expect(initial).toMatchObject({ schemaVersion: 12, governance: { version: 'governance-0.14-v1', initializedOn: '2026-01-01', player: {}, persons: {}, proposals: {}, proposalOrder: [], nextPersonSequence: 0, nextProposalSequence: 0 } });
  });

  it('creates stable sequence IDs independent of display names', () => {
    const countryId = worldCountryIds[0], a = createPoliticalPerson(initial, { displayName: 'Alpha', countryId }), b = createPoliticalPerson(initial, { displayName: 'Beta', countryId });
    expect(Object.keys(a.governance.persons)).toEqual(['person.00000000']); expect(Object.keys(b.governance.persons)).toEqual(['person.00000000']);
    expect(a.governance.persons['person.00000000']).toMatchObject({ displayName: 'Alpha', countryId, isPartyLeader: false });
  });

  it('reports governance-only command changes to UI/worker deltas', () => {
    const changed = createPoliticalPerson(initial, { displayName: 'Delta Person', countryId: worldCountryIds[0] });
    expect(simulationDelta(initial, changed).changedDomains).toEqual(['governance']);
  });

  it('validates party membership and keeps leadership separate from state authority', () => {
    const countryId = Object.values(politicalRegistry.countries).find(item => item.partyIds.length)!.countryId, other = worldCountryIds.find(id => id !== countryId)!;
    let { state, id } = playerFor(initial, countryId); state = revokePoliticalOffice(state, id);
    const partyId = politicalRegistry.countries[countryId].partyIds[0], otherParty = politicalRegistry.countries[other]?.partyIds[0];
    state = setPartyLeadership(setPartyMembership(state, id, partyId), id, true);
    expect(state.governance.persons[id]).toMatchObject({ partyId, isPartyLeader: true }); expect(state.governance.persons[id].office).toBeUndefined();
    const draft = budgetProposal(state, id, countryId, 2); expect(() => submitProposal(draft, draft.governance.proposalOrder.at(-1)!)).toThrow(/lacks authority/);
    if (otherParty) expect(() => setPartyMembership(state, id, otherParty)).toThrow(/person's Country/);
  });

  it('revoking office preserves player identity and control while removing capabilities', () => {
    const countryId = worldCountryIds[0], player = playerFor(initial, countryId), next = revokePoliticalOffice(player.state, player.id);
    expect(next.governance.player.controlledPersonId).toBe(player.id); expect(next.governance.persons[player.id]).toBeDefined(); expect(next.governance.persons[player.id].office).toBeUndefined();
  });

  it('creates editable drafts and freezes logical content after submission', () => {
    const fixture = findResolvable(true), id = fixture.proposalId;
    const edited = replaceDraftProposal(fixture.state, id, { effectiveDate: '2026-03-01' });
    const submitted = submitProposal(edited, id); expect(submitted.governance.proposals[id]).toMatchObject({ status: 'submitted', submittedOn: submitted.date });
    expect(() => replaceDraftProposal(submitted, id, { effectiveDate: '2026-03-01' })).toThrow(/immutable/);
    expect(edited.governance.proposals[id].effectiveDate).toBe('2026-03-01');
    const corrupted = structuredClone(submitted); corrupted.governance.proposals[id].effectiveDate = '2026-04-01'; expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/payload was modified/);
  });

  it('requires edited sourced tax rules to become explicitly modelled', () => {
    const countryId = worldCountryIds.find(id => Object.values(initial.fiscal.countries[id].policy).some(Boolean))!, player = playerFor(initial, countryId), policy = structuredClone(player.state.fiscal.countries[countryId].policy);
    const rule = Object.values(policy).find(value => value !== null)!;
    if (rule.kind === 'personal') rule.bands![0].rateBps += rule.bands![0].rateBps < 10_000 ? 1 : -1; else if (rule.kind === 'payroll') rule.employee![0].rateBps += rule.employee![0].rateBps < 10_000 ? 1 : -1; else rule.rateBps! += rule.rateBps! < 10_000 ? 1 : -1;
    expect(() => createFiscalProposal(player.state, { proposerPersonId: player.id, countryId, effectiveDate: '2026-02-01', payload: { policy } })).toThrow(/explicitly modelled/);
    rule.status = 'modelled'; expect(createFiscalProposal(player.state, { proposerPersonId: player.id, countryId, effectiveDate: '2026-02-01', payload: { policy } }).governance.proposalOrder).toHaveLength(1);
  });

  it('requires the controlled proposer and the correct office scope', () => {
    const countryId = worldCountryIds[0]; let first = createPoliticalPerson(initial, { displayName: 'One', countryId }); const one = 'person.00000000';
    first = assignPoliticalOffice(first, one, { role: 'head_of_government', countryId }); first = createPoliticalPerson(first, { displayName: 'Two', countryId }); first = setControlledPerson(first, 'person.00000001');
    const draft = budgetProposal(first, one, countryId, 2); expect(() => submitProposal(draft, draft.governance.proposalOrder[0])).toThrow(/not the controlled person/);
  });

  it('requires vote authority to remain present at resolution time', () => {
    const fixture = findResolvable(true); let state = submitProposal(fixture.state, fixture.proposalId); state = revokePoliticalOffice(state, fixture.personId);
    expect(() => resolveProposalVote(state, fixture.proposalId, fixture.registry)).toThrow(/lacks authority/);
  });

  it('produces normalized public estimates and deterministic reconciled parliamentary estimates', () => {
    const fixture = findResolvable(true), proposal = fixture.state.governance.proposals[fixture.proposalId], publicEstimate = estimatePublicSupport(fixture.state, proposal), parliament = estimateParliamentarySupport(fixture.state, proposal, fixture.registry);
    expect(publicEstimate.supportBps + publicEstimate.opposeBps + publicEstimate.neutralBps).toBe(10_000); expect(publicEstimate.representedPersons).toBeGreaterThan(0);
    expect(parliament.yesSeats + parliament.noSeats + parliament.abstainSeats + parliament.unavailableSeats).toBe(parliament.totalSeats);
    expect(estimatePublicSupport(fixture.state, proposal)).toEqual(publicEstimate); expect(estimateParliamentarySupport(fixture.state, proposal, fixture.registry)).toEqual(parliament);
    const inspected = inspectProposalSupport(fixture.state, fixture.proposalId, fixture.registry); expect(inspected.informationStatus).toBe('engine_debug_reality'); expect(inspected.impact.drivers[0]?.source).toMatch(/^(policy|annualBudget)\./);
  });

  it('is independent of dynamic Country and Region insertion order', () => {
    const fixture = findResolvable(true), reordered = structuredClone(fixture.state);
    reordered.politics.countries = Object.fromEntries(Object.entries(reordered.politics.countries).reverse()); reordered.politics.regionalOpinion = Object.fromEntries(Object.entries(reordered.politics.regionalOpinion).reverse()); reordered.socioeconomy.regions = Object.fromEntries(Object.entries(reordered.socioeconomy.regions).reverse());
    expect(inspectProposalSupport(reordered, fixture.proposalId, fixture.registry)).toEqual(inspectProposalSupport(fixture.state, fixture.proposalId, fixture.registry));
  });

  it('keeps unavailable seats distinct and prevents bicameral/incomplete enactment', () => {
    const unavailableCountry = Object.values(politicalRegistry.countries).map(item => item.countryId).find(countryId => {
      const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId].institutionId]; return institution?.chambers.some(chamber => chamber.seatAllocationStatus !== 'sourced' || (chamber.independentOtherSeats ?? 0) > 0);
    })!;
    const player = playerFor(initial, unavailableCountry); let state = budgetProposal(player.state, player.id, unavailableCountry, 2), id = state.governance.proposalOrder.at(-1)!; state = submitProposal(state, id); const estimate = estimateParliamentarySupport(state, state.governance.proposals[id]);
    expect(estimate.coverage).not.toBe('complete'); expect(estimate.unavailableSeats).toBeGreaterThanOrEqual(0);
    const fiscalBefore = state.fiscal; state = resolveProposalVote(state, id); expect(state.governance.proposals[id].status).toBe('unavailable'); expect(state.fiscal).toBe(fiscalBefore);
  });

  it('adopts through exactly one queued FiscalReform without direct material effects', () => {
    const fixture = findResolvable(true); let state = submitProposal({ ...fixture.state, paused: true }, fixture.proposalId), fiscalBefore = state.fiscal, socioBefore = state.socioeconomy, politicsBefore = state.politics, crisisBefore = state.crisis;
    state = resolveProposalVote(state, fixture.proposalId, fixture.registry); const proposal = state.governance.proposals[fixture.proposalId];
    expect(proposal.status).toBe('enacted'); expect(proposal.voteResult?.outcome).toBe('adopted'); expect(state.paused).toBe(true); expect(state.fiscal.reforms.filter(reform => reform.sequence === proposal.scheduledFiscalReformSequence)).toHaveLength(1);
    expect(state.fiscal.countries).toBe(fiscalBefore.countries); expect(state.socioeconomy).toBe(socioBefore); expect(state.politics).toBe(politicsBefore); expect(state.crisis).toBe(crisisBefore);
    const applied = advanceSimulationDays(state, 31); expect(applied.fiscal.reforms.some(reform => reform.sequence === proposal.scheduledFiscalReformSequence)).toBe(false);
    if (proposal.payload.policy) expect(applied.fiscal.countries[fixture.countryId].policy).toEqual(proposal.payload.policy); else expect(applied.fiscal.countries[fixture.countryId].annualBudget).toEqual(proposal.payload.annualBudget);
  }, 30_000);

  it('allows later material fiscal consequences to reach opinion through the existing scheduler', () => {
    const countryId = completeCountryIds().find(id => initial.fiscal.countries[id].annualBudget.infrastructure > 0)!, player = playerFor(initial, countryId);
    let changed = budgetProposal(player.state, player.id, countryId, 0), proposalId = changed.governance.proposalOrder.at(-1)!, registry = structuredClone(politicalRegistry) as PoliticalRegistry;
    for (const partyId of registry.countries[countryId].partyIds) registry.parties[partyId].issuePositions.infrastructure = { ...registry.parties[partyId].issuePositions.infrastructure, preferenceBps: 1_000, intensityBps: 10_000, confidenceBps: 10_000, ideologicalPrior: 'explicit governance causal-path test evidence' };
    changed = resolveProposalVote(submitProposal(changed, proposalId), proposalId, registry); expect(changed.governance.proposals[proposalId].status).toBe('enacted');
    const baseline = advanceSimulationDays(player.state, 70), consequence = advanceSimulationDays(changed, 70);
    expect(consequence.fiscal.countries[countryId].services.infrastructure.coverageBps).not.toBe(baseline.fiscal.countries[countryId].services.infrastructure.coverageBps);
    expect(consequence.politics.countries[countryId]).not.toEqual(baseline.politics.countries[countryId]);
  }, 60_000);

  it('rejects deterministically without scheduling or changing fiscal state', () => {
    const fixture = findResolvable(false); let state = submitProposal(fixture.state, fixture.proposalId), fiscal = state.fiscal; state = resolveProposalVote(state, fixture.proposalId, fixture.registry);
    expect(state.governance.proposals[fixture.proposalId].status).toBe('rejected'); expect(state.fiscal).toBe(fiscal); expect(state.governance.proposals[fixture.proposalId].scheduledFiscalReformSequence).toBeUndefined();
    expect(() => resolveProposalVote(state, fixture.proposalId)).toThrow(/Only an unresolved/);
  });

  it('withdraws without enacting and persists loss of office, drafts and resolutions', () => {
    const fixture = findResolvable(true), withdrawn = withdrawProposal(fixture.state, fixture.proposalId); expect(withdrawn.governance.proposals[fixture.proposalId].status).toBe('withdrawn');
    let enacted = submitProposal(fixture.state, fixture.proposalId); enacted = resolveProposalVote(enacted, fixture.proposalId, fixture.registry); enacted = revokePoliticalOffice(enacted, fixture.personId);
    const restored = restoreSimulationState(serializeSimulationState(enacted, worldContext), worldRegions, {}, {}, worldContext); expect(restored).toEqual(enacted); expect(restored.governance.persons[fixture.personId].office).toBeUndefined();
  });

  it('migrates schema 11 on the saved date without fake governance history or changing other branches', () => {
    const legacy = structuredClone(initial) as unknown as Record<string, unknown>; legacy.schemaVersion = 11; legacy.date = '2034-05-06'; delete legacy.governance;
    const politics = legacy.politics, fiscal = legacy.fiscal, socioeconomy = legacy.socioeconomy, crisis = legacy.crisis;
    const migrated = restoreSimulationState(JSON.stringify(legacy), worldRegions, {}, {}, worldContext);
    expect(migrated.governance).toMatchObject({ initializedOn: '2034-05-06', persons: {}, proposals: {}, proposalOrder: [] }); expect(migrated.schemaVersion).toBe(12);
    expect(migrated.politics).toEqual(JSON.parse(JSON.stringify(politics))); expect(migrated.fiscal).toEqual(JSON.parse(JSON.stringify(fiscal))); expect(migrated.socioeconomy).toEqual(JSON.parse(JSON.stringify(socioeconomy))); expect(migrated.crisis).toEqual(JSON.parse(JSON.stringify(crisis)));
  }, 30_000);

  it('conserves governance across fidelity transitions and returns defensive inspections', () => {
    const fixture = findResolvable(true), queued = requestFidelityTransition(fixture.state, fixture.countryId, 'Detailed', worldContext.countryIds), applied = applyPendingFidelityTransitions(queued);
    expect(applied.governance).toBe(queued.governance); expect(validateFidelityConservation(queued, applied)).toEqual([]);
    const inspected = inspectGovernance(fixture.state); inspected.proposalOrder.length = 0; expect(fixture.state.governance.proposalOrder).toHaveLength(1); expect(inspectPlayer(fixture.state)?.id).toBe(fixture.personId);
  });

  it('validates governance invariants and contains no RNG or 0.15 systems', () => {
    const fixture = findResolvable(true); expect(assertSimulationInvariants(fixture.state, worldContext, 'tick')).toBe(true);
    const malformed = structuredClone(fixture.state); malformed.governance.player.controlledPersonId = 'person.unknown'; expect(() => assertSimulationInvariants(malformed, worldContext, 'tick')).toThrow(/Controlled person/);
    const source = readFileSync('src/simulation/governance/runtime.ts', 'utf8'); expect(source).not.toContain('Math.random'); expect(source).not.toMatch(/election|campaign|media|protest|strike|coup|lobby|coalition negotiation|party AI|government AI/i);
  });
});
