# Milestone 0.12 validation

Validated on 2026-09-29 from accepted 0.11 commit `98848694df891d75e1eda6f01747b8a572dbb96a`.

## Delivered contract

- Global save schema: 10.
- Crisis model: `crisis-0.12-v1`.
- Five material monitors only: fiscal stress, public-service degradation, household distress, transfer-system stress and infrastructure degradation.
- Shared monthly scheduler task at priority 300, after economy, fiscal/services and administration.
- Persistent `NORMAL → PRESSURE → ACTIVE → RECOVERING → NORMAL` episodes with hysteresis, bounded history, deterministic recurrence IDs and decomposed tripwires.
- Shared keyed RNG used only for eligible tipping. Crisis evaluation applies no direct effects.
- Schema 9 migration starts monitoring at the saved date without invented history.
- Crisis branch added to cloning, cached snapshots, deltas, invariants and fidelity conservation.

## Exact validation results

`npm run verify` passed:

- source/data audit: 252 Countries, 4,574 Regions, no blocking anomalies;
- production TypeScript/Vite build: 104 modules transformed, main JavaScript 490.87 kB (148.19 kB gzip);
- tests: 22 files passed, 164 tests passed;
- duration: 46.71 s for the test stage.

`npm run crisis:audit` passed: 1 file, 20 tests. It covers scheduler order, snapshot branch reuse, stable baseline, brief and persistent danger, tipping eligibility, seed determinism, Country-order independence, worsening, recovery, hysteresis, all five types, fiscal provenance, no direct effects/cross-score cascades, schema migration, save continuation, fidelity and invariants.

`npm run crisis:benchmark` passed on 252 Countries over five years:

| Measure | Result |
| --- | ---: |
| Ticks | 1,825 |
| Monthly evaluations | 59 |
| Country/type evaluations | 74,340 |
| Pressure episodes | 0 |
| Active episodes | 0 |
| Recovering episodes | 0 |
| Ended episodes | 0 |
| Runtime | 8,054.86 ms |
| Defensive full-snapshot cost | 118.14 ms |
| Save size | 23,744,666 bytes |

Every type ended with 252 `NORMAL` monitors. The no-shock baseline produced no episodes because the existing 0.10/0.11 simulation remains materially stable. An initial validation exposed 43 false service/transfer cases caused by unavailable economic bases; the engine now preserves unavailable status instead of treating it as zero performance. Thresholds were not changed to force this result.

`npm run benchmark:world` passed all four workloads:

- frozen world integrity: 3,650 ticks in 61.12 ms, 59,721 ticks/s, checksum 25,750,886;
- socioeconomic runtime: 3,650 ticks in 5,679.93 ms, 643 ticks/s, snapshot 32.40 ms, save 15,939,272 bytes;
- cached daily UI path: 353 reused days and 12 changed days, 0.0145 ms reused-day mean, 119.12 ms monthly-day mean, 1,434.55 ms total;
- full fiscal/shared runtime: 3,650 ticks in 22,448.49 ms, 163 ticks/s, save 23,749,792 bytes, 0 Countries with arrears.

Explicit `Math.random` search under runtime `src` and `scripts`: `MATH_RANDOM_RUNTIME_OCCURRENCES=0`.

## Interpretation and limits

All unsourced thresholds, weights, persistence counts and hazard parameters are explicitly modelled and listed in [crisis-0.12.md](crisis-0.12.md). The benchmark runtime includes the complete economy and fiscal scheduler, so it is a conservative end-to-end cost rather than an isolated crisis-loop timing.

This milestone does not implement public perception, politics, unrest, ministers, elections, international trade, sanctions, armed forces, treaties, war crises or AI political decisions. It also creates no synthetic famine, energy, banking, pandemic or migration variables. Those remain future work.
