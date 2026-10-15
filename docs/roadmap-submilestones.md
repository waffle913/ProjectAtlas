# ProjectAtlas sub-milestone roadmap

This document is the detailed planning reference for ProjectAtlas. It complements the [canonical agent handoff](agent-handoff.md) and the per-domain technical contracts; it does not replace them, and it does not authorize implementation on its own.

## How to read this document

- **Historical milestones are not re-cut retroactively.** 0.1–0.21 keep their original numbering and scope. They are preserved here as context, not as tasks to redo.
- **New large milestones are split into small units.** 0.24, 0.25 and the approved 0.26–0.34 are decomposed into sub-milestones and micro-blocks to reduce the surface of each change and the cost of corrective loops.
- **Presence in this roadmap is not authorization to implement.** Each main milestone still requires explicit user authorization, and no next main milestone starts automatically. Accepting or completing a main milestone never authorizes the next one: the Autopilot persists `AWAITING_NEXT_MILESTONE_AUTHORIZATION` and stops until a human explicitly authorizes the next milestone (see `docs/autopilot-protocol.md` Part D).
- **Execution method.** How a Roadmap Goal builds this roadmap autonomously (authorization boundary, Planner/Executor/Reviewer roles, GitHub-CI gate, Safe Zones, repair loop breaker, Cryo Mode) is defined by the [Autopilot protocol](autopilot-protocol.md), not by this document.
- Keep these statuses distinct — an agent's declaration, a commit actually present, a green CI run, an independent review, and user acceptance are five different things:

| Status | Meaning |
| --- | --- |
| `planned` | Direction recorded; not authorized or implemented. |
| `implemented on branch` | Code exists on a named branch; no acceptance implied. |
| `pending independent review` | Implemented and awaiting review; not accepted. |
| `validated` | Passed the technical/independent review gate. |
| `accepted` | Explicitly accepted by the user; the acceptance boundary. |

Never write `final`, `last`, `validated` or `accepted` without repository evidence or an explicit user decision.

## Observed status (at the time of writing)

The snapshot below is historical and is not the authoritative current status. The
authoritative acceptance/sealing state lives in
`.reasonix/projectatlas-autopilot-state.json` and in the actual Git/GitHub
evidence (see `docs/autopilot-protocol.md` Part D §51). As of the schema-v3
hardening, 0.24 is accepted and sealed at runtime SHA `6b6794e`; 0.25 is not
authorized.

**2026-10-15 update — approved post-0.25 roadmap.** The human officially
approved the roadmap proposal `ProjectAtlas_Roadmap_0.26-0.34_PROPOSITION.md`
and directed its integration here. Versions **0.26–0.34** are now planned,
numbered and decomposed (see below). This is a **documentation/planning**
decision only: it is **not** an authorization to implement any of 0.26–0.34,
**not** an acceptance of any milestone, and it does **not** advance the Safe
Zone. 0.25 remains in `FINAL_VERIFICATION_REVIEW` awaiting human acceptance
(not accepted); the Safe Zone stays at 0.24. Implementation authorization,
per-milestone acceptance and Safe-Zone advancement remain separate decisions
under `docs/autopilot-protocol.md`.


- `main` — `75cb45d` — the V1 core (0.8–0.21) plus the accepted 0.15 foundation, and these planning documents.
- `waffle913-policy-framework-022` — 0.22 implemented for independent review, **not accepted** (schema 18).
- `waffle913-constitution-institutions-elections-023` — 0.23 implemented for independent review, **not accepted** (schema 19); `8951d46` after the corrective passes.
- `waffle913-construction-assets-024` — 0.24 decomposition; 0.24.1A implemented, **not accepted** (`103a6a4`).
- 0.25 — `planned` only; no implementation branch observed.

The accepted implementation boundary remains the V1 core (0.8–0.21) with the accepted 0.15 foundation. 0.22, 0.23 and 0.24 live on their own branches pending independent review; their contracts (e.g. `docs/policy-framework-0.22.md`, `docs/constitution-institutions-0.23.md`, `docs/elections-0.23.md`, `docs/organizations-0.23.md`) are carried on those branches, not on `main`.

---

## Historical roadmap (preserved, not re-cut)

### 0.1–0.7
Historical project foundations.

### 0.8 — Engine foundation
Canonical `SimulationState`; shared scheduler; logical tick; deterministic RNG; saves; invariants; dirty domains; Detailed / Standard / Background modes; UI/engine separation; performance.

### 0.9 — World registry / provenance
Countries; Regions; permanent identities; dated data; provenance; explicit coverage; reproducibility.

### 0.10 — Population / base economy
Regional population; cohorts; activity; employment; income; consumption; aggregate economy.

### 0.11 — Fiscal / budget / services
Fiscal rules; brackets; VAT; contributions; revenue; spending; transfers; debt; services.

### 0.12 — Material crisis engine
Tripwires; severity; persistence; pressure; deterministic tipping; active crisis; causal recovery.

### 0.13 — Politics / parties / organisations / opinion
Institutions; fictional parties; unions; associations; Region/cohort opinion; honest ideological coverage.

### 0.14 — Playable person / governance
Persistent playable person; offices; party membership; proposals; votes; political fiscal reform; situational institutional interest; internal party plurality.

### 0.15 — Government Information / ministers / initial interface
Government information; briefings; ministers/advisors; Reality ≠ Information ≠ Perception; fictional leaders; succession; first playable interface.

### 0.16 — Military capability
Personnel; training; equipment; vehicles; ammunition; maintenance; salaries; production; readiness/availability.

### 0.17 — World trade / strategic dependencies
Physical flows; financial flows; prices; stocks; imports/exports; customs duties; strategic dependencies.

### 0.18 — International tensions / crises / sanctions
Tensions; crises; condemnations; sanctions; reciprocal material effects.

### 0.19 — Military operations / war / territorial control
Deployments; supply; combat; losses; occupation; control; limited territorial settlements.

### 0.20 — Treaties / multilateral V1
Proposals; signatures; ratification; clauses; obligations; violations; international organisations; multilateral decisions.

### 0.21 — Full coherence / long-duration validation V1
V1 integration; endurance; long simulations; save/reload; stress; performance; cross-domain coherence.

