# ProjectAtlas agent handoff

This document is the canonical cross-system continuity brief for humans and coding agents. It records validated direction and engineering rationale; it does not authorize implementation of a future milestone. For exact subsystem equations, source records, migration details and validation evidence, use the linked milestone contracts and reports.

## Current validated state

The accepted **0.15 foundation**, following the user's independent-review decision, introduced save schema 13 and information version `information-0.15-v3`. Its contracts include versioned plurality, institutional evaluation and succession while preserving historical 0.14 records. The earlier accepted base `c8bcb0841f6a75887b2ca520eca88496331aa1fd` remains the milestone 0.14 historical reference, not the current acceptance boundary. Validated milestones 0.8–0.15 are architectural history, not tasks to redo.

The user explicitly directed 0.17 from the corrected **validated 0.16** HEAD `7580ed683a8164764fbccfbe94bb828da84c57ed`, schema 14. The validated 0.17 candidate parent is `a4e27364fdcffc2a165c71f5a67fffbad869c2ba`, schema 15, pending independent review and not accepted. **0.18 international tensions/crises/sanctions is implemented for independent review, not accepted**, schema 16. **0.19 military operations/war/territorial control is implemented for independent review, not accepted**, schema 17. No 0.20 work is authorized. This document and subsystem contracts are context, not permission to implement further roadmap items. Known modelled assumptions and unavailable coverage remain explicit.

Key subsystem references:

- [Engine and scheduler contract](engine-contract.md)
- [0.9 data audit](data-audit.md)
- [0.10 socioeconomic model](socioeconomy-0.10.md)
- [0.11 fiscal model](fiscal-0.11.md) and [fiscal data audit](fiscal-data-0.11.md)
- [0.12 crisis model](crisis-0.12.md)
- [0.13 politics model](politics-0.13.md)
- [0.14 governance model](governance-0.14.md)
- [Accepted 0.15 information and leadership contract](information-0.15.md), with [historical development validation evidence](milestone-0.15-candidate-validation.md)
- [Corrected 0.16 military contract](military-0.16.md)
- [0.17 trade contract, independent review pending](trade-0.17.md)
- [0.18 international contract, independent review pending](international-0.18.md)
- [0.19 operations contract, independent review pending](operations-0.19.md)
- Corresponding final validation records: `milestone-0.10-validation.md`, `milestone-0.10-corrective-validation.md`, `milestone-0.11-validation.md`, `milestone-0.12-validation.md`, `milestone-0.13-validation.md` and `milestone-0.14-validation.md`

## Project purpose and decision rule

### Corrected 0.16 foundation and explicitly authorized 0.17 extension

The military source-code parent is accepted 0.15 `ceddc8e04fc470f41155fdc8b6250142fb970705`; original 0.16 implementation is `b27e59f8528bc181c8f69e7af7f9c134e45c9a0a`, corrected 0.16 is `7580ed683a8164764fbccfbe94bb828da84c57ed`. Personnel reservations minimally extend the single existing labour identity; gross wages/withholding and procurement use the sole fiscal/economic engines. Migration initializes unavailable coverage at the saved date without replay. Missing factual armies remain unavailable; the rounded UK reference does not initialize stocks. The optional single-Country demonstration is visibly synthetic. Executive management is office-derived and never operational commander authority.

0.17 adds `trade-0.17-v1` and complete physical/invoice/funding evidence to the same state. Monthly 95 prepares budgets/supply, 100 preserves the existing domestic economy, 110 settles imports, 150 books sole-fiscal customs/import VAT and physical military work, 250/260 produce military/trade reports, 300 observes material crises and 350 applies existing Information retention. Weekly politics remains 400. Imports are paid from saved opening disposable income/private residual; exports are destinations of already represented private output, not extra GDP. This opening-budget decomposition is an autonomous V1 engineering assumption, not separately user-approved modelling direction. Fixed fiscal calibration/public orders are preserved. Historical values do not identify factual physical sectors, capacities, stocks or tariffs. Dated report-only inspection and office-gated stock targets grant no Country-control powers. Supplementary military inputs constrain existing work, not readiness. Preserve the verified schema-14 military readiness upgrade, six Information integrity rules, advanced-save history and structural wars. Full accounting/data/performance limitations are in [trade-0.17.md](trade-0.17.md).

