# Government information and playable interface (0.15 implementation)

**Status: 0.15 is accepted/validated following the user's independent-review decision.** The user's explicit 0.17 advancement identifies corrected 0.16 as the validated parent; 0.17 is pending independent review, not accepted. Historical candidate validation records retain their original chronology.

## Information architecture

The [0.16 military channel](military-0.16.md) extends this unchanged information version in schema 14. Monthly government-only military reports are explicit saved projections with validated source/date/licence/fingerprint and material readiness evidence. Ministers/UI never read live capability. Defense advisories reference retained reports, cannot impersonate crisis/urgent/public facts and do not pause. One rounded UK source is a partial historical reference, never a current operational stock. The six accepted 0.15 integrity rules below remain in force; acceptance follows the later user-directed advancement, not this documentation.

The authorized [0.17 trade channel](trade-0.17.md) retains `information-0.15-v3` in global schema 15. Priority 260 saves partial/unavailable government administrative reports, relevant flows/categories/partners, reconstructed dependencies and dated source/capacity/invoice proofs. Inspectors mark them stale and never reread live Reality. Historical priors are admitted only when every dated normalization input is available; actual publisher dates are not replaced by retrieval dates. Trade briefings are government-only economy advisories without pause. All existing retention paths preserve current/referenced trade reports alongside unchanged labour/military evidence and the six accepted integrity rules. No crisis Reality is promoted to a government sensor.

The engine's canonical Reality remains authoritative. `SimulationState.information` is a delayed, provenance-labelled Government Information layer, not a second economy or a noisy copy of Reality. The current report is a monthly aggregate of the existing regional unemployed and labour-force stocks. Its date follows the socioeconomic monthly report date; a later Reality change does not leak into the stored report. Incomplete coverage stays partial, and absent labour-force coverage is `unavailable` with no numeric value.

Public parliamentary outcomes are represented as public briefing facts sourced from the existing proposal vote result. Internal labour reports use government access. Canonical crisis episodes are not government sensors: no crisis activation, severity or driver briefing is emitted without a government-visible report channel, which 0.15 does not currently model. Public perception is not implemented as a separate new system in this milestone.

`Person -> office -> authority capability` controls access. Country control, party membership and party leadership alone grant no Government Information or fiscal authority. Public records remain inspectable without office. The UI consumes defensive inspection results and existing governance commands; it does not mutate canonical fiscal policy directly.

### Proposal reactions and exact content

Government proposal estimates do not call `analyzeProposal`, `estimatePublicSupport` or `estimateParliamentarySupport`. Those APIs read canonical political/material Reality and remain available to engine/debug inspection and canonical vote resolution only. Canonical parliamentary resolution now uses the versioned plurality model below; that does not unlock government-visible predictions. No polling, party-response report or government-visible proposal counterfactual channel currently exists. Therefore public reactions are entirely `UNKNOWN` (not neutral), chamber reactions are unavailable (not abstention), confidence is zero, and no material consequences are forecast. Published static chamber sizes can identify how many seats have unknown responses, not how they will vote. A fresh unemployment report is not evidence about a proposal reaction.

Each persisted estimate records the analyzed effective date/payload and their deterministic governance fingerprint. IDs include this fingerprint and request date, allowing changed draft content to be re-estimated on the same day. Inspectors mark a content mismatch as `stale`; the normal UI and deeper explanation filter such records out of current estimates. Older fingerprinted estimates remain bounded historical evidence. The fiscal screen selects the controlled person's unresolved canonical proposal in the Country, defaulting deterministically to the latest proposal in canonical order when local selection is absent or invalid; it can resume drafts and submitted proposals after navigation or reload without generating duplicates.

Saved estimate chambers must match the pinned Country/institution chamber IDs,
names and known seat totals exactly, with no duplicate, missing or extra
chambers. This validates static structure, never Reality-derived predictions.
The requester must exist by the request date, which must lie between
Information initialization and the saved date; absent office-history modelling
does not authorize reconstruction of past tenure.
`unsupportedChanges` covers exactly the keys present in the saved analyzed
payload, once each, with `unavailable` coverage. There is no partial reaction
channel; duplicate, extra, missing or substituted keys are invalid. Entry
order does not change this key-set contract.

Fiscal sponsorship and confidential information access are independent
capabilities. The screen remains available without information access:
actions require their existing legislative/fiscal/budget capabilities and
confidential estimates require `access_government_information`. Own unresolved
proposals can be withdrawn with the existing controlled-person command,
including after an effective date has expired. Expired drafts cannot be
submitted retroactively; withdrawal permits a newly dated draft without
silently editing the old date. No capability or enactment path is added.

