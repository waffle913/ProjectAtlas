import type { SimulationState } from '../../types';
import { crisisSeverityRank as severityRank, severityForPressure as severityFor, tripwireFlags, tripwirePersistence } from './derived';
import type { SchedulerTaskContext, SimulationScheduler } from '../scheduler';
import { CRISIS_MODEL as M, CRISIS_TYPES, crisisRngKey, initializeCrisisState, normalEpisode, type CrisisCountryState, type CrisisEpisode, type CrisisEpisodeSummary, type CrisisProvenance, type CrisisSeverity, type CrisisTripwire, type CrisisType, type TripwireDirection } from './model';

interface Indicator {
  name: string; value: number; direction: TripwireDirection; danger: number; recovery: number;
  sourceSystem: CrisisProvenance['sourceSystem']; provenance: CrisisProvenance; weightBps?: number;
}
interface CountryAggregates {
  labourForce: number; employed: number; baseEmployed: number; householdDemand: number; consumption: number;
  demand: number; shortage: number; essentialReference: number; essentialConsumption: number; output: number;
}

interface StressRatio { kind: 'stress'; value: number; basis: 'ratio' | 'zero_exposure' | 'zero_denominator_cap' }
type CoverageRatio = { kind: 'coverage'; value: number; basis: 'ratio' } | { kind: 'unavailable'; reason: 'zero_reference' };
const quantity = (value: number) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const positiveDenominatorRatioBps = (value: number, denominator: number) => {
  if (denominator <= 0) throw new Error('A positive denominator is required.');
  return Number((BigInt(quantity(value)) * 10_000n + BigInt(Math.floor(denominator / 2))) / BigInt(denominator));
};
const stressRatioBps = (value: number, denominator: number): StressRatio => denominator > 0
  ? { kind: 'stress', value: positiveDenominatorRatioBps(value, denominator), basis: 'ratio' }
  : value > 0
    ? { kind: 'stress', value: M.degenerateStressMaximumBps, basis: 'zero_denominator_cap' }
    : { kind: 'stress', value: 0, basis: 'zero_exposure' };
const coverageRatioBps = (value: number, denominator: number): CoverageRatio => denominator > 0
  ? { kind: 'coverage', value: positiveDenominatorRatioBps(value, denominator), basis: 'ratio' }
  : { kind: 'unavailable', reason: 'zero_reference' };
const observedBps = (value: number | null | undefined) => Number.isSafeInteger(value) && (value ?? -1) >= 0 ? value as number : undefined;
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const fiscalProvenance = (status: 'sourced' | 'modelled', detail: string): CrisisProvenance => ({ status, sourceSystem: 'fiscal-0.11-v2', detail });
const socioProvenance = (detail: string): CrisisProvenance => ({ status: 'derived', sourceSystem: 'socioeconomy-0.10-v1', detail });

function aggregateSocioeconomy(state: SimulationState) {
  const result = new Map<string, CountryAggregates>();
  for (const [regionId, region] of Object.entries(state.socioeconomy.regions)) {
    const countryId = state.regionOwnership[regionId];
    if (!countryId || !region.economy) continue;
    const prior = result.get(countryId) ?? { labourForce: 0, employed: 0, baseEmployed: 0, householdDemand: 0, consumption: 0, demand: 0, shortage: 0, essentialReference: 0, essentialConsumption: 0, output: 0 };
    const economy = region.economy;
    prior.labourForce += economy.labourForce; prior.employed += economy.employed; prior.baseEmployed += economy.baseEmployed;
    prior.householdDemand += economy.householdDemand; prior.consumption += economy.consumption; prior.demand += economy.demand;
    prior.shortage += economy.shortage; prior.essentialReference += sum(economy.essentialReferenceByGroup); prior.essentialConsumption += economy.essentialConsumption;
    prior.output += economy.output;
    result.set(countryId, prior);
  }
  return result;
}