ProjectAtlas is an original geopolitical, economic, social, political and military simulation. Its global scenario begins on **2026-01-01**. Favor realism while keeping the simulation causal, deterministic, computable and performant. Decisions change underlying variables; existing mechanisms produce consequences. Use cohorts and aggregates rather than billions of agents.

A coding agent is an **implementer, not an independent game designer**. Validated code, this handoff and the relevant subsystem documentation outrank an agent's preferred architecture. Do not replace a validated decision just because another approach appears simpler. Preserve engineering rationale—decisions, motivations, rejected approaches, causal reasoning, invariants, assumptions, limitations and compatibility requirements—without attempting to preserve private chain-of-thought.

When requirements, canonical documentation and validated code leave a material design choice unresolved, stop at that choice and ask the user. Do not invent a new ProjectAtlas direction. Implementation freedom exists inside locked contracts, not above them.

## Core architecture and causal contracts

- There is one canonical `SimulationState`, economy, fiscal engine, politics engine, scheduler, clock and deterministic RNG. The UI observes snapshots and issues explicit commands; it is never authoritative.
- Reality, Government Information and Public Perception are distinct. Exact engine reality does not automatically become player knowledge. Implement only the information/perception layers in explicitly scoped work.
- A logical tick is one day. Use the shared scheduler, registered priorities and stable task IDs; do not create simulation timers or independent business loops. Existing monthly economy/fiscal/crisis and weekly politics cadences have documented ordering.
- Never use `Math.random`. Keyed RNG inputs describe stable decisions/entities, not iteration or insertion order. Same seed, state, decisions and date must reproduce the same result.
- Detailed, Standard and Background fidelity change resolution, cadence or detail, never causal laws or outcomes. Preserve population, debt, stocks, equipment, opinion, crises, resources and support at transitions.
- Prefer cohort/aggregate work, multiple cadences, differential recalculation, copy-on-write and cached snapshots. Avoid daily full-world deep clones, needless global recalculation, unbounded history and duplicated static data. Measure before optimizing.

## Territorial identity and ownership

The permanent model is **Country -> owns Regions -> Regions reference geometry**. Regions are the gameplay territorial units. Country and Region IDs are permanent opaque IDs, independent of names, source geometry IDs, file or array order, and ISO codes. Do not redraw a Region for conquest or annexation.

`state.regionOwnership` is sovereign ownership and the only canonical ownership map. Keep legal sovereignty, effective control and military occupation distinct; occupation does not transfer sovereignty. Geometry is identity metadata, not a simulation ownership source. Performance aggregates/caches must reconcile to canonical ownership.

Control does not require troops to visit every square kilometre. Decisive components such as major cities, strategic installations and principal military positions can establish control; secondary infrastructure may be captured, destroyed or denied with material consequences without automatically being a prerequisite for Region control. For example, control of Québec City and Montréal could decide control of Québec without visiting every remote northern installation.

## Data, scenario time and licensing

Every real datum must retain publisher, URL, reference/retrieval date, licence, attribution and limitations. Preserve explicit `sourced`/`observed`, `derived`, `modelled`, `partial`, `unavailable` and justified `not_applicable` semantics. **Unavailable is not zero.** Do not invent observations or infer `not_applicable` from missing source coverage.

Initial factual data must apply on 2026-01-01. A later publication is admissible only when it explicitly documents a situation applicable on that date; never inject later events retroactively. A scenario may use later-retrieved revisions of earlier observations only with their actual reference dates and limitations preserved; it is not automatically a reconstruction of what was publicly known on the start date.

