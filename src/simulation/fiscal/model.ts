export type TaxKind = 'personal' | 'consumption' | 'payroll' | 'corporate';
export type TaxCategory = 'personal' | 'consumption' | 'employee' | 'employer' | 'corporate';
export interface Band { lower: number; rateBps: number }
export interface PayrollComponent { rateBps: number; cap?: number; threshold?: number }
export interface TaxRule {
  id: string; countryId: string; kind: TaxKind; status: 'sourced' | 'partial' | 'modelled';
  scope: 'federal' | 'national'; currency: string; unit: string;
  effectiveDate: string; referenceDate: string; retrievedAt: string; source: string; document: string; limitations: string;
  rateBps?: number; allowance?: number; bands?: Band[];
  employee?: PayrollComponent[]; employer?: PayrollComponent[];
}
export type Policy = Record<TaxKind, TaxRule | null>;
export const TAXES: TaxCategory[] = ['personal', 'consumption', 'employee', 'employer', 'corporate'];
export const CATEGORIES = ['health', 'education', 'pensions', 'incomeSupport', 'infrastructure', 'administration'] as const;
export type Spending = typeof CATEGORIES[number];
export type Budget = Record<Spending, number> & { defense?: number };
export interface TaxFlow { base: number; liability: number; collected: number; status: 'partial' | 'modelled' | 'sourced' | 'unavailable' }
export interface HouseholdFlow {
  grossIncome: number[]; personal: number[]; employee: number[]; transfers: number[]; disposable: number[];
  netConsumption: number[]; consumptionTax: number[]; grossExpenditure: number[];
}
export interface RegionFiscal extends HouseholdFlow {
  tradePurchases?: { date: string; importedGoods: number[]; landedPayment: number[];
    importConsumptionTax: number[]; nominalBudget: number[] };
  militaryPay?: number[];
  owner: string; taxes: Record<TaxCategory, TaxFlow>;
  businessSurplus: number; retainedBusinessSurplus: number; labourCost: number;
  privateResidual: number; publicOrders: number;
}
export interface Service {
  status: 'modelled' | 'unavailable';
  referencePopulation: number; referenceMonthlyCost: number; required: number;
  spending: number; fundedCapacity: number; capacity: number; coverageBps: number | null; backlog: number;
}
export interface FiscalProvenance {
  status: 'sourced' | 'modelled';
  referenceDate: string;
  dataset: string;
  method: string;
  limitation: string;
  source?: string;
}
export interface RevenueCalibration extends FiscalProvenance {
  monthlyAmount: number;
}
export interface DebtInitialization extends FiscalProvenance {
  amount: number;
}
export interface Account {
  customsRevenue?: { collected: number; date: string; scope: 'admitted_flows_only'; unavailableRates: number };
  defensePublicOrders?: { regionId: string; amount: number }[];
  militaryPayroll?: import('./militaryPayroll').MilitaryPayroll;
  financingRevenue?: number;
  defense?: { authorized: number; requested: number; obligation: number; executed: number; payroll: number; procurement: number };
  construction?: { committed: number; executed: number; maintenance: number; executedCumulative: number; maintenanceCumulative: number };
  unit: 'USD_NOMINAL'; period: 'MONTH'; policyApplied: Policy; collectionEfficiencyBps: number;
  date: string; taxes: Record<TaxCategory, TaxFlow>;
  knownTaxRevenue: number; otherRevenue: number; totalRevenue: number;
  appropriated: Budget; executed: Budget; interestDue: number; interestPaid: number;
  totalSpending: number; primaryBalance: number; overallBalance: number;
  openingCash: number; closingCash: number; openingDebt: number; closingDebt: number;
  financingNeed: number; borrowed: number; repaid: number;
  arrears: Budget; interestArrears: number; openingArrears: Budget; openingInterestArrears: number;
  transferPaid: number; stress: { financingBaselineStatus: 'sourced' | 'modelled'; unpaidCommitments: number; interestBurdenBps: number | null; debtToAnnualOutputBps: number | null; deficitToOutputBps: number | null; pensionFundingGap: number; incomeSupportFundingGap: number; serviceUnderfunding: number; infrastructureBacklog: number; disposableIncomeDeclineBps: number | null };
}
export interface FiscalCountry {
  policy: Policy; policyHistory: { date: string; policy: Policy }[];
  annualBudget: Budget; cash: number; debt: number; interestRateBps: number;
  debtLimit: number; monthlyBorrowingLimit: number; arrears: Budget; interestArrears: number;
  constructionCommitted: number; constructionExecuted: number; assetMaintenanceSpent: number;
  services: Record<'health' | 'education' | 'infrastructure', Service>;
  revenueCalibration: RevenueCalibration;
  debtInitialization: DebtInitialization;
  account?: Account;
  initialization: { status: 'modelled'; date: string; economicCoverage: 'complete' | 'partial' | 'unavailable'; output: number; method: string };
}
export interface FiscalReformOrigin { type: 'governance_proposal'; proposalId: string; proposalFingerprint: string }
export interface FiscalReform { sequence: number; countryId: string; effectiveDate: string; policy?: Policy; annualBudget?: Budget; origin?: FiscalReformOrigin }
export interface FiscalReformReceipt { sequence: number; countryId: string; effectiveDate: string; reformFingerprint: string; origin?: FiscalReformOrigin; recordedBy: 'runtime' | 'schema12_upgrade' }
export interface FiscalState {
  version: 'fiscal-0.11-v2'; initializedOn?: string; lastMonthlyDate?: string;
  countries: Record<string, FiscalCountry>; regions: Record<string, RegionFiscal>;
  reforms: FiscalReform[]; reformReceipts: FiscalReformReceipt[]; nextSequence: number;
}
export const emptyFiscal = (): FiscalState => ({ version: 'fiscal-0.11-v2', countries: {}, regions: {}, reforms: [], reformReceipts: [], nextSequence: 0 });
export const zeroBudget = (): Budget => ({ health: 0, education: 0, pensions: 0, incomeSupport: 0, infrastructure: 0, administration: 0 });
/** Central model assumptions, not empirical national observations. */
export const FISCAL_MODEL = Object.freeze({
  collectionBps: 9000, taxableConsumptionBps: 7000, wageIncomeBps: 8000, surplusBps: 5000,
  pensionRecipientBps: 1500, serviceAdjustmentMonths: 12, interestRateBps: 200,
  budgetOutputBps: { health: 150, education: 150, pensions: 200, incomeSupport: 100, infrastructure: 100, administration: 50 } as Budget,
  initialCashMonths: 3, debtLimitAnnualOutputBps: 10000, borrowingMonthlyOutputBps: 2000,
});

/** Legal-only extension point. No calculator or invented economic base exists for these taxes in 0.11. */
export interface ReservedTaxRule {
  kind: 'excise' | 'property' | 'other'; countryId: string; description: string;
  source: string; effectiveDate: string; currency: string;
  simulationStatus: 'unavailable'; missingEconomicBase: string;
}