const stressIndicator = (name: string, ratio: StressRatio, danger: number, recovery: number, sourceSystem: Indicator['sourceSystem'], provenance: CrisisProvenance): Indicator => ({
  name, value: ratio.value, direction: 'above', danger, recovery, sourceSystem,
  provenance: { ...provenance, detail: `${provenance.detail} Ratio basis: ${ratio.basis}.` },
});
const coverageIndicator = (name: string, ratio: CoverageRatio, danger: number, recovery: number, sourceSystem: Indicator['sourceSystem'], provenance: CrisisProvenance): Indicator[] => ratio.kind === 'unavailable' ? [] : [{
  name, value: ratio.value, direction: 'below', danger, recovery, sourceSystem,
  provenance: { ...provenance, detail: `${provenance.detail} Ratio basis: ${ratio.basis}.` },
}];
const observedIndicator = (name: string, value: number | null | undefined, direction: TripwireDirection, danger: number, recovery: number, sourceSystem: Indicator['sourceSystem'], provenance: CrisisProvenance): Indicator[] => {
  const observed = observedBps(value);
  return observed === undefined ? [] : [{ name, value: observed, direction, danger, recovery, sourceSystem, provenance }];
};

function indicators(state: SimulationState, countryId: string, type: CrisisType, aggregates: CountryAggregates | undefined): Indicator[] {
  const country = state.fiscal.countries[countryId], account = country?.account;
  const status = account?.stress.financingBaselineStatus ?? country?.revenueCalibration.status ?? 'modelled';
  const fiscal = (detail: string) => fiscalProvenance(status, detail);
  if (type === 'fiscal_stress') {
    if (!account) return [];
    const t = M.thresholds.fiscal;
    return [
      stressIndicator('unpaid_commitments_to_revenue', stressRatioBps(account.stress.unpaidCommitments, account.totalRevenue), t.unpaidCommitmentsBps[0], t.unpaidCommitmentsBps[1], 'fiscal-0.11-v2', fiscal('Simulated unpaid commitments divided by simulated total revenue.')),
      stressIndicator('interest_burden', stressRatioBps(account.interestPaid, account.totalRevenue), t.interestBurdenBps[0], t.interestBurdenBps[1], 'fiscal-0.11-v2', fiscal('Simulated interest paid divided by total revenue.')),
      stressIndicator('debt_to_annual_output', stressRatioBps(country.debt, (aggregates?.output ?? 0) * 12), t.debtToAnnualOutputBps[0], t.debtToAnnualOutputBps[1], 'fiscal-0.11-v2', fiscal('Simulated debt divided by annualized current output.')),
      stressIndicator('deficit_to_output', stressRatioBps(Math.max(0, account.totalSpending - account.totalRevenue), aggregates?.output ?? 0), t.deficitToOutputBps[0], t.deficitToOutputBps[1], 'fiscal-0.11-v2', fiscal('Simulated monthly deficit divided by current monthly output.')),
    ];
  }
  if (type === 'public_service_degradation') {
    if (!country || !account) return [];
    const t = M.thresholds.publicServices, serviceEntries = (['health', 'education'] as const).filter(name => country.services[name].status === 'modelled'), services = serviceEntries.map(name => country.services[name]);
    if (!services.length) return [];
    const required = sum(services.map(service => service.required)), spending = sum(services.map(service => service.spending)), backlog = sum(services.map(service => service.backlog));
    return [
      ...serviceEntries.flatMap(name => observedIndicator(`${name}_coverage`, country.services[name].coverageBps, 'below', t.coverageBps[0], t.coverageBps[1], 'fiscal-0.11-v2', fiscal(`Simulated ${name} service coverage.`))),
      stressIndicator('service_underfunding', stressRatioBps(Math.max(0, required - spending), required), t.underfundingBps[0], t.underfundingBps[1], 'fiscal-0.11-v2', fiscal('Health and education spending gap against simulated requirements.')),
      stressIndicator('service_backlog', stressRatioBps(backlog, required), t.backlogBps[0], t.backlogBps[1], 'fiscal-0.11-v2', fiscal('Accumulated health and education backlog against monthly requirements.')),
    ];
  }
  if (type === 'infrastructure_degradation') {
    if (!country || !account) return [];
    const t = M.thresholds.infrastructure, service = country.services.infrastructure;
    if (service.status !== 'modelled') return [];
    return [
      ...observedIndicator('infrastructure_coverage', service.coverageBps, 'below', t.coverageBps[0], t.coverageBps[1], 'fiscal-0.11-v2', fiscal('Simulated infrastructure service coverage.')),
      ...coverageIndicator('funded_capacity', coverageRatioBps(service.fundedCapacity, service.referencePopulation), t.fundedCapacityBps[0], t.fundedCapacityBps[1], 'fiscal-0.11-v2', fiscal('Funded infrastructure capacity against reference population capacity.')),
      ...coverageIndicator('executed_spending', coverageRatioBps(account.executed.infrastructure, service.required), t.executedSpendingBps[0], t.executedSpendingBps[1], 'fiscal-0.11-v2', fiscal('Executed infrastructure spending against simulated requirement.')),
      stressIndicator('infrastructure_backlog', stressRatioBps(service.backlog, service.required), t.backlogBps[0], t.backlogBps[1], 'fiscal-0.11-v2', fiscal('Accumulated infrastructure backlog against monthly requirement.')),
    ];
  }
  if (type === 'transfer_system_stress') {
    if (!country || !account) return [];
    const t = M.thresholds.transfers, pensionDue = account.appropriated.pensions + account.openingArrears.pensions, supportDue = account.appropriated.incomeSupport + account.openingArrears.incomeSupport;
    return [
      stressIndicator('pension_funding_gap', stressRatioBps(account.stress.pensionFundingGap, account.appropriated.pensions), t.fundingGapBps[0], t.fundingGapBps[1], 'fiscal-0.11-v2', fiscal('Pension appropriation not executed.')),
      stressIndicator('income_support_funding_gap', stressRatioBps(account.stress.incomeSupportFundingGap, account.appropriated.incomeSupport), t.fundingGapBps[0], t.fundingGapBps[1], 'fiscal-0.11-v2', fiscal('Income-support appropriation not executed.')),
      stressIndicator('transfer_arrears', stressRatioBps(account.arrears.pensions + account.arrears.incomeSupport, account.appropriated.pensions + account.appropriated.incomeSupport), t.arrearsBps[0], t.arrearsBps[1], 'fiscal-0.11-v2', fiscal('Pension and income-support arrears against current appropriations.')),
      ...coverageIndicator('transfer_execution', coverageRatioBps(account.executed.pensions + account.executed.incomeSupport, pensionDue + supportDue), t.executionBps[0], t.executionBps[1], 'fiscal-0.11-v2', fiscal('Executed transfers against current obligations including opening arrears.')),
    ];
  }
  if (!aggregates) return [];
  const t = M.thresholds.households;
  return [
    stressIndicator('unemployment', stressRatioBps(aggregates.labourForce - aggregates.employed, aggregates.labourForce), t.unemploymentBps[0], t.unemploymentBps[1], 'socioeconomy-0.10-v1', socioProvenance('Current unemployment divided by current labour force.')),
    stressIndicator('employment_deterioration', stressRatioBps(Math.max(0, aggregates.baseEmployed - aggregates.employed), aggregates.baseEmployed), t.employmentLossBps[0], t.employmentLossBps[1], 'socioeconomy-0.10-v1', socioProvenance('Employment loss against calibrated baseline employment.')),
    ...observedIndicator('disposable_income_decline', account?.stress.disposableIncomeDeclineBps, 'above', t.disposableIncomeDeclineBps[0], t.disposableIncomeDeclineBps[1], 'fiscal-0.11-v2', fiscal('Monthly decline in simulated household disposable income.')),
    ...coverageIndicator('basic_needs_coverage', coverageRatioBps(aggregates.essentialConsumption, aggregates.essentialReference), t.basicNeedsCoverageBps[0], t.basicNeedsCoverageBps[1], 'socioeconomy-0.10-v1', socioProvenance('Essential consumption divided by calibrated essential reference.')),
    stressIndicator('persistent_shortage', stressRatioBps(aggregates.shortage, aggregates.demand), t.shortageBps[0], t.shortageBps[1], 'socioeconomy-0.10-v1', socioProvenance('Unmet simulated demand divided by total demand.')),
    ...coverageIndicator('household_consumption_coverage', coverageRatioBps(aggregates.consumption, aggregates.householdDemand), t.consumptionCoverageBps[0], t.consumptionCoverageBps[1], 'socioeconomy-0.10-v1', socioProvenance('Realized household consumption divided by household demand.')),
  ];
}

