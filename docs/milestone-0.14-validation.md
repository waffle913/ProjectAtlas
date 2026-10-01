# Milestone 0.14 validation

## Delivered contracts

- Global save schema 12 and `governance-0.14-v1`.
- Deterministic fictional person and proposal sequence IDs.
- Separate player control, party membership, party leadership and office authority.
- Explicit office assignment, revocation, party changes and control commands.
- Fiscal and budget draft, submission, withdrawal, deterministic vote and resolution lifecycle.
- Pure public and parliamentary estimates plus defensive debug inspection.
- Delta-based explainable political impact classification.
- Enactment exclusively through the validated fiscal reform queue.
- Governance invariant, schema 11 migration, save/reload and fidelity conservation.
- Event-driven copy-on-write state with no new scheduler loop.

## Data coverage

Fresh game: 0 persons and 0 proposals across 252 Countries.

The political registry contains 281 chambers. Fifty-seven Countries have every applicable chamber fully reconciled to named party seats with no independent/other remainder. The other 195 are unavailable for final resolution under the strict V1 procedure. The current 57 complete-seat Countries have neutral low-confidence party ideology at the relevant proposal dimensions, so the engine abstains rather than inventing votes. Tests of adopted and rejected paths inject explicit differentiated party evidence into the pure registry boundary.

## Validation results

- `npm run verify`: passed; data audit clean, production build succeeded, 27 test files and 213 tests passed. Production bundle: 3,682.42 kB, 309.79 kB gzip.
- `npm run governance:audit`: passed; 19 governance contract tests.
- `npm run governance:benchmark`: passed; 252 Countries, 281 chambers, 57 procedurally resolvable Countries, 195 unavailable, 0 fresh-game persons, 0 fresh-game proposals, 24,130,585-byte fresh save, 0.0222 ms cached governance snapshot path, 276.17 ms serialization.
- `npm run politics:audit`: passed; 252 Countries, 948 fictional parties, 20 dynamic organizations, 281 chambers and 31,736 represented seats. Its three test files passed 24 tests. Three-year political benchmark: 1,095 days in 93,126.07 ms, 12 ticks/s, 100.98 ms weekly changed snapshot, 391.57 ms coincident monthly/weekly snapshot, 547.36 ms reload and 30,175,287-byte save.
- `npm run benchmark:world`: passed. Baseline: 67,773 ticks/s. Socioeconomy: 654 ticks/s and 28.21 ms snapshot. Cached daily UI path: 0.0157 ms ordinary-day mean and 119.94 ms monthly-day mean. Fiscal: 154 ticks/s, 347.14 ms monthly snapshot-day mean and 23,804,020-byte ten-year save.
- `rg -n "Math\\.random" src`: only test guards contain the literal search string; simulation runtime contains no use.

No 0.15 interface, notification or information/perception system is included.