## Portfolios and briefings

Briefings are event/change-driven records in canonical `InformationState`, grouped by institutional portfolio (`finance`, `economy`, `interior_security`, `social_health`, `foreign_affairs`, `defense`). Portfolios are channels, not minister agents: no per-person cognition loop or duplicate material state is created, and records remain when leadership changes.

Current triggers are:

- a public adopted, rejected or unavailable parliamentary proposal result, recorded from its canonical vote;
- a monthly modelled unemployment report changing by at least 50 basis points from the previous available report.
- military administrative advisories and monthly admitted trade reports, each tied to its own saved government evidence.

Stable source-based IDs deduplicate events. Feed history has a hard global limit of **2,048** and a per-Country limit of **256**. Retention first protects the four most recent available briefings per Country, then prefers up to 256 recent entries for the canonical controlled person's Country, then fills remaining slots with the newest remaining entries. With no controlled person there is no player preference. Recency is the persisted `createdOn` date, with opaque briefing IDs compared lexicographically as deterministic ties; the saved array is chronological. Selection is independent of UI Country selection and RNG. The protected floor fits the current 252-Country registry; an incompatible future minimum or duplicate input IDs fail explicitly rather than silently violating the hard bound.

Preference applies when canonical retention runs; switching control cannot restore already expired history. Monthly reporting batches new briefings and performs retention/reference cleanup once after collecting the reports, preserving the scheduler's existing causal order. Report records remain while current or referenced by a retained briefing, including temporal policy baselines. If a policy anchor expires under either cap, its dependent structured comparisons and their generated headline clauses are removed, and otherwise-unused baselines are released. Runtime retention and the information invariant share the same reference calculation. Proposal and crisis systems remain the authoritative Reality histories. Current triggers are non-urgent and do not pause simulation. `pauseRequested` is a reserved model field: no current source legitimately emits an urgent event, and no end-to-end automatic urgent-pause behavior is exercised or claimed implemented.

The briefing separates an immutable fact from bounded interpretation. Labour comparisons describe temporal movement between modelled reports and explicitly disclaim isolated policy causation. Proposal explanations use only retained Government Information estimates for an authorized office holder; opposition views remain limited to public vote facts. Neither path reads saved canonical proposal analysis or crisis-monitor drivers.

Save invariants share the runtime briefing-ID constructor. A labour briefing
must match its referenced report's Country, value, date and coverage-derived
evidence status. Numeric monthly reports are always modelled, with complete or
partial coverage; absent values are unavailable with unavailable coverage,
never sourced/observed/derived or zero-filled. Every report, including
unavailable reports, retains a nonblank limitation. A saved previous value is
required for every labour briefing: both values must be bounded numeric bps
and differ by at least 50 bps, in either direction. Where the immediately
preceding monthly report is retained and no intervening retained report exists,
it must equal that comparison basis. **Historical-proof limitation:** the
existing record does not persist a previous-report ID and retention may remove
that report. Missing or irregular comparison evidence is not reconstructed from
Reality, assumed to be the nearest retained report, or invented during reload.
Such valid older histories keep their saved bounded comparison; complete
historical proof would require a separately authorized persisted-evidence change.
No new field, version or migration is introduced here.

All Information-owned persisted dates must be valid and no earlier than
`information.initializedOn`: report/briefing/request dates, analyzed effective
dates, fact/anchor effective dates, baseline dates and temporal comparison
dates. Future legal effective dates remain allowed where already supported.
Historical statutory source/reference dates inside the copied proposal
payload remain original source metadata, not new Information event dates.
No reload redates records or reconstructs pre-initialization reports.

Parliamentary briefing facts reconcile their complete chamber projection,
Country, outcome, vote date and coverage-derived evidence with the saved vote.
Only adopted results carry an effective date or policy follow-up anchor;
rejected/unavailable outcomes cannot fabricate one. Historical resolved
votes are not recalculated, and results still do not pause the game.
Supported event metadata is fixed to the runtime contract: labour uses
`economy`, proposal results use `finance`; both are `advisory` with
`pauseRequested=false`. Reserved urgent/crisis event channels are not
supported persisted events in 0.15. Follow-up attribution is only
`temporal_only` or `unavailable`; `supported_counterfactual` remains reserved
in the type for future work but is rejected by the 0.15 invariant.

