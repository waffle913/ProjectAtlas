import type { SimulationState } from '../../types';
import type { ProposalKind, ProposalPayloadByKind } from '../governance/model';
import { politicalRegistry } from '../politics/registry';
import { allocate } from '../socioeconomy/model';
import type { HeadOfStateSelection } from '../constitution/model';
import type { NationalInstitutions } from '../politics/model';

export const ELECTIONS_VERSION = 'elections-0.23-v1';

export type PromiseStatus = 'pending' | 'fulfilled' | 'partially_fulfilled' | 'broken' | 'unavailable';
export type GovernmentConfidence = 'majority' | 'minority' | 'coalition' | 'unavailable';

export interface CampaignPromiseBase {
  id: string;
  partyId: string;
  countryId: string;
  madeOn: string;
  /** The authorized actor (the party leader) who bound the party to the promise. */
  madeByPersonId?: string;
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
  /** Seats a real election could not allocate (missing regional data, no eligible candidate,
   *  threshold exclusions). Explicitly unknown — never silently dropped or re-invented. The
   *  initial 2026 independents are resolved by the first real election and never kept forever. */
  unallocatedSeats: number;
  lastElectionDate?: string;
  nextElectionDate?: string;
  /** Real participation effect of the suffrage rules in force on the last election day. */
  lastElectionTurnout?: { participationBps: number; eligibilityCoverage: 'complete' | 'partial' | 'unavailable'; limitation: string };
}

/** A dated head-of-state selection record: the constitutional selection mode, the winner, the
 *  mandate (term/maxTerms when the constitution provides them) and the real participation effect
 *  of the suffrage rules in force. */
export interface HeadOfStateElectionRecord {
  on: string;
  method: HeadOfStateSelection;
  winnerPersonId: string;
  winnerPartyId: string;
  termStart: string;
  termEnd?: string;
  participationBps?: number;
  eligibilityCoverage: 'complete' | 'partial' | 'unavailable';
  limitation: string;
}

export interface ElectionCountryState {
  countryId: string;
  chambers: Record<string, ElectionChamberState>;
  government: { coalitionPartyIds: string[]; confidence: GovernmentConfidence };
  parties: Record<string, PartyElectionState>;
  /** Dated trace of a direct executive election (appointmentMode elected_directly); a parliamentary
   *  election never writes this. */
  directElection?: { on: string; winnerPartyId: string; actorPersonId: string };
  /** Recurring direct executive election deadline (appointmentMode elected_directly). */
  nextDirectElectionDate?: string;
  /** Dated head-of-state selection records (popular_direct / popular_indirect / parliamentary). */
  headOfStateElections: HeadOfStateElectionRecord[];
  /** Recurring head-of-state selection deadline, derived from the mandate (termYears). */
  nextHeadOfStateElectionDate?: string;
}

export interface ElectionsState {
  version: typeof ELECTIONS_VERSION;
  initializedOn?: string;
  countries: Record<string, ElectionCountryState>;
}

export const emptyElections = (): ElectionsState => ({ version: ELECTIONS_VERSION, countries: {} });

/** The initial governing arrangement comes from the real confidence evidence, never an automatic
 *  'majority' from a governingPartyIds list: the sourced confidenceArrangement decides. */
const governmentConfidenceFrom = (institution: NationalInstitutions | undefined): GovernmentConfidence => {
  if (!institution || institution.governingPartyIds.length === 0) return 'unavailable';
  if (institution.confidenceArrangement === 'majority') return 'majority';
  if (institution.confidenceArrangement === 'minority' || institution.confidenceArrangement === 'confidence_and_supply') return 'minority';
  return 'unavailable';
};

/** Derive the dynamic seat allocation from the 0.13 registry's sourced chamber allocations and
 *  governing-bloc matches. This is a baseline snapshot, never a rewrite of the static registry. */
export function initializeElections(state: SimulationState, countryIds?: readonly string[]): SimulationState {
  const ids = [...(countryIds ?? Object.keys(state.politics.countries))].sort();
  const countries: Record<string, ElectionCountryState> = {};
  for (const countryId of ids) {
    const country = politicalRegistry.countries[countryId];
    const institution = country ? politicalRegistry.institutions[country.institutionId] : undefined;
    const sourcedChambers = institution?.chambers ?? [];
    const chambers: Record<string, ElectionChamberState> = {};
    const allPartyIds = new Set<string>();
    for (const chamber of sourcedChambers) {
      // Every chamber keeps its identity in the dynamic state — including chambers whose 2026
      // allocation is unavailable — so a future election can produce a real dynamic allocation.
      const seatsByParty = chamber.seatAllocationStatus === 'sourced' ? { ...chamber.seatsByParty } : {};
      for (const partyId of Object.keys(seatsByParty)) allPartyIds.add(partyId);
      chambers[chamber.id] = {
        chamberId: chamber.id, seatsByParty, totalSeats: chamber.totalSeats ?? 0,
        independentOtherSeats: chamber.seatAllocationStatus === 'sourced' ? (chamber.independentOtherSeats ?? 0) : 0,
        unallocatedSeats: 0,
        lastElectionDate: chamber.electionDate, nextElectionDate: chamber.termEnd,
      };
    }
    const parties: Record<string, PartyElectionState> = {};
    for (const partyId of politicalRegistry.countries[countryId]?.partyIds ?? []) {
      const currentSeats = Object.values(chambers).reduce((sum, c) => sum + (c.seatsByParty[partyId] ?? 0), 0);
      parties[partyId] = { partyId, currentSeats, governmentStatus: institution?.governingPartyIds.length ? (institution.governingPartyIds.includes(partyId) ? 'government' : 'opposition') : 'unavailable', promises: [] };
    }
    countries[countryId] = {
      countryId, chambers,
      government: { coalitionPartyIds: institution?.governingPartyIds ?? [], confidence: governmentConfidenceFrom(institution) },
      parties,
      headOfStateElections: [],
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
