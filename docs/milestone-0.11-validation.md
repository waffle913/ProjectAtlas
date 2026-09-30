# Milestone 0.11 — validation, 2026-09-29

## Result

National fiscal engine implemented, schema 9 with fiscal sub-model v2, no 0.12 systems. One shared scheduler and economy; cached defensive snapshots preserved. Tax rules/data are separate from aggregate financing and modelled fiscal initialization. The initial five legal extracts were audited before implementation. This is an engine milestone with incomplete legal coverage, not a calibrated worldwide fiscal forecast.

## Required commands (actual runs)

- `npm run verify`: exit 0; **20 files, 143 tests passed**; test duration **44.01 s**. Country/Region/population/economic generated artifacts reproduce; **252 Countries and 4,574 Regions**, no blocking data anomalies. TypeScript and production build pass; Vite build **0.55 s**, 101 modules, main JS 472.45 kB (gzip 143.16 kB). No lint command exists in this repository.
- `npm run fiscal:audit`: exit 0; **2 files, 19 tests passed**, **3.20 s**. Legal extract SHA-256 `ebaeddebe2e71838a6beab063bc73f985faf07b7ef5a0d4cfe418c47f373f248`.
- `npm run benchmark:world`: exit 0; **4 tests passed**, **41.37 s**. All monthly fiscal invariants checked across 3,650 logical days/119 monthly executions; save/reload continuation checked. IDs unchanged. No nonfinite/negative invalid fiscal quantities. No countries with arrears at the final baseline date, 2035-12-30.

The previous 123 tests remain green. Added 18 fiscal unit/integration tests, one actual-world initialization/coverage test and one fiscal benchmark. The historical 0.10 economy checksum is unchanged.

## Exact benchmark output

```json
{
  "benchmark": "projectatlas-world-v1",
  "ticks": 3650,
  "countries": 252,
  "regions": 4574,
  "finalDate": "2035-12-30",
  "integrityChecksum": 25750886,
  "elapsedMs": 64.14,
  "ticksPerSecond": 56903
}
```

```json
{
  "benchmark": "projectatlas-socioeconomy-0.10",
  "ticks": 3650,
  "countries": 252,
  "regions": 4574,
  "activeRegions": 4386,
  "cohorts": 40572,
  "monthlyExecutions": 119,
  "finalDate": "2035-12-30",
  "checksum": "212dc47e790b4de352fb30c66289ea279eda2f5d80dfd42531bf67af1a87a415",
  "elapsedMs": 5030.99,
  "ticksPerSecond": 726,
  "snapshotMs": 22.11,
  "saveBytes": 14559989
}
```

```json
{
  "benchmark": "projectatlas-daily-ui-snapshot-0.10",
  "days": 365,
  "reusedDays": 353,
  "changedDays": 12,
  "coldSnapshotMs": 227.99,
  "reusedDayMeanMs": 0.0174,
  "monthlyDayMeanMs": 112.24,
  "dailyPathTotalMs": 1353.01,
  "checksum": "566d3326038231ff0e6ef65042acc29eb4800b65b199eedea03e7ac74f2b372d"
}
```

```json
{
  "benchmark": "projectatlas-fiscal-0.11",
  "countries": 252,
  "regions": 4386,
  "ticks": 3650,
  "months": 119,
  "finalDate": "2035-12-30",
  "elapsedMs": 21389.96,
  "ticksPerSecond": 171,
  "saveBytes": 19935896,
  "fiscalSha256": "d2c699490c5be68e51d4bc40d4fcb8a532f49f781473aa650820f3ca04acfa84",
  "reusedDays": 353,
  "changedDays": 12,
  "reusedDayMeanMs": 0.0476,
  "monthlySnapshotDayMeanMs": 316.24,
  "countriesWithArrears": 0
}
```

The fiscal benchmark includes extra monthly invariant checks and cannot be interpreted as a pure like-for-like tax calculation overhead. It is a representative validated runtime workload. Cached ordinary daily UI updates average **0.0476 ms**; the fiscal/economic branches are reused on **353 days** and replaced on **12 monthly days**. Those monthly UI days average **316.24 ms**, versus **112.24 ms** for the fiscal-disabled 0.10 probe. This monthly main-thread pause is a real remaining performance limitation; moving simulation/snapshot transport to a worker or introducing narrower monthly UI projections remains future work. No daily deep clone was reintroduced.

## Coverage

| Legal category | Sourced complete | Partial | Unavailable |
| --- | ---: | ---: | ---: |
| Personal income | 0 | 1 | 251 |
| Consumption | 0 | 1 | 251 |
| Payroll/social contributions | 0 | 1 | 251 |
| Corporate | 0 | 2 | 250 |

The partial rules are US federal single-filer PIT, US employee/employer payroll, US corporate rate, Canadian federal GST and Canadian general corporate rate. Every other legal country/category combination stays unavailable. No unknown rate is stored as zero. National observations of public revenue, spending, debt, interest and services remain unavailable for all 252 Countries. The accepted aggregate-observation file therefore contains zero records and states that explicitly. Actual engine initialization: **209 complete usable economic bases, 43 unavailable**, **4,386 active regional fiscal ledgers**. All 252 Countries have explicit fiscal status; the 43 without bases do not receive fictional households, production or known service coverage. Per-Country reports distinguish legal, aggregate-source and simulation initialization coverage.