Code and data licensing are separate. Do not infer a dataset licence from the package or tool that transports it. Record ambiguous data licences as `requires_confirmation`; unresolved incompatible/unconfirmed data are a commercial-release blocker.

## Validated milestone contracts

These are locked architectural constraints. Read the linked subsystem docs before changing an affected system.

### 0.8–0.9: shared engine and permanent world

0.8 established the canonical state, shared scheduler/clock, deterministic keyed RNG, dirty domains, invariant registry, save architecture, UI/engine boundary and fidelity conservation. 0.9 audited world data and reproducible mappings without rewriting permanent identity or turning missing data into observations. Reuse these contracts; never create a parallel engine or identity system. See [engine-contract.md](engine-contract.md) and [data-audit.md](data-audit.md).

### 0.10: socioeconomic base

Existing population/cohorts are the only population source. Activity, employment, income and consumption are linked through the monthly causal economy. The model has explicit, often coarse priors and unavailable inputs; they are not observed national statistics. Do not add another GDP/population engine or a direct `GDP *= modifier` shortcut. Do not silently turn the residual demand closure into public spending, trade or investment. See [socioeconomy-0.10.md](socioeconomy-0.10.md).

### 0.11: fiscal and public services

The causal chain is legal rules -> liabilities -> collection -> known tax revenue -> other/baseline revenue -> total revenue -> budget execution -> transfers/services -> disposable income/public capacity -> debt/financing. Known statutory revenue, modelled aggregate/residual baseline and total revenue stay distinct. An unavailable tax rule is not a 0% law. The fixed baseline must not automatically recalibrate after reform and cancel it. Governance must use `scheduleFiscalReform(...)`, not mutate fiscal state directly. Counterfactuals must preserve unrelated non-tax flows. See [fiscal-0.11.md](fiscal-0.11.md).

### 0.12: material crises

The causal chain is material variables -> tripwires -> severity/persistence/pressure -> deterministic tipping -> active crisis -> causal recovery. A crisis monitors causes; it does not create them or directly penalize GDP/other crises. Cascades pass through material variables. Missing coverage stays unavailable rather than becoming zero performance. See [crisis-0.12.md](crisis-0.12.md).

### 0.13: institutions and opinion

National institutions, chambers, fictional gameplay parties/organizations and Region/cohort opinion are distinct from sourced reality. Real data may provide dated evidence, but party names, source identifiers/hashes and registry order must never invent ideology. Historical ideology is a historical prior, not automatically a 2026 observation. Unsupported dimensions remain neutral/modelled/unavailable with limitations. See [politics-0.13.md](politics-0.13.md).

### 0.14: person, office and political decisions

The player controls a persistent fictional person, not a Country. Party membership/leadership and public office are separate; state authority derives only from held office. Losing office preserves the person and is not automatically game over. Governance is event-driven and does not add a scheduler loop.

Fiscal proposals use the existing fiscal policy/budget types and reform mechanism. The lifecycle is draft -> submitted -> enacted/rejected/unavailable, with withdrawal where allowed. Submitted payloads are stable/fingerprinted. An enacted fiscal proposal must have exactly one valid enactment-ownership chain through `FiscalReform`; proposals that expire are unavailable, never retroactive. Never directly mutate fiscal state from governance.

Party support evaluates expected material consequences against party goals and current conditions, not an abstract policy label or direction. Agreement is continuous and magnitude-sensitive: benefit to goals minus undesirable trade-offs, ideological distance and compromise cost. A party may support a smaller change and oppose an overshoot in the same direction. Issue preferences keep `idealPointBps`, `importanceBps`, `compromiseToleranceBps` and `confidenceBps` separate; compromise tolerance is issue-specific. Severity changes actual material trade-offs/status-quo costs; it does not magically change ideals or tolerance. No absolute ideological veto is required.

