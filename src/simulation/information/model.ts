import type { EvaluationCoverage, FiscalProposalPayload } from '../governance/model';
import type { PoliticalIssue } from '../politics/model';
import type { SimulationState } from '../../types';
import type { GovernmentMilitaryReport } from '../military/reports';
import type { GovernmentTradeReport } from '../trade/reports';
import type { GovernmentOperationsReport } from '../operations/reports';
import type { GovernmentMultilateralReport } from '../multilateral/reports';
import type { InternationalActionKind, InternationalDriver, InternationalPhase, InternationalSeverity } from '../international/model';

export const INFORMATION_VERSION = 'information-0.15-v3' as const;
export const INFORMATION_MODEL = Object.freeze({
  version: INFORMATION_VERSION,
  schedulerPriority: 350,
  briefingHistoryLimitPerCountry: 256,
  briefingHistoryLimitGlobal: 2_048,
  protectedBriefingsPerCountry: 4,
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
  kind: 'parliamentary_result' | 'labour_report' | 'crisis_activation' | 'military_report' | 'trade_report';
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
  eventType: 'proposal_result' | 'labour_report' | 'crisis_activation' | 'urgent_event' | 'military_report' | 'trade_report';
  severity: BriefingSeverity;
  createdOn: string;
  sourceId: string;
  headline: string;
  interpretation?: BriefingInterpretation;
  fact: BriefingFact;
  pauseRequested: boolean;
}

export const briefingId = (eventType: MinisterialBriefing['eventType'], countryId: string, sourceId: string) => `briefing:${eventType}:${countryId}:${sourceId}`;

export interface GovernmentProposalEstimate {
  id: string;
  countryId: string;
  proposalId: string;
  proposalContentFingerprint: string;
  analyzedContent: { effectiveDate: string; payload: FiscalProposalPayload };
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
    status: 'unavailable';
    engine: 'government-information-0.15-v2';
    source: 'government-information.available-evidence';
    limitation: string;
  };
}

export interface GovernmentProposalEstimateInspection extends GovernmentProposalEstimate {
  stale: boolean;
}

export interface GovernmentInternationalAssessment {
  pairKey: string;
  countryAId: string;
  countryBId: string;
  phase: InternationalPhase;
  severity: InternationalSeverity;
  pressure: number;
  drivers: InternationalDriver[];
}

export interface GovernmentInternationalReport {
  id: string;
  countryId: string;
  asOfDate: string;
  producedOn: string;
  source: 'international.administrative-report';
  access: 'government';
  coverage: 'partial' | 'unavailable';
  status: 'modelled' | 'unavailable';
  confidenceBps: number;
  limitation: string;
  uncertainty: string;
  assessments: GovernmentInternationalAssessment[];
  restrictions: { actorCountryId: string; targetCountryId: string; kind: InternationalActionKind; categories: string[]; effectiveOn: string; liftDeclaredOn?: string; ceasesOn?: string }[];
  fingerprint: string;
}