## Assistance and deeper explanation

Guided, Standard and Expert are presentation functions only. They do not enter `SimulationState`, scheduling or RNG. Guided may offer an existing proposal navigation action; Standard includes concise stored interpretation; Expert hides automatic interpretation. All modes retain explicit Tell Me More. The deeper path checks information access and limits itself to fingerprint-matching Government Information estimates, public vote facts or retained modelled labour reports; unsupported consequences are not invented.

The browser preference is saved in local storage, not in the canonical save. All currently supported event classes are advisory; none can claim urgency or request an automatic pause.

## Initial leaders and source coverage

Every registry party receives one deterministic fictional `PoliticalPerson` at new-game initialization. Synthetic names use the shared keyed RNG, stable party/date/event keys and sorted party iteration; source identity never determines a person's ideology or policy preferences. Every retained source-derived initial party-leader mapping uses a checked-in, hand-reviewed fictional analogue name; for party leaders, the generic syllable generator is reserved for modelled fallbacks and endogenous successors. Separate executive persons without a known party relation also use deterministic fictional names, not purported party-leader analogues. All source identities remain provenance, never gameplay identities. Party-leader profile values reuse the validated fictional party position and mark fallback dimensions as modelled.

The reproducible pipeline enumerates all 948 gameplay parties, then joins only reviewed IPU-to-Party-Facts identifiers and exact Party Facts Wikidata QIDs. Wikidata `P488` means chairperson/presiding member; it is not silently treated as the constitutional or electoral party leader in every system. A `P488` mapping is accepted only when explicit `P580` and `P582` qualifiers bound an interval containing 2026-01-01. Missing `P582` is not evidence of continued tenure: the pinned extract is later than the scenario date and can be incomplete or stale. A dated authoritative primary source may support the exact role near the scenario date; conflicting positive identities remain ambiguous. Mapping records preserve the source role separately from the intentionally fictional gameplay `party_head` role.

The complete 948-party audit reports 35 reviewed Party Facts bridges, 7 derived leader mappings, 1 ambiguous mapping and 940 unavailable source mappings (913 parties lack a reviewed bridge; 27 bridged parties lack unique positive leadership evidence). There are 941 modelled fallback party leaders and zero directly sourced/observed gameplay leadership identities.

The seven retained source mappings and reviewed gameplay analogues are: Yves-François Blanchet → Yves-François Blancheval (Bloc Québécois, party leader); Don Davies → Don Davison (NDP, chairperson); Pierre Poilievre → Pierre Poilapin (Conservative Party of Canada, party leader); Anthony Albanese → Anthony Alburn (Australian Labor Party, party leader); Friedrich Merz → Friedrich Merzen (CDU, chairperson); Joe Gruters → Joe Grutter (Republican Party, chairperson); and Keir Starmer → Keir Starmont (Labour Party, chairperson). Each source-derived mapping has exactly one reviewed fictional name, distinct from the source name; those names are unique among initial leaders. Canadian analogue names are especially covered by the governance regression and start-flow tests.

The previous 21 mappings were fully re-audited against positive date applicability. Fourteen were removed: Mark Carney (Liberal Party), Elizabeth May (Green Party), Larissa Waters (Australian Greens), Ciro Nogueira Lima Filho (Progressive Party), Aécio Neves (PSDB), Yoshihiko Noda (Constitutional Democratic Party of Japan), Tomoko Tamura (Japanese Communist Party), Sanae Takaichi (LDP), Olivier Faure (Socialist Party), Jordan Bardella (National Rally), Markus Söder (CSU), Ken Martin (Democratic Party), Kemi Badenoch (Conservative Party), and John Swinney (Scottish National Party). The Republican Party mapping changed from Michael Whatley to Joe Gruters based on the dated RNC chair announcement. The other six previous mappings remain only where explicit tenure intervals or reviewed primary evidence positively support the scenario date. These are derived analogues, not directly sourced/observed gameplay identities.

`partyfacts-wikidata-2026-10-01.json` pins the 35-row identifier bridge to Party Facts commit `61e04e83a4eff4e285bdb724cc11cc8bdf4beb16`; the crosswalk data licence remains `requires_confirmation` because the repository software licence does not establish a data licence. `wikidata-party-chairs-2026-10-01.json` pins 195 chairperson statements from the Wikidata Query Service, retrieved 2026-10-01. The extract is later than the scenario date; a P488 claim is positive only with both date qualifiers explicitly bounding 2026-01-01. Wikidata data is CC0 1.0. The Party Facts bridge, V-Party dataset, and official primary publications have licence terms that remain `requires_confirmation`, so commercial redistribution is not cleared. Ambiguous and absent evidence remains explicit in the coverage report; the pipeline does not manufacture leadership for the other parties.