function buildTripwire(countryId: string, type: CrisisType, indicator: Indicator, previous?: CrisisTripwire): CrisisTripwire {
  const { dangerous, recovered } = tripwireFlags(indicator.value, indicator.direction, indicator.danger, indicator.recovery);
  const span = Math.max(1, Math.abs(indicator.danger - indicator.recovery));
  const distance = indicator.direction === 'above' ? Math.max(0, indicator.value - indicator.recovery) : Math.max(0, indicator.recovery - indicator.value);
  const exceedanceBps = Math.min(30_000, positiveDenominatorRatioBps(distance, span));
  const persistenceMonths = dangerous ? (previous?.persistenceMonths ?? 0) + 1 : recovered ? 0 : previous?.persistenceMonths ?? 0;
  const recoveryMonths = recovered ? (previous?.recoveryMonths ?? 0) + 1 : 0;
  const severityContribution = Math.floor(exceedanceBps * (indicator.weightBps ?? 10_000) / 10_000);
  const persistenceContribution = tripwirePersistence(dangerous, persistenceMonths);
  const deteriorationContribution = Math.max(0, exceedanceBps - (previous?.exceedanceBps ?? exceedanceBps));
  return {
    id: `${type}:${indicator.name}`, crisisType: type, countryId, sourceSystem: indicator.sourceSystem,
    indicator: indicator.name, currentValue: indicator.value, unit: 'BASIS_POINTS', direction: indicator.direction,
    dangerThreshold: indicator.danger, recoveryThreshold: indicator.recovery, exceedanceBps, persistenceMonths, recoveryMonths,
    severityContribution, persistenceContribution, deteriorationContribution,
    pressureContribution: severityContribution + persistenceContribution + deteriorationContribution,
    dangerous, recovered, provenance: indicator.provenance,
  };
}

