import type { EvaluationCoverage } from '../governance/model';

export const INFORMATION_VERSION = 'information-0.15-v1' as const;
export const INFORMATION_MODEL = Object.freeze({
  version: INFORMATION_VERSION,
  schedulerPriority: 350,
  briefingHistoryLimit: 256,
  materialUnemploymentChangeBps: 100,
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
  crisisType?: 'fiscal_stress' | 'public_service_degradation' | 'household_distress' | 'transfer_system_stress' | 'infrastructure_degradation';
  crisisSeverity?: 'low' | 'moderate' | 'severe' | 'critical';
  evidenceStatus: 'sourced' | 'derived' | 'modelled' | 'partial' | 'unavailable';
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
  interpretation?: string;
  fact: BriefingFact;
  pauseRequested: boolean;
}

export interface InformationState {
  version: typeof INFORMATION_VERSION;
  initializedOn?: string;
  latestGovernmentReports: Record<string, GovernmentReport>;
  governmentReportsById: Record<string, GovernmentReport>;
  briefings: MinisterialBriefing[];
}

export const emptyInformation = (initializedOn?: string): InformationState => ({
  version: INFORMATION_VERSION,
  initializedOn,
  latestGovernmentReports: {},
  governmentReportsById: {},
  briefings: [],
});

export interface BriefingPresentation {
  headline: string;
  context?: string;
  guidedActions?: string[];
  tellMeMoreAvailable: true;
}
