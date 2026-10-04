import { TRADE_CATEGORIES, type TradeCategory } from '../trade/model';
import { countryPairKey } from '../diplomacy';

export const INTERNATIONAL_VERSION = 'international-0.18-v1' as const;
export type InternationalActionKind = 'condemnation' | 'import_restriction' | 'export_restriction';
export type InternationalActionStatus = 'active' | 'lifted';
export type InternationalPhase = 'NORMAL' | 'PRESSURE' | 'ACTIVE' | 'RECOVERING';
export type InternationalSeverity = 'none' | 'low' | 'moderate' | 'severe' | 'critical';
export type InternationalCoverage = 'unavailable' | 'partial' | 'sourced';

export interface InternationalDriver {
  kind: string;
  weightBps: number;
  detail: string;
}

export interface InternationalAction {
  id: string;
  actorCountryId: string;
  targetCountryId: string;
  kind: InternationalActionKind;
  categories: TradeCategory[];
  declaredOn: string;
  effectiveOn: string;
  liftDeclaredOn?: string;
  ceasesOn?: string;
  status: InternationalActionStatus;
  declaredByPersonId: string;
  provenance: 'modelled' | 'synthetic';
  limitation: string;
}

export interface InternationalEpisodeSummary {
  pairKey: string;
  countryAId: string;
  countryBId: string;
  pressureStartedOn: string;
  activatedOn?: string;
  recoveringOn?: string;
  endedOn: string;
  maximumPressure: number;
  maximumSeverity: InternationalSeverity;
  dominantDrivers: string[];
  resolutionDrivers: string[];
}

export interface InternationalEpisode {
  pairKey: string;
  countryAId: string;
  countryBId: string;
  phase: InternationalPhase;
  severity: InternationalSeverity;
  pressure: number;
  maximumPressure: number;
  maximumSeverity: InternationalSeverity;
  drivers: InternationalDriver[];
  dangerousEvaluations: number;
  recoveryEvaluations: number;
  pressureStartedOn?: string;
  activatedOn?: string;
  recoveringOn?: string;
  lastEvaluatedOn?: string;
  history: InternationalEpisodeSummary[];
}

export interface InternationalFactualCoverage {
  status: InternationalCoverage;
  referenceDate: string;
  limitation: string;
}

export interface InternationalState {
  version: typeof INTERNATIONAL_VERSION;
  initializedOn?: string;
  lastMonthlyDate?: string;
  factualCoverage: InternationalFactualCoverage;
  actions: Record<string, InternationalAction>;
  actionOrder: string[];
  nextActionSequence: number;
  episodes: Record<string, InternationalEpisode>;
}

export const INTERNATIONAL_MODEL = Object.freeze({
  version: INTERNATIONAL_VERSION,
  schedulerPriority: 320,
  reportPriority: 340,
  historyLimitPerPair: 24,
  actionRetentionGlobal: 1_024,
  actionRetentionPerPair: 64,
  activeRestrictionGlobalLimit: 4_096,
  activeRestrictionPerPairLimit: 256,
  pressureRecoveryEvaluations: 2,
  activeRecoveryEvaluations: 2,
  recoveringResolutionEvaluations: 3,
  activationMinimumPressure: 18_000,
  recoveryCeiling: 4_000,
  condemnationDecayMonths: 6,
  condemnationPressurePerDirection: 3_000,
  severity: { low: 1, moderate: 12_000, severe: 24_000, critical: 40_000 },
  weights: {
    territorialClaim: 12_000,
    activeSanction: 10_000,
    reciprocalCoercion: 4_000,
    condemnation: 3_000,
  },
  maximumPressure: 100_000,
});

export const emptyInternational = (initializedOn?: string): InternationalState => ({
  version: INTERNATIONAL_VERSION,
  initializedOn,
  factualCoverage: {
    status: 'unavailable',
    referenceDate: initializedOn ?? '2026-01-01',
    limitation: 'No factual, licensed operative sanctions dataset is admitted. Empty gameplay action history is not evidence of zero real-world sanctions.',
  },
  actions: {},
  actionOrder: [],
  nextActionSequence: 0,
  episodes: {},
});

export const internationalPairKey = (countryAId: string, countryBId: string) => countryPairKey(countryAId, countryBId);

export const internationalActionId = (sequence: number) => `international-action.${sequence.toString().padStart(8, '0')}`;

export const validInternationalCategory = (category: unknown): category is TradeCategory =>
  typeof category === 'string' && (TRADE_CATEGORIES as readonly string[]).includes(category);

export function normalInternationalEpisode(countryAId: string, countryBId: string): InternationalEpisode {
  return {
    pairKey: internationalPairKey(countryAId, countryBId),
    countryAId,
    countryBId,
    phase: 'NORMAL',
    severity: 'none',
    pressure: 0,
    maximumPressure: 0,
    maximumSeverity: 'none',
    drivers: [],
    dangerousEvaluations: 0,
    recoveryEvaluations: 0,
    history: [],
  };
}

export function internationalSeverityFor(pressure: number): InternationalSeverity {
  const s = INTERNATIONAL_MODEL.severity;
  if (pressure >= s.critical) return 'critical';
  if (pressure >= s.severe) return 'severe';
  if (pressure >= s.moderate) return 'moderate';
  if (pressure >= s.low) return 'low';
  return 'none';
}
