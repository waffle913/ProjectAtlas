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
The stable-ID pipeline joins only reviewed IPU-to-Party-Facts IDs and exact
Party Facts Wikidata QIDs. Wikidata P488 means chairperson/presiding member; it
does not necessarily mean constitutional or electoral party leader. A P488
mapping requires explicit P580 and P582 bounds containing 2026-01-01; missing
P582 is never evidence of continued tenure. A dated primary-source override
must identify the person and role; conflicts remain ambiguous.

The re-run 948-party audit reports 35 exact Party Facts bridges, 7 derived
mappings, 1 ambiguous mapping, 940 unavailable source mappings (913 parties
without a bridge and 27 bridged parties without unique positive leadership
evidence), 941 modelled fallback leaders, 0 sourced/observed mappings, and 3
reconciled executive officeholders. Every surviving source-derived mapping
has a checked-in, hand-reviewed fictional name, distinct from its source
identity and unique among active initial leaders. Canada's mappings are Yves
Blanchet → Yves-François Blancheval (Bloc Québécois, party leader), Don Davies
→ Don Davison (NDP, chairperson), and Pierre Poilievre → Pierre Poilapin
(Conservative Party, party leader). Other mappings are Anthony Albanese →
Anthony Alburn (Australian Labor Party, party leader), Friedrich Merz →
Friedrich Merzen (CDU, chairperson), Joe Gruters → Joe Grutter (Republican
Party, chairperson), and Keir Starmer → Keir Starmont (Labour Party,
chairperson). `P488` chairpersons are used as gameplay party heads only where
the recorded source role supports that analogue; they are not relabelled as
constitutional/electoral leaders.

Fourteen of the previous mappings were removed for insufficient historical
applicability: Mark Carney (Liberal Party), Elizabeth May (Green Party),
Larissa Waters (Australian Greens), Ciro Nogueira Lima Filho (Progressive
Party), Aécio Neves (PSDB), Yoshihiko Noda (Constitutional Democratic Party
of Japan), Tomoko Tamura (Japanese Communist Party), Sanae Takaichi (LDP),
Olivier Faure (Socialist Party), Jordan Bardella (National Rally), Markus
Söder (CSU), Ken Martin (Democratic Party), Kemi Badenoch (Conservative
Party), and John Swinney (Scottish National Party). The Republican mapping
changed from Michael Whatley to Joe Gruters based on a dated RNC announcement.
The Party Facts crosswalk, V-Party dataset, and official primary publication
licences remain `requires_confirmation`; Wikidata is CC0-1.0. Commercial
redistribution is not cleared.

Succession selects an eligible existing member or generates a deterministic
fictional successor based on the party's validated profile. Leadership loss
does not change player control. A persisted handoff choice can continue as the
former person or explicitly switch to the successor once.

The start flow is Country → Party → Leader and does not grant an office; it
renders the fictional analogue and keeps source names out of the player
presentation. Only the three reconciled mapped officeholders receive their separately reconciled
executive office; party-bloc status alone grants no office. Fiscal controls
submit the existing corporate-tax or annual infrastructure-budget governance
proposal command; they do not mutate fiscal state directly. Country and
Region panels display only published information available to their access
scope.

## Validation commands and results

| Command | Result |
|---|---|
| `npm run verify` | Passed: country, Region, population, economy and aggregate data audits; TypeScript/build; 280 tests across 29 files. Production JS bundle: 3,980.44 kB (359.55 kB gzip). |
| `npm run information:test` | Passed: 21 focused information tests, including access, reporting, briefings and migration/save behavior. |
| `npm run information:audit:generate` | Passed: regenerated the conservative leader mapping and coverage report from pinned reviewed snapshots. |
| `npm run information:audit` | Passed: 948 parties; 35 bridges, 7 derived mappings, 941 modelled fallbacks, 940 unavailable mappings, 1 ambiguous mapping, and 3 reconciled executive officeholders. |
| `npm run information:benchmark` | Passed: 948 leaders; 169.24 ms isolated generation, 350.47 ms new-game initialization, 86.93 ms monthly changed day, 14,967,029-byte save and 2,788,492-byte estimated save delta. |
| `npm run governance:audit` | Passed: 64 governance tests, including source-mapping/name invariants, schema-13 revalidation, save/reload, succession chronology and presidential authority. |
| `npm run governance:benchmark` | Passed: 948 people; 26,919,097-byte save, 0.0357 ms snapshot, 280.69 ms serialization and 12.631 ms mean proposal analysis. |
| `npm run fiscal:audit` | Passed: 19 fiscal tests and the 252-country fiscal coverage audit. |
| `npm run politics:data:generate` | Passed: generated 252 countries, 948 parties, 20 organizations, 281 chambers and 31,736 represented seats. |
| `npm run politics:audit:generate` | Passed after normalizing source-snapshot line endings before hashing; generated political coverage evidence. |
| `npm run politics:audit` | Passed: 24 politics tests across three files; three-year full-world benchmark 87,308.95 ms (13 ticks/s), 102.79 ms weekly snapshot, 362.39 ms coincident monthly/weekly snapshot and 567.03 ms reload. |
| `npm run benchmark:world` | Passed: 4 world benchmarks; 10-year socioeconomic run 5,953.96 ms (613 ticks/s), 10-year fiscal run 22,634.51 ms (161 ticks/s), daily UI and full-world baseline checks passed. |
| `rg "Math\\.random" src\\simulation\\governance src\\components\\StartGame.tsx` | No matches in the changed governance runtime, model, invariant, or start-flow paths. |
| `git diff --check` | Passed with no whitespace errors. |

The final broad verification passed all tests in 124.62 seconds. No new
simulation system, save schema version, or 0.16 work was introduced.

## Measured workload and save impact

The 0.15 full-world information benchmark measured 252 countries, 4,574
regions, 948 gameplay parties and 948 active leaders:

| Measurement | Result |
|---|---:|
| Isolated leader generation | 169.24 ms |
| Single-party leader lookup (warmed average over 1,000 lookups) | 0.0243 ms |
| New-game initialization | 350.47 ms |
| First monthly report generation (252 reports) | 4.64 ms |
| Information state after first report | 224,248 bytes |
| Serialized 256-briefing history | 123,905 bytes |
| Current save | 14,967,029 bytes |
| Estimated schema-12 save without 0.15 | 12,178,537 bytes |
| Estimated save delta | 2,788,492 bytes |
| Ordinary day | 0.4729 ms |
| Monthly changed day | 86.93 ms |
| Deterministic fallback succession | 0.83 ms |

The governance world benchmark measured 948 people-leaders, a 26,919,097-byte
save, 0.0357 ms snapshot, 280.69 ms serialization, and 12.631 ms mean
proposal analysis. The current three-year politics world benchmark measured
87,308.95 ms elapsed, 13 ticks/s, 102.79 ms weekly changed snapshot, 362.39 ms
coincident monthly/weekly snapshot, 567.03 ms reload, and a 33,198,475-byte
save. The world benchmark measured a 10-year fiscal workload at 22,634.51 ms
(161 ticks/s), with a 310.53 ms mean monthly snapshot day.
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
- The 7 party-leadership mappings are explicitly `derived`, not
  sourced/observed; 1 case remains ambiguous and 940 source mappings are
  unavailable. All 948 gameplay identities remain fictional and source
  coverage is partial.
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
