import type { SimulationState } from '../../types';
import type { ProposalKind, FiscalProposalPayload } from '../governance/model';
import { politicalRegistry } from '../politics/registry';
import { allocate } from '../socioeconomy/model';

export const ELECTIONS_VERSION = 'elections-0.23-v1';

export type PromiseStatus = 'pending' | 'fulfilled' | 'partially_fulfilled' | 'broken' | 'unavailable';
export type GovernmentConfidence = 'majority' | 'minority' | 'coalition' | 'unavailable';

export interface CampaignPromise {
  id: string;
  partyId: string;
  countryId: string;
  madeOn: string;
  subject: string;
  /** The promised policy references a real proposal kind and payload — it never applies the policy itself. */
  promisedKind: ProposalKind;
  promisedPayload?: FiscalProposalPayload;
  status: PromiseStatus;
  credibilityBps: number;
  result?: string;
}

export interface PartyElectionState {
  partyId: string;
  currentSeats: number;
  governmentStatus: 'government' | 'opposition' | 'unavailable';
  promises: CampaignPromise[];
  /** Derived credibility from fulfilled/broken promises and government participation; unavailable while unknown. */
  credibilityBps?: number;
}

export interface ElectionCountryState {
  countryId: string;
  seatsByParty: Record<string, number>;
  totalSeats: number;
  lastElectionDate?: string;
  nextElectionDate?: string;
  government: { coalitionPartyIds: string[]; confidence: GovernmentConfidence };
  parties: Record<string, PartyElectionState>;
}

export interface ElectionsState {
  version: typeof ELECTIONS_VERSION;
  initializedOn?: string;
  countries: Record<string, ElectionCountryState>;
}

export const emptyElections = (): ElectionsState => ({ version: ELECTIONS_VERSION, countries: {} });

/** Derive the dynamic seat allocation from the 0.13 registry's sourced chamber allocations and
 *  governing-bloc matches. This is a baseline snapshot, never a rewrite of the static registry. */
export function initializeElections(state: SimulationState, countryIds?: readonly string[]): SimulationState {
  const ids = [...(countryIds ?? Object.keys(state.politics.countries))].sort();
  const countries: Record<string, ElectionCountryState> = {};
  for (const countryId of ids) {
    const country = politicalRegistry.countries[countryId];
    const institution = country ? politicalRegistry.institutions[country.institutionId] : undefined;
    const chamber = institution?.chambers.find(c => c.seatAllocationStatus === 'sourced');
    const seatsByParty = chamber?.seatsByParty ?? {};
    const partyIds = Object.keys(seatsByParty).sort();
    const totalSeats = chamber?.totalSeats ?? Object.values(seatsByParty).reduce((a, b) => a + b, 0);
    const parties: Record<string, PartyElectionState> = {};
    for (const partyId of partyIds) parties[partyId] = {
      partyId, currentSeats: seatsByParty[partyId],
      governmentStatus: institution?.governingPartyIds.length ? (institution.governingPartyIds.includes(partyId) ? 'government' : 'opposition') : 'unavailable',
      promises: [],
    };
    countries[countryId] = {
      countryId, seatsByParty: { ...seatsByParty }, totalSeats, lastElectionDate: chamber?.electionDate, nextElectionDate: chamber?.termEnd,
      government: { coalitionPartyIds: institution?.governingPartyIds ?? [], confidence: institution?.governingPartyIds.length ? 'majority' : 'unavailable' },
      parties,
    };
  }
  return { ...state, elections: { version: ELECTIONS_VERSION, initializedOn: state.date, countries } };
}

/** Deterministic largest-remainder seat conversion (Hare quota). Excludes parties below the threshold. */
export function proportionalSeats(votes: Record<string, number>, totalSeats: number, thresholdBps = 0): Record<string, number> {
  const total = Object.values(votes).reduce((a, b) => a + b, 0);
  if (total <= 0 || totalSeats <= 0) return {};
  const eligible = Object.entries(votes)
    .filter(([, v]) => v * 10000 >= thresholdBps * total)
    .map(([partyId, v]) => ({ partyId, v: Math.max(0, Math.round(v)) }));
  const allocated = allocate(totalSeats, eligible.map(e => e.v));
  const result: Record<string, number> = {};
  eligible.forEach((e, i) => { result[e.partyId] = allocated[i]; });
  return result;
}
