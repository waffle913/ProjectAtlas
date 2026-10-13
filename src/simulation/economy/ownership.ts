/**
 * 0.25.1 — Economy V2: canonical ownership inventory.
 *
 * The single source of truth for "who owns each economic variable". Every entry
 * names the exact one `SimulationState` field that holds the live value; any
 * other occurrence is a saved initialization reference (read-only) or a derived
 * report, never a second source of truth. The registry and its tests enforce
 * the non-duplication invariants from docs/economy-0.25.md:
 *
 * - one population universe (cohorts);
 * - one output/income engine (socioeconomy);
 * - one fiscal treasury;
 * - one trade engine and one stock store (TradeStock);
 * - one asset store;
 * - one ownership map (regionOwnership).
 *
 * This is a static registry kept out of saves (like the 0.22 descriptor
 * registry): it documents canonical ownership, it does not run a second engine.
 */

import type { SimulationState } from '../../types';

export const ECONOMY_DOMAINS = Object.freeze([
  'population', 'employment', 'production', 'income', 'disposable_income',
  'consumption', 'fiscal', 'price', 'trade_flow', 'stock', 'asset', 'ownership',
] as const);
export type EconomyDomain = typeof ECONOMY_DOMAINS[number];

export const ECONOMY_MEASURES = Object.freeze(['stock', 'flow', 'ledger', 'state', 'identity'] as const);
export type EconomyMeasure = typeof ECONOMY_MEASURES[number];

export const OWNER_SCOPES = Object.freeze(['region', 'country', 'world'] as const);
export type OwnerScope = typeof OWNER_SCOPES[number];

export const OWNER_SUBSYSTEMS = Object.freeze(['socioeconomy', 'fiscal', 'trade', 'assets', 'top-level'] as const);
export type OwnerSubsystem = typeof OWNER_SUBSYSTEMS[number];

export interface CanonicalOwnerEntry {
  /** Stable human-readable variable key (unique across the registry). */
  readonly variable: string;
  readonly domain: EconomyDomain;
  readonly measure: EconomyMeasure;
  /** Unit of account; `n/a` for identity maps. */
  readonly unit: string;
  readonly scope: OwnerScope;
  /** The exact single canonical `SimulationState` field path (unique across the registry). */
  readonly ownerPath: string;
  readonly ownerSubsystem: OwnerSubsystem;
  readonly rationale: string;
  /** Typed, defensive read of the canonical owner. It must never throw on an
   *  uninitialized/empty state and must read exactly the field named by
   *  `ownerPath`. The compiler checks that the field exists. */
  readonly read: (state: SimulationState, regionId: string, countryId: string) => unknown;
}

/**
 * The canonical ownership inventory. Order is stable and human-readable; it is
 * never used for iteration-dependent allocation.
 */
