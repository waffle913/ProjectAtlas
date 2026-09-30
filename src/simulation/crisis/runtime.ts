import type { SimulationState } from '../../types';
import type { SchedulerTaskContext, SimulationScheduler } from '../scheduler';
import { CRISIS_MODEL as M, CRISIS_TYPES, crisisRngKey, initializeCrisisState, normalEpisode, type CrisisCountryState, type CrisisEpisode, type CrisisEpisodeSummary, type CrisisProvenance, type CrisisSeverity, type CrisisTripwire, type CrisisType, type TripwireDirection } from './model';

interface Indicator {
  name: string; value: number; direction: TripwireDirection; danger: number; recovery: number;
  sourceSystem: CrisisProvenance['sourceSystem']; provenance: CrisisProvenance; weightBps?: number;
}
interface CountryAggregates {
  labourForce: number; employed: number; baseEmployed: number; householdDemand: number; consumption: number;
  demand: number; shortage: number; essentialReference: number; essentialConsumption: number;
}

const finite = (value: number | null | undefined) => Number.isSafeInteger(value) && (value ?? -1) >= 0 ? value as number : 0;
const ratioBps = (value: number, denominator: number) => denominator > 0 ? Number((BigInt(finite(value)) * 10_000n + BigInt(Math.floor(denominator / 2))) / BigInt(denominator)) : 0;
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const fiscalProvenance = (status: 'sourced' | 'modelled', detail: string): CrisisProvenance => ({ status, sourceSystem: 'fiscal-0.11-v2', detail });
const socioProvenance = (detail: string): CrisisProvenance => ({ status: 'derived', sourceSystem: 'socioeconomy-0.10-v1', detail });

function aggregateSocioeconomy(state: SimulationState) {
  const result = new Map<string, CountryAggregates>();
  for (const [regionId, region] of Object.entries(state.socioeconomy.regions)) {
    const countryId = state.regionOwnership[regionId];
    if (!countryId || !region.economy) continue;
    const prior = result.get(countryId) ?? { labourForce: 0, employed: 0, baseEmployed: 0, householdDemand: 0, consumption: 0, demand: 0, shortage: 0, essentialReference: 0, essentialConsumption: 0 };
    const economy = region.economy;
    prior.labourForce += economy.labourForce; prior.employed += economy.employed; prior.baseEmployed += economy.baseEmployed;
    prior.householdDemand += economy.householdDemand; prior.consumption += economy.consumption; prior.demand += economy.demand;
    prior.shortage += economy.shortage; prior.essentialReference += sum(economy.essentialReferenceByGroup); prior.essentialConsumption += economy.essentialConsumption;
    result.set(countryId, prior);
  }
  return result;
}