Collection efficiency, taxable consumption share, wage/surplus bases, representative taxpayers, recipients, initial dollar budgets, residual financing, debt/cash/rate, financing limits and service reference costs are modelled. `knownTaxRevenue` is calculated only from available legal rules. `otherRevenue` is the fixed baseline residual with its own provenance, and `totalRevenue` is their sum. Debt zero is tagged modelled and cannot be read as an observation. Their exact centralized parameters, sources, equations, counterparties and limitations are documented in [fiscal-0.11.md](fiscal-0.11.md).

The dedicated unknown-law fixture has all four legal policy entries `null`. After ten unchanged years it still has `knownTaxRevenue = 0`, receives only its fixed modelled `otherRevenue`, and ends with debt, interest arrears and all primary arrears equal to zero. Its stress output carries `financingBaselineStatus: modelled`; legal unavailability alone therefore does not manufacture a future crisis trigger.

## Causal tests (synthetic fixtures, not US forecasts)

Fixture: 10,000 persons, monthly output USD 100,000,000, initial US federal rules. PIT reform on 2026-02-01 replaces the schedule with a modelled 50% flat schedule and no allowance.

| Quantity | Baseline | Reform |
| --- | ---: | ---: |
| PIT liability, February USD | 7,972,333 | 32,500,000 |
| Known tax revenue, February USD | 16,971,298 | 39,046,198 |
| Fixed other revenue, February USD | 0 | 0 |
| Total revenue, February USD | 16,971,298 | 39,046,198 |
| Overall balance, February USD | 9,471,298 | 31,546,198 |
| Household disposable income, February USD | 57,412,725 | 35,337,825 |
| Household net demand, March USD | 45,892,243 | 28,173,358 |

February output is identical: transmission occurs via the following month's demand. A separate corporate-rate test lowers retained surplus without altering gross output or household disposable income directly. Transfer tests reconcile every paid dollar between government expense and recipient income.

Service fixture: initial capacity 10,000 person-equivalents, required resources USD 1,500,000/month. Twelve unfunded months produce backlog **USD 18,000,000** and capacity **3,523**, coverage **35.23%**. The first month restored to USD 3,000,000 yields backlog **USD 16,500,000** and capacity **4,062**, coverage **40.62%**. Recovery is gradual, not an instantaneous quality multiplier.

## Manual check

1. Start `npm run dev`, select US or Canada, open **Fiscal debug**.
2. Inspect policy provenance, modelled initialization and missing-rule status. Advance to February 1 to see the first executed account.
3. Pause and prepare a dated JSON reform. For a tax change label the modified rule `modelled`, with debug ID/source/document/limitations; edit rate or bands. Apply, resume and compare liability, known/other/total revenue, balance and disposable income at the boundary, then household demand the following month. `otherRevenue` must remain unchanged.
4. Set annual health budget to zero; after several monthly steps inspect health backlog/capacity. Restore its prior amount and observe gradual recovery.
5. Inspect a country without sourced laws: policy entries are null/unavailable, known tax revenue is zero, residual revenue and stress carry modelled provenance, and debt zero is explicitly modelled rather than observed.

Browser automation could not initialize (`failed to write kernel assets`, missing local path). Therefore visual layout and mouse interaction are **not manually verified**. The debug component passed TypeScript/build and shares the tested engine API; no visual success is claimed.

## Changed areas and remaining limits

- New `src/simulation/fiscal/{model,math,runtime,invariants}.ts`: typed national accounts, representative taxes, service dynamics, finance, reform API and reconciliations.
- Existing `types`, clock, scheduler assembly, state copying, save migrations, invariants, world deltas and socioeconomic monthly runtime: fiscal integration and schema 9. Existing tests/fixtures only updated where the current schema now requires fiscal state.
- New pinned legal and aggregate-source data, per-Country legal/initialization reports, `scripts/fiscal-audit.mjs`, package audit commands.
- New `FiscalDebug.tsx`; App initializes fiscal state and CountryPanel displays diagnostics.
- New fiscal tests, world coverage test and benchmark; documentation and engine contract updated.

Open limits: sparse tax and aggregate-observation coverage and modelled fiscal baselines; no sourced FX or non-USD monetary thresholds; simplified taxpayers/beneficiaries; no full corporate accounts, taxpayer arrears, creditor assets or physical service supply chain; deferred employer hiring incidence and investment; fixed 2026 laws until explicit reform; monthly snapshot latency described above; visual check pending. Fiscal indicators exist but no crises/politics/markets were added. Saves persist policy, frozen revenue calibration and provenance, reform queue/history, cash/debt and provenance, budgets, services, last accounts and next-demand drivers; schema 8 economic state is preserved without retroactive fiscal history. Initial schema-9 fiscal-v1 saves upgrade deterministically to fiscal-v2 without changing the global schema.
