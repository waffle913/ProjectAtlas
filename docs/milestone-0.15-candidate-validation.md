# Milestone 0.15 candidate validation evidence

**Status: implementation evidence for independent review; 0.15 is not accepted.**
The canonical handoff remains at accepted milestone 0.14.

## Revision and scope

- Required base: `99013c9cd8476ff44e46f9eb57bb060fd9cb4b6f`.
- Task branch: `waffle913-milestone-015-government-information`.
- Corrective-pass parent: `4642c936c1bc88025a3063f14f87bcacd6246587`.
- Corrective implementation: `0ccefb41f34393f35679e4fe948261c636c526ab`.
- Candidate: Government Information, event-driven briefings, fictional party
  leaders and succession, and a playable interface over existing systems.
- Save schema: 13. Migration 12 → 13 preserves the saved date, tick, seed,
  fiscal and governance state; it initializes empty Government Information on
  the migration date and fills missing party leaders without creating past
  briefings.
- Global schema stays 13. The explicit information subversion migration
  `information-0.15-v1 -> information-0.15-v2` discards unfingerprinted
  Reality-derived estimates and unsupported crisis briefings, retaining
  legitimate labour/public-vote information and referenced reports. Ordinary
  schema-13/v2 reload preserves saved political persons and history instead
  of reconciling them against the current mapping table; incompatible
  political registries fail explicitly.
- No 0.16 systems are included. `docs/agent-handoff.md` is intentionally
  unchanged.

## Implementation evidence

Government Information is a delayed, provenance-labelled layer derived from
existing socioeconomic reports. Internal access follows a person's recorded
office capabilities; country control, party membership and leadership do not
grant executive access. Public parliamentary outcomes remain public.

Briefings are event/change-driven and reference public proposal votes and
monthly unemployment reports, never unobserved canonical crisis episodes.
The bounded feed holds at most 256 items per Country; activity elsewhere
cannot erase domestic history. Old reports are retained only while current or
referenced, including temporal policy-comparison baselines. Runtime retention
and the information invariant share the same report-reference calculation.
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

The start flow is Country → Party → Leader and does not grant an office; it
renders the fictional analogue and keeps source names out of the player
presentation. Executive ingestion is independent of party mappings;
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

## Validation commands and results

| Command | Result |
|---|---|
| `npm run verify` | Passed: Country/Region/population/economy data audits, TypeScript/Vite build and 287 tests across 29 files; final test phase 147.65 s. Production JS bundle: 3,980.67 kB (360.18 kB gzip), with the existing large-chunk warning. |
| `npx tsc -b --pretty false` | Passed after fixing implementation compile errors; also covered by the final build. |
| `npx vitest run src\simulation\__tests__\information.test.ts src\simulation\__tests__\governance.test.ts src\simulation\__tests__\politics.test.ts` | Passed: 107 tests across three files, 64.25 s. |
| `npm run information:test` | Passed: 26 tests, final rerun 16.31 s; non-leakage, fingerprint/staleness and actual fiscal-screen rendering, canonical resumption, fair retention and explicit migration. |
| `npm run information:audit:generate` | Passed: regenerated reproducible coverage v4; leader mappings and pinned snapshots are unchanged. |
| `npm run information:audit` | Passed: 948 parties, 7 derived mappings, 1 ambiguous, 940 unavailable; 342 executive persons from 392 records, 3 party-leader matches and 339 standalone executives. |
| `npm run information:benchmark` | Passed: one full-world information benchmark; initialization, 768-briefing retention fixture, save/monthly cost and succession measurements below. |
| `npm run governance:audit` | Passed: 66 tests, 61.65 s; source-office ingestion/authority, archived identity conservation, schema-12 migration, save/reload and exact-once fiscal enactment. |
| `npm run governance:benchmark` | Passed: one full-world governance benchmark; 1,287 persons, 27,268,062-byte save, 0.0300 ms snapshot, 327.52 ms serialization and 13.920 ms mean canonical analysis. |
| `npm run fiscal:audit` | Passed: 19 fiscal tests and the 252-country fiscal coverage audit. |
| `npm run politics:audit` | Passed: 24 tests across three files; three-year full-world workload 94,580.70 ms (12 ticks/s), 112.95 ms weekly snapshot, 1,093.75 ms coincident monthly/weekly snapshot and 687.66 ms reload. |
| `npm run crisis:audit` | Passed: 24 tests; canonical crisis material mechanisms and migration are unchanged. |
| `npm run benchmark:world` | Passed: 4 benchmarks; ten-year socioeconomic run 6,414.45 ms (569 ticks/s), ten-year fiscal run 24,505.05 ms (149 ticks/s), daily UI and full-world baseline checks. |
| Built-in `rg`, pattern `Math\.random`, glob `*.{ts,tsx}`, scoped to `src\simulation\information`, `src\simulation\governance`, `src\simulation\save.ts`, `src\components\FiscalPolicy.tsx` | No matches. The shell `rg` executable was unavailable; the successful built-in search is not a claim that that shell command ran. |
| `git diff --check` | Passed with no whitespace errors. |

