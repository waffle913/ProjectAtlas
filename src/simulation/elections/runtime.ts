import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import type { FiscalProposalPayload, ProposalKind, ProposalPayload } from '../governance/model';
import { politicalRegistry } from '../politics/registry';
import { assignPoliticalOffice, revokePoliticalOffice } from '../governance/runtime';
import { ELECTIONS_VERSION, proportionalSeats, type CampaignPromise, type ElectionChamberState, type ElectionCountryState, type GovernmentConfidence } from './model';

const isExecutive = (state: SimulationState, personId: string, countryId: string): boolean => {
  const person = state.governance.persons[personId];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && ['head_of_government', 'head_of_state'].includes(person.office.role));
};

const countryEntry = (state: SimulationState, countryId: string): ElectionCountryState => {
  const entry = state.elections.countries[countryId];
  if (!entry) throw new Error('No election state for this Country.');
  return entry;
};

/** Party vote shares from the current national support. The trailing "undecided" entry is dropped —
 *  it is not a party and never becomes a party seat (undecided != unknown != abstention). */
const partyVoteSharesFor = (state: SimulationState, countryId: string): Record<string, number> => {
  const politicsCountry = state.politics.countries[countryId];
  const partyIds = politicalRegistry.countries[countryId]?.partyIds ?? [];
  if (politicsCountry?.nationalSupportBps?.length) {
    const shares: Record<string, number> = {};
    partyIds.forEach((partyId, index) => { shares[partyId] = politicsCountry.nationalSupportBps[index] ?? 0; });
    if (Object.keys(shares).length) return shares;
  }
  const entry = countryEntry(state, countryId);
  const fallback: Record<string, number> = {};
  for (const chamber of Object.values(entry.chambers)) for (const [partyId, seats] of Object.entries(chamber.seatsByParty)) fallback[partyId] = (fallback[partyId] ?? 0) + seats;
  return fallback;
};

/** Two-round runoff with political proximity: the eliminated votes transfer to the top two in
 *  proportion to their political proximity, and abstention is preserved (unknown != abstention). */
const runoffShares = (votes: Record<string, number>): Record<string, number> => {
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  if (total <= 0) return votes;
  const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const leader = sorted[0], runnerUp = sorted[1];
  if (!leader || (leader[1] * 2) > total || !runnerUp) return { [leader[0]]: votes[leader[0]] };
  const eliminated = Object.entries(votes).filter(([id]) => id !== leader[0] && id !== runnerUp[0]);
  let leaderVotes = leader[1], runnerUpVotes = runnerUp[1];
  for (const [, v] of eliminated) {
    const ratio = leaderVotes + runnerUpVotes > 0 ? leaderVotes / (leaderVotes + runnerUpVotes) : 0.5;
    leaderVotes += Math.round(v * ratio); runnerUpVotes += Math.round(v * (1 - ratio));
  }
  return { [leader[0]]: leaderVotes, [runnerUp[0]]: runnerUpVotes };
};

/** Seat conversion dispatched by the constitution's parliamentary system and rounds. Returns null
 *  when the rules are unavailable, so the caller preserves the current parliament instead of zeroing it. */
function seatsForSystem(state: SimulationState, countryId: string, votes: Record<string, number>, seats: number, thresholdBps?: number): Record<string, number> | null {
  const system = state.constitution.countries[countryId]?.election.parliamentarySystem ?? 'unavailable';
  const rounds = state.constitution.countries[countryId]?.election.rounds ?? 'unavailable';
  if (system === 'unavailable' || rounds === 'unavailable') return null; // unavailable must never be reinterpreted as proportional or one-round.
  const effectiveVotes = rounds === 2 ? runoffShares(votes) : votes;
  if (system === 'majoritarian') {
    const sorted = Object.entries(effectiveVotes).sort((a, b) => b[1] - a[1]);
    const result: Record<string, number> = {};
    sorted.forEach(([partyId], index) => { result[partyId] = index === 0 ? seats : 0; });
    return result;
  }
  if (system === 'mixed') {
    const proportional = proportionalSeats(effectiveVotes, Math.ceil(seats / 2), thresholdBps);
    const sorted = Object.entries(effectiveVotes).sort((a, b) => b[1] - a[1]);
    const majoritarian = Math.floor(seats / 2);
    const result: Record<string, number> = { ...proportional };
    sorted.forEach(([partyId], index) => { result[partyId] = (result[partyId] ?? 0) + (index === 0 ? majoritarian : 0); });
    return result;
  }
  return proportionalSeats(effectiveVotes, seats, thresholdBps);
}

