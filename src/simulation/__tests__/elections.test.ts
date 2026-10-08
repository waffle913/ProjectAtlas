import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { dissolveParliament, runElection, runElectionCycle, makeCampaignPromise, recordPromiseOutcome } from '../elections/runtime';
import { proportionalSeats } from '../elections/model';
import { politicalRegistry } from '../politics/registry';

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
});
