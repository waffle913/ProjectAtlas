import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { dissolveParliament, runElection, runElectionCycle, makeCampaignPromise, recordPromiseOutcome, runDirectElection, formCoalition } from '../elections/runtime';
import { registerOrganization, splitOrganization, mergeOrganizations } from '../politics/runtime';
import { proportionalSeats } from '../elections/model';
import { politicalRegistry } from '../politics/registry';
import { assertSimulationInvariants } from '../invariants';

let initial: ReturnType<typeof initializeNewGame>;
beforeAll(() => { initial = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs); }, 30_000);

function executive(state = initial) {
  let next = createPoliticalPerson(state, { displayName: 'Election executive', countryId: worldCountryIds[0] });
  const id = Object.keys(next.governance.persons).at(-1)!;
  return setControlledPerson(assignPoliticalOffice(next, id, { role: 'head_of_government', countryId: worldCountryIds[0] }), id);
}

describe('0.23 elections engine', () => {
  it('derives a dynamic seat allocation without rewriting the static registry', () => {
    const countryId = worldCountryIds[0];
    const entry = initial.elections.countries[countryId];
    expect(entry).toBeDefined();
    const chambers = Object.values(entry.chambers);
    expect(chambers.length).toBeGreaterThan(0);
    for (const chamber of chambers) {
      expect(chamber.totalSeats).toBeGreaterThan(0);
      const allocated = Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0);
      expect(allocated).toBeLessThanOrEqual(chamber.totalSeats);
    }
    for (const party of Object.values(entry.parties)) {
      expect(party.currentSeats).toBeGreaterThanOrEqual(0);
      expect(['government', 'opposition', 'unavailable']).toContain(party.governmentStatus);
    }
  });

  it('dissolves parliament only with executive authority and reruns a deterministic election', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    expect(() => dissolveParliament(initial, countryId, 'unknown')).toThrow(/executive head/);
    state = dissolveParliament({ ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], parliament: { ...state.constitution.countries[countryId].parliament, dissolutionHolder: 'executive' }, election: { ...state.constitution.countries[countryId].election, parliamentarySystem: 'proportional', rounds: 1 } } } } }, countryId, personId);
    const a = runElection(state, countryId);
    const b = runElection(state, countryId);
    expect(a).toEqual(b);
    const entry = a.elections.countries[countryId];
    const allocated = Object.values(entry.chambers).reduce((sum, chamber) => sum + Object.values(chamber.seatsByParty).reduce((x, y) => x + y, 0), 0);
    expect(allocated).toBeLessThanOrEqual(Object.values(entry.chambers).reduce((sum, chamber) => sum + chamber.totalSeats, 0));
    expect(Object.values(entry.chambers).every(chamber => chamber.lastElectionDate === state.date)).toBe(true);
  });

  it('records a campaign promise without applying the promised policy', () => {
    const countryId = worldCountryIds[0];
    const partyId = Object.keys(initial.elections.countries[countryId].parties)[0];
    if (!partyId) return;
    const before = initial.fiscal.countries[countryId].annualBudget;
    const state = makeCampaignPromise(initial, partyId, countryId, 'Cut corporate tax', 'fiscal_reform', { annualBudget: { ...before, infrastructure: before.infrastructure + 1 } });
    const promises = state.elections.countries[countryId].parties[partyId].promises;
    expect(promises).toHaveLength(1);
    expect(promises[0].status).toBe('pending');
    expect(state.fiscal.countries[countryId].annualBudget).toEqual(before);
  });

  it('converts votes to seats deterministically with a threshold', () => {
    const seats = proportionalSeats({ a: 6000, b: 3000, c: 1000 }, 10);
    expect(Object.values(seats).reduce((x, y) => x + y, 0)).toBe(10);
    const filtered = proportionalSeats({ a: 6000, b: 3000, c: 1000 }, 10, 2000);
    expect(filtered.c).toBeUndefined();
  });

  it('leaves government, governmentStatus and offices untouched when the election rules are unavailable', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    state = { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], election: { ...state.constitution.countries[countryId].election, parliamentarySystem: 'unavailable', rounds: 'unavailable' } } } } };
    const before = structuredClone(state.elections.countries[countryId]);
    const officesBefore = Object.values(state.governance.persons).filter(p => p.office).map(p => p.id);
    const result = runElection(state, countryId);
    expect(result.elections.countries[countryId]).toEqual(before);
    expect(Object.values(result.governance.persons).filter(p => p.office).map(p => p.id)).toEqual(officesBefore);
    expect(runElectionCycle(result)).toEqual(result);
  });

  it('runs a simulated regional majoritarian election with a two-round proximity runoff', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    state = { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], election: { ...state.constitution.countries[countryId].election, parliamentarySystem: 'majoritarian', rounds: 2 } } } } };
    const a = runElection(state, countryId);
    const b = runElection(state, countryId);
    expect(a).toEqual(b);
    const entry = a.elections.countries[countryId];
    const allocated = Object.values(entry.chambers).reduce((sum, chamber) => sum + Object.values(chamber.seatsByParty).reduce((x, y) => x + y, 0), 0);
    const total = Object.values(entry.chambers).reduce((sum, chamber) => sum + chamber.totalSeats, 0);
    expect(allocated).toBeLessThanOrEqual(total);
    expect(allocated).toBeGreaterThan(0);
  });

  it('simulates stable single-member districts that never drop seats and never award a region winner-take-all', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const partyIds = politicalRegistry.countries[countryId].partyIds;
    if (partyIds.length < 2) return;
    // Take the most populated region and reduce it to two cohorts with split support: the region's
    // districts must elect both parties (no winner-take-all) and every district seat must be awarded.
    const regionId = [...(state.politics.countries[countryId].regionIds ?? [])].sort((a, b) => (state.socioeconomy.regions[b]?.population ?? 0) - (state.socioeconomy.regions[a]?.population ?? 0))[0];
    const cohorts = state.socioeconomy.regions[regionId].cohorts.filter(c => c.persons > 0).slice(0, 2);
    expect(cohorts.length).toBe(2);
    const opinions = { ...state.politics.regionalOpinion[regionId].cohorts };
    cohorts.forEach((cohort, index) => {
      const key = `${cohort.income}:${cohort.orientation}`;
      const prior = opinions[key];
      opinions[key] = [prior?.[0] ?? [], prior?.[1] ?? [], partyIds.map((_, i) => (i === index % 2 ? 10_000 : 0)), 10_000, prior?.[4] ?? 5_000, prior?.[5] ?? 0, []];
    });
    state = {
      ...state,
      constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], election: { ...state.constitution.countries[countryId].election, parliamentarySystem: 'majoritarian', rounds: 1 } } } },
      politics: { ...state.politics, regionalOpinion: { ...state.politics.regionalOpinion, [regionId]: { ...state.politics.regionalOpinion[regionId], cohorts: opinions } } },
    };
    const a = runElection(state, countryId);
    expect(a).toEqual(runElection(state, countryId)); // stable districts: same state, same winners
    for (const chamber of Object.values(a.elections.countries[countryId].chambers)) {
      const allocated = Object.values(chamber.seatsByParty).reduce((x, y) => x + y, 0);
      expect(allocated).toBe(chamber.totalSeats - chamber.independentOtherSeats); // no seat silently dropped
    }
    const totalByParty = Object.values(a.elections.countries[countryId].chambers).reduce((sum, chamber) => {
      for (const [partyId, seats] of Object.entries(chamber.seatsByParty)) sum[partyId] = (sum[partyId] ?? 0) + seats;
      return sum;
    }, {} as Record<string, number>);
    expect(totalByParty[partyIds[0]] ?? 0).toBeGreaterThan(0);
    expect(totalByParty[partyIds[1]] ?? 0).toBeGreaterThan(0); // the split region elected both parties
  });

  it('uses the district allocation for the majoritarian half of a mixed system and conserves seats', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    state = { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], election: { ...state.constitution.countries[countryId].election, parliamentarySystem: 'mixed', rounds: 1 } } } } };
    const next = runElection(state, countryId);
    for (const chamber of Object.values(next.elections.countries[countryId].chambers)) {
      const allocated = Object.values(chamber.seatsByParty).reduce((x, y) => x + y, 0);
      expect(allocated).toBe(chamber.totalSeats - chamber.independentOtherSeats);
    }
  });

  it('forms coalitions preferring politically compatible partners over raw seat size', () => {
    const distances: Record<string, number> = { 'A|B': 1_000, 'B|A': 1_000, 'A|C': 5_000, 'C|A': 5_000, 'B|C': 8_000, 'C|B': 8_000 };
    const proximity = (a: string, b: string): number => distances[`${a}|${b}`] ?? 10_000;
    // A leads with 40/100 seats; B (20) is ideologically close, C (30) is distant. The closer partner
    // joins first even though C has more seats.
    const coalition = formCoalition({ A: 40, B: 20, C: 30 }, 100, proximity);
    expect(coalition.coalitionPartyIds).toEqual(['A', 'B']);
    expect(coalition.confidence).toBe('coalition');
    // A single-party majority needs no partners.
    expect(formCoalition({ A: 60, B: 40 }, 100, proximity)).toEqual({ coalitionPartyIds: ['A'], confidence: 'majority' });
    // A coalition that cannot reach a majority is honestly reported as minority.
    expect(formCoalition({ A: 40, B: 5, C: 5 }, 100, proximity).confidence).toBe('minority');
  });

  it('lets substantive pending promise content influence the vote on top of credibility', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const partyIds = politicalRegistry.countries[countryId].partyIds;
    if (partyIds.length < 2) return;
    state = {
      ...state,
      constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], election: { ...state.constitution.countries[countryId].election, parliamentarySystem: 'proportional', rounds: 1 } } } },
      politics: { ...state.politics, countries: { ...state.politics.countries, [countryId]: { ...state.politics.countries[countryId], nationalSupportBps: partyIds.map((id, i) => (i < 2 ? 5_000 : 0)) } } },
    };
    const seatsFor = (result: ReturnType<typeof runElection>, partyId: string) => Object.values(result.elections.countries[countryId].chambers).reduce((sum, chamber) => sum + (chamber.seatsByParty[partyId] ?? 0), 0);
    // Equal support: the largest-remainder tie may differ by one seat, never more.
    const before = runElection(state, countryId);
    expect(Math.abs(seatsFor(before, partyIds[0]) - seatsFor(before, partyIds[1]))).toBeLessThanOrEqual(1);
    // A pending promise with a real payload is a modelled vote driver: the same support now favors p0.
    const withPromise = makeCampaignPromise(state, partyIds[0], countryId, 'Modelled promise content', 'fiscal_reform', { annualBudget: { ...state.fiscal.countries[countryId].annualBudget } });
    const after = runElection(withPromise, countryId);
    expect(seatsFor(after, partyIds[0])).toBeGreaterThan(seatsFor(after, partyIds[1]));
    // A promise without a payload carries no content lift.
    const emptyPromise = makeCampaignPromise(state, partyIds[1], countryId, 'Empty promise', 'fiscal_reform');
    const afterEmpty = runElection(emptyPromise, countryId);
    expect(Math.abs(seatsFor(afterEmpty, partyIds[0]) - seatsFor(afterEmpty, partyIds[1]))).toBeLessThanOrEqual(1);
  });

  it('forms the government only through the chosen_by_parliament procedure, never from a direct election', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const electionRules = { ...state.constitution.countries[countryId].election, parliamentarySystem: 'proportional' as const, rounds: 1 as const };
    const setAppointment = (mode: 'chosen_by_parliament' | 'elected_directly' | 'appointed_by_head_of_state') => ({
      ...state,
      constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], election: electionRules, government: { ...state.constitution.countries[countryId].government, appointmentMode: mode } } } },
    });
    const beforeGovernment = state.elections.countries[countryId].government;
    // Direct election and head-of-state appointment never derive the government from the electoral bloc.
    for (const mode of ['elected_directly', 'appointed_by_head_of_state'] as const) {
      const next = runElection(setAppointment(mode), countryId);
      expect(next.elections.countries[countryId].government).toEqual(beforeGovernment);
    }
    // A parliament-chosen government is derived from the seats.
    const parliamentary = runElection(setAppointment('chosen_by_parliament'), countryId);
    expect(parliamentary.elections.countries[countryId].government.coalitionPartyIds.length).toBeGreaterThan(0);
  });

  it('derives credibility from promise outcomes and feeds it into the vote conversion', () => {
    const countryId = worldCountryIds[0];
    const partyId = Object.keys(initial.elections.countries[countryId].parties)[0];
    if (!partyId) return;
    let state = makeCampaignPromise(initial, partyId, countryId, 'Cut corporate tax', 'fiscal_reform', { annualBudget: { ...initial.fiscal.countries[countryId].annualBudget } });
    const promiseId = state.elections.countries[countryId].parties[partyId].promises[0].id;
    state = recordPromiseOutcome(state, countryId, partyId, promiseId, 'broken');
    expect(state.elections.countries[countryId].parties[partyId].credibilityBps).toBe(0);
    // The broken promise is a typed record, never an applied policy.
    expect(state.elections.countries[countryId].parties[partyId].promises[0]).toMatchObject({ promisedKind: 'fiscal_reform', status: 'broken' });
    expect(state.fiscal.countries[countryId].annualBudget).toEqual(initial.fiscal.countries[countryId].annualBudget);
  });

  it('never awards seats to a banned or dissolved party organization', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    state = { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], election: { ...state.constitution.countries[countryId].election, parliamentarySystem: 'proportional', rounds: 1 } } } } };
    const partyId = politicalRegistry.countries[countryId].partyIds[0];
    state = { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [partyId]: { ...(state.politics.organizations[partyId] ?? { organizationId: partyId, currentPositions: {} as never, lastUpdatedOn: state.date, recentDrivers: [], status: 'active', members: {}, internalCurrents: {}, banEvents: [], fundingEvents: [], claims: [], dissolutionEvents: [], countryId, type: 'party', source: 'registry' }), status: 'banned' } } } };
    const next = runElection(state, countryId);
    const seats = Object.values(next.elections.countries[countryId].chambers).reduce((sum, chamber) => sum + (chamber.seatsByParty[partyId] ?? 0), 0);
    expect(seats).toBe(0);
  });

  it('keeps dynamic parties off the ballot: they contest no election and win no seats', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    state = { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], election: { ...state.constitution.countries[countryId].election, parliamentarySystem: 'proportional', rounds: 1 } } } } };
    state = registerOrganization(state, { countryId, type: 'party', displayName: 'Dynamic ballot party' });
    const dynamicId = Object.keys(state.politics.organizations).find(id => state.politics.organizations[id].source === 'dynamic' && state.politics.organizations[id].type === 'party')!;
    const next = runElection(state, countryId);
    const seats = Object.values(next.elections.countries[countryId].chambers).reduce((sum, chamber) => sum + (chamber.seatsByParty[dynamicId] ?? 0), 0);
    expect(seats).toBe(0);
    expect(next.elections.countries[countryId].parties[dynamicId]).toBeUndefined();
  });

  it('keeps split-off parties off the ballot and removes a merged-away party from the contest', () => {
    const countryId = worldCountryIds[0];
    const partyIds = politicalRegistry.countries[countryId].partyIds;
    if (partyIds.length < 2) return;
    let state = executive();
    state = { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], election: { ...state.constitution.countries[countryId].election, parliamentarySystem: 'proportional', rounds: 1 } } } } };
    // Split the first party's organization: the split-off is dynamic and never inherits ballot access.
    state = splitOrganization(state, partyIds[0], 'Split-off party');
    const splitId = Object.keys(state.politics.organizations).find(id => state.politics.organizations[id].source === 'dynamic' && state.politics.organizations[id].type === 'party')!;
    // Merge the second party into the first: the absorbed registry party leaves the electoral contest.
    state = mergeOrganizations(state, partyIds[0], partyIds[1]);
    const next = runElection(state, countryId);
    const seatsFor = (partyId: string) => Object.values(next.elections.countries[countryId].chambers).reduce((sum, chamber) => sum + (chamber.seatsByParty[partyId] ?? 0), 0);
    expect(seatsFor(splitId)).toBe(0);
    expect(seatsFor(partyIds[1])).toBe(0);
    expect(seatsFor(partyIds[0])).toBeGreaterThan(0);
  });

  it('runs a direct executive election only under elected_directly and records it honestly', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    expect(() => runDirectElection(state, countryId, personId)).toThrow(/directly-elected/);
    state = { ...state, constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], government: { ...state.constitution.countries[countryId].government, appointmentMode: 'elected_directly' } } } } };
    const next = runDirectElection(state, countryId, personId);
    const entry = next.elections.countries[countryId];
    expect(entry.directElection).toMatchObject({ on: state.date, actorPersonId: personId });
    const winnerId = entry.directElection!.winnerPartyId;
    expect(entry.government.coalitionPartyIds).toEqual([winnerId]);
    // The winner's parliamentary confidence is derived from real seats, never fabricated.
    const winnerSeats = Object.values(entry.chambers).reduce((sum, chamber) => sum + (chamber.seatsByParty[winnerId] ?? 0), 0);
    const totalSeats = Object.values(entry.chambers).reduce((sum, chamber) => sum + chamber.totalSeats, 0);
    expect(entry.government.confidence).toBe(totalSeats > 0 && winnerSeats * 2 > totalSeats ? 'majority' : 'minority');
    // The winner party's leader becomes head of government when one exists.
    const leader = Object.values(next.governance.persons).find(p => p.status === 'active' && p.countryId === countryId && p.partyId === winnerId && p.isPartyLeader);
    if (leader) expect(leader.office?.role).toBe('head_of_government');
    expect(assertSimulationInvariants(next, worldContext, 'save')).toBe(true);
  });
});
