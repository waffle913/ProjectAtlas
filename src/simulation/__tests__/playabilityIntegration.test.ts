import { describe, it, expect, beforeAll } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { setControlledPerson, transferPoliticalOffice } from '../governance/runtime';
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
});
