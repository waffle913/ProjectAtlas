# Milestone 0.15 candidate validation evidence

**Status: implementation evidence for independent review; 0.15 is not accepted.**
The canonical handoff remains at accepted milestone 0.14.

## Revision and scope

- Required base: `99013c9cd8476ff44e46f9eb57bb060fd9cb4b6f`.
- Task branch: `waffle913-milestone-015-government-information`.
- Previous corrective implementation: `0ccefb41f34393f35679e4fe948261c636c526ab`.
- Reviewed candidate parent for this final pass:
  `b8ca8999221cfd540d80ce5b5ae953cc13a93075`.
- This pass fixes historical office-evidence validation, fair hard briefing
  retention and the independent executive-officeholder starting route only.
- Candidate: Government Information, event-driven briefings, fictional party
  leaders and succession, and a playable interface over existing systems.
- Save schema: 13. Migration 12 → 13 preserves the saved date, tick, seed,
  fiscal and governance state; it initializes empty Government Information on
  the migration date and fills missing party leaders without creating past
  briefings.
- Global schema stays 13. The explicit information subversion migration
  `information-0.15-v2 -> information-0.15-v3` deterministically applies the
  2,048 global / 256 per-Country / four-recent-entry protection policy, using
  saved player control and releasing unused references. Safe fingerprinted
  estimates remain. V1 -> v3 additionally discards unfingerprinted Reality
  estimates and unsupported crisis briefings. Ordinary v3 reload does not
  rerun retention or source/person initialization. Governance v1 and the
  saved person/office shape are unchanged: existing historical evidence is
  sufficient, so no governance migration is introduced.
- No 0.16 systems are included. `docs/agent-handoff.md` is intentionally
  unchanged.

## Implementation evidence

Government Information is a delayed, provenance-labelled layer derived from
existing socioeconomic reports. Internal access follows a person's recorded
office capabilities; country control, party membership and leadership do not
grant executive access. Public parliamentary outcomes remain public.

Briefings are event/change-driven and reference public proposal votes and
monthly unemployment reports, never unobserved canonical crisis episodes.
The bounded feed holds at most 2,048 items globally and 256 per Country. It
protects the four most recent available entries per Country, prefers up to
256 recent entries for the controlled person's Country, then fills remaining
slots with the newest entries. There is no player preference without control.
Persisted date and lexicographic ID ties make ordering independent of input
insertion and UI selection; the canonical array is chronological. A future
protected floor that cannot fit fails explicitly. Switching control cannot
reconstruct expired history. Monthly reports batch retention once rather
than sorting/cleaning all history for every emitted Country briefing. Old
reports are retained only while current or
referenced, including temporal policy-comparison baselines. Runtime retention
and the information invariant share the same report-reference calculation.
Expired policy anchors also release orphaned comparisons and their generated
headline clauses, so the displayed follow-up does not outlive its structured
evidence.
The current triggers do not create urgent briefings or pause the simulation.
Tell Me More reads only retained Government Information or public vote
evidence under the same access checks, not saved canonical political analysis
or crisis drivers. Unemployment advice does not recommend tax or budget routes
as hiring solutions because no employment response is modelled. Guided, Standard and
Expert change presentation only and are not part of simulation state,
scheduling or RNG.

Government reaction estimates no longer call canonical analysis or support
estimators. No legitimate polling, party-response or proposal-counterfactual
report channel exists, so reactions are explicitly unavailable: public
responses are 100% UNKNOWN, parliamentary responses have no known yes/no/
abstain allocations, confidence is zero, and forecast consequences are empty.
Canonical debug support inspection and vote resolution remain unchanged.
Fingerprints identify analyzed effective date and payload; edited drafts
mark old estimates stale, exclude them from current UI/deeper explanation,
and permit deterministic same-day re-estimation.

The fiscal screen derives unresolved proposals from canonical Country/person
ownership, can select among them, and falls back to the latest canonical
unresolved proposal after local selection loss. It shows the canonical
payload separately from local new-proposal inputs and does not create a
duplicate merely because the screen remounted.

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
evidence), 941 modelled fallback leaders and 0 sourced/observed mappings.
Independent executive ingestion materializes 342 distinct Country/source
persons from 392 available office records: 3 reuse party leaders and 339 are
separate fictional persons without invented party membership. Authority is
resolved for 121; 221 retain zero inferred capabilities. Unknown tenure
starts remain absent. Total initial persons: 1,287.

Historical source office validation no longer looks up current snapshot
records or recomputes authority from current institutional classifications.
Saved Country/person/office consistency, source identity and record IDs,
reference/effective dates, role/authority basis and capability coherence are
validated internally. A reference may precede or follow the appointment, but
must not postdate the saved state; an explicit effective start must not
postdate the reference. Leader and office source identities must agree when
shared. Strict installed-source reconciliation and source-name exclusion
remain explicit new-game checks. Archived record IDs/dates and a historically
different authority classification survive save/reload unchanged, together
with date, tick, seed, control, persons and all political/material history.
These are structural/semantic checks of saved evidence, not an anti-tampering
signature or a substitute for source admissibility audits.

