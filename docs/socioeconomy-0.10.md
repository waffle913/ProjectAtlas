# Milestone 0.10 — population, basic economy and administrative AI

## Integration and source of truth

The [0.16 personnel integration](military-0.16.md) minimally extends labour conservation to `employed + unemployed + reserved military = labourForce`. `employed` remains productive civilian jobs; reservations share existing population/cohorts and reduce available civilian capacity through existing equations. Military net salary is a funded public-payroll receipt in the sole fiscal household ledger, not another civilian output/GDP/population source. This is an explicit autonomous V1 engineering assumption, not a factual national employment reclassification or a replay of earlier saves.

The authorized [0.17 trade extension](trade-0.17.md), pending independent review, preserves domestic `output = consumption + otherDemandRealized`. Exportable category production is a conservative attribution within realized private residual output, never additive GDP. Paid household imports replace part of existing opening-income purchasing requests; industrial imports decompose private residual demand without diverting public orders. Actual FOB/landed/tax amounts are separate from imported availability at fixed admitted reference prices: price increases do not create extra essential goods. The complete dated canonical import tuple and prepared evidence are conserved/validated and defensively copied. Existing material readers use the explicitly modelled fixed-price availability index; there is no second population, income engine or financial-asset system.

The reusable 0.8 contracts remain the runtime: `SimulationState`, `SimulationClock`, `SimulationScheduler`, dirty domains, `InvariantRegistry`, fidelity transitions and the existing save loader. No new clock or RNG was added. New code is in `src/simulation/socioeconomy/`:

- `model.ts`: types, central model configuration, exact allocation, monthly equations, defensive copies and diagnostic API.
- `initialization.ts`: separate simulation initialization from pinned 0.4/0.5 inputs, or saved values on migration.
- `runtime.ts`: actual monthly tasks, localized immediate capacity projection and bounded administration journal.
- `invariants.ts`: system check registered in the common core invariant registry.
- `coverage.ts`: reproducible per-Country input quality and limitations.

Dynamic socioeconomic truth is `state.socioeconomy.regions[permanentRegionId]`. Existing `populationByRegion` and `economicOutputByRegion` are retained as saved initialization references for compatibility with 0.1–0.9. They are not monthly output caches. Do not sum those annual references with monthly flows. Population growth, migration and changes to income strata are outside 0.10, so population/cohorts remain fixed after initialization. Ownership is always read from `regionOwnership`; an annexation does not move or duplicate inhabitants, cohorts or income. Occupation retains its 0.7 meaning and does not silently apply economic shocks.

`App` initializes the new layer after loading the existing datasets; its default clock runs both monthly tasks. Region diagnostics expose the current simulated quantities separately from saved reference values. Country baseline summaries are explicitly labelled as references. `inspectSocioeconomy(state, regionId)` returns a defensive, serializable diagnostic including cohorts, provenance, shocks and local/global dirty marks.

## Data and provenance

No new external datasets and no edits to audited baselines or permanent IDs. Inputs are pinned WPP2024 national January 2026 projections, accepted regional demographics (including the audited WorldPop allocation), regional nominal GDP baselines, and national WDI GDP from `country-facts.json`. Initialization only admits observation reference dates on/before the scenario date; a year-only observation is interpreted as that year ending on December 31. Existing snapshots were retrieved in September 2026; they can contain later revisions of earlier observations. This is a scenario based on dated observations, **not** a reconstruction of what was publicly known on 1 January 2026. No new post-scenario observation is silently introduced.

Each field's initialization provenance records `status`, `method`, `logicalDate`, source dataset/reference dates and inputs. Real observations, allocations and priors are distinguished:

