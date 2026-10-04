import { describe, expect, it } from 'vitest';
import { militaryFixture, militaryCountry, otherCountry, militaryRegions, militaryContext } from './military.test';
import { assertSimulationInvariants } from '../invariants';
import { createPoliticalPerson, setControlledPerson } from '../governance/runtime';
import { deploy, hasOperationsAuthority, initializeOperations, orderMovement, withdrawDeployment } from '../operations/runtime';

const fixture = () => initializeOperations(militaryFixture());

describe('0.19 operational foundation', () => {
  it('initializes strategic components and control without changing sovereignty', () => {
    const state = fixture();
    expect(Object.keys(state.operations.components).length).toBeGreaterThan(0);
    expect(state.regionOwnership).toEqual(militaryFixture().regionOwnership);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('requires resolved executive authority rather than Country selection', () => {
    const state = fixture();
    const person = state.governance.player.controlledPersonId!;
    expect(hasOperationsAuthority(state, militaryCountry, person)).toBe(true);
    const noOffice = createPoliticalPerson(setControlledPerson(state, undefined), { countryId: militaryCountry, displayName: 'No office' });
    const noOfficeId = Object.keys(noOffice.governance.persons).find(id => noOffice.governance.persons[id].countryId === militaryCountry && !noOffice.governance.persons[id].office)!;
    const controlled = setControlledPerson(noOffice, noOfficeId);
    expect(hasOperationsAuthority(controlled, militaryCountry, noOfficeId)).toBe(false);
    expect(() => deploy(controlled, { countryId: militaryCountry, personId: noOfficeId, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1 })).toThrow();
  });
  it('conserves deployment personnel and rejects double deployment', () => {
    let state = fixture();
    const person = state.governance.player.controlledPersonId!;
    state = deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1 });
    const deployment = state.operations.deployments[state.operations.deploymentOrder[0]];
    expect(deployment.personnel).toBe(1);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
    expect(() => deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1000000 })).toThrow();
  });
  it('records prospective movement order and withdrawal', () => {
    let state = fixture();
    const person = state.governance.player.controlledPersonId!;
    state = deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1 });
    const id = state.operations.deploymentOrder[0];
    state = orderMovement(state, id, person, militaryRegions[1].id);
    expect(state.operations.deployments[id].order!.effectiveOn.localeCompare(state.date)).toBeGreaterThan(0);
    state = withdrawDeployment(state, id, person);
    expect(state.operations.deployments[id].status).toBe('withdrawing');
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('rejects consumable or over-allocated deployment equipment', () => {
    let state = fixture();
    const person = state.governance.player.controlledPersonId!;
    expect(() => deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1, equipment: { ammunition: 1 } })).toThrow();
    expect(() => deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1, equipment: { truck: 999999 } })).toThrow();
  });
  it('validates symmetric adjacency', () => {
    let state = fixture();
    state.operations.adjacency = { [militaryRegions[0].id]: [militaryRegions[1].id], [militaryRegions[1].id]: [militaryRegions[0].id] };
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
});
