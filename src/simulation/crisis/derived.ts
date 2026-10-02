import { CRISIS_MODEL, type CrisisSeverity, type CrisisTripwire, type CrisisType, type TripwireDirection } from './model';
import { ratio } from '../socioeconomy/model';

export const crisisSeverityRank: Readonly<Record<CrisisSeverity, number>> = { none: 0, low: 1, moderate: 2, severe: 3, critical: 4 };
export const severityForPressure = (pressure: number): CrisisSeverity => pressure <= 0 ? 'none' : pressure < CRISIS_MODEL.severity.moderate ? 'low' : pressure < CRISIS_MODEL.severity.severe ? 'moderate' : pressure < CRISIS_MODEL.severity.critical ? 'severe' : 'critical';
export const tripwireFlags = (value: number, direction: TripwireDirection, danger: number, recovery: number) => ({
  dangerous: direction === 'above' ? value >= danger : value <= danger,
  recovered: direction === 'above' ? value <= recovery : value >= recovery,
});
export const tripwirePersistence = (dangerous: boolean, months: number) => dangerous ? Math.min(CRISIS_MODEL.tripwirePersistenceMaximumBps, months * CRISIS_MODEL.tripwirePersistenceBpsPerMonth) : 0;

interface TripwireSpecification {
  direction: TripwireDirection; thresholds: readonly number[]; sourceSystem: CrisisTripwire['sourceSystem'];
  detail: string; ratioBasis?: 'stress' | 'coverage';
}
const fiscal = (thresholds: readonly number[], detail: string, direction: TripwireDirection = 'above', ratioBasis?: 'stress' | 'coverage'): TripwireSpecification => ({ thresholds, detail, direction, ratioBasis, sourceSystem: 'fiscal-0.11-v2' });
const socio = (thresholds: readonly number[], detail: string, direction: TripwireDirection, ratioBasis: 'stress' | 'coverage'): TripwireSpecification => ({ thresholds, detail, direction, ratioBasis, sourceSystem: 'socioeconomy-0.10-v1' });
const T = CRISIS_MODEL.thresholds;
const specifications: Record<CrisisType, Record<string, TripwireSpecification>> = {
  fiscal_stress: {
    unpaid_commitments_to_revenue: fiscal(T.fiscal.unpaidCommitmentsBps, 'Simulated unpaid commitments divided by simulated total revenue.', 'above', 'stress'),
    interest_burden: fiscal(T.fiscal.interestBurdenBps, 'Simulated interest paid divided by total revenue.', 'above', 'stress'),
    debt_to_annual_output: fiscal(T.fiscal.debtToAnnualOutputBps, 'Simulated debt divided by annualized current output.', 'above', 'stress'),
    deficit_to_output: fiscal(T.fiscal.deficitToOutputBps, 'Simulated monthly deficit divided by current monthly output.', 'above', 'stress'),
  },
  public_service_degradation: {
    health_coverage: fiscal(T.publicServices.coverageBps, 'Simulated health service coverage.', 'below'),
    education_coverage: fiscal(T.publicServices.coverageBps, 'Simulated education service coverage.', 'below'),
    service_underfunding: fiscal(T.publicServices.underfundingBps, 'Health and education spending gap against simulated requirements.', 'above', 'stress'),
    service_backlog: fiscal(T.publicServices.backlogBps, 'Accumulated health and education backlog against monthly requirements.', 'above', 'stress'),
  },
  infrastructure_degradation: {
    infrastructure_coverage: fiscal(T.infrastructure.coverageBps, 'Simulated infrastructure service coverage.', 'below'),
    funded_capacity: fiscal(T.infrastructure.fundedCapacityBps, 'Funded infrastructure capacity against reference population capacity.', 'below', 'coverage'),
    executed_spending: fiscal(T.infrastructure.executedSpendingBps, 'Executed infrastructure spending against simulated requirement.', 'below', 'coverage'),
    infrastructure_backlog: fiscal(T.infrastructure.backlogBps, 'Accumulated infrastructure backlog against monthly requirement.', 'above', 'stress'),
  },
  transfer_system_stress: {
    pension_funding_gap: fiscal(T.transfers.fundingGapBps, 'Pension appropriation not executed.', 'above', 'stress'),
    income_support_funding_gap: fiscal(T.transfers.fundingGapBps, 'Income-support appropriation not executed.', 'above', 'stress'),
    transfer_arrears: fiscal(T.transfers.arrearsBps, 'Pension and income-support arrears against current appropriations.', 'above', 'stress'),
    transfer_execution: fiscal(T.transfers.executionBps, 'Executed transfers against current obligations including opening arrears.', 'below', 'coverage'),
  },
  household_distress: {
    unemployment: socio(T.households.unemploymentBps, 'Current unemployment divided by current labour force.', 'above', 'stress'),
    employment_deterioration: socio(T.households.employmentLossBps, 'Employment loss against calibrated baseline employment.', 'above', 'stress'),
    disposable_income_decline: fiscal(T.households.disposableIncomeDeclineBps, 'Monthly decline in simulated household disposable income.'),
    basic_needs_coverage: socio(T.households.basicNeedsCoverageBps, 'Essential consumption divided by calibrated essential reference.', 'below', 'coverage'),
    persistent_shortage: socio(T.households.shortageBps, 'Unmet simulated demand divided by total demand.', 'above', 'stress'),
    household_consumption_coverage: socio(T.households.consumptionCoverageBps, 'Realized household consumption divided by household demand.', 'below', 'coverage'),
  },
};
export function crisisTripwireSpecification(type: CrisisType, indicator: string): TripwireSpecification | undefined {
  return specifications[type]?.[indicator];
}
export function tripwireExceedance(value: number, direction: TripwireDirection, danger: number, recovery: number) {
  const distance = direction === 'above' ? Math.max(0, value - recovery) : Math.max(0, recovery - value);
  return Math.min(30_000, ratio(distance, 10_000, Math.max(1, Math.abs(danger - recovery))));
}
export const crisisRecoveryPredicate = (tripwires: readonly CrisisTripwire[]) => tripwires.every(item => !item.dangerous)
  && tripwires.reduce((sum, item) => sum + item.pressureContribution, 0) <= CRISIS_MODEL.pressureRecoveryCeiling;
export function crisisTippingChance(tripwires: readonly CrisisTripwire[]) {
  const M = CRISIS_MODEL, dangerous = tripwires.filter(item => item.dangerous);
  const pressure = tripwires.reduce((sum, item) => sum + item.pressureContribution, 0);
  const persistence = Math.max(0, ...dangerous.map(item => item.persistenceMonths));
  if (pressure < M.tippingMinimumPressure || dangerous.length < M.tippingMinimumTripwires || persistence < M.tippingMinimumPersistence) return 0;
  const deterioration = tripwires.reduce((sum, item) => sum + item.deteriorationContribution, 0);
  return Math.min(M.hazard.maximumBps, M.hazard.baseBps + Math.floor((pressure - M.tippingMinimumPressure) / M.hazard.pressureDivisor)
    + (persistence - M.tippingMinimumPersistence) * M.hazard.persistenceBps + dangerous.length * M.hazard.tripwireBps
    + Math.floor(deterioration / M.hazard.deteriorationDivisor));
}