1. Preserve accepted regional population exactly. Direct single-Region national input is `sourced`; accepted spatial allocation is `derived` (it still incorporates spatial estimates, not a census at Region level).
2. For missing regional populations, use a defensible WPP national total. Allocate only the remainder after preserved local amounts, using exact largest remainder and sorted permanent Region IDs for ties. Accepted complete spatial weights are already represented in the preserved baseline. In countries lacking those accepted complete weights, the named configuration fallback `equal_region_weights_largest_remainder` uses equal weights for remaining Regions. This intentionally crude spatial hypothesis is `modelled`, never a replacement for audited demographics. Rejected raster weights are not reintroduced.
3. Without a defensible national total, keep population `unavailable`; no zero, synthetic cohorts or economy is substituted. If local accepted totals exceed the national total, initialization cannot allocate a negative remainder and leaves the missing entries unavailable.
4. Preserve accepted annual regional output. For missing output, allocate the available national GDP remainder using simulation population weights, only if all missing output Regions have population and their sum is positive. This is a `modelled` uniform-output-per-inhabitant hypothesis. Otherwise output stays unavailable.
5. The repository has no usable income-quintile or regional employment series. All income, labour, productivity and orientation parameters below are explicit **model priors**. The model does not pretend that output/input quality means monthly simulated production is observed.

The independent report is `src/data/socioeconomic-coverage-report.json`, including every Country and its limitations. Reproduce with `npm run economy:audit:generate`, verify with `npm run economy:audit`. The 0.9 audit and its strict data coverage remain unchanged.

| Regional input | Sourced | Derived | Modelled | Unavailable |
|---|---:|---:|---:|---:|
| Population | 28 | 1,711 | 2,769 | 66 |
| Output initialization | 0 | 1,681 | 2,705 | 188 |
| Income distribution | 0 | 0 | 4,508 | 66 |
| Employment | 0 | 0 | 4,386 | 188 |
| Political orientation | 0 | 0 | 4,508 | 66 |

There are 252 Countries, 4,574 Regions, 4,386 active economies and 40,572 initialized cohorts. Missing data remains inspectable. A zero-population Region may have cohorts of zero but has no calibrated economy; this is distinct from an unknown population.

## Cohorts and rounding

Nine records per known-population Region: low/middle/high income × left/centre/right orientation. First allocate population 40% / 40% / 20% across income strata, then each stratum equally over its three orientations. Largest remainder conserves every person; equal remainders use stable group order. Tiny populations can produce zero-sized cohorts.

40/40/20 describes **persons**, not national income. The modelled income shares are 20/40/40; absent population groups receive no income, with weights renormalized over nonempty groups. Orientation is labelled `modelled_noninformative_prior`. It does not represent an election result, ideology observation or inferred preference and has no economic effect.

All aggregate persons and dollars are non-negative safe integers. Products and largest-remainder divisions use `BigInt` internally; saves only contain JSON numbers. Ratios round half up, allocations floor then distribute exact remainders. Annual GDP converts to a monthly capacity anchor with `round(annual/12)`; the monthly rate times twelve can differ by at most six dollars from the annual reference per Region. This is a rate conversion, not an annual ledger. No money stock is created from that difference.

## Units and initialization

Population, labour force, employed and unemployed are person **stocks**. Output, capacity, income, consumption, demand and shortages are USD **monthly rates/flows**, never accumulated balances. `productivity = outputUsd / workers` is a rational USD/worker/month. Coverage and shocks use basis points: 10,000 = 100%. The engine has no inflation, price level, wealth, cash, inventory or savings stock in this milestone.

Each Region persists its `annualOutputReference` separately from flows, conserving national GDP allocations exactly. Let `B = round(annualOutputReference / 12)`. Central `MODEL` priors:

| Parameter | Prior |
|---|---|
| Labour force | round(60% of population) |
| Initially employed `E0` | round(95% of labour force) |
| Household income share | 65% of production/income base |
| Monthly employment adjustment | 50% toward demand-supported jobs |
| Consumption propensity low/middle/high | 95% / 85% / 65% of previous income |
| Essential share low/middle/high | 80% / 55% / 30% of consumption |
| Administration journal | last 24 entries per Country |

For a positive population, workforce and employed minima of one avoid undefined productivity in tiny Regions (both stay below population). Initial productivity is `B/E0`. Allocate `0.65 B` household income across strata, then calculate group consumption. Set `otherDemandResidual = B − householdConsumption` and essential reference amounts from this initial consumption. Thus initial output equals household consumption plus residual demand exactly, including rounding; the unshocked initialized world stays stable over ten years.

