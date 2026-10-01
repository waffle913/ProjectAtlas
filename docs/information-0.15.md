# Government information and playable interface (0.15 implementation)

**Status: implementation candidate; not independently reviewed or accepted.** The canonical handoff continues to identify 0.14 as the latest accepted milestone.

## Information architecture

The engine's canonical Reality remains authoritative. `SimulationState.information` is a delayed, provenance-labelled Government Information layer, not a second economy or a noisy copy of Reality. The current report is a monthly aggregate of the existing regional unemployed and labour-force stocks. Its date follows the socioeconomic monthly report date; a later Reality change does not leak into the stored report. Incomplete coverage stays partial, and absent labour-force coverage is `unavailable` with no numeric value.

Public parliamentary outcomes are represented as public briefing facts sourced from the existing proposal vote result. Internal labour reports and monitor briefings use government access. Public perception is not implemented as a separate new system in this milestone.

`Person -> office -> authority capability` controls access. Country control, party membership and party leadership alone grant no Government Information or fiscal authority. Public records remain inspectable without office. The UI consumes defensive inspection results and existing governance commands; it does not mutate canonical fiscal policy directly.

## Portfolios and briefings

Briefings are event/change-driven records in canonical `InformationState`, grouped by institutional portfolio (`finance`, `economy`, `interior_security`, `social_health`, `foreign_affairs`, `defense`). Portfolios are channels, not minister agents: no per-person cognition loop or duplicate material state is created, and records remain when leadership changes.

Current triggers are:

- a public adopted, rejected or unavailable parliamentary proposal result, recorded from its canonical vote;
- a monthly modelled unemployment report changing by at least 50 basis points from the previous available report;
- a crisis monitor entering `ACTIVE` on the current date, using its existing episode record.

Stable source-based IDs deduplicate events. Feed history is capped at 256 records; report records are retained while current or referenced by a retained briefing, including temporal policy follow-up baselines. Runtime retention and the information invariant share the same reference calculation. Proposal and crisis systems remain the authoritative histories. Current triggers are non-urgent and do not pause simulation. The model permits only an `urgent` briefing to request a pause; no current 0.15 trigger fabricates an urgent event.

The briefing separates an immutable fact from bounded interpretation. Labour comparisons describe temporal movement between modelled reports and explicitly disclaim isolated policy causation. Proposal explanations reuse existing 0.14 analysis only for an authorized office holder; opposition views remain limited to public vote facts. Crisis detail comes from recorded monitor drivers, not a new causal engine.

## Assistance and deeper explanation

Guided, Standard and Expert are presentation functions only. They do not enter `SimulationState`, scheduling or RNG. Guided may offer an existing proposal navigation action; Standard includes concise stored interpretation; Expert hides automatic interpretation. All modes retain explicit Tell Me More. The deeper path checks information access and limits itself to saved proposal analysis, retained modelled labour reports, or canonical crisis-monitor evidence; unsupported consequences are not invented.

The browser preference is saved in local storage, not in the canonical save. All current event classes are advisory or important; none is configured to automatically pause.

## Initial leaders and source coverage

Every registry party receives one deterministic fictional `PoliticalPerson` at new-game initialization. Synthetic names use the shared keyed RNG, stable party/date/event keys and sorted party iteration; source identity never determines a person's ideology or policy preferences. Two reviewed mappings retain distinct fictional analogue names only: Anthony Alburn for the Australian Labor Party and Friedrich Merzen for the German CDU. The other mapped source identities use the normal deterministic fictional naming path. All source identities remain provenance, never gameplay identities. Profile values reuse the validated fictional party position and mark fallback dimensions as modelled.

The reproducible pipeline enumerates every gameplay party, then matches only stable identifiers: the reviewed IPU-to-Party-Facts links already represented in the V-Party snapshot, exact Party Facts Wikidata QIDs, and Wikidata `P488` chairperson statements with `P580`/`P582` tenure dates. It does not fuzzy-match names. Among 948 parties, 35 have a reviewed Party Facts bridge; 21 have a unique dated chairperson mapping, 4 have multiple active chair identities and are explicitly ambiguous, 10 bridged records lack a qualifying unique dated claim, and 913 have no reviewed Party Facts bridge. Thus coverage is 948 enumerated parties, 21 derived source identities, 927 modelled fictional gameplay fallbacks, 923 unavailable source mappings and 4 ambiguous mappings. Five mapped leaders also reconcile to an exact executive officeholder record; office authority is derived separately from dated office and institutional evidence. No leader is counted as directly sourced or observed.