These numbers are not changed.

---

## Post-0.21 roadmap (decided)

### 0.22 — Generic decisions / laws / policy framework

A generic political-instrument framework. In particular: `ProposalKind`, `ProposalInstrumentClass`, `ProposalEffect`; decision, regulation, law, amendment; dated effects; exactly-once application; integration with the existing systems. **No second political engine.**

The consolidated playable shell built around this period is documented at its own location (`docs/playable-shell-v1.md` on the branch that carries it); the future UI redesign must not be presented as functionally belonging to the 0.22 engine. Check its real state before writing `accepted`/`validated`.

### 0.23 — Constitution / institutions / elections / organisations

Decided scope: constitutions; institutions; chambers; seats; voting rights; procedures; constitutional amendments; principal/secondary amendments where the contract provides them; binding with the material keys actually affected; thresholds; constitutional review before/after depending on the system; dissolution according to the Constitution (which may trigger a new election); dynamic elections; per-chamber elections where relevant; coalitions; government formation; temporary/permanent institutional succession consistent with the regime and the existing contract; state of emergency; organisations; parties; unions; associations; religious organisations when represented; collective actions; internal currents; resources/funds.

**State of emergency.** It must not become a button granting magic powers. It must be linked to the institutions, to legal powers, to a real justification, to an active crisis when the contract requires it, and to a duration / expiry of the justification.

**Organisations.** Preserve the difference in nature and power between party, union, association and other organisation; never transfer one family's powers to another automatically. A union may strike. An association does not automatically gain a strike power.

**Do not claim out-of-scope mechanisms are implemented.** If the current contract still excludes, for example, a specific form of real referendum, direct election, or real religious support, preserve that limit until a later version covers it. The exact state comes from the repository, not from this roadmap.

### 0.24 — Construction & material assets

The earlier eight-block cut is replaced, for future development, by the finer decomposition below. The main milestone remains **0.24**; the internal units reduce the surface of each change and the cost of corrections.

#### 0.24.1 — Canonical assets
- **0.24.1A — Identities and types**: permanent identifier; asset type; Region; usage; strictly necessary categories; stable references.
- **0.24.1B — Physical state**: state; capacity; availability; operating status; physical condition when provided.
- **0.24.1C — Canonical-state integration**: one canonical state owner; serialization; invariants; no parallel store; determinism; permanent Region references.

No complete construction yet at this stage.

#### 0.24.2 — Construction projects
- **0.24.2A — Project model**: distinguish clearly the project/site from the finished asset.
- **0.24.2B — Creation and lifecycle**: coherent states such as `planned`, `active`, `paused`, `completed`, `cancelled`, per the contract actually retained.
- **0.24.2C — Authority**: verify who can actually propose, authorize, fund, cancel. Powers come from the 0.23 offices/institutions; no automatic national command just because the player exists.

#### 0.24.3 — Financing
- **0.24.3A — Costs**: explicit costs; units; estimate/commitment kept distinct where needed.
- **0.24.3B — Treasury / commitment**: real financing; committed budget not reusable; use of the existing fiscal engine; no free money.
- **0.24.3C — Refusal / cancellation**: insufficient funding; insufficient authority; cancellation; coherent financial treatment.

Never finance a site merely because a UI command was created.

#### 0.24.4 — Work and progression
- **0.24.4A — Work**: labour need; availability; reservation; interaction with existing employment/population. No worker employed twice.
- **0.24.4B — Scheduler**: construction uses the common scheduler. No parallel timer.
- **0.24.4C — Progression**: progression really depends on the required resources. No instant construction.
- **0.24.4D — Pause / shortage**: a site must be able to slow down, stop, and resume, according to labour, funding and resources.

#### 0.24.5 — Inputs
- **0.24.5A — Needs**: define the physical inputs actually required.
- **0.24.5B — Reservation**: reserve resources to avoid reusing them elsewhere.
- **0.24.5C — Consumption**: progression actually consumes the corresponding quantities.
- **0.24.5D — Shortages / imports**: missing inputs → slowdown/stop; imports through the existing trade engine when needed; no automatic creation of materials.

#### 0.24.6 — Completion and capacity
- **0.24.6A — Completion**: explicit criteria.
- **0.24.6B — Project → asset**: transformation exactly once; no duplication of the project and the finished asset.
- **0.24.6C — Capacity**: the finished asset provides physical capacity usable by consumer systems. Prefer `asset → capacity → real process → effects`; never `GDP *= 1.10`.
- **0.24.6D — Maintenance**: costs; resources; availability; wear when provided.

#### 0.24.7 — Breakdowns and repairs
- **0.24.7A — Breakdown / unavailability**: capacity may become partially or totally unavailable per the decided mechanisms.
- **0.24.7B — Repair**: a repair costs, takes time, uses the existing systems, and does not restore the asset magically.

#### 0.24.8 — Territory / war / assets
- **0.24.8A — Territorial control**: the asset identity stays tied to its permanent Region.
- **0.24.8B — Exploitation**: the ability to exploit the asset depends on real control, the military situation and the applicable rules.
- **0.24.8C — Damage**: a military operation may produce physical damage when the corresponding systems allow it.
- **0.24.8D — Repair**: damage does not disappear automatically at the end of a war.

Preserve absolutely: **sovereignty ≠ occupation ≠ effective control**.

#### 0.24.9 — Data and migrations
- **0.24.9A — Migrations**: migrate at the save's real date; never replay history from 2026; never reset economy, population, control or occupation.
- **0.24.9B — Real data**: use real capacities only when compatible sources exist.
- **0.24.9C — Coverage**: use explicitly `sourced`, `derived`, `modelled`, `partial`, `unavailable`, and justified `not_applicable`. **`unavailable != 0`.**
- **0.24.9D — Provenance**: keep source, date, licence, limits, attribution. Do not fabricate the world industrial heritage for 2026-01-01 artificially.

#### 0.24.10 — Consultation and commands
- **0.24.10A — Queries**: read state through clean engine interfaces.
- **0.24.10B — Commands**: commands pass through the engine and check authority, resources, and institutional situation. The UI never mutates canonical state directly.
- **0.24.10C — Government Information**: the player knows only what their office and government can actually know. Reality ≠ Government Information.
- **0.24.10D — Debug / provenance**: technical/provenance information may exist for diagnostics but must not invade the normal UI.

