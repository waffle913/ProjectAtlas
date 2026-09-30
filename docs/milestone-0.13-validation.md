# Milestone 0.13 validation

Implemented from accepted milestone 0.12 commit `e2f8a5d1b317876c7fad0b59bb95128e45abaab9`.

## Delivered contract

- Global save schema 11 and politics model `politics-0.13-v1`.
- National institutions with explicit provenance and unavailable fields where 2026-01-01 evidence is absent.
- Three fictional multidimensional parties and two fictional organizations per Country.
- Population-weighted Region and Country opinion over the existing nine socioeconomic cohorts.
- Weekly deterministic material-response dynamics at scheduler priority 400.
- Exact 10,000-bps support accounting, inertia, bounded diagnostics and no direct crisis bonus.
- Schema 10 migration, save/reload, cached snapshots, delta detection, fidelity conservation and debug inspection.
- No 0.14 player decisions, elections, legislation, votes, actions or political effects.

## Coverage

The committed coverage audit contains 252 Country rows. Office structure is partial for 199 entities and unavailable for 53. Executive-system classification, legislatures, electoral systems, seats and coalitions remain unavailable for all 252 because no admissible snapshot applicable on 2026-01-01 establishes them. Parties, organizations and opinion priors are explicitly modelled and fictional.

## Validation results

`npm run verify` passed:

- source/data audit: 252 Countries and 4,574 Regions, no blocking anomaly;
- production build: 110 modules transformed, main JavaScript 510.69 kB (154.04 kB gzip);
- tests: 24 files and 184 tests passed;
- test-stage duration: 102.11 s.

`npm run politics:audit` passed 15 focused/full-world tests and verified:

- 199 partial and 53 unavailable institution profiles;
- 252 unavailable legislatures, electoral systems, seat distributions and coalitions;
- 756 fictional modelled parties;
- 504 fictional modelled organizations.

The audit test stage completed in 92.31 s. Its three-year world benchmark recorded 156 weekly runs and 713,544 Region evaluations.

`npm run politics:benchmark` passed all three workloads. The final three-year result was:

| Measure | Result |
| --- | ---: |
| Countries / Regions / cohorts | 252 / 4,574 / 40,572 |
| Parties / unions / associations | 756 / 252 / 252 |
| Chambers / represented seats | 0 / 0 |
| Weekly runs / Region evaluations | 156 / 713,544 |
| Ticks | 1,095 |
| Runtime | 83,583.90 ms |
| Ticks per second | 13 |
| Cold defensive snapshot | 940.32 ms |
| Reused unchanged snapshot | 0.0020 ms |
| Full save reload | 1,377.10 ms |
| Save size | 77,552,988 bytes |

Zero chambers and seats are a coverage result: no admissible 2026-01-01 source was added for those facts, so the engine does not invent them.

`npm run benchmark:world` passed all four established workloads:

- frozen world integrity: 3,650 ticks in 65.52 ms, 55,706 ticks/s, checksum 25,750,886;
- socioeconomic runtime: 3,650 ticks in 5,487.73 ms, 665 ticks/s, snapshot 38.23 ms, save 15,820,368 bytes;
- cached daily UI path: 353 reused days and 12 changed days, 0.0152 ms reused-day mean, 117.51 ms monthly-day mean, 1,415.55 ms total;
- fiscal/shared runtime: 3,650 ticks in 24,363.31 ms, 150 ticks/s, save 23,803,835 bytes, zero Countries with arrears.

Explicit runtime search returned `MATH_RANDOM_RUNTIME_OCCURRENCES=0`.

## Interpretation and limits

No new factual source snapshot was added. The existing dated political-office registry is reused; all other initial political content is explicitly modelled or unavailable. Modelled assumptions include fictionalization, ideology and issue priors, initial support, engagement, cohort sensitivity, material-response equations, salience dynamics and inertia. See [politics-0.13.md](politics-0.13.md) for their contract.

The political state is deliberately detailed and makes the full save about 77.55 MB. Daily structural sharing avoids paying that copy cost when the politics branch is unchanged, while the three-year weekly workload establishes a performance baseline for later optimization.

No 0.14+ system was implemented: there are no player political decisions, elections, campaigns, legislation, votes, ministers, media, propaganda, demonstrations, strikes, repression, coups or political AI actions.
