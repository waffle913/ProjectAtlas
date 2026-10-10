# ProjectAtlas sub-milestone roadmap

This document is the detailed planning reference for ProjectAtlas. It complements the [canonical agent handoff](agent-handoff.md) and the per-domain technical contracts; it does not replace them, and it does not authorize implementation on its own.

## How to read this document

- **Historical milestones are not re-cut retroactively.** 0.1–0.21 keep their original numbering and scope. They are preserved here as context, not as tasks to redo.
- **New large milestones are split into small units.** 0.24 and 0.25 are decomposed into sub-milestones and micro-blocks to reduce the surface of each change and the cost of corrective loops.
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

## Post-0.25 — unnumbered V2 backlog

Do not invent 0.26, 0.27, etc. Numbers such as 0.32, 0.33 or 0.34 may have been mentioned during size estimates; **a comparative estimate is not a roadmap validation**. Until an explicit decision fixes their order, keep the following directions in an unnumbered register.

- **Currency / banks / credit / finance**: currency; payments; loans; debts; liquidity; rates; finance; investments; risks. No money created by accounting incoherence.
- **Energy and resources**: capacities; plants; grids; fuels; resources; geography; costs; shortages; industry; households; military.
- **Research / technology / innovation**: funding; personnel; time; diffusion; industrial capacity; real effects on productivity/equipment. No magic technological bonus.
- **Health / housing / public services V2**: access to care; hospitals; housing; supply; rents if decided; pensions; education; aid; infrastructure.
- **Police / justice / intelligence**: actors; budgets; personnel; law; investigations; powers; constitutional constraints; consequences.
- **Immigration / demography V2**: entries; exits; statuses; residence; work; families; integration; rights; budgets. No second parallel population.
- **Diplomacy V2 / deeper trade**: negotiations; requests; claims; guarantees; sanctions; escalation; treaties; organisations; dependencies; multilateral interactions. Extend 0.17–0.20.
- **Military V2**: enriched logistics; military industry; training; maintenance; ammunition; command; research; AI autonomy; enriched operations. Do not duplicate 0.16/0.19.
- **Deep products/services economy**: sectors that do not reasonably fit the 0.25 core can be deepened later without artificially bloating 0.25.
- **Media / information / opinion**: media; statements; credibility; disinformation; censorship when decided; opinion; reactions; political communication. Preserve Reality / Government Information / Public Perception.
- **Final interface / ergonomics**: see the locked UI decisions below.
- **Advanced government AI**: competent governments; goals; constraints; limited information; contextual choices; trade-offs; ministers; coalitions; opposition; crises.
- **Climate / agriculture / environment / competition and monopolies**: keep as possible/expected directions only when genuinely validated, otherwise mark them explicitly as proposals. Do not present them as already approved systems in detail.
- **Commercial finalization / QA**: licences; attribution; data compliance; desktop build; gameplay QA; performance; save compatibility; distribution.

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
