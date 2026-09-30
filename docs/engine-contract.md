# ProjectAtlas engine contract (0.8 foundation, 0.11 extension)

This contract is the integration point for simulation systems added after milestone 0.8. It consolidates the existing 0.1–0.7 model; it does not replace the entity or Region registries and does not duplicate the world in a second state object.

## Canonical state and invariants

`SimulationState` in `src/types.ts` is the only mutable, persistent world state. Country and Region registries remain immutable identity metadata. `canonicalWorld()` joins them for coherent reads while retaining references to the original state and registries. Its snapshot is a defensive clone intended for UI, debugging and persistence.

The following concepts are separate:

- `regionOwnership` is legal sovereignty.
- `occupationByRegion` is temporary military occupation associated with an active war.
- effective control is a future derived rule and must not overwrite sovereignty.
- Region identity and geometry live in the permanent registry and dataset mapping; simulation changes never mutate them.

Population and nominal output are quantities attached to permanent Region IDs. Ownership transfer changes who controls their totals and does not rewrite the values. Claims target Region IDs. Wars and occupations retain their existing 0.7 semantics.

`InvariantRegistry` is the shared lightweight registry for invariant definitions. `createCoreInvariantRegistry()` supplies the 0.8 checks; future runtimes register their system checks on that instance and call `validate()` or `assert()` at the appropriate boundaries. The compatibility helpers `validateSimulationInvariants()` and `assertSimulationInvariants()` use a core registry and can still receive one-off extra checks. A fidelity transition has the stricter `validateFidelityConservation()` rule: it cannot change sovereignty, occupation, wars, population, economic output, claims, CBs or relations.

## Time and scheduler

The canonical step is one game day. `SimulationClock` converts elapsed wall time to whole daily steps; each step passes through `SimulationScheduler`. Its constructor accepts a preconfigured scheduler, so the application runtime can start with `createCoreScheduler()` and register 0.10+ tasks on the exact scheduler used by the clock. Omitting the argument retains the core scheduler default. React only receives cloned snapshots and does not drive system logic.

A task declares a stable ID, cadence (`daily`, `weekly`, `monthly`, `quarterly`, `yearly`), optional numeric priority and pure state transition. Tasks run by priority and then ID. The context supplies the logical date and tick. Calendar boundaries use UTC: Monday, first day of month, first day of Jan/Apr/Jul/Oct and first day of January.

`requestImmediate()` persists a task ID, stable event key, request tick and sequence. The request executes at the next daily boundary in the same global ordering as scheduled work. An immediate request is never executed directly from an event handler or React render.

Future systems register their cadence with the shared scheduler. They should request a keyed immediate update after a major event instead of inventing a timer.

## Deterministic random values

`rng.ts` produces counter-free values from the game seed plus stable keys: system, entity, logical date/tick and event key. A system must supply keys that describe the decision, not its current array index or UI render order. Calling another random decision first does not shift later values. Simulation code must not use `Math.random()`.

The default seed is persisted under `SimulationState.engine.seed`. Same state, seed, decisions and registered scheduler tasks yield the same result across save/reload.

## Dirty state

`markDirty()`, `clearDirty()` and `inspectDirty()` provide a persistent, inspectable recalculation queue. Domains are extensible strings so future systems can introduce names such as `householdIncome`, `consumption` and `governmentRevenue` without a premature global dependency graph. Entity IDs narrow a mark when useful; an empty entity list means the whole domain and absorbs later entity marks. Marking a local domain globally promotes it to global. Clearing one entity never clears a global mark; clearing the domain without an entity removes the whole domain. Reasons are stable diagnostic labels.

A task that consumes a dirty domain must clear only the domain/entity it recalculated. Dirty state indicates work to perform; it is not an alternative store for computed values.

## Adaptive fidelity

Every registered Country has one persisted level: `Detailed`, `Standard` or `Background`. Migration from schema 6 assigns `Standard`. `requestFidelityTransition()` queues a transition; the core daily scheduler task applies it at the next deterministic boundary and records the last 100 transitions.

Fidelity selects future calculation resolution or frequency. It cannot multiply results or change the laws of the model. A transition alone conserves all 0.1–0.7 state. Future systems that own aggregated representations must convert them at this boundary and declare conservation checks for their quantities.

## Persistence and reproducibility

Save schema 7 adds `engine`: seed, tick, Country fidelity, pending/recent transitions, pending immediate work, sequence counter and dirty domains. The explicit v6→v7 migration preserves every 0.7 field and initializes all Countries at `Standard`, tick zero and the documented default seed. Schemas 1–5 continue through their existing migration path and receive the same engine defaults. When no diplomacy context is available, migration derives the complete known Country universe from the supplied permanent Regions, including parent and initial-owner IDs. Unknown future schemas are rejected.

Task implementations are code and are not serialized. Every runtime loading a save must register the same stable task IDs before advancing it. Pending immediate work deliberately fails if its task is absent, rather than being silently discarded.

## Reality, information and perception

`EpistemicView` and `LayeredValue` reserve three distinct API layers: canonical `reality`, `government-information` and `public-perception`. Milestone 0.8 exposes existing values as reality through `canonicalReality()`. It does not fabricate estimates or hidden information. Debugging and tests may always inspect canonical reality. Future information systems should implement the two other methods without changing the underlying reality value.

## Engine/UI boundary and diagnostics

