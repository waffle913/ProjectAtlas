import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { dissolveParliament, runElection, makeCampaignPromise } from '../elections/runtime';
import { proportionalSeats } from '../elections/model';

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
    expect(entry.totalSeats).toBeGreaterThan(0);
    const allocated = Object.values(entry.seatsByParty).reduce((a, b) => a + b, 0);
    expect(allocated).toBeLessThanOrEqual(entry.totalSeats);
    for (const party of Object.values(entry.parties)) {
      expect(party.currentSeats).toBe(entry.seatsByParty[party.partyId]);
      expect(['government', 'opposition', 'unavailable']).toContain(party.governmentStatus);
    }
  });

  it('dissolves parliament only with executive authority and reruns a deterministic election', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    expect(() => dissolveParliament(initial, countryId, 'unknown')).toThrow(/executive head/);
    state = dissolveParliament(state, countryId, personId);
    const a = runElection(state, countryId);
    const b = runElection(state, countryId);
    expect(a).toEqual(b);
    const entry = a.elections.countries[countryId];
    const allocated = Object.values(entry.seatsByParty).reduce((x, y) => x + y, 0);
    expect(allocated).toBe(entry.totalSeats);
    expect(entry.lastElectionDate).toBe(state.date);
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
});
