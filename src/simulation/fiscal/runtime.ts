import type { SimulationState } from '../../types';
import legalData from '../../data/fiscal-rules.json';
import aggregateData from '../../data/fiscal-aggregates.json';
import { allocate, INCOMES, integer, MODEL, ratio, type SocioRegion } from '../socioeconomy/model';
import { collected, consumptionCollected, consumptionLiability, netGoodsBudget, payrollMonthly, progressiveMonthly, sum, validatePolicy, dateValid } from './math';
import { CATEGORIES, FISCAL_MODEL as M, TAXES, emptyFiscal, zeroBudget, type Budget, type FiscalCountry, type FiscalReform, type FiscalState, type Policy, type RegionFiscal, type Service, type TaxFlow, type TaxRule } from './model';
import type { SimulationScheduler } from '../scheduler';
import { deterministicFingerprint } from '../fingerprint';
const kinds = ['personal', 'consumption', 'payroll', 'corporate'] as const;
const taxKind = (category: typeof TAXES[number]) => category === 'employee' || category === 'employer' ? 'payroll' : category;
const flows = (policy: Policy): Record<typeof TAXES[number], TaxFlow> => Object.fromEntries(TAXES.map(k => [k, { base: 0, liability: 0, collected: 0, status: policy[taxKind(k)]?.status ?? 'unavailable' }])) as Record<typeof TAXES[number], TaxFlow>;
const groupPersons = (r: SocioRegion) => INCOMES.map(i => sum(r.cohorts.filter(c => c.income === i).map(c => c.persons)));
const monthlyBudget = (annual: Budget, date: string): Budget => Object.fromEntries(CATEGORIES.map(k => [k, Math.floor(annual[k] / 12) + (Number(date.slice(5, 7)) <= annual[k] % 12 ? 1 : 0)])) as Budget;
const budgetSum = (b: Budget) => sum(CATEGORIES.map(k => b[k]));
interface AggregateObservation {
  countryId: string; referenceDate: string; retrievedAt: string; source: string; dataset: string;
  annualRevenueUsd?: number; debtUsd?: number; limitations: string;
}
export function validateBudget(b: Budget) { for (const k of CATEGORIES) integer(b[k]); }