Every surviving source-derived mapping
has a checked-in, hand-reviewed fictional name, distinct from its source
identity and unique among active initial leaders. Canada's mappings are
Yves-François Blanchet → Yves-François Blancheval (Bloc Québécois, party
leader), Don Davies
→ Don Davison (NDP, chairperson), and Pierre Poilievre → Pierre Poilapin
(Conservative Party, party leader). Other mappings are Anthony Albanese →
Anthony Alburn (Australian Labor Party, party leader), Friedrich Merz →
Friedrich Merzen (CDU, chairperson), Joe Gruters → Joe Grutter (Republican
Party, chairperson), and Keir Starmer → Keir Starmont (Labour Party,
chairperson). `P488` chairpersons are used as gameplay party heads only where
the recorded source role supports that analogue; they are not relabelled as
constitutional/electoral leaders.

The earlier data-quality pass removed fourteen mappings for insufficient historical
applicability: Mark Carney (Liberal Party), Elizabeth May (Green Party),
Larissa Waters (Australian Greens), Ciro Nogueira Lima Filho (Progressive
Party), Aécio Neves (PSDB), Yoshihiko Noda (Constitutional Democratic Party
of Japan), Tomoko Tamura (Japanese Communist Party), Sanae Takaichi (LDP),
Olivier Faure (Socialist Party), Jordan Bardella (National Rally), Markus
Söder (CSU), Ken Martin (Democratic Party), Kemi Badenoch (Conservative
Party), and John Swinney (Scottish National Party). The Republican mapping
changed from Michael Whatley to Joe Gruters based on a dated RNC announcement.
This corrective pass changes no party-leadership mappings, source snapshots
or Country/Region identities.
The Party Facts crosswalk, V-Party dataset, and official primary publication
licences remain `requires_confirmation`; Wikidata is CC0-1.0. Commercial
redistribution is not cleared.

Succession selects an eligible existing member or generates a deterministic
fictional successor based on the party's validated profile. Leadership loss
does not change player control. A persisted handoff choice can continue as the
former person or explicitly switch to the successor once.

The start flow keeps Country first and offers Country -> Party -> Leader or
Country -> Current executive officeholder. Active source-reconciled
executives are selectable independently of membership, including Countries
without party coverage and offices with unresolved authority. Both routes
use the same canonical person ID and existing `setControlledPerson` command;
only the controlled ID changes. Fictional names, office titles, modelled
capabilities, limitations and unavailable membership are displayed without
source real names. No office, leadership, membership or powers are created.
Executive ingestion is independent of party mappings;
party-bloc status alone grants no office. The start selector does not invent
membership or expose standalone executives as party leaders merely to unlock
government access. Fiscal controls submit the existing corporate-tax or
annual infrastructure-budget governance
proposal command; they do not mutate fiscal state directly. Country and
Region panels display only published information available to their access
scope.

Urgent automatic pause remains unimplemented/unexercised end-to-end:
`pauseRequested` is reserved, with no legitimate urgent event source. Adopted
and rejected proposal regression fixtures now start unpaused and remain so.
Continuous intra-party distributions/split-seat votes, deeper institutional
self-interest and faction/context-based successors remain explicit design
debt. The validated deterministic party-block vote and bounded party-platform
successor mechanics were not expanded in this corrective pass.

## Principal files

The corrective diff contains 17 files:

| Area | Files |
|---|---|
| Start interface | `src\App.tsx`, `src\components\StartGame.tsx` |
| Historical/current office boundary | `src\simulation\governance\officeEvidence.ts` (new), `src\simulation\governance\initialOfficeEvidence.ts` (new), `src\simulation\governance\invariants.ts`, `src\simulation\governance\runtime.ts` |
| Read-only starting candidates | `src\simulation\governance\selection.ts` |
| Retention and explicit migration | `src\simulation\information\model.ts`, `src\simulation\information\runtime.ts`, `src\simulation\information\invariants.ts`, `src\simulation\information\migration.ts`, `src\simulation\save.ts` |
| Regressions and full-cap workload | `src\simulation\__tests__\governance.test.ts`, `src\simulation\__tests__\information.test.ts`, `src\simulation\__tests__\informationWorld.test.ts` |
| Candidate contracts/evidence | `docs\information-0.15.md`, `docs\milestone-0.15-candidate-validation.md` |

## Validation commands and results

