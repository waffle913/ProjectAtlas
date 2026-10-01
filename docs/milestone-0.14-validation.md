# Milestone 0.14 validation

## Delivered contracts

- Global save schema 12 and `governance-0.14-v1`.
- Deterministic fictional person and proposal sequence IDs.
- Separate player control, party membership, party leadership and office authority.
- Explicit office assignment, revocation, party changes and control commands.
- Fiscal and budget draft, submission, withdrawal, deterministic vote and resolution lifecycle.
- Coverage-aware `ProposalAnalysis`: structural fiscal diff, material context, immediate causal consequences, unsupported changes and limitations.
- Issue-specific party ideals, priorities, compromise tolerances and evidence confidence.
- Continuous deterministic party/public agreement before centralized YES/NO/ABSTAIN/UNKNOWN classification.
- Explicit `UNKNOWN` voting behavior and public weight, distinct from genuine abstention/neutrality.
- Tax-only counterfactuals preserve transfers and other non-tax flows; VAT burden uses consumption-tax incidence without changing disposable cash income.
- Pure public and parliamentary estimates with party drivers/trade-offs plus defensive debug inspection.
- Enactment exclusively through the validated fiscal reform queue, with immutable proposal origin, fingerprint and application receipt.
- Strengthened governance invariant, schema 11 migration, deterministic schema-12 in-place upgrade, save/reload and fidelity conservation.
- Event-driven copy-on-write state with no new scheduler loop.

## Data coverage

Fresh game: 0 persons and 0 proposals across 252 Countries.

The political registry contains 281 chambers. Fifty-seven Countries have every applicable chamber fully reconciled to named party seats with no independent/other remainder. Eight Countries contain at least one party with sourced/partial historical ideological evidence. The overlap is zero Countries, so the 57 seat-complete Countries still have unknown production voting behavior, while 195 Countries also lack complete procedure. An all-unknown chamber is unavailable rather than rejected. Tests of adopted, rejected and genuine abstention paths inject explicit differentiated goal evidence into the pure registry boundary and label it as test evidence.

The 948 parties comprise 20 sourced ideological bases, 15 partial bases and 913 neutral low-confidence fallbacks. Compromise tolerance is modelled from issue-specific ideal, intensity and confidence; it is not itself observed party behavior. For budget categories, health/education, pensions/income support and infrastructure have immediate directional evidence while administration exposes only its fiscal cost. Personal, consumption, employee/employer payroll and corporate changes use current fiscal bases when both legal rules are known. A missing current/proposed legal rule is unavailable rather than zero. Payroll employment response and corporate ownership incidence are partial; excise, property and other reserved categories remain unsupported.

## Validation results

- `npm run verify`: passed; data audit clean, production build succeeded, 27 test files and 245 tests passed. Production bundle: 3,689.65 kB, 311.76 kB gzip.
- `npm run governance:audit`: passed; 51 governance contract tests.
- `npm run governance:benchmark`: passed; 252 Countries, 281 chambers, 57 procedurally resolvable Countries, 8 Countries with differentiated ideological evidence, 0 overlap Countries, 195 procedurally unavailable Countries, 0 fresh-game persons, 0 fresh-game proposals, 24,130,605-byte fresh save, 0.0182 ms cached governance snapshot path, 260.14 ms serialization and 13.542 ms mean on-demand full proposal inspection (20 calls).
- `npm run politics:audit`: passed; 252 Countries, 948 fictional parties (20 sourced, 15 partial, 913 fallback), 20 dynamic organizations, 281 chambers and 31,736 represented seats. Its three test files passed 24 tests.
- `npm run politics:benchmark`: passed. Three-year political benchmark: 1,095 days in 89,389.08 ms, 12 ticks/s, 97.22 ms weekly changed snapshot, 369.96 ms coincident monthly/weekly snapshot, 519.33 ms reload and 30,175,307-byte save.
- `npm run benchmark:world`: passed. Baseline: 58,466 ticks/s (62.43 ms). Socioeconomy: 651 ticks/s, 27.16 ms snapshot and 15,820,573-byte save. Cached daily UI path: 0.0156 ms ordinary-day mean, 117.96 ms monthly-day mean and 1,420.99 ms total. Fiscal: 162 ticks/s, 410.69 ms monthly snapshot-day mean and 23,804,040-byte ten-year save.
- `rg -n "Math\\.random" src`: only test guards contain the literal search string; simulation runtime contains no use.

No 0.15 interface, notification or information/perception system is included.