IPU Parline (Inter-Parliamentary Union, `https://data.ipu.org/`, retrieved 2026-09-30, reference 2026-01-01, CC BY-NC-SA 4.0, attributed to IPU) supplies institutions, seats and source party IDs. V-Party v2 (V-Dem Institute, `https://v-dem.net/data/v-party-dataset/`, published 2022-02-01, retrieved 2026-09-30, observations from 2017-2019, attribution Lindberg et al. 2022, DOI `10.23696/vpartydsv2`) supplies historical party-position context only; its dataset licence remains `requires_confirmation` and is not inferred from the GPL-3.0 licence of its transport package. Existing official Australia and Germany leader sources and the pinned officeholder snapshot remain individually attributed in the source inventory; their licences remain `requires_confirmation`.

## Executive offices independent of party leadership

The pinned `political-offices.json` contains 392 available officeholder records applicable on 2026-01-01, representing 342 distinct Country/source-person identities. New games materialize all these identities independently of the party-leadership bridge: three attach to existing reviewed party leaders, and 339 receive separate deterministic fictional political persons without invented party membership or ideology. This produces 1,287 initial persons including the 948 party leaders. Source identities stay in provenance/debug metadata. An unknown tenure start remains absent (21 available records), never fabricated; initialization uses the record's explicit reference date and rejects a known start after it.

An exact source-person/Country match is required to reuse a party leader, and government-bloc status never grants an office. Each person has the existing single primary office, with all reconciled source office IDs retained as evidence where the source lists multiple offices. Sourced executive-system evidence resolves the generic modelled capabilities for 121 persons; 221 remain `institutional_authority_unresolved` with zero inferred capabilities. This is not a claim that their real offices have no legal powers. Standalone officeholders are not silently made playable party leaders or given a party relation merely to provide executive access in the start selector.

New-game initialization explicitly reconciles office identity, Country/role, dates, source record IDs, source-person naming and the modelled authority basis against the installed snapshot and institutional evidence. Ordinary runtime/save/reload validation instead checks the evidence actually saved: nonempty unique source identifiers, Wikidata person identity, Country/person/office consistency, reference/effective dates, role/authority-basis compatibility and the existing capability set. A reference may precede or follow the appointment, but cannot postdate the saved state; an explicit effective start cannot postdate the reference. A person's saved party-leader and executive source identities must agree when both are present. No historical office record is looked up again in `political-offices.json`, and current institutional classification cannot overwrite its recorded authority basis. Existing office evidence contains the necessary fields; the governance model and person shape remain unchanged, so no governance migration or historical-person reconstruction is needed. Source admissibility still belongs to initialization, pinned-data audits and explicitly authorized migrations, not silent reload repair.

The public Country panel has no canonical-person mapping dependency. It therefore
shows the public office title and source-record availability, not the raw real
officeholder name. Original person names and source evidence remain intact in
data/provenance/debug metadata.

## Succession and player entry

Party leadership changes use an explicit succession record. A different active member of the same party and Country may be supplied explicitly; absent an explicit person, a fictional successor is derived deterministically from the fictional party platform, a modelled common internal tendency prior, current modelled supporter preferences and available sourced legislative representation/current modelled party support. The former person, any unrelated office and player control persist. If the controlled person was the outgoing leader, a persisted pending handoff offers Continue or Switch; resolving either choice changes control at most once.

V1 membership changes cannot move any person referenced by succession history
to another party or remove their membership; same-party no-ops and unrelated
persons retain existing behavior. Pending handoffs have no decision date and
keep control on the outgoing person: control changes and another succession
for that party must wait for explicit resolution. Resolved Continue/Switch
records require a valid decision date within event..save date, but do not
constrain later control. Sequential switches and former-member returns remain
valid. Each party's first recorded predecessor must have one of the existing
reviewed-initial or reconciled `party_platform_initial_v2` provenance paths,
matching its source-party reference; subsequent records must form a continuous
chain. Historical schema-12 reconciliation is preserved.

