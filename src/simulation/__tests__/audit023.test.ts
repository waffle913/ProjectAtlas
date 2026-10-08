import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { assertSimulationInvariants } from '../invariants';
import { politicalRegistry } from '../politics/registry';

describe('0.23 worldwide coverage audit', () => {
  it('initializes Constitution, Elections and Organizations for the full registry with invariant coherence', () => {
    const state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
    const constitutionCoverage = Object.values(state.constitution.countries).reduce((acc, c) => (acc[c.coverage] = (acc[c.coverage] ?? 0) + 1, acc), {} as Record<string, number>);
    const electionsCountries = Object.keys(state.elections.countries).length;
    const electionsChambers = Object.values(state.elections.countries).reduce((sum, c) => sum + Object.keys(c.chambers).length, 0);
    const organizations = Object.values(state.politics.organizations);
    const orgStatus = organizations.reduce((acc, o) => (acc[o.status] = (acc[o.status] ?? 0) + 1, acc), {} as Record<string, number>);
    const orgFamilies = organizations.reduce((acc, o) => (acc[o.type ?? 'unavailable'] = (acc[o.type ?? 'unavailable'] ?? 0) + 1, acc), {} as Record<string, number>);
    console.info(`AUDIT_023 ${JSON.stringify({ constitutionCoverage, electionsCountries, electionsChambers, organizationStatus: orgStatus, organizationFamilies: orgFamilies, organizationCount: organizations.length })}`);
    expect(electionsCountries).toBeGreaterThan(0);
    // The dynamic organization map materializes the four families. The registry supplies 20
    // unions/associations; every registry party is also materialized as a mutable party organization
    // (948), so the total is 20 + 948 = 968. Religious organizations remain unavailable (none sourced).
    expect(organizations.length).toBe(Object.keys(politicalRegistry.organizations).length + Object.keys(politicalRegistry.parties).length);
    expect(orgFamilies.union).toBeGreaterThan(0);
    expect(orgFamilies.association).toBeGreaterThan(0);
    expect(orgFamilies.party).toBe(Object.keys(politicalRegistry.parties).length);
    // Religious coverage stays unavailable: no sourced religious organization is fabricated.
    expect(orgFamilies.religious).toBeUndefined();
  });
});
