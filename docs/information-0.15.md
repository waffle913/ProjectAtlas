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
- a monthly modelled unemployment report changing by at least 100 basis points from the previous available report;
- a crisis monitor entering `ACTIVE` on the current date, using its existing episode record.

Stable source-based IDs deduplicate events. Feed history is capped at 256 records; report records are retained only while they are current or referenced by a retained labour briefing. Proposal and crisis systems remain the authoritative histories. Current triggers are non-urgent and do not pause simulation. The model permits only an `urgent` briefing to request a pause; no current 0.15 trigger fabricates an urgent event.

The briefing separates an immutable fact from bounded interpretation. Labour comparisons describe temporal movement between modelled reports and explicitly disclaim isolated policy causation. Proposal explanations reuse existing 0.14 analysis only for an authorized office holder; opposition views remain limited to public vote facts. Crisis detail comes from recorded monitor drivers, not a new causal engine.

## Assistance and deeper explanation

Guided, Standard and Expert are presentation functions only. They do not enter `SimulationState`, scheduling or RNG. Guided may offer an existing proposal navigation action; Standard includes concise stored interpretation; Expert hides automatic interpretation. All modes retain explicit Tell Me More. The deeper path checks information access and limits itself to saved proposal analysis, retained modelled labour reports, or canonical crisis-monitor evidence; unsupported consequences are not invented.

The browser preference is saved in local storage, not in the canonical save. All current event classes are advisory or important; none is configured to automatically pause.

## Initial leaders and source coverage

Every registry party receives one deterministic fictional `PoliticalPerson` at new-game initialization. The synthetic name is selected using the shared keyed RNG, stable party/date/event keys and sorted party iteration; it is not used to derive political positions. The gameplay person is distinct from a real-world identity. Profile values reuse the validated party position and mark fallback dimensions as modelled.

`src/data/source-snapshots/party-leadership-2026-01-01.json` records the reviewed source inventory and an intentionally empty mapping set. The pinned institutional/seat extract does not identify party leaders; the historical V-Party positions do not identify individual leaders and its licence remains `requires_confirmation`; unlinked public officeholder observations do not establish party leadership. The reproducible `npm run information:audit` report hashes the registry and reviewed snapshots and enumerates each party. Current coverage is 948 gameplay parties/leaders, 0 sourced or observed leader mappings, 0 derived mappings, 948 modelled fallback gameplay leaders, 948 unavailable source mappings and 0 ambiguous mappings. This is not a claim of real-leader coverage.

Reviewed-source traceability: IPU Parline (Inter-Parliamentary Union, `https://data.ipu.org/`, retrieved 2026-09-30, reference 2026-01-01, CC BY-NC-SA 4.0, attributed to IPU) supplies institutions and seats only. V-Party v2 (V-Dem Institute, `https://v-dem.net/data/v-party-dataset/`, published 2022-02-01, retrieved 2026-09-30, observations from 2017-2019, attribution Lindberg et al. 2022, DOI `10.23696/vpartydsv2`) supplies historical party-position context only; its dataset licence is `requires_confirmation` and is not inferred from the GPL-3.0 licence of its transport package. Wikidata Query Service (`https://query.wikidata.org/`, retrieved 2026-09-26, reference 2026-01-01) contains officeholder observations but no reviewed party crosswalk; the checked-in snapshot has no dataset licence metadata, so licence is recorded as `requires_confirmation`. None of these snapshots establishes an admissible source-party leadership mapping.

## Succession and player entry

Party leadership changes use an explicit succession record. A different active member of the same party and Country may be selected; absent such a person, a deterministic fictional successor is generated with bounded variation around the party's existing validated profile. The former person, any unrelated office and player control persist. If the controlled person was the outgoing leader, a persisted pending handoff offers Continue or Switch; resolving either choice changes control at most once.

The start overlay selects Country, party and its active fictional leader. It displays party bloc/office metadata and does not create an office. Opposition leaders may be selected and receive only public access; executive capabilities exist only where an actual office record grants them.
Countries without registered gameplay-party coverage are marked unavailable in the selector rather than receiving invented party identities.

## Persistence, invariants and validation

Save schema 13 adds information state, leader provenance, leadership succession and a stable sequence. Schema-12 migration preserves date, tick, seed, fiscal and governance state, initializes information empty on the saved date, and deterministically fills missing party leaders without fabricating past briefings. The information invariant checks dates, references, provenance/status, unavailable values, access classification, source links, bounded history, leader uniqueness and succession/player-control consistency. Existing governance invariants remain enabled.

`npm run information:test` runs focused report/access/briefing/assistance/migration tests. `npm run information:audit` verifies the source-coverage report. `npm run information:benchmark` measures initialization, leader creation, save-size delta, ordinary/monthly scheduler days, and fallback succession. The broader audit/build/test and world/politics/governance benchmarks are recorded in [the candidate validation evidence](milestone-0.15-candidate-validation.md) after execution.

## Limitations

- No pinned, licensing-cleared party-leader mapping applicable to 2026-01-01 is currently present; all gameplay leaders are fictional fallbacks.
- No named executive officeholder is inferred from a party's government bloc. A start as a leader without an office has no executive powers.
- Unemployment is the sole current Government Information report. Public perception, confidential diplomacy/defense intelligence, cabinet faction politics and autonomous ministers are out of scope.
- Fiscal UI exposes the existing corporate-tax proposal path only; unsupported instruments are not presented as working controls.
- The current model has no supported urgent briefing source, so automatic urgent pause is not exercised.
- Measurement timings and the save comparison are workload-specific and are not performance thresholds or universal device guarantees.
