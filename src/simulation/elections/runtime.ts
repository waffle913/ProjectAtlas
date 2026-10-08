import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import type { ProposalKind, ProposalPayloadByKind } from '../governance/model';
import { politicalRegistry } from '../politics/registry';
import { COHORT, IDEOLOGY_DIMENSIONS } from '../politics/model';
import { allocate, ratio } from '../socioeconomy/model';
import { assignPoliticalOffice, revokePoliticalOffice } from '../governance/runtime';
import { ELECTIONS_VERSION, proportionalSeats, type CampaignPromise, type ElectionChamberState, type ElectionCountryState, type GovernmentConfidence, type PartyElectionState } from './model';

const isExecutive = (state: SimulationState, personId: string, countryId: string): boolean => {
  const person = state.governance.persons[personId];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && ['head_of_government', 'head_of_state'].includes(person.office.role));
};

const countryEntry = (state: SimulationState, countryId: string): ElectionCountryState => {
  const entry = state.elections.countries[countryId];
  if (!entry) throw new Error('No election state for this Country.');
  return entry;
};

const partyIdsFor = (countryId: string): string[] => politicalRegistry.countries[countryId]?.partyIds ?? [];

/** Registered parties that may receive seats: a banned or dissolved party organization is excluded
 *  from the electoral contest (it never keeps receiving seats as if active). */
const activePartyIds = (state: SimulationState, countryId: string): string[] =>
  partyIdsFor(countryId).filter(partyId => {
    const status = state.politics.organizations[partyId]?.status;
    return status !== 'banned' && status !== 'dissolved';
  });

/** The constitution's election rules are usable only when both the parliamentary system and the
 *  number of rounds are known; unavailable must never be reinterpreted as proportional/one-round. */
const electionAvailable = (state: SimulationState, countryId: string): boolean => {
  const election = state.constitution.countries[countryId]?.election;
  return Boolean(election && election.parliamentarySystem !== 'unavailable' && election.rounds !== 'unavailable');
};

/** Modelled voter response to a party's promise credibility: 0 bps halves the party's vote weight,
 *  10000 bps leaves it unchanged. Credibility is derived from fulfilled/broken promises, never invented. */
const credibilityFactorBps = (party: PartyElectionState | undefined): number =>
  party?.credibilityBps === undefined ? 10_000 : 5_000 + Math.floor(party.credibilityBps / 2);

/** A party's substantive pending promises (those carrying a real payload) participate in the vote
 *  choice: each adds a small, bounded, modelled weight lift. This is a proxy for the promised material
 *  content, layered on top of credibility. */
const promiseContentFactorBps = (party: PartyElectionState | undefined): number => {
  const substantive = party?.promises.filter(p => p.status === 'pending' && p.promisedPayload && Object.keys(p.promisedPayload).length).length ?? 0;
  return Math.min(10_500, 10_000 + substantive * 250);
};

const adjustForCredibility = (votes: Record<string, number>, entry: ElectionCountryState): Record<string, number> => {
  const adjusted: Record<string, number> = {};
  for (const [partyId, value] of Object.entries(votes)) {
    const party = entry.parties[partyId];
    const combined = ratio(credibilityFactorBps(party), promiseContentFactorBps(party), 10_000);
    adjusted[partyId] = ratio(value, combined, 10_000);
  }
  return adjusted;
};

/** National vote shares from current national support (undecided is dropped — it is not a party),
 *  adjusted by the party's derived promise credibility. */
const nationalShares = (state: SimulationState, countryId: string): Record<string, number> => {
  const politicsCountry = state.politics.countries[countryId];
  const partyIds = activePartyIds(state, countryId);
  const entry = countryEntry(state, countryId);
  if (politicsCountry?.nationalSupportBps?.length) {
    const shares: Record<string, number> = {};
    partyIds.forEach((partyId, index) => { shares[partyId] = politicsCountry.nationalSupportBps[index] ?? 0; });
    if (Object.keys(shares).length) return adjustForCredibility(shares, entry);
  }
  const fallback: Record<string, number> = {};
  for (const chamber of Object.values(entry.chambers)) for (const [partyId, seats] of Object.entries(chamber.seatsByParty)) fallback[partyId] = (fallback[partyId] ?? 0) + seats;
  return adjustForCredibility(fallback, entry);
};