Current vote conversion uses YES at agreement >= 6,000 with confidence >= 3,000; NO at agreement <= 4,000 with sufficient confidence; known middle-range evidence is ABSTAIN; insufficient evidence is UNKNOWN. **Unknown is not abstention**: unknown party seats reduce coverage and cannot silently reject. Likewise, public unknown is not neutral opinion.

Tax counterfactuals hold transfers and other non-tax flows constant unless the proposal changes them. Direct taxes affect disposable cash income; VAT/consumption tax must show purchasing-power burden rather than appear purely beneficial. No hidden future simulation predicts GDP, growth, inflation or unemployment.

Legacy schema-12 aggregate-only parliamentary results are real historical saves. Migration must not fabricate per-party evaluations; preserve meaningful aggregate yes/no evidence, conservatively mark ambiguous all-abstain rejection unavailable, and never undo enacted policy. Fiscal enactment ownership remains exactly-once. Modern `situational-0.14-v2` proposals still require full per-party, threshold and seat reconciliation. Do not weaken current invariants to accommodate legacy data. See [governance-0.14.md](governance-0.14.md).

## Known limits and technical debt

The current political data coverage is intentionally inadequate for many production decisions: 252 Countries and 281 chambers; 57 Countries have procedurally resolvable legislatures; 8 have sufficiently differentiated ideological evidence; their intersection is **zero**. Many outcomes must therefore remain unknown/unavailable. Do not fabricate 2026 party beliefs or loosen evidence rules to improve apparent coverage.

Other limits are documented in subsystem contracts and validation reports. Examples include incomplete legal tax coverage and modelled fiscal initial conditions; explicit socioeconomic priors and unavailable source baselines; historical rather than current ideological priors; and modelled constitutional procedure. Report these accurately. Do not turn a limitation into an implicit claim that the simulation is an empirically calibrated forecast.

## Locked future direction (not authorization to implement)

### Player interface and information: accepted 0.15 and original direction

0.15 is now accepted; its implemented scope is recorded in [the information contract](information-0.15.md). The following original interface direction remains context, not a claim that every planned action is implemented. Its direction is a playable information/interface layer while preserving Reality / Government Information / Public Perception separation. Planned navigation uses a left vertical set of major categories (for example, fiscality, economy, security, health, politics, diplomacy and military) with clickable subcategories (for example, security -> military, police, intelligence, justice and operations). Top-right shows date/time; bottom-right has time controls and nearby map filters such as economic, political, relations and logistics; a tablet/news entry point can surface information; Region context actions may be available by right-click (for example, Region information, construction or a state of emergency); and transient minister-style notifications should not permanently cover the screen. Only urgent/grave information should automatically pause gameplay; routine legislation should not constantly interrupt.

No arbitrary sliders for actual policy values: use explicit values (for example, corporate tax 30% -> 20%). Players may inspect reaction estimates where appropriate, but estimates are not authoritative policy outcomes. Planned action examples such as emergency declaration or construction are not implemented by this handoff.

### Military: 0.16+

Model material capability: personnel, salaries, equipment, vehicles, ammunition, training, maintenance, production and long-term technology/R&D. Avoid abstract military-power sliders. Later operations depend on real capabilities and logistics; war remains serious and causally motivated. This direction does not authorize implementation during 0.15 or documentation-only tasks.

### Diplomacy, conflict and trade

Conflict follows **persistent issues -> tensions/crisis -> escalation/de-escalation -> explicit use of force -> war**. Never infer automatic war from a relation-score threshold. Condemnation, sanctions and military intervention are distinct actions. Keep occupation, control and sovereignty separate.

Trade follows **production -> needs -> aggregate flows -> prices -> dependencies -> consequences**. Do not invent strategic dependencies before real flows exist. Tariffs/embargoes should have visible causal costs on both sides where appropriate.

## Locked roadmap

