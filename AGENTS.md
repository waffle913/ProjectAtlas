# ProjectAtlas agent instructions

These instructions apply to every coding agent working anywhere in this repository. The validated baseline when these instructions were introduced is `3c58305dc795fce5f66a2f65aa03c3139cf1e17b`.

## Agent role and continuity

A coding agent is an implementer, not an independent game designer. The current validated architecture, this file, the affected subsystem contracts and [the canonical agent handoff](docs/agent-handoff.md) define the project direction. Do not replace a validated design with a preferred alternative merely because it seems simpler or more elegant.

Keep useful engineering rationale persistent: decisions, motivations, rejected alternatives, causal reasoning, invariants, modelling assumptions, limitations and compatibility requirements. Do not attempt to preserve private chain-of-thought.

When the requested behavior, canonical documentation or validated code leave a material design ambiguity, stop at that decision and ask the user for clarification. Do not invent a new ProjectAtlas direction. Implementation freedom exists inside the locked contracts, not above them.

## Purpose and default decision rule

ProjectAtlas is a geopolitical, economic, social, political, and military simulation. Prefer realism while keeping the simulation computable, deterministic, and performant. Systems must be causal: decisions change real state variables and consequences emerge from existing mechanisms.

Do not introduce abstract bonuses, arbitrary penalties, magic modifiers, sliders without an underlying mechanism, or random events that create their own causes. When an easy solution conflicts with causality, provenance, determinism, conservation, permanent identity, or save compatibility, choose the correct architecture. Document any necessary compromise.

## Canonical engine boundaries

There is one canonical `SimulationState`. Never create a second world state, economy, fiscal engine, politics engine, scheduler, clock, or RNG. Reuse existing contracts. The engine is separate from the UI: the UI observes state and issues explicit commands; it is never a source of truth.

Reality, government information, and public perception are distinct layers. Exact engine reality must not automatically become player knowledge. Implement only the layers required by the current milestone; do not anticipate information or perception systems without explicit scope.

## Territorial identity and ownership

The permanent model is `Country -> owns Regions -> Regions reference geometry`. A Country is never a fixed polygon. Country IDs and Region IDs are permanent and opaque. Never regenerate them from names, file order, geometry source IDs, array indexes, or ISO codes alone.

Keep legal sovereignty, effective control, and military occupation distinct. Occupation is not sovereignty. Annexing or transferring a Region changes ownership without redrawing its geometry.

`state.regionOwnership` is the canonical source for current sovereign ownership. Never maintain a second ownership map in a subsystem. Performance caches and aggregates are allowed only when they reconcile with canonical ownership.

## Data provenance and scenario time

Every real-world datum must be dated and traceable. Preserve publisher, source URL, retrieval/reference date, licence, attribution, and limitations. Use explicit statuses such as `sourced`/`observed`, `derived`, `modelled`, `partial`, `unavailable`, and `not_applicable`. Use `not_applicable` only when reality justifies it.

`unavailable != 0`. Missing data never means a zero tax rate, zero seats, no debt, no party, no revenue, no production, or no organization. Never fabricate purported observations. Modelled values must remain identifiable as modelled.

The global scenario starts on `2026-01-01`. Factual initial data must apply on that date. A later publication is admissible only when it explicitly documents a situation applicable on the scenario date. Never inject a post-scenario event retroactively.

Code and data licences are separate. Never infer a dataset licence from the licence of a package or tool that transports it. If a data licence is ambiguous, record `requires_confirmation`. Commercial release remains blocked on incompatible or unconfirmed datasets.

## Determinism, scheduling, and fidelity

The same seed, state, decisions, and date must produce the same result. Do not use `Math.random`. Use only the shared deterministic RNG with stable keys independent of iteration order. Results that should be order-invariant must not depend on object, Country-array, or Region-registry insertion order.

Use only the shared scheduler. Never add a simulation `setInterval`, parallel simulation timer, or independent business loop. Current causal cadence includes monthly economy, monthly fiscal/services, monthly crises, and weekly politics/opinion. Respect registered priorities and document the causal order of every new system.

`Detailed`, `Standard`, and `Background` fidelity use the same causal laws. Fidelity may change resolution, cadence, or calculated detail. It may not artificially change population, debt, stocks, equipment, opinion, crises, resources, support, or outcomes. Every transition must pass conservation invariants.

## Performance

The world simulation must remain playable. Prefer cohorts and aggregates over billions of agents, multiple cadences, differential recalculation, copy-on-write, reusable snapshots, and static registries outside saves.