/** Minimal deterministic coalition from aggregate seats. A coalition that cannot reach a majority
 *  is reported as minority, never falsely as government. */
const formCoalition = (seats: Record<string, number>, totalSeats: number): { coalitionPartyIds: string[]; confidence: GovernmentConfidence } => {
  const sorted = Object.entries(seats).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return { coalitionPartyIds: [], confidence: 'unavailable' };
  const winner = sorted[0][0];
  if (sorted[0][1] * 2 > totalSeats) return { coalitionPartyIds: [winner], confidence: 'majority' };
  const coalition = [winner]; let total = sorted[0][1];
  for (const [partyId, count] of sorted.slice(1)) { if (total * 2 > totalSeats) break; coalition.push(partyId); total += count; }
  if (total * 2 <= totalSeats) return { coalitionPartyIds: coalition, confidence: 'minority' };
  return { coalitionPartyIds: coalition, confidence: 'coalition' };
};

/** Recompute a chamber's term deadline from the constitution's parliament term (recurring elections). */
const nextDeadlineFor = (state: SimulationState, countryId: string, date: string): string | undefined => {
  const termYears = state.constitution.countries[countryId]?.parliament.termYears;
  if (!termYears || termYears <= 0) return undefined;
  const year = Number(date.slice(0, 4)) + termYears;
  return `${year}-${date.slice(5, 10)}`;
};

/** Run a deterministic election for the given chambers (default: all), form the government, and transfer offices. */
export function runElection(state: SimulationState, countryId: string, chamberIds?: readonly string[]): SimulationState {
  const entry = countryEntry(state, countryId);
  const votes = partyVoteSharesFor(state, countryId);
  const thresholdBps = state.constitution.countries[countryId]?.election.thresholdBps;
  const chambers: Record<string, ElectionChamberState> = {};
  const aggregate: Record<string, number> = {};
  let totalSeats = 0;
  for (const [chamberId, chamber] of Object.entries(entry.chambers)) {
    if (chamberIds && !chamberIds.includes(chamberId)) { chambers[chamberId] = chamber; totalSeats += chamber.totalSeats; for (const [p, s] of Object.entries(chamber.seatsByParty)) aggregate[p] = (aggregate[p] ?? 0) + s; continue; }
    const independents = chamber.independentOtherSeats;
    const partySeats = Math.max(0, chamber.totalSeats - independents);
    const converted = seatsForSystem(state, countryId, votes, partySeats, thresholdBps);
    if (converted === null) {
      // Unknown electoral rules: the election is unavailable and the current chamber is preserved.
      chambers[chamberId] = chamber;
      totalSeats += chamber.totalSeats;
      for (const [p, s] of Object.entries(chamber.seatsByParty)) aggregate[p] = (aggregate[p] ?? 0) + s;
      continue;
    }
    const seatsByParty: Record<string, number> = {};
    for (const partyId of Object.keys(entry.parties).sort()) { seatsByParty[partyId] = converted[partyId] ?? 0; aggregate[partyId] = (aggregate[partyId] ?? 0) + seatsByParty[partyId]; }
    totalSeats += chamber.totalSeats;
    chambers[chamberId] = { ...chamber, seatsByParty, lastElectionDate: state.date, nextElectionDate: nextDeadlineFor(state, countryId, state.date) };
  }
  const government = formCoalition(aggregate, totalSeats);
  const parties: ElectionCountryState['parties'] = {};
  for (const [partyId, previous] of Object.entries(entry.parties)) {
    parties[partyId] = { ...previous, currentSeats: aggregate[partyId] ?? 0, governmentStatus: government.coalitionPartyIds.includes(partyId) ? 'government' : 'opposition', promises: previous.promises };
  }
  const next = {
    ...state,
    elections: {
      ...state.elections,
      countries: { ...state.elections.countries, [countryId]: { ...entry, chambers, government, parties } },
    },
  };
  return transferGovernmentOffices(next, countryId, government.coalitionPartyIds);
}

/** When the governing bloc changes, reassign the head-of-government office to the leading party's
 *  leader. appointmentMode decides who forms the government. */
