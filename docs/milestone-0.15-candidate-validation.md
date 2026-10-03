# Milestone 0.15 candidate validation evidence

**Status: implementation evidence for independent review; 0.15 is not accepted.**
The canonical handoff remains at accepted milestone 0.14.

The earlier sections retain the previous corrective-pass evidence through
`81109d98a685398c8938eb2b1931634f4c4bcabe`. The current scoped internal-party
plurality block and its separately executed validation are recorded in the
final section below.

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
At that corrective parent, continuous intra-party distributions/split-seat
votes, deeper institutional self-interest and faction/context successors
remained explicit design debt. The new scoped plurality block below implements
only the first item; bounded party-platform succession remains unchanged.

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
- At that corrective parent, continuous plurality/split-seat votes, deeper
  institutional interest and faction/context successors were not implemented.
  The subsequent plurality-only candidate block is recorded below.
- Initialization and coincident snapshots remain significant measured costs;
  no causal mechanism, provenance or save identity was traded for benchmark
  gains.

This report records candidate implementation and validation evidence only.
Acceptance remains subject to independent review.

## Scoped internal-party plurality candidate

Reviewed parent: `81109d98a685398c8938eb2b1931634f4c4bcabe`; unchanged task
branch and required original base. This block follows the 1,258-line
`ProjectAtlas-0.15-internal-party-distribution-reference.md` behavior contract.
The no-code plan preceded edits. Implementation and actual-diff review are
separate passes; this remains an implementation candidate, not acceptance.

### Contract and technical adaptations

The reference distribution, constants, independent goal moments, triangular
integration, confidence gates and largest-remainder semantics are followed.
Quadrature elements are additionally frozen, rather than freezing only their
container. A narrow `Pick` type passes central agreement/confidence/coverage
without widening the unchanged causal evaluator. Fixed quadrature weights
are aggregated directly; no zero-weight fallback is needed or introduced.
Malformed vote shares fail explicitly before the existing allocator. Versioned
invariants additionally reject duplicate party entries, unknown evaluation
versions and new fields in old-mode records. None changes the reference
distribution or creates a new political mechanism.

Only exact seat results and compact distribution metadata are saved, not
quadrature points, MPs or named factions. New resolutions use
`plurality-0.15-v1`; new parliamentary estimates use
`internal_party_distribution_v1`. The central vote remains evidence about
the central evaluation, not an allocation. UNKNOWN is never abstention.
Government Information forecasts remain unavailable; canonical debug
inspection and resolution do not become government-visible predictions.
The public estimator, causal analysis, authority, proposal fingerprints,
exact-once fiscal queue and scheduler are unchanged.

Global schema 13, governance v1 and information v3 remain unchanged. Optional
result fields are interpreted by evaluation version; no historical backfill
or new migration is introduced. The genuine parent-generated situational-v2
fixture captures an enacted proposal, its person and matching queued reform.
It uses explicit synthetic profiles and is not evidence of real party votes.
That record round-trips unchanged without distributions, as do the existing
aggregate schema-12 fixtures. An unresolved saved proposal's future vote can
use plurality without rewriting already resolved history.

The 12 changed files are `AGENTS.md`, `.github\copilot-instructions.md`,
`docs\information-0.15.md`, this validation record,
`src\simulation\governance\model.ts`, `estimates.ts`, `runtime.ts`,
`invariants.ts`, new `internalPartyDistribution.ts`,
`src\simulation\__tests__\governance.test.ts`, `governanceWorld.test.ts` and
new `fixtures\governance-situational-0.14-v2.json`. No source snapshots,
Country/Region identities, office ingestion, start/UI routes, fiscal/crisis
mechanisms, handoff acceptance or 0.16 systems are changed.

### Executed validation

These are the pre-commit runs for this block, not reused historical results.
The required post-commit `npm run verify` is additionally run and reported
with the exact final SHA in the delivery report.

| Command | Actual result |
|---|---|
| `npx tsc -b --pretty false` | Passed before focused tests and before full governance validation. |
| `npx vitest run src\simulation\__tests__\governance.test.ts -t 'independent issue plurality\|situational outputs\|situational-v2\|d2f3ce\|aggregate-only' --maxWorkers=1 --reporter=verbose` | 16 passed, 65 skipped; 25.36 s. |
| `npx vitest run src\simulation\__tests__\governance.test.ts -t 'corrupt distributions' --maxWorkers=1` | Final expanded corruption check: one passed, 80 skipped; 7.65 s. |
| `npm run governance:audit` | 81 passed; 70.46 s. Nine new tests cover the A-M acceptance cases alongside preserved historical tests. |
| `npm run governance:benchmark` | One passed; 7.98 s; actual split allocation, representative resolved save and exact full-world round-trip. |
| `npm run information:test` | 30 passed; 20.34 s; access, non-leakage, unavailable predictions, briefings, retention and migrations. |
| `npm run information:audit` | Passed; 948 parties, 7 derived, 1 ambiguous, 940 unavailable, no missing reviewed analogue; 342 reconciled executives from 392 records. |
| `npm run fiscal:audit` | 19 passed across two files; 3.97 s; unchanged 252-Country coverage. |
| `npm run politics:audit` | 24 passed across three files; 114.39 s. Three-year simulation 87,954.73 ms, 12 ticks/s, 583.24 ms reload; 33,547,440-byte save. |
| `npm run benchmark:world` | Four passed; 45.59 s. Ten socioeconomic years 5,994.66 ms (609 ticks/s); ten fiscal years 23,328.53 ms (156 ticks/s); existing checksums unchanged. |
| `npm run verify` | Passed; data audits, TypeScript/Vite build and 306 tests across 29 files; test phase 127.95 s. Existing large-chunk warning remains. |

Full actual diff inspection includes the new helper, captured historical
JSON and test/benchmark changes. Built-in `rg` for `Math\.random` in
`src\simulation\governance` (`*.ts`) has no matches. `git diff --check`
passes. A final focused corruption check covers both historic central-vote/
seat reconciliation and invalid plurality-version rejection.

### Performance and save bytes

Audits/benchmarks ran sequentially, not alongside another heavy workload.
The same production 20-inspection measurement is 12.730 ms mean versus the
previous recorded 13.921 ms; machine noise prevents claiming an optimization.
The separate 20-call synthetic known-profile workload is 12.522 ms mean.
Production profiles remain evidence-limited; synthetic confidence is marked
test-only and is not installed in production.

| Measurement | Bytes |
|---|---:|
| Initial world save, no proposals | 27,268,062 (unchanged) |
| Representative submitted world | 27,269,304 |
| Representative resolved plurality world | 27,283,363 |
| Resolution delta versus that submitted world | 14,059 |
| Total delta versus initial world, including synthetic person/proposal/briefing | 15,301 |
| Resolved proposal record | 13,435 |
| Additional distribution/decision/allocation fields in both estimate and result | 4,800 |

The 4,800-byte figure removes only those fields from a measurement copy; that
undecorated copy is not a valid old save or a rewritten historical result.
Snapshot reuse is 0.0335 ms; initial serialization is 269.38 ms. These are
workload-specific costs, not universal limits. There is no MP-sized state,
new scheduler task, faction update loop or RNG cost.

### Unchanged evidence limits

Complete procedural coverage still spans 57 Countries and ideological
evidence eight, with zero production overlap; this implementation does not
manufacture voting evidence. Internal distribution shape is a modelled
common prior, not a sourced estimate of faction proportions. Leader coverage
remains seven derived / zero directly sourced, one ambiguous and 940
unavailable, with all seven reviewed fictional analogue names. No mapping
was removed or changed in this block.

IPU remains CC BY-NC-SA 4.0; Party Facts, V-Party and relevant primary-source
licences remain `requires_confirmation`, blocking commercial release.
Deeper institutional self-interest and faction/context successors remain
unimplemented. No 0.16 work, main merge or independent-acceptance claim is
included.

## Foundation hardening audit after plurality candidate

This corrective starts exactly at `b8e512aba762325220159bed9479185f43a7ab9f`
on `waffle913-milestone-015-government-information`. It repairs the supplied
foundation audit, not a new feature or acceptance of 0.15. Earlier reports
above describe their actual candidates and are not retroactively corrected.
The attachment and required contracts were read before editing, and the plan
recorded affected files, causal dependencies, migration/identity risks,
invariants, regression tests and performance checks.

### Findings, regressions and calculation boundaries

Test names below identify actual Vitest cases in
`src\simulation\__tests__`; parameterized names expand into separate cases.