/** Deterministic in-schema upgrade for saves written by the initial 0.11 release. */
export function upgradeFiscalStateV1(fiscal: unknown, date: string): FiscalState {
  const prior = fiscal as { version?: string; countries?: Record<string, FiscalCountry & { account?: FiscalCountry['account'] & { revenue?: number } }> } & Omit<FiscalState, 'version' | 'countries'>;
  if (prior.version === 'fiscal-0.11-v2') { const current = fiscal as FiscalState; return current.reformReceipts ? current : { ...current, reformReceipts: [] }; }
  if (prior.version !== 'fiscal-0.11-v1' || !prior.countries) throw new Error('Malformed fiscal model.');
  const countries = Object.fromEntries(Object.entries(prior.countries).map(([id, c]) => {
    const oldAccount = c.account;
    const knownTaxRevenue = oldAccount?.revenue ?? (oldAccount ? sum(TAXES.map(k => oldAccount.taxes[k].collected)) : 0);
    const referenceAppropriation = oldAccount ? budgetSum(oldAccount.appropriated) : budgetSum(monthlyBudget(c.annualBudget, date));
    const otherRevenue = Math.max(0, referenceAppropriation - knownTaxRevenue);
    const revenueCalibration = { status: 'modelled' as const, monthlyAmount: otherRevenue, referenceDate: date, dataset: 'fiscal-0.11-v1-save-upgrade',
      method: 'One-time deterministic residual from saved monthly appropriations and saved known-tax revenue.',
      limitation: 'Legacy 0.11 save contained no aggregate-revenue baseline; this modelled value is fixed after migration and is not an observation.' };
    const debtInitialization = { status: 'modelled' as const, amount: oldAccount?.openingDebt ?? c.debt, referenceDate: date, dataset: 'fiscal-0.11-v1-save-upgrade',
      method: 'Opening debt carried from the legacy fiscal save at upgrade.',
      limitation: 'Legacy 0.11 debt had no source provenance; it must not be interpreted as observed sovereign debt.' };
    // The v1 account was booked without residual revenue. Keep its stocks but do not
    // reinterpret that flawed last-period ledger as if the new revenue had existed.
    return [id, { ...c, revenueCalibration, debtInitialization, account: undefined }];
  }));
  return { ...prior, version: 'fiscal-0.11-v2', countries, reformReceipts: [] } as FiscalState;
}
function taxRegion(r: SocioRegion, owner: string, policy: Policy, previous?: RegionFiscal): RegionFiscal {
  const e = r.economy!;
  const persons = groupPersons(r);
  const workers = allocate(e.employed, persons);
  const wage = e.incomeByGroup.map((v, i) => workers[i] ? ratio(v, M.wageIncomeBps, 10000) : 0);
  const personalLiability = e.incomeByGroup.map((v, i) => policy.personal ? progressiveMonthly(v, persons[i], policy.personal.bands!, policy.personal.allowance) : 0);
  const employeeLiability = wage.map((v, i) => policy.payroll ? payrollMonthly(v, workers[i], policy.payroll.employee!) : 0);
  const employerLiability = wage.map((v, i) => policy.payroll ? payrollMonthly(v, workers[i], policy.payroll.employer!) : 0);
  const personal = personalLiability.map(collected);
  const employee = employeeLiability.map((v, i) => Math.min(collected(v), e.incomeByGroup[i] - personal[i]));
  const employer = employerLiability.map(collected);
  const businessSurplus = ratio(Math.max(0, e.output - e.householdIncome - sum(employer)), M.surplusBps, 10000);
  const corporation = policy.corporate ? ratio(businessSurplus, policy.corporate.rateBps!, 10000) : 0;
  const vatLiability = e.consumptionByGroup.map(v => consumptionLiability(v, policy.consumption));
  const consumptionTax = vatLiability.map(collected);
  const taxes = flows(policy);
  taxes.personal = { ...taxes.personal, base: sum(e.incomeByGroup.map((v, i) => Math.max(0, v - ratio(policy.personal?.allowance ?? 0, persons[i], 12)))), liability: sum(personalLiability), collected: sum(personal) };
  taxes.employee = { ...taxes.employee, base: sum(wage), liability: sum(employeeLiability), collected: sum(employee) };
  taxes.employer = { ...taxes.employer, base: sum(wage), liability: sum(employerLiability), collected: sum(employer) };
  taxes.consumption = { ...taxes.consumption, base: sum(e.consumptionByGroup.map(v => ratio(v, M.taxableConsumptionBps, 10000))), liability: sum(vatLiability), collected: sum(consumptionTax) };
  taxes.corporate = { ...taxes.corporate, base: businessSurplus, liability: corporation, collected: collected(corporation) };
  return { owner, taxes, grossIncome: [...e.incomeByGroup], personal, employee, transfers: [0, 0, 0],
    disposable: e.incomeByGroup.map((v, i) => v - personal[i] - employee[i]),
    netConsumption: [...e.consumptionByGroup], consumptionTax, grossExpenditure: e.consumptionByGroup.map((v, i) => v + consumptionTax[i]),
    businessSurplus, retainedBusinessSurplus: businessSurplus - taxes.corporate.collected, labourCost: sum(wage) + sum(employer),
    privateResidual: previous?.privateResidual ?? e.otherDemandResidual, publicOrders: previous?.publicOrders ?? 0 };
}
export function evolveService(s: Service, population: number, spending: number): Service {
  if (!s.referencePopulation || !s.referenceMonthlyCost) return { ...s, status: 'unavailable', spending, fundedCapacity: 0, coverageBps: null };
  const required = s.referencePopulation ? ratio(s.referenceMonthlyCost, population, s.referencePopulation) : 0;
  const fundedCapacity = s.referenceMonthlyCost ? Math.min(population * 2, ratio(spending, s.referencePopulation, s.referenceMonthlyCost)) : population;
  const target = Math.min(population, fundedCapacity);
  const distance = Math.abs(target - s.capacity);
  const adjustment = distance ? Math.max(1, Math.floor(distance / M.serviceAdjustmentMonths)) : 0;
  const capacity = s.capacity + Math.sign(target - s.capacity) * adjustment;
  return { ...s, required, spending, fundedCapacity, capacity, coverageBps: population ? Math.min(10000, ratio(capacity, 10000, population)) : 10000,
    backlog: integer(Math.max(0, s.backlog + required - spending)) };
}
function distribute(state: SimulationState, ids: string[], regions: Record<string, RegionFiscal>, spending: Budget) {
  if (!ids.length) { if (budgetSum(spending)) throw new Error('Cannot execute budget without an economic recipient.'); return; }
  const people = ids.flatMap(id => groupPersons(state.socioeconomy.regions[id]));
  const pensionWeights = people.map(n => ratio(n, M.pensionRecipientBps, 10000));
  // Small populations may round every recipient to zero; fractional representative pensioners use person weights.
  const pensions = allocate(spending.pensions, sum(pensionWeights) ? pensionWeights : people);
  const supportWeights = ids.flatMap(id => { const r = state.socioeconomy.regions[id]; return [groupPersons(r)[0] + r.economy!.unemployed, 0, 0]; });
  const support = allocate(spending.incomeSupport, sum(supportWeights) ? supportWeights : people);
  const procurement = spending.health + spending.education + spending.infrastructure + spending.administration;
  const publicOrders = allocate(procurement, ids.map(id => state.socioeconomy.regions[id].population ?? 0));
  ids.forEach((id, n) => {
    const r = regions[id];
    r.transfers = r.transfers.map((_, i) => pensions[n * 3 + i] + support[n * 3 + i]);
    r.disposable = r.disposable.map((v, i) => integer(v + r.transfers[i]));
    r.publicOrders = publicOrders[n];
  });
}
function ownedEconomies(state: SimulationState): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const id of Object.keys(state.socioeconomy.regions).sort()) {
    const owner = state.regionOwnership[id];
    if (!owner || !state.socioeconomy.regions[id].economy) continue;
    const ids = grouped.get(owner) ?? []; ids.push(id); grouped.set(owner, ids);
  }
  return grouped;
}

