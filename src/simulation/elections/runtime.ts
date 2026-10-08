import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import type { FiscalProposalPayload, ProposalKind } from '../governance/model';
import { politicalRegistry } from '../politics/registry';
import { ELECTIONS_VERSION, proportionalSeats, type CampaignPromise, type ElectionCountryState } from './model';

const isExecutive = (state: SimulationState, personId: string, countryId: string): boolean => {
  const person = state.governance.persons[personId];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && ['head_of_government', 'head_of_state'].includes(person.office.role));
};

const countryEntry = (state: SimulationState, countryId: string): ElectionCountryState => {
  const entry = state.elections.countries[countryId];
  if (!entry) throw new Error('No election state for this Country.');
  return entry;
};

/** Dissolve parliament and call a fresh election. Requires the executive office. */
export function dissolveParliament(state: SimulationState, countryId: string, personId: string): SimulationState {
  if (!isExecutive(state, personId, countryId)) throw new Error('Only the executive head may dissolve parliament.');
  const entry = countryEntry(state, countryId);
  return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, nextElectionDate: state.date } } } };
}

/** Deterministic party vote-share source. Uses the current politics national support when available,
 *  otherwise falls back to the incumbent seat allocation (a documented incumbent baseline, not a bonus). */
const voteSharesFor = (state: SimulationState, countryId: string): Record<string, number> => {
  const politicsCountry = state.politics.countries[countryId];
  const entry = countryEntry(state, countryId);
  const partyIds = politicalRegistry.countries[countryId]?.partyIds ?? [];
  if (politicsCountry?.nationalSupportBps?.length) {
    const shares: Record<string, number> = {};
    partyIds.forEach((partyId, index) => { shares[partyId] = politicsCountry.nationalSupportBps[index] ?? 0; });
    if (Object.keys(shares).length) return shares;
  }
  return { ...entry.seatsByParty };
};

/** Run one deterministic national election and recompute the dynamic seat allocation. */
export function runElection(state: SimulationState, countryId: string): SimulationState {
  const entry = countryEntry(state, countryId);
  const votes = voteSharesFor(state, countryId);
  const seats = proportionalSeats(votes, entry.totalSeats);
  const parties: ElectionCountryState['parties'] = {};
  for (const partyId of Object.keys(entry.parties)) {
    const currentSeats = seats[partyId] ?? 0;
    const previous = entry.parties[partyId];
    parties[partyId] = { ...previous, currentSeats, governmentStatus: 'unavailable', promises: previous.promises };
  }
  const sorted = Object.entries(seats).sort((a, b) => b[1] - a[1]);
  const winner = sorted[0]?.[0];
  const winnerSeats = sorted[0]?.[1] ?? 0;
  const confidence = winnerSeats * 2 > entry.totalSeats ? 'majority' : 'minority';
  for (const partyId of Object.keys(parties)) parties[partyId].governmentStatus = partyId === winner ? 'government' : 'opposition';
  return {
    ...state,
    elections: {
      ...state.elections,
      countries: {
        ...state.elections.countries,
        [countryId]: { ...entry, seatsByParty: { ...seats }, lastElectionDate: state.date, nextElectionDate: undefined, government: { coalitionPartyIds: winner ? [winner] : [], confidence: winner ? confidence : 'unavailable' }, parties },
      },
    },
  };
}

/** Monthly pass: run the election when a dissolution/term-expiry is due. */
export function runElectionCycle(state: SimulationState): SimulationState {
  let next = state;
  for (const [countryId, entry] of Object.entries(state.elections.countries)) {
    if (entry.nextElectionDate && entry.nextElectionDate <= state.date) next = runElection(next, countryId);
  }
  return next;
}

/** Record a campaign promise; it never applies the promised policy itself. */
export function makeCampaignPromise(state: SimulationState, partyId: string, countryId: string, subject: string, promisedKind: ProposalKind, promisedPayload?: FiscalProposalPayload): SimulationState {
  const entry = countryEntry(state, countryId);
  const party = entry.parties[partyId];
  if (!party) throw new Error('Unknown party for this Country.');
  const id = `promise.${Object.values(state.elections.countries).reduce((acc, c) => acc + Object.values(c.parties).reduce((a, p) => a + p.promises.length, 0), 0).toString().padStart(8, '0')}`;
  const promise: CampaignPromise = { id, partyId, countryId, madeOn: state.date, subject, promisedKind, promisedPayload, status: 'pending', credibilityBps: 0 };
  return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, parties: { ...entry.parties, [partyId]: { ...party, promises: [...party.promises, promise] } } } } } };
}

export const registerElectionTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'elections.monthly', cadence: 'monthly', priority: 455, run: runElectionCycle });

export const electionsVersion = () => ELECTIONS_VERSION;