#### 0.24.11 — Integration / acceptance
At the end of the milestone, run the integrated campaigns: budget → project → site; work + inputs → progression; completion → asset; asset → capacity; maintenance; shortage → pause → resume; occupation/control; damage → repair; save/reload at several stages; Detailed / Standard / Background; a world with many assets. Verify determinism, conservation, performance, old saves, Ubuntu/Windows CI, invariants. Then perform **one complete independent review of the whole 0.24 milestone** and correct in one consolidated submission as many already-detectable defects as reasonably possible.

**No 0.25 before explicit acceptance of 0.24.**

### 0.25 — Economy V2

0.25 enriches the existing economic engine. It never creates a second parallel economy.

#### 0.25.1 — Contracts and units of account
Inventory: population; production; income; consumption; fiscal; trade; stocks; assets; employment. Determine the canonical owner of each variable. Define goods; services; sectors/activities; prices; physical units; monetary units; provenance. No duplication of GDP, income, population, stock or ownership.

#### 0.25.2 — Activities and productive capacities
Causal production from labour, capital/capacity, 0.24 assets, inputs, productivity. No material output without the corresponding real constraints.

#### 0.25.3 — Stocks / supply / shortages
Entries; exits; stocks; aggregated owners; losses/expiry only if provided; shortages; substitution/rationing if decided; production stops. No negative stock. `unavailable` never means a null stock.

#### 0.25.4 — Employment / wages / income
Connect productive activities, labour demand, active cohorts, employment, unemployment, wages, income, fiscal, consumption. Preserve military reservations, strikes, and the single canonical population.

#### 0.25.5 — Household needs and spending
Aggregate demand from disposable income, prices, needs, preferences, economic situation. Essentials/discretionary per design. Shortages produce material/social consequences, not an arbitrary penalty.

#### 0.25.6 — Firms / activity / investment
Aggregated representation, not millions of individual firms. Optionally revenues, costs, margins, financing, risk, investment. An investment consumes resources and uses 0.24 assets/construction; it is never free. Competition/concentration/monopolies are deepened only when their design is explicitly framed.

#### 0.25.7 — Prices and domestic markets
Causal prices from supply, demand, costs, shortages, delays. Distinguish observed, derived and modelled prices. Avoid absurd numerical oscillations.

#### 0.25.8 — International trade
Extend 0.17; never replace it with a second trade engine. Connect production, stocks, needs, imports, exports, payments, prices, tariffs, sanctions, dependencies. Exports are a destination of already-counted production; they do not create a second GDP.

#### 0.25.9 — Budget / fiscal / public services
Extend 0.11. Economic transactions produce the corresponding tax liabilities when legal rules are available. Preserve legal rules, observed revenue, modelled revenue, other revenue, spending, debt. No double fiscal counting.

#### 0.25.10 — Cross-system loops
Test construction → employment → income → consumption → taxes; crisis → shortage → price → opinion; war/sanctions → logistics → stocks → production → military capacity; fiscal reform → disposable income → economic behavior → real consequences. No magic cross-cutting modifier.

#### 0.25.11 — Data / migrations / restitution
Sources; units; dates; coverage; migration; saves; Government Information; Public Perception; institutionally authorized commands. The interface must never present a modelled datum as a real observation.

#### 0.25.12 — Performance / general review
Complete world; sectors; stocks; trade; multi-cadence; long simulations; fidelity changes; determinism; migrations; performance. Then a complete independent audit of 0.25. No next main milestone automatically.

---

## Post-0.25 — approved roadmap 0.26–0.34 (planned, not implementation-authorized)

On 2026-10-15 the human officially approved the proposal `ProjectAtlas_Roadmap_0.26-0.34_PROPOSITION.md` and directed its integration into this canonical roadmap. The versions below are now **planned direction** — numbered and decomposed — but this approval is **not** an authorization to implement, **not** an acceptance of any milestone, and does **not** advance the Safe Zone. Implementation authorization, per-milestone acceptance and Safe-Zone advancement remain separate decisions under `docs/autopilot-protocol.md`. Do not invent versions beyond 0.34.

### Ordering and dependencies

| Version | Proposed title | Main dependency | Expected exit criterion |
|---|---|---|---|
| **0.26** | Finance, banking, credit and money | 0.25 economy/fiscal/trade | Conserved financial balances, coherent payments and credit |
| **0.27** | Resources, extraction, energy and networks | 0.24 assets + 0.25 stocks/production + 0.26 finance | Causal energy/material flows, localized without invented geology |
| **0.28** | Deeper industry, goods/services, research and technology | 0.25 activities + 0.27 energy + 0.26 finance | Verifiable input chains, R&D, diffusion and capacities |
| **0.29** | Health, housing, education, social protection and public services V2 | 0.25 budget/households + 0.24 assets + 0.28 sectors | Services bounded by personnel, equipment, budget, access |
| **0.30** | Demography/migration V2, police, justice and intelligence | 0.23 institutions + 0.29 health + 0.25 employment | Cohorts without duplication, security/justice powers legally bounded |
| **0.31** | Diplomacy, strategic trade and military capability/operations V2 | 0.17–0.20 + 0.25–0.30 | Causal crises, negotiations, logistics and military production |
| **0.32** | Media, political communication, perception and advanced government AI | 0.13–0.15, 0.23, 0.29–0.31 | Competent but non-omniscient governments, contextualized actors |
| **0.33** | Final interface, playability and cross-cutting integration | Preceding modules | Playable actions and understandable consequences, no fake screens |
| **0.34** | World historical data, calibration, final audit and human validation V2 | 0.26–0.33 + the Work campaign | Explicit fidelity/coverage balance, validated scenarios and known limits |

> The order sometimes groups two adjacent backlog families to fit nine versions. It must not translate into mass changes: **each sub-milestone is itself split into A/B/C micro-blocks when state surface, migrations or dependencies justify it.**

### 0.26 — Finance, banking, credit and money