| Finding / milestone | Exact repair | Regression case | Future calculation or corruption-only; save boundary |
|---|---|---|---|
| Platform fixture reads / 0.14-0.15 | Relative JSON module imports in both governance suites, rather than Windows filesystem literals. | `preserves situational outputs across deterministic save and reload` and governance world benchmark | Test portability only; historical JSON untouched. |
| Biased integer RNG and truncated wide spans / 0.8 | Exact rejection limit on 32-bit draws, stable retry suffix; compose 53 bits for wider spans. Explicitly reject spans beyond 2^53 and exhausted retries. | `preserves the exact parent uint32 and accepted small-range fixtures`, `rejects biased first samples instead of reducing them modulo the span`, `supports full uint32, wide safe ranges and negative bounds independent of order` | Narrow future RNG change described below; no recorded event replay. |
| Date normalization / core, fiscal, politics, crisis, information, diplomacy, war | One dependency-free strict UTC/calendar predicate; no invalid-date `toISOString` exception. Existing fiscal alias retained. | `rejects invalid date %s`, `admits real leap days only`, politics date corruption and crisis `snapshot-date` / `state-date` cases, monthly-budget invalid date | Reject corruption/impossible calendar dates, not valid history. |
| Signed proposal arithmetic / 0.14-0.15 | BigInt signed ratios with half-away-from-zero rounding, symmetric signed averages/scaling, round weighted agreement delta before adding 5,000; signed quadrature means. | `rounds signed half ratios symmetrically for %s`, `scales safely beyond Number intermediate precision and rejects invalid/unsafe inputs`, `rounds signed central agreement deltas symmetrically before adding the neutral center` | Future calculations only; stored analyses/results are not recomputed. |
| Divergent monthly budget / 0.11-0.14 | Export and reuse the fiscal category-wise dated monthly allocation, including its remainder convention. Governance no-ledger context uses the same helper. | `conserves every annual category through the canonical dated monthly appropriation`, `uses dated fiscal monthly spending rather than rounded annual totals before the first booking` | Future context calculation; booked accounts and historical appropriations unchanged. |
| Stale counterfactual legal baseline / 0.11-0.14 | Recompute both current-law and proposed taxes on the same current socioeconomic bases and sovereign owner; hold booked transfers, orders and private residual constant. | `compares B with current same-day law A rather than a booked older ledger`, `uses the new sovereign current law without rewriting the booked owner or non-tax flows`, existing transfer/incidence tests | Future pure analysis only, no ledger mutation or early monthly booking. |
| Inactive authority / 0.14 | Private capability check requires active status; assigning an office to an inactive person throws; invariant rejects inactive + office. | `denies inactive officeholders submission, resolution and assignment without transferring player control` | Reject invalid authority/corruption; active former leaders without office remain controllable. |
| Engine metadata / 0.8 | Boolean pause, allowed speed, nonempty string seed, nonnegative safe ticks; transition identities/sequences/ticks/dates, bounded recent history, immediate keys, dirty-domain/reason/entity shape and exact normalized-set uniqueness. | `rejects malformed engine metadata: %s` | Corruption-only; no scheduler, clock, dirty normalization or queue behavior changed. |
| Missing permanent Region identity keys / 0.9 | Own-property completeness for ownership/population/output; occupation remains sparse. Rehydrate JSON-omitted unavailable keys, never values. | `requires every permanent identity key in %s, including unavailable values`, `rehydrates unavailable permanent keys on reload without inventing baseline observations` | Corruption-only in canonical state; unavailable JSON compatibility detailed below. |
| Floating political ratios/signed tax term / 0.13 | Reuse socioeconomic exact nonnegative ratios; round the high-income half tax term with explicit negative symmetry and middle-income quarter term to nearest. | `uses exact large-quantity experience ratios and preserves missing observations`, existing material-condition and deterministic opinion tests | Future opinion calculations; no recalculation of saved opinion/history. |
| Unreconciled national support/history / 0.13 | One pure stored-region/cohort aggregation shared by initialization, weekly update, registry rebase and invariant; check region uniqueness, bounded dated history and unique integer driver indexes. | `rejects a forged national aggregate even when its sum stays exactly 10,000`, `rejects malformed political history: %s`, `rejects duplicate cohort driver indexes and strict invalid organization/politics dates`, `validates stored political ownership until the scheduled weekly transfer reconciliation` | Corruption-only reconciliation uses stored weekly assignments, not a premature sovereignty remap. |
| Unchecked crisis derived evidence / 0.12 | Runtime/invariant share severity thresholds, danger/recovery predicates and persistence contribution; reconcile current/maximum severity and activation snapshot identities, dates, pressure components, chance/roll bounds and sums. | `rejects corrupted derived crisis evidence: %s` | Corruption-only; identical valid crisis formulas/cadence, no new crisis causes or effects. |
| YES-first parliamentary ties / 0.15 | New specialist largest-remainder ties rank stable proposal/chamber/party/bucket fingerprints; generic allocator unchanged. | `breaks exact odd-seat ties by stable identities, not YES/NO bucket priority`, existing insertion-order/conservation tests, `preserves unmarked candidate plurality ties across reload using their historical allocator` | Future marked allocations only; unmarked candidate histories keep their historical allocator. |
| Independently valid but contradictory estimate/result / 0.15 | Exact canonical JSON equality of the parliamentary record, excluding only outcome/date/reason. Not a probabilistic fingerprint equality. | `rejects independently valid plurality records that differ between estimate and result` | Reject plurality corruption, retain old 0.14 validation paths. |
| Information ratio/stale wording/incomplete headline / 0.15 | Exact unemployment report ratio; version-neutral recorded-result wording; include nonzero unicameral abstentions. | `reports exact large labour-force ratios from the accessible reporting boundary`, `reports split unicameral plurality abstentions with version-neutral limitations` | Future reports/presentation only; no Reality access expansion or historical briefing rewrite. |
| Extra unknown/duplicate war snapshot Regions / limited-war foundation | Reject any snapshot target outside permanent registry and duplicate targets. | `rejects extra unknown/duplicate CB snapshot targets: %s`, all diplomacy/war tests | Corruption-only; no changes to CB windows, occupation, sovereignty or outcomes. |
| Missing platform CI / delivery | Minimal Ubuntu + Windows matrix: checkout/setup-node v4, `npm ci`, `npm run verify`; latest Node 22 meets pinned dependency engines. | Committed `.github\workflows\verify.yml` | Guardrail only; local checks are Windows/Node 24.21.0, not claimed Linux/Node 22 execution. |

No proven finding was dismissed. The audit's explicitly non-defective
contracts remain: booked fiscal owners can lag mid-period sovereignty,
future-dated claims/CBs remain legally date-gated, service capacity remains
gradual, crisis parameters remain modelled, missing evidence/UNKNOWN stays
unavailable, generic allocation ties remain ordered, and old 0.14 results are
not reinterpreted.

### Reference adaptations and saved-state compatibility

Global schema remains 13. New estimates/results add the optional
`seatApportionment: identity_hash_v1` method marker. The supplied neutral
tie rule is used for future calculations, but absence of the marker keeps the
original candidate allocator when validating saved plurality results.
Backfilling a new method onto old records would silently reinterpret exact
odd-seat ties, so it is deliberately not performed. The generic socioeconomic
allocator is unchanged. The unmarked-candidate regression is a constructed
compatibility record; it is not claimed as a captured pre-patch production
save. The actual captured `situational-0.14-v2` fixture stays byte-identical:
Git blob `a339183cd96d03dbd4128d39d0a1ac611c8f5de0`.

JSON has always omitted `undefined` properties. Migration/reload now restores
registered ownership/population/output identity keys with `undefined` before
validation while retaining every saved value and extra key (unknown extras
are still rejected). This does not copy scenario baselines, infer a sovereign
owner or turn unavailable into zero. Older JSON cannot distinguish an omitted
unavailable field from a deleted field; that format limitation is explicit.
Live state and serialization with context reject missing identity keys.
Date, tick, seed, state values and recorded votes remain untouched; no
schema-12 replay or fictional party evidence is introduced.

RNG retry zero is byte-for-byte the former hash input. `uint32` and float
outputs do not change. Existing <=32-bit integer draws change only if the
first sample lies in the formerly biased rejection zone. Wider draws were
previously restricted incorrectly to 32 bits; new <=53-bit spans sample their
actual range, and larger spans fail explicitly. This can change those narrow
future stochastic decisions after reload, never saved decisions/history.
The finite 128-attempt guard raises an explicit error, not a biased fallback.

The first expanded focused run found the information test using raw
`JSON.parse(JSON.stringify(state))` as a substitute for canonical reload.
That bypass loses unavailable identity keys; the regression now exercises
`serializeSimulationState` / `restoreSimulationState` directly. Subsequent
focused-test failures were test API/fixture mistakes, corrected before the
required complete validation; none was counted as a pass.

### Executed validation and performance

The complete ordered pre-commit validation is recorded below. The delivery
report separately identifies the exact final SHA checked after committing;
this pre-commit table does not substitute for that run. Previous candidate
measurements above remain the before reference; sequential after-patch runs
use the same workloads.
There is no new daily scan: national reconciliation runs in the existing
invariant path, with aggregation otherwise restricted to initialization,
registry rebase and the existing weekly update.

Every required ordered command below exited 0. They ran sequentially on
Windows, Node 24.21.0, without a concurrent heavy workload. PowerShell uses
the Windows `npm.cmd` / `npx.cmd` entry points for these commands.

| Exact command | Actual result |
|---|---|
| `npx tsc -b --pretty false` | Passed. |
| `npm run economy:audit` | 5 tests / 1 file; audit command 5,707 ms. |
| `npm run fiscal:audit` | 22 tests / 2 files; 4,933 ms. |
| `npm run crisis:audit` | 37 tests / 1 file; 2,495 ms. |
| `npm run crisis:benchmark` | 2 tests / 1 file; 17,726 ms. |
| `npm run politics:audit` | 36 tests / 3 files, including its own world benchmark; 123,732 ms. |
| `npm run politics:benchmark` | 3 tests / 1 file; 119,876 ms. |
| `npm run governance:audit` | 87 tests / 1 file; 78,263 ms. |
| `npm run governance:benchmark` | 1 test / 1 file; 8,998 ms. |
| `npm run information:test` | 32 tests / 1 file; 22,707 ms. |
| `npm run information:audit` | Passed; 948 parties, 7 derived, 1 ambiguous, 940 unavailable, zero missing analogues; 650 ms. |
| `npm run information:benchmark` | 1 test / 1 file; 9,323 ms. |
| `npm run benchmark:world` | 4 tests / 1 file; 46,685 ms. |
| `npm run verify` | Data audit, TypeScript/Vite build and 390 tests / 30 files passed; 145,168 ms command, 131.08 s test phase. The existing Vite large-chunk warning remains, not an error. |
| `git diff --check` | Passed after the complete ordered sequence and manual diff review. |
| `npx vitest run src\simulation\__tests__\foundationMath.test.ts src\simulation\__tests__\engine.test.ts src\simulation\__tests__\diplomacy.test.ts src\simulation\__tests__\war.test.ts --maxWorkers=1 --reporter=verbose` | Final focused foundation pass: 80 tests / 4 files, 2.93 s; helpers 14, engine 44, diplomacy 10, war 12. |

The final six governance hardening cases also passed separately with
`npx vitest run src\simulation\__tests__\governance.test.ts -t 'unmarked candidate|dated fiscal|inactive officeholders|rounds signed|exact odd-seat|independently valid plurality' --maxWorkers=1`
(6 passed / 81 skipped, 9.44 s). No timeout occurred in the complete ordered
validation. Earlier focused failures are disclosed above, not counted as
successful runs.

Actual runtime and test diffs were reread, including every new helper and
the CI workflow. Searches of affected runtime paths found no `Math.random`,
`setInterval`, new independent scheduler or clock. The only matching
randomness text in the combined runtime/test search is an existing negative
source assertion. No Windows-only fixture read remains in the changed
governance suites. Source data, manifests, Country/Region IDs and
`docs\agent-handoff.md` have no diff.

