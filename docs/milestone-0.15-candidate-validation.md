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
referenced, including temporal policy-comparison baselines. Runtime retention
and the information invariant share the same report-reference calculation.
The current triggers do not create urgent briefings or pause the simulation.
Tell Me More reads saved analysis and canonical evidence under the same access
checks. Unemployment advice does not recommend tax or budget routes as hiring
solutions because no employment response is modelled. Guided, Standard and
Expert change presentation only and are not part of simulation state,
scheduling or RNG.

All 948 gameplay party leaders are distinct deterministic fictional persons.
The global stable-ID pipeline enumerates every party, joining only reviewed
IPU-to-Party-Facts IDs, exact Party Facts Wikidata QIDs, and a unique dated
Wikidata P488 chairperson claim with P580/P582 tenure qualifiers. Coverage is
35 exact Party Facts bridges, 21 derived leader mappings, 4 ambiguous
multi-person matches, 10 bridged but unavailable records, and 913 parties
without a reviewed Party Facts bridge. Totals are 0 sourced/observed mappings,
21 derived mappings, 927 modelled fictional fallback leaders, 923 unavailable
source mappings, 4 ambiguous mappings, and 5 reconciled executive
officeholders. Anthony Alburn (ALP) and Friedrich Merzen (CDU) remain
fictional analogues; other mapped leaders use deterministic fictional names.
Wikidata chair claims are CC0-1.0. The Party Facts crosswalk data licence
remains `requires_confirmation`; the repository software licence is not
treated as a data licence, so commercial redistribution is not cleared. The
Wikidata extract was retrieved after the scenario date; only explicit tenure
qualifiers valid on 2026-01-01 are used. No fuzzy name match or inferred
leadership is used.

Succession selects an eligible existing member or generates a deterministic
fictional successor based on the party's validated profile. Leadership loss
does not change player control. A persisted handoff choice can continue as the
former person or explicitly switch to the successor once.

The start flow is Country → Party → Leader and does not grant an office.
Only the five exact officeholder matches receive their separately reconciled
executive office; party-bloc status alone grants no office. Fiscal controls
submit the existing corporate-tax or annual infrastructure-budget governance
proposal command; they do not mutate fiscal state directly. Country and
Region panels display only published information available to their access
scope.

## Validation commands and results

| Command | Result |
|---|---|
| `npm run verify` | Passed: country, Region, population, economy and aggregate data audits; TypeScript/build; 278 tests across 29 files. Vite reports a 3,970.89 kB JS chunk (353.99 kB gzip). |
| `npm run information:test` | Passed: 21 focused information tests, including access, reporting, briefings and migration/save behavior. |
| `npm run information:audit:generate` | Passed: regenerated the pinned deterministic leader mapping and coverage report from reviewed snapshots. |
| `npm run information:audit` | Passed: 948 party records; 35 exact Party Facts bridges, 21 derived mappings, 927 modelled fallbacks, 923 unavailable source mappings, 4 ambiguous mappings and 5 reconciled executive officeholders. |
| `npm run information:benchmark` | Passed: 948 leaders; 170.58 ms isolated generation, 341.09 ms new-game initialization, 86.41 ms monthly changed day, 14,971,011-byte save and 2,792,474-byte estimated save delta. |
| `npm run governance:audit` | Passed: 62 governance tests, including succession chronology invariants and resolved presidential authority. |
| `npm run governance:benchmark` | Passed: 948 people; 26,923,079-byte save, 0.0605 ms snapshot, 285.91 ms serialization and 12.849 ms mean proposal analysis. |
| `npm run fiscal:audit` | Passed: 19 fiscal tests. |
| `npm run politics:data:generate` | Passed: generated 252 countries, 948 parties, 20 organizations, 281 chambers and 31,736 represented seats. |
| `npm run politics:audit:generate` | Passed after normalizing source-snapshot line endings before hashing; generated political coverage evidence. |
| `npm run politics:audit` | Passed: politics audit and 24 tests across three files, including the three-year world benchmark (89,219.92 ms; 12 ticks/s in this run). |
| `npm run benchmark:world` | Passed: four world benchmark tests; socioeconomic benchmark was 10 years in 6,157.91 ms (593 ticks/s). |
| `Get-ChildItem -Path src\\simulation\\information,src\\simulation\\governance,src\\components -Recurse -File \| Select-String -Pattern 'Math\\.random'; Select-String -Path src\\App.tsx -Pattern 'Math\\.random'` | No matches in the changed runtime/UI paths. |
| `git diff --check` | Passed with no whitespace errors. |