**Goal:** enrich the 0.25 economy without minting liquidity or short-circuiting the fiscal system. **Mandatory prior arbitration:** contract 0.25.1 uses whole USD as the canonical unit of account; national currencies, exchange rates or a deposit-creating banking system require an explicit design that keeps USD accounting without a second world register.

- **0.26.1 — Monetary contract and open decisions.** Inventory treasuries, revenues, receivables, obligations, payments, prices and existing debt. Decide explicitly whether national currency/FX, commercial banks and credit-created money are in scope; without a decision, `BLOCKED_DESIGN` on the dependent branches, but not on the independent parts.
- **0.26.2 — Aggregated financial actors.** Define canonical ownership of banks/counterparties and their commitments; individual accounts only if necessary — no simulation of millions of accounts.
- **0.26.3 — Payments and settlement.** Orders, counterparties, fund availability, atomic transfer, no double spending, refused transactions and balance conservation.
- **0.26.4 — Loans, bonds and schedules.** Principal, corresponding debt, interest, maturities, repayment, restructuring if retained; no money without a matching asset/liability.
- **0.26.5 — Liquidity, funding and rates.** Availability, cost of capital, refinancing, firm and State needs, institutional functioning; distinguish observed rates from modelled rates.
- **0.26.6 — Default and solvency.** Inability to pay, losses, encumbered assets, consequences on investment and spending; no magical banking crisis.
- **0.26.7 — Public treasury and credit.** Link to 0.11 and 0.25.9; debt, debt service, bonds, budget flows, prohibition of double fiscal entries.
- **0.26.8 — Exchange rates / FX (conditional on 0.26.1).** Conversions, display unit vs canonical unit, conservation at documented precision; no fictional FX market imposed without a decision.
- **0.26.9 — Tests, migrations, performance and review.** Balanced balances; counterparties; save/reload; default; refusal; government-information API; Ubuntu/Windows CI.

### 0.27 — Resources, extraction, energy and networks

**Goal:** production comes from a place, an exploitable resource and installations — **not a bonus attributed to the country**. This milestone extends 0.24 assets, 0.25 production and 0.17 trade; it redraws no Region.

- **0.27.1 — Matter/energy taxonomy and contract.** Resources, fuels, refined products, electricity and capacities, physical units convertible only with justified factors; distinct scopes for reserves/deposits/production/stock.
- **0.27.2 — Territorial anchoring and geographic evidence.** Resource and installation tied to a permanent Region, geometry/source and precision/uncertainty; intra-regional positions only if sufficiently documented. Choice of a grid, points or extractable polygons = **a distinct design decision**; do not turn the presence of a geological basin into point-by-point exploitable density.
- **0.27.3 — Extraction and installations.** Mines, wells, quarries per material capacity, personnel, inputs, maintenance and status; ownership/exploitation/control distinct.
- **0.27.4 — Refining and primary transformation.** Inputs → products/by-products/residues, verified losses, costs, installation saturation, no net creation of matter.
- **0.27.5 — Energy production.** Plants, fuels, energy conversion, dependence on water/other inputs if documented, maintenance and intermittency if applicable.
- **0.27.6 — Networks and accessibility.** Energy transport, connections, capacities, bottlenecks, unavailability; localized effects on industry, households and armies.
- **0.27.7 — Stocks and physical trade.** Links to 0.25.3 stocks and 0.17/0.25.8 trade; effective imports, shortages, substitution only if modelled and authorized.
- **0.27.8 — War, sovereignty, damage.** Effective control, occupation, exploitation, sanctions, damage/repairs without automatic transfer of sovereignty.
- **0.27.9 — Validation.** Energy/matter conservation, no extraction without capacity, admissible localization, save/reload, geographic granularity and world performance.

**Awaiting decision and outside the default authorized scope:** detailed agriculture model, climates, deforestation, emissions, environmental effects, fine spatial grid of thousands of cells. Their interest is recognized; their rules are not yet locked by this roadmap.

### 0.28 — Deeper industry, goods/services, research and technology

**Goal:** turn the aggregated economic base into enriched productive chains with causal innovation, without duplicating 0.25 or promising detailed product data where no admissible source exists.

- **0.28.1 — Product, sector and nomenclature contracts.** Correspondence layer between economic categories, products, activities, installations and documentary classifications (without abusively equating ISIC/NACE/HS/CPC/PRODCOM).
- **0.28.2 — Transformation chains.** Industrial production from capacities, equipment, materials, energy, personnel and time; verifiable batches/ratios, distinct products and by-products.
- **0.28.3 — Capacities and bottlenecks.** Productivity, time, maintenance, supplies, technical constraints, under-utilization and expansion through 0.24 construction.
- **0.28.4 — Service sectors.** Activity actually delivered, personnel/capacity, purchases, cost, revenue, availability; do not turn a service into an arbitrary material stock.
- **0.28.5 — Research projects.** Subject, schedule, spending, researchers, equipment and documented/modelled risk; no instant discovery caused by a budget.
- **0.28.6 — Diffusion and adoption.** Training, investment, equipment replacement, learning time, supply constraints; effect on material processes, not a global GDP bonus.
- **0.28.7 — Military/civilian technology.** Prudent link to equipment, production and capacity 0.16/0.24/0.25, without encroaching on 0.31 operations.
- **0.28.8 — Firms/market structures (conditional).** Detailed competition, concentration or monopoly mechanisms only if market rules and antitrust powers are explicitly validated; otherwise keep in the unnumbered backlog.
- **0.28.9 — Validation.** Input and value conservation, inter-sector cycles, dated science, testable synthetic economies and partially sourced cases.

### 0.29 — Health, housing, education, social protection and public services V2

**Goal:** public services are no longer only a spend, but capacities effectively available and accessible, dependent on professionals, infrastructure, supplies and the legal framework.