| Command | Result |
|---|---|
| `npm run verify` | Passed once after coherent correction, before the final office-date review clarification: Country/Region/population/economy data audits, TypeScript/Vite build and 297 tests across 29 files; test phase 142.02 s. Production JS bundle: 3,984.25 kB (361.27 kB gzip), with the existing large-chunk warning. |
| `npx tsc -b --pretty false` | Passed, including the pre-suite check and a final check after the office-date review clarification. |
| `npx vitest run src\simulation\__tests__\governance.test.ts -t 'historical office evidence\|current-source reconciliation\|inconsistent persisted office\|presidential executive authority'` | Initial focused office-boundary pass: 4 passed, 65 skipped, 11.79 s; the final expanded fixture passes in the post-review full governance audit. |
| `npx vitest run src\simulation\__tests__\information.test.ts -t 'global cap\|protected minimum\|bounds and deterministically\|information-v1 in schema 13\|migrates v2 retention\|missing v2/v3'` | Corrected focused retention/migration pass: 7 passed, 23 skipped, 12.60 s; final headline cleanup is additionally covered by the full information suite. |
| `npx vitest run src\simulation\__tests__\governance.test.ts -t 'starting routes\|Country party coverage\|either route\|fictional Canadian'` | Passed: 4 passed, 68 skipped, 7.05 s, including SSR rendering, same-ID uniqueness and control-only changes. |
| `npm run information:test` | Passed: 30 tests, 21.86 s, then 30 tests, 22.22 s after the office-date review clarification; existing non-leakage/access/fiscal-screen contracts, both history bounds, protected floor, player preference, references and explicit migrations. |
| `npm run information:audit` | Passed: 948 parties, 7 derived mappings, 1 ambiguous, 940 unavailable; 342 executive persons from 392 records, 3 party-leader matches and 339 standalone executives. |
| `npm run information:benchmark` | Passed: one benchmark, 9.15 s; actual retained 2,048-entry state across 252 Countries, 256 player-Country entries, foreign floor, 83 new monthly alerts, reference validity and exact reload. |
| `npm run governance:audit` | Passed: 72 tests, 67.99 s, then 72 tests, 70.68 s after the office-date review clarification; strict initialization, independent historical evidence, dual start routes, schema-12 migration, save/reload and exact-once fiscal enactment. |
| `npm run governance:benchmark` | Passed: one benchmark, 6.90 s; 1,287 persons, 27,268,062-byte save, 0.0374 ms snapshot, 297.31 ms serialization and 13.921 ms mean canonical analysis. |
| `npm run fiscal:audit` | Passed: 19 tests across two files, 4.07 s, including the 252-Country fiscal coverage audit. |
| `npm run politics:audit` | Passed: 24 tests across three files, 120.41 s; three-year simulation 92,450.38 ms (12 ticks/s), 114.56 ms weekly snapshot, 394.68 ms coincident snapshot and 591.53 ms reload. |
| `npm run benchmark:world` | Passed: 4 benchmarks, 51.68 s; ten-year socioeconomic run 6,468.36 ms (564 ticks/s), ten-year fiscal run 24,295.92 ms (150 ticks/s), daily UI and full-world baseline checks. |
| Built-in `rg`, pattern `Math\.random`, glob `*.{ts,tsx}`, scoped to `src\simulation\information`, `src\simulation\governance`, `src\simulation\save.ts`, `src\components\StartGame.tsx`, `src\App.tsx` | No matches; this is the available built-in search, not an unexecuted shell `rg` command. |
| `git diff --check` | Passed with no whitespace errors. |

During this pass, the first focused retention run failed one fixture with
`[fiscal-conservation] Invalid reform queue`: it moved the date past an
enacted reform without advancing the existing engine. The fixture now uses
the real 59-day advancement before testing March retention; no fiscal
invariant or queue behavior was weakened. An early starting-route type-check
rejected the fixture status `retired`; the fixture now uses the actual
`inactive` contract. These failed attempts are not counted as successful
validation. The broad `npm run verify` ran once and passed.

Final diff review removed an unnecessary requirement that a source reference
precede the office appointment. A legitimate source can attest an existing
office after appointment, provided it is not future evidence relative to
the save and its explicit effective-start chronology is coherent. The
archival fixture now covers both a 2025-12-01 and a 2026-01-05 reference
around a 2026-01-01 appointment in a 2026-01-06 save. After this one-line
validator adjustment and fixture expansion, TypeScript, all 72 governance
tests and all 30 information tests were rerun and passed. The earlier broad
verify and workload measurements were not rerun or claimed to cover this
final exact revision.

The previous pass at the reviewed parent had corrected explicit schema-11
registry fixtures, 30-second full-world reload test allowances and an obsolete
948-total-person benchmark assumption. Those fixes remain; the new final
report does not present their old command results as newly executed.