export const CANONICAL_OWNERS: readonly CanonicalOwnerEntry[] = Object.freeze([
  {
    variable: 'population',
    domain: 'population',
    measure: 'stock',
    unit: 'PERSONS',
    scope: 'region',
    ownerPath: 'state.socioeconomy.regions[regionId].cohorts',
    ownerSubsystem: 'socioeconomy',
    rationale: 'Nine income×orientation cohorts are the sole population source; regional population is their exact sum. `state.populationByRegion` is a saved 0.1–0.9 initialization reference, never a live cache.',
    read: (state, regionId) => state.socioeconomy.regions[regionId]?.cohorts,
  },
  {
    variable: 'employment',
    domain: 'employment',
    measure: 'stock',
    unit: 'PERSONS',
    scope: 'region',
    ownerPath: 'state.socioeconomy.regions[regionId].economy',
    ownerSubsystem: 'socioeconomy',
    rationale: '`labourForce`/`employed`/`unemployed`/`baseEmployed` are the sole employment stocks. Military personnel and construction `reservedWorkers` are reservations reconciled against the same `labourForce`, never a second population.',
    read: (state, regionId) => state.socioeconomy.regions[regionId]?.economy,
  },
  {
    variable: 'output',
    domain: 'production',
    measure: 'flow',
    unit: 'USD_PER_MONTH',
    scope: 'region',
    ownerPath: 'state.socioeconomy.regions[regionId].economy.output',
    ownerSubsystem: 'socioeconomy',
    rationale: '`output` (with `baseOutput`, `capacity`, `productionCapacity`, `productivity`) is the sole realized production flow. `state.economicOutputByRegion` is a saved annual reference, never summed with monthly flows.',
    read: (state, regionId) => state.socioeconomy.regions[regionId]?.economy?.output,
  },
  {
    variable: 'income',
    domain: 'income',
    measure: 'flow',
    unit: 'USD_PER_MONTH',
    scope: 'region',
    ownerPath: 'state.socioeconomy.regions[regionId].economy.householdIncome',
    ownerSubsystem: 'socioeconomy',
    rationale: '`householdIncome`/`incomeByGroup` are the sole household income flow. Disposable income (fiscal) is a distinct, downstream quantity.',
    read: (state, regionId) => state.socioeconomy.regions[regionId]?.economy?.householdIncome,
  },
  {
    variable: 'disposable_income',
    domain: 'disposable_income',
    measure: 'flow',
    unit: 'USD_PER_MONTH',
    scope: 'region',
    ownerPath: 'state.fiscal.regions[regionId].disposable',
    ownerSubsystem: 'fiscal',
    rationale: 'Household disposable income after taxes/transfers is the fiscal ledger (`HouseholdFlow.disposable`), the opening envelope trade preparation reads. It is never a second income engine.',
    read: (state, regionId) => state.fiscal.regions[regionId]?.disposable,
  },
  {
    variable: 'consumption',
    domain: 'consumption',
    measure: 'flow',
    unit: 'USD_PER_MONTH',
    scope: 'region',
    ownerPath: 'state.socioeconomy.regions[regionId].economy.consumption',
    ownerSubsystem: 'socioeconomy',
    rationale: '`consumption`/`consumptionByGroup` (with `demand`, `otherDemandResidual`, `otherDemandRealized`, `essentialConsumption`, `basicNeedsCoverageBps`, `shortage`) are the sole demand/consumption flows.',
    read: (state, regionId) => state.socioeconomy.regions[regionId]?.economy?.consumption,
  },
  {
    variable: 'fiscal',
    domain: 'fiscal',
    measure: 'ledger',
    unit: 'USD_NOMINAL',
    scope: 'country',
    ownerPath: 'state.fiscal.countries[countryId].account',
    ownerSubsystem: 'fiscal',
    rationale: '`account` is the sole fiscal ledger (known/other/total revenue, spending, debt, cash, balances); `policy`, `cash` and `debt` live beside it on `FiscalCountry`. Governance acts through `scheduleFiscalReform`, never by writing this directly.',
    read: (state, _regionId, countryId) => state.fiscal.countries[countryId]?.account,
  },
  {
    variable: 'price',
    domain: 'price',
    measure: 'state',
    unit: 'microUSD_PER_UNIT',
    scope: 'country',
    ownerPath: 'state.trade.countries[countryId].markets[category].priceMicroUsd',
    ownerSubsystem: 'trade',
    rationale: '`priceMicroUsd` (and `baselinePriceMicroUsd`) are the sole current/reference prices; executed invoices carry their own `priceMicroUsd`. Observed/derived/modelled status lives on the admitted `TradeSource`.',
    read: (state, _regionId, countryId) => state.trade.countries[countryId]?.markets,
  },
  {
    variable: 'trade_flow',
    domain: 'trade_flow',
    measure: 'flow',
    unit: 'AGGREGATE_QUANTITY + USD',
    scope: 'world',
    ownerPath: 'state.trade.flows',
    ownerSubsystem: 'trade',
    rationale: '`flows[]` (with `routes[]`) are the sole realized trade flows. Category production/need are attributions inside the one socioeconomic private-residual envelope, never additive output.',
    read: (state) => state.trade.flows,
  },
  {
    variable: 'stock',
    domain: 'stock',
    measure: 'stock',
    unit: 'AGGREGATE_QUANTITY',
    scope: 'country',
    ownerPath: 'state.trade.countries[countryId].markets[category].stock',
    ownerSubsystem: 'trade',
    rationale: '`TradeStock` is the sole stock store. Construction consumes this canonical stock directly (assets/materials.ts); there is no parallel material store.',
    read: (state, _regionId, countryId) => state.trade.countries[countryId]?.markets,
  },
  {
    variable: 'asset',
    domain: 'asset',
    measure: 'stock',
    unit: 'ASSET_CAPACITY',
    scope: 'world',
    ownerPath: 'state.assets.assets',
    ownerSubsystem: 'assets',
    rationale: '`assets` (with `projects`) is the sole physical-asset store. An asset is attached to one permanent Region; current sovereignty/control/occupation stay canonical elsewhere.',
    read: (state) => state.assets.assets,
  },
  {
    variable: 'ownership',
    domain: 'ownership',
    measure: 'identity',
    unit: 'n/a',
    scope: 'world',
    ownerPath: 'state.regionOwnership',
    ownerSubsystem: 'top-level',
    rationale: '`state.regionOwnership` is the only canonical sovereignty map. No economic subsystem stores a second ownership truth.',
    read: (state) => state.regionOwnership,
  },
]);

/** Required variables the inventory must cover (docs/economy-0.25.md). */
export const REQUIRED_INVENTORY = Object.freeze([
  'population', 'employment', 'output', 'income', 'disposable_income',
  'consumption', 'fiscal', 'price', 'trade_flow', 'stock', 'asset', 'ownership',
] as const);