/** Average absolute ideology distance between two parties across the validated ideology dimensions. */
const ideologyDistance = (a: string, b: string): number => {
  const pa = politicalRegistry.parties[a]?.ideology, pb = politicalRegistry.parties[b]?.ideology;
  if (!pa || !pb) return 10_000;
  const dims = IDEOLOGY_DIMENSIONS;
  let sum = 0;
  for (const dim of dims) sum += Math.abs((pa[dim] ?? 5_000) - (pb[dim] ?? 5_000));
  return Math.round(sum / dims.length);
};

/** Regional, cohort-level votes weighted by engagement. Turnout and abstention are preserved:
 *  undecided and unengaged voters never become party votes, and the transfer pool of a runoff is
 *  reduced by ideological distance (far voters abstain rather than transfer). */
const regionalVotes = (state: SimulationState, countryId: string): { votes: Record<string, Record<string, number>>; turnout: Record<string, number> } => {
  const country = state.politics.countries[countryId];
  const partyIds = activePartyIds(state, countryId);
  const entry = countryEntry(state, countryId);
  const votes: Record<string, Record<string, number>> = {};
  const turnout: Record<string, number> = {};
  for (const regionId of [...(country?.regionIds ?? [])].sort()) {
    const socio = state.socioeconomy.regions[regionId];
    const opinion = state.politics.regionalOpinion[regionId];
    if (!socio || !opinion) continue;
    const regionPartyVotes: Record<string, number> = {};
    let regionTurnout = 0;
    for (const cohort of socio.cohorts) {
      if (cohort.persons <= 0) continue;
      const cohortOpinion = opinion.cohorts[`${cohort.income}:${cohort.orientation}`];
      if (!cohortOpinion) continue;
      const support = cohortOpinion[COHORT.support];
      const engagement = cohortOpinion[COHORT.engagement];
      const turnedOut = ratio(cohort.persons, engagement, 10_000);
      regionTurnout += turnedOut;
      partyIds.forEach((partyId, index) => { regionPartyVotes[partyId] = (regionPartyVotes[partyId] ?? 0) + ratio(turnedOut, support[index], 10_000); });
    }
    votes[regionId] = adjustForCredibility(regionPartyVotes, entry);
    turnout[regionId] = regionTurnout;
  }
  return { votes, turnout };
};

/** Two-round runoff preserving abstention: eliminated voters transfer to the top two in proportion
 *  to ideological proximity, and a distance-based share abstains instead of transferring. */
