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
- production TypeScript/Vite build: 105 modules transformed, main JavaScript 490.50 kB (148.46 kB gzip);
- tests: 22 files passed, 169 tests passed;
- duration: 48.35 s for the test stage.

`npm run crisis:audit` passed: 1 file, 24 tests. It covers scheduler order, snapshot branch reuse, stable baseline, degenerate stress and unavailable coverage semantics, brief and persistent danger, tipping eligibility, seed determinism, Country-order independence, worsening, recovery, hysteresis, all five types, fiscal provenance, no direct effects/cross-score cascades, schema migration, save continuation, fidelity and invariants.

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
| Runtime | 7,966.03 ms |
| Defensive full-snapshot cost | 117.29 ms |
| Save size | 23,798,589 bytes |

Every type ended with 252 `NORMAL` monitors. A separate fresh-game check confirms that all 1,260 monitors exist on 2026-01-01 with zero evaluations, pressure and history, and that the first evaluation occurs on 2026-02-01. The no-shock baseline produced no episodes because the existing 0.10/0.11 simulation remains materially stable. An initial validation exposed 43 false service/transfer cases caused by unavailable economic bases; the engine now preserves unavailable status instead of treating it as zero performance. Thresholds were not changed to force this result.

`npm run benchmark:world` passed all four workloads:

- frozen world integrity: 3,650 ticks in 53.90 ms, 67,718 ticks/s, checksum 25,750,886;
- socioeconomic runtime: 3,650 ticks in 5,874.54 ms, 621 ticks/s, snapshot 31.03 ms, save 15,820,205 bytes;
- cached daily UI path: 353 reused days and 12 changed days, 0.0158 ms reused-day mean, 126.43 ms monthly-day mean, 1,522.77 ms total;
- full fiscal/shared runtime: 3,650 ticks in 22,570.27 ms, 162 ticks/s, save 23,803,672 bytes, 0 Countries with arrears.

Explicit `Math.random` search under runtime `src` and `scripts`: `MATH_RANDOM_RUNTIME_OCCURRENCES=0`.

## Interpretation and limits

All unsourced thresholds, weights, persistence counts and hazard parameters are explicitly modelled and listed in [crisis-0.12.md](crisis-0.12.md). The benchmark runtime includes the complete economy and fiscal scheduler, so it is a conservative end-to-end cost rather than an isolated crisis-loop timing.

This milestone does not implement public perception, politics, unrest, ministers, elections, international trade, sanctions, armed forces, treaties, war crises or AI political decisions. It also creates no synthetic famine, energy, banking, pandemic or migration variables. Those remain future work.
