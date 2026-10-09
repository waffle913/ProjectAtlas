import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { assertSimulationInvariants } from '../invariants';
import { joinOrganization, leaveOrganization, dissolveOrganization, banOrganization, runOrganizationAction, appealBan, resolveBanAppeal, donateToOrganization, registerOrganization, mergeOrganizations, splitOrganization, runPoliticalOpinionWeek, addInternalCurrent, setOrganizationFunds, allocateStrikeFund, addUnionClaim, negotiateUnionClaim, fundCybersecurity, runCyberAttack } from '../politics/runtime';
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
    status: 'active', members: {}, fundsUsd: 0, internalCurrents: {}, banEvents: [], fundingEvents: [{ on: state.date, amountUsd: 0, kind: 'seed' }], strikeFundUsd: 0, claims: [], dissolutionEvents: [], activeStrikes: [], countryId: worldCountryIds[0], type: 'association', displayName: 'Synthetic test organization', source: 'dynamic',
  };
  return { state: { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: entry } } }, organizationId };
}

describe('0.23 organizations', () => {
  it('joins, leaves, dissolves and bans an organization, and a banned organization cannot act', () => {
    const { state, organizationId } = withOrganization();
    const actorId = state.governance.player.controlledPersonId ?? Object.keys(state.governance.persons).find(id => state.governance.persons[id].office?.role === 'head_of_government')!;
    let next = joinOrganization(state, actorId, organizationId);
    expect(next.politics.organizations[organizationId].members[actorId]).toBeDefined();
    next = leaveOrganization(next, actorId, organizationId);
    expect(next.politics.organizations[organizationId].members[actorId]).toBeUndefined();
    expect(() => dissolveOrganization(next, organizationId, actorId, '')).toThrow(/motive/);
    next = dissolveOrganization(next, organizationId, actorId, 'Procedural test dissolution.');
    expect(next.politics.organizations[organizationId].status).toBe('dissolved');
    expect(next.politics.organizations[organizationId].dissolutionEvents).toHaveLength(1);
    expect(() => runOrganizationAction(next, organizationId, 'demonstration')).toThrow(/cannot act/);
    // A fresh organization for the ban flow.
    const { state: freshState, organizationId: freshId } = withOrganization();
    next = banOrganization(freshState, freshId, actorId, 'Procedural test ban', 'Documented evidence for the test ban.');
    expect(next.politics.organizations[freshId].status).toBe('banned');
    expect(() => runOrganizationAction(next, freshId, 'strike')).toThrow(/cannot act/);
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
    next = appealBan(next, organizationId, actorId);
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

  it('lets a dynamic union strike and respects its own country\'s emergency restrictions', () => {
    const countryId = worldCountryIds[0];
    const base = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    let state = registerOrganization(base, { countryId, type: 'union', displayName: 'Dynamic strike union' });
    const unionId = Object.keys(state.politics.organizations).find(id => state.politics.organizations[id].type === 'union' && state.politics.organizations[id].source === 'dynamic')!;
    // A strike needs a causal purpose (a pending claim) and, for a tracked treasury, a strike fund.
    expect(() => runOrganizationAction(state, unionId, 'strike')).toThrow(/pending union claim/);
    state = addUnionClaim(state, unionId, 'labour_protection', 8_000, 'Demand stronger labour protections.');
    expect(() => runOrganizationAction(state, unionId, 'strike')).toThrow(/strike fund/);
    state = setOrganizationFunds(state, unionId, 5_000, 'test:union-dues');
    state = allocateStrikeFund(state, unionId, 3_000);
    state = runOrganizationAction(state, unionId, 'strike');
    expect(state.politics.organizations[unionId].recentDrivers.at(-1)!.issues).toContain('labour_protection');
    // The strike drew down the reserved strike fund; the ledger reconciles exactly.
    expect(state.politics.organizations[unionId].strikeFundUsd).toBe(2_000);
    expect(state.politics.organizations[unionId].fundsUsd).toBe(2_000);
    const withEmergency = { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], emergency: { status: 'active' as const, justificationEpisodeIds: [], ministerialRecommendations: [], restrictions: { assembliesBanned: false, strikesBanned: true, policePowersEnhanced: false, bordersClosed: false } } } } } };
    expect(() => runOrganizationAction(withEmergency, unionId, 'strike')).toThrow(/banned under the state of emergency/);
  });

  it('represents religious organizations as a supported family with unavailable sourced coverage', () => {
    const countryId = worldCountryIds[0];
    const base = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    // No sourced religious organization is fabricated: the family stays absent from registry data.
    expect(Object.values(base.politics.organizations).some(org => org.type === 'religious' && org.source === 'registry')).toBe(false);
    // A dynamic religious registration is representable; its sourced coverage remains unavailable.
    const state = registerOrganization(base, { countryId, type: 'religious', displayName: 'Dynamic religious community' });
    const religiousId = Object.keys(state.politics.organizations).find(id => state.politics.organizations[id].type === 'religious')!;
    expect(religiousId).toBeDefined();
    expect(state.politics.organizations[religiousId].source).toBe('dynamic');
    // A religious organization has no sourced action power beyond lawful assembly.
    expect(() => runOrganizationAction(state, religiousId, 'strike')).toThrow(/Only a union may strike/);
    const next = runOrganizationAction(state, religiousId, 'demonstration');
    expect(next.politics.organizations[religiousId].recentDrivers.at(-1)!.issues).toContain('public_order');
  });

  it('never resets the mutable party line from the static registry across weekly passes', () => {
    const countryId = worldCountryIds[0];
    const base = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    const partyId = politicalRegistry.countries[countryId].partyIds[0];
    const issue = 'labour_protection' as const;
    const registryValue = politicalRegistry.parties[partyId].issuePositions[issue].preferenceBps;
    const shiftedValue = registryValue === 0 ? 10_000 : 0;
    const mutated = { ...base, politics: { ...base.politics, organizations: { ...base.politics.organizations, [partyId]: { ...base.politics.organizations[partyId], currentPositions: { ...base.politics.organizations[partyId].currentPositions, [issue]: shiftedValue } } } } };
    const after = runPoliticalOpinionWeek(mutated);
    const position = after.politics.organizations[partyId].currentPositions[issue];
    // Inertia: one bounded step toward the registry, never a reset.
    expect(position).toBe(Math.round((shiftedValue * 8_000 + registryValue * 2_000) / 10_000));
    expect(position).not.toBe(registryValue);
  });

  it('lets internal currents progressively move the mutable party line week by week', () => {
    const countryId = worldCountryIds[0];
    let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    const partyId = politicalRegistry.countries[countryId].partyIds[0];
    const issue = 'fiscal_distribution' as const;
    const targetBps = 9_000;
    state = addInternalCurrent(state, partyId, 'current.push', 'Modelled push current', 10_000, { [issue]: targetBps });
    const before = state.politics.organizations[partyId].currentPositions[issue];
    // Two competing bounded pulls each week: the static registry line pulls with organization inertia,
    // then the currents pull with evolution inertia. Both are partial, so the movement is progressive.
    const registryValue = politicalRegistry.parties[partyId].issuePositions[issue].preferenceBps;
    const weekStep = (prior: number) => {
      const registryPull = Math.round((prior * 8_000 + registryValue * 2_000) / 10_000);
      return Math.max(0, Math.min(10_000, Math.round((registryPull * 8_000 + targetBps * 2_000) / 10_000)));
    };
    const week1 = runPoliticalOpinionWeek(state);
    const after1 = week1.politics.organizations[partyId].currentPositions[issue];
    expect(after1).toBe(weekStep(before));
    expect(Math.abs(after1 - targetBps)).toBeLessThan(Math.abs(before - targetBps));
    const week2 = runPoliticalOpinionWeek({ ...week1, date: '2026-01-08' });
    const after2 = week2.politics.organizations[partyId].currentPositions[issue];
    expect(after2).toBe(weekStep(after1));
    // Progressive: the line keeps approaching the current's modelled position, never jumping to it.
    expect(Math.abs(after2 - targetBps)).toBeLessThan(Math.abs(after1 - targetBps));
    expect(() => addInternalCurrent(state, partyId, 'current.bad', 'Bad current', 12_000)).toThrow(/salience/);
  });

  it('gates actions by organization family: petition is association-only and rally is party-only', () => {
    const countryId = worldCountryIds[0];
    const base = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    let state = registerOrganization(base, { countryId, type: 'association', displayName: 'Petition association' });
    const associationId = Object.keys(state.politics.organizations).find(id => state.politics.organizations[id].source === 'dynamic' && state.politics.organizations[id].type === 'association')!;
    state = registerOrganization(state, { countryId, type: 'party', displayName: 'Rally party' });
    const partyId = Object.keys(state.politics.organizations).find(id => state.politics.organizations[id].source === 'dynamic' && state.politics.organizations[id].type === 'party')!;
    expect(() => runOrganizationAction(state, partyId, 'petition')).toThrow(/Only an association may petition/);
    expect(() => runOrganizationAction(state, associationId, 'rally')).toThrow(/Only a party may hold a campaign rally/);
    const petitioned = runOrganizationAction(state, associationId, 'petition');
    expect(petitioned.politics.organizations[associationId].recentDrivers.at(-1)!.issues).toContain('public_order');
    const rallied = runOrganizationAction(state, partyId, 'rally');
    expect(rallied.politics.organizations[partyId].recentDrivers.at(-1)!.issues).toContain('public_order');
  });

  it('records, funds and negotiates union claims through a real government settlement', () => {
    const countryId = worldCountryIds[0];
    const base = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    let state = registerOrganization(base, { countryId, type: 'union', displayName: 'Negotiating union' });
    const unionId = Object.keys(state.politics.organizations).find(id => state.politics.organizations[id].source === 'dynamic' && state.politics.organizations[id].type === 'union')!;
    const actor = Object.values(state.governance.persons).find(person => person.countryId === countryId && person.office?.role === 'head_of_government');
    expect(() => negotiateUnionClaim(state, unionId, 'claim.missing', actor?.id ?? 'unknown', 'accepted', 7_000)).toThrow(/pending claim/);
    state = addUnionClaim(state, unionId, 'labour_protection', 8_000, 'Demand a shorter working week.');
    const claimId = state.politics.organizations[unionId].claims[0].id;
    expect(() => addUnionClaim(state, unionId, 'labour_protection', 12_000, 'Out of range claim.')).toThrow(/0\.\.10000/);
    if (actor) {
      state = negotiateUnionClaim(state, unionId, claimId, actor.id, 'accepted', 7_500);
      const claim = state.politics.organizations[unionId].claims[0];
      expect(claim.status).toBe('settled');
      expect(claim.settlement).toMatchObject({ byPersonId: actor.id, outcome: 'accepted', agreedBps: 7_500 });
      // A settled claim no longer justifies a strike.
      state = setOrganizationFunds(state, unionId, 5_000, 'test:union-dues');
      state = allocateStrikeFund(state, unionId, 2_000);
      expect(() => runOrganizationAction(state, unionId, 'strike')).toThrow(/pending union claim/);
    }
  });

  it('funds cybersecurity from the treasury and conserves funds across a cyber attack', () => {
    const countryId = worldCountryIds[0];
    const base = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    let state = registerOrganization(base, { countryId, type: 'party', displayName: 'Cyber target party' });
    const targetId = Object.keys(state.politics.organizations).find(id => state.politics.organizations[id].source === 'dynamic' && state.politics.organizations[id].type === 'party')!;
    state = registerOrganization(state, { countryId, type: 'association', displayName: 'Cyber attacker association' });
    const attackerId = Object.keys(state.politics.organizations).find(id => state.politics.organizations[id].source === 'dynamic' && state.politics.organizations[id].type === 'association')!;
    expect(() => runCyberAttack(state, attackerId, targetId)).toThrow(/lacks the funds/);
    state = setOrganizationFunds(state, targetId, 10_000, 'test:party-financing');
    state = setOrganizationFunds(state, attackerId, 5_000, 'test:association-dues');
    // No defence: the attack reaches the whole treasury share.
    state = runCyberAttack(state, attackerId, targetId);
    const targetAfter = state.politics.organizations[targetId], attackerAfter = state.politics.organizations[attackerId];
    expect(targetAfter.fundsUsd).toBe(0);
    expect(attackerAfter.fundsUsd).toBe(5_000 - 1_000 + 10_000);
    // The target's ledger replays its funds exactly (conservation).
    const replayed = (targetAfter.fundingEvents ?? []).reduce((sum, event) => sum + event.amountUsd, 0);
    expect(replayed).toBe(targetAfter.fundsUsd! + (targetAfter.strikeFundUsd ?? 0));
    // Defence spending reduces the reach of a later attack.
    state = fundCybersecurity(state, attackerId, 2_000);
    expect(state.politics.organizations[attackerId].cyberSecurityBps).toBeGreaterThan(0);
    // The whole funded-organization ledger reconciles under the simulation invariants.
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
  });

  it('requires a real person of the organization\'s own Country to join', () => {
    const countryId = worldCountryIds[0];
    const otherCountryId = worldCountryIds.find(id => id !== countryId)!;
    const { state, organizationId } = withOrganization();
    expect(() => joinOrganization(state, 'person.missing', organizationId)).toThrow(/active political person/);
    const otherPerson = Object.values(state.governance.persons).find(person => person.countryId === otherCountryId);
    if (otherPerson) expect(() => joinOrganization(state, otherPerson.id, organizationId)).toThrow(/own Country/);
  });
});