`otherDemandResidual` is an exogenous calibration closure. It is **not** public spending, investment, exports, military purchases, taxes or a treasury. Its realized portion is separately recorded; adding fiscal/trade systems later must explicitly replace/reconcile this residual to avoid double counting.

## Monthly causal equations

All multiplication/division below uses the rounding rules above. Every month:

1. Potential capacity = minimum of infrastructure anchor `B × capacityShock` and available baseline workforce times shocked productivity. Loss multipliers are bounded from zero to one.
2. Household demand by stratum = previous month's income × consumption propensity. Total demand adds fixed `otherDemandResidual`.
3. Desired employed persons = potential demand-supported production divided by shocked productivity, bounded by labour force. Employment moves 50% toward that target and is capped by available baseline workforce. Labour-unavailable persons remain in the broad unemployed/underutilized pool; this is not an official unemployment statistic.
4. Actual productive capacity = min(potential capacity, **employed × productivity**). Production = min(actual productive capacity, total demand).
5. Household income = 65% × min(production, baseline output × employed/E0). Redistribute across income strata. This becomes demand input for the next month; political orientation is never read.
6. Allocate realized output proportionally across the three household requests and residual demand using exact largest remainder. `output = consumption + otherDemandRealized` and `shortage = demand − output`. Consumption is backed by last month's income/request, so current income and consumption need not be equal. No hidden savings or government stock is booked.
7. Essential consumption by stratum = min(initial essential reference, realized stratum consumption × essential share). `basicNeedsCoverageBps` is the ratio of these fulfilled essentials to the summed references, bounded at 10,000. If all reference budgets round to zero, the ratio is conventionally 100%; this is not evidence of adequate living standards.

This is a deliberately reduced nominal feedback model. Needs are relative to initialization, not empirical poverty thresholds or nutrition measures. Positive fixed residual demand supports recovery after a shock. Integer employment can leave small rounding plateaus; tiny Regions are coarser than large Regions. Productivity, population and strata do not grow spontaneously.

## Scheduler, shocks and AI

Default `createCoreScheduler()` registers fidelity (daily, priority −1000), `socioeconomy.monthly` (monthly, priority 100) and `administration.monthly` (monthly, priority 200). No daily world economic scan. `registerSocioeconomicTasks` also supports a custom scheduler. It must only be registered once. Empty boot fixtures are a no-op until initialized.

`requestEconomicShock(state, scheduler, regionId, shock)` and `SimulationClock.setEconomicShock` are explicit exogenous test/event APIs, not policy levers. The three multipliers are capacity, productivity and labour availability in [0,10000]. Requests mark only the affected Region dirty and coalesce a persisted immediate task. While paused, the request is stored; the next day updates projected capacity, then the next monthly boundary books new flows. Repeated requests do not book extra months. A coincident scheduled/immediate boundary advances once and clears the consumed dirty domain.

`capacity` is the latest potential projection. `productionCapacity` and `output` are the last booked monthly capacity/flow and can temporarily exceed the latest projection after an immediate adverse shock. That distinction prevents invalid retroactive rewrites of a completed month.

All fidelity levels run the same equations. Fidelity-only transitions conserve the entire socioeconomic state exactly. The costly conservation scan is skipped on days without a transition; real transitions still validate it.

Administration uses the same canonical Region values, grouped by current sovereign owner, after the monthly economy. Each nonplayer Country records `maintain_parameters` with an explicit reason that no policy lever is available in 0.10. It grants no resources and changes no economic parameter. Partial and unavailable observations are labelled; unavailable output has no numeric value. `playerCountryIds` persists in state; the current map is an observer UI, so no player Country is automatically inferred from selection. Selecting a Country for inspection does not change AI control.

## Save schema 8

`SimulationState.schemaVersion` is now 8. The existing loader supports v1–v8 and rejects future versions. v7→v8 preserves date, pause/speed, ownership, saved population/output, diplomacy, claims, CBs, wars, occupation, fidelity, engine queues and seed. It initializes cohorts/economy from **saved** Region values at the saved logical date, with `modelled` provenance that explicitly says historical provenance is unknown. It does not import the January 2026 scenario over an advanced game. Unknown values stay unavailable. Older v1–v6 migrations still build their previous baselines/engine before initializing the new layer.

