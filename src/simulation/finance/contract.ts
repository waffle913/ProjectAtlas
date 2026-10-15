/**
 * 0.26.1 — Finance V1: monetary contract and open decisions (vocabulary).
 *
 * This module is the executable counterpart of docs/finance-0.26.md. It is
 * vocabulary and accounting-contract only, in exactly the same sense as 0.25.1
 * (`src/simulation/economy/model.ts` + `ownership.ts`) and 0.24.1A:
 *
 * - It is NOT integrated into `SimulationState`, the save schema, migrations,
 *   the scheduler, the RNG or any other engine system.
 * - It defines no second money ledger, no second treasury, no second economy,
 *   no second debt book and no bank simulation.
 * - It inventories where every existing monetary quantity already lives
 *   (treasury, revenue, receivable, obligation, payment, price, debt) so the
 *   later 0.26 sub-milestones read and write exactly one place.
 * - It records the open design decisions (national currency/FX, commercial-bank
 *   credit-created money, bank deposits balance) as explicit `undecided` gates.
 *   They are BLOCKED_DESIGN until a human decides them; nothing here silently
 *   activates them.
 *
 * Contractual rules (see docs/finance-0.26.md and AGENTS.md):
 *
 * - The single canonical monetary unit is `MONETARY_UNIT` (integer nominal USD,
 *   whole-USD safe integers; prices in integer microUSD; rates in basis points).
 *   0.26 does not introduce a second unit of account.
 * - `unavailable != 0`: an unknown debt, rate, revenue or price is never a zero.
 * - No money is created or destroyed by accounting incoherence: every obligation
 *   has a matching liability, every payment moves money that already exists, and
 *   every balance reconciles against the canonical fiscal/trade owners below.
 */

import type { SimulationState } from '../../types';
import { MONETARY_UNIT } from '../economy/model';

export const FINANCE_VERSION = 'finance-0.26-v1' as const;

/** Permanent opaque identifiers (vocabulary only; 0.26.3/0.26.4 attach them). */
export type PaymentId = string;
export type ObligationId = string;
export type LoanId = string;
export type CounterpartyId = string;

/** The single canonical monetary unit of account — reused, never redefined. */
export const FINANCE_MONETARY_UNIT = MONETARY_UNIT;

export const MONEY_SURFACE_KINDS = Object.freeze([
  'treasury', 'revenue', 'receivable', 'obligation', 'payment', 'price', 'debt',
] as const);
export type MoneySurfaceKind = typeof MONEY_SURFACE_KINDS[number];

export const MONEY_MEASURES = Object.freeze(['stock', 'flow', 'state', 'rate', 'limit'] as const);
export type MoneyMeasure = typeof MONEY_MEASURES[number];

export const MONEY_SCOPES = Object.freeze(['country', 'world'] as const);
export type MoneyScope = typeof MONEY_SCOPES[number];

export const MONEY_SUBSYSTEMS = Object.freeze(['fiscal', 'trade'] as const);
export type MoneySubsystem = typeof MONEY_SUBSYSTEMS[number];

export interface MoneySurfaceEntry {
  /** Stable human-readable variable key (unique across the registry). */
  readonly variable: string;
  readonly kind: MoneySurfaceKind;
  readonly measure: MoneyMeasure;
  /** Unit of account: `USD_NOMINAL`, `USD_PER_MONTH`, `microUSD_PER_UNIT`, `basis_points`. */
  readonly unit: string;
  readonly scope: MoneyScope;
  /** The exact single canonical `SimulationState` field path (unique across the registry). */
  readonly ownerPath: string;
  readonly ownerSubsystem: MoneySubsystem;
  readonly rationale: string;
  /** Defensive, typed read of the canonical owner. Never throws on an empty state. */
  readonly read: (state: SimulationState, countryId: string) => unknown;
}

/**
 * The canonical monetary-surface inventory (docs/finance-0.26.md). It names
 * where every existing monetary quantity lives; it is a static registry kept
 * out of saves, never a second source of truth. Order is stable and
 * human-readable and never drives iteration-dependent allocation.
 */
