# Economy V2 — 0.25

**Status:** 0.25 (Economy V2) is explicitly authorized by the user. **0.25.1
through 0.25.9 are implemented** — contracts and units of account (0.25.1),
activities and productive capacities (0.25.2A/0.25.2B), stocks/supply/shortages
(0.25.3), employment/wages/income (0.25.4), household needs and spending (0.25.5),
firms/activity/investment (0.25.6), prices and domestic markets (0.25.7),
international trade (0.25.8), and budget/fiscal/public services (0.25.9). Branch CI
is green at run 38634740271 (head `da7ddbd86cd45ad2e3f6e23e386e0246789e2977`,
ubuntu+windows). The next block is **0.25.10 — Cross-system loops**. Implementation
is not acceptance: 0.25 as a whole, and each sub-milestone, requires the review /
correction / GitHub-CI gate and the user's explicit acceptance before the next
main milestone. **0.24 remains the last accepted Safe Zone; 0.25 is not accepted.**
The authoritative autopilot progression state is the copy of
`.reasonix/projectatlas-autopilot-state.json` maintained on `main`; the historical
copy on the development branch is a stale snapshot and must not be used to resume
at 0.25.1.

This document is the canonical contract for 0.25. It complements
[the roadmap decomposition](roadmap-submilestones.md) and the existing subsystem
contracts; it does not replace them and does not authorize implementation on its
own.

## 0.25.1 scope — contracts and units of account

The first sub-milestone establishes the **units of account** for Economy V2 and
the **canonical owner of every economic variable**, without building any new
mechanism. It is a vocabulary and accounting-contract milestone, exactly parallel
in kind to 0.24.1A ("identities and types"):

- Inventory: population, production, income, consumption, fiscal, trade, stocks,
  assets, employment.
- Determine the single canonical owner of each variable.
- Define goods, services, sectors/activities, prices, physical units, monetary
  units and provenance.
- Enforce the non-duplication invariants: no duplication of GDP, income,
  population, stock or ownership.

0.25.1 introduces **no** second economy, no second GDP/population engine, no new
scheduler task, no new RNG, no migration and no new canonical-state schema. It
adds static vocabulary and a static ownership registry that later 0.25 sub-milestones
(production, stocks, employment, households, firms, prices, trade, fiscal,
cross-system loops, data/migrations, performance) build on. The executable
counterpart of this document lives in `src/simulation/economy/` and is validated by
`src/simulation/__tests__/economyUnits.test.ts`.

## One economy, many views

There is exactly one economic engine, one population/cohort universe, one fiscal
treasury, one trade engine and one asset store, all inside the single canonical
`SimulationState`. 0.25 enriches these existing systems; it never creates a
parallel economy. The 0.25 units of account are therefore **not a new ledger**:
they are the vocabulary and the ownership map that name where each quantity
already lives, so later sub-milestones read and write exactly one place.

### Canonical ownership inventory

The following is the authoritative inventory. "Canonical owner" means the exact
single `SimulationState` field that holds the live value; every other occurrence
is either a saved initialization reference (read-only compatibility) or a derived
report, never a second source of truth. The machine-readable registry
(`src/simulation/economy/ownership.ts`) asserts uniqueness: no two variables may
claim the same owner, and every variable in the inventory must be present.

