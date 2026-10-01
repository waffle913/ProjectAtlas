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

## Future direction and scope

- The future player controls a person whose powers come from an office, not automatically a country. Losing office/election is not automatically game over.
- Do not implement political actions early. Future contracts: parties may use sit-ins and general/national/capital demonstrations; unions may strike; associations have no automatic strike power.
- Diplomacy/war follows persistent issues -> tensions/crisis -> escalation/de-escalation -> explicit force -> war. Never use `relations < threshold => war`; preserve occupation/control/sovereignty distinctions.
- Trade follows production -> needs -> aggregate flows -> prices -> dependencies -> consequences. Do not invent dependencies before flows.
- Never begin the next milestone without explicit instruction or broadly refactor a validated milestone. Any validated-system change must be minimal, necessary, tested, and reported.

Before completion, run relevant tests, `npm run verify` when warranted, and affected domain audits/benchmarks. Check `Math.random` after runtime changes and verify saves, migrations, invariants, and permanent IDs where applicable. Report commands and actual results. At milestone end, commit/push and provide the exact SHA, principal files, tests, limitations, assumptions, unavailable coverage, migrations, and performance.
