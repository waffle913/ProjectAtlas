# V2 runtime integration & playability hardening — consolidated technical report

Branch `waffle913-v2-runtime-integration-025-032`, from `main` `36f9b683` (latest
observed `main`). This campaign wires the genuinely missing, technically unblocked
V2 runtime integrations identified during the 0.33/0.34 recovery, then hardens the
startup/menu/pause/save-load experience. It does **not** rebuild previous
milestones, open a new numbered milestone, or declare 0.34 complete.

Local heavy verification is forbidden by the campaign guardrails; executable
validation runs in GitHub Actions against the exact commit SHA (the `verify`
workflow on Ubuntu + Windows).

## 1. Completed V2 integrations (dependency order)

| Milestone | What is now wired into the canonical runtime | Causal evidence / test |
|---|---|---|
| Finance 0.26 | `assessSolvency` derived from canonical fiscal surfaces; `creditCeiling` gates `borrowed` in `runFiscalMonth` (default → `usable=0`, blocks new credit, arrears/debt/cash feed back); `account.stress.solvencyState/solvencyReason` recorded and validated; `assessFiscalSolvency` on-demand view. | `financeRuntime.test.ts`: healthy → solvent; default blocks credit (`borrowed=0`, `closingDebt===openingDebt`, arrears grow), invariants pass, save/reload round-trip. |
| Resources 0.27 | `stockLedgerFromTrade`/`reconcileTradeStock` map the canonical `TradeStock` to the 0.27 `StockLedger` and enforce conservation/capacity; consumed by `prepareTradeMonth`. | `resourcesRuntime.test.ts`: exact mapping, conservation/capacity violations throw, reconciliation through a real monthly trade settle. |
| Industry 0.28 | `applyCapacityEffect` applied to the canonical military factory capacity (`militaryFactoryCapacity`), consumed by `militaryRequests` and `executeMilitaryFunding` (threaded with an empty-by-default `TECHNOLOGY_LINK_REGISTRY`). | `industryRuntime.test.ts`: empty registry no-op; link composition (12000×11000=13200); a synthetic link raises funded `productionUnits`. |
| Services 0.29 | `serviceSupplyFactorBps` reads the canonical `TradeStock`; an admitted supply requirement bounds `evolveService` delivered capacity (rupture → lower coverage). | `servicesRuntime.test.ts`: empty registry unbound; rupture recorded; absent store = unavailable (never zero); supply rupture lowers capacity/coverage. |
| Demography 0.30 | `applyDemographicTransition`/`applyInternationalMigration` mutate the single population owner (population + `populationByRegion` + `cohortsFor` cohorts + re-calibrated economy) with exact conservation; fail-closed on reserved labour / unavailable data. | `demographyRuntime.test.ts`: birth/death re-derive cohorts and pass invariants; migration conserves total and over-draw fails closed; unavailable population never fabricates a transition. |
| Diplomacy/Military 0.31 | `applyCoercionMeasure` (sanction/embargo with explicit import/export direction → canonical 0.18 restriction; `sanctionBlocksRoute` enforces it); `applyConcession` (`relation_adjustment` → `bilateralRelations`, `tariff_reduction` → route `tariffBps`); `militarySupportLinks/Chain` derive the canonical 0.16 support chain. | `diplomacyRuntime.test.ts`: import vs export direction + route-blocking consequence; relation-score and tariff changes; support chain derived from real stocks (unmapped stages unavailable). |
| Media 0.32 | `applyOpinionShiftToPolitics` mutates canonical `politics.regionalOpinion` cohort sentiment (signed, bounded to [-10000,10000], carries `causeId`). | `mediaRuntime.test.ts`: causal shift + invariant pass; whole-region clamping; fail-closed on unknown Region/cohort. |

## 2. Playability / startup / menu / save-load hardening

- **New Game** re-initializes a genuinely fresh simulation from the captured
  fresh base + seed, so returning to the menu and starting again cannot preserve a
  prior session's player, ownership, wars, budgets, decisions or clock state.
- **Pause genuinely suspends**: opening the pause menu, or leaving the game view
  (menu/settings/load/credits), pauses the shared clock; no background advance.
- **Init gating**: Continue / New Game / Load Game are disabled until world data
  and save storage are ready, with an explicit "still loading" hint — no unusable
  actions before initialization.
