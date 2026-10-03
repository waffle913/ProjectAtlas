# ProjectAtlas coding instructions

ProjectAtlas is a realism-first geopolitical, economic, social, political, and military simulation. Keep it causal, deterministic, computable, and performant. Decisions change real variables; consequences emerge from mechanisms. Do not add abstract bonuses, arbitrary penalties, magic modifiers, causeless random events, or sliders without underlying state.

## Agent role and continuity

- You are an implementer, not an independent game designer. Follow the validated code, these instructions, `AGENTS.md`, the relevant subsystem contracts and the [canonical agent handoff](../docs/agent-handoff.md). Do not replace a validated design with a preferred alternative.
- Preserve useful engineering rationale, decisions, rejected approaches, assumptions, limitations and compatibility requirements; do not preserve private chain-of-thought.
- If a material design ambiguity remains after reading code and canonical documentation, stop and ask the user rather than inventing project direction. Implementation freedom exists inside locked contracts, not above them.
- Before implementation, read both agent instruction files, `README.md`, the canonical handoff and all affected subsystem documentation.

## Locked architecture

- Keep one canonical `SimulationState`, economy, fiscal engine, politics engine, scheduler, clock, and deterministic RNG. The UI observes state and never becomes authoritative.
- Keep Reality, Government Information, and Public Perception separate. Do not expose exact reality or build unscoped information layers.
- Model `Country -> owns Regions -> Regions reference geometry`. IDs are permanent and opaque; never regenerate them from names, ordering, geometry IDs, indexes, or ISO alone.
- `state.regionOwnership` is sovereign ownership. Do not duplicate it. Sovereignty, effective control, and military occupation are distinct; occupation is not sovereignty.
- Use only the shared scheduler and registered priorities. No simulation `setInterval`, parallel timers, or independent business loops. Document causal ordering.
- Never use `Math.random`. Shared RNG keys must be stable and independent of insertion/iteration order. Same seed, state, decisions, and date must yield the same result.
- Fidelity levels change resolution/cadence/detail only, never laws or outcomes. Conserve population, debt, stocks, equipment, opinion, crises, resources, and support across transitions.

## Data, time, and licensing

- Date and trace every real datum with publisher, URL, reference/retrieval date, licence, attribution, and limitations.
- Preserve `sourced`/`observed`, `derived`, `modelled`, `partial`, `unavailable`, and justified `not_applicable` semantics. `unavailable != 0`; never invent observations or turn missing data into zero.
- Scenario start is `2026-01-01`. Data must apply then; later publications are allowed only when they explicitly document that date. Never inject later events retroactively.
- Code licence is not data licence. Never infer a dataset licence from its tooling/package. Use `requires_confirmation` when ambiguous and treat incompatible/unconfirmed data as a commercial-release blocker.

## State, saves, performance, and tests

- Every canonical-state change addresses schema, migration, save/reload, determinism, and invariants. Migrations preserve date, tick, seed, and simulated state; never replay from 2026 or invent history. Initialize new systems on the migration date.
- Register new canonical systems in `InvariantRegistry`. Validate identities, references, sums, stocks/flows, dates, provenance, finite values, conservation, and save/reload. Add regression and failure tests.
- Prefer cohorts/aggregates, multi-cadence updates, differential recalculation, copy-on-write, reused snapshots, and static registries outside saves. Avoid daily full deep clones, needless global recalculation, unbounded history, and duplicated static data. Measure first; do not trade away causality for benchmark gains.

## Validated domain invariants

- 0.8–0.9: reuse the established engine contracts and permanent Country/Region registries.
- Economy 0.10: existing population/cohorts are the only population source; activity, income, employment, and consumption are causal. No second GDP/population engine or direct `GDP *= modifier` shortcut.
- Fiscal 0.11: legal rules -> liabilities -> collection -> revenue -> budget -> transfers/services -> disposable income/public capacity. Separate known statutory, baseline/other, and total revenue. Missing rules are not 0%; baseline calibration cannot cancel reforms.
- Crisis 0.12: material variables -> tripwires -> severity/persistence/pressure -> deterministic tipping -> crisis -> causal recovery. Crises do not create their causes or directly modify GDP/other crises.
- Politics 0.13: institutions, chambers, fictional parties/organizations, and Region/cohort opinion. Never derive ideology from party names, source-ID hashes, or ordering. Historical ideology remains a historical prior; semantically unsupported dimensions remain neutral/modelled/unavailable.
- Governance 0.14: player controls a persistent fictional person, never directly a Country. Party membership, party leadership, and public office are distinct facts; powers come only from the office actually held. Proposals: draft -> submitted -> enacted/rejected/unavailable, with an immutable submitted payload and deterministic fingerprint. Evaluation is situational and causal; parties vote as deterministic blocks; `UNKNOWN != ABSTAIN`; missing data never becomes an implied rejection. Fiscal enactment happens exactly once through the existing fiscal queue. Schema-12 migrations preserve real aggregate historical votes without fabricating party evidence or replaying history.