Persisted provenance methods use the six declared model methods, with valid
nonfuture reference dates. Existing profiles must contain exactly the six
`POLITICAL_ISSUES`, with valid bounded values/confidence and derived/modelled
status; old profile values are validated, not reinterpreted.

### Context-derived generated successors

`leadershipSuccession.ts` is pure and on-demand. It scans only the affected
Country's political Region/cohort list, in sorted order, once. Supporter means
use exact BigInt population times party-support weights. They are modelled
cohort preferences, not polling observations, party-membership surveys or
observed faction shares. With no represented supporters, each issue remains
unavailable without a numeric value.

Current national support comes from the existing `politics.nationalSupportBps`
vector in pinned Country party order. Legislative share is the equal-chamber
mean of party seat shares in complete sourced allocations. An absent party
in such an allocation has an evidenced zero; an unavailable allocation does
not. Missing either side leaves the representation gap absent, not zero.
These snapshots are engine evidence and do not unlock Government Information
or minister/UI access to Reality.

The five ephemeral tendencies retain the common modelled prior:

| Tendency | Stance bps | Baseline weight bps | Weight factor before clamping |
|---|---:|---:|---|
| radical | 10000 | 1000 | `10000 + M - round(A / 2)` |
| firm | 5000 | 2000 | `10000 + round_signed(M / 2) - round(A / 4)` |
| mainstream | 0 | 4000 | `10000 + S + round(A / 4)` |
| pragmatic | -5000 | 2000 | `10000 - round_signed(M / 2) + round(A / 2)` |
| moderate | -10000 | 1000 | `10000 - M + A` |

`M` is the intensity-weighted signed supporter displacement away from the
party's neutral point: sum of
`intensity * (mandate - platform) * sign(platform - 5000)`,
divided by the summed weights and clamped to -5000..5000. Only modelled
available mandates, non-neutral party positions and positive intensities
enter this signal. Zero intensity contributes neither signal nor weight.
No usable positive-intensity directional mandate means a neutral common-prior
signal (`M = 0`), not a fabricated saved observation; available representation
context still applies.

For an available gap `G = seatShare - currentSupport`,
`A = clamp(2 * max(0, G), 0, 5000)` and
`S = clamp(2 * max(0, -G), 0, 3000)`. With no comparable gap, both derived
pressures are zero: no evidence-based adjustment is applied. Factors clamp
to 2500..20000. Raw weights are rounded `baseline * factor / 10000`;
the existing exact largest-remainder allocator normalizes them to exactly
10000 in the fixed tendency-table order. Signed mandate fractions use
`scaledRatioSigned(M, 1, 2)`, with exact half-away-from-zero rounding rather
than asymmetric `Math.round` on negative halves. Non-negative adaptation
and stability fractions use the exact `ratio(value, 1, denominator)` helper,
preserving their existing half-up semantics.

The one-time draw uses the shared keyed RNG with system
`party-leadership.internal-balance`, party ID, effective date and
`${successionId}:tendency`; it adds no mutable RNG, daily work or scheduler.
This selects a tendency for one fictional person, not persistent factions
or per-MP positions, and does not replace parliamentary plurality.

For each issue, the tendency anchor is the party position plus
`sign(platform - 5000) * round_signed(stance * 1400 / 10000)`,
bounded to 0..10000. Neutral positions stay neutral in this transform;
negative stances approach neutral without crossing it. Where mandate
evidence exists, blend from that anchor toward the mandate with
`B = clamp(2000 + round(A / 2) - round(S / 4), 1000, 4500)`.
With no mandate anywhere, `B = 0`; an unavailable individual issue is
never blended. Final values clamp to the intersection of 0..10000 and
platform +/-2500. Confidence is `min(partyConfidence, 7000)` and every
dimension is modelled. Actual mandate evidence may move a profile across
neutral; the tendency transform alone cannot do so.

New generated records use selection `modelled_internal_balance`, context
method `internal_party_balance_succession_v1` and provenance method
`internal_party_balance_succession_v3`. Source successor identity is absent,
source-leader status unavailable and provenance date is the replacement date.
The saved context contains coverage/value/source/limitation for support,
seat share and exactly the six issues, the selected tendency and a profile
fingerprint. Information invariants recompute weights, keyed selection and
the exact profile from that saved context plus the static party; they do not
re-fetch current opinion to reinterpret a past succession. New v3 generated
provenance must retain a matching contextual succession; relabelling it as
a historical fallback or deleting its selection proof cannot bypass validation.