function transferGovernmentOffices(state: SimulationState, countryId: string, coalitionPartyIds: string[]): SimulationState {
  if (!coalitionPartyIds.length) return state;
  const appointmentMode = state.constitution.countries[countryId]?.government.appointmentMode ?? 'unavailable';
  // Nothing is inferred when the appointment mode is unavailable; the head of state appoints separately.
  if (appointmentMode === 'appointed_by_head_of_state' || appointmentMode === 'unavailable') return state;
  const leadingPartyId = coalitionPartyIds[0];
  const leader = Object.values(state.governance.persons).find(p => p.status === 'active' && p.countryId === countryId && p.partyId === leadingPartyId && p.isPartyLeader);
  if (!leader) return state;
  const currentHead = Object.values(state.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
  if (currentHead?.id === leader.id) return state;
  let next = state;
  if (currentHead) next = revokePoliticalOffice(next, currentHead.id);
  return assignPoliticalOffice(next, leader.id, { role: 'head_of_government', countryId });
}

/** Dissolve parliament and call a fresh election. Requires the executive office and the constitutional right to dissolve. */
export function dissolveParliament(state: SimulationState, countryId: string, personId: string): SimulationState {
  if (!isExecutive(state, personId, countryId)) throw new Error('Only the executive head may dissolve parliament.');
  const dissolutionHolder = state.constitution.countries[countryId]?.parliament.dissolutionHolder ?? 'unavailable';
  if (dissolutionHolder !== 'executive') throw new Error('This Country does not grant the executive the power to dissolve parliament.');
  const entry = countryEntry(state, countryId);
  const chambers: Record<string, ElectionChamberState> = {};
  for (const [chamberId, chamber] of Object.entries(entry.chambers)) chambers[chamberId] = { ...chamber, nextElectionDate: state.date };
  return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, chambers } } } };
}

/** Monthly pass: run the election when any chamber's term/dissolution deadline is due. */
export function runElectionCycle(state: SimulationState): SimulationState {
  let next = state;
  for (const [countryId, entry] of Object.entries(state.elections.countries)) {
    const dueChamberIds = Object.entries(entry.chambers).filter(([, chamber]) => chamber.nextElectionDate && chamber.nextElectionDate <= state.date).map(([chamberId]) => chamberId);
    if (dueChamberIds.length) next = runElection(next, countryId, dueChamberIds);
  }
  return next;
}

/** Record a campaign promise; it never applies the promised policy itself. */
export function makeCampaignPromise(state: SimulationState, partyId: string, countryId: string, subject: string, promisedKind: ProposalKind, promisedPayload?: ProposalPayload): SimulationState {
  const entry = countryEntry(state, countryId);
  const party = entry.parties[partyId];
  if (!party) throw new Error('Unknown party for this Country.');
  const id = `promise.${Object.values(state.elections.countries).reduce((acc, c) => acc + Object.values(c.parties).reduce((a, p) => a + p.promises.length, 0), 0).toString().padStart(8, '0')}`;
  const promise: CampaignPromise = { id, partyId, countryId, madeOn: state.date, subject, promisedKind, promisedPayload, status: 'pending', credibilityBps: 0 };
  return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, parties: { ...entry.parties, [partyId]: { ...party, promises: [...party.promises, promise] } } } } } };
}

/** Record a promise outcome and derive the party's credibility from fulfilled/broken promises. */
export function recordPromiseOutcome(state: SimulationState, countryId: string, partyId: string, promiseId: string, status: 'fulfilled' | 'partially_fulfilled' | 'broken'): SimulationState {
  const entry = countryEntry(state, countryId);
  const party = entry.parties[partyId];
  if (!party) throw new Error('Unknown party for this Country.');
  const promises = party.promises.map(p => p.id === promiseId ? { ...p, status, result: status } : p);
  const resolved = promises.filter(p => p.status !== 'pending' && p.status !== 'unavailable');
  const fulfilled = resolved.filter(p => p.status === 'fulfilled' || p.status === 'partially_fulfilled').length;
  const credibilityBps = resolved.length ? Math.round((fulfilled / resolved.length) * 10_000) : undefined;
  return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, parties: { ...entry.parties, [partyId]: { ...party, promises, credibilityBps } } } } } };
}

export const registerElectionTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'elections.monthly', cadence: 'monthly', priority: 455, run: runElectionCycle });

export const electionsVersion = () => ELECTIONS_VERSION;
