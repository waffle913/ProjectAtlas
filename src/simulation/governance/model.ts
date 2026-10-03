import type { Budget, Policy } from '../fiscal/model';
import type { PoliticalIssue } from '../politics/model';
import { deterministicFingerprint } from '../fingerprint';

export const GOVERNANCE_VERSION = 'governance-0.14-v1' as const;
export const AUTHORITY_CAPABILITIES = ['sponsor_legislation', 'sponsor_fiscal_reform', 'sponsor_budget_reform', 'vote_legislation', 'access_government_information'] as const;
export type AuthorityCapability = typeof AUTHORITY_CAPABILITIES[number];
export type PoliticalOfficeRole = 'head_of_government' | 'head_of_state' | 'legislator';
export const INITIAL_LEADER_PROVENANCE_METHODS = ['reviewed_primary_party_source_v1', 'reviewed_global_party_chair_snapshot_v1', 'reviewed_party_leadership_evidence_v1', 'party_platform_initial_v2'] as const;
export const LEADER_PROVENANCE_METHODS = [...INITIAL_LEADER_PROVENANCE_METHODS, 'bounded_party_platform_succession_v2', 'internal_party_balance_succession_v3'] as const;

export interface PoliticalOfficeState {
  role: PoliticalOfficeRole;
  countryId: string;
  title: string;
  appointedOn: string;
  evidence?: {
    status: 'source_reconciled';
    sourceOfficeId: string;
    sourceOfficeIds: string[];
    sourcePersonId: string;
    referenceDate: string;
    effectiveFrom?: string;
    sourceRecordIds: string[];
    authorityBasis: 'sourced_parliamentary_head_of_government' | 'sourced_presidential_head_of_state' | 'institutional_authority_unresolved';
  };
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
  leaderProfile?: Record<string, { valueBps: number; confidenceBps: number; status: 'derived' | 'modelled'; limitation: string }>;
  leaderProvenance?: {
    basis: 'sourced_analogue' | 'derived_analogue' | 'modelled_fallback';
    method: typeof LEADER_PROVENANCE_METHODS[number];
    sourcePartyId: string;
    referenceDate: string;
    sourceLeaderStatus: 'sourced' | 'derived' | 'unavailable' | 'ambiguous';
    sourceLeader?: {
      id: string;
      name: string;
      sourceRole?: 'party_chairperson' | 'party_leader' | 'interim_party_leader';
      sourceRecordIds: string[];
    };
    limitation: string;
  };
}

export type LeadershipTendency = 'radical' | 'firm' | 'mainstream' | 'pragmatic' | 'moderate';

export interface LeadershipContextMetric {
  valueBps?: number;
  coverage: 'sourced' | 'modelled' | 'unavailable';
  source: string;
  limitation: string;
}

export interface LeadershipSuccessionEvidence {
  method: 'internal_party_balance_succession_v1';
  partySupport: LeadershipContextMetric;
  legislativeSeatShare: LeadershipContextMetric;
  supporterMandate: Record<PoliticalIssue, LeadershipContextMetric>;
  selectedTendency: LeadershipTendency;
  profileFingerprint: string;
  limitation: string;
}

export interface LeadershipSuccession {
  id: string;
  partyId: string;
  countryId: string;
  previousPersonId: string;
  newPersonId: string;
  effectiveDate: string;
  selection: 'existing_party_member' | 'modelled_fallback' | 'modelled_internal_balance';
  contextEvidence?: LeadershipSuccessionEvidence;
  playerHandoff?: {
    status: 'pending' | 'continued' | 'switched';
    previousPersonId: string;
    successorPersonId: string;
    decidedOn?: string;
  };
}