export interface InformationState {
  tradeReports?: { latest: Record<string, GovernmentTradeReport>; byId: Record<string, GovernmentTradeReport> };
  militaryReports?: { latest: Record<string, GovernmentMilitaryReport>; byId: Record<string, GovernmentMilitaryReport> };
  internationalReports?: { latest: Record<string, GovernmentInternationalReport>; byId: Record<string, GovernmentInternationalReport> };
  operationsReports?: { latest: Record<string, GovernmentOperationsReport>; byId: Record<string, GovernmentOperationsReport> };
  multilateralReports?: { latest: Record<string, GovernmentMultilateralReport>; byId: Record<string, GovernmentMultilateralReport> };
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
    if (briefing.fact.reportId && briefing.fact.kind !== 'military_report' && briefing.fact.kind !== 'trade_report') referenced.add(briefing.fact.reportId);
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
export function retainedMilitaryReports(information: InformationState, briefings: readonly MinisterialBriefing[]) {
  const reports = information.militaryReports;
  if (!reports) return undefined;
  const ids = new Set([...Object.values(reports.latest).map(r => r.id), ...briefings.filter(b => b.eventType === 'military_report').map(b => b.sourceId)]);
  return { latest: reports.latest, byId: Object.fromEntries([...ids].sort().map(id => [id, reports.byId[id]])) };
}
export function retainedTradeReports(information: InformationState, briefings: readonly MinisterialBriefing[]) {
  const reports = information.tradeReports;
  if (!reports) return undefined;
  const ids = new Set([...Object.values(reports.latest).map(r => r.id), ...briefings.filter(b => b.eventType === 'trade_report').map(b => b.sourceId)]);
  return { latest: reports.latest, byId: Object.fromEntries([...ids].sort().map(id => [id, reports.byId[id]])) };
}

export function controlledBriefingCountry(state: Pick<SimulationState, 'governance'>): string | undefined {
  const personId = state.governance.player.controlledPersonId;
  return personId ? state.governance.persons[personId]?.countryId : undefined;
}

export function compareBriefings(a: MinisterialBriefing, b: MinisterialBriefing): number {
  const dateOrder = a.createdOn === b.createdOn ? 0 : a.createdOn < b.createdOn ? -1 : 1;
  return dateOrder || (a.id === b.id ? 0 : a.id < b.id ? -1 : 1);
}

export function policyComparisonText(comparison: PolicyTemporalComparison): string {
  return ` Since the measure entered into force on ${comparison.effectiveDate}, unemployment moved from ${(comparison.baselineValueBps / 100).toFixed(2)}% to ${(comparison.currentValueBps / 100).toFixed(2)}%; this is a temporal comparison, not evidence of causation.`;
}

export function retainCountryBriefings(briefings: readonly MinisterialBriefing[], controlledCountryId?: string): MinisterialBriefing[] {
  if (new Set(briefings.map(item => item.id)).size !== briefings.length) throw new Error('Cannot retain duplicate briefing IDs.');
  const newest = [...briefings].sort((a, b) => compareBriefings(b, a));
  const counts = new Map<string, number>();
  const candidates: MinisterialBriefing[] = [];
  const selected = new Set<string>();
  for (const briefing of newest) {
    const count = (counts.get(briefing.countryId) ?? 0) + 1;
    counts.set(briefing.countryId, count);
    if (count <= INFORMATION_MODEL.briefingHistoryLimitPerCountry) candidates.push(briefing);
    if (count <= INFORMATION_MODEL.protectedBriefingsPerCountry) selected.add(briefing.id);
  }
  if (selected.size > INFORMATION_MODEL.briefingHistoryLimitGlobal) {
    throw new Error('Briefing retention cannot protect the Country minimum within its global bound.');
  }
  for (const briefing of candidates) {
    if (selected.size >= INFORMATION_MODEL.briefingHistoryLimitGlobal) break;
    if (briefing.countryId === controlledCountryId) selected.add(briefing.id);
  }
  for (const briefing of candidates) {
    if (selected.size >= INFORMATION_MODEL.briefingHistoryLimitGlobal) break;
    selected.add(briefing.id);
  }
  const retained = candidates.filter(briefing => selected.has(briefing.id)).reverse();
  const anchors = new Set(retained.filter(item => item.fact.policyFollowUp).map(item => item.fact.proposalId));
  return retained.map(briefing => {
    const comparisons = briefing.fact.policyComparisons;
    if (!comparisons || comparisons.every(item => anchors.has(item.proposalId))) return briefing;
    const headline = comparisons.filter(item => !anchors.has(item.proposalId))
      .reduce((text, comparison) => text.replace(policyComparisonText(comparison), ''), briefing.headline);
    return { ...briefing, headline, fact: { ...briefing.fact, policyComparisons: comparisons.filter(item => anchors.has(item.proposalId)) } };
  });
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