- **0.29.1 — Service/capacity/access contract.** Attach budget, assets, personnel, territories, rights and cohorts to existing systems; no second budget or population.
- **0.29.2 — Health and establishments.** Personnel, beds or capacities only if sourced/admissible, aggregated care flows, needs, queues/delays, 0.24 establishments; outcome distinct from mere spending.
- **0.29.3 — Medicines, consumables, energy, maintenance.** Physical needs, purchases, availability, imports and supply ruptures.
- **0.29.4 — Education and training.** Establishments, personnel, capacities, access, aggregated pathways, cost and temporal effects on skills and labour.
- **0.29.5 — Housing.** Existing supply, construction, availability/quality, household access and mobility, maintenance costs; **rent rules only after an explicit decision**.
- **0.29.6 — Pensions and benefits.** Legal eligibility, payments, resources, controls per law, fiscal/disposable-income integration; neither infinite automatic benefits nor invented exclusions.
- **0.29.7 — Civil transport/infrastructure.** Services from assets, maintenance and capacity, dependence on personnel/energy; do not rebuild 0.24.
- **0.29.8 — Public policy and reactions.** A law/budget creates real capacities within institutional limits; indirect health/labour/opinion effects with causality and incomplete information.
- **0.29.9 — Validation.** Executed budget vs service actually delivered, regional variability, asset ageing, rights, migrations and documentary coverage.

### 0.30 — Demography/migration V2, police, justice and intelligence

**Reason for the grouping:** with nine milestones available, population and internal-security mechanisms share identity, rights, institutions and information constraints. They must remain **two distinct technical sub-campaigns**, never one single big change.

- **0.30.1 — Cohort and transition contracts.** Reuse the single 0.10 population; age/statuses/services/people in cohorts without millions of entities; define observed and modelled populations separately.
- **0.30.2 — Births, deaths and internal movements.** Dated, conserved demographic transitions, correlated with material conditions when supported; no magical population change.
- **0.30.3 — International migration.** Entries, exits, departures, reception and net flows without double counting across countries/Regions; migration ≠ sovereignty change.
- **0.30.4 — Legal statuses and integration.** Residence/work/family/rights/service per explicitly documented law; social integration as a contextualized mechanism, never an arbitrary cultural-conformity gauge.
- **0.30.5 — Police.** Personnel, stations, budgets, legal orders, availability, procedures, limits; power only if the office/institution holds it.
- **0.30.6 — Justice and guarantees.** Aggregated cases/workloads, evidence, procedure, jurisdictions, delays, judicial review, rights and remedies; no automatic conviction from a bare score.
- **0.30.7 — Intelligence.** Capabilities, means, partial information, possible errors, authorized collection, guarantees and controls; distinguish secret facts / accessible information / perception, without omniscience.
- **0.30.8 — Security, events and consequences.** Law enforcement, crises, demonstrations, rights violations and contextualized social/international reactions; no "repression bonus".
- **0.30.9 — Interconnections.** Population↔employment↔services↔budget; police/justice↔institutions↔opinion; demography and migration at every needed cadence, without a concurrent loop.
- **0.30.10 — Validation.** Demographic conservations, status errors, refused procedures, constitutional protections, saves, performance.

### 0.31 — Diplomacy / strategic trade and military V2

**Goal:** deepen 0.17–0.20 and 0.16/0.19 by linking negotiations and conflicts to the real resources of systems 0.26–0.30.

- **0.31.1 — Actor and commitment contract.** Actors/mandates, relations, disputes, decisions, clauses and obligations; no second treaty system.
- **0.31.2 — Negotiations, concessions and guarantees.** Proposals, counterparts, credibility, conditional commitments and deadlines; no automatic agreement because a relation crosses a threshold.
- **0.31.3 — Sanctions, embargoes and dependencies.** Trade/financial controls, materials, circumvention only if modelled, reciprocal costs, distinct sanctions/condemnation/embargo/intervention.
- **0.31.4 — Multilateral diplomacy and de-escalation.** 0.20 bodies, commitments, mediation, concrete measures, crisis exit, non-omniscient information.
- **0.31.5 — Military support chain.** Fuels, ammunition, parts, maintenance, stocks, transport, purchase contracts, personnel and time; military products from 0.28 activities.
- **0.31.6 — Military industry and acquisition.** Orders, financing, delays, factory capacity, training, equipment limits; no instant unit/strength.
- **0.31.7 — Training, availability and command.** Preparation, losses and reconstitution, authority constraints; no second military-power table.
- **0.31.8 — Operations and territorial control.** Extend 0.19 without annexation by pixel movement: control/occupation/sovereignty distinct, logistics, strategic terrain, asset damage and consequences.
- **0.31.9 — Crises, peace and security.** Wars follow disputes → tensions/crises → decision to use force; truce/peace/guarantees, regional control and respect for law.
- **0.31.10 — Information, authorities and costs.** Leaders know what their services know, pay the cost of orders, bear domestic/international consequences.
- **0.31.11 — Validation.** Multi-country chains and long simulations, sanctions on both sides, attrition and material capacity, contradictory treaties, controls and migrations.

### 0.32 — Media, political communication, perception and advanced government AI

**Goal:** competent actors and governments, situated within their constraints and information; no omniscient agent and no AI designed to artificially oppose the player.

- **0.32.1 — Information contract.** Reality, government information, public perception, sources, propagation, credibility, uncertainty and history; no automatic access to hidden state.
- **0.32.2 — Media and information channels.** Contextual coverage and diffusion, resources, aggregated audience, schedule and sources; do not create information from an interface.
- **0.32.3 — Statements and political communication.** People, parties, unions/associations, communiqués, reactions per interests and credibility; a statement is not directly a law.
- **0.32.4 — Disinformation/censorship (conditional on the decided legal framework).** Authorities and means, real access to information, effects/risks, guarantees and reactions, without a free social-control bonus.
- **0.32.5 — Opinion and mobilization.** Coherent change in population/cohorts/Regions, non-monolithic parties, opposition vs majority, real capacity to act.
- **0.32.6 — Government-objective model.** Ideology, mandate, coalition, institutional constraints, resources and situational memory; do not duplicate player power or government.
- **0.32.7 — Political action selection.** Deterministic comparison of choices and costs; proposals and votes through 0.22/0.23; uncertainty cases and the choice not to act.
- **0.32.8 — Economic and social decisions.** AI governments use finances, resources, employment, services and available information; behaviors compatible with their capacities.
- **0.32.9 — Diplomacy / crises / opposition.** Graduated responses to disputes, negotiations, institutions, war, opinion, parliamentary opposition; no reaction fixed by "what the player does".
- **0.32.10 — Validation.** Contradictory scenarios, rational but imperfect adversaries, global computational cost, emergent behaviors, consultable explanations without revealing secrets.