| Same benchmark metric | Before reference | After hardening |
|---|---:|---:|
| Ten-year socioeconomic simulation | 5,994.66 ms; 609 ticks/s | 6,179.19 ms; 591 ticks/s |
| Ten-year fiscal simulation | 23,328.53 ms; 156 ticks/s | 23,143.61 ms; 158 ticks/s |
| Three-year political simulation | 87,954.73 ms; 12 ticks/s | 91,673.82 ms; 12 ticks/s |
| Political reload | 583.24 ms | 646.91 ms |
| Governance production inspection mean, 20 calls | 12.730 ms | 13.092 ms |
| Synthetic known-profile inspection mean, 20 calls | 12.522 ms | 12.659 ms |
| Full-cap information monthly report, 2,048 briefings / 252 Countries / 83 new emissions | 67.74 ms | 66.04 ms |
| Initial governance snapshot / serialization | 0.0335 / 269.38 ms | 0.0401 / 312.55 ms |
| Five-year crisis simulation | Not claimed as a paired baseline | 8,489.25 ms; 74,340 Country/crisis evaluations |

Before world/governance numbers are the captured plurality-candidate runs;
politics is its recorded audit, and the unchanged information workload uses
the prior final-139 information reference. These single-run measurements
are not statistical optimization claims. Political runtime is approximately
4.2% higher; exact-ratio/invariant work is retained rather than trading away
correctness. The bare ten-year scheduler/registry benchmark is 81.21 ms
(44,943 ticks/s); it is not a proxy for full fiscal or political work.

| Save metric | Before bytes | After bytes |
|---|---:|---:|
| Initial full-world governance save | 27,268,062 | 27,268,062 |
| Representative submitted world | 27,269,304 | 27,269,304 |
| Representative resolved plurality world | 27,283,363 | 27,283,456 |
| Resolved proposal record | 13,435 | 13,513 |
| Distribution fields across estimate/result | 4,800 | 4,800 |
| Three-year political world | 33,547,440 | 33,547,440 |
| Full-cap retained information workload | 17,771,032 | 17,771,032 |

The resolved world grows by 93 bytes (method markers and the complete
abstention headline), not persistent MP/faction state. Resolution delta from
submitted state is 14,152 bytes; complete delta from initial world is 15,394
bytes. Economy and fiscal world saves stay at 16,055,485 and 24,038,952 bytes,
respectively. Their checksums are exactly unchanged:
`212dc47e790b4de352fb30c66289ea279eda2f5d80dfd42531bf67af1a87a415`
and `1468ad67591f6b854dd4ba14ff1e32e1d5fe17cb10d22eb8faa00ee549cd7611`.

Source coverage/licences are unchanged: 948 parties, seven derived reviewed
analogue names, zero directly observed gameplay leader identities, one
ambiguous and 940 unavailable mappings; 342 reconciled executive identities
from 392 records. IPU remains CC BY-NC-SA 4.0; Party Facts, V-Party and relevant
primary licences remain `requires_confirmation`, a commercial-release
blocker. No source data, permanent IDs, UI authority, Public Perception,
institutional-interest gameplay or successor/faction features are added.
The handoff stays at accepted 0.14; no 0.16 work or main merge is authorized.

### Complete changed-file inventory

All paths below are relative to the repository. No data snapshot, manifest,
permanent-ID registry, UI component, agent instruction or accepted handoff
is modified by this corrective.

| Area | Files |
|---|---|
| Shared foundation | `src\simulation\date.ts`, `integerMath.ts`, `fingerprint.ts`, `rng.ts`, `invariants.ts`, `save.ts`, `diplomacy.ts`, `war.ts` (all under `src\simulation`) |
| Fiscal | `src\simulation\fiscal\math.ts`, `src\simulation\fiscal\runtime.ts` |
| Politics | `src\simulation\politics\aggregation.ts`, `initialization.ts`, `runtime.ts`, `invariants.ts` (all under `src\simulation\politics`) |
| Crisis | `src\simulation\crisis\derived.ts`, `runtime.ts`, `invariants.ts` (all under `src\simulation\crisis`) |
| Governance | `src\simulation\governance\analysis.ts`, `estimates.ts`, `internalPartyDistribution.ts`, `invariants.ts`, `model.ts`, `runtime.ts` (all under `src\simulation\governance`) |
| Government Information | `src\simulation\information\invariants.ts`, `src\simulation\information\runtime.ts` |
| Tests | `src\simulation\__tests__\foundationMath.test.ts`, `engine.test.ts`, `fiscal.test.ts`, `politics.test.ts`, `crisis.test.ts`, `war.test.ts`, `governance.test.ts`, `governanceWorld.test.ts`, `information.test.ts` (all under `src\simulation\__tests__`) |
| CI and evidence | `.github\workflows\verify.yml`, `docs\information-0.15.md`, `docs\milestone-0.15-candidate-validation.md` |

## Final foundation follow-up: baseline a5288fb (2026-10-02)

This corrective starts at exact
`a5288fb9895dc6598619af9637e0bd4c8182c397` on
`waffle913-milestone-015-government-information`. It is still a 0.15
candidate, not acceptance, a 0.16 milestone or a main merge. The no-code plan
preceded implementation; coherent foundation, conservation and governance
blocks were tested separately, followed by a separate actual-diff review.

### Defects and acceptance evidence

| Item | Correction | Regression coverage |
|---|---|---|
| 1, fresh Windows/Ubuntu verification | `*.md text eol=lf`; matrix `fail-fast: false`; Node 22 and byte-for-byte generated-audit checks retained | Fresh checkout and `npm ci` in both final-SHA Actions jobs; previous run `36969050512` genuinely failed its Windows stale Markdown comparison and cancelled Ubuntu |
| 2, duplicate dirty domains | A canonical domain appears only once, with existing tick/reason/entity checks retained | Duplicate disjoint records fail invariant and reload, rather than merging silently |
| 3, load-time data | Explicit supported Country/facts/office/mapping versions; exactly one fact/officeholder status; shared strict day parser | Every unsupported version, duplicate/missing records, impossible geography/office/population/economic dates; year-only GDP/fact observations remain legitimate, not retrieval/baseline dates |
| 4, nine socioeconomic cohorts | Compare the complete income/orientation allocation with `cohortsFor(population)` and enforce journal/provenance dates | Moving people between orientations or income groups fails despite conserved Region total; impossible dates fail |
| 5, fiscal coverage and dates | Every owned active economy needs its ledger; extra/non-economic ledgers fail; initialization/history/account dates validated | Missing and unknown ledger tests; transfer retains the booked owner; existing current-owner A/B counterfactual tests retained |
| 6, causal crisis evidence | Shared static specifications, exceedance, recovery and tipping; exact contributions, provenance role, activation condition and chronology | Range-valid forged chance/roll/source/threshold/contribution/recovery evidence fails; completed-history chronology, ordinal and maximum severity corruptions fail |
| 7, political conservation | Every owned socioeconomic Region and nonzero cohort remains represented exactly once, including empty unavailable-population Regions | Omitted Region/cohort cannot be hidden by rebuilt national support; extras, wrong IDs, double assignment fail; stored weekly ownership lag retained |
| 8, parliamentary identities | Non-legacy structured records reconcile with the pinned institution/chamber/party/seat allocation, including independent residual | Swapped seats preserve aggregate vote arithmetic but fail; foreign/omitted parties, missing/duplicate/foreign chambers and altered independent residual fail |
| 9, internal analysis identities | Shared supported consequence aggregation; magnitude, numeric delta and neutrality identities | Range-correct corrupted magnitude/delta/effects/missing goal/neutrality fail without re-analyzing history against mutable sources |
| 10, active war objective | Generic sovereignty transfer cannot change an active target; official war resolution remains authoritative | Unrelated C and premature attacker transfers fail; other Regions, occupation, victory and post-peace transfer remain valid |
| 11, old migrations | All v1-v4 paths finish with full schema-13 assertions, including when context is omitted | Valid v1/v2/v3/v4 ownership/date/population/output retained; malformed pause/date/unknown Region and unexplained Country fail |
| 12, dependency chains | Actual audit classified; no force fix, major upgrade, downgrade or override | Full audit and production-only audit, dependency explanations and source/import usage inspected; explicit tooling debt below |
| 13, truthful political coverage | Predicates recalculated against committed registry, not inferred from party names | 57 procedural Countries, eight differentiated historical-prior Countries, empty intersection; no dataset additions |

No state schema/model version changes or historical replay are introduced.
Old no-context migration admits Country IDs from the supplied permanent
Regions, historical owners attached to their registered legacy macro
territories, and reconciled permanent political-registry references. A
standalone unexplained ownership value fails explicitly. This proves the
legacy format's internal identity contract, not an external factual tenure
or geopolitical observation; a supplied complete Country context remains
the stronger reference universe.

Monthly fiscal ledger ownership and weekly political ownership intentionally
remain snapshots of their respective last booking/evaluation. They are not
silently rewritten after a sovereignty change. No second ownership map,
engine, RNG, clock, scheduler, information layer or per-MP state is added.
Every surviving schema-13 person and persisted office proof remains
self-contained on ordinary reload. The aggregate-only legacy path and
historical unmarked seat allocator remain separate from new marked votes.
The authentic situational fixture is unchanged:
`a339183cd96d03dbd4128d39d0a1ac611c8f5de0` (Git blob).
No old expected snapshot or historical fixture was changed to pass tests.

### Dependency classification

`npm audit --json` actually returned exit 1: six package entries (four high,
two moderate), not six independent advisories. The dependency manifest and
lockfile are unchanged. `npm audit --omit=dev --json` returned exit 0 and
zero vulnerabilities. Import inspection finds `mapshaper` only in
`scripts\generate-region-data.mjs`, spawning its CLI for offline geometry
simplification. These chains are not imported into the shipped browser/game
runtime; their exposure is development/data processing of hostile files,
not a claim that local tooling is safe.