Audits and benchmarks were run sequentially to avoid measuring them against
another heavy test command. No parallel simulation engine/scheduler or 0.16
work was introduced. Country/Region registries, source snapshots, canonical
vote analysis/resolution and the canonical handoff have no diff.
Source generation was not rerun: no source/mapping/report-generation change
was needed, and the existing reproducible coverage report passed its audit.

The temporary loopback preview (`npm run dev -- --host 127.0.0.1 --port 5198
--strictPort`) became ready and `Invoke-WebRequest -UseBasicParsing` returned
HTTP 200. The browser canvas opened, but did not return the page handle
required for automated browser actions; no click-through verification is
claimed. The server was stopped after this check. Candidate/rendering and
canonical selection behavior are covered by the SSR/helper/command tests.

## Measured workload and save impact

The 0.15 full-world information benchmark measured 252 countries, 4,574
regions, 948 gameplay parties, 948 active leaders and 342 executive persons
(three overlap with party leaders):

| Measurement | Result |
|---|---:|
| Isolated leader/officeholder initialization | 565.96 ms |
| Single-party leader lookup (warmed average over 1,000 lookups) | 0.2830 ms |
| New-game initialization | 760.26 ms |
| First monthly report generation (252 reports) | 3.91 ms |
| Information state after first report | 224,248 bytes |
| Serialized 256-briefing history | 123,905 bytes |
| Full-cap synthetic retained history | 2,048 briefings across 252 Countries |
| Controlled Country retained history | 256 briefings |
| Monthly reporting at full cap, including 83 new alerts | 67.74 ms |
| Synthetic retained-history save | 17,771,032 bytes |
| Synthetic history/report save delta against otherwise-identical empty history at the same date | 2,230,877 bytes |
| Current save | 15,315,994 bytes |
| Estimated schema-12 save without 0.15 | 12,178,537 bytes |
| Estimated save delta | 3,137,457 bytes |
| Ordinary day | 0.4345 ms |
| Monthly changed day | 99.35 ms |
| Deterministic fallback succession | 2.27 ms |

The prior executive-ingestion pass added 339 standalone executives and
348,965 bytes to each comparable full-world save: the pre-ingestion information benchmark was
14,967,029 bytes, now 15,315,994; the previous governance benchmark was
26,919,097, now 27,268,062. The estimated schema-12 comparison removes all
0.15 initial party leaders and executive persons; it is a size estimate, not
a claim that current state can be downgraded into a valid old save.

The full-cap fixture replaces the old 768-entry/three-Country sample. It
retains exactly 2,048 entries, protects at least four for each of 252
Countries and prefers 256 for the controlled Country. Available previous
reports differ by exactly 50 basis points to exercise 83 real runtime
monthly alert emissions while remaining at the hard cap. References and
round-trip equality are checked before/after the reporting pass. Synthetic
dates/stocks are cost fixtures, not simulated historical observations. The
empty-history size comparison preserves the same date, control, material
state, safe estimates and latest reports, removing only retained history and
its otherwise-unused report references. The workload is not a universal
maximum-byte guarantee; larger valid briefing content can cost more. Its
timing is not directly comparable to the previous smaller no-alert sample.

The governance benchmark still reports 57 procedurally resolvable Countries,
eight Countries with ideological evidence, and zero production overlap
between those evidence sets; ingestion does not fabricate voting coverage.
The current three-year politics world benchmark measured a 33,547,440-byte
save. The ten-year fiscal workload measured a 347.18 ms mean monthly snapshot
day; the daily UI workload reused 353/365 snapshots, with a 0.0159 ms mean
reused-day lookup and 132.71 ms mean changed monthly day.
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
  unavailable. All 1,287 initial gameplay identities remain fictional and source
  coverage is partial.
- Unemployment is the only Government Information report currently emitted.
  Confidential defense/diplomacy intelligence, public perception, autonomous
  ministers, cabinet politics, and new policy instruments are out of scope.
- Government public/parliamentary reactions and counterfactual consequences
  remain unavailable; freshness of an unrelated labour report is not reaction
  evidence. No canonical-crisis government sensor or urgent source is added.
- Ordinary schema-13 saves keep their previously ingested persons. New
  executive ingestion applies to new games and explicit schema-12 migration
  on the scenario date, not silent schema-13 backfills.
- Fiscal UI currently exposes the existing corporate-tax and annual
  infrastructure-budget proposal routes. No unsupported proposal is
  presented as functional.
- Current briefing triggers are advisory or important. Automatic urgent pause
  is not exercised or claimed implemented end-to-end.
- Party-block voting and bounded party-platform successor profiles remain
  known debt; continuous internal plurality/split-seat votes, deeper
  institutional interest and faction/context successors are not implemented.
- Initialization and coincident snapshots remain significant measured costs;
  no causal mechanism, provenance or save identity was traded for benchmark
  gains.

This report records candidate implementation and validation evidence only.
Acceptance remains subject to independent review.