export interface ImmediateFiscalPolicyCounterfactual {
  countryId: string; regionCount: number;
  currentKnownRevenue: number; proposedKnownRevenue: number;
  currentDisposableByIncome: number[]; proposedDisposableByIncome: number[];
  currentTransfersByIncome: number[]; proposedTransfersByIncome: number[];
  currentDirectTaxByIncome: number[]; proposedDirectTaxByIncome: number[];
  currentConsumptionTaxByIncome: number[]; proposedConsumptionTaxByIncome: number[];
  currentEmployerPayroll: number; proposedEmployerPayroll: number;
  currentCorporateTax: number; proposedCorporateTax: number;
  currentRevenueByCategory: Record<typeof TAXES[number], number>; proposedRevenueByCategory: Record<typeof TAXES[number], number>;
  categoryCoverage: Record<typeof TAXES[number], 'complete' | 'unavailable'>;
}

/** Pure, current-period counterfactual using the existing 0.11 tax calculators for one Country only. */
export function evaluateImmediateFiscalPolicyCounterfactual(state: SimulationState, countryId: string, policy: Policy, evaluationDate = state.date): ImmediateFiscalPolicyCounterfactual {
  const country = state.fiscal.countries[countryId]; if (!country) throw new Error('Unknown fiscal Country.');
  validatePolicy(policy, countryId, evaluationDate);
  const regionIds = Object.keys(state.socioeconomy.regions).filter(id => state.regionOwnership[id] === countryId && state.socioeconomy.regions[id].economy).sort();
  const currentDisposableByIncome = [0, 0, 0], proposedDisposableByIncome = [0, 0, 0], currentTransfersByIncome = [0, 0, 0], proposedTransfersByIncome = [0, 0, 0], currentDirectTaxByIncome = [0, 0, 0], proposedDirectTaxByIncome = [0, 0, 0], currentConsumptionTaxByIncome = [0, 0, 0], proposedConsumptionTaxByIncome = [0, 0, 0];
  let currentKnownRevenue = 0, proposedKnownRevenue = 0, currentEmployerPayroll = 0, proposedEmployerPayroll = 0, currentCorporateTax = 0, proposedCorporateTax = 0;
  const currentRevenueByCategory = Object.fromEntries(TAXES.map(category => [category, 0])) as Record<typeof TAXES[number], number>, proposedRevenueByCategory = { ...currentRevenueByCategory };
  for (const regionId of regionIds) {
    const current = state.fiscal.regions[regionId] ?? taxRegion(state.socioeconomy.regions[regionId], countryId, country.policy), proposedTaxOnly = taxRegion(state.socioeconomy.regions[regionId], countryId, policy, current);
    // The counterfactual changes tax rules only. Existing transfers and public
    // orders are held constant so an unrelated reform cannot silently remove
    // pensions, income support or public procurement from household income.
    const proposed = { ...proposedTaxOnly, grossIncome: [...current.grossIncome], transfers: [...current.transfers], disposable: current.disposable.map((value, index) => integer(value - (proposedTaxOnly.personal[index] - current.personal[index]) - (proposedTaxOnly.employee[index] - current.employee[index]))), privateResidual: current.privateResidual, publicOrders: current.publicOrders };
    currentKnownRevenue += sum(TAXES.map(key => current.taxes[key].collected)); proposedKnownRevenue += sum(TAXES.map(key => proposed.taxes[key].collected));
    for (const category of TAXES) { currentRevenueByCategory[category] += current.taxes[category].collected; proposedRevenueByCategory[category] += proposed.taxes[category].collected; }
    for (let index = 0; index < 3; index++) { currentDisposableByIncome[index] += current.disposable[index]; proposedDisposableByIncome[index] += proposed.disposable[index]; currentTransfersByIncome[index] += current.transfers[index]; proposedTransfersByIncome[index] += proposed.transfers[index]; currentDirectTaxByIncome[index] += current.personal[index] + current.employee[index]; proposedDirectTaxByIncome[index] += proposed.personal[index] + proposed.employee[index]; currentConsumptionTaxByIncome[index] += current.consumptionTax[index]; proposedConsumptionTaxByIncome[index] += proposed.consumptionTax[index]; }
    currentEmployerPayroll += current.taxes.employer.collected; proposedEmployerPayroll += proposed.taxes.employer.collected; currentCorporateTax += current.taxes.corporate.collected; proposedCorporateTax += proposed.taxes.corporate.collected;
  }
  const categoryCoverage = Object.fromEntries(TAXES.map(category => [category, country.policy[taxKind(category)] === null ? 'unavailable' : 'complete'])) as ImmediateFiscalPolicyCounterfactual['categoryCoverage'];
  return { countryId, regionCount: regionIds.length, currentKnownRevenue, proposedKnownRevenue, currentDisposableByIncome, proposedDisposableByIncome, currentTransfersByIncome, proposedTransfersByIncome, currentDirectTaxByIncome, proposedDirectTaxByIncome, currentConsumptionTaxByIncome, proposedConsumptionTaxByIncome, currentEmployerPayroll, proposedEmployerPayroll, currentCorporateTax, proposedCorporateTax, currentRevenueByCategory, proposedRevenueByCategory, categoryCoverage };
}
export function initializeFiscal(state: SimulationState): SimulationState {
  if (state.fiscal.initializedOn || !state.socioeconomy.initializedOn) return state;
  if (state.date < legalData.scenarioDate) throw new Error('Fiscal dataset begins on 2026-01-01.');
  const fiscal = { ...emptyFiscal(), initializedOn: state.date };
  const grouped = ownedEconomies(state);
  const totalRegions = new Map<string, number>();
  for (const owner of Object.values(state.regionOwnership)) if (owner) totalRegions.set(owner, (totalRegions.get(owner) ?? 0) + 1);
  for (const id of Object.keys(state.engine.fidelityByCountry).sort()) {
    const policy = Object.fromEntries(kinds.map(kind => [kind, structuredClone(legalData.rules.find(r => r.countryId === id && r.kind === kind) ?? null)])) as Policy;
    validatePolicy(policy, id, state.date);
    const ids = grouped.get(id) ?? [];
    const output = sum(ids.map(r => state.socioeconomy.regions[r].economy!.output));
    const population = sum(ids.map(r => state.socioeconomy.regions[r].population ?? 0));
    const annualBudget = Object.fromEntries(CATEGORIES.map(k => [k, ratio(output, M.budgetOutputBps[k] * 12, 10000)])) as Budget;
    const monthly = monthlyBudget(annualBudget, state.date);
    const services = Object.fromEntries((['health', 'education', 'infrastructure'] as const).map(k => [k, { status: population && monthly[k] ? 'modelled' : 'unavailable', referencePopulation: population, referenceMonthlyCost: monthly[k], required: monthly[k], spending: 0, fundedCapacity: population, capacity: population, coverageBps: population && monthly[k] ? 10000 : null, backlog: 0 }])) as FiscalCountry['services'];
    const initialRegions = Object.fromEntries(ids.map(rid => [rid, taxRegion(state.socioeconomy.regions[rid], id, policy)]));
    const initialKnownTaxRevenue = sum(Object.values(initialRegions).flatMap(region => TAXES.map(k => region.taxes[k].collected)));
    const aggregate = (aggregateData.records as AggregateObservation[]).find(record => record.countryId === id && record.referenceDate <= state.date);
    const observedMonthlyRevenue = aggregate?.annualRevenueUsd === undefined ? undefined : ratio(aggregate.annualRevenueUsd, 1, 12);
    const openingDebt = aggregate?.debtUsd ?? 0;
    const initialInterest = ratio(openingDebt, M.interestRateBps, 120000);
    const baselineResidualRevenue = Math.max(0, (observedMonthlyRevenue ?? budgetSum(monthly) + initialInterest) - initialKnownTaxRevenue);
    fiscal.countries[id] = { policy, policyHistory: [{ date: state.date, policy }], annualBudget, cash: budgetSum(monthly) * M.initialCashMonths,
      debt: openingDebt, interestRateBps: M.interestRateBps, debtLimit: Math.max(openingDebt, ratio(output, M.debtLimitAnnualOutputBps * 12, 10000)), monthlyBorrowingLimit: ratio(output, M.borrowingMonthlyOutputBps, 10000),
      arrears: zeroBudget(), interestArrears: 0, services,
      revenueCalibration: aggregate?.annualRevenueUsd !== undefined
        ? { status: 'sourced', monthlyAmount: baselineResidualRevenue, referenceDate: aggregate.referenceDate, dataset: aggregate.dataset, source: aggregate.source,
          method: 'Fixed residual equals sourced aggregate monthly revenue minus simulated known-tax revenue at initialization, floored at zero.', limitation: aggregate.limitations }
        : { status: 'modelled', monthlyAmount: baselineResidualRevenue, referenceDate: state.date, dataset: 'fiscal-0.11-baseline-financing-v1',
          method: 'Fixed residual equals initial monthly appropriations minus simulated known-tax revenue, floored at zero.',
          limitation: 'Not an observed tax rate or revenue total; prevents legal-data gaps alone from creating structural deficits. Never recalibrated after reforms.' },
      debtInitialization: aggregate?.debtUsd !== undefined
        ? { status: 'sourced', amount: openingDebt, referenceDate: aggregate.referenceDate, dataset: aggregate.dataset, source: aggregate.source,
          method: 'Opening national debt stock from the accepted aggregate observation.', limitation: aggregate.limitations }
        : { status: 'modelled', amount: 0, referenceDate: state.date, dataset: 'fiscal-0.11-debt-initialization-v1',
          method: 'Explicit zero opening stock required by the sandbox financing model.',
          limitation: 'Modelled initialization, not an observation of real sovereign debt.' },
      initialization: { status: 'modelled', date: state.date, economicCoverage: !ids.length ? 'unavailable' : ids.length === totalRegions.get(id) ? 'complete' : 'partial', output,
        method: 'fiscal-0.11-v1; current saved economy; no reconstructed history; 2026 law held fixed until explicit reform (not a prediction of subsequent real law)' } };
    Object.assign(fiscal.regions, initialRegions);
    distribute(state, ids, fiscal.regions, monthly);
    // Calibrate private closure once. Do not rewrite any schema-8 economic quantity or book a fictitious fiscal month.
    for (const rid of ids) {
      const r = fiscal.regions[rid], e = state.socioeconomy.regions[rid].economy!;
      const requests = r.disposable.map((v, i) => netGoodsBudget(ratio(v, MODEL.consumptionBps[i], 10000), policy.consumption));
      r.privateResidual = Math.max(0, e.output - sum(requests) - r.publicOrders);
    }
  }
  return { ...state, fiscal };
}
export function fiscalDemand(state: SimulationState, regionId: string): { householdRequests: number[]; otherDemand: number } | undefined {
  const r = state.fiscal.regions[regionId], owner = state.regionOwnership[regionId];
  const country = owner ? state.fiscal.countries[owner] : undefined;
  if (!r || !country) return undefined;
  return { householdRequests: r.disposable.map((v, i) => netGoodsBudget(ratio(v, MODEL.consumptionBps[i], 10000), country.policy.consumption)), otherDemand: r.privateResidual + r.publicOrders };
}
export function runFiscalMonth(state: SimulationState): SimulationState {
  const f = state.fiscal;
  if (!f.initializedOn || f.lastMonthlyDate === state.date) return state;
  const grouped = ownedEconomies(state), regions: Record<string, RegionFiscal> = {}, countries: Record<string, FiscalCountry> = {};
  for (const [id, c] of Object.entries(f.countries)) {
    const ids = grouped.get(id) ?? [];
    const taxes = flows(c.policy);
    for (const rid of ids) {
      const r = taxRegion(state.socioeconomy.regions[rid], id, c.policy, f.regions[rid]); regions[rid] = r;
      for (const k of TAXES) { taxes[k].base += r.taxes[k].base; taxes[k].liability += r.taxes[k].liability; taxes[k].collected += r.taxes[k].collected; }
    }
    const knownTaxRevenue = sum(TAXES.map(k => taxes[k].collected));
    const otherRevenue = c.revenueCalibration.monthlyAmount;
    const totalRevenue = integer(knownTaxRevenue + otherRevenue);
    const appropriated = monthlyBudget(c.annualBudget, state.date);
    const obligations = CATEGORIES.map(k => appropriated[k] + c.arrears[k]);
    const interestDue = ratio(c.debt, c.interestRateBps, 120000);
    const interestObligation = interestDue + c.interestArrears;
    const financingNeed = Math.max(0, sum(obligations) + interestObligation - totalRevenue - c.cash);
    const borrowed = Math.min(financingNeed, c.monthlyBorrowingLimit, Math.max(0, c.debtLimit - c.debt));
    const resources = integer(c.cash + totalRevenue + borrowed);
    const interestPaid = Math.min(resources, interestObligation);
    const allocations = allocate(ids.length ? Math.min(resources - interestPaid, sum(obligations)) : 0, obligations);
    const executed = Object.fromEntries(CATEGORIES.map((k, i) => [k, allocations[i]])) as Budget;
    const arrears = Object.fromEntries(CATEGORIES.map((k, i) => [k, obligations[i] - allocations[i]])) as Budget;
    const totalSpending = sum(allocations) + interestPaid;
    const repaid = Math.min(resources - totalSpending, c.debt + borrowed);
    const cash = integer(resources - totalSpending - repaid), debt = integer(c.debt + borrowed - repaid);
    const population = sum(ids.map(r => state.socioeconomy.regions[r].population ?? 0));
    const services = { health: evolveService(c.services.health, population, executed.health), education: evolveService(c.services.education, population, executed.education), infrastructure: evolveService(c.services.infrastructure, population, executed.infrastructure) };
    distribute(state, ids, regions, executed);
    const output = sum(ids.map(r => state.socioeconomy.regions[r].economy!.output));
    const oldDisposable = sum(ids.map(r => sum(f.regions[r]?.disposable ?? [])));
    const disposable = sum(ids.map(r => sum(regions[r].disposable)));
    countries[id] = { ...c, cash, debt, arrears, interestArrears: interestObligation - interestPaid, services,
      account: { unit: 'USD_NOMINAL', period: 'MONTH', policyApplied: c.policy, collectionEfficiencyBps: M.collectionBps, date: state.date, taxes,
        knownTaxRevenue, otherRevenue, totalRevenue, appropriated, executed, interestDue, interestPaid, totalSpending,
        primaryBalance: totalRevenue - sum(allocations), overallBalance: totalRevenue - totalSpending,
        openingCash: c.cash, closingCash: cash, openingDebt: c.debt, closingDebt: debt, financingNeed, borrowed, repaid,
        arrears, openingArrears: c.arrears, openingInterestArrears: c.interestArrears, interestArrears: interestObligation - interestPaid,
        transferPaid: executed.pensions + executed.incomeSupport,
        stress: { financingBaselineStatus: c.revenueCalibration.status, unpaidCommitments: budgetSum(arrears) + interestObligation - interestPaid, interestBurdenBps: totalRevenue ? ratio(interestPaid, 10000, totalRevenue) : null, debtToAnnualOutputBps: output ? ratio(debt, 10000, output * 12) : null,
          deficitToOutputBps: output ? ratio(Math.max(0, totalSpending - totalRevenue), 10000, output) : null,
          pensionFundingGap: Math.max(0, appropriated.pensions - executed.pensions), incomeSupportFundingGap: Math.max(0, appropriated.incomeSupport - executed.incomeSupport),
          serviceUnderfunding: sum(Object.values(services).map(s => Math.max(0, s.required - s.spending))), infrastructureBacklog: services.infrastructure.backlog,
          disposableIncomeDeclineBps: oldDisposable ? ratio(Math.max(0, oldDisposable - disposable), 10000, oldDisposable) : null } } };
  }
  return { ...state, fiscal: { ...f, countries, regions, lastMonthlyDate: state.date } };
}
export function validateFiscalReform(state: SimulationState, input: Omit<FiscalReform, 'sequence'>) {
  if (!state.fiscal.initializedOn || !state.fiscal.countries[input.countryId]) throw new Error('Unknown fiscal Country.');
  if (!dateValid(input.effectiveDate) || input.effectiveDate < state.date) throw new Error('Fiscal reform cannot be retroactive.');
  if (!input.policy && !input.annualBudget) throw new Error('Empty reform.');
  if (input.policy) {
    validatePolicy(input.policy, input.countryId, input.effectiveDate);
    for (const rule of Object.values(input.policy)) if (rule && rule.status !== 'modelled') {
      const original = legalData.rules.find(r => r.id === rule.id);
      if (!original || JSON.stringify(original) !== JSON.stringify(rule)) throw new Error('Edited legal rules must be explicitly modelled.');
    }
  }
  if (input.annualBudget) validateBudget(input.annualBudget);
}
export const fiscalReformFingerprint = (input: Pick<FiscalReform, 'countryId' | 'effectiveDate' | 'policy' | 'annualBudget'>) => deterministicFingerprint({ countryId: input.countryId, effectiveDate: input.effectiveDate, policy: input.policy, annualBudget: input.annualBudget });
export function scheduleFiscalReform(state: SimulationState, input: Omit<FiscalReform, 'sequence'>): SimulationState {
  validateFiscalReform(state, input);
  const reform = { ...structuredClone(input), sequence: state.fiscal.nextSequence };
  return applyReforms({ ...state, fiscal: { ...state.fiscal, nextSequence: reform.sequence + 1, reforms: [...state.fiscal.reforms, reform].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.sequence - b.sequence) } });
}
function applyReforms(state: SimulationState): SimulationState {
  if (!state.fiscal.reforms.length || state.fiscal.reforms[0].effectiveDate > state.date) return state;
  const countries = { ...state.fiscal.countries };
  const applied = state.fiscal.reforms.filter(r => r.effectiveDate <= state.date), receipts = [...state.fiscal.reformReceipts];
  for (const r of applied) {
    const c = countries[r.countryId];
    countries[r.countryId] = { ...c, policy: r.policy ?? c.policy, annualBudget: r.annualBudget ?? c.annualBudget,
      policyHistory: r.policy ? [...c.policyHistory, { date: r.effectiveDate, policy: r.policy }] : c.policyHistory };
    receipts.push({ sequence: r.sequence, countryId: r.countryId, effectiveDate: r.effectiveDate, reformFingerprint: fiscalReformFingerprint(r), origin: r.origin, recordedBy: 'runtime' });
  }
  return { ...state, fiscal: { ...state.fiscal, countries, reforms: state.fiscal.reforms.filter(r => r.effectiveDate > state.date), reformReceipts: receipts } };
}
export const registerFiscalTasks = (scheduler: SimulationScheduler) => scheduler
  .register({ id: 'fiscal.reforms', cadence: 'daily', priority: 50, run: applyReforms })
  .register({ id: 'fiscal.monthly', cadence: 'monthly', priority: 150, run: runFiscalMonth });
export const inspectFiscal = (state: SimulationState, countryId: string) => structuredClone({ date: state.date, countryId, assumptions: M, country: state.fiscal.countries[countryId], queued: state.fiscal.reforms.filter(r => r.countryId === countryId), revenueScope: 'knownTaxRevenue contains simulated documented categories; otherRevenue is a fixed sourced/modelled aggregate calibration; unavailable categories are not zero-rate laws' });