function runoff(votes: Record<string, number>, partyIds: string[]): Record<string, number> {
  const sorted = partyIds.map(id => [id, votes[id] ?? 0] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const leader = sorted[0], runnerUp = sorted[1];
  if (!leader) return votes;
  const valid = sorted.reduce((sum, [, v]) => sum + v, 0);
  if (!runnerUp || leader[1] * 2 > valid) return { [leader[0]]: leader[1], ...(runnerUp ? { [runnerUp[0]]: runnerUp[1] } : {}) };
  let leaderVotes = leader[1], runnerUpVotes = runnerUp[1];
  for (const [id, value] of sorted.slice(2)) {
    if (value <= 0) continue;
    const dLeader = ideologyDistance(id, leader[0]);
    const dRunner = ideologyDistance(id, runnerUp[0]);
    const abstainBps = Math.min(dLeader, dRunner);
    const abstain = ratio(value, abstainBps, 10_000);
    const pool = value - abstain;
    const closenessLeader = Math.max(0, 10_000 - dLeader);
    const closenessRunner = Math.max(0, 10_000 - dRunner);
    const closenessTotal = closenessLeader + closenessRunner;
    if (closenessTotal <= 0) continue;
    const toLeader = ratio(pool, closenessLeader, closenessTotal);
    leaderVotes += toLeader;
    runnerUpVotes += pool - toLeader;
  }
  return { [leader[0]]: leaderVotes, [runnerUp[0]]: runnerUpVotes };
}

/** Distribute chamber seats across regions by population (largest remainder), each inhabited region
 *  receiving at least one seat when there are enough seats. */
function distributeSeatsByPopulation(populations: number[], totalSeats: number): number[] {
  const positive = populations.map((p, i) => ({ p, i })).filter(item => item.p > 0);
  if (!positive.length) return populations.map(() => 0);
  const result = populations.map(() => 0);
  if (positive.length <= totalSeats) {
    for (const { i } of positive) result[i] = 1;
    const remaining = totalSeats - positive.length;
    if (remaining > 0) {
      const extra = allocate(remaining, positive.map(item => item.p));
      positive.forEach((item, index) => { result[item.i] += extra[index]; });
    }
    return result;
  }
  return allocate(totalSeats, populations);
}

/** Simulated regional majoritarian allocation: seats are distributed across regions by population,
 *  then each region is partitioned into stable single-member districts (by deterministic cohort
 *  order), each electing one winner (after a two-round runoff when applicable). No region is treated
 *  as a winner-take-all block. */
function regionalMajoritarianSeats(state: SimulationState, countryId: string, partySeats: number, rounds: 1 | 2): Record<string, number> {
  const country = state.politics.countries[countryId];
  const regionIds = [...(country?.regionIds ?? [])].sort();
  const partyIds = activePartyIds(state, countryId);
  if (!regionIds.length || partySeats <= 0) return {};
  const populations = regionIds.map(id => state.socioeconomy.regions[id]?.population ?? 0);
  const regionSeats = distributeSeatsByPopulation(populations, partySeats);
  const result: Record<string, number> = {};
  regionIds.forEach((regionId, index) => {
    const seats = regionSeats[index];
    if (seats <= 0) return;
    for (const winner of stableDistrictWinners(state, countryId, regionId, seats, rounds, partyIds)) result[winner] = (result[winner] ?? 0) + 1;
  });
  return result;
}

/** Partition a region into `seats` stable single-member districts (contiguous cohort slices) and
 *  return the plurality winner of each district. Stable: the partition depends only on region cohort
 *  order, never on the current vote. When a region has fewer cohorts than seats, each cohort is split
 *  into as many stable districts as its population share warrants (largest remainder), so every seat
 *  is awarded exactly once — seats are never silently dropped. */
function stableDistrictWinners(state: SimulationState, countryId: string, regionId: string, seats: number, rounds: 1 | 2, partyIds: string[]): string[] {
  const socio = state.socioeconomy.regions[regionId];
  const opinion = state.politics.regionalOpinion[regionId];
  if (!socio || !opinion) return [];
  const entry = countryEntry(state, countryId);
  const cohorts = socio.cohorts.filter(c => c.persons > 0).sort((a, b) => `${a.income}:${a.orientation}`.localeCompare(`${b.income}:${b.orientation}`));
  if (!cohorts.length) return [];
  const districtVote = (districtCohorts: typeof cohorts): Record<string, number> => {
    const votes: Record<string, number> = {};
    for (const cohort of districtCohorts) {
      const cohortOpinion = opinion.cohorts[`${cohort.income}:${cohort.orientation}`];
      if (!cohortOpinion) continue;
      const turnedOut = ratio(cohort.persons, cohortOpinion[COHORT.engagement], 10_000);
      partyIds.forEach((partyId, i) => { votes[partyId] = (votes[partyId] ?? 0) + ratio(turnedOut, cohortOpinion[COHORT.support][i], 10_000); });
    }
    return votes;
  };
  const winnerOf = (votes: Record<string, number>): string | undefined => {
    const adjusted = adjustForCredibility(votes, entry);
    const finalVotes = rounds === 2 ? runoff(adjusted, partyIds) : adjusted;
    return Object.entries(finalVotes).sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  if (cohorts.length >= seats) {
    const districts: Array<typeof cohorts> = Array.from({ length: seats }, () => []);
    cohorts.forEach((cohort, i) => { districts[Math.min(Math.floor(i * seats / cohorts.length), seats - 1)].push(cohort); });
    const winners: string[] = [];
    for (const district of districts) {
      const winner = winnerOf(districtVote(district));
      if (winner) winners.push(winner);
    }
    return winners;
  }
  // More seats than cohorts: each cohort fills several stable districts; a district inside one
  // homogeneous cohort votes identically, so it elects the cohort's plurality winner each time.
  const allocated = allocate(seats, cohorts.map(c => c.persons));
  const winners: string[] = [];
  cohorts.forEach((cohort, index) => {
    const winner = winnerOf(districtVote([cohort]));
    for (let k = 0; k < allocated[index] && winner; k++) winners.push(winner);
  });
  return winners;
}

/** Seat conversion dispatched by the constitution's parliamentary system and rounds. Returns null
 *  when the rules are unavailable, so the caller preserves the current parliament instead of zeroing it. */
function seatsForSystem(state: SimulationState, countryId: string, seats: number, thresholdBps?: number): Record<string, number> | null {
  const election = state.constitution.countries[countryId]?.election;
  const system = election?.parliamentarySystem ?? 'unavailable';
  const rounds = election?.rounds ?? 'unavailable';
  if (system === 'unavailable' || rounds === 'unavailable') return null;
  const partyIds = activePartyIds(state, countryId);
  const national = nationalShares(state, countryId);
  const effective = rounds === 2 ? runoff(national, partyIds) : national;
  if (system === 'majoritarian') {
    return regionalMajoritarianSeats(state, countryId, seats, rounds as 1 | 2);
  }
  if (system === 'mixed') {
    const proportional = proportionalSeats(effective, Math.ceil(seats / 2), thresholdBps);
    const majoritarian = regionalMajoritarianSeats(state, countryId, Math.floor(seats / 2), rounds as 1 | 2);
    const result: Record<string, number> = { ...proportional };
    for (const [partyId, count] of Object.entries(majoritarian)) result[partyId] = (result[partyId] ?? 0) + count;
    return result;
  }
  return proportionalSeats(effective, seats, thresholdBps);
}

/** Minimal deterministic coalition from aggregate seats, preferring politically compatible partners
 *  (smaller ideological distance to the leading party) before seat size. A coalition that cannot
 *  reach a majority is reported as minority, never falsely as government. Exported for the
 *  coalition-compatibility tests. */
export const formCoalition = (seats: Record<string, number>, totalSeats: number, proximity: (a: string, b: string) => number): { coalitionPartyIds: string[]; confidence: GovernmentConfidence } => {
  const sorted = Object.entries(seats).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return { coalitionPartyIds: [], confidence: 'unavailable' };
  const winner = sorted[0][0];
  if (sorted[0][1] * 2 > totalSeats) return { coalitionPartyIds: [winner], confidence: 'majority' };
  const partners = sorted.slice(1).sort((a, b) => proximity(winner, a[0]) - proximity(winner, b[0]) || b[1] - a[1]);
  const coalition = [winner]; let total = sorted[0][1];
  for (const [partyId, count] of partners) { if (total * 2 > totalSeats) break; coalition.push(partyId); total += count; }
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

/** Run a deterministic election for the given chambers (default: all). When the election rules are
 *  unavailable, or no targeted chamber could be converted, the state is returned unchanged: the
 *  government, party government status and offices are never altered by a pseudo-election. */
export function runElection(state: SimulationState, countryId: string, chamberIds?: readonly string[]): SimulationState {
  const entry = countryEntry(state, countryId);
  if (!electionAvailable(state, countryId)) return state;
  const thresholdBps = state.constitution.countries[countryId]?.election.thresholdBps;
  const rounds = state.constitution.countries[countryId]?.election.rounds ?? 'unavailable';
  const chambers: Record<string, ElectionChamberState> = {};
  const aggregate: Record<string, number> = {};
  let totalSeats = 0;
  let convertedAny = false;
  for (const [chamberId, chamber] of Object.entries(entry.chambers)) {
    if (chamberIds && !chamberIds.includes(chamberId)) {
      chambers[chamberId] = chamber;
      totalSeats += chamber.totalSeats;
      for (const [p, s] of Object.entries(chamber.seatsByParty)) aggregate[p] = (aggregate[p] ?? 0) + s;
      continue;
    }
    const independents = chamber.independentOtherSeats;
    const partySeats = Math.max(0, chamber.totalSeats - independents);
    const converted = seatsForSystem(state, countryId, partySeats, thresholdBps);
    if (converted === null) {
      chambers[chamberId] = chamber;
      totalSeats += chamber.totalSeats;
      for (const [p, s] of Object.entries(chamber.seatsByParty)) aggregate[p] = (aggregate[p] ?? 0) + s;
      continue;
    }
    convertedAny = true;
    const seatsByParty: Record<string, number> = {};
    for (const partyId of Object.keys(entry.parties).sort()) { seatsByParty[partyId] = converted[partyId] ?? 0; aggregate[partyId] = (aggregate[partyId] ?? 0) + seatsByParty[partyId]; }
    totalSeats += chamber.totalSeats;
    chambers[chamberId] = { ...chamber, seatsByParty, lastElectionDate: state.date, nextElectionDate: nextDeadlineFor(state, countryId, state.date) };
  }
  if (!convertedAny) return state;
  // Government formation follows the constitutional appointment mode. Only a parliament-chosen
  // government derives from the electoral bloc; a direct election is a distinct procedure and the
  // head-of-state appointment is a separate act — neither is inferred from the parliamentary seats.
  const appointmentMode = state.constitution.countries[countryId]?.government.appointmentMode ?? 'unavailable';
  const government = appointmentMode === 'chosen_by_parliament' ? formCoalition(aggregate, totalSeats, ideologyDistance) : entry.government;
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
  return appointmentMode === 'chosen_by_parliament' ? transferGovernmentOffices(next, countryId, government.coalitionPartyIds) : next;
}

/** When a parliament-chosen governing bloc changes, reassign the head-of-government office to the
 *  leading party's leader. A direct or head-of-state appointment is a separate procedure and is
 *  never inferred from the electoral bloc. */
function transferGovernmentOffices(state: SimulationState, countryId: string, coalitionPartyIds: string[]): SimulationState {
  if (!coalitionPartyIds.length) return state;
  const appointmentMode = state.constitution.countries[countryId]?.government.appointmentMode ?? 'unavailable';
  if (appointmentMode !== 'chosen_by_parliament') return state;
  const leadingPartyId = coalitionPartyIds[0];
  const leader = Object.values(state.governance.persons).find(p => p.status === 'active' && p.countryId === countryId && p.partyId === leadingPartyId && p.isPartyLeader);
  if (!leader) return state;
  const currentHead = Object.values(state.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
  if (currentHead?.id === leader.id) return state;
  let next = state;
  if (currentHead) next = revokePoliticalOffice(next, currentHead.id);
  return assignPoliticalOffice(next, leader.id, { role: 'head_of_government', countryId });
}

/** Dissolve parliament and call a fresh election. Requires the executive office, the constitutional
 *  right to dissolve, and usable election rules. */
export function dissolveParliament(state: SimulationState, countryId: string, personId: string): SimulationState {
  if (!isExecutive(state, personId, countryId)) throw new Error('Only the executive head may dissolve parliament.');
  const dissolutionHolder = state.constitution.countries[countryId]?.parliament.dissolutionHolder ?? 'unavailable';
  if (dissolutionHolder !== 'executive') throw new Error('This Country does not grant the executive the power to dissolve parliament.');
  if (!electionAvailable(state, countryId)) throw new Error('This Country has no available election rules to schedule a fresh election.');
  const entry = countryEntry(state, countryId);
  const chambers: Record<string, ElectionChamberState> = {};
  for (const [chamberId, chamber] of Object.entries(entry.chambers)) chambers[chamberId] = { ...chamber, nextElectionDate: state.date };
  return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, chambers } } } };
}

