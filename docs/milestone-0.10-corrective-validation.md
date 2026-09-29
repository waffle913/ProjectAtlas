# Milestone 0.10 architecture correction — 2026-09-29

Scope: cached defensive UI snapshots and an explicit boundary between saved references and current socioeconomic aggregates. Schema 8, source datasets, IDs, economic formulas, fallbacks and migration behavior are unchanged. No 0.11 system was added.

## Implementation

- `state.ts`: small per-clock WeakMap cache for JSON-like branches. Changed branches are copied, recursively frozen and cached; unchanged branches are reused without traversal. Copies never expose canonical engine references. Existing `cloneSimulationState` remains an uncached, editable defensive copy.
- `clock.ts`: UI snapshots use this cache; diplomacy/war setters preserve unrelated socioeconomic identity. Reference setters reject all calls after socioeconomic initialization, including restored worlds.
- `region.ts`: historical helpers renamed to `controlledBaselinePopulation`, `controlledBaselineAnnualOutput`, `originalBaselinePopulation`, `originalBaselineAnnualOutput`. Current readers `simulatedPopulationByCountry` and `simulatedMonthlyOutputByCountry` sum the socioeconomic Region values under current sovereignty. Missing or empty coverage returns undefined; real zero remains zero. No fallback to baseline maps.
- `App.tsx` / `CountryPanel.tsx`: explicit reference props and separate current population/monthly output rows.
- Tests: unchanged-day reference identity, monthly invalidation, nested cohort sharing, old snapshot stability, deep mutation rejection, constructor input isolation, pause and each speed, local shock invalidation, unrelated setters, reference guards after reload, current totals versus reference maps, transfers and incomplete coverage.

Pure transition contract: engine systems replace changed objects and their ancestors. In-place mutation of canonical branches is not supported by the snapshot cache. UI copies are deeply frozen; clients needing an editable working copy must explicitly clone them. This introduces no persisted cache, revision counter, framework or new save schema.

## Exact checks

- `npm run verify`: exit 0; data audits, TypeScript and production build passed; **18 files / 123 tests passed**, Vitest duration **15.69 s**. Vite build **1.96 s**.
- `npm run economy:audit`: exit 0; **1 file / 5 tests passed**, duration **3.91 s**; committed per-Country report reproduced with unchanged coverage (252 Countries, 4,574 Regions, 4,386 active economies, 40,572 cohorts).
- `npm run benchmark:world`: exit 0; **1 file / 3 tests passed**, duration **10.84 s**.

Exact benchmark records:

```json
[
  {
    "benchmark": "projectatlas-world-v1",
    "ticks": 3650,
    "countries": 252,
    "regions": 4574,
    "finalDate": "2035-12-30",
    "integrityChecksum": 25750886,
    "elapsedMs": 55.71,
    "ticksPerSecond": 65519
  },
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
    "elapsedMs": 4594.98,
    "ticksPerSecond": 794,
    "snapshotMs": 21.7,
    "saveBytes": 14559893
  },
  {
    "benchmark": "projectatlas-daily-ui-snapshot-0.10",
    "days": 365,
    "reusedDays": 353,
    "changedDays": 12,
    "coldSnapshotMs": 295.05,
    "reusedDayMeanMs": 0.0128,
    "monthlyDayMeanMs": 98.21,
    "dailyPathTotalMs": 1183.1,
    "checksum": "566d3326038231ff0e6ef65042acc29eb4800b65b199eedea03e7ac74f2b372d"
  }
]
```

The economic checksum is now asserted against the previous 0.10 result: `212dc47e790b4de352fb30c66289ea279eda2f5d80dfd42531bf67af1a87a415`. The old economic benchmark and full mutable-copy measurement are retained.

The new daily benchmark executes the real `SimulationClock.advanceIfChanged(1000)` path over a full year. It verifies 353 reused socioeconomic branches and 12 changed branches, and checks its final state against direct scheduler execution. The **0.0128 ms** unchanged-day mean includes the daily scheduler, date/tick advancement and defensive snapshot cache lookup. The **98.21 ms** monthly-day mean includes economic work and copying/freezing changed objects. The **1,183.10 ms** total excludes the separate **295.05 ms** cold snapshot and clock initialization. First-use freezing/cache population costs more than an ordinary mutable clone; it is paid once rather than daily. No browser rendering time is included, and these measurements are not frame-rate guarantees.

The original manual 0.10 validation is retained in `milestone-0.10-validation.md`; it describes that earlier commit, not the revised snapshot API. No source/audit data was regenerated into new content by this correction.
