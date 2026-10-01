import type { EvaluationCoverage } from '../governance/model';
import type { PoliticalIssue } from '../politics/model';

export const INFORMATION_VERSION = 'information-0.15-v1' as const;
export const INFORMATION_MODEL = Object.freeze({
  version: INFORMATION_VERSION,
  schedulerPriority: 350,
  briefingHistoryLimit: 256,
  proposalEstimateHistoryLimit: 256,
  materialUnemploymentChangeBps: 50,
});

export const PORTFOLIOS = ['finance', 'economy', 'interior_security', 'social_health', 'foreign_affairs', 'defense'] as const;
export type Portfolio = typeof PORTFOLIOS[number];
export type BriefingSeverity = 'info' | 'advisory' | 'important' | 'urgent';
export type AdvisorAssistance = 'guided' | 'standard' | 'expert';

export interface GovernmentReport {
  id: string;
  countryId: string;
  indicator: 'unemployment_rate';
  valueBps?: number;
  asOfDate: string;
  status: 'modelled' | 'unavailable';
  coverage: EvaluationCoverage;
  unit: 'basis_points';
  source: 'socioeconomy.monthly';
  limitation: string;
}

export interface ChamberBriefingResult {
  chamberId: string;
  displayName: string;
  outcome: 'adopted' | 'rejected' | 'unavailable';
  yesSeats: number;
  noSeats: number;
  abstainSeats: number;
  unavailableSeats: number;
  totalSeats?: number;
  coverage: EvaluationCoverage;
}

export interface PolicyFollowUpAnchor {
  proposalId: string;
  effectiveDate: string;
  baselineReportId?: string;
  baselineDate?: string;
  baselineValueBps?: number;
  attributionStatus: 'temporal_only' | 'supported_counterfactual' | 'unavailable';
}

export interface PolicyTemporalComparison {
  proposalId: string;
  effectiveDate: string;
  baselineDate: string;
  baselineValueBps: number;
  currentValueBps: number;
  attributionStatus: 'temporal_only' | 'supported_counterfactual';
}

export interface BriefingFact {
  kind: 'parliamentary_result' | 'labour_report' | 'crisis_activation';
  proposalId?: string;
  reportId?: string;
  outcome?: 'adopted' | 'rejected' | 'unavailable';
  yesSeats?: number;
  noSeats?: number;
  effectiveDate?: string;
  previousValueBps?: number;
  valueBps?: number;
  chamberResults?: ChamberBriefingResult[];
  policyFollowUp?: PolicyFollowUpAnchor;
  policyComparisons?: PolicyTemporalComparison[];
  crisisType?: 'fiscal_stress' | 'public_service_degradation' | 'household_distress' | 'transfer_system_stress' | 'infrastructure_degradation';
  crisisSeverity?: 'low' | 'moderate' | 'severe' | 'critical';
  evidenceStatus: 'sourced' | 'derived' | 'modelled' | 'partial' | 'unavailable';
}

export interface BriefingInterpretation {
  basis: 'derived' | 'modelled' | 'unavailable';
  summary: string;
  relevantGoals?: PoliticalIssue[];
  policyLevers?: Array<{
    mechanism: 'corporate_tax' | 'annual_budget';
    limitation: string;
  }>;
  tradeoffs: string[];
  limitations: string[];
}

export interface MinisterialBriefing {
  id: string;
  countryId: string;
  portfolio: Portfolio;
  access: 'public' | 'government';
  eventType: 'proposal_result' | 'labour_report' | 'crisis_activation' | 'urgent_event';
  severity: BriefingSeverity;
  createdOn: string;
  sourceId: string;
  headline: string;
  interpretation?: BriefingInterpretation;
  fact: BriefingFact;
  pauseRequested: boolean;
}

export interface GovernmentProposalEstimate {
  id: string;
  countryId: string;
  proposalId: string;
  requestedOn: string;
  requestedByPersonId: string;
  coverage: EvaluationCoverage;
  confidenceBps: number;
  publicEstimate: {
    supportBps: number;
    opposeBps: number;
    neutralBps: number;
    unknownBps: number;
    confidenceBps: number;
    coverage: EvaluationCoverage;
  };
  parliamentaryEstimate: {
    yesSeats: number;
    noSeats: number;
    abstainSeats: number;
    unavailableSeats: number;
    totalSeats: number;
    confidenceBps: number;
    coverage: EvaluationCoverage;
    chambers: ChamberBriefingResult[];
  };
  directPolicyChanges: Array<{
    path: string;
    before?: number | string | null;
    after?: number | string | null;
    delta?: number;
    coverage: EvaluationCoverage;
    explanation: string;
  }>;
  expectedConsequences: Array<{
    goal: string;
    directionBps: number;
    magnitudeBps: number;
    confidenceBps: number;
    coverage: EvaluationCoverage;
    explanation: string;
  }>;
  unsupportedChanges: Array<{ path: string; reason: string; coverage: 'partial' | 'unavailable' }>;
  limitations: string[];
  provenance: {
    status: 'derived';
    engine: 'situational-0.14-v2';
    source: 'governance.proposal-analysis';
    limitation: string;
  };
}

export interface InformationState {
  version: typeof INFORMATION_VERSION;
  initializedOn?: string;
  latestGovernmentReports: Record<string, GovernmentReport>;
  governmentReportsById: Record<string, GovernmentReport>;
  briefings: MinisterialBriefing[];
  proposalEstimates: GovernmentProposalEstimate[];
}

export function referencedGovernmentReportIds(information: Pick<InformationState, 'latestGovernmentReports'> & { briefings: readonly MinisterialBriefing[] }): Set<string> {
  const referenced = new Set(Object.values(information.latestGovernmentReports).map(report => report.id));
  const proposalBriefings = new Map(information.briefings
    .filter(briefing => briefing.fact.kind === 'parliamentary_result' && briefing.fact.proposalId)
    .map(briefing => [briefing.fact.proposalId!, briefing]));
  for (const briefing of information.briefings) {
    if (briefing.fact.reportId) referenced.add(briefing.fact.reportId);
    if (briefing.fact.policyFollowUp?.baselineReportId) referenced.add(briefing.fact.policyFollowUp.baselineReportId);
    for (const comparison of briefing.fact.policyComparisons ?? []) {
      const proposalBriefing = proposalBriefings.get(comparison.proposalId);
      if (proposalBriefing?.fact.policyFollowUp?.baselineReportId) {
        referenced.add(proposalBriefing.fact.policyFollowUp.baselineReportId);
      }
    }
  }
  return referenced;
}

export const emptyInformation = (initializedOn?: string): InformationState => ({
  version: INFORMATION_VERSION,
  initializedOn,
  latestGovernmentReports: {},
  governmentReportsById: {},
  briefings: [],
  proposalEstimates: [],
});

export interface GuidedBriefingAction {
  label: string;
  destination: 'fiscal';
}

export interface BriefingPresentation {
  headline: string;
  context?: string;
  guidedActions?: GuidedBriefingAction[];
  guidedLevers?: Array<{ label: string; explanation: string }>;
  tradeoffs?: string[];
  limitations?: string[];
  tellMeMoreAvailable: true;
}