Do not add full daily deep clones, needless world-wide recalculation every tick, unbounded history, or repeated static data in every Region, cohort, or save. Measure before optimizing. Never silently sacrifice causality just to improve a benchmark.

## Saves, migrations, and invariants

Every canonical-state change must address schema versioning, migration, saving, reload, determinism, and invariants. A migration preserves date, tick, seed, and already simulated state. It never replays from 2026 or invents history. Initialize a newly introduced system on the migration date without fictional prior history.

Register every new canonical system with `InvariantRegistry`. Validate identity, references, sums, stocks and flows, dates, provenance, finite numeric values, conservation, and save/reload behavior. Tests must cover failures and architectural regressions, not only happy paths.

## Validated domain contracts

Do not rewrite a validated milestone merely to simplify a later one. Changes to validated systems must be minimal, necessary, tested, and explicitly reported.

- **0.8 contracts/fidelity:** one engine, scheduler, clock, RNG, invariant registry, dirty state, snapshots, and fidelity framework.
- **0.9 registry/data audit:** permanent opaque Country/Region identity and audited source mappings.
- **0.10 economy:** existing population/cohorts are the sole population source. Activity, income, employment, and consumption are causally linked. Do not add another population or GDP engine. Future policy acts through existing mechanisms, not a direct `GDP *= modifier` shortcut.
- **0.11 fiscal/public services:** legal tax rules lead to liabilities, collection, revenue, budget execution, transfers/services, household disposable income, and public capacity. Keep known statutory tax revenue, baseline/other revenue calibration, and total revenue distinct. An unavailable rule is never a 0% rate, and baseline calibration must not neutralize reforms.
- **0.12 crisis/tripwires:** real variables lead to tripwires, severity, persistence, pressure, deterministic tipping, active crisis, and causal recovery. A crisis never creates its own cause. Do not apply direct crisis-to-GDP or crisis-to-crisis modifiers; cascades pass through material variables.
- **0.13 politics:** national institutions, chambers, fictional gameplay parties, organizations, and Region/cohort opinion. Real sourced bases may inform fictional parties, but party name, source-ID hashes, and party order must never invent ideology. Historical ideology is a historical prior, not a 2026 observation. Semantically incompatible or missing dimensions stay neutral/modelled/unavailable.
- **0.14 governance:** the player controls a persistent fictional person, never directly a Country. Party membership, party leadership, and public office are distinct facts; available powers come only from the office actually held. Proposals follow draft -> submitted -> enacted/rejected/unavailable. A submitted payload is immutable and carries a deterministic fingerprint; later changes require a new draft or withdrawal. Political evaluation is situational and causal. Parties vote as deterministic blocks only after continuous evaluation; `UNKNOWN` is distinct from `ABSTAIN` and missing data never becomes an implied rejection. An adopted proposal calls the existing fiscal queue exactly once; governance never writes fiscal state directly or runs a second history engine. Schema-12 migrations preserve real aggregate historical votes as-is, without fabricating party evaluations or replaying history.

## 0.15 -- accepted parent milestone

0.15 is accepted/validated following the user's independent-review decision.
Corrected 0.16 is the user-directed validated parent; 0.17 is the explicitly authorized current milestone, pending independent review and not accepted.
The contracts below remain the accepted 0.15 foundation.

**Implemented and accepted:**

- Reality, Government Information, and Public Perception stay distinct
  layers. 0.15 implements the Reality -> Government Information ->
  player-presented-interpretation boundary explicitly; exact engine reality is
  never auto-exposed to ministers or the UI. Preserve source, freshness,
  confidence, coverage, uncertainty, and `unavailable` end to end.
- Ministers/advisors only transform information the government can already
  access into briefings; they are not a second simulation engine. Difficulty
  changes how much interpretation the player receives, never the causal laws
  or the underlying reality.
- An enacted or rejected law does not automatically pause the game. Only
  urgent/severe notifications may interrupt or pause, per the notification
  contract. The UI stays strictly downstream of canonical state.
- The 0.14 person model is active, not future direction. Losing an office is
  not automatically game over. If the controlled leader is replaced or
  removed, preserve continuity and allow a later proper handoff to the
  successor, rather than silently transferring control to the Country.
- At scenario start, playable party leaders are fictional analogues derived
  from real leaders as a reference, never copies of the real person's
  identity; the real source name remains provenance/debug metadata only.
