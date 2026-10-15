/**
 * 0.25.9 — Budget, fiscalité et services publics.
 *
 * Pure, read-only derivation over the single canonical fiscal engine (0.11).
 * It connects the 0.25 economic transactions — wage income, business surplus,
 * household consumption and imported consumption — to the tax liabilities those
 * transactions generate when a legal rule exists, and reconciles them against
 * the canonical `fiscal.regions[regionId].taxes` ledger.
 *
 * This module is a VIEW, never a second budget tracker or revenue engine:
 *
 * - it reuses the shared fiscal tax math (`progressiveMonthly`, `payrollMonthly`,
 *   `consumptionLiability`, `collected`) and the Country's current `policy`;
 * - `unavailable != 0`: a missing rule is never a zero rate — the transaction
 *   base is still reported and only the liability is zero, with status
 *   `unavailable`;
 * - observed `knownTaxRevenue`, modelled/other revenue, spending and debt stay
 *   distinct: this module reports transaction bases and liabilities and never
 *   rewrites revenue, spending or debt;
 * - no double fiscal counting: the derived liabilities must reconcile exactly
 *   with the canonical ledger, and the `reconciled` flag exposes the result.
 *
 * The formulas mirror `taxRegion` in `src/simulation/fiscal/runtime.ts` (the
 * canonical tax engine); a reconciliation test pins the two together so they
 * cannot silently diverge.
 */

import type { SimulationState } from '../../types';
import { allocate, INCOMES, ratio } from '../socioeconomy/model';
import { collected, consumptionLiability, payrollMonthly, progressiveMonthly, sum } from '../fiscal/math';
import { FISCAL_MODEL as M, TAXES, type Policy, type TaxCategory, type TaxFlow, type TaxKind } from '../fiscal/model';

const taxKind = (category: TaxCategory): TaxKind =>
  category === 'employee' || category === 'employer' ? 'payroll' : category;

const flows = (policy: Policy): Record<TaxCategory, TaxFlow> =>
  Object.fromEntries(TAXES.map(k => [k, {
    base: 0,
    liability: 0,
    collected: 0,
    status: policy[taxKind(k)]?.status ?? 'unavailable',
  }])) as Record<TaxCategory, TaxFlow>;

const groupPersons = (state: SimulationState, regionId: string): number[] =>
  INCOMES.map(income => sum(state.socioeconomy.regions[regionId].cohorts.filter(c => c.income === income).map(c => c.persons)));

export interface RegionTaxDerivation {
  regionId: string;
  /** Per-category tax flows derived from the Region's economic transactions. */
  taxes: Record<TaxCategory, TaxFlow>;
  /** Transaction bases (USD/month) behind the liabilities. */
  wageBillUsd: number;
  businessSurplusUsd: number;
  taxableConsumptionUsd: number;
  importedConsumptionUsd: number;
  /** Derived liabilities vs the canonical fiscal ledger (no double counting). */
  reconciled: 'reconciled' | 'fiscal_not_yet_run' | 'mismatch';
}

/**
 * Derive the Region's tax liabilities from its economic transactions under the
 * owning Country's current tax policy. Mirrors the canonical fiscal `taxRegion`
 * computation; returns `undefined` when the Region has no economy or the owner
 * has no fiscal Country.
 */
export function regionTaxDerivation(state: SimulationState, regionId: string, owner: string): RegionTaxDerivation | undefined {
  const economy = state.socioeconomy.regions[regionId]?.economy;
  const country = state.fiscal.countries[owner];
  if (!economy || !country) return undefined;
  const policy = country.policy;
  const persons = groupPersons(state, regionId);
  const workers = allocate(economy.employed, persons);
  const wage = economy.incomeByGroup.map((v, i) => workers[i] ? ratio(v, M.wageIncomeBps, 10000) : 0);
  const wageBillUsd = sum(wage);
  const personalLiability = economy.incomeByGroup.map((v, i) =>
    policy.personal ? progressiveMonthly(v, persons[i], policy.personal.bands!, policy.personal.allowance) : 0);
  const employeeLiability = wage.map((v, i) => policy.payroll ? payrollMonthly(v, workers[i], policy.payroll.employee!) : 0);
  const employerLiability = wage.map((v, i) => policy.payroll ? payrollMonthly(v, workers[i], policy.payroll.employer!) : 0);
  const personal = personalLiability.map(collected);
  const employee = employeeLiability.map((v, i) => Math.min(collected(v), economy.incomeByGroup[i] - personal[i]));
  const employer = employerLiability.map(collected);
  const businessSurplusUsd = ratio(Math.max(0, economy.output - economy.householdIncome - sum(employer)), M.surplusBps, 10000);
  const corporation = policy.corporate ? ratio(businessSurplusUsd, policy.corporate.rateBps!, 10000) : 0;
  const domesticVat = economy.consumptionByGroup.map(v => consumptionLiability(v, policy.consumption));
  const imported = economy.importedConsumptionByGroup ?? [];
  const taxes = flows(policy);
  taxes.personal = {
    ...taxes.personal,
    base: sum(economy.incomeByGroup.map((v, i) => Math.max(0, v - ratio(policy.personal?.allowance ?? 0, persons[i], 12)))),
    liability: sum(personalLiability),
    collected: sum(personal),
  };
  taxes.employee = { ...taxes.employee, base: wageBillUsd, liability: sum(employeeLiability), collected: sum(employee) };
  taxes.employer = { ...taxes.employer, base: wageBillUsd, liability: sum(employerLiability), collected: sum(employer) };
  const importedConsumptionUsd = sum(imported);
  taxes.consumption = {
    ...taxes.consumption,
    base: sum(economy.consumptionByGroup.map(v => ratio(v, M.taxableConsumptionBps, 10000)))
      + sum(imported.map(v => ratio(v, M.taxableConsumptionBps, 10000))),
    liability: sum(domesticVat) + sum(imported.map(v => consumptionLiability(v, policy.consumption))),
    collected: sum(domesticVat.map(collected)) + sum(imported.map(v => collected(consumptionLiability(v, policy.consumption)))),
  };
  taxes.corporate = { ...taxes.corporate, base: businessSurplusUsd, liability: corporation, collected: collected(corporation) };
  const ledger = state.fiscal.regions[regionId]?.taxes;
  const reconciled = !ledger
    ? 'fiscal_not_yet_run'
    : TAXES.every(k => ledger[k].base === taxes[k].base && ledger[k].liability === taxes[k].liability && ledger[k].collected === taxes[k].collected)
      ? 'reconciled'
      : 'mismatch';
  return {
    regionId,
    taxes,
    wageBillUsd,
    businessSurplusUsd,
    taxableConsumptionUsd: sum(economy.consumptionByGroup.map(v => ratio(v, M.taxableConsumptionBps, 10000))),
    importedConsumptionUsd,
    reconciled,
  };
}