| Package | Installed dependency path | Finding / remediation boundary |
|---|---|---|
| `mapshaper@0.7.68` (high) | Root devDependency | Inherited metavulnerability from the following chains; npm suggests a semver-major downgrade to `0.6.13`, deliberately not applied |
| `adm-zip@0.5.18` (high) | `mapshaper -> adm-zip` | ZIP memory/decompression DoS, extraction/async flaws; advisories require `0.6.1`, outside mapshaper's `^0.5.9` range |
| `fflate@0.8.2` (moderate) | `mapshaper -> fflate`; also optional `flatgeobuf -> ol -> zarrita -> numcodecs -> fflate` | ZIP64 infinite loop, GHSA-px8p-9vwx-vf98; patched `0.8.3` is a patch release but the direct importer pins exact `0.8.2`, so no unvalidated override |
| `@ngageoint/geopackage@4.2.9` (high) | `mapshaper -> @ngageoint/geopackage` | Inherited `file-type`/`image-size` metavulnerability |
| `file-type@16.5.4` (moderate) | `mapshaper -> @ngageoint/geopackage -> file-type` | ASF parser loop, GHSA-5v7r-6r5c-r473; patched `21.3.1` is outside `^16.5.4`, with major/API compatibility implications |
| `image-size@0.8.3` (high) | `mapshaper -> @ngageoint/geopackage -> image-size` | ICNS parser loop, GHSA-w3rx-r6r6-pgpr; affected through `2.0.2`, requiring a later major than the pinned `0.8.3` |

The `adm-zip` audit includes GHSA-xcpc-8h2w-3j85, GHSA-vwc7-r8mq-g2x9,
GHSA-7q85-xj36-vmfc, GHSA-rcw4-f5rp-g42v, GHSA-j5f4-cc29-5x44,
GHSA-p634-w6r4-rjp2, GHSA-c6fg-446q-cg94 and GHSA-8238-w5pm-2374.
Deprecation debt is also dev-only:
`mapshaper -> mproj -> geographiclib@1.48.0`, and optional
`mapshaper -> better-sqlite3 -> prebuild-install@7.1.3`.
An upstream-compatible dependency update and dedicated tooling regression
pass are follow-up work. Do not feed these old parsers untrusted archives.

### Recomputed coverage and limitations

Procedural completeness means at least one applicable chamber and, in every
chamber, sourced known total seats, zero independent residual, and the exact
sum of party seats. It is not known party behavior. Differentiated ideology
means at least one `sourced`/`partial` historical basis with a non-neutral
dimension, not a directly observed 2026 position. The eight Countries are
Canada, Australia, Brazil, Japan, France, Germany, United States and United
Kingdom. None is in the 57-Country procedural set. Default V1 voting cannot
manufacture an enactment path from this disjoint evidence.

Data, permanent IDs, source snapshots and licensing remain unchanged:
948 parties; seven derived reviewed fictional leader names, zero directly
observed gameplay identities, one ambiguous and 940 unavailable mappings;
342 reconciled executives. IPU CC BY-NC-SA 4.0 and the unconfirmed Party
Facts/V-Party/primary-source licences remain commercial-release blockers.
Past RNG rolls cannot be recreated from the current tick without their
historical tick; stored activation evidence is checked internally instead.
Completed crisis summaries contain no fabricated activation snapshot.

### Executed validation and performance

Focused core/data/migration/war tests: 94 tests in five files, 6.56 s.
Focused socioeconomic/fiscal/politics/crisis tests: 130 tests in four files,
4.16 s. Focused governance/historical-save/date run: 24 passed, 92 filtered
out, three files, 25.70 s. After adding the last chamber/history cases:
18 passed, 138 filtered out, two files, 14.78 s.
`npx tsc -b --pretty false` passed after correcting a TypeScript optional-date
narrowing error. An initial newly inserted test block also had a syntax
error; it was corrected before these successful runs, not hidden as a pass.

The first full `npm run verify` was **not** successful: 455/458 passed,
with three timeout failures (two full-world persistence checks at 5 s and
the fiscal world workload at 60 s). The isolated fiscal simulation had
risen from the prior 23,143.61 ms reference to 36,063.93 ms. A second no-code
plan addressed this measured regression. Strict-day results and canonical
cohort expectations are now memoized **only within each socioeconomic
invariant invocation**. Every stored Region/cohort is still checked;
validity is never cached, no mutable Region is trusted, and no cross-tick
cache or save field is created. The new two-Region corruption regression
checks reuse within a pass and corruption after a successful check.

The two full-world historical integration tests now use the existing
30-second world-save budget rather than an implicit five-second unit-test
timeout. Their historical equality/assertions remain unchanged. The fiscal
benchmark's 60-second deadline and all other benchmark thresholds remain
unchanged. Post-correction targeted tests passed: 36 tests, 86 filtered out,
two files, 19.34 s. The final full verify passed **459 tests / 30 files**.

| Executed command | Actual result | Runner duration / total command time |
|---|---|---|
| `npx tsc -b --pretty false` | Exit 0, repeated after the measured-overhead correction | No separate elapsed claim |
| `npm run data:audit` | Exit 0; identical generated artifacts; 252 Countries / 4,574 Regions, zero blocking anomalies | 10.640 s standalone; repeated within final verify |
| `npm run information:test` | Exit 0; 32 tests | 24.59 / 25.699 s |
| `npm run information:audit` | Exit 0; 948 mappings audited; seven reviewed analogues, one ambiguous, 940 unavailable, 342 executives | 0.715 s total |
| `npm run governance:audit` | Exit 0; 100 tests | 96.61 / 97.755 s |
| `npm run politics:audit` | Exit 0; generated registry/coverage unchanged; 42 tests / three files | 125.40 / 127.052 s |
| `npm run fiscal:audit` | Exit 0; 26 tests | 4.37 / 5.499 s |
| `npm run crisis:audit` | Exit 0; 56 tests | 1.95 / 3.280 s |
| `npm run economy:audit` | Exit 0; five tests; unchanged generated evidence | 5.28 / 6.518 s |
| `npm run crisis:benchmark` | Exit 0; two tests | 17.70 / 19.054 s |
| `npm run politics:benchmark` | Exit 0; three tests | 131.85 / 132.975 s |
| `npm run governance:benchmark` | Exit 0; one test | 9.06 / 10.107 s |
| `npm run information:benchmark` | Exit 0; one test | 9.08 / 10.112 s |
| `npm run benchmark:world` | Exit 0; four tests, repeated after memoization | 61.09 / 62.206 s first; 53.90 / 55.141 s final standalone |
| `npm run verify` | First exit 1 with the three recorded timeouts; final exit 0, data audit + production build + 459 tests / 30 files | First 158.53 / 176.517 s; final 149.67 / 167.745 s |
| `git diff --check` | Exit 0 | No elapsed claim |
| Built-in `rg`, `Math\.random`, `src\simulation`, excluding `__tests__` | No matches in runtime | No unexecuted shell command claimed |
| `npm audit --json` / `npm audit --omit=dev --json` | Exit 1, six tooling entries / exit 0, zero production entries | Findings retained, not falsely fixed |

| Workload metric | Recorded measurement |
|---|---:|
| Ten-year socioeconomic simulation, final isolated run | 6,619.15 ms; 551 ticks/s |
| Ten-year fiscal simulation before local memoization | 36,063.93 ms; 101 ticks/s |
| Ten-year fiscal simulation after local memoization | 27,844.92 ms; 131 ticks/s |
| Daily fiscal snapshot reuse, final isolated run | 353 reused / 12 changed days; 0.0187 ms reused-day mean |
| Three-year political simulation, separate benchmark | 102,093.33 ms; 11 ticks/s; 780.25 ms reload |
| Five-year crisis simulation | 8,868.96 ms; 74,340 Country/crisis evaluations |
| Governance production / synthetic inspection mean, 20 calls | 13.978 / 13.468 ms |
| Full-cap retained information report / new briefings | 61.95 ms / 83 |

These are single-run measurements, not controlled statistical speedup
claims. Stronger validation still costs time: the final isolated fiscal
simulation is about 20% above the previous reference, after reducing the
initial corrective's overhead without weakening conservation. Population
and fiscal checksums are unchanged:
`212dc47e790b4de352fb30c66289ea279eda2f5d80dfd42531bf67af1a87a415`
and `1468ad67591f6b854dd4ba14ff1e32e1d5fe17cb10d22eb8faa00ee549cd7611`.
The frozen registry integrity checksum stays `25750886`.
World save sizes remain 16,055,485 bytes (economy), 24,038,952 (fiscal),
33,547,440 (politics), 27,268,062 (initial governance), 27,283,456 (resolved
governance), and 17,771,032 (full-cap information history). No persistent
simulation value or method marker changes in this follow-up; the built
JavaScript asset hash necessarily changes with validation code.

### Follow-up changed-file inventory and delivery boundary

| Area | Files |
|---|---|
| CI / checkout | `.gitattributes`, `.github\workflows\verify.yml` |
| Load-time data | `src\data\countryData.ts`, `regionData.ts`, `populationData.ts`, `economicData.ts`; their four corresponding `src\data\__tests__` files |
| Shared engine / migration / war | `src\simulation\invariants.ts`, `save.ts`, `region.ts`; `engine.test.ts`, `region.test.ts`, `war.test.ts` in `src\simulation\__tests__` |
| Socioeconomic / fiscal / politics | Their three `invariants.ts` files under `src\simulation`; corresponding three subsystem test files |
| Crises | `src\simulation\crisis\derived.ts`, `runtime.ts`, `invariants.ts`; `src\simulation\__tests__\crisis.test.ts` |
| Governance | `src\simulation\governance\analysis.ts`, `invariants.ts`; `src\simulation\__tests__\governance.test.ts` |
| Documentation | `docs\crisis-0.12.md`, `governance-0.14.md`, `milestone-0.15-candidate-validation.md` |

The 32-file diff excludes data snapshots/registries, permanent identities,
historical fixtures, dependency manifests, UI, Government Information
runtime, agent instructions and the accepted handoff. Post-push delivery
must separately read the Actions run on the exact final SHA and report
both Ubuntu/Windows Node 22 conclusions. Local success alone is not
cross-platform verification. No main merge, 0.16 work or 0.15 acceptance
is part of this correction.

## War sovereignty boundary follow-up to `c1087f8452426dd66bab1d3c0c85c33af87cc746`