- Automatically generated post-replacement party leaders derive
  deterministically from the fictional party platform, a modelled common
  internal tendency prior, current modelled supporter preferences and
  available sourced legislative representation/current modelled party support.
  This creates no observed faction shares, individual MPs or persistent
  faction system. Explicit existing successors bypass modelled candidate
  selection and retain their identity/profile/provenance. Versioned saved
  context validates new profiles without reconstructing historical opinion;
  historical bounded-fallback successors remain unchanged.
- New parliamentary resolutions use continuous aggregate internal plurality
  independently per issue/goal, not one persistent global faction axis or
  individual MPs. The common prior is modelled, not observed faction data.
  Deterministic largest remainder allocates exact party seats across
  YES/NO/ABSTAIN/UNKNOWN; insufficient evidence remains UNKNOWN. Central
  evaluation is retained but no longer assigns every seat. New records use
  `situational-plurality-0.15-v2` / `internal_party_distribution_v1`;
  historical 0.14 block/aggregate and `plurality-0.15-v1` votes are preserved
  without adding new evidence.
- Party evaluation supports situational institutional self-interest only
  when proposal analysis contains explicit legal power transfers. Effects
  derive from current executive/chamber leverage and power balance, never
  from a flat government/opposition modifier. Current fiscal-only proposals
  contain no institutional transfer: adjustment is zero/not_applicable.
  Coalition leverage remains a documented V1 modelled proxy. Strategic
  pragmatism contributes an independent modelled plurality dimension;
  missing branch evidence remains UNKNOWN. Public opinion stays material-only.
  Versioned institutional records retain a fingerprinted material baseline;
  reload validates saved evidence without replaying material history.

This institutional evaluator does not implement playable constitutional
reforms, mutable constitutions, elections updating the governing bloc, or
coalition negotiation.

## 0.16 -- corrected validated parent

The military capability task extends accepted 0.15 parent `ceddc8e04fc470f41155fdc8b6250142fb970705`; original implementation `b27e59f8528bc181c8f69e7af7f9c134e45c9a0a`, corrected parent `7580ed683a8164764fbccfbe94bb828da84c57ed`. The user's new 0.17 direction identifies this corrected HEAD as validated; tests and the previous read-only review did not self-accept it. Read [the military contract](docs/military-0.16.md). Schema 14 introduced reservations in the existing labour universe; gross payroll/withholding and production use the one fiscal/economic engine. Unavailable factual armies remain unavailable; the UK historical reference is rounded/partial and the opt-in single-Country scenario is explicitly synthetic. Executive administrative management is office-derived, not Country control or operational commander authority. Preserve monthly priorities 90/150/250, conserved dated ledgers/reports and verified old-report readiness compatibility. Migration initializes at the saved date without replay. No 0.19 operations or war/control changes.

## 0.17 -- authorized, independent review pending

Read [the trade contract](docs/trade-0.17.md). Schema 15 adds `trade-0.17-v1`; shared monthly priorities 95/110/260 prepare, settle and report trade around the existing economy/fiscal tasks. Imports use the actual saved opening disposable-income/private-residual envelope; exports subdivide existing realized private output. Domestic output/income never gain an additive trade bonus, public orders are not diverted, and customs/import consumption tax enter the sole fiscal engine without recalibrating baseline revenue. Historical value priors do not establish physical production, quantities, tariffs, stocks or government knowledge before all source inputs are available. Preserve unknown versus zero, dated complete funding evidence, physical ledgers, report-only authority-gated UI, save-date migration and permanent IDs. Supplementary military inputs constrain real factory work, never readiness directly. No 0.18 sanctions/coercion, 0.19 operations or 0.20 treaty systems. Implementation is not acceptance.

## 0.22 -- generic decision/policy/law framework

Read [the policy framework contract](docs/policy-framework-0.22.md). Generalizes `PoliticalProposal` into a typed per-kind model (first category `fiscal_reform`) without a second engine: `ProposalKind`, `ProposalInstrumentClass` (administrative_action / regulatory_policy / law / constitutional_amendment), a typed `ProposalEffect` record, and a static pedagogical descriptor registry kept out of saves. Fiscal proposals keep their identity/status/payload/fingerprint/history/parliamentary result/enactment; schema stays 18 with an idempotent migration that backfills only ABSENT `instrumentClass`/`effects` and never repairs present-but-inconsistent effects. `kind`, `instrumentClass` and the future `constitutionalDisposition` are strictly derived and validated by the invariant in 0.22 (no constitutional procedure yet). Engine commands (`submitProposalForActor`, `withdrawProposalForActor`, `resolveProposalVoteForActor`) check real office powers for an explicit actor; the player wrappers still require the controlled person. No mutable constitution, elections, police, health, immigration or UI redesign is implemented. Implementation is not acceptance.