| Variable | Canonical owner | Unit | Measure |
| --- | --- | --- | --- |
| Population | `state.socioeconomy.regions[regionId].cohorts[].persons` — nine cohorts (low/middle/high × left/centre/right); regional population is their exact sum | persons (`PERSONS`) | stock |
| Employment | `state.socioeconomy.regions[regionId].economy.{labourForce, employed, unemployed, baseEmployed}` | persons | stock |
| Labour reservations | military personnel and construction `reservedWorkers`, reconciled against the **same** `labourForce` (a reserved worker is never also a civilian employee) | persons | stock (reservation) |
| Output / production | `state.socioeconomy.regions[regionId].economy.{baseOutput, output, capacity, productionCapacity, productivity}` | integer USD / month | flow |
| Income | `state.socioeconomy.regions[regionId].economy.{householdIncome, incomeByGroup}` | integer USD / month | flow |
| Disposable income | `state.fiscal.regions[regionId].disposable[]` (`HouseholdFlow`) | integer USD / month | flow |
| Consumption / demand | `state.socioeconomy.regions[regionId].economy.{demand, householdDemand, consumption, consumptionByGroup, otherDemandResidual, otherDemandRealized, essentialConsumption, basicNeedsCoverageBps, shortage}` | integer USD / month | flow |
| Fiscal revenue / spending / debt / cash | `state.fiscal.countries[countryId].account.{knownTaxRevenue, otherRevenue, totalRevenue, totalSpending, openingDebt, closingDebt, openingCash, closingCash, …}` plus `state.fiscal.countries[countryId].{policy, cash, debt}` | integer nominal USD | flow + stock |
| Prices | `state.trade.countries[countryId].markets[category].{priceMicroUsd, baselinePriceMicroUsd}`; executed invoices carry `priceMicroUsd` | integer microUSD / unit | state |
| Trade flows | `state.trade.flows[]` (with `routes[]`) | aggregate quantity + integer USD | flow |
| Stocks | `state.trade.countries[countryId].markets[category].stock` (`TradeStock`) | aggregate quantity | stock |
| Physical assets | `state.assets.assets[assetId]` (identity, capacity, physical state); `state.assets.projects[projectId]` | capacity unit | stock |
| Sovereign ownership | `state.regionOwnership` — the only ownership map; economic subsystems never store a second copy | — | identity |

**Saved references, not monthly flows.** `state.populationByRegion` and
`state.economicOutputByRegion` are the audited 0.1–0.9 initialization references.
They are never summed with monthly flows and never used as monthly output caches.
`state.socioeconomy.regions[regionId].annualOutputReference` is the per-Region
annual reference anchor, likewise distinct from monthly flows.

**Trade production/need/stock are aggregate quantities, not a second GDP.**
Exportable category production and imports are conservative attributions inside
the realized private-residual output envelope of the one socioeconomic engine;
they are never added on top of `output`/`householdIncome`/fiscal income/cash. See
[trade-0.17.md](trade-0.17.md).

## Units of account

### Monetary unit

The single monetary unit of account is **nominal US dollars**, stored as
non-negative safe integers of whole USD. All engine money is integer USD; no
fractional money, no floating-point money, no second currency.

| Facet | Definition |
| --- | --- |
| Whole-dollar amount | integer USD (`USD_NOMINAL`, `USD_PER_MONTH`) |
| Price sub-unit | integer microUSD: `1,000,000` microUSD = `1` USD (trade prices) |
| Rate sub-unit | basis points: `10,000` bps = `100%` (shares, tax rates, coverage, pressure) |
| Rational quotient | `productivity = outputUsd / workers`, integer USD / worker / month (not a money balance) |

Whole-dollar conversion uses BigInt products with half-up rounding; largest
remainder conserves exact allocations. A trade invoice unit must cost at least one
whole USD: finer physical units are explicitly bundled, never rounded into free
delivery.

### Physical units

| Unit | Meaning | Scope |
| --- | --- | --- |
| `PERSONS` | person **stocks** (population, employment, reservations) | socioeconomy / assets / military |
| aggregate quantity unit (per category) | an explicitly admitted, compatible unit per trade market (e.g. tonnes, units) | trade |
| capacity unit | an asset's physical capacity unit (`COMPLETED_ASSET_CAPACITY_UNIT`, a `'unit'` placeholder in 0.24, refined by the 0.25 economy registry when real data is admissible) | assets |

Physical quantities are non-negative safe integers in their explicit unit.
Endpoints need compatible category units. A physical quantity is never replaced
by its dollar value, and a dollar value never becomes a physical quantity without
an explicit admitted price and unit.

### Goods, services, sectors and activities

**Goods.** The immutable trade category taxonomy
(`TRADE_CATEGORIES` / `CATEGORY_REGISTRY` in `src/simulation/trade/model.ts`) is
the canonical aggregate **goods** vocabulary: `food`, `energy`, `raw_materials`,
`consumer_goods`, `industrial_goods`, `capital_goods`, `transport_equipment`,
`chemicals_pharmaceuticals`, `electronics`, `services`, `unclassified_goods`.
These are generic aggregates, not precise HS products or observed national
sectors. 0.25 reuses this taxonomy; it never defines a second goods list.
Absent categories are unknown, never zero.