The broad verification emitted a Vite chunk-size warning; all tests completed
successfully in 128.60 seconds. An earlier full-suite run exposed two
simulation-heavy tests exceeding the default 5-second per-test timeout under
suite load; both now have explicit 30-second limits and passed in the final
run.

## Measured workload and save impact

The 0.15 full-world information benchmark measured 252 countries, 4,574
regions, 948 gameplay parties and 948 active leaders:

| Measurement | Result |
|---|---:|
| Isolated leader generation | 170.58 ms |
| Single-party leader lookup (warmed average over 1,000 lookups) | 0.0254 ms |
| New-game initialization | 341.09 ms |
| First monthly report generation (252 reports) | 4.36 ms |
| Information state after first report | 224,248 bytes |
| Serialized 256-briefing history | 123,905 bytes |
| Current save | 14,971,011 bytes |
| Estimated schema-12 save without 0.15 | 12,178,537 bytes |
| Estimated save delta | 2,792,474 bytes |
| Ordinary day | 0.4779 ms |
| Monthly changed day | 86.41 ms |
| Deterministic fallback succession | 0.74 ms |

The governance world benchmark measured 948 people-leaders, a 26,923,079-byte
save, 0.0605 ms snapshot, 285.91 ms serialization, and 12.849 ms mean
proposal analysis. The current three-year politics world benchmark measured
89,219.92 ms elapsed, 12 ticks/s, 92.88 ms weekly changed snapshot, 375.22 ms
coincident monthly/weekly snapshot, 555.58 ms reload, and a 33,202,457-byte
save. The world benchmark also measured a 10-year fiscal workload at
23,568.28 ms (155 ticks/s), with a 451.17 ms mean monthly snapshot day.
Benchmark figures are workload- and environment-specific, not device
guarantees. Save sizes differ because the benchmarks cover different world
state workloads.

## Assumptions, provenance and limitations

- The scenario remains dated 2026-01-01. Missing coverage remains unavailable;
  monthly unemployment aggregates use existing regional labor-force and
  unemployed stocks only.
- IPU Parline supplies institutional and seat evidence, not party leadership.
  V-Party observations are historical priors (2017–2019), not 2026 facts; its
  dataset licence remains `requires_confirmation`. The 35 Party Facts
  crosswalk links are exact identifiers but its data licence remains
  `requires_confirmation`. Wikidata party-chair claims are CC0-1.0; the
  extract was retrieved after the scenario date, and only explicit tenure
  qualifiers applicable on 2026-01-01 are used. Officeholder evidence has
  separate provenance and does not by itself establish party leadership or
  legal powers.
- The 21 party-leadership mappings are explicitly `derived`, not
  sourced/observed; 4 multi-person cases remain ambiguous, and 923 source
  mappings unavailable. All 948 gameplay identities remain fictional and
  source coverage is partial.
- Unemployment is the only Government Information report currently emitted.
  Confidential defense/diplomacy intelligence, public perception, autonomous
  ministers, cabinet politics, and new policy instruments are out of scope.
- Fiscal UI currently exposes the existing corporate-tax and annual
  infrastructure-budget proposal routes. No unsupported proposal is
  presented as functional.
- Current briefing triggers are advisory or important; the model's urgent
  pause path is not exercised.
- The added leadership state accounts for an estimated 2,792,474 bytes in the
  full-world schema comparison. The measured monthly changed day and initial
  leader creation are the main observed costs; no causality or provenance was
  traded for performance.

This report records candidate implementation and validation evidence only.
Acceptance remains subject to independent review.
