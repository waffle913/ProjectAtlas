# Milestone 0.10 validation — 2026-09-28

Environment: Windows, Node v24.21.0, npm 11.19.0, Vitest 5.0.2, Vite 8.3.1.

`npm run verify`: exit 0. All data audits passed; TypeScript (`tsc -b`) and production Vite build passed. **17 test files, 113 tests passed**, test duration 10.87 seconds. This includes the previous 92 tests, updated current-schema fixtures, plus 21 new tests/cases. No lint command is configured in this repository. `git diff --check` passed.

Exact data audit output:

```text
Generated 252 registry entities (193 UN members), 177 mapped territories and 75 entities without bundled geometry.
Generated country data matches the pinned source snapshots.
Generated 4574 regions for 252 countries: 213 Admin-1, 39 fallback, 4557 mapped source features.
Generated Region registry and runtime geography match the pinned source snapshot.
Population artifacts reproduce identically from pinned compact inputs.
Economic artifacts reproduce identically from committed country facts and demographics.
Audited 252 Countries and 4574 Regions with no blocking anomalies.
Population coverage: 1739/4574 Regions (38.02%), 102/252 Countries (40.48%).
Economic coverage: 1681/4574 Regions (36.75%), 83/252 Countries (32.94%).
```

These are the unchanged **audited** coverage numbers. The expanded **simulation** coverage is in [the independent per-Country 0.10 report](../src/data/socioeconomic-coverage-report.json), reproduced and verified by the test suite. Its modelled initialization fills gaps without changing these audited sources.

`npm run benchmark:world`: exit 0; 2 tests passed, total Vitest duration 8.46 seconds. Exact results:

```json
{
  "benchmark": "projectatlas-world-v1",
  "ticks": 3650,
  "countries": 252,
  "regions": 4574,
  "finalDate": "2035-12-30",
  "integrityChecksum": 25750886,
  "elapsedMs": 63.03,
  "ticksPerSecond": 57913
}
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
  "elapsedMs": 4604.8,
  "ticksPerSecond": 793,
  "snapshotMs": 22.07,
  "saveBytes": 14559893
}
```

The historical v1 probe intentionally excludes derived records and only sums values. Its 63.03 ms is not directly comparable with 4,604.80 ms for actual economy and administration, including annual invariant validation. The 0.10 workload has 4,386 active economies and 40,572 cohorts. No economic scan occurs daily. The full defensive snapshot took 22.07 ms in this run; the initial structuredClone implementation measured 154.42 ms before replacement. Measurements vary with concurrent load and are not browser FPS guarantees. Save size is 14,559,893 UTF-8 bytes, uncompressed. Checksum matched the previous final-state run; core continuation equality and full-world reload are tested.

Manual browser smoke test on localhost:

- Loaded the actual scenario in the in-app browser with no console errors.
- Selected France → Morbihan (`region.f16c33fd-9e4d-45b5-aff8-81575839946c`). Confirmed explicitly modelled population/output and separate unavailable audited baselines.
- Initial production: USD 2,892,023,342/month; employed: 391,953; consumption: USD 1,485,053,986/month; relative needs: 100%.
- Queued a −20% capacity shock while paused, resumed at ×5. By 2027-12-28, production was USD 2,313,618,674/month, employed 313,563, consumption USD 1,059,216,039/month and relative needs 71.33%.
- Removed the shock. By 2029-03-09, production recovered to USD 2,883,198,662/month, employed 390,757, consumption USD 1,477,609,306/month and relative needs 99.50%. Paused successfully. Temporary preview and server were closed after testing.

Save schema: **8**. Migration from 7 retains saved advanced state and initializes only the new layer. Legacy 1–6 migration tests remain green. Tests exercise pending shock persistence, local immediate projection, coincident monthly/immediate boundaries, true monthly clock execution, stability, losses and recovery, political neutrality, unknowns, zero/tiny inputs, defensive cloning, fidelity conservation and rejection of observations after the logical date (including the same calendar year's unfinished annual observation).

Remaining limitations are substantive model assumptions, documented in [the model contract](socioeconomy-0.10.md): generic equal-region population fallback, uniform output per inhabitant, common income/labour priors, relative needs rather than measured poverty, exogenous residual demand, integer granularity, large uncompressed saves and no 0.11 fiscal/trade/price systems. No empirical political preferences are inferred.
