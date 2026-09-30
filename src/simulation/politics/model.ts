import type { Quality } from '../socioeconomy/model';

export const POLITICAL_ISSUES = ['fiscal_distribution', 'public_services', 'labour_protection', 'income_security', 'infrastructure', 'public_order'] as const;
export type PoliticalIssue = typeof POLITICAL_ISSUES[number];
export const IDEOLOGY_DIMENSIONS = ['fiscal_redistribution', 'market_intervention', 'public_services', 'labour_protection', 'social_progressivism', 'migration_openness', 'national_integration', 'decentralization', 'civil_liberties'] as const;
export type IdeologyDimension = typeof IDEOLOGY_DIMENSIONS[number];
export type ExecutiveSystem = 'presidential' | 'parliamentary' | 'semi_presidential' | 'collective' | 'monarchy_parliamentary' | 'other' | 'unavailable';
export type LegislatureKind = 'unicameral' | 'bicameral' | 'none' | 'unavailable';
export type ElectoralRuleKind = 'proportional' | 'majoritarian' | 'mixed' | 'multi_round' | 'indirect' | 'appointed' | 'other' | 'unavailable';
export type PoliticalCoverage = 'sourced' | 'partial' | 'modelled' | 'unavailable';

export interface PoliticalProvenance {
  status: PoliticalCoverage;
  referenceDate: string;
  effectiveDate?: string;
  retrievedAt: string;
  source: string;
  sourceUrl?: string;
  limitation: string;
}
export interface IssuePosition {
  issueId: PoliticalIssue;
  preferenceBps: number;
  intensityBps: number;
  confidenceBps: number;
  materialInterests: string[];
  ideologicalPrior: string;
  provenance: PoliticalProvenance;
}
export interface ElectoralRule {
  kind: ElectoralRuleKind;
  rounds?: number;
  status: PoliticalCoverage;
  provenance: PoliticalProvenance;
}
export interface LegislativeChamber {
  id: string;
  countryId: string;
  displayName: string;
  totalSeats?: number;
  seatsByParty: Record<string, number>;
  independentOtherSeats?: number;
  electoralRule: ElectoralRule;
  termStart?: string;
  termEnd?: string;
  electionProcess: 'current' | 'deferred' | 'unavailable';
  provenance: PoliticalProvenance;
}
export interface NationalInstitutions {
  id: string;
  countryId: string;
  executiveSystem: ExecutiveSystem;
  legislatureKind: LegislatureKind;
  chambers: LegislativeChamber[];
  governingPartyIds: string[];
  confidenceArrangement: 'majority' | 'minority' | 'confidence_and_supply' | 'not_applicable' | 'unavailable';
  lastElectionDate?: string;
  nextElectionDate?: string;
  electionProcess: 'current' | 'deferred' | 'unavailable';
  provenance: PoliticalProvenance;
}
export interface PoliticalParty {
  id: string;
  countryId: string;
  displayName: string;
  fictional: true;
  provenance: PoliticalProvenance;
  ideology: Record<IdeologyDimension, number>;
  issuePositions: Record<PoliticalIssue, IssuePosition>;
  constituencies: string[];
  currentSeats: number | null;
  nationalSupportBps: number;
  regionalSupportBps: Record<string, number>;
  governmentStatus: 'government' | 'opposition' | 'unavailable';
}
export interface PoliticalOrganization {
  id: string;
  countryId: string;
  type: 'union' | 'association';
  displayName: string;
  fictional: true;
  representedInterests: string[];
  representedCohorts: Array<'low' | 'middle' | 'high'>;
  membership: { status: 'modelled' | 'unavailable'; estimate?: number };
  issuePriorities: PoliticalIssue[];
  currentPositions: Partial<Record<PoliticalIssue, number>>;
  regionalPresenceBps: Record<string, number>;
  provenance: PoliticalProvenance;
}
export interface MaterialExperience {
  disposableIncomePerPerson: number;
  baselineDisposableIncomePerPerson: number;
  unemploymentBps: number;
  basicNeedsCoverageBps: number | null;
  taxBurdenBps: number | null;
  transferIncomePerPerson: number;
  serviceCoverageBps: number | null;
}
export interface CohortPoliticalOpinion {
  cohortId: string;
  income: 'low' | 'middle' | 'high';
  orientation: 'left' | 'centre' | 'right';
  persons: number;
  issuePreferencesBps: Record<PoliticalIssue, number>;
  issueSalienceBps: Record<PoliticalIssue, number>;
  partySupportBps: Record<string, number>;
  engagementBps: number;
  materialSentimentBps: number;
  experience: MaterialExperience;
  recentMaterialDrivers: string[];
  provenance: { status: Quality; method: string; initializedOn: string; limitation: string };
}
export interface RegionalPoliticalOpinion {
  regionId: string;
  countryId: string;
  cohorts: Record<string, CohortPoliticalOpinion>;
  aggregateSupportBps: Record<string, number>;
}
export interface PoliticalCountryState {
  countryId: string;
  institutionId: string;
  partyIds: string[];
  organizationIds: string[];
  regionIds: string[];
  nationalSupportBps: Record<string, number>;
  recentOpinionDrivers: Array<{ date: string; drivers: string[] }>;
  coverage: { institutions: PoliticalCoverage; legislature: PoliticalCoverage; electoralSystem: PoliticalCoverage; partyBasis: PoliticalCoverage; seats: PoliticalCoverage; coalition: PoliticalCoverage; organizedInterests: PoliticalCoverage; opinionAnchor: PoliticalCoverage };
}
export interface PoliticalState {
  version: 'politics-0.13-v1';
  initializedOn?: string;
  lastOpinionUpdate?: string;
  weeklyEvaluations: number;
  countries: Record<string, PoliticalCountryState>;
  institutions: Record<string, NationalInstitutions>;
  partyRegistry: Record<string, PoliticalParty>;
  organizationRegistry: Record<string, PoliticalOrganization>;
  regionalOpinion: Record<string, RegionalPoliticalOpinion>;
}

export const POLITICS_MODEL = Object.freeze({
  version: 'politics-0.13-v1' as const,
  schedulerPriority: 400,
  opinionInertiaBps: 8_000,
  preferenceInertiaBps: 9_000,
  salienceInertiaBps: 8_500,
  sentimentInertiaBps: 8_000,
  historyLimit: 12,
  baseEngagementBps: { left: 6_200, centre: 5_500, right: 6_200 },
  incomeSensitivityBps: { low: 12_000, middle: 10_000, high: 7_000 },
  baseUndecidedBps: { left: 500, centre: 1_000, right: 500 },
});

export const emptyPolitics = (): PoliticalState => ({
  version: POLITICS_MODEL.version, weeklyEvaluations: 0, countries: {}, institutions: {}, partyRegistry: {}, organizationRegistry: {}, regionalOpinion: {},
});