## 0.23 -- constitution, elections and political organisations

Read [the constitution contract](docs/constitution-institutions-0.23.md), [the elections contract](docs/elections-0.23.md) and [the organisations contract](docs/organizations-0.23.md). Schema 19. Adds a canonical `constitution` state derived strictly from the 0.13 political registry (executive system, chambers, electoral rules) — never fabricating sourced rights, thresholds or procedures — and a canonical `elections` state whose dynamic seat allocation is initialized from the sourced registry without rewriting it. Procedures implemented: emergency declaration/end/expiry (requires an active crisis and the executive office), and constitutional binding of material keys with rejection of ordinary-law modification (`constitutionally_protected`). Elections: `dissolveParliament`, `runElection` (deterministic largest-remainder conversion from national support, incumbent baseline otherwise), `runElectionCycle`, and `makeCampaignPromise` (records a typed promise without ever applying the policy). The full amendment/referendum procedure, campaign credibility, and mutable political organisations are deferred and documented, not implemented. No UI redesign. Implementation is not acceptance.

## Player, politics, diplomacy, war, and trade direction

Player control of a person (not automatically a country) is active as of
0.14/0.15, per the contracts above. A person may belong to or lead a party and
may hold office, govern, or remain in opposition. Available powers come from
the office actually held.

Do not give every actor every political action. The current future contract
reserves sit-ins and general/national/capital demonstrations for parties,
possible strikes for unions, and no automatic strike power for associations.
Do not implement these actions before their milestone.

International conflict follows persistent issues -> tensions/crisis -> escalation or de-escalation -> explicit use of force -> war. Never turn a relation-score threshold directly into war. Decisions, interests, tensions, and capabilities cause conflict. Keep occupation, control, and sovereignty distinct.

Trade follows production -> needs -> aggregate trade -> prices -> dependencies -> consequences. Do not invent trade dependencies before real flows exist.

## Mandatory agent workflow

For any change touching canonical state, migration/save behavior, the
political model, multiple domains, or performance:

1. Before editing, establish and record a no-code plan covering affected
   contracts, dependencies, migrations, invariants, tests and risks. If the
   task is unambiguous and within the authorized scope, continue directly
   with implementation without waiting for user approval. Stop only for a
   material design ambiguity or an out-of-scope decision.
2. Only then implement the smallest coherent, independently reviewable
   block. Do not swallow an entire milestone in one change, and do not
   broadly refactor a validated milestone merely to make current work easier.
3. Separate IMPLEMENTATION and REVIEW passes. The implementation pass must
   not treat its own reasoning as proof of correctness. The review pass must
   re-read the actual diff and actively hunt for regressions, specifically
   conservation, determinism, saves/migrations, provenance, stale data,
   `unknown != zero`, `unknown != abstain`, and Reality -> Government
   Information leaks.
4. If an instruction conflicts with a validated contract, or the code reveals
   a material design ambiguity, preserve the validated contract, flag the
   ambiguity, and do not invent practical behavior.

## Scope discipline

Never start the next milestone without explicit instruction. If the task is 0.15, do not implement 0.16. Prepare extension points when necessary, but do not implement out-of-scope systems. Do not use a scoped change as an excuse for broad refactoring of validated systems. If 0.15 work surfaces a bug in an already-validated 0.8-0.14 contract, apply only the minimal necessary fix with a regression test, and report it separately from 0.15 work. A docs update describing 0.15 contracts is not itself acceptance of 0.15; acceptance follows independent review.

## Completion and review

Before declaring work complete:

- read `AGENTS.md`, `.github/copilot-instructions.md`, the current `README.md`, [the canonical handoff](docs/agent-handoff.md), and affected subsystem documentation;
- run relevant tests;
- run `npm run verify` when the scope warrants it;
- run audits and benchmarks for every modified domain;
- search for `Math.random` when simulation runtime changed;
- verify migrations, saves, invariants, and unchanged Country/Region IDs as applicable;
- report exact commands and actual results; never claim tests passed without running them.

At the end of each milestone, commit and push, provide the exact SHA, summarize principal files, tests/audits/benchmarks, limitations, modelling assumptions, unavailable coverage, migrations, and performance. Each milestone will be audited separately before the next begins.
