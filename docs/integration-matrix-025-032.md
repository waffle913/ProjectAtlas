# 0.25–0.32 dependency and runtime integration matrix

This matrix records, for each V2 subsystem introduced in milestones 0.25–0.32,
whether its effects are actually applied during simulation. A module passing its
own unit tests does **not** prove runtime integration: integration is claimed only
when a canonical runtime producer supplies its inputs and a canonical runtime
consumer reads its outputs, or when it is explicitly registered with the shared
scheduler.

Method: cross-references between the canonical engine (`src/simulation/engine.ts`,
`scheduler.ts`, `initialization.ts`) and the canonical `*/runtime.ts` modules were
grepped for imports of the V2 module trees (`economy`, `finance`, `resources`,
`industry`, `services`, `demography`, `security`, `diplomacy`, `media`). Result:
exactly **one** V2 function is consumed by a canonical runtime — `economy`'s
`regionalCapitalCapacityUsd`, imported by `socioeconomy/runtime.ts` and
`trade/runtime.ts`. Everything else is contract/validator/derivation-only.

## Summary

| Milestone | Subsystem | State owner | Runtime consumers | Engine-wired | Verdict |
|---|---|---|---|---|---|
| 0.25 | Economy V2 | fiscal/socioeconomy (canonical) | `socioeconomy/runtime.ts`, `trade/runtime.ts` (`regionalCapitalCapacityUsd`) | partial (one function) | **partial** |
| 0.26 | Finance/settlement/treasury/credit | fiscal (canonical) | none | no | contract-only |
| 0.27 | Resources/extraction/energy/networks | trade/assets (canonical) | none | no | contract-only |
| 0.28 | Industry/capacity/research/technology | assets/military (canonical) | none | no | contract-only |
| 0.29 | Services V2 (health/housing/education/benefits) | fiscal/socioeconomy (canonical) | none | no | contract-only |
| 0.30 | Demography/migration/security | socioeconomy (canonical) | none | no | contract-only |
| 0.31 | Diplomacy/military V2 | international/military (canonical) | none | no | contract-only |
| 0.32 | Media/perception/government AI | information/politics (canonical) | none | no | contract-only |

## Per-subsystem detail

### 0.25 — Economy V2 (partial)

1. **Canonical state owner:** `fiscal` (business surplus, tax liabilities),
   `socioeconomy` (employment, cohorts, household income), `trade` (stocks).
2. **Runtime producers of inputs:** `socioeconomy/runtime.ts` and
   `trade/runtime.ts` call `economy/production.ts:regionalCapitalCapacityUsd` to
   bound productive capacity from the existing capital stock — a real producer.
3. **Runtime consumers of outputs:** `socioeconomy` wage/employment derivation and
   `trade` export capacity consume that function's result.
4. **Scheduler entry point:** none registered; the call happens inside the existing
   socioeconomy/trade tasks, not as a new cadence.
5. **Observable effects:** bounded production/capacity in socioeconomy and trade.
6. **Save/migration:** none (read-only derivation over existing canonical state).
7. **UI accessibility:** `economy` panel shows `inspectGovernmentReports`
   (authority-gated unemployment), not the full V2 derivation.
8. **Integration tests:** `crossSystemLoops.test.ts`, `economyFiscal.test.ts`
   (derivation reconciliation), `economyRestitution.test.ts` (authority gating).
9. **Missing links:** employment/firms/prices/domestic-market derivation is not
   consumed by any runtime; it is a tested derivation layer only.

### 0.26 — Finance (contract-only)

1. **Owner:** `fiscal` (debt stock, arrears, budget).
2. **Producers:** none.
3. **Consumers:** none (`settlePayments`, `assessSolvency`, `settleDebtService` are
   uninvoked outside their tests).
4. **Scheduler entry:** none.
5. **Effects:** none on canonical state.
6. **Save/migration:** none.
7. **UI:** none.
8. **Tests:** `financeContract/Settlement/Debt/Solvency/Treasury.test.ts`.
9. **Missing links:** wiring payments/settlement/treasury to the fiscal monthly
   task; national currency/FX/bank-created money remain `BLOCKED_DESIGN`.

### 0.27 — Resources (contract-only)

1. **Owner:** `trade` (TradeStock), `assets`.
2. **Producers:** none.
3. **Consumers:** none (`StockLedger`, `applyDamage`, `deliverEnergy` uninvoked).
4. **Scheduler entry:** none.
5. **Effects:** none.
6. **Save/migration:** none.
7. **UI:** none.
8. **Tests:** `resourcesContract/Anchor/Installation/Transformation/Energy/Network/Stock/Control.test.ts`.
9. **Missing links:** physical stocks/energy consumption binding to canonical
   TradeStock and installations; intra-region grid remains `BLOCKED_DESIGN`.

### 0.28 — Industry (contract-only)

1. **Owner:** `assets` (installations/equipment), `military` (orders).
2. **Producers:** none.
3. **Consumers:** none (`planBatches`, `TechnologyAdoption`, `ResearchProject`
   uninvoked).