## 0.15 -- current milestone (candidate, pending independent review)

0.15 is the active milestone: implemented and pushed for review, but **not**
independently accepted. Do not describe it as validated.

Already implemented (candidate, pending review):
- Reality -> Government Information -> player-presented-interpretation
  boundary is explicit; no raw reality exposed to ministers/UI; preserve
  source/freshness/confidence/coverage/uncertainty/`unavailable`.
- Ministers/advisors transform only government-accessible information into
  briefings; not a second simulation engine. Difficulty changes interpretation
  degree only, never causal laws or underlying reality.
- Enacted/rejected laws do not auto-pause; only urgent/severe notifications
  may interrupt per the notification contract; UI stays strictly downstream
  of canonical state.
- The 0.14 person model is active, not future. Losing office is not
  automatic game over. A replaced/removed controlled leader preserves
  continuity for a later proper successor handoff, never a silent
  Country-level control transfer.
- Initial playable party leaders are fictional analogues derived from real
  leaders as reference, never copies of the real identity; the real name
  stays provenance/debug metadata only.
- Automatically generated post-replacement leaders derive deterministically
  from the fictional party platform, a modelled common internal tendency
  prior, current modelled supporter preferences and available sourced
  legislative representation/current modelled party support. No observed
  faction shares, individual MPs or persistent factions are created.
  Explicit existing successors bypass modelled selection and preserve their
  identity/profile/provenance. Versioned saved context validates new profiles
  without replaying historical opinion; old bounded fallbacks stay unchanged.
- New parliamentary resolutions use continuous aggregate plurality,
  independently per issue/goal, without persistent global factions or
  individual MPs. The common prior is modelled, not sourced faction data.
  Deterministic largest remainder conserves exact party seats across
  YES/NO/ABSTAIN/UNKNOWN; insufficient evidence stays UNKNOWN. Central vote
  is not a seat allocation. New records use `situational-plurality-0.15-v2` /
  `internal_party_distribution_v1`; historical 0.14 and plurality-v1 votes
  stay unchanged without new evidence.
- Situational institutional self-interest requires explicit legal power
  transfers in proposal analysis. Effects derive from current
  executive/chamber leverage and power balance, never a flat
  government/opposition modifier. Current fiscal-only proposals have no
  institutional transfer: zero/not_applicable adjustment. Coalition leverage
  is a documented V1 modelled proxy; strategic pragmatism is an independent
  modelled plurality dimension; missing branch evidence stays UNKNOWN.
  Public opinion stays material-only. Versioned records preserve a
  fingerprinted material baseline; reload does not replay material history.

No playable constitutional reforms, mutable constitutions, elections
updating the governing bloc, or coalition negotiation are implemented by
the institutional evaluator.

## Future direction and scope

- Player control of a person (not automatically a country) is active as of
  0.14/0.15, per the contracts above. A person may belong to or lead a party
  and may hold office, govern, or remain in opposition; powers come from the
  office actually held.
- Do not implement political actions early. Future contracts: parties may use sit-ins and general/national/capital demonstrations; unions may strike; associations have no automatic strike power.
- Diplomacy/war follows persistent issues -> tensions/crisis -> escalation/de-escalation -> explicit force -> war. Never use `relations < threshold => war`; preserve occupation/control/sovereignty distinctions.
- Trade follows production -> needs -> aggregate flows -> prices -> dependencies -> consequences. Do not invent dependencies before flows.
- Never begin the next milestone without explicit instruction or broadly refactor a validated milestone. Any validated-system change must be minimal, necessary, tested, and reported. If 0.15 work surfaces a bug in an already-validated 0.8-0.14 contract, apply only the minimal necessary fix with a regression test, reported separately. A docs update describing 0.15 contracts is not itself acceptance; acceptance follows independent review.

## Mandatory agent workflow

- For changes touching canonical state, migration/save, the political model, multiple domains, or performance: before editing, establish and record a no-code plan covering affected contracts, dependencies, migrations, invariants, tests and risks. If the task is unambiguous and within the authorized scope, continue directly with implementation without waiting for user approval. Stop only for a material design ambiguity or an out-of-scope decision.
- Then implement the smallest coherent, independently reviewable block. Do not swallow a whole milestone in one change; do not broadly refactor a validated milestone to ease current work.
- Separate IMPLEMENTATION and REVIEW passes: implementation must not treat its own reasoning as proof of correctness; review must re-read the actual diff and actively hunt regressions -- conservation, determinism, saves/migrations, provenance, stale data, `unknown != zero`, `unknown != abstain`, Reality -> Government Information leaks.
- On conflict with a validated contract, or material design ambiguity: preserve the validated contract, flag the ambiguity, do not invent behavior.

Before completion, run relevant tests, `npm run verify` when warranted, and affected domain audits/benchmarks. Check `Math.random` after runtime changes and verify saves, migrations, invariants, and permanent IDs where applicable. Report commands and actual results. At milestone end, commit/push and provide the exact SHA, principal files, tests, limitations, assumptions, unavailable coverage, migrations, and performance.