export const MONEY_SURFACES: readonly MoneySurfaceEntry[] = Object.freeze([
  {
    variable: 'treasury_cash',
    kind: 'treasury', measure: 'stock', unit: 'USD_NOMINAL', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].cash',
    ownerSubsystem: 'fiscal',
    rationale: '`FiscalCountry.cash` is the live treasury cash stock; `account.openingCash`/`closingCash` are its dated monthly bookkeeping. No second treasury exists.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.cash,
  },
  {
    variable: 'debt_stock',
    kind: 'debt', measure: 'stock', unit: 'USD_NOMINAL', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].debt',
    ownerSubsystem: 'fiscal',
    rationale: '`FiscalCountry.debt` is the live public debt stock; `account.openingDebt`/`closingDebt` are its dated monthly bookkeeping; `debtInitialization.amount` is the dated initial reference. No second debt book exists.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.debt,
  },
  {
    variable: 'debt_limit',
    kind: 'debt', measure: 'limit', unit: 'USD_NOMINAL', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].debtLimit',
    ownerSubsystem: 'fiscal',
    rationale: 'The public borrowing ceiling is the fiscal `debtLimit`; it is a policy/calibration bound, never a second debt source.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.debtLimit,
  },
  {
    variable: 'monthly_borrowing_limit',
    kind: 'debt', measure: 'limit', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].monthlyBorrowingLimit',
    ownerSubsystem: 'fiscal',
    rationale: 'The monthly financing ceiling is the fiscal `monthlyBorrowingLimit`.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.monthlyBorrowingLimit,
  },
  {
    variable: 'interest_rate',
    kind: 'debt', measure: 'rate', unit: 'basis_points', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].interestRateBps',
    ownerSubsystem: 'fiscal',
    rationale: 'The modelled public borrowing rate is `interestRateBps` (a modelled prior, never presented as an observed market rate).',
    read: (state, countryId) => state.fiscal.countries[countryId]?.interestRateBps,
  },
  {
    variable: 'tax_revenue',
    kind: 'revenue', measure: 'flow', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.knownTaxRevenue',
    ownerSubsystem: 'fiscal',
    rationale: 'Known statutory tax revenue is `account.knownTaxRevenue`, kept distinct from other/baseline revenue.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.knownTaxRevenue,
  },
  {
    variable: 'other_revenue',
    kind: 'revenue', measure: 'flow', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.otherRevenue',
    ownerSubsystem: 'fiscal',
    rationale: 'Baseline/other revenue calibration is `account.otherRevenue`, never conflated with tax revenue and never neutralizing a reform.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.otherRevenue,
  },
  {
    variable: 'total_revenue',
    kind: 'revenue', measure: 'flow', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.totalRevenue',
    ownerSubsystem: 'fiscal',
    rationale: '`account.totalRevenue` is the reconciled total; it is derived from the components, never a second revenue engine.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.totalRevenue,
  },
  {
    variable: 'customs_revenue',
    kind: 'revenue', measure: 'flow', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.customsRevenue.collected',
    ownerSubsystem: 'fiscal',
    rationale: 'Collected customs/import consumption tax is `account.customsRevenue.collected` (admitted flows only; unavailable rates are never zero).',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.customsRevenue?.collected,
  },
  {
    variable: 'arrears',
    kind: 'receivable', measure: 'stock', unit: 'USD_NOMINAL', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.arrears',
    ownerSubsystem: 'fiscal',
    rationale: 'Unpaid public commitments are `account.arrears` (with `openingArrears`); they are a real obligation, never silently forgotten.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.arrears,
  },
  {
    variable: 'interest_arrears',
    kind: 'receivable', measure: 'stock', unit: 'USD_NOMINAL', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.interestArrears',
    ownerSubsystem: 'fiscal',
    rationale: 'Unpaid interest is `account.interestArrears` (with `openingInterestArrears`).',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.interestArrears,
  },
  {
    variable: 'interest_due',
    kind: 'obligation', measure: 'flow', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.interestDue',
    ownerSubsystem: 'fiscal',
    rationale: 'Interest falling due this period is `account.interestDue`; it is serviced via `interestPaid`.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.interestDue,
  },
  {
    variable: 'interest_paid',
    kind: 'payment', measure: 'flow', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.interestPaid',
    ownerSubsystem: 'fiscal',
    rationale: 'Actual debt-service payment is `account.interestPaid`; it moves already-booked money, never minting cash.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.interestPaid,
  },
  {
    variable: 'defense_obligation',
    kind: 'obligation', measure: 'stock', unit: 'USD_NOMINAL', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.defense.obligation',
    ownerSubsystem: 'fiscal',
    rationale: 'Committed defence expenditure is `account.defense.obligation` (authorized/requested/executed kept distinct).',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.defense?.obligation,
  },
  {
    variable: 'construction_committed',
    kind: 'obligation', measure: 'stock', unit: 'USD_NOMINAL', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.construction.committed',
    ownerSubsystem: 'fiscal',
    rationale: 'Committed construction funding is `account.construction.committed`; committed money is not reusable elsewhere.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.construction?.committed,
  },
  {
    variable: 'borrowed',
    kind: 'payment', measure: 'flow', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.borrowed',
    ownerSubsystem: 'fiscal',
    rationale: 'New borrowing this period is `account.borrowed`; it increases debt and cash together, never free money.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.borrowed,
  },
  {
    variable: 'repaid',
    kind: 'payment', measure: 'flow', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.repaid',
    ownerSubsystem: 'fiscal',
    rationale: 'Principal repayment this period is `account.repaid`; it decreases debt and cash together.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.repaid,
  },
  {
    variable: 'financing_need',
    kind: 'payment', measure: 'flow', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.financingNeed',
    ownerSubsystem: 'fiscal',
    rationale: 'The residual financing need is `account.financingNeed`; it drives borrowing within the fiscal borrowing limits.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.financingNeed,
  },
  {
    variable: 'transfer_paid',
    kind: 'payment', measure: 'flow', unit: 'USD_PER_MONTH', scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account.transferPaid',
    ownerSubsystem: 'fiscal',
    rationale: 'Transfers/services paid out are `account.transferPaid`; they flow through the one fiscal engine.',
    read: (state, countryId) => state.fiscal.countries[countryId]?.account?.transferPaid,
  },
  {
    variable: 'trade_price',
    kind: 'price', measure: 'state', unit: 'microUSD_PER_UNIT', scope: 'country',
    ownerPath: 'state.trade.countries[countryId].markets[category].priceMicroUsd',
    ownerSubsystem: 'trade',
    rationale: 'Current/reference trade prices are `priceMicroUsd`/`baselinePriceMicroUsd` on the trade markets; executed invoices carry their own `priceMicroUsd`. No second price store.',
    read: (state, countryId) => state.trade.countries[countryId]?.markets,
  },
  {
    variable: 'trade_payment',
    kind: 'payment', measure: 'flow', unit: 'USD', scope: 'world',
    ownerPath: 'state.trade.flows',
    ownerSubsystem: 'trade',
    rationale: 'Realized trade payments are the booked `TradeFlow`s (`valueUsd`, `logisticsUsd`, `customsUsd`, `landedUsd`) and the category ledger (`importPaymentUsd`, `exportValueUsd`, `purchasingBudgetUsd`, `unspentUsd`). Exports/imports never mint domestic output.',
    read: (state) => state.trade.flows,
  },
]);