This independently requested correction closes three canonical-state holes,
without changing war outcomes, occupation semantics, claims, CBs or any
other subsystem. Active `take_region` wars now require their target's
sovereign owner to remain the defender. The existing shared war invariant
also rejects that corruption during schema-13 reload, even without an
occupation. Generic Region transfers reject sovereignty changes of any
Region occupied under an active war, not only the declared objective.
Both transfer endpoints must be own entries in the existing canonical
`engine.fidelityByCountry` universe; inherited object keys are not Countries.

Regressions cover target-owner-only corruption, unknown source/destination
Countries, prototype-key endpoints, unchanged rejected state, registered
no-op transfers, non-target occupation, liberation, all three peace outcomes
and post-war transfer/reload. The synthetic v2 migration/transfer test now
supplies its complete two-Country context before transferring to beta;
no migration implementation or archived save fixture changes.

| Executed command / check | Actual result |
|---|---|
| `npx vitest run src\simulation\__tests__\region.test.ts src\simulation\__tests__\war.test.ts -t 'rejects active target sovereignty\|protects non-target occupied\|rejects unregistered sovereignty' --maxWorkers=1` before runtime correction | Exit 1; seven expected regression failures, 29 filtered out: all three holes reproduced |
| `npx tsc -b --pretty false` | Exit 0 |
| `npx vitest run src\simulation\__tests__\region.test.ts src\simulation\__tests__\war.test.ts src\simulation\__tests__\engine.test.ts src\simulation\__tests__\diplomacy.test.ts src\simulation\__tests__\snapshotArchitecture.test.ts --maxWorkers=1` | Exit 0; 100 tests / five files, 5.08 s |
| `npm run verify`, first run | Exit 1; 466 passed, one fiscal world test exceeded its unchanged 60-second timeout under concurrent full-suite load; 181.59 s |
| `npm run benchmark:world` | Exit 0; four tests, 53.69 s; isolated fiscal test 38.003 s with ten-year simulation 28,333.17 ms |
| `npm run verify`, unchanged retry | Exit 0; data audit, production build and 467 tests / 30 files, 156.63 s test-run duration |
| `git diff --check` | Exit 0 |
| Built-in `rg`, `Math\.random`, changed runtime files `region.ts` and `war.ts` | No matches |

No timeout, concurrency configuration or benchmark threshold was relaxed.
The existing large-bundle build warning remains. The isolated benchmark
retains the economic/fiscal checksums and save sizes recorded above, with
353 reused / 12 changed snapshot days. There is no new schema, migration,
history, source, licence, Country/Region identity, RNG or scheduler state;
schema 13 and its historical compatibility remain unchanged. The reviewed
diff is limited to the two runtime files, their two test files, README and
this report; the accepted handoff is untouched. Exact-SHA Ubuntu/Windows
Actions verification must be reported after push, separately from these
local results. This follow-up neither accepts 0.15 nor starts 0.16.

### CI resource isolation after the sovereignty correction

