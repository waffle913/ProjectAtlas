import { integer, ratio } from '../socioeconomy/model';
import { FISCAL_MODEL, type Band, type PayrollComponent, type Policy, type TaxRule } from './model';
import { isSimulationDate } from '../date';
export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
export const dateValid = isSimulationDate;
export function validateRule(r: TaxRule, countryId: string, date: string) {
  if (!dateValid(r.effectiveDate) || r.effectiveDate > date || r.countryId !== countryId) throw new Error('Invalid or future fiscal rule.');
  if (!['sourced', 'partial', 'modelled'].includes(r.status) || !r.id || !r.document || !r.source || !r.limitations || !dateValid(r.referenceDate) || !dateValid(r.retrievedAt)) throw new Error('Missing rule provenance.');
  if (r.currency !== 'USD' && (r.bands || r.employee || r.employer || r.allowance !== undefined)) throw new Error('Local monetary thresholds require sourced FX; unsupported.');
  if (r.allowance !== undefined) integer(r.allowance);
  const rate = (n: number | undefined) => { if (n === undefined || !Number.isSafeInteger(n) || n < 0 || n > 10000) throw new Error('Invalid tax rate.'); };
  if (r.kind === 'personal') {
    if (!r.bands?.length || r.bands[0].lower !== 0) throw new Error('Tax bands must start at zero.');
    r.bands.forEach((b, i) => { integer(b.lower); rate(b.rateBps); if (i && b.lower <= r.bands![i - 1].lower) throw new Error('Tax bands must increase.'); });
  } else if (r.kind === 'payroll') {
    if (!r.employee || !r.employer) throw new Error('Missing payroll components.');
    for (const c of [...r.employee, ...r.employer]) { rate(c.rateBps); if (c.cap !== undefined) integer(c.cap); if (c.threshold !== undefined) integer(c.threshold); if (c.cap !== undefined && c.cap < (c.threshold ?? 0)) throw new Error('Payroll cap below threshold.'); }
    if (sum(r.employee.map(c => c.rateBps)) > 10000 || sum(r.employer.map(c => c.rateBps)) > 10000) throw new Error('Combined payroll rate exceeds base.');
  } else if (r.kind === 'consumption' || r.kind === 'corporate') rate(r.rateBps);
  else throw new Error('Unsupported tax base.');
}
export function validatePolicy(policy: Policy, countryId: string, date: string) {
  for (const kind of ['personal', 'consumption', 'payroll', 'corporate'] as const) {
    const r = policy[kind]; if (r === undefined) throw new Error('Unknown tax must be explicit null.');
    if (r) { if (r.kind !== kind) throw new Error('Wrong policy category.'); validateRule(r, countryId, date); }
  }
}
/** Aggregate representative-person marginal schedule; BigInt avoids rounding each person's income. */
export function progressiveMonthly(gross: number, persons: number, bands: readonly Band[], allowance = 0): number {
  integer(gross); integer(persons); integer(allowance);
  if (!persons) { if (gross) throw new Error('Income without recipients.'); return 0; }
  const people = BigInt(persons);
  const taxable = BigInt(gross) * 12n - BigInt(allowance) * people;
  if (taxable <= 0n) return 0;
  let liability = 0n;
  for (let i = 0; i < bands.length; i++) {
    const lower = BigInt(bands[i].lower) * people;
    const upper = i + 1 < bands.length ? BigInt(bands[i + 1].lower) * people : taxable;
    const end = upper < taxable ? upper : taxable;
    if (end > lower) liability += (end - lower) * BigInt(bands[i].rateBps);
  }
  return integer(Number((liability + 60000n) / 120000n));
}
export const progressiveTax = (annualIncome: number, bands: readonly Band[], allowance = 0) => {
  // Same calculation in annual units, with exact threshold handling and one final rounding.
  integer(annualIncome); integer(allowance);
  const taxable = Math.max(0, annualIncome - allowance);
  let numerator = 0n;
  bands.forEach((b, i) => { const width = Math.max(0, Math.min(taxable, bands[i + 1]?.lower ?? taxable) - b.lower); numerator += BigInt(width) * BigInt(b.rateBps); });
  return integer(Number((numerator + 5000n) / 10000n));
};
export function payrollMonthly(gross: number, workers: number, components: PayrollComponent[]): number {
  if (!workers) return 0;
  integer(gross); integer(workers);
  let amount = 0n;
  for (const c of components) {
    const annual = BigInt(gross) * 12n, count = BigInt(workers);
    const ceiling = c.cap === undefined ? annual : BigInt(c.cap) * count;
    const width = (annual < ceiling ? annual : ceiling) - BigInt(c.threshold ?? 0) * count;
    if (width > 0n) amount += width * BigInt(c.rateBps);
  }
  return integer(Number((amount + 60000n) / 120000n));
}
export const collected = (liability: number) => ratio(liability, FISCAL_MODEL.collectionBps, 10000);
export const consumptionLiability = (netGoods: number, rule: TaxRule | null) => rule ? ratio(ratio(netGoods, FISCAL_MODEL.taxableConsumptionBps, 10000), rule.rateBps!, 10000) : 0;
export const consumptionCollected = (netGoods: number, rule: TaxRule | null) => collected(consumptionLiability(netGoods, rule));
/** Largest integer goods purchase affordable after the collected consumption wedge, including rounding. */
export function netGoodsBudget(grossBudget: number, rule: TaxRule | null): number {
  integer(grossBudget); if (!rule || !rule.rateBps) return grossBudget;
  let low = 0, high = grossBudget;
  while (low < high) { const mid = low + Math.ceil((high - low) / 2); if (mid + consumptionCollected(mid, rule) <= grossBudget) low = mid; else high = mid - 1; }
  return low;
}
