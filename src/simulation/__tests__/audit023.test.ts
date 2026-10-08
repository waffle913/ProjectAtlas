import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { assertSimulationInvariants } from '../invariants';

describe('0.23 worldwide coverage audit', () => {
  it('initializes Constitution, Elections and Organizations for the full registry with invariant coherence', () => {
    const state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
    const constitutionCoverage = Object.values(state.constitution.countries).reduce((acc, c) => (acc[c.coverage] = (acc[c.coverage] ?? 0) + 1, acc), {} as Record<string, number>);
    const electionsCountries = Object.keys(state.elections.countries).length;
    const electionsChambers = Object.values(state.elections.countries).reduce((sum, c) => sum + Object.keys(c.chambers).length, 0);
    const organizations = Object.values(state.politics.organizations);
    const orgStatus = organizations.reduce((acc, o) => (acc[o.status] = (acc[o.status] ?? 0) + 1, acc), {} as Record<string, number>);
    console.info(`AUDIT_023 ${JSON.stringify({ constitutionCoverage, electionsCountries, electionsChambers, organizationStatus: orgStatus, organizationCount: organizations.length })}`);
    expect(electionsCountries).toBeGreaterThan(0);
    expect(organizations.length).toBeGreaterThan(0);
  });
});
