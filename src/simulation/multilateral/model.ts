import { TRADE_CATEGORIES, type TradeCategory } from '../trade/model';

export const MULTILATERAL_VERSION = 'multilateral-0.20-v1' as const;

export type TreatyReality = 'synthetic' | 'modelled' | 'sourced' | 'unavailable';
export type TreatyStatus = 'proposed' | 'signed' | 'active' | 'suspended' | 'terminated' | 'expired';
export type TreatyEventKind = 'proposed' | 'signed' | 'ratified' | 'entered_into_force' | 'suspended' | 'withdrawn' | 'terminated' | 'expired' | 'violation' | 'obligation_triggered' | 'obligation_honored';
export type MembershipRole = 'member' | 'observer';
export type VotingRuleKind = 'majority' | 'supermajority' | 'unanimity';
export type DecisionStatus = 'open' | 'adopted' | 'rejected' | 'expired';
export type VoteChoice = 'yes' | 'no' | 'abstain' | 'unknown';

export interface TreatyEvent {
  date: string;
  kind: TreatyEventKind;
  countryId?: string;
  detail: string;
}

/** Typed causal contracts, never arbitrary strings. */
export type TreatyClause =
  | { kind: 'defensive_guarantee'; protectedCountryId: string; obligatedCountryId: string }
  | { kind: 'non_aggression'; partyAId: string; partyBId: string }
  | { kind: 'trade_commitment'; importerId: string; exporterId: string; categories: TradeCategory[]; tariffBps: number | null }
  | { kind: 'sanctions_commitment'; actorCountryId: string; targetCountryId: string; categories: TradeCategory[] }
  | { kind: 'recognition'; recognizedCountryId: string; recognizingCountryId: string };

export interface Treaty {
  id: string;
  title: string;
  parties: string[];
  proposalDate: string;
  signatories: Record<string, string>;
  ratifications: Record<string, string>;
  entryIntoForce: { kind: 'signature' | 'ratification'; requiredRatifications: number };
  withdrawal: { noticeDays: number };
  withdrawals: Record<string, string>;
  status: TreatyStatus;
  activeOn?: string;
  terminatedOn?: string;
  clauses: TreatyClause[];
  provenance: { status: TreatyReality; limitation: string };
  history: TreatyEvent[];
}

export interface OrganizationEvent {
  date: string;
  kind: 'established' | 'accession' | 'withdrawal';
  countryId?: string;
  detail: string;
}

export interface Organization {
  id: string;
  title: string;
  establishedOn: string;
  members: Record<string, { role: MembershipRole; joinedOn: string }>;
  votingRule: { kind: VotingRuleKind; thresholdBps?: number; quorumBps?: number };
  provenance: { status: TreatyReality; limitation: string };
  history: OrganizationEvent[];
}

export type OrganizationDecisionPayload =
  | { kind: 'condemnation'; targetCountryId: string; reason: string }
  | { kind: 'coordinated_sanctions'; targetCountryId: string; restriction: 'import_restriction' | 'export_restriction'; categories: TradeCategory[] }
  | { kind: 'membership'; applicantCountryId: string; role: MembershipRole }
  | { kind: 'trade_commitment'; importerId: string; exporterId: string; categories: TradeCategory[]; tariffBps: number | null };

export interface OrganizationDecision {
  id: string;
  organizationId: string;
  proposerCountryId: string;
  payload: OrganizationDecisionPayload;
  proposalDate: string;
  votingClosesOn: string;
  status: DecisionStatus;
  votes: Record<string, VoteChoice>;
  result?: 'adopted' | 'rejected';
  adoptedOn?: string;
  appliedEffectIds: string[];
}

export interface MultilateralState {
  version: typeof MULTILATERAL_VERSION;
  initializedOn?: string;
  treaties: Record<string, Treaty>;
  treatyOrder: string[];
  nextTreatySequence: number;
  organizations: Record<string, Organization>;
  organizationOrder: string[];
  nextOrganizationSequence: number;
  decisions: Record<string, OrganizationDecision>;
  decisionOrder: string[];
  nextDecisionSequence: number;
}

export const MULTILATERAL_MODEL = Object.freeze({
  version: MULTILATERAL_VERSION,
  schedulerPriority: 315,          // monthly obligation/decision evaluation, after trade settle (110) and before international (320)
  historyLimitPerTreaty: 64,
  historyLimitPerOrganization: 64,
  decisionRetentionGlobal: 512,
  treatyRetentionGlobal: 512,
  organizationRetentionGlobal: 128,
});

export const emptyMultilateral = (initializedOn?: string): MultilateralState => ({
  version: MULTILATERAL_VERSION,
  initializedOn,
  treaties: {},
  treatyOrder: [],
  nextTreatySequence: 0,
  organizations: {},
  organizationOrder: [],
  nextOrganizationSequence: 0,
  decisions: {},
  decisionOrder: [],
  nextDecisionSequence: 0,
});

export const multilateralTreatyId = (sequence: number) => `treaty.${sequence.toString().padStart(8, '0')}`;
export const multilateralOrganizationId = (sequence: number) => `organization.${sequence.toString().padStart(8, '0')}`;
export const multilateralDecisionId = (sequence: number) => `decision.${sequence.toString().padStart(8, '0')}`;
export const validTradeCategory = (value: unknown): value is TradeCategory => typeof value === 'string' && (TRADE_CATEGORIES as readonly string[]).includes(value);