Simulation modules do not import React, Leaflet or browser timing APIs. `SimulationClock`, scheduler tasks and state transitions produce immutable state snapshots. `simulationDelta()` compares the relevant domain structures rather than object identity, so defensive clones do not produce false changes. It describes changed top-level simulation domains for a future worker transport. UI components read snapshots and issue explicit commands.

`simulationDiagnostics()` exposes logical date/tick, seed, registered task order, fidelity counts, pending/recent transitions, dirty domains and structured invariant violations. It is a development API, not player-facing state.

Run `npm run benchmark:world` for the reproducible `projectatlas-world-v1` baseline: 3,650 daily ticks over all 252 Countries and 4,574 Regions, with a monthly full-world integrity scan and deterministic checksum. Wall-clock time is reported for comparison but is not a pass/fail threshold.

## Deliberately deferred

Milestone 0.8 did not implement domain systems. Later systems use this state, scheduler, RNG, dirty, fidelity and invariant contract rather than introduce parallel infrastructure.

## Milestone 0.10 integration

Schema 8 adds `socioeconomy` to the canonical state. The default scheduler now includes monthly economy and administrative observation tasks. The common invariant registry and fidelity conservation cover this layer. Legacy population and annual output maps are saved initialization references; current monthly flows live in the socioeconomic Region records. See [the 0.10 model contract](socioeconomy-0.10.md) for equations, provenance, v7 migration and performance limits.

## 0.10 corrective snapshot and reference boundary

`SimulationClock.snapshot()`, `advance()` and `advanceIfChanged()` expose deeply frozen defensive copies. A per-clock WeakMap caches each JSON-like source object by identity, so unchanged branches are reused across logical days. A monthly update replaces the socioeconomic branch and changed flow records, while unchanged cohort arrays and provenance can still be reused. No canonical reference is exposed, and neither an old snapshot nor a different UI consumer can mutate the cached copies. Snapshot construction must not run a full clone before consulting this cache. `cloneSimulationState()` remains the explicit mutable, uncached copy for save/migration/editable working copies.

Cache correctness follows the existing pure transition contract: runtime tasks replace changed objects and their ancestors, never mutate canonical branches in place. The cache is local to its clock, not a persisted state/version field. Its weak keys allow retired engine branches to be collected. Diplomacy/war setters copy only their incoming branches, preserving unrelated socioeconomic identity.

Country readers use `controlledBaselinePopulation()` / `controlledBaselineAnnualOutput()` for saved references and `simulatedPopulationByCountry()` / `simulatedMonthlyOutputByCountry()` for current persons / USD per month. The current helpers aggregate `socioeconomy.regions` through current `regionOwnership`, return undefined for empty or incomplete coverage, and preserve known zero values. Historical original-owner helpers are also renamed to `originalBaselinePopulation()` / `originalBaselineAnnualOutput()`. Ambiguous old names are removed from internal callers/exports. Reference setters on the clock are initialization-only and throw once `socioeconomy.initializedOn` is present, including after save reload.

The additional `projectatlas-daily-ui-snapshot-0.10` benchmark runs the actual clock and defensive snapshot path for 365 consecutive days, including 12 monthly transitions. It reports cold construction, mean unchanged-day time, monthly-day time, branch reuse counts, and total daily-path time separately from the unchanged economic benchmark. No timing threshold is treated as a correctness assertion.

Exact measurements and checks for this correction: [0.10 corrective validation](milestone-0.10-corrective-validation.md).

## Fiscal extension (0.11)

Schema 9 adds `fiscal`, with national accounts, household fiscal ledgers, dated policy reforms and service stocks. Fiscal sub-model v2 separates known statutory tax revenue from a fixed aggregate/residual financing baseline and preserves provenance for that baseline and opening debt. Initial fiscal-v1 schema-9 saves upgrade deterministically without another global schema increment. The default scheduler runs `fiscal.reforms` daily (priority 50) and `fiscal.monthly` after the economy (priority 150). The existing administration task reports execution without choosing policies. Fiscal state is included in core invariant and fidelity-conservation checks and structural UI deltas. The snapshot cache reuses it on ordinary days. See [fiscal-0.11.md](fiscal-0.11.md) for exact accounting, source coverage and timing semantics. Historical schema 8 saves preserve their full economic branch on upgrade. Same-date debug reforms update policy while paused; they do not execute monthly flows or bypass scheduler accounting.

Schema 10 adds the `crisis-0.12-v1` reality branch. `crisis.monthly` runs at priority 300 after all current causal monthly tasks. It observes national fiscal accounts and one pass over Region economic aggregates, produces explainable persistent tripwires and uses keyed RNG only for eligible tipping. Schema-9 migration starts monitoring on the saved date without reconstructed history. Crisis state participates in core invariants, fidelity conservation, copy-on-write snapshots and structural deltas. See [crisis-0.12.md](crisis-0.12.md).

Schema 11 adds the `politics-0.13-v1` reality branch. `politics.opinion-weekly` runs at priority 400 and deterministically updates the existing socioeconomic cohorts from their material conditions. National institutions preserve sourced, modelled and unavailable coverage explicitly; visible party and organized-interest identities are fictional. Schema-10 migration initializes politics on the saved date without reconstructed history. Politics participates in core invariants, fidelity conservation, copy-on-write snapshots and structural deltas. See [politics-0.13.md](politics-0.13.md).