Explicit existing members bypass this selection and receive no modelled
selection evidence. Existing profiles/provenance are preserved; the older
compatibility fill for missing metadata remains unchanged. Historical
`modelled_fallback` / `bounded_party_platform_succession_v2` records retain
their original profiles without new context. A genuine compact fixture
was generated and round-trip validated by reviewed parent
`323d702a49ed15eef388841d12b3f54a8acbd466` before runtime editing.
Schema 13 and existing subsystem versions remain unchanged, with no
migration or history backfill. The fingerprint checks internal consistency,
not independent empirical truth or cryptographic authentication.

The start overlay keeps Country first and offers two routes: Country -> Party -> active fictional party leader, or Country -> current fictional executive officeholder. The latter uses active canonical persons with source-reconciled head-of-government/head-of-state offices, independently of party membership. Countries with executive evidence remain selectable even without party coverage. A person holding both roles keeps the same ID in either route, with no duplicate candidate within a list.

Both routes ultimately invoke the existing `setControlledPerson`; they neither create an office nor change membership, leadership or capabilities. The UI displays fictional names, office titles, modelled capabilities and their limitations, including explicit no-office, unresolved-authority and unavailable-membership messages. Source real names remain provenance/debug metadata. Opposition leaders remain selectable without receiving executive access; unresolved executive officeholders remain selectable without inferred powers. Countries lacking both eligible party leaders and reconciled executives remain unavailable rather than receiving invented people or parties.

## Internal party plurality (accepted 0.15)

New parliamentary evaluations use `continuous_issue_distribution_v1`, with
`internal_party_distribution_v1` procedure and
`situational-plurality-0.15-v2` resolved records. The existing causal evaluator
still supplies the material central agreement,
confidence and decision. Central `vote` is not multiplied by every party seat.

Every distinct evaluable goal is varied independently while all other goals
stay at their central preference. Five ephemeral quadrature points represent
radical, firm, mainstream, pragmatic and moderate positions with weights
1,000/2,000/4,000/2,000/1,000 bps. Preference half-spread is 1,800 bps and
tolerance half-spread 1,600 bps. Radical preferences move away from neutral;
moderation approaches neutral without crossing it; neutral ideals stay
neutral. Importance and confidence are unchanged: uncertainty never creates
heterogeneity. These are evaluation points, not saved factions or MPs.

Per-goal agreement-delta means and variances are summed independently. A
triangular aggregate integrates the unchanged YES >= 6,000 and NO <= 4,000
thresholds; half-width is integer sqrt(6 * variance), capped at 4,000 bps.
The shape is explicitly `modelled_common_prior`, not observed party faction
shares. A party can split differently by proposal, or remain unanimous.
Missing profiles, unavailable evaluations or confidence below 3,000 produce
100% UNKNOWN, not ABSTAIN. Known shares sum to 10,000 with zero UNKNOWN.

An exact BigInt largest-remainder specialization assigns new party seats.
Equal remainders use a stable hash of proposal, chamber, party and vote-bucket
identities, without systematic YES/NO priority. New estimates/results carry
`seatApportionment: identity_hash_v1`. Unmarked previously saved candidate
results retain their original YES/NO/ABSTAIN/UNKNOWN tie order; the generic
allocator's historical contract is unchanged. Chamber totals sum those allocations. Independent/other
and residual seats remain unavailable. Adoption still requires complete
coverage and YES > NO in every required chamber. Public-support estimation,
Government Information access, fiscal enqueueing, authority and scheduling
are unchanged. There is no new RNG, scheduler task or persistent party state.

Global schema 13 and governance v1 stay unchanged. Distribution fields are
optional/versioned proposal-result metadata, not a new canonical subsystem.
The governance invariant validates their method, provenance, shares, exact
allocations, chamber totals and compatible version/procedure.
Plurality resolution also requires exact equality between the saved
parliamentary estimate and the parliamentary part of the recorded result,
excluding only outcome, resolution date and reason. Historical
`legacy-0.14-v1` and `situational-0.14-v2` results retain the old validation
path and reject new distribution fields. Ordinary reload never recomputes
historical votes. Historical `plurality-0.15-v1` retains its original
validation path without institutional evidence. Genuine parent-generated
situational-v2 and plurality-v1 fixtures and the existing aggregate schema-12
fixtures cover this boundary. Only an unresolved
proposal's future resolution uses the new algorithm after reload.

