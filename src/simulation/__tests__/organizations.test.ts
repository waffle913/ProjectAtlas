import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { joinOrganization, leaveOrganization, dissolveOrganization, banOrganization, runOrganizationAction } from '../politics/runtime';
import type { SimulationState } from '../../types';
import type { OrganizationPoliticalState, PoliticalIssue } from '../politics/model';

function withOrganization(): { state: SimulationState; organizationId: string } {
  const state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
  const organizationId = 'organization.synthetic-test';
  const entry: OrganizationPoliticalState = {
    organizationId, currentPositions: {} as Record<PoliticalIssue, number>, lastUpdatedOn: state.date, recentDrivers: [],
    status: 'active', members: {}, fundsUsd: 0, internalCurrents: {}, banEvents: [],
  };
  return { state: { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: entry } } }, organizationId };
}

describe('0.23 organizations', () => {
  it('joins, leaves, dissolves and bans an organization, and a banned organization cannot act', () => {
    const { state, organizationId } = withOrganization();
    let next = joinOrganization(state, 'person.synthetic-1', organizationId);
    expect(next.politics.organizations[organizationId].members['person.synthetic-1']).toBeDefined();
    next = leaveOrganization(next, 'person.synthetic-1', organizationId);
    expect(next.politics.organizations[organizationId].members['person.synthetic-1']).toBeUndefined();
    next = banOrganization(next, organizationId, 'person.synthetic-actor', 'Procedural test ban', 'Documented evidence for the test ban.');
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
});
