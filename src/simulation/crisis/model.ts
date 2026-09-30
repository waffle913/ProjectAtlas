export const CRISIS_TYPES = [
  'fiscal_stress',
  'public_service_degradation',
  'household_distress',
  'transfer_system_stress',
  'infrastructure_degradation',
] as const;

export type CrisisType = typeof CRISIS_TYPES[number];
export type CrisisPhase = 'NORMAL' | 'PRESSURE' | 'ACTIVE' | 'RECOVERING';
export type CrisisSeverity = 'none' | 'low' | 'moderate' | 'severe' | 'critical';
export type TripwireDirection = 'above' | 'below';

export interface CrisisProvenance {
  status: 'sourced' | 'derived' | 'modelled' | 'unavailable';
  sourceSystem: 'fiscal-0.11-v2' | 'socioeconomy-0.10-v1';
  detail: string;
}

export interface CrisisTripwire {
  id: string;
  crisisType: CrisisType;
  countryId: string;
  sourceSystem: CrisisProvenance['sourceSystem'];
  indicator: string;
  currentValue: number;
  unit: 'BASIS_POINTS';
  direction: TripwireDirection;
  dangerThreshold: number;
  recoveryThreshold: number;
  exceedanceBps: number;
  persistenceMonths: number;
  recoveryMonths: number;
  severityContribution: number;
  persistenceContribution: number;
  deteriorationContribution: number;
  pressureContribution: number;
  dangerous: boolean;
  recovered: boolean;
  provenance: CrisisProvenance;
}

export interface CrisisActivationSnapshot {
  date: string;
  pressure: number;
  severity: CrisisSeverity;
  tippingChanceBps: number;
  tippingRollBps: number;
  tripwires: CrisisTripwire[];
}

export interface CrisisEpisode {
  id: string;
  type: CrisisType;
  countryId: string;
  regionIds?: string[];
  episodeOrdinal: number;
  state: CrisisPhase;
  severity: CrisisSeverity;
  currentPressure: number;
  maximumPressure: number;
  pressureStartedOn?: string;
  activatedOn?: string;
  recoveringOn?: string;
  endedOn?: string;
  lastEvaluatedOn?: string;
  maximumSeverity: CrisisSeverity;
  currentTripwires: CrisisTripwire[];
  activationSnapshot?: CrisisActivationSnapshot;
  activationRngKey?: string;
  lastTippingRngKey?: string;
  dangerousEvaluations: number;
  recoveryEvaluations: number;
  explanation: string[];
  recoveryDrivers: string[];
}

export interface CrisisEpisodeSummary {
  id: string;
  type: CrisisType;
  countryId: string;
  episodeOrdinal: number;
  pressureStartedOn: string;
  activatedOn?: string;
  recoveringOn?: string;
  endedOn: string;
  maximumSeverity: CrisisSeverity;
  maximumPressure: number;
  dominantDrivers: string[];
  resolutionDrivers: string[];
}

export interface CrisisCountryState {
  currentByType: Record<CrisisType, CrisisEpisode>;
  history: CrisisEpisodeSummary[];
}

export interface CrisisState {
  version: 'crisis-0.12-v1';
  initializedOn?: string;
  lastMonthlyDate?: string;
  evaluations: number;
  countries: Record<string, CrisisCountryState>;
}

export const CRISIS_MODEL = Object.freeze({
  version: 'crisis-0.12-v1' as const,
  schedulerPriority: 300,
  historyLimitPerCountry: 24,
  pressureRecoveryEvaluations: 2,
  activeRecoveryEvaluations: 2,
  recoveringResolutionEvaluations: 3,
  tippingMinimumPersistence: 3,
  tippingMinimumTripwires: 2,
  tippingMinimumPressure: 18_000,
  pressureRecoveryCeiling: 4_000,
  severity: { low: 1, moderate: 12_000, severe: 24_000, critical: 40_000 },
  hazard: { baseBps: 1_000, pressureDivisor: 4, persistenceBps: 400, tripwireBps: 250, deteriorationDivisor: 10, maximumBps: 9_000 },
  tripwirePersistenceBpsPerMonth: 500,
  tripwirePersistenceMaximumBps: 3_000,
  degenerateStressMaximumBps: 30_000,
  thresholds: {
    fiscal: { unpaidCommitmentsBps: [1_500, 400], interestBurdenBps: [1_800, 1_000], debtToAnnualOutputBps: [9_000, 7_000], deficitToOutputBps: [800, 200] },
    publicServices: { coverageBps: [8_000, 9_000], underfundingBps: [1_500, 500], backlogBps: [4_000, 1_000] },
    infrastructure: { coverageBps: [8_500, 9_300], fundedCapacityBps: [8_500, 9_300], executedSpendingBps: [8_500, 9_300], backlogBps: [3_000, 1_000] },
    transfers: { fundingGapBps: [1_500, 500], arrearsBps: [1_000, 200], executionBps: [8_500, 9_500] },
    households: { unemploymentBps: [1_500, 900], employmentLossBps: [1_000, 500], disposableIncomeDeclineBps: [1_000, 300], basicNeedsCoverageBps: [8_500, 9_300], shortageBps: [1_000, 300], consumptionCoverageBps: [9_000, 9_700] },
  },
});

export const emptyCrisis = (): CrisisState => ({ version: CRISIS_MODEL.version, evaluations: 0, countries: {} });

const episodeId = (countryId: string, type: CrisisType, ordinal: number) => `crisis:${countryId}:${type}:${ordinal}`;

export function normalEpisode(countryId: string, type: CrisisType, ordinal = 0): CrisisEpisode {
  return {
    id: episodeId(countryId, type, ordinal), type, countryId, episodeOrdinal: ordinal,
    state: 'NORMAL', severity: 'none', currentPressure: 0, maximumPressure: 0, maximumSeverity: 'none',
    currentTripwires: [], dangerousEvaluations: 0, recoveryEvaluations: 0,
    explanation: [], recoveryDrivers: [],
  };
}

export function initializeCrisisState(state: CrisisState, countryIds: Iterable<string>, date: string): CrisisState {
  if (state.initializedOn) return state;
  return {
    ...emptyCrisis(), initializedOn: date,
    countries: Object.fromEntries([...countryIds].sort().map(countryId => [countryId, {
      currentByType: Object.fromEntries(CRISIS_TYPES.map(type => [type, normalEpisode(countryId, type)])) as Record<CrisisType, CrisisEpisode>,
      history: [],
    }])),
  };
}

export const crisisRngKey = (countryId: string, type: CrisisType, date: string, ordinal: number) => `crisis:${countryId}:${type}:${date}:${ordinal}`;
