import type { Budget, Policy } from '../fiscal/model';
import type { PoliticalIssue } from '../politics/model';

export const GOVERNANCE_VERSION = 'governance-0.14-v1' as const;
export const AUTHORITY_CAPABILITIES = ['sponsor_legislation', 'sponsor_fiscal_reform', 'sponsor_budget_reform', 'vote_legislation'] as const;
export type AuthorityCapability = typeof AUTHORITY_CAPABILITIES[number];
export type PoliticalOfficeRole = 'head_of_government' | 'head_of_state' | 'legislator';

export interface PoliticalOfficeState {
  role: PoliticalOfficeRole;
  countryId: string;
  appointedOn: string;
  authorityProfile: {
    status: 'modelled_constitutional_abstraction';
    capabilities: AuthorityCapability[];
    limitation: string;
  };
}

export interface PoliticalPersonState {
  id: string;
  displayName: string;
  countryId: string;
  createdOn: string;
  partyId?: string;
  isPartyLeader: boolean;
  office?: PoliticalOfficeState;
  status: 'active' | 'inactive';
}

export interface FiscalProposalPayload { policy?: Policy; annualBudget?: Budget }
export interface ProposalImpactDriver { issue: PoliticalIssue; directionBps: number; source: string; explanation: string }
export interface ProposalImpact { issueDirectionsBps: Record<PoliticalIssue, number>; drivers: ProposalImpactDriver[]; method: 'fiscal_delta_v1'; limitation: string }
export interface PublicSupportEstimate { supportBps: number; opposeBps: number; neutralBps: number; coverage: 'complete' | 'partial' | 'unavailable'; representedPersons: number; drivers: ProposalImpactDriver[] }
export interface ChamberSupportEstimate { chamberId: string; yesSeats: number; noSeats: number; abstainSeats: number; unavailableSeats: number; totalSeats?: number; coverage: 'complete' | 'partial' | 'unavailable'; adopted?: boolean }
export interface ParliamentarySupportEstimate { yesSeats: number; noSeats: number; abstainSeats: number; unavailableSeats: number; totalSeats: number; chambers: ChamberSupportEstimate[]; coverage: 'complete' | 'partial' | 'unavailable'; confidenceBps: number; procedure: 'modelled_procedure_v1' }
export interface LegislativeVoteResult extends ParliamentarySupportEstimate { outcome: 'adopted' | 'rejected' | 'unavailable'; resolvedOn: string }
export type PoliticalProposalStatus = 'draft' | 'submitted' | 'enacted' | 'rejected' | 'withdrawn' | 'unavailable';
export interface PoliticalProposal {
  id: string;
  countryId: string;
  proposerPersonId: string;
  createdOn: string;
  kind: 'fiscal_reform';
  payload: FiscalProposalPayload;
  status: PoliticalProposalStatus;
  effectiveDate: string;
  submittedOn?: string;
  submittedPayloadFingerprint?: string;
  resolvedOn?: string;
  publicEstimate?: PublicSupportEstimate;
  parliamentaryEstimate?: ParliamentarySupportEstimate;
  voteResult?: LegislativeVoteResult;
  scheduledFiscalReformSequence?: number;
}

export interface GovernanceState {
  version: typeof GOVERNANCE_VERSION;
  initializedOn?: string;
  player: { controlledPersonId?: string };
  persons: Record<string, PoliticalPersonState>;
  proposals: Record<string, PoliticalProposal>;
  proposalOrder: string[];
  nextPersonSequence: number;
  nextProposalSequence: number;
}

export const emptyGovernance = (initializedOn?: string): GovernanceState => ({
  version: GOVERNANCE_VERSION,
  initializedOn,
  player: {},
  persons: {},
  proposals: {},
  proposalOrder: [],
  nextPersonSequence: 0,
  nextProposalSequence: 0,
});

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value;
/** Compact deterministic corruption/edit detector; not a security primitive. */
export function governanceFingerprint(value: unknown) {
  const text = JSON.stringify(canonical(value)); let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index++) { hash ^= BigInt(text.charCodeAt(index)); hash = BigInt.asUintN(64, hash * 0x100000001b3n); }
  return hash.toString(16).padStart(16, '0');
}