- **Loading screen** reports genuine stages (country registry, geography, region
  registry, population, economics, simulation init) — never invented percentages.
- **Manual save** confirms before overwriting an existing slot; autosave remains a
  distinct `__autosave__` slot. Save success is only reported after the medium
  accepts the write (existing awaitable `saveStorage`/`desktop` backends,
  `saveReliability.test.ts`).

## 3. Files and canonical systems affected

- `src/simulation/fiscal/{model,runtime,invariants}.ts` — finance solvency/credit.
- `src/simulation/resources/stock.ts`, `src/simulation/trade/runtime.ts` — stock reconciliation.
- `src/simulation/industry/technology.ts`, `src/simulation/military/runtime.ts` — technology capacity.
- `src/simulation/services/supplies.ts`, `src/simulation/fiscal/runtime.ts` — service supply.
- `src/simulation/demography/integration.ts` — population transitions.
- `src/simulation/diplomacy/integration.ts` — coercion/concession/support chain.
- `src/simulation/media/integration.ts` — opinion shifts.
- `src/App.tsx`, `src/components/MainMenu.tsx` — playability hardening.
- Tests: `financeRuntime`, `resourcesRuntime`, `industryRuntime`, `servicesRuntime`,
  `demographyRuntime`, `diplomacyRuntime`, `mediaRuntime` (all under `src/simulation/__tests__/`).
- Docs: `docs/integration-matrix-025-032.md` (campaign dispositions), this report.

No new canonical-state schema or migration was introduced: every integration reads
or writes the existing canonical owners (fiscal, trade, socioeconomy, military,
politics, international, information) and never a second engine/ledger/scheduler.
`state.regionOwnership`, permanent Country/Region IDs, determinism (`Math.random`
untouched), and the Reality → Government Information → Public Perception boundary
are preserved.

## 4. Deferred and design-blocked behaviors (precise blockers, not fabricated)

- Finance: FX / bank-created money / bank deposits balance (`BLOCKED_DESIGN`).
- Resources: extraction installations, energy plants, network links (no admitted
  data — registries empty); war-damage → output gated on empty `ASSET_TYPE_CAPACITY_REGISTRY`.
- Industry: research projects, adoption/diffusion, process chains (no canonical
  registry); competition/market structures (`BLOCKED_DESIGN`).
- Services: establishment-level beds/personnel (no admitted service↔asset mapping);
  rent rules (`BLOCKED_DESIGN`).
- Demography: automatic birth/death/migration rates (no observed rates — never
  fabricated); cohort-distribution mobility (the 0.10 model fixes the split);
  police/justice/intelligence (`BLOCKED_DESIGN`/deferred).
- Diplomacy/Military: negotiation resolution + intervention/territorial-control
  contracts remain vocabulary; mediation deferred (its 0.20 decision kind is absent).
- Media: channel diffusion, statement reach, government-AI action selection remain
  vocabulary; disinformation/censorship (`BLOCKED_DESIGN`).

## 5. Remaining data, licence and professional-validation dependencies

- 0.34.2 documentary recovery: `DEFERRED` (independent Work campaign).
- 0.34.6 calibration: `PARTIAL`; 0.34.9 human/professional validation:
  `AWAITING_HUMAN_VALIDATION` (no fabricated expert feedback).
- 0.34.11 licences: `PARTIAL` — several sources record "licence not stated" =
  commercial-release blocker (unresolved).
- These are unchanged by this campaign; it neither resolves nor fakes them.

## 6. Baselines and 0.33/0.34 dispositions

- Last independently verified safe runtime baseline: **0.33 @
  `66a761e5cbef7324c7a5bf311bcccaa34b2195d3`**, CI run `39070236846` (Ubuntu +
  Windows) — unchanged; this branch does not advance it.
- Last human-accepted/sealed baseline: **0.24 @
  `6b6794ef1e5440cf02152a84ee0012aa155f7ad0`** — unchanged.
- 0.33: technically validated (not human-accepted). 0.34: **not**
  `TECHNICALLY_VALIDATED`; `AWAITING_HUMAN_ACCEPTANCE` at the roadmap boundary.
- This campaign completes technically-unblocked V2 runtime integrations and
  playability hardening; it does **not** claim 0.34 is technically complete, and
  creates **no** 0.35 milestone.
