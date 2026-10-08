import type { SimulationState } from '../../types';
import type { ProposalKind, ProposalPayloadByKind } from '../governance/model';
import { politicalRegistry } from '../politics/registry';
import { allocate } from '../socioeconomy/model';

export const ELECTIONS_VERSION = 'elections-0.23-v1';

export type PromiseStatus = 'pending' | 'fulfilled' | 'partially_fulfilled' | 'broken' | 'unavailable';
export type GovernmentConfidence = 'majority' | 'minority' | 'coalition' | 'unavailable';

export interface CampaignPromiseBase {
  id: string;
  partyId: string;
  countryId: string;
  madeOn: string;
  subject: string;
  status: PromiseStatus;
  credibilityBps: number;
  result?: string;
}

/** A discriminated campaign promise: the promised kind determines the payload type, so a promise
 *  never carries a payload of another kind. */
export interface FiscalCampaignPromise extends CampaignPromiseBase {
  promisedKind: 'fiscal_reform';
  promisedPayload?: ProposalPayloadByKind['fiscal_reform'];
}
export interface AmendmentCampaignPromise extends CampaignPromiseBase {
  promisedKind: 'constitutional_amendment';
  promisedPayload?: ProposalPayloadByKind['constitutional_amendment'];
}
export type CampaignPromise = FiscalCampaignPromise | AmendmentCampaignPromise;

export interface PartyElectionState {
  partyId: string;
  currentSeats: number;
  governmentStatus: 'government' | 'opposition' | 'unavailable';
  promises: CampaignPromise[];
  /** Derived credibility from fulfilled/broken promises and government participation; unavailable while unknown. */
  credibilityBps?: number;
}

export interface ElectionChamberState {
  chamberId: string;
  seatsByParty: Record<string, number>;
  totalSeats: number;
  independentOtherSeats: number;
  lastElectionDate?: string;
  nextElectionDate?: string;
}

export interface ElectionCountryState {
  countryId: string;
  chambers: Record<string, ElectionChamberState>;
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
    const sourcedChambers = institution?.chambers.filter(c => c.seatAllocationStatus === 'sourced') ?? [];
    const chambers: Record<string, ElectionChamberState> = {};
    const allPartyIds = new Set<string>();
    for (const chamber of sourcedChambers) {
      const seatsByParty = { ...chamber.seatsByParty };
      for (const partyId of Object.keys(seatsByParty)) allPartyIds.add(partyId);
      chambers[chamber.id] = { chamberId: chamber.id, seatsByParty, totalSeats: chamber.totalSeats ?? Object.values(seatsByParty).reduce((a, b) => a + b, 0), independentOtherSeats: chamber.independentOtherSeats ?? 0, lastElectionDate: chamber.electionDate, nextElectionDate: chamber.termEnd };
    }
    const parties: Record<string, PartyElectionState> = {};
    for (const partyId of politicalRegistry.countries[countryId]?.partyIds ?? []) {
      const currentSeats = Object.values(chambers).reduce((sum, c) => sum + (c.seatsByParty[partyId] ?? 0), 0);
      parties[partyId] = { partyId, currentSeats, governmentStatus: institution?.governingPartyIds.length ? (institution.governingPartyIds.includes(partyId) ? 'government' : 'opposition') : 'unavailable', promises: [] };
    }
    countries[countryId] = {
      countryId, chambers,
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