Production evidence still has no overlap between the 57 Countries with
complete procedural coverage and the eight with ideological evidence.
Plurality does not invent confidence or sourced party profiles to clear this
gap; explicitly synthetic known-profile tests/benchmarks demonstrate splits.
Context-derived successor generation uses the separate on-demand mechanism
above, without making this parliamentary distribution a persistent faction
state.

## Situational institutional interest (accepted 0.15)

Party evaluation supports situational institutional self-interest when
proposal analysis contains explicit legal power transfers. The effect is
derived from current executive/chamber leverage and power balance, never
from a flat government/opposition modifier. Current fiscal-only proposals
contain no institutional transfer and therefore receive a zero/not-applicable
adjustment. Coalition leverage remains a documented V1 modelled proxy.

`institutionalInterest.ts` is pure and on-demand. A transfer names a legal
lever, source and destination holders, source/explanation, confidence and
coverage. Holders are `none`, `executive` or a Country-owned chamber.
Effect IDs and semantic transfer identities must both be unique within an
analysis. The exact semantic key is `${lever}|${from}|${to}`; a different
ID, source or explanation does not create a distinct causal transfer.
Duplicate keys are rejected as malformed evidence, never silently
deduplicated or averaged as extra weight. Different levers, source holders
or destination holders remain distinct. V1 has no effect-weight field;
weighted or repeated same-type clauses require an explicit future model/version
change.

Chamber stake is the party's complete sourced seat share; absence in a
complete reconciled allocation is a known zero, whereas unsourced seats
remain unavailable. A sole reconciled governing party has full executive
stake; an outside party has structural zero, never an opposition penalty.
For a coalition, executive stake is the equal-chamber average of the party's
seat share within the governing bloc, using sourced allocations only.
An absent governing bloc, unavailable governing-bloc coverage or unusable
coalition seat evidence stays unavailable, never a fabricated 50/50 split.
A nonempty governing-party list does not establish executive leverage without
usable bloc evidence. Any ambiguous governing-bloc derivation makes executive
leverage unavailable, without a numeric stake, for every party: sole listed,
outside or coalition member. Unresolved membership may alter the estimated
stake or even the direction of institutional self-interest; it is not a
numeric central estimate at reduced confidence. Structural government status
may remain diagnostic only. Unambiguous partial evidence retains its existing
calculable behavior. Current governing blocs are the pinned 0.13 derivations,
not a newly mutable political system.

For each known transfer, raw interest is destination stake minus source stake.
Confidence is the minimum of transfer confidence and the coverage cap
(10,000 complete, 7,000 partial). Effective interest is raw interest times
confidence / 10,000 with signed integer rounding. The agreement adjustment
is 6,000 / 10,000 times the mean effective interest when every transfer is
complete or partial.
The mainstream result clamps material agreement plus that adjustment to
0..10,000; final confidence and coverage cannot exceed their material and
institutional evidence. Any explicitly unavailable effect makes the entire
institutional evaluation unavailable, with zero confidence and adjustment.
All evaluated effects remain diagnostic/provenance evidence; the material
agreement is retained for debug, but the vote and every party seat are UNKNOWN,
never ABSTAIN. A known effect cannot be used by ignoring an unavailable,
potentially opposing transfer. Complete/partial mixtures remain calculable with
their existing confidence caps and partial coverage. No effects at all produce
`not_applicable`, exactly zero adjustment and an unchanged material result.
The scale is a modelled V1 behavioral prior, not an empirically observed party
coefficient.

Material quadrature samples receive the same institutional adjustment before
subtracting the adjusted center, so sampling cannot cancel the central
shift. A nonzero known adjustment additionally contributes an independent
strategic-pragmatism dimension at 50/75/100/125/150% sensitivity under the
existing 1,000/2,000/4,000/2,000/1,000 weights (mean exactly 100%).
The central evaluation remains the mainstream result even if clamping shifts
the distribution's aggregate mean. Zero-transfer fiscal distributions match
the captured reviewed-parent results exactly. Public/cohort opinion remains
strictly material-only, and none of this engine/debug evidence unlocks
Government Information predictions.

New `situational-plurality-0.15-v2` records require explicit effect arrays and
per-party institutional evidence. The existing governance invariant validates
holders, levers, unique IDs and semantic transfer keys, ranges and provenance,
then reuses the pure
evaluator with the saved material baseline and pinned registry and compares
the canonical record and final agreement/confidence/coverage. A deterministic
`materialBaselineFingerprint` also detects independently corrupted baselines
when clamping or confidence/coverage caps mask their numeric effect. This is
an integrity checksum, not independent empirical support or cryptographic
authentication. Estimate/result equality, exact seat conservation, registry
reconciliation and identity-hash apportionment remain required. Older markers
reject the new metadata rather than silently downgrading its validation.