The six-file sovereignty correction was committed and pushed as
`e9d44134f1cd0250b7638ef52eacd94bb57ac6ab`, directly after the reviewed
`c1087f8452426dd66bab1d3c0c85c33af87cc746`. Actions run
[37020376478](https://github.com/waffle913/ProjectAtlas/actions/runs/37020376478)
really passed 467/467 on Ubuntu (Node 22.23.3, 183.17 s test-run duration).
Windows failed twice, both solely at the unchanged fiscal world test's
60-second deadline: 466 passed / one timeout, 231.09 s and 240.89 s overall
test-run durations. These failures are not reported as successful validation.

A separate CI-only follow-up limits Vitest to one worker so full-world
workloads do not contend across test files. The workflow still runs the
entire `verify` chain, fresh `npm ci`, both OS jobs and Node 22. The exact
command `npm run verify -- -- --maxWorkers=1` was executed locally and its
output confirmed `npm test -- --maxWorkers=1`, then
`vitest run --maxWorkers=1`. Data audit, production build and all 467 tests
in 30 files passed, exit 0, 358.19 s test-run duration. The extra separator
forwards the argument through the nested npm command; no package script,
test selection, assertion, timeout, benchmark threshold or simulation code
is changed by this follow-up. Serial execution takes longer overall but
retains each benchmark's original deadline. The only additional files are
the existing workflow and this report. Both exact-final-SHA jobs must still
be verified after the follow-up is pushed.

## Final Region / Diplomacy / Limited War mutation closure

Reviewed base: `a20b1525963d6995c0f8f56a3ecb53f1800cca91`, on
`waffle913-milestone-015-government-information`. This is corrective-only,
not acceptance of 0.15 or authorization for 0.16.

Two public-mutation closure defects were reproduced before correction:
different Country pairs could declare active wars over the same Region,
making a surviving war invalid after conquest; duplicate Explicit CB targets
were accepted by creation/diplomacy validation but rejected in war evidence.
Active objective Regions are now unique at declaration and in persisted
war validation. Explicit CB targets are unique at creation, diplomacy
validation and defensive war declaration. Duplicates are rejected, never
normalized. Ended objective reuse, ordered distinct multi-Region CBs and
claim-derived single targets retain their existing behavior.

The separate review covered every public mutator in the three modules:

| Mutator(s) | Closure / compatibility checked |
|---|---|
| `transferRegion` | Registered endpoints, current owner, active objective/occupation guards; ordinary/no-op/post-war transfers |
| `setRelation`, `adjustRelation` | Registered non-self canonical pair, finite bounded score, valid status, immutable record |
| `createClaim`, `renounceClaim` | Unique ID/active claim, registered references, strict dates/type, retained renounced history |
| `createExplicitCasusBelli` | Unique ID, registered endpoints/targets, unique target list, strict dates/type, defensive target-array copy |
| `revokeCasusBelli`, `expireCasusBelli` | Existing ID, supported terminal status, preserved evidence/references/target list |
| `declareLimitedWar` | Unique ID/pair/active target, defender sovereignty, available territorial CB, current-date declaration, valid snapshot |
| `occupyRegion`, `liberateRegion`, `endWar` | Active war, opposing sovereign/belligerent/date checks, one occupation, objective-only victory and war-scoped occupation removal |

**No additional concrete mutation-closure defect was found** in this scoped
review. Existing future-dated claim/Explicit CB availability remains
inclusive on its documented dates; no speculative lifecycle restriction,
whole-state mutation scan or other subsystem audit was introduced.

Exact regression names in `war.test.ts`: `rejects competing active objectives
across different Country pairs before mutation`; `rejects imported duplicate
active objectives with otherwise valid wars at invariant` / `at reload`;
`reuses an ended objective without rewriting either historical war`;
`allows distinct active objectives and preserves the other war after victory`;
`defensively rejects duplicate Explicit CB targets before snapshotting or
consuming the CB`; `preserves valid multi-Region Explicit CB order and transfers
only the declared objective`; `keeps all twelve public Region, Diplomacy and
War mutations invariant-closed and immutable`. `diplomacy.test.ts` adds
`rejects duplicate Explicit CB target creation without mutating state or input`
and persisted duplicate-target cases at `invariant` / `reload`.

| Executed command / check | Actual result |
|---|---|
| `npx vitest run src\simulation\__tests__\diplomacy.test.ts src\simulation\__tests__\war.test.ts --maxWorkers=1` before runtime fixes | Exit 1: seven expected failures / 31 passes, 2.02 s; both defects reproduced at all requested rejection boundaries |
| `npx vitest run src\simulation\__tests__\region.test.ts src\simulation\__tests__\diplomacy.test.ts src\simulation\__tests__\war.test.ts src\simulation\__tests__\engine.test.ts src\simulation\__tests__\snapshotArchitecture.test.ts --maxWorkers=1` | Exit 0: 111 tests / five files, 4.34 s |
| `npx tsc -b --pretty false` | Exit 0 |
| `npm run verify -- -- --maxWorkers=1` | Exit 0: data reproducibility/audit, production build, 478 tests / 30 files, 312.61 s test-run duration; includes unchanged world benchmarks |
| `git diff --check` | Exit 0 |
| Built-in `rg`, `Math\.random`, changed runtime `war.ts` / `diplomacy.ts` | No matches |

No schema/migration, saved-history repair, result rewrite, identity, data,
licence, scheduler/RNG, war outcome, timeout, benchmark threshold, assertion,
test selection, Node version or one-worker CI configuration was changed.
The existing large-bundle warning remains. The diff is limited to the two
runtime files, their tests, README and this corrective record.
An exact implementation-SHA/Ubuntu/Windows receipt will be appended only
after actual CI verification; a documentation-only receipt commit is then
verified separately before reporting the final branch HEAD.

### Verified implementation delivery receipt

Final simulation implementation SHA:
`1cdca7459642c1b13482684e473e870531cfe30f`.
Its parent is the exact independently reviewed
`a20b1525963d6995c0f8f56a3ecb53f1800cca91`; branch:
`waffle913-milestone-015-government-information`.

Actual [Actions run 37027810166](https://github.com/waffle913/ProjectAtlas/actions/runs/37027810166)
has `headSha` equal to that implementation SHA and conclusion `success`.
Logs were read, not inferred from local tests: fresh checkout, `npm ci`,
Node **22.23.3**, unchanged complete one-worker verification on both jobs.

| Exact-SHA job | Conclusion | Actual tests / test-run duration |
|---|---|---|
| Ubuntu, job `110906806662` | `success` | 478/478, 30 files, 309.87 s |
| Windows, job `110906806463` | `success` | 478/478, 30 files, 378.68 s |

This receipt is committed separately without further implementation changes
so it records already-executed CI truthfully. Its documentation-only branch
HEAD and that HEAD's separate exact-SHA CI results are reported at final
handoff; embedding a document's own commit SHA would change that SHA.
No main merge, 0.16 work or self-declared 0.15 acceptance occurred.

## Situational institutional interest candidate

Reviewed parent: `61e415d76ae3ff16cf61961df70d93857d7a87e7`, on
`waffle913-milestone-015-government-information`. Both supplied references
were read completely before recording the no-code plan and editing runtime.
This is candidate implementation within 0.15, not acceptance or a new milestone.

Party evaluation supports situational institutional self-interest when proposal
analysis contains explicit legal power transfers. Current executive/chamber
leverage and power balance determine the effect, never a flat
government/opposition modifier. Current fiscal-only proposals explicitly contain
`institutionalEffects: []` and receive exactly zero/not-applicable adjustment.
Public/cohort evaluation remains material-only; Government Information access
and interpretation are unchanged.

The pure evaluator is in `governance/institutionalInterest.ts`. For each known
transfer, raw interest is destination stake minus source stake, in basis points.
Effective interest is signed-rounded raw interest times evidence confidence
divided by 10,000. Confidence is capped at 7,000 for partial evidence.
Adjustment is signed-rounded mean effective interest times 6,000 divided by
10,000. Final mainstream agreement is material agreement plus adjustment,
clamped to 0..10,000. Final confidence/coverage never exceeds the applicable
material and institutional evidence. Unknown leverage cannot become zero
evidence or ABSTAIN; when all effects are unknown, confidence is zero and the
party's seats are UNKNOWN.

Chamber stake uses complete sourced party seat share. Executive stake uses the
reconciled governing bloc: an outside party has structural zero, a sole
governing party full stake, and coalition parties use an equal-chamber average
of their sourced shares within the bloc. Missing usable allocations remain
unavailable, never invented equal shares. Coalition leverage and the 6,000
scaling coefficient are documented V1 modelled proxies, not observed
behavioral coefficients.

The same adjustment is applied to material samples before subtracting the
already-adjusted center, avoiding accidental cancellation. A separate strategic
dimension adds 50/75/100/125/150-percent sensitivity with
1,000/2,000/4,000/2,000/1,000 weights when the known adjustment is nonzero.
Its weighted sensitivity is exactly 100 percent. Mainstream agreement remains
the central result even when clamping shifts the aggregate distribution mean.
There are no individual MPs or new persistent factions.

### Regression evidence and compatibility

The 42 new cases are in the existing `governance.test.ts` audit:

| Contract | Actual evidence |
|---|---|
| A: no status penalty | Identical material profiles and no transfers give equal government/opposition results and zero adjustment |
| B: opponent executive gains chamber power | With 80/100 chamber seats and no executive stake, material agreement 6,000 receives -4,800 adjustment and becomes 1,200/NO; the governing party receives +4,800/YES. Swapping only status labels does not change the result |
| C-D: reversal/equal leverage | Reversing executive control reverses adjustment; equal source/destination stakes give zero, including a party absent from a complete allocation |
| E: unknown evidence | Unsourced branch gives confidence zero and 80 UNKNOWN seats, zero ABSTAIN |
| F: coalition balance | 30/50 bloc seats with 20 independents give executive stakes 3,750/6,250, reversed by reversing seats; missing allocations remain unavailable. Separate cases cover equal-chamber averaging and partial/ambiguous confidence caps |
| G: strategic plurality | Uniform material agreement 5,000 becomes central 3,800, mean 3,800, half-spread 804 with split NO/ABSTAIN; a clamped case preserves central 200 while mean becomes 620 and half-spread 2,048 |
| H: fiscal equivalence | Analysis and every numeric parliamentary distribution reproduce the genuine parent exactly after excluding new zero-effect evidence; public estimates are unchanged even with synthetic institutional effects |
| I: new result | A real fiscal resolution records `situational-plurality-0.15-v2`, saves/reloads exactly, and preserves schema, date, tick, seed and material state |
| J: historical result | Genuine `plurality-0.15-v1` proposal JSON and reload remain byte/structure-equivalent, with no institutional backfill or inspection mutation |
| K: corruption | 22 independent corruptions fail invariants, serialization and schema-13 reload even after estimate/result copies are resynchronized; three additional cases catch baseline changes masked by agreement clamping or confidence/coverage caps |
| L: determinism/copies | Reordered seat maps, party maps, governing IDs and chambers retain mathematical results; effect order remains display-only. Nested inspection copies and frozen snapshots protect canonical evidence |

The historical fixture was captured by executing the real resolver at the exact
reviewed parent before any runtime edit. The temporary capture test passed
1/1 in 7.00 s and was removed; its generated JSON remains checked in.
Profiles and institutional test transfers are explicitly synthetic, not observed
votes or playable constitutional reforms. Old `legacy-0.14-v1`,
`situational-0.14-v2` and `plurality-0.15-v1` markers remain supported without
recalculation or historical evidence fabrication.

Technical deviations from the supplied reference are compact module organization,
an extracted shared sample-moment helper, strengthened holder/lever/string and
Country/reference guards, and a deterministic `materialBaselineFingerprint` on
new institutional records. The existing governance fingerprint detects independent
baseline corruption that numeric clamping or evidence caps could otherwise mask.
It is an integrity checksum, not empirical provenance or cryptographic
authentication. Valid arithmetic and scoring follow the reference. Old versions
reject new institutional metadata rather than silently downgrading validation.

Global schema 13 and governance version 1 are unchanged. No migration/backfill,
new canonical system, RNG, scheduler, ownership map, identity or static dataset
is introduced. Existing save, snapshot and inspection copying mechanisms handle
the nested evidence. Fiscal enactment still uses the existing exact-once queue.

### Executed final validation

Commands were executed on Windows using `npm.cmd`/`npx.cmd`. An initial focused
run failed because a test import was missing; that import was corrected. An
intermediate 138/138 audit preceded the final fingerprint refinements and is not
substituted for the final results below.

| Executed command / check | Actual result |
|---|---|
| `npx tsc -b --pretty false` after final runtime/test changes | Exit 0 |
| `npx vitest run src\simulation\__tests__\governance.test.ts --testNamePattern='situational institutional interest' --reporter=verbose` | Exit 0: 42/42, 100 existing tests skipped, 31.69 s |
| `npm run governance:audit` | Exit 0: 142/142, 117.75 s |
| `npm run governance:benchmark` | Exit 0: 1/1, test 5,185 ms, total 9.67 s, unchanged 30-second budget |
| `npm run information:test` | Exit 0: 32/32, 26.97 s |
| `npm run information:audit` | Exit 0: 948 parties; 7 derived, 0 sourced/observed, 1 ambiguous, 940 unavailable; 342 reconciled executive officeholders; zero accepted mappings lacking a fictional analogue |
| `npm run politics:audit` | Exit 0: 252 Countries, 948 parties, 281 chambers, 31,736 represented seats; 42/42 tests in three files, 131.45 s |
| `npm run verify -- -- --maxWorkers=1` | Exit 0: pinned data reproduction/audit, production build, 520/520 tests in 30 files, 359.25 s test-run duration, including existing domain/world benchmarks |
| `git diff --check` | Exit 0 |
| Built-in `rg`, `Math\.random`, all six changed governance runtime paths | No matches |
| `git diff --exit-code` on accepted handoff, data, save/state, Region/War/Diplomacy and CI workflow | Exit 0; final scope inspection found no unrelated file change |

The governance benchmark measured 20 material analyses at mean 16.969 ms,
synthetic material analyses at 14.551 ms and explicit synthetic institutional/
plurality evaluations at 0.285 ms, evaluating four parties. These are distinct
workloads, not a like-for-like before/after speedup claim. Snapshot was 0.035 ms,
serialization 417.970 ms, initial save 27,268,062 bytes. The resolved synthetic
profile fiscal proposal was 17,575 bytes, including 4,800 distribution bytes
and 4,050 institutional-evidence bytes; submitted-to-resolved save growth was
18,214 bytes. The politics audit's three-year benchmark measured 100,922.87 ms,
11 ticks/s, weekly snapshot 99.10 ms, coincident snapshot 390.32 ms, reload
1,514.64 ms and save 33,547,440 bytes. Measurements depend on the local host;
no deadline, assertion or benchmark threshold was relaxed.

Coverage remains 57 procedurally resolvable Countries and eight with ideological
evidence, with zero overlap. No new observed data or licence clearance is claimed.
IPU Parline remains CC BY-NC-SA 4.0; V-Party, the Party Facts data bridge and
relevant official publications remain `requires_confirmation` where previously
recorded. Commercial release remains blocked. The existing large-bundle build
advisory is not a simulation failure.

Scope comprises the six governance runtime files, Governance tests/benchmark,
genuine parent fixture, README, Governance/Information documentation, this
candidate report and both persistent instruction files. Exact-SHA Ubuntu/Windows
Node 22 CI must be read after commit/push and reported separately, without
inferring success from these local results. No constitutional-reform gameplay,
mutable constitutions, election-driven governing-bloc updates, coalition
negotiation, successor-generation block, 0.16 or main merge is implemented.
Post-replacement successor generation remains the sole unimplemented 0.15
design-intent block. The accepted handoff is untouched; independent review
remains required.

### Strict institutional UNKNOWN correction

Independent review of `ff7a60119fe745dbb284028de2228697362d6572`
requested two semantic corrections only. This follow-up supersedes that
candidate's calculable mixed-known/unavailable aggregation and its promotion
of unavailable governing-bloc evidence to partial. It does not accept 0.15.

If any evaluated explicit transfer is unavailable, the global institutional
record is unavailable with confidence zero and adjustment zero. All evaluated
effects, their order, source and explanation remain diagnostic evidence.
The existing application helper preserves the material agreement for debug
but supplies confidence zero, so the existing vote/distribution/allocation
path yields UNKNOWN for every party seat, never ABSTAIN. Unknown transfers
are not ignored or implicitly assumed to have zero effect.

Executive stake now returns unavailable with no numeric stake when the
required governing-bloc coverage is unavailable, before the outside-party,
sole-governing-party or coalition branches. A nonempty party list alone is
not evidence. Ambiguity may still degrade usable evidence to partial, never
upgrade unavailable evidence. Complete/partial effects, the 7,000 partial
confidence cap, 6,000 scaling, strategic plurality and evidenced coalition
proxy retain their existing formulas.

Five additional regression cases cover both signs of a known effect with
an unavailable potential reverse transfer, and unavailable bloc evidence
for outside, sole and coalition parties. Mixed cases exercise complete and
partial known effects, both effect orders, preservation of the known
diagnostic record and source/explanation, and exact all-UNKNOWN party/chamber
allocation (100 seats total). Executive cases exercise both ambiguity flags.
The former mixed-partial expectation is replaced by a complete-plus-partial
control: effective interests -8,000/+5,600 produce adjustment -720,
confidence 8,500 and final agreement 5,280 with a known ABSTAIN, proving
partial is not treated as unavailable.

Only `governance/institutionalInterest.ts`, `governance.test.ts`,
`information-0.15.md` and this appended record change. The no-code plan
preceded edits; tests reproduced both defects before runtime changes; the
actual diff was read separately. No state/save/migration, old fixture/vote,
schema 13, `situational-plurality-0.15-v2`, fiscal empty-effect analysis,
authority, Government Information, scheduler/RNG, static data or identity
contract changes. Existing invariants reuse the corrected pure evaluator.

| Executed command / check | Actual result |
|---|---|
| `npx.cmd vitest run src\simulation\__tests__\governance.test.ts --testNamePattern='unavailable coalition evidence\|known effect plus\|complete/partial transfers' --reporter=verbose`, before guards | Exit 1: five expected failures, one partial-control pass, 141 skipped; 8.37 s |
| Same focused command after guards | Exit 0: 6/6, 141 skipped; 8.53 s |
| `npx.cmd tsc -b --pretty false`, final runtime | Exit 0 |
| `npm.cmd run governance:audit` | Exit 0: 147/147; 123.27 s |
| `npm.cmd run governance:benchmark` | Exit 0: 1/1, test 4,932 ms, total 9.39 s; unchanged 30-second budget |
| `npm.cmd run information:test` | Exit 0: 32/32; 26.97 s |
| `npm.cmd run information:audit` | Exit 0: unchanged 948 parties, 7 derived mappings, 1 ambiguous, 940 unavailable, 342 reconciled executive officeholders, no accepted mapping without a fictional analogue |
| `npm.cmd run politics:audit` | Exit 0: 42/42 in three files; 132.47 s |
| `npm.cmd run verify -- -- --maxWorkers=1` | Exit 0: data reproducibility/audit, production build, 525/525 in 30 files; 393.77 s test-run duration |
| `git diff --check` | Exit 0 |
| Built-in `rg`, `Math\.random`, changed runtime module | No matches |
| `git diff --exit-code`, marker/model, resolution, material analysis, plurality, invariants, old fixtures and accepted handoff | Exit 0 |

Governance benchmark: 20 material analyses at mean 14.822 ms, synthetic
material analyses 14.016 ms, synthetic institutional/plurality evaluations
0.357 ms for four parties; snapshot 0.0316 ms, serialization 392.88 ms,
initial save 27,268,062 bytes. Resolved proposal remains 17,575 bytes,
including 4,050 institutional-metadata bytes; submitted-to-resolved save
delta remains 18,214 bytes. Politics benchmark: three simulated years in
101,848.67 ms, 11 ticks/s, weekly snapshot 117.03 ms, coincident snapshot
386.08 ms, reload 933 ms, save 33,547,440 bytes. Timings are host/workload
measurements, not a speedup claim; no timeout or assertion was relaxed.

Data coverage and licence limitations are unchanged: 57 procedurally complete
Countries, eight with ideological evidence, zero overlap; IPU noncommercial
licence and previously unconfirmed data licences still block commercial release.
No successor-generation block, 0.16, main merge or self-acceptance is included.
Exact-SHA Ubuntu/Windows Node 22 CI is reported after push from actual logs,
separately from these local results; work then stops for independent audit.

### Ambiguous executive leverage and semantic transfer uniqueness correction

Independent review of `e56dd6fcf86c51e0bf1a5f9cd22a2eef2c28b170`
accepted the preceding strict UNKNOWN corrections and requested two final
institutional micro-corrections. This record supersedes the earlier allowance
for an ambiguous governing bloc to yield partial numeric executive leverage.
It is a candidate validation record, not acceptance of 0.15.

Any ambiguous Country governing-bloc derivation now makes executive stake
unavailable, with no numeric stake, for every party, including a sole listed
governing party, an outside party and each listed coalition member. Structural
government/opposition status remains diagnostic only. Unresolved membership
can alter the magnitude or even the direction of institutional self-interest;
it cannot be represented by a reduced-confidence central estimate. Through
the accepted strict UNKNOWN path, a transfer involving this executive yields
unavailable institutional status/coverage, confidence zero and adjustment
zero, preserving material agreement for debug. Its party vote and all party
seats become UNKNOWN, never ABSTAIN. Unambiguous partial evidence remains
calculable with its existing 7,000 confidence cap.

Effect arrays must have unique IDs and unique semantic transfer keys.
The shared evaluator/invariant helper returns exactly
`${effect.lever}|${effect.from}|${effect.to}`. Different IDs, source text or
explanations do not distinguish the same causal transfer. Duplicate keys are
rejected as malformed evidence without silently deduplicating or weighting
rows. Different levers, source chambers and reverse directions remain valid
distinct transfers. V1 has no weight field; weighted or repeated same-type
clauses would require an explicit future model/version change.

The no-code plan preceded edits. Thirteen regression cases were added before
the runtime guards: ten failed as expected and three valid-distinction
controls passed. They cover ambiguity for outside/sole/coalition parties,
clearing ambiguity to restore exactly the previous partial result, duplicate
semantics despite different IDs/provenance, valid lever/source/direction
distinctions and accidental mean weighting. A balanced transfer pair formerly
yielded agreement 5,000/ABSTAIN, but duplicating its negative row changed it to
3,400/NO; the duplicate now yields UNKNOWN with no institutional adjustment.
Saved-state cases rebuild both parliamentary estimates and vote results,
proving the invariant, serialization and schema-13 reload reject a
self-consistent semantic duplicate, not merely stale or mismatched metadata.

The final focused command was:

```powershell
npx.cmd vitest run src\simulation\__tests__\governance.test.ts --testNamePattern='ambiguous governing-bloc composition|clearing governing-bloc ambiguity|self-consistent saved v2 semantic|repeated semantic transfer keys|distinct institutional transfers|duplicate causal transfer' --reporter=verbose
```

| Executed command / check | Actual result |
|---|---|
| Focused 13-case selection before guards | Exit 1: 10 expected failures, 3 passes, 147 skipped; 14.04 s |
| Focused selection after guards | Exit 0: 13/13, 147 skipped; 30.19 s; final delivery rerun 13/13 in 7.95 s |
| `npx.cmd tsc -b --pretty false` | Exit 0 |
| `npm.cmd run governance:audit`, first two attempts | Each exit 1, 159/160: different unchanged tests exceeded their existing 5-second deadline; 160.84 s and 186.63 s |
| Isolated existing timed-out cases | Both passed together, 2/2 with 158 skipped; 8.06 s. The leader-order case also passed alone in 11.09 s |
| `npm.cmd run governance:audit`, final attempt | Exit 0: 160/160; 152.18 s |
| `npm.cmd run governance:benchmark` | Exit 0: 1/1, test 4,828 ms, total 8.78 s |
| `npm.cmd run information:test` | Exit 0: 32/32; 23.90 s |
| `npm.cmd run information:audit` | Exit 0: unchanged 948 parties, 7 derived mappings, 1 ambiguous, 940 unavailable, 342 reconciled executive identities, no accepted mapping without a fictional analogue |
| `npm.cmd run politics:audit` | Exit 0: 42/42 in three files; 130.38 s |
| `npm.cmd run verify -- -- --maxWorkers=1` | Exit 0: data reproducibility/audit, production build and 538/538 tests in 30 files; 367.93 s test-run duration |
| `git diff --check` | Exit 0 |
| Built-in `rg`, `Math\.random`, both changed runtime files | No matches |
| `git diff --exit-code`, model/marker, resolution, material analysis, plurality, old fixtures, data/scripts, CI and accepted handoff | Exit 0 |

The two initial full-audit failures were deadline failures in the unchanged
leader insertion-order and architectural invariant/RNG tests, not assertion
failures. Both passed in isolation, and the final normal audit and full
verification passed without changing tests, timeouts, benchmark thresholds or
CI. The cause of those initial local timing failures has not been established;
no claim of proven resource contention is made. Original failure logs remain
in session artifacts.

Governance benchmark: 20 material analyses at mean 14.28 ms, synthetic
material analyses 14.137 ms and synthetic institutional/plurality evaluations
0.31 ms for four parties; snapshot 0.0329 ms, serialization 374.36 ms,
initial save 27,268,062 bytes. Resolved proposal remains 17,575 bytes,
including 4,800 distribution bytes and 4,050 institutional-evidence bytes.
Submitted-to-resolved save growth remains 18,214 bytes; full-world initial
to resolved growth is 19,456 bytes. Politics benchmark: three simulated years
in 100,623.47 ms, 11 ticks/s, weekly snapshot 122.49 ms, coincident snapshot
407.85 ms, reload 747.26 ms and save 33,547,440 bytes. These are host/workload
measurements, not a before/after speedup claim.

Scope is exactly `governance/institutionalInterest.ts`,
`governance/invariants.ts`, Governance tests, current Information documentation
and this appended record. The actual runtime, test and documentation diffs
were reviewed separately. Existing complete/partial formulas, 6,000 scaling,
strategic plurality, material-only public evaluation, fiscal empty effects,
schema 13, `situational-plurality-0.15-v2` and old plurality-v1 votes are
unchanged. The stronger evidence check remains version-gated to v2. No state,
save layout, migration, historical vote rewrite, registry/source-data change,
new system, scheduler or RNG is introduced.

Coverage and licence limitations remain unchanged: 57 procedurally resolvable
Countries, eight with ideological evidence and zero overlap. IPU
CC BY-NC-SA 4.0 and previously unconfirmed V-Party, Party Facts bridge and
primary-source licences still block commercial release. Executive leverage
remains a modelled proxy when evidence permits it; ambiguous membership is
now honestly unavailable rather than numerically guessed.

Exact-SHA Ubuntu/Windows Node 22 results are reported from actual Actions
logs after commit/push, separately from local validation. No successor-generation
work, 0.16, main merge or self-declared 0.15 acceptance is included; the
accepted handoff remains untouched. Work stops for independent review.

### Context-derived fictional party succession integration

Reviewed parent: `323d702a49ed15eef388841d12b3f54a8acbd466`, on the existing
`waffle913-milestone-015-government-information` branch. Both supplied
references (713-line contract and 266-line pure module) were read completely
before the recorded no-code plan and implementation. This is one targeted
candidate block, not acceptance of 0.15.

Only automatically generated replacement party leaders use the new contextual
path. Its inputs are the fictional party platform; a common modelled
five-tendency prior; the affected Country's current cohort preferences weighted
by exact BigInt population times party support; current modelled national
support; and an equal-chamber mean of complete sourced legislative seat
allocations. Only that Country's Region/cohort list is scanned, once, in sorted
order. No world scan, daily work, scheduler, faction cache or persistent faction
state was added. Source successor identity remains unavailable, not a purported
observation about a real post-2026 leader.

In radical/firm/mainstream/pragmatic/moderate order, stances are
`10000/5000/0/-5000/-10000`, and baseline weights are
`1000/2000/4000/2000/1000`. For available modelled mandates and non-neutral
platform positions, `M` is the signed-rounded weighted mean of
`(mandate - platform) * sign(platform - 5000)`, with weight
`max(1, intensity)`, bounded to -5000..5000. When both support and seat share
are available with their required coverage, `G = seatShare - support`,
`A = clamp(2 * max(0, G), 0, 5000)` and
`S = clamp(2 * max(0, -G), 0, 3000)`. Otherwise the gap is absent;
zero derived pressures mean no evidence-based adjustment, not an observed
zero gap or fabricated saved value.

The five factors are respectively:

```text
10000 + M - round(A / 2)
10000 + round(M / 2) - round(A / 4)
10000 + S + round(A / 4)
10000 - round(M / 2) + round(A / 2)
10000 - M + A
```

Each factor clamps to 2500..20000. Raw weights are rounded
`baseline * factor / 10000`; the existing largest-remainder allocator
normalizes exactly to 10000, with fixed tendency-order tie breaking.
The shared keyed RNG uses system `party-leadership.internal-balance`,
party ID, effective date and `${successionId}:tendency`. It selects one
ephemeral tendency without adding mutable RNG state.

For each issue, start from the platform plus
`sign(platform - 5000) * round_signed(stance * 1400 / 10000)`,
bounded to 0..10000. The tendency transform preserves neutral positions;
negative stances approach neutral without crossing it. When a mandate exists,
blend the anchor toward it with
`B = clamp(2000 + round(A / 2) - round(S / 4), 1000, 4500)`.
With no mandate anywhere, `B = 0`; each unavailable issue remains unblended.
Actual mandate evidence, unlike the tendency transform alone, may cross
neutral. Final values are bounded to platform +/-2500 and 0..10000.
Confidence is `min(partyConfidence, 7000)` and every dimension is modelled.
Factor fractions use JavaScript `Math.round` exactly as in the reference;
signed ratios use the existing half-away-from-zero integer helper.

The weighting and factor-rounding statements above record the initial
integration at `8efffbf2f44d0804a2bea054802f4db5cb4f0b1b`. Its subsequent
integrity micro-corrective supersedes only those details: zero-intensity
directional issues contribute neither signal nor weight; positive intensity
retains its exact weight; all-zero usable intensity gives `M = 0` while
other available context still applies. Signed mandate halves now use
`scaledRatioSigned(M, 1, 2)` and non-negative pressure fractions use
`ratio(value, 1, denominator)`. The original measurements and validation
results below remain the actual initial-integration receipt.

The supplied reference's mathematics is retained. Mechanical adaptations use
the actual string engine-seed type, literal tendency types and a typed Map.
Added integrity guards reject malformed represented cohort opinions and
invalid tendency allocations explicitly; malformed national support remains
explicitly unavailable rather than becoming a numeric observation. No valid
input formula was changed.

New generated records use selection `modelled_internal_balance`, context
method `internal_party_balance_succession_v1` and provenance method
`internal_party_balance_succession_v3`. Optional evidence stores source,
limitation, coverage and value for support, seat share and exactly six issues,
plus the selected tendency and profile fingerprint. The existing Information
invariant checks structure, allowed coverage, value presence/bounds, exact
keyed selection, recomputed profile/fingerprint and generated provenance.
V3 person provenance must remain linked to a contextual succession, preventing
record deletion or old-selection relabelling from bypassing the proof.
Validation uses the saved context and static party, not current opinion to
reconstruct historical context. This is consistency checking, not
cryptographic authentication or proof that a coordinated forged history is
empirically true.

Explicit existing-member successors bypass generated selection and retain
their identity/profile/provenance without contextual evidence. The older
compatibility fill for missing metadata is unchanged. Fictional names,
the former person's unrelated office and explicit Continue/Switch player
handoff are preserved. There is no silent transfer of Country control.

Before changing runtime, a temporary test invoked the genuine reviewed-parent
resolver and verified schema-13 round-trip, then wrote the compact immutable
`leadership-fallback-0.15-v2.json` fixture with its parent SHA. The capture
passed 1/1 in 8.68 s. Its saved `modelled_fallback` selection,
`bounded_party_platform_succession_v2` provenance and original profile
remain unchanged. The temporary capture test was removed; the fixture was
not regenerated with the new resolver.

Forty-one regressions were added to the existing Governance suite:
determinism and insertion-order independence; exact large-population BigInt
means; affected-Country-only access; supporter direction; excess/deficit
representation pressure; missing versus evidenced-zero support/seats;
malformed inputs; all tendencies and neutral/extreme/profile bounds;
explicit existing members; both player handoff choices; new save/reload;
unchanged historical fallback; and independence from subsequently changed
current politics.

Twenty-four independent tamper cases each fail invariant, serialization and
schema-13 reload. They cover context values, coverage, missing/extra issues,
empty source/limitation, selected tendency, profile/fingerprint, succession
party, provenance method/party/date/source identity, missing or incorrect
evidence, historical-selection downgrade and orphan generated provenance.

The final focused command was:

```powershell
npx.cmd vitest run src\simulation\__tests__\governance.test.ts --testNamePattern='contextual leadership succession|contextual-profile successor|former leader, office|succession dates' --reporter=verbose
```

| Executed command / check | Actual result |
|---|---|
| Focused editing selection, first attempt | Exit 1: 39 passed, one failed, 157 skipped; 51.64 s. The test compared a resolved handoff with the original pending record; the assertion was corrected without changing runtime handoff |
| Focused final selection | Exit 0: 44/44, 157 skipped, 201 total; 39.80 s |
| `npx.cmd tsc -b --pretty false` | Exit 0 after correcting literal-array inference in a synthetic test fixture with `.map<number>` |
| `npm.cmd run governance:audit` | Exit 0: 201/201; 152.09 s |
| `npm.cmd run information:test` | Exit 0: 32/32; 24.46 s |
| `npm.cmd run information:audit` | Exit 0: unchanged coverage below |
| `npm.cmd run governance:benchmark` | Exit 0: 1/1; 9.14 s |
| `npm.cmd run verify -- -- --maxWorkers=1`, first attempt | Exit 1: 578 passed, one failed in 30 files; 416.36 s. The Information benchmark still expected the old generated selection marker |
| `npm.cmd run information:benchmark`, after targeted assertion correction | Exit 0: 1/1; 9.95 s. It now asserts contextual selection and evidence method, without changing its deadline or runtime |
| `npm.cmd run verify -- -- --maxWorkers=1`, final attempt | Exit 0: data reproducibility/audit, production build and 579/579 tests in 30 files; 413.82 s test-run duration |
| `git diff --check` | Exit 0 |
| Built-in `rg`, `Math\.random`, all four changed runtime files | No matches |
| `git diff --exit-code`, institutional evaluator/invariants, plurality, Politics, data/scripts, CI, README and accepted handoff | Exit 0 |

The final full verification needed a second run because it exposed that
directly coupled stale benchmark assertion. Original failures remain in session
artifacts. No assertion threshold, test deadline, benchmark budget or CI
configuration was relaxed.

Governance benchmark, 252 Countries/281 chambers/1,287 persons:
snapshot 0.033 ms; serialization 373.17 ms; initial save 27,268,062 bytes;
20 material analyses at mean 14.05 ms; synthetic material mean 13.795 ms;
synthetic institutional mean 0.381 ms. Resolved proposal remains
17,575 bytes, including 4,800 plurality bytes and 4,050 institutional bytes;
resolution save growth 18,214 bytes and full-world growth 19,456 bytes.
One contextual succession takes 4.081 ms across seven Country Regions,
with 2,488 evidence bytes and 5,466 incremental save bytes.

Information benchmark, 252 Countries/4,574 Regions/948 active party leaders:
new-game initialization 819 ms; isolated leader generation 601.03 ms;
current save 15,315,994 bytes; ordinary day 0.4486 ms; changed monthly day
98.41 ms; contextual succession 4.02 ms. The existing output field
`deterministicFallbackSuccessionMs` is retained for benchmark-output
compatibility; it now measures the contextual generated replacement path,
not historical bounded-v2 generation. The 2,048-entry multi-Country retained
briefing workload measures monthly reporting at 70.31 ms.
These are host/workload measurements, not universal thresholds or a
before/after speedup claim.

Source coverage is unchanged: 948 parties, 35 reviewed bridges, seven derived
leader mappings, zero sourced/observed mappings, one ambiguous mapping,
940 unavailable mappings and 941 modelled fallback initial leaders.
All seven accepted derived mappings have reviewed fictional analogue names.
There are 392 available executive records, 342 reconciled identities,
three reused party leaders and 339 standalone executive persons.
Procedural/ideological coverage remains 57 resolvable Countries, eight with
ideological evidence and zero overlap. IPU CC BY-NC-SA 4.0 and previously
unconfirmed V-Party, Party Facts bridge and primary-source licences still
block commercial release. New successors supply no new real-world dataset.

The actual runtime/test/documentation diffs were reviewed separately.
The scope is exactly 12 files: the pure module; Governance model/runtime;
Information invariants; Governance and Information benchmark tests;
Governance regressions; the genuine parent fixture; both persistent
instruction files; current Information documentation; and this record.
README wording did not require adjustment. Schema 13, subsystem versions,
historical votes/profiles, institutional-interest mathematics and v2 marker,
fiscal execution, Reality/Information access, notification and player-control
contracts are preserved. No migration, history rewrite, persistent factions,
individual MPs, real successor observations, 0.16, main merge or acceptance
claim is included.

Exact-SHA Ubuntu and Windows Node 22 CI results are reported from actual
Actions logs after commit/push, separately from local results. Work then
stops for independent audit; the accepted handoff remains untouched.