export interface FiscalProposalPayload { policy?: Policy; annualBudget?: Budget }
export interface ProposalImpactDriver { issue: PoliticalIssue; directionBps: number; source: string; explanation: string }
export interface ProposalImpact { issueDirectionsBps: Record<PoliticalIssue, number>; drivers: ProposalImpactDriver[]; method: 'fiscal_delta_v1'; limitation: string }
export type EvaluationCoverage = 'complete' | 'partial' | 'unavailable';
export type GovernanceGoal = PoliticalIssue | 'fiscal_sustainability';
export interface CoveredMetric { valueBps?: number; coverage: EvaluationCoverage; source: string; limitation?: string }
export interface DirectPolicyChange { path: string; before?: number | string | null; after?: number | string | null; delta?: number; coverage: EvaluationCoverage; explanation: string }
export interface UnsupportedProposalChange { path: string; reason: string; coverage: 'partial' | 'unavailable' }
export interface ExpectedConsequence { goal: GovernanceGoal; directionBps: number; magnitudeBps: number; confidenceBps: number; coverage: EvaluationCoverage; source: string; explanation: string }
export type InstitutionalPowerHolder = 'none' | 'executive' | `chamber:${string}`;
export const INSTITUTIONAL_POWER_LEVERS = ['legislative_initiative', 'budget_initiative', 'amendment_power', 'veto_power', 'confidence_power', 'dissolution_power', 'appointment_confirmation', 'decree_authority'] as const;
export type InstitutionalPowerLever = typeof INSTITUTIONAL_POWER_LEVERS[number];
export interface InstitutionalPowerTransfer {
  id: string; lever: InstitutionalPowerLever; from: InstitutionalPowerHolder; to: InstitutionalPowerHolder;
  confidenceBps: number; coverage: EvaluationCoverage; source: string; explanation: string;
}
export interface PartyInstitutionalStake {
  holder: InstitutionalPowerHolder; stakeBps?: number; coverage: EvaluationCoverage;
  partySeats?: number; totalSeats?: number; governingBlocStakeBps?: number; limitation: string;
}
export interface PartyInstitutionalEffectEvaluation {
  id: string; lever: InstitutionalPowerLever; from: InstitutionalPowerHolder; to: InstitutionalPowerHolder;
  fromStakeBps?: number; toStakeBps?: number; rawInterestBps: number; effectiveInterestBps: number;
  confidenceBps: number; coverage: EvaluationCoverage; source: string; explanation: string;
}
export interface PartyInstitutionalInterestEvaluation {
  method: 'situational_institutional_interest_v1';
  status: 'not_applicable' | 'modelled' | 'unavailable';
  coverage: EvaluationCoverage; confidenceBps: number;
  governmentStatus: 'government' | 'opposition' | 'unavailable';
  materialAgreementBps: number; materialConfidenceBps: number; materialCoverage: EvaluationCoverage;
  materialBaselineFingerprint: string;
  adjustmentBps: number; effects: PartyInstitutionalEffectEvaluation[];
  positiveDrivers: string[]; negativeDrivers: string[]; limitation: string;
}
export interface ProposalMaterialContext {
  unemployment: CoveredMetric; fiscalSustainability: CoveredMetric; incomeSecurity: CoveredMetric;
  fiscalDistribution: CoveredMetric; publicServices: CoveredMetric; infrastructure: CoveredMetric; fiscalDistress: CoveredMetric;
}
export interface ProposalAnalysis {
  version: 'proposal-analysis-0.14-v2'; directPolicyChanges: DirectPolicyChange[]; materialContext: ProposalMaterialContext;
  expectedConsequences: ExpectedConsequence[]; issueEffects: Record<GovernanceGoal, number>; coverage: EvaluationCoverage;
  unsupportedChanges: UnsupportedProposalChange[]; limitations: string[]; genuinelyNeutral: boolean;
  institutionalEffects?: InstitutionalPowerTransfer[];
}
export interface PartyIssuePreference { idealPointBps: number; importanceBps: number; compromiseToleranceBps: number; confidenceBps: number; status: 'sourced_or_partial_prior' | 'modelled_fallback' | 'modelled_common_constraint' }
export interface PartyGoalProfile { partyId: string; goals: Record<GovernanceGoal, PartyIssuePreference> }
export interface PartyIssueEvaluation { goal: GovernanceGoal; currentOutcomeBps?: number; expectedOutcomeBps?: number; agreementBps: number; benefitBps: number; compromiseCostBps: number; severityBps: number; coverage: EvaluationCoverage }
export interface PartyInternalVoteDistribution {
  method: 'continuous_issue_distribution_v1';
  yesBps: number; noBps: number; abstainBps: number; unknownBps: number;
  agreementMeanBps: number; agreementHalfSpreadBps: number;
  coverage: EvaluationCoverage;
  status: 'modelled_common_prior' | 'unavailable';
  limitation: string;
}
export interface PartySeatAllocation { yesSeats: number; noSeats: number; abstainSeats: number; unknownSeats: number }
export interface PartyProposalEvaluation {
  partyId: string; agreementBps: number; confidenceBps: number; coverage: EvaluationCoverage; compromiseCostBps: number;
  /** Central profile decision, not every seat's vote under the plurality model. */
  vote: 'yes' | 'no' | 'abstain' | 'unknown'; positiveDrivers: string[]; negativeDrivers: string[]; tradeoffs: string[]; issueEvaluations: PartyIssueEvaluation[];
  decisionModel?: 'internal_distribution_v1';
  internalDistribution?: PartyInternalVoteDistribution;
  institutionalInterest?: PartyInstitutionalInterestEvaluation;
}
export interface PartyChamberEvaluation extends PartyProposalEvaluation { seats: number; seatAllocation?: PartySeatAllocation }
export interface PublicSupportEstimate { supportBps: number; opposeBps: number; neutralBps: number; unknownBps: number; confidenceBps: number; coverage: EvaluationCoverage; representedPersons: number; knownPersons: number; unknownPersons: number; drivers: ProposalImpactDriver[] }
export interface ChamberSupportEstimate { chamberId: string; yesSeats: number; noSeats: number; abstainSeats: number; unavailableSeats: number; totalSeats?: number; coverage: EvaluationCoverage; adopted?: boolean; partyEvaluations?: PartyChamberEvaluation[] }
export interface ParliamentarySupportEstimate { yesSeats: number; noSeats: number; abstainSeats: number; unavailableSeats: number; totalSeats: number; chambers: ChamberSupportEstimate[]; coverage: 'complete' | 'partial' | 'unavailable'; confidenceBps: number; procedure: 'modelled_procedure_v1' | 'internal_party_distribution_v1'; seatApportionment?: 'identity_hash_v1' }
export interface LegislativeVoteResult extends ParliamentarySupportEstimate { outcome: 'adopted' | 'rejected' | 'unavailable'; resolvedOn: string; reason?: 'effective_date_expired' | 'institutional_data_unavailable' }
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
  enactmentReference?: { fiscalReformSequence: number; reformFingerprint: string };
  analysis?: ProposalAnalysis;
  evaluationVersion?: 'legacy-0.14-v1' | 'situational-0.14-v2' | 'plurality-0.15-v1' | 'situational-plurality-0.15-v2';
}

export interface GovernanceState {
  version: typeof GOVERNANCE_VERSION;
  initializedOn?: string;
  leadersInitializedOn?: string;
  player: { controlledPersonId?: string };
  persons: Record<string, PoliticalPersonState>;
  proposals: Record<string, PoliticalProposal>;
  proposalOrder: string[];
  nextPersonSequence: number;
  nextProposalSequence: number;
  successions: Record<string, LeadershipSuccession>;
  successionOrder: string[];
  nextSuccessionSequence: number;
}

export const emptyGovernance = (initializedOn?: string): GovernanceState => ({
  version: GOVERNANCE_VERSION,
  initializedOn,
  leadersInitializedOn: undefined,
  player: {},
  persons: {},
  proposals: {},
  proposalOrder: [],
  nextPersonSequence: 0,
  nextProposalSequence: 0,
  successions: {},
  successionOrder: [],
  nextSuccessionSequence: 0,
});

export const governanceFingerprint = deterministicFingerprint;