Save schema 13 and governance v1 stay unchanged: these are versioned result
proofs, not a new mutable world branch. Ordinary reload never reruns material
evaluation from current state, adds institutional evidence to old votes or
changes fiscal enactment history. The genuine plurality-v1 fixture was
produced and save/reload-validated by reviewed parent
`61e415d76ae3ff16cf61961df70d93857d7a87e7` before editing runtime; its profiles
are explicitly synthetic test evidence, not observed political positions.

The institutional evaluator adds no constitutional-reform gameplay, mutable
constitutions, elections updating governing blocs, coalition negotiation,
persistent factions or individual MPs. Context-derived succession is a
separate pure, on-demand mechanism as documented above. These are accepted
0.15 contracts; acceptance does not imply empirical calibration.

## Persistence, invariants and validation

Save schema 13 adds information state, leader provenance, leadership succession and a stable sequence. Schema-12 migration preserves date, tick, seed, fiscal and governance state, initializes information empty on the saved date, and deterministically fills missing party leaders without fabricating past briefings. The information invariant checks dates, references, provenance/status, unavailable values, access classification, source links, bounded history, leader uniqueness and succession/player-control consistency. Existing governance invariants remain enabled.

Global save schema remains 13; the current information subversion is `information-0.15-v3`. Explicit v2 -> v3 migration applies the 2,048/256/four-entry policy using saved player control, deterministic date/ID ordering and reference cleanup, while preserving safe fingerprinted estimates. Explicit v1 -> v3 migration also removes the old unfingerprinted Reality-derived estimates and unsupported crisis briefings. Both retain legitimate information subject to the declared bounds and the original information initialization date. Neither changes political persons, office appointments, player control, proposals, fiscal enactments, crisis history, seed, tick or date, or reconstructs past reports. Malformed v2/v3 estimate collections fail rather than becoming silent empty defaults.

Ordinary v3/schema-13 reload does not call leadership initialization, current-mapping reconciliation or retention a second time. Persisted names, office evidence and provenance are validated as saved evidence, independent of the current editorial mapping/name and officeholder tables. Registry mismatches or internally invalid evidence fail explicitly rather than silently rebuilding history. Existing schema-13 games are not automatically backfilled with newly ingested executive persons. Any such change to saved persons requires a separately specified versioned migration.

`npm run information:test` runs focused report/access/briefing/assistance/migration tests. `npm run information:audit` verifies the source-coverage report. `npm run information:benchmark` measures initialization, leader creation, save-size delta, ordinary/monthly scheduler days, generated succession and an actual full-cap 2,048-entry retained state across all 252 Countries, including new monthly emissions, reference validation and deterministic reload. `npm run governance:benchmark` also measures one context-derived succession, affected Country Region count, evidence bytes and save delta. The broader audit/build/test and world/politics/governance benchmarks are recorded in [the candidate validation evidence](milestone-0.15-candidate-validation.md) after execution.

## Limitations

- No party-leader mapping is counted as directly sourced/observed. All 1,287 initial gameplay persons are fictional; source data is provenance only.
- 342 distinct executive persons reconcile independently of party-leader mappings, but 221 lack resolved gameplay authority. A party's government bloc alone never grants an office or executive powers.
- Unemployment is the sole current Government Information report. Public perception, confidential diplomacy/defense intelligence, cabinet faction politics and autonomous ministers are out of scope.
- Fiscal UI exposes the existing corporate-tax and annual infrastructure-budget proposal paths through governance commands; unsupported instruments are not presented as working controls.
- The current model has no supported urgent briefing source, so automatic urgent pause is not exercised.
- Proposal reactions and government-visible counterfactual consequences are unavailable, not canonical Reality relabelled as estimates. No crisis-report sensor channel or Public Perception layer is implemented.
- Internal plurality, explicit-power-transfer institutional interest and context-derived succession are accepted 0.15 behavior using modelled priors, not observed faction shares or empirically calibrated party coefficients. Current fiscal proposals receive zero/not_applicable institutional adjustment. Succession creates no persistent factions, national leadership-election procedure or automatic leadership challenges.
- Measurement timings and the save comparison are workload-specific and are not performance thresholds or universal device guarantees.