| Milestone | Planned scope |
| --- | --- |
| 0.15 | Information / ministers / playable interface |
| 0.16 | Military capability / readiness |
| 0.17 | World trade / strategic dependencies |
| 0.18 | International tensions / crises / sanctions |
| 0.19 | Military operations / war / territorial control |
| 0.20 | Treaties / multilateral framework V1 |
| 0.21 | Full coherence / long-duration validation V1 |

Do not renumber, combine or begin a later milestone without explicit design approval. Political actions remain future-scoped: parties may use sit-ins and general/national/capital demonstrations, unions may strike, and associations have no automatic strike power. Do not implement them early.

## Time and performance expectations

The logical tick is one day. Persistent events may transition over days through states such as announced -> gathering -> active -> declining -> ended. Ordinary gameplay does not require hourly simulation. Tentative pacing is x1 about 15 real seconds per game day, x2 about 7.5 seconds and x5 about 3 seconds; this is a gameplay target, not permission to compromise benchmark or causal correctness.

Prefer multi-cadence aggregates, differential work, copy-on-write and reused snapshots. Avoid unbounded history and repeated static data in entities/saves. Measure before optimizing.

## Required agent workflow

For each explicitly requested implementation milestone:

1. Read both agent instruction files, `README.md`, this handoff and affected subsystem contracts.
2. Inspect current validated code and confirm the requested scope.
3. Implement only that scope, reusing canonical systems; stop and ask about material ambiguity.
4. Add/strengthen invariants and meaningful success, failure and regression tests.
5. Address state schema, migration, save/reload, determinism and conservation for canonical-state changes.
6. Run relevant tests, affected data audits/benchmarks, and `npm run verify` when warranted. Search runtime for `Math.random` after runtime changes.
7. Inspect the full diff for scope, accidental source/data changes and behavior regressions.
8. Commit and push the requested milestone; report exact commit SHA, changed files, actual commands/results, assumptions, limitations, unavailable coverage, migrations and performance.
9. Stop. Do not begin the next milestone automatically.

Every milestone is reviewed separately against the actual GitHub diff/code; agent self-report is not proof of correctness. Do not broadly refactor validated systems.

## Accepted reference history

These commits are validated reference points, not a request to replay or redo them:

| Reference | Accepted commit |
| --- | --- |
| World-map foundation | `c3e25a6da2edee958acc4d26dad46a7342bcc196` |
| Local Natural Earth basemap | `28e738fad1fb6a2428938ec3b4cff612e634a00e` |
| Clock and world identity foundation | `83ce0143a1034a130268e4b7a4268b827185d43e` |
| Persistent entity identities | `2d73b1e1a49cef71ed20c5d30eb80b49b9fad893` |
| 0.2 authoritative entity registry | `0d977e1d37c3c74d1837ffd402408565edb62211` |
| 0.3 Admin-1 Region foundation | `a054919a751050a7562b6283aec23f878f217156` |
| 0.3.1 Region identity/source decoupling | `490d7d9161237009bc2e8c2997c99ae9acb70f31` |
| 0.7 war-state timeline validation | `1f87e311ad6319bc90f349c7b085802fa4e096d4` |
| 0.8 corrective engine contracts | `10ba1d9c51f55abc88c90f98569c10f12da7c28f` |
| 0.9 data audit | `89d8fc0cb192e4b928b8b21af3dfc1f24534263a` |
| 0.10 corrective snapshot/reference boundary | `beef851da7766e596a668ab4140fb9eb221d45eb` |
| 0.11 fiscal baseline correction | `98848694df891d75e1eda6f01747b8a572dbb96a` |
| 0.12 unavailable-crisis handling correction | `e2f8a5d1b317876c7fad0b59bb95128e45abaab9` |
| 0.13 accepted politics correction | `3c58305dc795fce5f66a2f65aa03c3139cf1e17b` |
| Persistent agent instructions introduced | `26f5d955fba96f4455293f50cbcf44efaaaf389f` |
| 0.14 final validated base | `c8bcb0841f6a75887b2ca520eca88496331aa1fd` |