/** Required monetary surfaces the inventory must cover (docs/finance-0.26.md). */
export const REQUIRED_SURFACES = Object.freeze([
  'treasury_cash', 'debt_stock', 'debt_limit', 'monthly_borrowing_limit', 'interest_rate',
  'tax_revenue', 'other_revenue', 'total_revenue', 'customs_revenue',
  'arrears', 'interest_arrears', 'interest_due', 'interest_paid', 'defense_obligation',
  'construction_committed', 'borrowed', 'repaid', 'financing_need', 'transfer_paid',
  'trade_price', 'trade_payment',
] as const);

// ---------------------------------------------------------------------------
// Open design decisions (BLOCKED_DESIGN until a human decides).
// ---------------------------------------------------------------------------

export const DECISION_STATUSES = Object.freeze(['undecided', 'decided'] as const);
export type DecisionStatus = typeof DECISION_STATUSES[number];

export interface FinanceDecisionGate {
  readonly id: 'national_currency_fx' | 'bank_money_creation' | 'bank_deposits_balance';
  readonly status: DecisionStatus;
  /** The precise question a human must answer before the dependent sub-milestone can start. */
  readonly question: string;
  readonly dependsOnSubMilestones: readonly string[];
  readonly independentNote: string;
}

/**
 * The open design gates of 0.26 (docs/finance-0.26.md). Adopting the roadmap did
 * not decide these mechanics; they stay `undecided` and BLOCKED_DESIGN. The
 * independent parts of 0.26 (aggregate treasury payments, public-debt schedules,
 * solvency on the single USD_NOMINAL ledger) proceed regardless.
 */
export const FINANCE_DECISIONS: readonly FinanceDecisionGate[] = Object.freeze([
  {
    id: 'national_currency_fx',
    status: 'undecided',
    question: 'Keep nominal USD as the sole canonical accounting unit with an explicit multi-currency display representation, or add real national currencies and FX conversion (0.26.8)?',
    dependsOnSubMilestones: ['0.26.8'],
    independentNote: 'Every treasury/payment/debt surface stays on the single USD_NOMINAL ledger regardless of this decision.',
  },
  {
    id: 'bank_money_creation',
    status: 'undecided',
    question: 'Should commercial-bank credit-created deposits be simulated, and at what aggregate level?',
    dependsOnSubMilestones: ['0.26.2', '0.26.5', '0.26.6'],
    independentNote: 'Aggregate treasury payments/settlement and public-debt schedules do not require bank-created money.',
  },
  {
    id: 'bank_deposits_balance',
    status: 'undecided',
    question: 'Should an aggregate bank/counterparty balance sheet (deposits vs loans) be modelled?',
    dependsOnSubMilestones: ['0.26.2', '0.26.5'],
    independentNote: 'Public treasury, public debt and the fiscal ledger proceed without a bank balance sheet.',
  },
]);

/** A decision gate is closed (mechanism active) only after an explicit human decision flips it to `decided`. */
export const isFxInScope = (): boolean => FINANCE_DECISIONS.find((d) => d.id === 'national_currency_fx')!.status === 'decided';
export const isBankMoneyInScope = (): boolean => FINANCE_DECISIONS.find((d) => d.id === 'bank_money_creation')!.status === 'decided';