### 0.33 — Final interface, playability and cross-cutting integration

**Goal:** make the preceding systems accessible without betraying their real state. **Follow the latest version of the roadmap, not old mockups:** central map; left rail of advisors/actors/notifications (not a large menu); domain bar at the bottom; context/Tablet at the right; time at the bottom-right.

- **0.33.1 — Interface/state contract.** Available vs unavailable information, public read vs authorized command, simulation state vs UI state; no direct mutation by the interface.
- **0.33.2 — Map and layers.** Priority map, permanent Regions, economy, politics, resources, trade and logistics layers, visual precision compatible with sourced data.
- **0.33.3 — Domain bar and navigation.** Politics/economy/finances/services/security/defence/diplomacy/trade domains; function → workspace → tabs; avoid debug screens disguised as gameplay.
- **0.33.4 — Left rail.** Advisors/actors/notifications, normal/hover/selected/urgency states and proportionate interruptions.
- **0.33.5 — Right context and Tablet.** Region/actor selection, public news, private briefings, messages, statements and history, Information/Perception compartmentalization.
- **0.33.6 — Commands and powers.** A person's action per office, majority/opposition, chamber, Constitution and resources; explicit value (no arbitrary slider), explained refusal.
- **0.33.7 — Decisions and consequences.** Understandable explanations and uncertainty; provenance indicators on demand without overloading the interface; causal and deferred consequences.
- **0.33.8 — Time and alerts.** Date and time, measured speeds, cadences, timezones/localizations only if resolved, no mandatory general hourly simulation; only grave events may pause.
- **0.33.9 — Gameplay paths.** Governing, opposition, succession, crisis, war, budget management, consultation without authority, save/load, tutorial/accessibility per proven needs.
- **0.33.10 — Creative / professional sandbox mode (PROPOSAL TO VALIDATE).** An isolated test layer allowing a domain's hypotheses to be modified without falsifying history or contaminating the canonical campaign could help future experts; do not implement without a user decision.
- **0.33.11 — UX review and cross-cutting audit.** Test interactions between UI and action contracts, map performance, reports, no lying screens, desktop compatibility.

### 0.34 — World historical data, calibration, final audit and human validation V2

**Goal:** apply and control at scale the documentation collected by Work and the targeted campaigns, measure coverage and submit a playable simulation to human and professional tests. **This milestone is not a promise that all world data exists, nor permission to ship an unvalidated game.**

- **0.34.1 — Admission contract freeze.** Inventory of every variable actually consumed by systems 0.24–0.33, owner, unit, historical horizon, Country/Region/installation level, constraints and admission status; compare to the DataVault.
- **0.34.2 — Documentary recovery and de-duplication.** Load only complete verified checkpoints (fingerprints, licences, sources, series and codebooks); Work/Reasonix reconciliation, no already-completed extraction redone by default.
- **0.34.3 — Correspondences and units.** Permanent Country/Region identities, sector/product nomenclatures, national/regional/spatial data, prices/quantities/value, currencies and fiscal years without fictional correspondence.
- **0.34.4 — Temporal and legal admissibility.** Situation applicable on 2026-01-01, distinct publication/revision date, commercial licences, provenance, attribution, limits. Unresolved incompatibility → explicit exclusion, not silent replacement.
- **0.34.5 — Historical bootstrap and data migrator.** Feed systems from admissible records; zero vs missing; partial cases; no universal fictional filling; do not rewrite advanced saves to an earlier date.
- **0.34.6 — Calibration by dimension.** Coherence of physical stocks/balances, trade/production/consumption, financial/fiscal accounting, jobs/wages, energy, health, demography, defence, diplomacy and opinion; `modelled` parameters explicitly identified, without magically adjusting results to hit a target.
- **0.34.7 — Graduated coverage.** Matrices for 252 entities and Regions: `observed / sourced / derived / modelled / partial / unavailable / not_applicable`; coverage rate **per critical mechanism** (not just raw observation count), census of actually exploitable countries/scenarios.
- **0.34.8 — Economic and causal validation.** Shock scenarios, fiscal, shortages, wars, sanctions, health/social crises, migrations and investments; counterfactuals, limits, sensitivities, causality and long-term stability.
- **0.34.9 — Human/professional validation.** Reproducible protocols and scenario sets for economists, diplomats, military/legal specialists, then players. Experts evaluate their own domain without other domains wrongly presenting themselves as factually complete; isolated sandbox mode if and only if approved.
- **0.34.10 — Performance, migrations and saves.** Whole world, long scenarios, several speeds/modes, CPU/RAM, determinism and conservation, migration of old saves at their real date, Ubuntu/Windows tests and UI feedback.
- **0.34.11 — Licences and distribution preparation.** Code and datasets verified separately, commercial/attribution terms, compliance and inaccessible sources; identify Steam/distribution obstacles without promising a commercial release.
- **0.34.12 — Consolidated independent audit and decision.** An as-exhaustive-as-possible campaign, certain bugs / probable risks / optional improvements; targeted and bounded corrections; final CI; honest coverage report, observed accuracies, non-admissible domain, expert tests and recommendations. `0.34 validated` is not `0.34 accepted`, and `0.34 accepted` does not automatically mean "finished game".

### Fidelity matrix to the former post-0.25 backlog

No direction is lost; each former unnumbered direction maps to a numbered version or stays explicitly conditional:

| Former backlog direction | Proposed destination |
|---|---|
| Currency / banks / credit / finance | **0.26** |
| Energy and resources | **0.27** |
| Research / technology / innovation | **0.28** |
| Health / housing / public services V2 | **0.29** |
| Police / justice / intelligence | **0.30** |
| Immigration / demography V2 | **0.30** |
| Diplomacy V2 / deeper trade | **0.31** |
| Military V2 | **0.31** |
| Deep products/services economy | **0.28** |
| Media / information / opinion | **0.32** |
| Final interface / ergonomics | **0.33** |
| Advanced government AI | **0.32** |
| Climate / agriculture / environment / competition & monopolies | **Always conditional / not validated**: open questions in 0.27/0.28, stays in the backlog if refused or undecided |
| Commercial finalization / QA | **0.34**, as validation and preparation, not a guaranteed launch |

