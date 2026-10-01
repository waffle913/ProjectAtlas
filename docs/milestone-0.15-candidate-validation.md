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
The reviewed source inventory has 0 sourced/observed leader mappings, 2
derived mappings, 946 modelled fallback gameplay leaders, 946 unavailable
source mappings, 0 ambiguous mappings, and 2 reconciled executive
officeholders. The two derived mappings are the Australian Labor Party /
Anthony Albanese and German CDU / Friedrich Merz, each requiring a reviewed
party source and exact dated officeholder match. Their gameplay analogues are
Anthony Alburn and Friedrich Merzen; the source people are provenance only.
All source licences remain `requires_confirmation`, so no mapping is cleared
for commercial redistribution. The coverage report enumerates all parties;
the absence of evidence for the other 946 is not represented as an
observation.

Succession selects an eligible existing member or generates a deterministic
fictional successor based on the party's validated profile. Leadership loss
does not change player control. A persisted handoff choice can continue as the
former person or explicitly switch to the successor once.

The start flow is Country → Party → Leader and does not grant an office.
Only the two reviewed officeholder matches receive their actual reconciled
executive office; party-bloc status alone grants no office. Fiscal controls
submit the existing corporate-tax or annual infrastructure-budget governance
proposal command; they do not mutate fiscal state directly. Country and
Region panels display only published information available to their access
scope.

## Validation commands and results

| Command | Result |
|---|---|
| `npm run verify` | Passed: country, Region, population, economy and aggregate data audits; TypeScript/build; 277 tests across 29 files. Vite reports a 3,944.17 kB JS chunk (349.99 kB gzip). |
| `npm run information:test` | Passed: 21 focused information tests, including access, reporting, briefings and migration/save behavior. |
| `npm run information:audit` | Passed: 948 party records; 2 derived mappings, 946 modelled fallbacks, 946 unavailable source mappings and 2 reconciled executive officeholders. |
| `npm run information:benchmark` | Passed: full-world benchmark; current measurements below. |
| `npm run governance:audit` | Passed: 61 governance tests, including succession chronology invariants. |
| `npm run governance:benchmark` | Passed: 948 leaders; governance snapshot, save, and proposal-analysis measurements below. |
| `npm run fiscal:audit` | Passed: 19 fiscal tests. |
| `npm run politics:data:generate` | Passed: generated 252 countries, 948 parties, 20 organizations, 281 chambers and 31,736 represented seats. |
| `npm run politics:audit:generate` | Passed after normalizing source-snapshot line endings before hashing; generated political coverage evidence. |
| `npm run politics:audit` | Passed: politics audit and 24 tests across three files, including the three-year world benchmark (115,489.4 ms; 9 ticks/s in this run). |
| `npm run benchmark:world` | Passed: four world benchmark tests; socioeconomic benchmark was 10 years in 6,319.59 ms (578 ticks/s). |
| `Get-ChildItem -Path src\\simulation\\information,src\\simulation\\governance,src\\components -Recurse -File \| Select-String -Pattern 'Math\\.random'; Select-String -Path src\\App.tsx -Pattern 'Math\\.random'` | No matches in the changed runtime/UI paths. |
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
| Isolated leader generation | 175.60 ms |
| Single-party leader lookup (warmed average over 1,000 lookups) | 0.0252 ms |
| New-game initialization | 358.50 ms |
| First monthly report generation (252 reports) | 4.30 ms |
| Information state after first report | 224,248 bytes |
| Serialized 256-briefing history | 123,905 bytes |
| Current save | 14,964,870 bytes |
| Estimated schema-12 save without 0.15 | 12,178,537 bytes |
| Estimated save delta | 2,786,333 bytes |
| Ordinary day | 0.4409 ms |
| Monthly changed day | 94.39 ms |
| Deterministic fallback succession | 0.71 ms |

The governance world benchmark measured 948 people-leaders, a 26,916,938-byte
save, 0.0288 ms snapshot, 285.28 ms serialization, and 13.091 ms mean
proposal analysis. The current three-year politics world benchmark measured
115,489.4 ms elapsed, 9 ticks/s, 102.19 ms weekly changed snapshot, 420.95 ms
coincident monthly/weekly snapshot, 633.62 ms reload, and a 33,196,316-byte
save. The world benchmark also measured a 10-year fiscal workload at
24,106.74 ms (151 ticks/s), with a 401.22 ms mean monthly snapshot day.
Benchmark figures are workload- and environment-specific, not device
guarantees. Save sizes differ because the benchmarks cover different world
state workloads.

## Assumptions, provenance and limitations

- The scenario remains dated 2026-01-01. Missing coverage remains unavailable;
  monthly unemployment aggregates use existing regional labor-force and
  unemployed stocks only.
- IPU Parline supplies institutional and seat evidence, not party leadership.
  V-Party observations are historical priors (2017–2019), not 2026 facts; its
  dataset licence remains `requires_confirmation`. The Wikidata officeholder
  snapshot verifies the exact identity and office tenure for the two
  hand-reviewed party mappings, but does not independently establish party
  leadership; its dataset licence is also `requires_confirmation`.
- The two party mappings are explicitly `derived`, not sourced/observed. The
  other 946 source mappings remain unavailable; all 948 gameplay identities
  are fictional and source coverage remains partial.
- Unemployment is the only Government Information report currently emitted.
  Confidential defense/diplomacy intelligence, public perception, autonomous
  ministers, cabinet politics, and new policy instruments are out of scope.
- Fiscal UI currently exposes the existing corporate-tax and annual
  infrastructure-budget proposal routes. No unsupported proposal is
  presented as functional.
- Current briefing triggers are advisory or important; the model's urgent
  pause path is not exercised.
- The added leadership state accounts for an estimated 2,786,333 bytes in the
  full-world schema comparison. The measured monthly changed day and initial
  leader creation are the main observed costs; no causality or provenance was
  traded for performance.

This report records candidate implementation and validation evidence only.
Acceptance remains subject to independent review.