**Services.** Two distinct families, kept separate:

- traded-services aggregate — the `services` trade category;
- public services — the fiscal categories `health`, `education`, `pensions`,
  `incomeSupport`, `infrastructure`, `administration` (`CATEGORIES` in
  `src/simulation/fiscal/model.ts`).

A traded-service flow is a trade quantity; a public-service category is a fiscal
spending/coverage quantity. Neither is reclassified into the other, and neither
doubles as a household consumption identity.

**Sectors / activities.** The productive-activity vocabulary arrives in 0.25.2.
0.25.1 defines only the *type* (`SectorId`, `ActivityId`) and the admission rule:

- a sector/activity is admitted only with a compatible sourced/derived datum and
  dated provenance, or explicitly labelled `modelled`/synthetic;
- **never** fabricate a real industrial capacity, stock, price or productivity
  for 2026-01-01; an unavailable sector stays `unavailable`, never a zero or a
  guessed value;
- synthetic sectors exist only to exercise mechanisms and are visibly labelled
  synthetic (they carry no real-world provenance).

### Prices

A price is a quantity of microUSD per explicit physical unit, with an explicit
coverage status and — for observed/derived prices — dated provenance.

| Status | Meaning |
| --- | --- |
| `observed` | a real dated price with publisher/dataset/URL/reference/retrieval/licence/attribution/limitation |
| `derived` | computed from observed inputs (e.g. FX conversion); the transformation is recorded |
| `modelled` | an explicit model prior or synthetic price; never presented as an observation |
| `unavailable` | no admissible price; **never a zero price** |

Observed, derived and modelled prices stay distinct in the UI and in saves. The
trade engine already distinguishes `priceMicroUsd` (current), `baselinePriceMicroUsd`
(admitted reference) and the executed invoice price; 0.25.7 will extend this
causally without erasing the distinction.

### Provenance

Every real datum keeps publisher, dataset, URL, reference date, retrieval date,
licence, attribution and limitation, with one of the explicit statuses
`sourced`/`observed`, `derived`, `modelled`, `partial`, `unavailable`, and
justified `not_applicable`. `unavailable != 0`: a missing observation is never a
zero tax rate, zero seats, no debt, no revenue, no production, no stock, or no
price. Modelled values stay identifiable as modelled. No post-2026-01-01 event is
injected retroactively; a later publication is admissible only when it documents
a situation applicable on the scenario date.

## Non-duplication invariants

These are the accounting guardrails 0.25 must keep; the registry and tests assert
their structural half (unique owners, full inventory, known units/statuses):

1. **One population universe** — `state.socioeconomy.regions[*].cohorts` is the
   sole population source. No second population, cohort or demographic engine.
2. **One output/income engine** — `state.socioeconomy` alone produces output and
   income; no second GDP engine and no direct `GDP *= modifier` shortcut.
3. **One fiscal treasury** — `state.fiscal` alone books revenue, spending, debt,
   cash and disposable income; governance acts through `scheduleFiscalReform`.
4. **One trade engine, one stock store** — `state.trade` alone books flows,
   prices and `TradeStock`; construction consumes the canonical trade stock
   directly, never a parallel material store.
5. **One asset store** — `state.assets` alone holds physical assets and projects.
6. **One ownership map** — `state.regionOwnership` is the sole sovereignty map;
   no economic subsystem stores a second ownership truth.
7. **Integer money** — whole USD, microUSD prices, basis-point rates; no
   fractional or floating-point money; safe integers or explicit rejection on
   overflow.
8. **`unavailable != 0`** everywhere; `UNKNOWN != ABSTAIN` and an absent datum is
   never a rejection, a zero, or a fabricated observation.

Later sub-milestones must reconcile to the canonical owner named here and register
new canonical state with `InvariantRegistry`, a dated migration that never replays
history, and save/reload + determinism + conservation coverage.

## Deferred (planned, not implemented)

- **0.25.10** Cross-system loops (no magic cross-cutting modifier).
- **0.25.11** Data / migrations / restitution (sources, units, dates, coverage, saves, information, authority-gated commands).
- **0.25.12** Performance / general review.

These are planned direction, not authorization to implement; each requires the
same review / correction / CI gate as the implemented blocks. 0.25 is accepted
only after its complete independent audit and the user's explicit acceptance.