export interface CountryFiscalDerivation {
  countryId: string;
  regions: RegionTaxDerivation[];
  /** Aggregated per-category tax flows across the Country's sovereign Regions. */
  taxes: Record<TaxCategory, TaxFlow>;
  /** Sum of collected liabilities across the five documented tax categories.
   *  Excludes customs/tariff revenue, which the trade engine books separately. */
  derivedKnownTaxRevenueUsd: number;
  /** Canonical ledger values, present once the fiscal month has been booked. */
  ledgerKnownTaxRevenueUsd?: number;
  ledgerOtherRevenueUsd?: number;
  ledgerTotalRevenueUsd?: number;
  ledgerSpendingUsd?: number;
  ledgerDebtUsd?: number;
  reconciled: 'reconciled' | 'fiscal_not_yet_run' | 'mismatch';
  note: string;
}

/** Aggregate the Country's sovereign Regions into a single derived fiscal view. */
export function countryFiscalDerivation(state: SimulationState, countryId: string): CountryFiscalDerivation | undefined {
  const country = state.fiscal.countries[countryId];
  if (!country) return undefined;
  const regionIds = Object.keys(state.socioeconomy.regions)
    .filter(id => state.regionOwnership[id] === countryId && state.socioeconomy.regions[id].economy)
    .sort();
  const regions = regionIds
    .map(id => regionTaxDerivation(state, id, countryId)!)
    .filter((r): r is RegionTaxDerivation => r !== undefined);
  const taxes = flows(country.policy);
  for (const region of regions) {
    for (const k of TAXES) {
      taxes[k].base += region.taxes[k].base;
      taxes[k].liability += region.taxes[k].liability;
      taxes[k].collected += region.taxes[k].collected;
    }
  }
  const derivedKnownTaxRevenueUsd = sum(TAXES.map(k => taxes[k].collected));
  const account = country.account;
  const regionReconciled = regions.every(r => r.reconciled === 'reconciled');
  const noLedger = regions.every(r => r.reconciled === 'fiscal_not_yet_run');
  let reconciled: CountryFiscalDerivation['reconciled'];
  if (!regionReconciled && !noLedger) reconciled = 'mismatch';
  else if (noLedger) reconciled = 'fiscal_not_yet_run';
  else if (account && TAXES.some(k => account.taxes[k].base !== taxes[k].base || account.taxes[k].liability !== taxes[k].liability || account.taxes[k].collected !== taxes[k].collected)) {
    // Military-payroll tax is folded into account.taxes but excluded from this transaction view.
    reconciled = 'mismatch';
  } else reconciled = 'reconciled';
  return {
    countryId,
    regions,
    taxes,
    derivedKnownTaxRevenueUsd,
    ...(account ? {
      ledgerKnownTaxRevenueUsd: account.knownTaxRevenue,
      ledgerOtherRevenueUsd: account.otherRevenue,
      ledgerTotalRevenueUsd: account.totalRevenue,
      ledgerSpendingUsd: account.totalSpending,
      ledgerDebtUsd: account.closingDebt,
    } : {}),
    reconciled,
    note: 'Derived tax liabilities from the 0.25 economic transactions under the current legal rules, reconciled against the single canonical fiscal ledger (no double counting). Observed knownTaxRevenue, modelled/other revenue, spending and debt remain distinct; customs/tariff revenue (trade engine) and military-payroll tax (fiscal engine) are booked separately and are excluded from this transaction view.',
  };
}
