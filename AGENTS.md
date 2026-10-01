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

## Player, politics, diplomacy, war, and trade direction

Future player control is a person, not automatically a country. A person may belong to or lead a party and may hold office, govern, or remain in opposition. Available powers come from the office actually held. Losing an election or office is not automatically game over; continuation or succession will follow future scoped rules.

Do not give every actor every political action. The current future contract reserves sit-ins and general/national/capital demonstrations for parties, possible strikes for unions, and no automatic strike power for associations. Do not implement these actions before their milestone.

International conflict follows persistent issues -> tensions/crisis -> escalation or de-escalation -> explicit use of force -> war. Never turn a relation-score threshold directly into war. Decisions, interests, tensions, and capabilities cause conflict. Keep occupation, control, and sovereignty distinct.

Future trade follows production -> needs -> aggregate trade -> prices -> dependencies -> consequences. Do not invent trade dependencies before real flows exist.

## Scope discipline

Never start the next milestone without explicit instruction. If the task is 0.14, do not implement 0.15. Prepare extension points when necessary, but do not implement out-of-scope systems. Do not use a scoped change as an excuse for broad refactoring of validated systems.

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