An initial `npm run verify` failed: an old-registry fixture inherited schema
13 from the current initializer, and the new full-world reload regression
exceeded the default five-second test timeout under parallel load. The two
historical registry fixtures now explicitly represent schema 11; the new
world reload tests use a 30-second allowance without weakening assertions.
The existing schema-11 migration and strict schema-13 compatibility checks
both pass. An initial governance benchmark likewise failed its obsolete
948-total-person assumption, now replaced with separate party-leader and
standalone-executive accounting. Early compile errors were fixed before
successful type-check/test reruns. These failed attempts are not counted as
successful validation.

Audits and benchmarks were run sequentially to avoid measuring them against
another heavy test command. No parallel simulation engine/scheduler or 0.16
work was introduced. Country/Region registries, source snapshots, canonical
vote analysis/resolution and the canonical handoff have no diff.

## Measured workload and save impact

The 0.15 full-world information benchmark measured 252 countries, 4,574
regions, 948 gameplay parties, 948 active leaders and 342 executive persons
(three overlap with party leaders):

| Measurement | Result |
|---|---:|
| Isolated leader/officeholder initialization | 622.29 ms |
| Single-party leader lookup (warmed average over 1,000 lookups) | 0.2905 ms |
| New-game initialization | 781.32 ms |
| First monthly report generation (252 reports) | 4.50 ms |
| Information state after first report | 224,248 bytes |
| Serialized 256-briefing history | 123,905 bytes |
| Three-Country synthetic retained history | 768 briefings |
| Monthly reporting with that retained history | 8.67 ms |
| Synthetic retained-history save | 16,296,852 bytes |
| Synthetic history/report save delta against empty history at the same date | 980,827 bytes |
| Current save | 15,315,994 bytes |
| Estimated schema-12 save without 0.15 | 12,178,537 bytes |
| Estimated save delta | 3,137,457 bytes |
| Ordinary day | 0.4307 ms |
| Monthly changed day | 93.91 ms |
| Deterministic fallback succession | 2.31 ms |

The 339 newly ingested standalone executives add 348,965 bytes to each
comparable full-world save: the previous information benchmark was
14,967,029 bytes, now 15,315,994; the previous governance benchmark was
26,919,097, now 27,268,062. The estimated schema-12 comparison removes all
0.15 initial party leaders and executive persons; it is a size estimate, not
a claim that current state can be downgraded into a valid old save.

The 768-briefing fixture tests three independently bounded Country histories
with retained report references. Its synthetic dates/stocks are explicitly a
retention-cost workload, not simulated historical observations. It does not
measure the worst case in which all 252 Countries reach the history bound.

The governance benchmark still reports 57 procedurally resolvable Countries,
eight Countries with ideological evidence, and zero production overlap
between those evidence sets; ingestion does not fabricate voting coverage.
The current three-year politics world benchmark measured a 33,547,440-byte
save. The ten-year fiscal workload measured a 345.86 ms mean monthly snapshot
day; the daily UI workload reused 353/365 snapshots, with a 0.0155 ms mean
reused-day lookup and 129.50 ms mean changed monthly day.
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
