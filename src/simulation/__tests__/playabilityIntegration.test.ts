import { describe, it, expect, beforeAll } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { setControlledPerson, transferPoliticalOffice, createFiscalProposal, submitProposal, hasPoliticalAuthority } from '../governance/runtime';
import { hasGovernmentInformationAccess } from '../information/runtime';
import { serializeSimulationState, restoreSimulationState } from '../save';
import { assertSimulationInvariants } from '../invariants';
import type { SimulationState } from '../../types';

let world: SimulationState;
beforeAll(() => {
  world = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
}, 30_000);

describe('0.33 playability integration', () => {
  it('initializes a full game into a coherent canonical state', () => {
    expect(() => assertSimulationInvariants(world, worldContext, 'reload')).not.toThrow();
  });

  it('authorizes government information only to the office that actually holds it', () => {
    const persons = Object.entries(world.governance.persons);
    // Positive: a reconciled parliamentary head of government holds access.
    const head = persons.find(([, p]) => p.office?.evidence?.authorityBasis === 'sourced_parliamentary_head_of_government')
      ?? persons.find(([, p]) => p.office?.role === 'head_of_government');
    expect(head).toBeTruthy();
    if (head) {
      const [id, p] = head;
      expect(hasGovernmentInformationAccess(world, id, p.countryId)).toBe(true);
      expect(setControlledPerson(world, id).governance.player.controlledPersonId).toBe(id);
    }
    // Negative: a legislator holds no government-information access.
    const person = persons.find(([, p]) => p.office?.role !== 'head_of_government' && p.office?.role !== 'head_of_state') ?? persons[0];
    expect(person).toBeTruthy();
    if (person) {
      const [id, p] = person;
      const withLegislator = transferPoliticalOffice(world, id, { role: 'legislator', countryId: p.countryId });
      expect(withLegislator.governance.persons[id].office?.role).toBe('legislator');
      expect(hasGovernmentInformationAccess(withLegislator, id, p.countryId)).toBe(false);
    }
  });

  it('round-trips a save without corrupting canonical state', () => {
    const json = serializeSimulationState(world, worldContext);
    const restored = restoreSimulationState(json, worldRegions, {}, {}, worldContext);
    expect(() => assertSimulationInvariants(restored, worldContext, 'reload')).not.toThrow();
    expect(restored.date).toBe(world.date);
    expect(restored.regionOwnership).toEqual(world.regionOwnership);
  });

  it('governing path: a budget command produces a persistent canonical consequence', () => {
    const entry = Object.entries(world.governance.persons).find(([, person]) =>
      person.office?.role === 'head_of_government'
      && Boolean(person.countryId)
      && Boolean(world.fiscal.countries[person.countryId]?.annualBudget)
      && hasPoliticalAuthority(world, person.id, person.countryId, 'sponsor_legislation')
      && hasPoliticalAuthority(world, person.id, person.countryId, 'sponsor_budget_reform')
    );
    expect(entry).toBeTruthy();
    if (!entry) return;
    const [personId, person] = entry;
    const controlled = setControlledPerson(world, personId);
    const budget = controlled.fiscal.countries[person.countryId]!.annualBudget;
    let state = createFiscalProposal(controlled, {
      proposerPersonId: personId,
      countryId: person.countryId,
      effectiveDate: '2026-02-01',
      payload: { annualBudget: { ...budget } },
    });
    const proposalId = state.governance.proposalOrder.at(-1)!;
    expect(state.governance.proposals[proposalId]).toMatchObject({ kind: 'fiscal_reform', status: 'draft', proposerPersonId: personId });
    state = submitProposal(state, proposalId);
    expect(state.governance.proposals[proposalId].status).toBe('submitted');
    expect(state.governance.proposals[proposalId].submittedPayloadFingerprint).toBeTruthy();
    // The submitted reform survives save/restore as a persistent consequence.
    const restored = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.governance.proposals[proposalId].status).toBe('submitted');
    expect(restored.governance.proposals[proposalId].payload).toEqual(state.governance.proposals[proposalId].payload);
    expect(() => assertSimulationInvariants(restored, worldContext, 'reload')).not.toThrow();
  });
});
