import type { SimulationState } from '../../types';
import legalData from '../../data/fiscal-rules.json';
import { allocate, INCOMES, integer, MODEL, ratio, type SocioRegion } from '../socioeconomy/model';
import { collected, consumptionCollected, consumptionLiability, netGoodsBudget, payrollMonthly, progressiveMonthly, sum, validatePolicy, dateValid } from './math';
import { CATEGORIES, FISCAL_MODEL as M, TAXES, emptyFiscal, zeroBudget, type Budget, type FiscalCountry, type FiscalReform, type Policy, type RegionFiscal, type Service, type TaxFlow, type TaxRule } from './model';
import type { SimulationScheduler } from '../scheduler';
const kinds = ['personal', 'consumption', 'payroll', 'corporate'] as const;
const taxKind = (category: typeof TAXES[number]) => category === 'employee' || category === 'employer' ? 'payroll' : category;
const flows = (policy: Policy): Record<typeof TAXES[number], TaxFlow> => Object.fromEntries(TAXES.map(k => [k, { base: 0, liability: 0, collected: 0, status: policy[taxKind(k)]?.status ?? 'unavailable' }])) as Record<typeof TAXES[number], TaxFlow>;
const groupPersons = (r: SocioRegion) => INCOMES.map(i => sum(r.cohorts.filter(c => c.income === i).map(c => c.persons)));
const monthlyBudget = (annual: Budget, date: string): Budget => Object.fromEntries(CATEGORIES.map(k => [k, Math.floor(annual[k] / 12) + (Number(date.slice(5, 7)) <= annual[k] % 12 ? 1 : 0)])) as Budget;
const budgetSum = (b: Budget) => sum(CATEGORIES.map(k => b[k]));
export function validateBudget(b: Budget) { for (const k of CATEGORIES) integer(b[k]); }
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
    fiscal.countries[id] = { policy, policyHistory: [{ date: state.date, policy }], annualBudget, cash: budgetSum(monthly) * M.initialCashMonths,
      debt: 0, interestRateBps: M.interestRateBps, debtLimit: ratio(output, M.debtLimitAnnualOutputBps * 12, 10000), monthlyBorrowingLimit: ratio(output, M.borrowingMonthlyOutputBps, 10000),
      arrears: zeroBudget(), interestArrears: 0, services,
      initialization: { status: 'modelled', date: state.date, economicCoverage: !ids.length ? 'unavailable' : ids.length === totalRegions.get(id) ? 'complete' : 'partial', output,
        method: 'fiscal-0.11-v1; current saved economy; no reconstructed history; 2026 law held fixed until explicit reform (not a prediction of subsequent real law)' } };
    for (const rid of ids) fiscal.regions[rid] = taxRegion(state.socioeconomy.regions[rid], id, policy);
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
    const revenue = sum(TAXES.map(k => taxes[k].collected));
    const appropriated = monthlyBudget(c.annualBudget, state.date);
    const obligations = CATEGORIES.map(k => appropriated[k] + c.arrears[k]);
    const interestDue = ratio(c.debt, c.interestRateBps, 120000);
    const interestObligation = interestDue + c.interestArrears;
    const financingNeed = Math.max(0, sum(obligations) + interestObligation - revenue - c.cash);
    const borrowed = Math.min(financingNeed, c.monthlyBorrowingLimit, Math.max(0, c.debtLimit - c.debt));
    const resources = integer(c.cash + revenue + borrowed);
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
      account: { unit: 'USD_NOMINAL', period: 'MONTH', policyApplied: c.policy, collectionEfficiencyBps: M.collectionBps, date: state.date, taxes, revenue, appropriated, executed, interestDue, interestPaid, totalSpending,
        primaryBalance: revenue - sum(allocations), overallBalance: revenue - totalSpending,
        openingCash: c.cash, closingCash: cash, openingDebt: c.debt, closingDebt: debt, financingNeed, borrowed, repaid,
        arrears, openingArrears: c.arrears, openingInterestArrears: c.interestArrears, interestArrears: interestObligation - interestPaid,
        transferPaid: executed.pensions + executed.incomeSupport,
        stress: { unpaidCommitments: budgetSum(arrears) + interestObligation - interestPaid, interestBurdenBps: revenue ? ratio(interestPaid, 10000, revenue) : null, debtToAnnualOutputBps: output ? ratio(debt, 10000, output * 12) : null,
          deficitToOutputBps: output ? ratio(Math.max(0, totalSpending - revenue), 10000, output) : null,
          pensionFundingGap: Math.max(0, appropriated.pensions - executed.pensions), incomeSupportFundingGap: Math.max(0, appropriated.incomeSupport - executed.incomeSupport),
          serviceUnderfunding: sum(Object.values(services).map(s => Math.max(0, s.required - s.spending))), infrastructureBacklog: services.infrastructure.backlog,
          disposableIncomeDeclineBps: oldDisposable ? ratio(Math.max(0, oldDisposable - disposable), 10000, oldDisposable) : null } } };
  }
  return { ...state, fiscal: { ...f, countries, regions, lastMonthlyDate: state.date } };
}
export function scheduleFiscalReform(state: SimulationState, input: Omit<FiscalReform, 'sequence'>): SimulationState {
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
  const reform = { ...structuredClone(input), sequence: state.fiscal.nextSequence };
  return applyReforms({ ...state, fiscal: { ...state.fiscal, nextSequence: reform.sequence + 1, reforms: [...state.fiscal.reforms, reform].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.sequence - b.sequence) } });
}
function applyReforms(state: SimulationState): SimulationState {
  if (!state.fiscal.reforms.length || state.fiscal.reforms[0].effectiveDate > state.date) return state;
  const countries = { ...state.fiscal.countries };
  for (const r of state.fiscal.reforms.filter(r => r.effectiveDate <= state.date)) {
    const c = countries[r.countryId];
    countries[r.countryId] = { ...c, policy: r.policy ?? c.policy, annualBudget: r.annualBudget ?? c.annualBudget,
      policyHistory: r.policy ? [...c.policyHistory, { date: r.effectiveDate, policy: r.policy }] : c.policyHistory };
  }
  return { ...state, fiscal: { ...state.fiscal, countries, reforms: state.fiscal.reforms.filter(r => r.effectiveDate > state.date) } };
}
export const registerFiscalTasks = (scheduler: SimulationScheduler) => scheduler
  .register({ id: 'fiscal.reforms', cadence: 'daily', priority: 50, run: applyReforms })
  .register({ id: 'fiscal.monthly', cadence: 'monthly', priority: 150, run: runFiscalMonth });
export const inspectFiscal = (state: SimulationState, countryId: string) => structuredClone({ date: state.date, countryId, assumptions: M, country: state.fiscal.countries[countryId], queued: state.fiscal.reforms.filter(r => r.countryId === countryId), revenueScope: 'known-component subtotal; unavailable categories are not zero-rate laws' });