/** Monthly pass: run the election when any chamber's term/dissolution deadline is due. Countries
 *  whose election rules are unavailable are skipped — no monthly pseudo-election is produced. */
export function runElectionCycle(state: SimulationState): SimulationState {
  let next = state;
  for (const [countryId, entry] of Object.entries(state.elections.countries)) {
    if (!electionAvailable(state, countryId)) continue;
    const dueChamberIds = Object.entries(entry.chambers).filter(([, chamber]) => chamber.nextElectionDate && chamber.nextElectionDate <= state.date).map(([chamberId]) => chamberId);
    if (dueChamberIds.length) next = runElection(next, countryId, dueChamberIds);
  }
  return next;
}

/** Record a typed campaign promise; the promised payload is bound to its kind and the policy is
 *  never applied by the promise itself. */
export function makeCampaignPromise<K extends ProposalKind>(state: SimulationState, partyId: string, countryId: string, subject: string, promisedKind: K, promisedPayload?: ProposalPayloadByKind[K]): SimulationState {
  const entry = countryEntry(state, countryId);
  const party = entry.parties[partyId];
  if (!party) throw new Error('Unknown party for this Country.');
  const id = `promise.${Object.values(state.elections.countries).reduce((acc, c) => acc + Object.values(c.parties).reduce((a, p) => a + p.promises.length, 0), 0).toString().padStart(8, '0')}`;
  const base = { id, partyId, countryId, madeOn: state.date, subject, status: 'pending' as const, credibilityBps: 0 };
  const promise: CampaignPromise = promisedKind === 'fiscal_reform'
    ? { ...base, promisedKind, promisedPayload: promisedPayload as ProposalPayloadByKind['fiscal_reform'] }
    : { ...base, promisedKind, promisedPayload: promisedPayload as ProposalPayloadByKind['constitutional_amendment'] };
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

/** A direct executive election is distinct from a parliamentary majority: the winner is the leading
 *  party in the (credibility- and promise-adjusted) popular support, and that party's leader becomes
 *  head of government. It exists only when appointmentMode is elected_directly. The government's
 *  parliamentary confidence is derived from the winner's actual seats — never fabricated as a
 *  majority — and the election is recorded with a dated trace. */
export function runDirectElection(state: SimulationState, countryId: string, actorPersonId: string): SimulationState {
  const appointmentMode = state.constitution.countries[countryId]?.government.appointmentMode;
  if (appointmentMode !== 'elected_directly') throw new Error('Only a directly-elected executive may be chosen by direct election.');
  if (!isExecutive(state, actorPersonId, countryId)) throw new Error('Only the executive head may run a direct election.');
  const entry = countryEntry(state, countryId);
  const shares = nationalShares(state, countryId);
  const winner = Object.entries(shares).sort((a, b) => b[1] - a[1])[0];
  if (!winner) return state;
  const winnerSeats = Object.values(entry.chambers).reduce((sum, chamber) => sum + (chamber.seatsByParty[winner[0]] ?? 0), 0);
  const totalSeats = Object.values(entry.chambers).reduce((sum, chamber) => sum + chamber.totalSeats, 0);
  const confidence: GovernmentConfidence = totalSeats > 0 && winnerSeats * 2 > totalSeats ? 'majority' : 'minority';
  const government = { coalitionPartyIds: [winner[0]], confidence };
  const parties: ElectionCountryState['parties'] = {};
  for (const [partyId, previous] of Object.entries(entry.parties)) parties[partyId] = { ...previous, governmentStatus: partyId === winner[0] ? 'government' : 'opposition', promises: previous.promises };
  let next: SimulationState = { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, government, parties, directElection: { on: state.date, winnerPartyId: winner[0], actorPersonId } } } } };
  const leader = Object.values(next.governance.persons).find(p => p.status === 'active' && p.countryId === countryId && p.partyId === winner[0] && p.isPartyLeader);
  if (leader) {
    const currentHead = Object.values(next.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
    if (currentHead && currentHead.id !== leader.id) next = revokePoliticalOffice(next, currentHead.id);
    if (currentHead?.id !== leader.id) next = assignPoliticalOffice(next, leader.id, { role: 'head_of_government', countryId });
  }
  return next;
}

export const registerElectionTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'elections.monthly', cadence: 'monthly', priority: 455, run: runElectionCycle });

export const electionsVersion = () => ELECTIONS_VERSION;
