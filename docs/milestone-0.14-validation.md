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
- Strengthened governance invariant, schema 11 migration, deterministic schema-12 in-place upgrade including the original aggregate-only d2f3ce shape, save/reload and fidelity conservation.
- Event-driven copy-on-write state with no new scheduler loop.

## Data coverage

Fresh game: 0 persons and 0 proposals across 252 Countries.

The political registry contains 281 chambers. Fifty-seven Countries have every applicable chamber fully reconciled to named party seats with no independent/other remainder. Eight Countries contain at least one party with sourced/partial historical ideological evidence. The overlap is zero Countries, so the 57 seat-complete Countries still have unknown production voting behavior, while 195 Countries also lack complete procedure. An all-unknown chamber is unavailable rather than rejected. Tests of adopted, rejected and genuine abstention paths inject explicit differentiated goal evidence into the pure registry boundary and label it as test evidence.

The 948 parties comprise 20 sourced ideological bases, 15 partial bases and 913 neutral low-confidence fallbacks. Compromise tolerance is modelled from issue-specific ideal, intensity and confidence; it is not itself observed party behavior. For budget categories, health/education, pensions/income support and infrastructure have immediate directional evidence while administration exposes only its fiscal cost. Personal, consumption, employee/employer payroll and corporate changes use current fiscal bases when both legal rules are known. A missing current/proposed legal rule is unavailable rather than zero. Payroll employment response and corporate ownership incidence are partial; excise, property and other reserved categories remain unsupported.

## Validation results

- `npm run verify`: passed; data audit clean, production build succeeded, 27 test files and 249 tests passed. Production bundle: 3,690.12 kB, 311.86 kB gzip.
- `npm run governance:audit`: passed; 55 governance contract tests.
- `npm run governance:benchmark`: passed; 252 Countries, 281 chambers, 57 procedurally resolvable Countries, 8 Countries with differentiated ideological evidence, 0 overlap Countries, 195 procedurally unavailable Countries, 0 fresh-game persons, 0 fresh-game proposals, 24,130,605-byte fresh save, 0.0434 ms cached governance snapshot path, 270.83 ms serialization and 13.719 ms mean on-demand full proposal inspection (20 calls).
- `npm run politics:audit`: passed; 252 Countries, 948 fictional parties (20 sourced, 15 partial, 913 fallback), 20 dynamic organizations, 281 chambers and 31,736 represented seats. Its three test files passed 24 tests.
- `npm run politics:benchmark`: passed. Three-year political benchmark: 1,095 days in 88,952.04 ms, 12 ticks/s, 111.78 ms weekly changed snapshot, 378.24 ms coincident monthly/weekly snapshot, 520.53 ms reload and 30,175,307-byte save.
- `npm run benchmark:world`: passed. Baseline: 56,749 ticks/s (64.32 ms). Socioeconomy: 638 ticks/s, 28.95 ms snapshot and 15,820,573-byte save. Cached daily UI path: 0.0146 ms ordinary-day mean, 125.48 ms monthly-day mean and 1,510.93 ms total. Fiscal: 153 ticks/s, 322.69 ms monthly snapshot-day mean and 23,804,040-byte ten-year save.
- `rg -n "Math\\.random" src`: only test guards contain the literal search string; simulation runtime contains no use.

The schema-12 compatibility suite uses a hand-built d2f3ce persistence fixture rather than the current vote resolver. It covers aggregate-only enacted, rejected and all-abstain results, exact-once fiscal ownership, absence of fabricated party evaluations, deterministic upgraded round-trip, malformed aggregate rejection and strict current situational-v2 invariants.

No 0.15 interface, notification or information/perception system is included.