### Open design gates (to be decided BEFORE the concerned blocks)

Adopting this roadmap does not turn conditional options into approved decisions. These gates stay open, and a dependent sub-block must raise `BLOCKED_DESIGN` before being started:

1. **0.26 — National currencies and bank credit:** keep nominal USD as the sole accounting unit with an explicit multi-currency representation, or defer FX? Should the bank/deposits/loans balance be simulated, and at what aggregate level?
2. **0.27 — Intra-regional localisation:** points, cells/grid or asset/deposit geometries, with what size/resolution and what level of proof? The user wants different concentrations depending on position, but this roadmap does not yet lock the technical support.
3. **0.27/0.28 — Agriculture, environment, climate and competition:** which sub-systems are actually validated, with which causal loops and legal powers? Do not activate anything silently.
4. **0.29 — Housing:** simulate rents and rental rules in this version?
5. **0.30 — Justice and intelligence:** what degree of procedural detail and what institutional perimeter per country, without fictional generalization of laws?
6. **0.33 — Creative mode:** confirm an isolated testing space for professional validation? What modification possibilities and what limits?
7. **0.34 — Acceptance threshold:** which zones or national scenarios must be historically initializable instead of requiring 252/252 exhaustive entities? What calibration and expert-acceptability criteria?

None of these questions authorizes an agent to invent decisions. Independent blocks may be completed when materially safe, but a dependent block must raise `BLOCKED_DESIGN` first.

### General end-of-milestone criteria (0.26–0.34)

A milestone is a validation candidate when: its approved blocks are implemented; causal mechanisms and invariants are demonstrated; canonical architecture is preserved; old saves migrate from their date; world performance is reasonable for the domain; fidelity differences are conservative; negative tests and cross scenarios exist; the diff is complete; a consolidated independent review groups every detectable defect; corrections are limited and justified; Ubuntu/Windows CI is green on **the exact SHA**; real limitations and coverage are displayed; fictional data is not presented as observed. **Human acceptance is a separate step.**

---

## Cross-cutting locked decisions

### Cold simulation and causality
No magic ideological bonuses, moral penalties, or arbitrary multipliers to simulate an absent causal chain. Principle: **decision → variables → resources/behaviors → consequences**. If something works materially, the engine reflects it. Social, diplomatic, economic and institutional reactions are consequences of their own, not a magic patch.

### Territorial identities
Permanent structure: Country → Regions → geometry. A Region has a permanent ID; never redraw a Region because it is annexed. A Region changes owner/control in canonical state. Preserve absolutely: sovereignty; occupation; effective control — three distinct notions. Controlling a Region does not mean physically crossing every square kilometre; decisive components may include major cities, major bases, strategic positions. The already-retained conceptual example: controlling Québec and Montréal may establish effective control of the Québec Region without occupying every remote northern installation; secondary infrastructure may still be captured, destroyed, isolated or cut off from supply, with material consequences.

### Player / persons / parties
The player controls a **person**, never directly a Country. Separate: person; party membership; party leadership; public office. Real power comes from the office held. Losing an office does not erase the person; losing party leadership is not automatically losing a governmental office.

### Fictional leaders and parties
Starting parties and leaders are recognizable fictional analogues of the real parties/leaders applicable on 2026-01-01: culturally plausible, recognizable, fictional, not identical to real persons. A fictional name may be derived phonetically/culturally from a real leader. Never copy personality, criminality, corruption, extremism, or defamatory traits. After the simulation starts, new leaders may be entirely fictional; their succession depends on the party, internal currents, power balance, context, plausible candidates, parliamentary situation and held power. Never import post-2026-01-01 real history automatically.

### Player succession
If the controlled character loses office politically and a new leader takes their place per the system, preserve the player handoff mechanism. When the contract provides it, offer the player to continue with the successor. Do not fuse: loss of office; loss of party leadership; imprisonment/dismissal; change of controlled person — each follows its own institutional chain.

### Aggregated but not monolithic parties
A party is not one perfectly homogeneous vote, nor thousands of individually simulated MPs. It is an aggregate with a continuous internal distribution that may include a radical/extremist wing, the main current, intermediate positions and a moderate/pragmatic wing. The distribution depends on the subject. A party can produce a split vote. YES / NO / ABSTAIN / UNKNOWN stay distinguishable when coverage allows; **UNKNOWN is not ABSTAIN**. The party line can shift when internal power balances change, without requiring a party-name change.

### Situational political interest
Never evaluate a political decision by abstract ideology alone. Account for majority/opposition, executive control, chamber control, institutional levers, powers gained/lost, exact content, magnitude, currents, context and expected consequences. Example of the principle: an authoritarian party may in theory prefer a weak parliament but oppose a reform that reduces the parliament when an adversary controls the executive and the parliament is its main lever. No flat "opposition" penalty.

### Public actions and organisations
For the decided playable version, a party may organize sit-ins and general/national/capital demonstrations. Strikes belong to unions; a party does not directly command a strike just because it wants to protest. Associations do not automatically gain strike power. Mobilization depends causally on support, subject, anger, credibility, networks, Regions and involved groups. A demonstration is not the automatic appearance of a crowd.

### Opinion
Opinion is computed by Region/cohorts or coherent aggregates. Unions and associations act as relays, spokespeople and mobilization actors; they do not replace the opinion of the whole population. Recalculations follow reasonable cadences: material effects possibly daily; opinion/support/organisation mostly weekly where relevant; immediate reaction for some major events. Prefer differential computation over needless world recalculation.

### Advisors / ministers
Advisors are embodied actors. They may signal, observe, interpret and suggest, according to their role and the difficulty. They are not omniscient, quest generators, or a designer's voice dictating what the player must do. Their information is limited to what their office can access. Difficulty keeps the decided direction: more accessible difficulty → more interpretation/suggestions; higher difficulty → more factual briefing, less interpretation, more left to the player. Never reveal secret engine reality automatically.

### Notifications / consequences / inaction
Notifications come from real consequences. Inaction may produce consequences if the player really had the power to act and the situation materially evolves. Do not blame an opposition for not applying a policy it had no power to impose. Distinguish: leader's will; party position; institutional blockage; lack of authority; real inaction. Several actors may react to the same event when causally relevant; avoid artificial repetition. Routine: non-blocking notification. Urgent/grave: may slow down or pause the game.

