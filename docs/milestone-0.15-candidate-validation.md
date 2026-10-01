# Milestone 0.15 candidate validation evidence

**Status: implementation evidence for independent review; 0.15 is not accepted.**
The canonical handoff remains at accepted milestone 0.14.

## Revision and scope

- Required base: `99013c9cd8476ff44e46f9eb57bb060fd9cb4b6f`.
- Task branch: `waffle913-milestone-015-government-information`.
- Candidate: Government Information, event-driven briefings, fictional party
  leaders and succession, and a playable interface over existing systems.
- Save schema: 13. Migration 12 → 13 preserves the saved date, tick, seed,
  fiscal and governance state; it initializes empty Government Information on
  the migration date and fills missing party leaders without creating past
  briefings.
- No 0.16 systems are included. `docs/agent-handoff.md` is intentionally
  unchanged.

## Implementation evidence

Government Information is a delayed, provenance-labelled layer derived from
existing socioeconomic reports. Internal access follows a person's recorded
office capabilities; country control, party membership and leadership do not
grant executive access. Public parliamentary outcomes remain public.

Briefings are event/change-driven and reference authoritative proposal votes,
monthly unemployment reports, and existing crisis episodes. The bounded feed
holds at most 256 items; old reports are retained only while current or
referenced. The current triggers do not create urgent briefings or pause the
simulation. Tell Me More reads saved analysis and canonical evidence under the
same access checks. Guided, Standard and Expert change presentation only and
are not part of simulation state, scheduling or RNG.

All 948 gameplay party leaders are distinct deterministic fictional persons.
The reviewed source inventory has 0 sourced/observed leader mappings, 0
derived mappings, 948 modelled gameplay leaders, 948 unavailable source
mappings, and 0 ambiguous mappings. No real-world leader is used as the
gameplay person. Source-party and identity evidence remains explicit in the
coverage report; the absence of leader data is not represented as an
observation.

Succession selects an eligible existing member or generates a deterministic
fictional successor based on the party's validated profile. Leadership loss
does not change player control. A persisted handoff choice can continue as the
former person or explicitly switch to the successor once.

The start flow is Country → Party → Leader and does not grant an office.
Fiscal controls submit the existing governance proposal command; they do not
mutate fiscal state directly. Country and Region panels display only published
information available to their access scope.

## Validation commands and results

| Command | Result |
|---|---|
| `npm run verify` | Passed: country, Region, population, economy and aggregate data audits; TypeScript/build; 267 tests across 29 files. Vite reports a 3,729.98 kB JS chunk (323.67 kB gzip). |
| `npm run information:test` | Passed: 13 focused information tests, including access, reporting, briefings and migration/save behavior. |
| `npm run information:audit` | Passed: 948 party records and coverage report are reproducible. |
| `npm run information:benchmark` | Passed: full-world benchmark; measurements below. |
| `npm run governance:audit` | Passed: 59 governance tests, including succession chronology invariants. |
| `npm run governance:benchmark` | Passed: 948 generated leaders; governance snapshot, save, and proposal-analysis measurements below. |
| `npm run fiscal:audit` | Passed: 19 fiscal tests. |
| `npm run politics:data:generate` | Passed: generated 252 countries, 948 parties, 20 organizations, 281 chambers and 31,736 represented seats. |
| `npm run politics:audit:generate` | Passed after normalizing source-snapshot line endings before hashing; generated political coverage evidence. |
| `npm run politics:audit` | Passed: politics audit and 24 tests across three files, including the three-year world benchmark. |
| `npm run benchmark:world` | Passed: four world benchmark tests; socioeconomic benchmark was 10 years in 6,335.72 ms (576 ticks/s). |
| `rg "Math\\.random" src/simulation/information src/simulation/governance src/App.tsx src/components` | No matches in the changed runtime/UI paths. |
| `git diff --check` | Passed with no whitespace errors. |

The broad verification emitted a Vite chunk-size warning; tests completed
successfully. Vitest also emitted worker-shutdown notices on some earlier
targeted benchmark runs after reporting successful test completion. These are
recorded as tooling observations, not treated as failed tests.

## Measured workload and save impact

The 0.15 full-world information benchmark measured 252 countries, 4,574
regions, 948 gameplay parties and 948 active leaders:

| Measurement | Result |
|---|---:|
| Isolated leader generation | 163.80 ms |
| Single-party leader lookup (warmed average over 1,000 lookups) | 0.0249 ms |
| New-game initialization | 340.11 ms |
| First monthly report generation (252 reports) | 4.11 ms |
| Information state after first report | 224,225 bytes |
| Serialized 256-briefing history | 123,905 bytes |
| Current save | 14,963,563 bytes |
| Estimated schema-12 save without 0.15 | 12,178,537 bytes |
| Estimated save delta | 2,785,026 bytes |
| Ordinary day | 0.4444 ms |
| Monthly changed day | 92.31 ms |
| Deterministic fallback succession | 0.79 ms |

The governance world benchmark measured 948 people-leaders, a 26,915,631-byte
save, 0.0434 ms snapshot, 309.91 ms serialization, and 14.613 ms mean
proposal analysis. The three-year politics world benchmark measured 86,200.24
ms elapsed, 13 ticks/s, 105.94 ms weekly changed snapshot, 357.04 ms
coincident monthly/weekly snapshot, 575.02 ms reload, and a 33,195,009-byte
save. Benchmark figures are workload- and environment-specific, not device
guarantees. Save sizes differ because the benchmarks cover different world
state workloads.

## Assumptions, provenance and limitations

- The scenario remains dated 2026-01-01. Missing coverage remains unavailable;
  monthly unemployment aggregates use existing regional labor-force and
  unemployed stocks only.
- IPU Parline supplies institutional and seat evidence, not party leadership.
  V-Party observations are historical priors (2017–2019), not 2026 facts; its
  dataset licence remains `requires_confirmation`. Wikidata officeholder data
  has no reviewed party crosswalk and its snapshot licence is also
  `requires_confirmation`.
- Therefore no leader-source mappings are asserted. Every gameplay leader is
  fictional and modelled, with the source-coverage report distinguishing that
  from observed coverage.
- Unemployment is the only Government Information report currently emitted.
  Confidential defense/diplomacy intelligence, public perception, autonomous
  ministers, cabinet politics, and new policy instruments are out of scope.
- Fiscal UI currently exposes the existing corporate-tax proposal route only.
  No unsupported proposal is presented as functional.
- Current briefing triggers are advisory or important; the model's urgent
  pause path is not exercised.
- The added leadership state accounts for an estimated 2,785,026 bytes in the
  full-world schema comparison. The measured monthly changed day and initial
  leader creation are the main observed costs; no causality or provenance was
  traded for performance.

This report records candidate implementation and validation evidence only.
Acceptance remains subject to independent review.
