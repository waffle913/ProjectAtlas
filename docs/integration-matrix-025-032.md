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
formalizations; most of the mechanics they describe are **already implemented by
the canonical engines** (0.11–0.20), so wiring the V2 layer as a second runtime
would violate the one-canonical-world guardrail.

| Subsystem | Disposition | Evidence |
|---|---|---|
| Economy (0.25) | **partially integrated + UI wired** | `regionalCapitalCapacityUsd` consumed by `socioeconomy/runtime.ts` + `trade/runtime.ts`; `inspectEconomy` now rendered by the economy panel (`EconomyPanel.tsx`, authority-gated). |
| Finance (0.26) | **redundant — do not wire** | `fiscal-conservation` invariant already enforces cash+debt identities (`fiscal/invariants.ts:83-84`); `runFiscalMonth` already does interest-before-principal (`runtime.ts:302`) and borrowing capacity (`runtime.ts:300`). |
| Resources (0.27) | **redundant — do not wire** | canonical `TradeStock` + stock-flow ledger (`trade/model.ts:35,64`) already own physical stocks. |
| Industry (0.28) | **redundant — do not wire** | `assets` (0.24) owns installations/equipment and production capacity; no parallel production engine is added. |
| Services (0.29) | **redundant — do not wire** | `runFiscalMonth` `evolveService` (`runtime.ts:329`) already computes coverage/backlog/capacity from budget execution. |
| Demography (0.30) | **redundant — do not wire** | `socioeconomy` is the sole population/cohort owner (AGENTS.md); no second population engine. |
| Security/police (0.30) | **deferred** | `deployPolice` has no canonical consumer; integration depends on 0.30.8 security/events + 0.30.6 justice (`BLOCKED_DESIGN`). |
| Diplomacy/Military V2 (0.31) | **redundant — do not wire** | `international` (0.18) owns actions/sanctions, `military` (0.16/0.19) owns orders/operations; the V2 contracts formalize the same mechanics. |
| Media (0.32) | **redundant — do not wire** | `politics` (0.13) owns opinion, `information` (0.15) owns briefings/statements; channel diffusion adds no new canonical state. |

Wiring the redundant layers would introduce a second treasury, second stock
ledger, second population engine, second service-delivery engine, or second
military ledger — each explicitly forbidden by AGENTS.md. They remain as tested
contract/derivation formalizations; the only unblocked genuinely-new wiring was
the economy restitution view, now complete.