v8 saves persist cohorts, baseline anchors, monthly flows, relative essential budgets, shocks, provenance, player exclusions, bounded AI history and last monthly date. Reload defensively clones and validates the common registry, including socioeconomic invariants. Continuation is deterministic for the same logical steps and decisions. The clock's fractional wall-time presentation accumulator is not part of the logical simulation save contract.

## Invariants and regression boundary

Registered checks cover permanent IDs, nine unique cohorts, exact population and income-stratum conservation, integer/nonnegative quantities, labour totals, units, group income/consumption sums, output accounting, bounded needs/shocks, input quality, dirty references, dates and journal bounds. Core checks retain diplomacy/war invariants. Fidelity conservation includes the socioeconomic layer. New snapshots/deltas include it without relying on object identity.

Tests cover tiny/zero populations, huge integer allocations, unknowns, political neutrality, national totals, unchanged audited inputs, future-source exclusion, equilibrium, all three shock channels, recovery, local dirty work, actual clock/pause, coincident monthly/immediate tasks, AI exclusions/bounds, fidelity equivalence, defensive diagnostics, v7 migration and v8 continuation. The world benchmark additionally loads every Region, validates annually, preserves the unshocked economic state over ten years and round-trips the full save.

## Performance and reproducibility

`npm run benchmark:world` retains the historical 0.8 `projectatlas-world-v1` probe **unchanged**, including its omission of `derived` baselines, solely for an honest historical comparison. It is an integrity summation probe, not an economic simulation benchmark. The added `projectatlas-socioeconomy-0.10` workload initializes all accepted/derived/modelled data, runs 3,650 ticks with 119 monthly updates and records active Regions, cohorts, SHA-256 checksum, runtime, tick rate, snapshot cost and save size. Tick throughput is a batch measure, not browser FPS; elapsed timings are machine-dependent.

UI snapshots use a per-clock identity cache of deeply frozen defensive copies. Unchanged socioeconomic branches are reused across days, and unchanged cohorts/provenance remain shared even across monthly flow updates; the first snapshot and genuinely changed branches incur copying/freezing. The explicit mutable clone API remains available for saves and working copies. UI polling uses `advanceIfChanged` to skip copies and renders during pause and fractional days. React renders only the selected Region's diagnostic, never one component per cohort. The persistent world remains about 13–15 MB as JSON; compression and worker/delta transport optimization are deferred.

## Manual validation

1. Run `npm run dev`, select a Country, zoom and click a Region. Expand **Diagnostics and test shock** (keyboard Enter also works).
2. Confirm nine cohorts and provenance, monthly output/income/consumption and 100% initial relative needs. A modelled Region may correctly have an unavailable audited baseline below it.
3. Pause, select **Capacity −20%**. Date and booked flows stay unchanged; diagnostic dirty queue is populated.
4. Resume ×5. Next day updates projected capacity. At the next first of month, production and income decline; employment adjusts and needs coverage declines. Neighbouring Regions retain their independent baseline.
5. Remove shock and advance several months: production, jobs and incomes recover progressively. Pause remains responsive.
6. Unknown-input Regions show unavailable economy; they do not report a manufactured zero.

## Deliberately deferred

No taxes, fiscal rates, spending budgets, debt, banking, trade, inflation, detailed industries, political/electoral consequences, unrest/crises, endogenous demography, capital investment or wealth accounting. There are no new 0.11 policy choices. Equal regional population fallback, uniform GDP allocation, common labour/income priors, proportional rationing and relative needs remain substantive modelling limitations for later calibration. None is labelled as an observed fact.

The exact final command results and browser observations are recorded in [the validation report](milestone-0.10-validation.md).

Country API: `controlledBaselinePopulation` and `controlledBaselineAnnualOutput` read saved references; `simulatedPopulationByCountry` and `simulatedMonthlyOutputByCountry` read the current socioeconomic layer under current sovereignty. The clock rejects reference setter calls after socioeconomic initialization. See the [corrective engine contract](engine-contract.md#010-corrective-snapshot-and-reference-boundary).
