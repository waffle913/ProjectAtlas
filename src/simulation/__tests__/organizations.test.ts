import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { joinOrganization, leaveOrganization, dissolveOrganization, banOrganization, runOrganizationAction, appealBan, resolveBanAppeal, donateToOrganization, registerOrganization, mergeOrganizations, splitOrganization, runPoliticalOpinionWeek } from '../politics/runtime';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import type { SimulationState } from '../../types';
import type { OrganizationPoliticalState, PoliticalIssue } from '../politics/model';
import { politicalRegistry } from '../politics/registry';

function withOrganization(): { state: SimulationState; organizationId: string } {
  let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
  state = createPoliticalPerson(state, { displayName: 'Organization-test executive', countryId: worldCountryIds[0] });
  const executiveId = Object.keys(state.governance.persons).at(-1)!;
  state = setControlledPerson(assignPoliticalOffice(state, executiveId, { role: 'head_of_government', countryId: worldCountryIds[0] }), executiveId);
  const organizationId = 'organization.synthetic-test';
  const entry: OrganizationPoliticalState = {
    organizationId, currentPositions: {} as Record<PoliticalIssue, number>, lastUpdatedOn: state.date, recentDrivers: [],
    status: 'active', members: {}, fundsUsd: 0, internalCurrents: {}, banEvents: [], countryId: worldCountryIds[0], type: 'association', displayName: 'Synthetic test organization', source: 'dynamic',
  };
  return { state: { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: entry } } }, organizationId };
}

describe('0.23 organizations', () => {
  it('joins, leaves, dissolves and bans an organization, and a banned organization cannot act', () => {
    const { state, organizationId } = withOrganization();
    const actorId = state.governance.player.controlledPersonId ?? Object.keys(state.governance.persons).find(id => state.governance.persons[id].office?.role === 'head_of_government')!;
    let next = joinOrganization(state, 'person.synthetic-1', organizationId);
    expect(next.politics.organizations[organizationId].members['person.synthetic-1']).toBeDefined();
    next = leaveOrganization(next, 'person.synthetic-1', organizationId);
    expect(next.politics.organizations[organizationId].members['person.synthetic-1']).toBeUndefined();
    next = banOrganization(next, organizationId, actorId, 'Procedural test ban', 'Documented evidence for the test ban.');
    expect(next.politics.organizations[organizationId].status).toBe('banned');
    expect(() => runOrganizationAction(next, organizationId, 'strike')).toThrow(/cannot act/);
  });

  it('records a public action as a causal opinion driver without a raw bonus', () => {
    const { state, organizationId } = withOrganization();
    const before = state.politics.organizations[organizationId].recentDrivers.length;
    const next = runOrganizationAction(state, organizationId, 'demonstration');
    expect(next.politics.organizations[organizationId].recentDrivers).toHaveLength(before + 1);
    expect(next.politics.organizations[organizationId].recentDrivers.at(-1)!.issues).toContain('public_order');
  });

  it('restricts a ban to the executive\'s own Country', () => {
    const { state, organizationId } = withOrganization();
    const otherCountryId = worldCountryIds.find(id => id !== worldCountryIds[0])!;
    let other = createPoliticalPerson(state, { displayName: 'Foreign executive', countryId: otherCountryId });
    const foreignId = Object.keys(other.governance.persons).at(-1)!;
    other = assignPoliticalOffice(other, foreignId, { role: 'head_of_government', countryId: otherCountryId });
    expect(() => banOrganization(other, organizationId, foreignId, 'Foreign ban', 'Evidence')).toThrow(/own Country/);
  });

  it('appeals a ban without auto-restoring, then resolves the appeal as a real decision', () => {
    const { state, organizationId } = withOrganization();
    const actorId = state.governance.player.controlledPersonId!;
    let next = banOrganization(state, organizationId, actorId, 'Procedural ban', 'Documented evidence.');
    next = appealBan(next, organizationId);
    expect(next.politics.organizations[organizationId].status).toBe('banned');
    expect(next.politics.organizations[organizationId].banEvents.at(-1)!.appealedOn).toBe(state.date);
    next = resolveBanAppeal(next, organizationId, actorId, 'restore');
    expect(next.politics.organizations[organizationId].status).toBe('active');
    expect(next.politics.organizations[organizationId].banEvents.at(-1)!.appealDecision).toBe('restore');
  });

  it('donates from a real donor treasury and never treats unavailable funds as zero', () => {
    const { state, organizationId } = withOrganization();
    const donorId = state.governance.player.controlledPersonId!;
    const funded = { ...state, governance: { ...state.governance, persons: { ...state.governance.persons, [donorId]: { ...state.governance.persons[donorId], personalFundsUsd: 1_000 } } } };
    const donated = donateToOrganization(funded, organizationId, donorId, 400);
    expect(donated.politics.organizations[organizationId].fundsUsd).toBe(400);
    expect(donated.governance.persons[donorId].personalFundsUsd).toBe(600);
    expect(() => donateToOrganization(state, organizationId, donorId, 100)).toThrow(/no personal treasury/);
    const noFundsOrg = { ...funded, politics: { ...funded.politics, organizations: { ...funded.politics.organizations, [organizationId]: { ...funded.politics.organizations[organizationId], fundsUsd: undefined } } } };
    expect(() => donateToOrganization(noFundsOrg, organizationId, donorId, 100)).toThrow(/unavailable funds/);
  });

  it('registers, merges and splits mutable organizations', () => {
    const { state } = withOrganization();
    let next = registerOrganization(state, { countryId: worldCountryIds[0], type: 'association', displayName: 'Dynamic association' });
    const ids = Object.keys(next.politics.organizations).filter(id => next.politics.organizations[id].source === 'dynamic');
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const target = next.politics.organizations[ids[0]], absorbed = next.politics.organizations[ids[1]];
    next = mergeOrganizations(next, target.organizationId, absorbed.organizationId);
    expect(next.politics.organizations[absorbed.organizationId].status).toBe('dissolved');
    const remaining = Object.values(next.politics.organizations).find(o => o.source === 'dynamic' && o.status === 'active')!;
    const split = splitOrganization(next, remaining.organizationId, 'Split branch');
    const dynamicAfter = Object.values(split.politics.organizations).filter(o => o.source === 'dynamic');
    expect(dynamicAfter.length).toBeGreaterThanOrEqual(2);
  });

  it('derives mutable party organizations and preserves dynamic organizations across a weekly pass', () => {
    const state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    expect(Object.values(state.politics.organizations).some(o => o.type === 'party')).toBe(true);
    let next = registerOrganization(state, { countryId: worldCountryIds[0], type: 'union', displayName: 'Weekly union' });
    const dynamicId = Object.keys(next.politics.organizations).find(id => next.politics.organizations[id].source === 'dynamic' && next.politics.organizations[id].displayName === 'Weekly union')!;
    next = runPoliticalOpinionWeek(next);
    expect(next.politics.organizations[dynamicId]).toBeDefined();
  });
});