const maximumSeverity = (a: CrisisSeverity, b: CrisisSeverity) => severityRank[a] >= severityRank[b] ? a : b;
const dominant = (tripwires: CrisisTripwire[]) => [...tripwires].filter(item => item.pressureContribution > 0).sort((a, b) => b.pressureContribution - a.pressureContribution || a.id.localeCompare(b.id)).slice(0, 3).map(item => `${item.indicator}:${item.pressureContribution}`);
const recoveredDrivers = (tripwires: CrisisTripwire[]) => tripwires.filter(item => item.recovered).map(item => item.indicator).sort();

function archive(country: CrisisCountryState, episode: CrisisEpisode, date: string, nextOrdinal: number): CrisisCountryState {
  const summary: CrisisEpisodeSummary = {
    id: episode.id, type: episode.type, countryId: episode.countryId, episodeOrdinal: episode.episodeOrdinal,
    pressureStartedOn: episode.pressureStartedOn ?? date, activatedOn: episode.activatedOn, recoveringOn: episode.recoveringOn,
    endedOn: date, maximumSeverity: episode.maximumSeverity, maximumPressure: episode.maximumPressure,
    dominantDrivers: dominant(episode.activationSnapshot?.tripwires ?? episode.currentTripwires), resolutionDrivers: recoveredDrivers(episode.currentTripwires),
  };
  return {
    currentByType: { ...country.currentByType, [episode.type]: normalEpisode(episode.countryId, episode.type, nextOrdinal) },
    history: [...country.history, summary].slice(-M.historyLimitPerCountry),
  };
}