### Interface — use the latest version
The old idea of large menus on the vertical left rail has been replaced. **The left rail is now reserved for advisors/actors/notifications.** Do not restore an old mockup just because a historical document contains it.

Retained main shell:
- **Map**: central, priority.
- **Compact topbar**: character, office, country, support when available, date, time. No large decorative `PROJECT ATLAS` title in the header.
- **Left**: advisors / actors / notifications rail. States: normal, hover, selected, notification, important, urgent, unavailable when needed. The left rail is NOT the main menu.
- **Right**: selected context area; Tablet; relevant information.
- **Bottom**: the large-domain bar.
- **Bottom-right**: time controls.

### UI navigation
Navigation: **domain → function/sub-menu → workspace → tabs**. Do not create a succession of debug screens. Categories may remain visible when the player lacks the corresponding powers: public/allowed information is read-only; an action without authority is disabled; an unknown datum is unavailable; urgency is signalled distinctly. **Seeing ≠ controlling.** Example: a player in opposition may consult public trade information without being able to manage national trade. Commands must reflect the real authority of the office.

### UI domains
Preserve the current functional organization or a coherent equivalent: Politics; Economy; Finances; Public services; Security; Defence; Diplomacy; Trade. More detailed sub-domains may include, per context: Politics/Institutions (Government, Parliament, Parties, Elections, Constitution, Public opinion, Public actions); Security/Defence (Police, Intelligence, Justice, Immigration, Military); Society/services (Health, Labour, Population, Family, Housing, Transports/Infrastructure); Education/culture (Education, Culture/Arts, Sports, History/Heritage, Media, Research/Space); Diplomacy (Relations, Treaties, Sanctions, Aid, International organisations); Organisations (Parties, Unions, Associations, Religions when the corresponding system exists). Do not expose as playable an engine function that does not exist.

### Tablet
The Tablet stays independent of the domains. It centralizes, according to the available system: News / public journal; statements; messages; private briefings; reports; history/archives; fictional political/social feed when the module is available. Separate conceptually: **journal/news** = public information; **private briefings/reports** = information accessible to the office; **statements/political network** = public speech of personalities/organisations. Statements must produce contextual reactions when a corresponding system exists.

### Provenance in the UI
Provenance remains essential in the engine/documentation, but in the normal interface: do not constantly show technical IDs; do not show raw sources everywhere; detailed provenance available on demand/debug; human labels for gameplay.

### Unimplemented screens
Do not simulate a feature with an empty screen that suggests it exists. An absent feature is disabled, unavailable, or clearly signalled, per context. Do not show a system as functional just because a button exists.

### Game time
The recent design asks for: date AND time visible; human actions at plausible hours; local timezones where relevant; emergencies able to operate 24/7; multi-cadence for performance. Recent pacing target discussed: slow speed ≈ 1 day per 30 real seconds; ordinary fast speed ≈ 1 day per 15 real seconds. If an old document contains a different target, document the new target as a recent gameplay direction rather than silently modifying a historical measure. This mission does not modify the scheduler or runtime speeds.

### Data / provenance
Every real datum keeps: publisher; URL/source; reference date; retrieval date where relevant; licence; attribution; limitations. Statuses: `sourced`/`observed`, `derived`, `modelled`, `partial`, `unavailable`, justified `not_applicable`. **`unavailable != 0`**; **`UNKNOWN != ABSTAIN`**; never invent an observation for 2026-01-01.

### Territoriality and annexation
Region geometry borders do not change on annexation. The Region passes under another sovereignty/ownership per the canonical model. Occupation and control stay separate. Never recreate a new Region because it changes side.

### Military
Capacity = personnel, equipment, stocks, ammunition, maintenance, training, industry, financing, logistics. No magic "military power" score. A war comes from a credible causal chain: issue/claim → tension → crisis → escalation/de-escalation → explicit use of force. Never `relation < X → automatic war`.

### Diplomacy
Keep separate: condemnation; sanction; embargo; intervention; war. Sanctions have potential material costs on both sides. Dependencies must be derived from existing flows or explicitly modelled.

### Government AI
Future direction: AI governments must appear competent, reasoning from goals, ideology, interests, powers, constraints, resources, institutions, imperfect perception, available information, political situation and expected consequences. No omniscience; no AI acting only to please or harm the player; no script `if player does X → AI opposes`.

---

## Development method (mandatory workflow)

The main methodological change is the reduction of the size of work units.

For each micro-block: 1) analyse the scope; 2) define included/excluded; 3) identify the canonical state touched; 4) identify dependencies; 5) identify migrations/invariants; 6) implement only this block; 7) targeted tests; 8) relevant build; 9) diff; 10) commit/push; 11) CI; 12) correct any regression tied to the block — and only then move to the next.

Do not stack several central engines in one change.

## Review and audits

The goal is not to remove audits; it is to remove **repetitive incomplete audits**. Banned as a working method: find 2 errors, fix them, reread, find 3 already-detectable pre-existing errors, fix them, reread, repeat. For a major review, do one pass as complete as reasonably possible and group results into:

- **Certain bugs** — demonstrable defects.
- **Probable risks** — suspicious or insufficiently protected behaviors.
- **Optional improvements** — quality/refactor/performance not required for correctness.

Do not automatically turn optional improvements into mandatory work.

## Tests and cost

Do not rerun an expensive suite merely to reproduce a GitHub result already available and relevant. Use targeted tests during the micro-block, GitHub CI as the independent global validation, and the local global suite when it really provides needed information. A green test is not sufficient proof if the test is wrong. Never delete a valid test, weaken an invariant, rig a fixture, or artificially harden a scenario just to get green.

## End of a main milestone

At the end of a main milestone: 1) all authorized sub-milestones are finished; 2) CI green; 3) migrations verified; 4) determinism verified; 5) performance verified when concerned; 6) relevant cross-system campaigns; 7) complete independent transversal audit; 8) defects grouped; 9) corrections; 10) global validation; 11) user acceptance. Then STOP. Never start the next main milestone automatically.