4. **Scheduler entry:** none.
5. **Effects:** none.
6. **Save/migration:** none.
7. **UI:** none.
8. **Tests:** `industryContract/Process/Capacity/Service/Research/Diffusion/Technology.test.ts`.
9. **Missing links:** industrial production binding to construction/military
   orders; competition/market-structure gates remain `BLOCKED_DESIGN`.

### 0.29 — Services V2 (contract-only)

1. **Owner:** `fiscal` (budget), `socioeconomy` (personnel/cohorts), `assets`
   (establishments).
2. **Producers:** none.
3. **Consumers:** none (`deliverCare`, `enrol`, `allocateHousing`, `benefitPayments`
   uninvoked).
4. **Scheduler entry:** none.
5. **Effects:** none.
6. **Save/migration:** none.
7. **UI:** the `services` panel reads fiscal `annualBudget` directly, not the V2
   service-delivery functions.
8. **Tests:** `servicesContract/Health/Supplies/Education/Housing/Benefits/Transport/Policy.test.ts`.
9. **Missing links:** service delivery binding to fiscal budget execution and
   personnel; rent rules remain `BLOCKED_DESIGN`.

### 0.30 — Demography / security (contract-only)

1. **Owner:** `socioeconomy` (sole population owner).
2. **Producers:** none.
3. **Consumers:** none (`deployPolice`, migration/transition contracts uninvoked).
4. **Scheduler entry:** none.
5. **Effects:** none.
6. **Save/migration:** none.
7. **UI:** none.
8. **Tests:** `demographyContract/Transition/Migration/LegalStatus/Interconnections.test.ts`, `police.test.ts`.
9. **Missing links:** population transitions binding to the socioeconomy monthly
   cadence; justice/intelligence remain `BLOCKED_DESIGN` (design gate #5).

### 0.31 — Diplomacy / military V2 (contract-only)

1. **Owner:** `international` (actions), `multilateral` (treaties), `military`
   (orders/operations).
2. **Producers:** none.
3. **Consumers:** none (commitments/negotiations/sanctions/support-chain uninvoked).
4. **Scheduler entry:** none.
5. **Effects:** none.
6. **Save/migration:** none.
7. **UI:** the diplomacy/security panels read canonical `publicInternationalActions`
   and crisis/war state, not the V2 diplomacy contracts.
8. **Tests:** `diplomacyContract/Negotiation/Sanctions/Multilateral.test.ts`, `militarySupportChain/Acquisition/TrainingCommand.test.ts`, `territorialControl.test.ts`, `crisisPeace.test.ts`, `orderCosts.test.ts`.
9. **Missing links:** binding negotiations/sanctions/support to the canonical
   international/military runtimes; authority is office-derived and fail-closed
   (the earlier command-mandate defect was corrected).

### 0.32 — Media / perception / government AI (contract-only)

1. **Owner:** `information` (briefings/reports), `politics` (opinion).
2. **Producers:** none.
3. **Consumers:** none (channels/statements/opinion shifts/decision selection
   uninvoked).
4. **Scheduler entry:** none.
5. **Effects:** none.
6. **Save/migration:** none.
7. **UI:** `BriefingTablet` renders canonical briefings (severity, access,
   presentation), not the V2 media contracts.
8. **Tests:** `mediaContract/Channels/Statements/Opinion/GovernmentAI/Decisions.test.ts`.
9. **Missing links:** media channel diffusion and opinion/mobilization binding to
   the canonical information/politics runtimes; disinformation/censorship remain
   `BLOCKED_DESIGN`.

## Integration rule

Integration must enrich the existing canonical systems without duplicating state,
accounting, populations, products, stocks, obligations or capabilities. No second
engine or scheduler is introduced. Wiring proceeds in small dependency-ordered
steps (economy → finance → resources → industry → services → demography/security →
diplomacy/military → media), each with a causal test that demonstrates the effect
on canonical state; any step requiring an undecided rule stays `BLOCKED_DESIGN`.

## Integration disposition (verified 2026-10-17 against current runtimes)

Reconciliation of each subsystem's "missing links" against the actual canonical
runtimes. The V2 layers (0.26–0.32) were built as contract/derivation
formalizations. A verified per-subsystem split is required: **core accounting is
already canonical (do not duplicate it), but the V2-specific behaviors are NOT
uniformly redundant** — several are genuine runtime-integration gaps that remain
unwired. "A similar name" on an older subsystem is not proof of redundancy.

| Subsystem | Disposition | Evidence |
|---|---|---|
| Economy (0.25) | **partially integrated + UI wired** | `regionalCapitalCapacityUsd` consumed by `socioeconomy/runtime.ts` + `trade/runtime.ts`; `inspectEconomy` now rendered by the economy panel (`EconomyPanel.tsx`, authority-gated). |
| Finance (0.26) | **partial** | Core canonical: `fiscal/invariants.ts:83-84` (cash+debt identities), `runtime.ts:302` (interest-before-principal), `runtime.ts:300` (borrowing capacity). Unwired: `assessSolvency` solvent/stressed/default view, `creditCeiling` default-blocks-borrowing gate. |
| Resources (0.27) | **partial** | Core canonical: `TradeStock` stock-flow ledger (`trade/model.ts:35,64`). Unwired: extraction installations, energy plants, network links, war damage, StockLedger reconciliation. |
| Industry (0.28) | **partial** | Core canonical: `assets` (0.24) installations/equipment, `military` (0.16) orders. Unwired: research projects, technology diffusion/adoption, process chains. |
| Services (0.29) | **partial** | Core canonical: `runFiscalMonth` `evolveService` (`runtime.ts:329`) coverage/backlog/capacity. Unwired: establishment-level delivery (beds/personnel), supply requirements. |
| Demography (0.30) | **partial** | Core canonical: `socioeconomy` is the sole population/cohort owner. Unwired: dated birth/death/migration transitions, legal-status integration. |
| Security/police (0.30) | **deferred** | `deployPolice` has no canonical consumer; integration depends on 0.30.8 security/events + 0.30.6 justice (`BLOCKED_DESIGN`). |
| Diplomacy/Military V2 (0.31) | **partial** | Core canonical: `international` (0.18) actions/sanctions, `military` (0.16/0.19) orders/operations. Unwired: negotiations/concessions, sanctions direction, support-chain availability, territorial-control contracts. |
| Media (0.32) | **partial** | Core canonical: `politics` (0.13) opinion, `information` (0.15) briefings. Unwired: channel diffusion, statements/political communication, opinion shifts. |

The **core accounting/ownership is canonical and must never be duplicated** (no
second treasury, stock ledger, population, service-delivery engine, or military
ledger). The **V2-specific behaviors** listed above are genuine incomplete runtime
integrations — the remaining 0.33 scope — to be wired only where no design gate
blocks them.

## V2 runtime integration campaign (branch `waffle913-v2-runtime-integration-025-032`)

Targeted wiring of the genuinely missing, technically unblocked V2 behaviors into
the single canonical runtime, one causal micro-block per subsystem. Each entry is
demonstrated by a real canonical-state transition / runtime consumer and a focused
integration test; anything still blocked is recorded as a precise blocker, never a
fabricated mechanism. (Local heavy verification is forbidden by the campaign
guardrails; executable validation runs in GitHub CI against the exact commit SHA.)

| Subsystem | Now wired (runtime) | Remaining blocker |
|---|---|---|
| Finance (0.26) | `assessSolvency` derived from canonical fiscal surfaces; `creditCeiling` gates `borrowed` in `runFiscalMonth` (default blocks new credit → debt/cash/arrears feed back); `account.stress.solvencyState/reason` recorded + validated; `assessFiscalSolvency` on-demand view. | FX / bank-created money / bank deposits balance (`BLOCKED_DESIGN`). |
| Resources (0.27) | `reconcileTradeStock`/`stockLedgerFromTrade` map the canonical `TradeStock` to the 0.27 `StockLedger` and validate conservation/capacity; consumed by `prepareTradeMonth`. | Extraction installations, energy plants, network links (no admitted data; `RESOURCES`/`FUELS`/plant/link registries empty); war-damage→output gated on empty `ASSET_TYPE_CAPACITY_REGISTRY`. |
| Industry (0.28) | `applyCapacityEffect` applied to the canonical military factory capacity (`militaryFactoryCapacity`), consumed by `militaryRequests` + `executeMilitaryFunding` via an empty-by-default `TECHNOLOGY_LINK_REGISTRY`. | Research projects, adoption/diffusion, process chains (no canonical registry); competition/market structures (`BLOCKED_DESIGN`). |
| Services (0.29) | `serviceSupplyFactorBps` reads the canonical `TradeStock`; an admitted supply requirement bounds `evolveService` delivered capacity (rupture → lower coverage). | Establishment-level beds/personnel (no admitted service↔asset mapping); rent rules (`BLOCKED_DESIGN`). |
| Demography (0.30) | `applyDemographicTransition`/`applyInternationalMigration` mutate the single population owner (population + `populationByRegion` + `cohortsFor` cohorts + re-calibrated economy) with exact conservation. | Automatic birth/death/migration rates (no observed rates); cohort-distribution mobility (fixed-split model); police/justice/intelligence (`BLOCKED_DESIGN`/deferred). |
| Diplomacy/Military (0.31) | `applyCoercionMeasure` (sanction/embargo with explicit import/export direction → canonical 0.18 restriction; `sanctionBlocksRoute` enforces it); `applyConcession` (relation_adjustment → `bilateralRelations`, tariff_reduction → route `tariffBps`); `militarySupportLinks/Chain` derive the canonical 0.16 support chain. | Negotiation resolution + intervention/territorial-control contracts remain vocabulary; mediation deferred (0.20 decision kind absent). |
| Media (0.32) | `applyOpinionShiftToPolitics` mutates canonical `politics.regionalOpinion` cohort sentiment (signed, bounded, causal `causeId`). | Channel diffusion, statement reach, government-AI action selection remain vocabulary; disinformation/censorship (`BLOCKED_DESIGN`). |

Playability hardening (same branch): New Game re-initializes a genuinely fresh
simulation; pause-menu / leaving-game pauses the shared clock; Continue/New/Load
gated on data+storage readiness; genuine loading stages; manual-save overwrite
confirmation.