function evaluateEpisode(episode: CrisisEpisode, nextTripwires: CrisisTripwire[], date: string, roll: (key: string) => number): { episode: CrisisEpisode; ended: boolean } {
  const pressure = sum(nextTripwires.map(item => item.pressureContribution));
  const severity = severityFor(pressure), dangerous = nextTripwires.filter(item => item.dangerous);
  const improving = dangerous.length === 0 && pressure <= M.pressureRecoveryCeiling;
  let next: CrisisEpisode = {
    ...episode, currentPressure: pressure, maximumPressure: Math.max(episode.maximumPressure, pressure), severity, maximumSeverity: maximumSeverity(episode.maximumSeverity, severity),
    currentTripwires: nextTripwires, lastEvaluatedOn: date,
    explanation: dominant(nextTripwires), recoveryDrivers: improving ? recoveredDrivers(nextTripwires) : [],
  };
  if (episode.state === 'NORMAL') {
    if (!dangerous.length) return { episode: next, ended: false };
    next = { ...next, state: 'PRESSURE', pressureStartedOn: date, dangerousEvaluations: 1, recoveryEvaluations: 0 };
    return { episode: next, ended: false };
  }
  if (episode.state === 'PRESSURE') {
    if (improving) {
      const recoveryEvaluations = episode.recoveryEvaluations + 1;
      return { episode: { ...next, recoveryEvaluations }, ended: recoveryEvaluations >= M.pressureRecoveryEvaluations };
    }
    const dangerousEvaluations = dangerous.length ? episode.dangerousEvaluations + 1 : episode.dangerousEvaluations;
    next = { ...next, dangerousEvaluations, recoveryEvaluations: 0 };
    const persistence = Math.max(0, ...dangerous.map(item => item.persistenceMonths));
    if (pressure < M.tippingMinimumPressure || dangerous.length < M.tippingMinimumTripwires || persistence < M.tippingMinimumPersistence) return { episode: next, ended: false };
    const rngKey = crisisRngKey(episode.countryId, episode.type, date, episode.episodeOrdinal);
    const deterioration = sum(nextTripwires.map(item => item.deteriorationContribution));
    const chance = Math.min(M.hazard.maximumBps, M.hazard.baseBps + Math.floor((pressure - M.tippingMinimumPressure) / M.hazard.pressureDivisor) + (persistence - M.tippingMinimumPersistence) * M.hazard.persistenceBps + dangerous.length * M.hazard.tripwireBps + Math.floor(deterioration / M.hazard.deteriorationDivisor));
    const tippingRollBps = roll(rngKey);
    next = { ...next, lastTippingRngKey: rngKey };
    if (tippingRollBps >= chance) return { episode: next, ended: false };
    return { episode: { ...next, state: 'ACTIVE', activatedOn: date, activationRngKey: rngKey, activationSnapshot: { date, pressure, severity, tippingChanceBps: chance, tippingRollBps, tripwires: structuredClone(nextTripwires) }, explanation: [...dominant(nextTripwires), `tipping:${tippingRollBps}<${chance}`] }, ended: false };
  }
  if (episode.state === 'ACTIVE') {
    if (!improving) return { episode: { ...next, recoveryEvaluations: 0 }, ended: false };
    const recoveryEvaluations = episode.recoveryEvaluations + 1;
    if (recoveryEvaluations < M.activeRecoveryEvaluations) return { episode: { ...next, recoveryEvaluations }, ended: false };
    return { episode: { ...next, state: 'RECOVERING', recoveringOn: date, recoveryEvaluations: 0 }, ended: false };
  }
  if (!improving) return { episode: { ...next, state: 'ACTIVE', recoveryEvaluations: 0 }, ended: false };
  const recoveryEvaluations = episode.recoveryEvaluations + 1;
  return { episode: { ...next, recoveryEvaluations }, ended: recoveryEvaluations >= M.recoveringResolutionEvaluations };
}

export function runCrisisMonth(state: SimulationState, context: SchedulerTaskContext): SimulationState {
  let crisis = initializeCrisisState(state.crisis, Object.keys(state.engine.fidelityByCountry), state.date);
  if (crisis.lastMonthlyDate === state.date) return crisis === state.crisis ? state : { ...state, crisis };
  const aggregates = aggregateSocioeconomy(state), countries: Record<string, CrisisCountryState> = { ...crisis.countries };
  for (const countryId of Object.keys(countries).sort()) {
    let country = countries[countryId];
    for (const type of CRISIS_TYPES) {
      const episode = country.currentByType[type];
      const priorById = new Map(episode.currentTripwires.map(item => [item.id, item]));
      const tripwires = indicators(state, countryId, type, aggregates.get(countryId)).map(item => buildTripwire(countryId, type, item, priorById.get(`${type}:${item.name}`)));
      const evaluated = evaluateEpisode(episode, tripwires, state.date, key => context.random.integer(0, 10_000, { entityId: key }));
      if (evaluated.ended) country = archive(country, evaluated.episode, state.date, episode.episodeOrdinal + 1);
      else country = { ...country, currentByType: { ...country.currentByType, [type]: evaluated.episode } };
    }
    countries[countryId] = country;
  }
  crisis = { ...crisis, countries, lastMonthlyDate: state.date, evaluations: crisis.evaluations + Object.keys(countries).length * CRISIS_TYPES.length };
  return { ...state, crisis };
}

export const registerCrisisTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'crisis.monthly', cadence: 'monthly', priority: M.schedulerPriority, run: runCrisisMonth });

export function inspectCrises(state: SimulationState, countryId: string) {
  const country = state.crisis.countries[countryId];
  if (!country) return undefined;
  return structuredClone({ date: state.date, countryId, model: M.version, assumptions: M, monitored: CRISIS_TYPES.map(type => country.currentByType[type]), history: country.history });
}