function indicators(state: SimulationState, countryId: string, type: CrisisType, aggregates: CountryAggregates | undefined): Indicator[] {
  const country = state.fiscal.countries[countryId], account = country?.account;
  const status = account?.stress.financingBaselineStatus ?? country?.revenueCalibration.status ?? 'modelled';
  const fiscal = (detail: string) => fiscalProvenance(status, detail);
  if (type === 'fiscal_stress') {
    if (!account) return [];
    const t = M.thresholds.fiscal;
    return [
      { name: 'unpaid_commitments_to_revenue', value: ratioBps(account.stress.unpaidCommitments, account.totalRevenue), direction: 'above', danger: t.unpaidCommitmentsBps[0], recovery: t.unpaidCommitmentsBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Simulated unpaid commitments divided by simulated total revenue.') },
      { name: 'interest_burden', value: finite(account.stress.interestBurdenBps), direction: 'above', danger: t.interestBurdenBps[0], recovery: t.interestBurdenBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Simulated interest paid divided by total revenue.') },
      { name: 'debt_to_annual_output', value: finite(account.stress.debtToAnnualOutputBps), direction: 'above', danger: t.debtToAnnualOutputBps[0], recovery: t.debtToAnnualOutputBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Simulated debt divided by annualized current output.') },
      { name: 'deficit_to_output', value: finite(account.stress.deficitToOutputBps), direction: 'above', danger: t.deficitToOutputBps[0], recovery: t.deficitToOutputBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Simulated monthly deficit divided by current monthly output.') },
    ];
  }
  if (type === 'public_service_degradation') {
    if (!country || !account) return [];
    const t = M.thresholds.publicServices, serviceEntries = (['health', 'education'] as const).filter(name => country.services[name].status === 'modelled'), services = serviceEntries.map(name => country.services[name]);
    if (!services.length) return [];
    const required = sum(services.map(service => service.required)), spending = sum(services.map(service => service.spending)), backlog = sum(services.map(service => service.backlog));
    return [
      ...serviceEntries.map(name => ({ name: `${name}_coverage`, value: finite(country.services[name].coverageBps), direction: 'below' as const, danger: t.coverageBps[0], recovery: t.coverageBps[1], sourceSystem: 'fiscal-0.11-v2' as const, provenance: fiscal(`Simulated ${name} service coverage.`) })),
      { name: 'service_underfunding', value: ratioBps(Math.max(0, required - spending), required), direction: 'above', danger: t.underfundingBps[0], recovery: t.underfundingBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Health and education spending gap against simulated requirements.') },
      { name: 'service_backlog', value: ratioBps(backlog, required), direction: 'above', danger: t.backlogBps[0], recovery: t.backlogBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Accumulated health and education backlog against monthly requirements.') },
    ];
  }
  if (type === 'infrastructure_degradation') {
    if (!country || !account) return [];
    const t = M.thresholds.infrastructure, service = country.services.infrastructure;
    if (service.status !== 'modelled') return [];
    return [
      { name: 'infrastructure_coverage', value: finite(service.coverageBps), direction: 'below', danger: t.coverageBps[0], recovery: t.coverageBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Simulated infrastructure service coverage.') },
      { name: 'funded_capacity', value: service.referencePopulation ? ratioBps(service.fundedCapacity, service.referencePopulation) : 10_000, direction: 'below', danger: t.fundedCapacityBps[0], recovery: t.fundedCapacityBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Funded infrastructure capacity against reference population capacity.') },
      { name: 'executed_spending', value: ratioBps(account.executed.infrastructure, Math.max(1, service.required)), direction: 'below', danger: t.executedSpendingBps[0], recovery: t.executedSpendingBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Executed infrastructure spending against simulated requirement.') },
      { name: 'infrastructure_backlog', value: ratioBps(service.backlog, Math.max(1, service.required)), direction: 'above', danger: t.backlogBps[0], recovery: t.backlogBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Accumulated infrastructure backlog against monthly requirement.') },
    ];
  }
  if (type === 'transfer_system_stress') {
    if (!country || !account) return [];
    const t = M.thresholds.transfers, pensionDue = account.appropriated.pensions + account.openingArrears.pensions, supportDue = account.appropriated.incomeSupport + account.openingArrears.incomeSupport;
    return [
      { name: 'pension_funding_gap', value: ratioBps(account.stress.pensionFundingGap, Math.max(1, account.appropriated.pensions)), direction: 'above', danger: t.fundingGapBps[0], recovery: t.fundingGapBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Pension appropriation not executed.') },
      { name: 'income_support_funding_gap', value: ratioBps(account.stress.incomeSupportFundingGap, Math.max(1, account.appropriated.incomeSupport)), direction: 'above', danger: t.fundingGapBps[0], recovery: t.fundingGapBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Income-support appropriation not executed.') },
      { name: 'transfer_arrears', value: ratioBps(account.arrears.pensions + account.arrears.incomeSupport, Math.max(1, account.appropriated.pensions + account.appropriated.incomeSupport)), direction: 'above', danger: t.arrearsBps[0], recovery: t.arrearsBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Pension and income-support arrears against current appropriations.') },
      { name: 'transfer_execution', value: pensionDue + supportDue ? ratioBps(account.executed.pensions + account.executed.incomeSupport, pensionDue + supportDue) : 10_000, direction: 'below', danger: t.executionBps[0], recovery: t.executionBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Executed transfers against current obligations including opening arrears.') },
    ];
  }
  if (!aggregates) return [];
  const t = M.thresholds.households;
  return [
    { name: 'unemployment', value: ratioBps(aggregates.labourForce - aggregates.employed, aggregates.labourForce), direction: 'above', danger: t.unemploymentBps[0], recovery: t.unemploymentBps[1], sourceSystem: 'socioeconomy-0.10-v1', provenance: socioProvenance('Current unemployment divided by current labour force.') },
    { name: 'employment_deterioration', value: ratioBps(Math.max(0, aggregates.baseEmployed - aggregates.employed), aggregates.baseEmployed), direction: 'above', danger: t.employmentLossBps[0], recovery: t.employmentLossBps[1], sourceSystem: 'socioeconomy-0.10-v1', provenance: socioProvenance('Employment loss against calibrated baseline employment.') },
    { name: 'disposable_income_decline', value: finite(account?.stress.disposableIncomeDeclineBps), direction: 'above', danger: t.disposableIncomeDeclineBps[0], recovery: t.disposableIncomeDeclineBps[1], sourceSystem: 'fiscal-0.11-v2', provenance: fiscal('Monthly decline in simulated household disposable income.') },
    { name: 'basic_needs_coverage', value: ratioBps(aggregates.essentialConsumption, aggregates.essentialReference), direction: 'below', danger: t.basicNeedsCoverageBps[0], recovery: t.basicNeedsCoverageBps[1], sourceSystem: 'socioeconomy-0.10-v1', provenance: socioProvenance('Essential consumption divided by calibrated essential reference.') },
    { name: 'persistent_shortage', value: ratioBps(aggregates.shortage, aggregates.demand), direction: 'above', danger: t.shortageBps[0], recovery: t.shortageBps[1], sourceSystem: 'socioeconomy-0.10-v1', provenance: socioProvenance('Unmet simulated demand divided by total demand.') },
    { name: 'household_consumption_coverage', value: ratioBps(aggregates.consumption, aggregates.householdDemand), direction: 'below', danger: t.consumptionCoverageBps[0], recovery: t.consumptionCoverageBps[1], sourceSystem: 'socioeconomy-0.10-v1', provenance: socioProvenance('Realized household consumption divided by household demand.') },
  ];
}

function buildTripwire(countryId: string, type: CrisisType, indicator: Indicator, previous?: CrisisTripwire): CrisisTripwire {
  const dangerous = indicator.direction === 'above' ? indicator.value >= indicator.danger : indicator.value <= indicator.danger;
  const recovered = indicator.direction === 'above' ? indicator.value <= indicator.recovery : indicator.value >= indicator.recovery;
  const span = Math.max(1, Math.abs(indicator.danger - indicator.recovery));
  const distance = indicator.direction === 'above' ? Math.max(0, indicator.value - indicator.recovery) : Math.max(0, indicator.recovery - indicator.value);
  const exceedanceBps = Math.min(30_000, ratioBps(distance, span));
  const persistenceMonths = dangerous ? (previous?.persistenceMonths ?? 0) + 1 : recovered ? 0 : previous?.persistenceMonths ?? 0;
  const recoveryMonths = recovered ? (previous?.recoveryMonths ?? 0) + 1 : 0;
  const severityContribution = Math.floor(exceedanceBps * (indicator.weightBps ?? 10_000) / 10_000);
  const persistenceContribution = dangerous ? Math.min(M.tripwirePersistenceMaximumBps, persistenceMonths * M.tripwirePersistenceBpsPerMonth) : 0;
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

const severityRank: Record<CrisisSeverity, number> = { none: 0, low: 1, moderate: 2, severe: 3, critical: 4 };
const severityFor = (pressure: number): CrisisSeverity => pressure <= 0 ? 'none' : pressure < M.severity.moderate ? 'low' : pressure < M.severity.severe ? 'moderate' : pressure < M.severity.critical ? 'severe' : 'critical';
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