`partyfacts-wikidata-2026-10-01.json` pins the 35-row identifier bridge to Party Facts commit `61e04e83a4eff4e285bdb724cc11cc8bdf4beb16`; the crosswalk data licence remains `requires_confirmation` because the repository software licence does not establish a data licence. `wikidata-party-chairs-2026-10-01.json` pins 195 chairperson statements from the Wikidata Query Service, retrieved 2026-10-01. The extract is later than the scenario date; only statements with a start on or before 2026-01-01 and no end by that date are treated as dated historical evidence. Wikidata data is CC0 1.0; the Party Facts bridge still blocks commercial clearance. Ambiguous and absent evidence remains explicit in the coverage report; the pipeline does not manufacture leadership for the other parties.

IPU Parline (Inter-Parliamentary Union, `https://data.ipu.org/`, retrieved 2026-09-30, reference 2026-01-01, CC BY-NC-SA 4.0, attributed to IPU) supplies institutions, seats and source party IDs. V-Party v2 (V-Dem Institute, `https://v-dem.net/data/v-party-dataset/`, published 2022-02-01, retrieved 2026-09-30, observations from 2017-2019, attribution Lindberg et al. 2022, DOI `10.23696/vpartydsv2`) supplies historical party-position context only; its dataset licence remains `requires_confirmation` and is not inferred from the GPL-3.0 licence of its transport package. Existing official Australia and Germany leader sources and the pinned officeholder snapshot remain individually attributed in the source inventory; their licences remain `requires_confirmation`.

## Succession and player entry

Party leadership changes use an explicit succession record. A different active member of the same party and Country may be selected; absent such a person, a deterministic fictional successor is generated with bounded variation around the party's existing validated profile. The former person, any unrelated office and player control persist. If the controlled person was the outgoing leader, a persisted pending handoff offers Continue or Switch; resolving either choice changes control at most once.

The start overlay selects Country, party and its active fictional leader. It displays party bloc/office metadata and does not create an office. Opposition leaders may be selected and receive only public access; executive capabilities exist only where an actual office record grants them.
Countries without registered gameplay-party coverage are marked unavailable in the selector rather than receiving invented party identities.

## Persistence, invariants and validation

Save schema 13 adds information state, leader provenance, leadership succession and a stable sequence. Schema-12 migration preserves date, tick, seed, fiscal and governance state, initializes information empty on the saved date, and deterministically fills missing party leaders without fabricating past briefings. The information invariant checks dates, references, provenance/status, unavailable values, access classification, source links, bounded history, leader uniqueness and succession/player-control consistency. Existing governance invariants remain enabled.

`npm run information:test` runs focused report/access/briefing/assistance/migration tests. `npm run information:audit` verifies the source-coverage report. `npm run information:benchmark` measures initialization, leader creation, save-size delta, ordinary/monthly scheduler days, and fallback succession. The broader audit/build/test and world/politics/governance benchmarks are recorded in [the candidate validation evidence](milestone-0.15-candidate-validation.md) after execution.

## Limitations

- No leader mapping is counted as directly sourced/observed. All 948 gameplay characters remain fictional; source data is provenance only.
- Five exact officeholder matches receive their corresponding source-reconciled offices. A party's government bloc alone never grants an office or executive powers.
- Unemployment is the sole current Government Information report. Public perception, confidential diplomacy/defense intelligence, cabinet faction politics and autonomous ministers are out of scope.
- Fiscal UI exposes the existing corporate-tax and annual infrastructure-budget proposal paths through governance commands; unsupported instruments are not presented as working controls.
- The current model has no supported urgent briefing source, so automatic urgent pause is not exercised.
- Measurement timings and the save comparison are workload-specific and are not performance thresholds or universal device guarantees.
