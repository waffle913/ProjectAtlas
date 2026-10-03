import type { SimulationState } from '../../types';
import { allocate, INCOMES, integer, ratio } from '../socioeconomy/model';
import { collected, payrollMonthly, progressiveMonthly, sum } from './math';
import { TAXES, type Policy, type TaxFlow } from './model';

export interface MilitaryPayslip {
  regionId: string; gross: number[]; personal: number[]; employee: number[]; employer: number[];
}
export interface MilitaryPayroll {
  gross: number; employerCost: number; withheldRevenue: number;
  taxes: Record<typeof TAXES[number], TaxFlow>; slips: MilitaryPayslip[];
}
/** The paying employer's national law applies in this V1 employment-jurisdiction abstraction. */
export function quoteMilitaryPayroll(state: SimulationState, countryId: string, gross: number, policyOverride?: Policy): MilitaryPayroll {
  integer(gross);
  const c = state.military.countries[countryId]?.capability, policy: Policy | undefined = policyOverride ?? state.fiscal.countries[countryId]?.policy;
  if (!c || !policy) throw new Error('Cannot quote military wages without capability and national tax policy.');
  const ids = Object.keys(c.assignments).sort();
  const weights = ids.map(id => c.assignments[id]);
  const grossByRegion = allocate(gross, sum(weights) ? weights : ids.map(id => state.socioeconomy.regions[id]?.population ?? 0));
  const taxes = Object.fromEntries(TAXES.map(k => [k, { base: 0, liability: 0, collected: 0, status: policy[k === 'employee' || k === 'employer' ? 'payroll' : k]?.status ?? 'unavailable' }])) as Record<typeof TAXES[number], TaxFlow>;
  const slips = ids.map((regionId, index) => {
    const region = state.socioeconomy.regions[regionId], e = region?.economy;
    if (!e) throw new Error('Military wage recipient has no existing economy/cohorts.');
    const persons = INCOMES.map(group => sum(region.cohorts.filter(cohort => cohort.income === group).map(cohort => cohort.persons)));
    const wages = allocate(grossByRegion[index], persons);
    const workers = allocate(c.assignments[regionId] || (grossByRegion[index] ? Math.min(sum(persons), Math.max(1, Math.ceil(grossByRegion[index] / c.parameters.monthlySalaryUsd))) : 0), persons);
    const personalLiability = wages.map((wage, i) => policy.personal
      ? progressiveMonthly(integer(e.incomeByGroup[i] + wage), persons[i], policy.personal.bands!, policy.personal.allowance)
        - progressiveMonthly(e.incomeByGroup[i], persons[i], policy.personal.bands!, policy.personal.allowance) : 0);
    const employeeLiability = wages.map((wage, i) => policy.payroll ? payrollMonthly(wage, workers[i], policy.payroll.employee!) : 0);
    const employerLiability = wages.map((wage, i) => policy.payroll ? payrollMonthly(wage, workers[i], policy.payroll.employer!) : 0);
    const personal = personalLiability.map((v, i) => Math.min(wages[i], collected(v)));
    const employee = employeeLiability.map((v, i) => Math.min(wages[i] - personal[i], collected(v)));
    const employer = employerLiability.map(collected);
    for (let i = 0; i < 3; i++) {
      const allowance = ratio(policy.personal?.allowance ?? 0, persons[i], 12);
      taxes.personal.base = integer(taxes.personal.base + Math.max(0, e.incomeByGroup[i] + wages[i] - allowance) - Math.max(0, e.incomeByGroup[i] - allowance));
    }
    for (const [key, liability, paid] of [['personal', personalLiability, personal], ['employee', employeeLiability, employee], ['employer', employerLiability, employer]] as const) {
      if (key !== 'personal') taxes[key].base = integer(taxes[key].base + sum(wages));
      taxes[key].liability = integer(taxes[key].liability + sum(liability));
      taxes[key].collected = integer(taxes[key].collected + sum(paid));
    }
    return { regionId, gross: wages, personal, employee, employer };
  });
  return { gross, employerCost: taxes.employer.collected, withheldRevenue: sum(TAXES.map(k => taxes[k].collected)), taxes, slips };
}
export function affordableMilitaryGross(state: SimulationState, countryId: string, payrollAllocation: number, grossDue: number) {
  let low = 0, high = Math.min(payrollAllocation, grossDue);
  while (low < high) {
    const middle = low + Math.ceil((high - low) / 2);
    const quote = quoteMilitaryPayroll(state, countryId, middle);
    if (integer(middle + quote.employerCost) <= payrollAllocation) low = middle; else high = middle - 1;
  }
  return quoteMilitaryPayroll(state, countryId, low);
}
