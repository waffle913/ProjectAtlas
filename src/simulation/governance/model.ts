import type { Budget, Policy } from '../fiscal/model';
import type { PoliticalIssue } from '../politics/model';
import { deterministicFingerprint } from '../fingerprint';

export const GOVERNANCE_VERSION = 'governance-0.14-v1' as const;
export const AUTHORITY_CAPABILITIES = ['sponsor_legislation', 'sponsor_fiscal_reform', 'sponsor_budget_reform', 'vote_legislation', 'access_government_information', 'command_military_operations'] as const;
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

// 0.22 generic decision/policy/law framework. `kind` is the machine category; `fiscal_reform`
// is the first member. Future milestones add new categories with their own typed payloads and
// effects — none are implemented here.
export const PROPOSAL_KINDS = ['fiscal_reform'] as const;
export type ProposalKind = typeof PROPOSAL_KINDS[number];

// Distinguishes what sort of public decision a proposal is. A fiscal reform adopted through
// the ordinary legislative proposal lifecycle defaults to a law, but the same material policy
// may later be constitutionally entrenched as a secondary disposition (see 0.23) — the
// effective class is stored on the proposal, never hard-bound to the category.
export const PROPOSAL_INSTRUMENT_CLASSES = ['administrative_action', 'regulatory_policy', 'law', 'constitutional_amendment'] as const;
export type ProposalInstrumentClass = typeof PROPOSAL_INSTRUMENT_CLASSES[number];

// Future constitutional disposition. `undefined` means an ordinary instrument; a proposal with
// this set must be a `constitutional_amendment`. No constitutional procedure is implemented in
// 0.22 — the field only makes the future distinction representable and validatable.
export type ConstitutionalDisposition = 'principal' | 'secondary';

// Typed per-kind payload and effect mappings. Only `fiscal_reform` has a concrete
// implementation in 0.22; the union collapses to it today and grows per future milestone.
export interface ProposalPayloadByKind { fiscal_reform: FiscalProposalPayload }
export interface ProposalEffectByKind { fiscal_reform: FiscalReformEnactment }
export type ProposalPayload = ProposalPayloadByKind[ProposalKind];
export type ProposalEffect = ProposalEffectByKind[ProposalKind];

// A typed, immutable record of the effect a proposal produced once it became effective. The
// owning subsystem applies the effect through its own runtime; the proposal only records the
// typed reference.
export interface FiscalReformEnactment {
  category: 'fiscal_reform';
  fiscalReformSequence: number;
  reformFingerprint: string;
}

// Static, pedagogical description of a proposal category. This is documentation, not a
// mechanic: it produces no effect and is never serialized into a save. The default/allowed
// instrument classes live on the typed contract, not here, so a category is never irreversibly
// bound to a single class.
export interface PolicyCategoryDescriptor {
  kind: ProposalKind;
  title: string;
  summary: string;
  usage: string;
  context?: string;
  tradeoffs?: string;
}

export interface ProposalContract<K extends ProposalKind> {
  kind: K;
  descriptor: PolicyCategoryDescriptor;
  defaultInstrumentClass: ProposalInstrumentClass;
  allowedInstrumentClasses: readonly ProposalInstrumentClass[];
}

export const PROPOSAL_CONTRACTS: { [K in ProposalKind]: ProposalContract<K> } = {
  fiscal_reform: {
    kind: 'fiscal_reform',
    descriptor: {
      kind: 'fiscal_reform',
      title: 'Fiscal reform',
      summary: 'Changes the legal tax rules and/or the annual budget through the ordinary legislative process.',
      usage: 'Raise or lower an explicit tax value or reallocate the annual budget; the change becomes effective on its effective date only after parliamentary adoption.',
      context: 'Fiscal rules are the legal basis for tax liability, collection, revenue and public services. They do not grant new spending powers by themselves.',
      tradeoffs: 'A tax change redistributes disposable income and public revenue; a budget reallocation shifts spending between public services and defence.',
    },
    defaultInstrumentClass: 'law',
    allowedInstrumentClasses: ['law', 'constitutional_amendment'],
  },
};

export const POLICY_CATEGORY_REGISTRY: Readonly<Record<ProposalKind, PolicyCategoryDescriptor>> = Object.fromEntries(
  (Object.entries(PROPOSAL_CONTRACTS) as Array<[ProposalKind, ProposalContract<ProposalKind>]>).map(([kind, contract]) => [kind, contract.descriptor]),
) as Readonly<Record<ProposalKind, PolicyCategoryDescriptor>>;

export const proposalContract = (kind: ProposalKind): ProposalContract<ProposalKind> => PROPOSAL_CONTRACTS[kind];
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
export interface LegislativeVoteResult extends ParliamentarySupportEstimate { outcome: 'adopted' | 'rejected' | 'unavailable'; resolvedOn: string; reason?: 'effective_date_expired' | 'institutional_data_unavailable' | 'constitutionally_protected' }
export type PoliticalProposalStatus = 'draft' | 'submitted' | 'enacted' | 'rejected' | 'withdrawn' | 'unavailable';
export interface PoliticalProposalFor<K extends ProposalKind = ProposalKind> {
  id: string;
  countryId: string;
  proposerPersonId: string;
  createdOn: string;
  kind: K;
  instrumentClass: ProposalInstrumentClass;
  constitutionalDisposition?: ConstitutionalDisposition;
  payload: ProposalPayloadByKind[K];
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
  effects: ProposalEffectByKind[K][];
  analysis?: ProposalAnalysis;
  evaluationVersion?: 'legacy-0.14-v1' | 'situational-0.14-v2' | 'plurality-0.15-v1' | 'situational-plurality-0.15-v2';
}

/** The canonical stored proposal type: a discriminated union linking kind -> payload -> effects,
 *  so the compiler guarantees kind A carries payload A and effects A even once several kinds exist. */
export type AnyPoliticalProposal = { [K in ProposalKind]: PoliticalProposalFor<K> }[ProposalKind];
export type PoliticalProposal = AnyPoliticalProposal;

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
