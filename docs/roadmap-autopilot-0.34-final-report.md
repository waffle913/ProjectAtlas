# ROADMAP AUTOPILOT — 0.34 FINAL TECHNICAL REPORT

Repository `waffle913/ProjectAtlas`. Generated 2026-10-17 after the 0.33 merge and
the 0.34 validation campaign. This report records technical status only; it is
**not** human acceptance, professional approval, or a commercial/scientific claim.

## 1. Milestones and sub-milestones — disposition

| Milestone | Disposition | Notes |
|---|---|---|
| 0.24 | `HUMAN_ACCEPTED` | Sealed `6b6794e` (CI run 38079523537). |
| 0.25 | `TECHNICALLY_VALIDATED` | Economy V2; B2 deferred. |
| 0.26 | `TECHNICALLY_VALIDATED` | Finance; FX/bank-money `BLOCKED_DESIGN`. |
| 0.27 | `TECHNICALLY_VALIDATED` | Resources; intra-region grid `BLOCKED_DESIGN`. |
| 0.28 | `TECHNICALLY_VALIDATED` | Industry; competition `BLOCKED_DESIGN`. |
| 0.29 | `TECHNICALLY_VALIDATED` | Services; rent rules `BLOCKED_DESIGN`. |
| 0.30 | `TECHNICALLY_VALIDATED` | Demography/police; justice+intelligence `BLOCKED_DESIGN`. |
| 0.31 | `TECHNICALLY_VALIDATED` | Diplomacy/military V2. |
| 0.32 | `TECHNICALLY_VALIDATED` | Media; disinformation/censorship `BLOCKED_DESIGN`. |
| 0.33 | `TECHNICALLY_VALIDATED` | Final interface/playability/integration. |
| 0.34 | `PARTIAL` | Validation campaign; human validation + licences pending. |

Sub-milestone detail for 0.34: see `docs/milestone-0.34-validation.md`.

## 2. Exact runtime commits, merges and green CI runs

| Milestone | Main merge | Main CI (green, ubuntu+windows) |
|---|---|---|
| 0.24 | `6b6794e` | 38079523537 |
| 0.25 | `7eb738b` | 38767863844 |
| 0.26 | `22427bb` | 38801040774 |
| 0.27 | `2fa4abc` | 38842564250 |
| 0.28 | `14c4d2d` | 38866968841 |
| 0.29 | `f1f64e9` | 38902843527 |
| 0.30 | `8062597` | 38985627295 |
| 0.31 | `f7ee71f` | 39013345362 |
| 0.32 | `9d5d640` | 39030385548 |
| 0.33 | `66a761e` | 39070236846 |

0.33 branch CI: run `39067860709` (head `3912b79`). Desktop Windows CI (cargo test
+ Tauri packaging): green on the 0.33 checkpoint.

## 3. Canonical systems actually wired to the scheduler and runtime

- One `SimulationState`, one `createCoreScheduler`, one `SimulationClock`, one
  seeded RNG.
- Registered runtime cadences: monthly economy/fiscal/services/crisis, weekly
  politics/opinion, plus construction/trade/military/international/operations
  tasks, all consumed through `advanceOneDay`.
- Economy V2: `regionalCapitalCapacityUsd` consumed by `socioeconomy/runtime.ts`
  and `trade/runtime.ts`; `inspectEconomy` rendered (authority-gated) in the UI.
- The 0.26–0.32 V2 contract layers are formalizations whose mechanics are already
  implemented by the canonical fiscal/trade/assets/politics/information engines —
  documented as redundant/do-not-wire in `docs/integration-matrix-025-032.md`.

## 4. Functional UI and gameplay paths demonstrably tested

- `playabilityIntegration.test.ts`: full-game init invariants, authority gating
  (HoG sees government information, legislator does not), save/restore round-trip,
  governing path (budget proposal → submit → save/restore persistence).
- `saveReliability.test.ts`: write rejection, index-write failure, rapid-save
  ordering, restart persistence, delayed init, interrupted-write recovery,
  deletion/rename, schema-20/18 preservation.
- `mapLayers.test.ts`, `leftRail.test.ts`, `urgency.test.ts`, `EconomyPanel.test.ts`,
  `crisisWorld.test.ts` (positive crisis lifecycle): canonical-data binding and
  authority gating in the UI.

## 5. Consolidated audit findings and final dispositions

0.33 final campaign (2 rounds):

- **Round 1** (verdict block) — D1 Security panel raw crisis-engine-state leak
  (Reality→Government-Information), D2 services annualBudget un-gated, D3
  `ui/commands.ts` label-based authority, R1 autosave slot collision, R2 load
  init race, R3 save-read abort, R4 autosave UI-thread serialization. **All
  corrected.**
- **Round 2** (verdict: minor nits, OK to ship) — corrections verified; load
  error/initializing distinction + stale docs fixed.

0.25–0.32 campaigns: one blocking-or-warn round each, corrected with regression
tests, then a final-verification pass — recorded in
`.reasonix/projectatlas-autopilot-state.json` (`review_campaign_history`).

## 6. Outstanding deferred defects and unresolved design gates

- `deferred-0.25-B2` firms pre-fiscal fallback (low, view-only).
- `deferred-0.25-R2-emptyregions` fiscal derivation zero-region edge (low).
- BLOCKED_DESIGN: national currency/FX/bank money (0.26), intra-region spatial
  grid (0.27), competition/market structures (0.28), rent rules (0.29),
  justice (0.30.6) + intelligence (0.30.7) + security events (0.30.8),
  disinformation/censorship (0.32), creative/professional sandbox (0.33.10).

## 7. Data coverage, admissible scenarios, vintages, provenance, licences

- 252 Countries, 4574 Regions; population 38% Regions / 40.5% Countries;
  nominal output 36.8% Regions / 32.9% Countries; territory geometry 177/252.
- Scenario start `2026-01-01`; a later publication is admissible only when it
  documents a situation applicable on that date; snapshots carry reference and
  retrieval dates.
- Licences: Natural Earth public domain; IPU Parline CC BY-NC-SA 4.0; several
  sources record "licence not stated" — unresolved (release blocker).

## 8. Performance, determinism, conservation, migration evidence

- Ubuntu + Windows `verify` green through 0.33; desktop build green.
- Determinism: single seeded RNG, order-invariance and `Math.random`-free (grep
  negative), deterministic save/reload.
- Conservation: `assertSimulationInvariants` + domain invariants (fiscal
  conservation, matter conservation in resources/industry, population
  conservation in demography) run in CI.
- Migrations: schema 18/19/20 preserved with regression tests; advanced saves
  migrated at their recorded date without replay.

## 9. Known limitations and domains not historically reliable

- Only the coverage-documented subset of the 252 entities is historically
  calibrated; the rest is `unavailable`/`modelled`, never zero-filled.
- 0.26–0.32 V2 layers are contract/derivation only; their mechanics are the
  canonical 0.11–0.20 engines.
- Domestic prices, firm accounts, household demand, solvency views are
  `derived`/`modelled`, never presented as observations.

## 10. Professional/human tests still required

Economist, diplomat, military/legal and player validation (0.34.9) — protocols
can be prepared but no expert feedback is fabricated. This is
`AWAITING_HUMAN_VALIDATION`.

## 11. Last technically safe baseline

`0.33` @ `66a761e5cbef7324c7a5bf311bcccaa34b2195d3` (main), green CI run
`39070236846` (ubuntu + windows).

## 12. Last explicitly human-accepted baseline

`0.24` @ `6b6794ef1e5440cf02152a84ee0012aa155f7ad0` (sealed), CI run `38079523537`.
Technical validation of 0.25–0.34 is **not** human acceptance.

## 13. Remaining decisions required from the project owner

1. Accept or reject the 0.25–0.34 technical validations (human acceptance is
   separate and remains open).
2. Decide the BLOCKED_DESIGN gates (FX/bank money, spatial grid, competition,
   rent, justice/intelligence/security-events, disinformation/censorship,
   creative/professional sandbox).
3. Resolve the unstated source licences before any commercial/distributed release.
4. Schedule the human/professional validation (0.34.9).

---

**Boundary:** 0.34 is the final numbered milestone. No 0.35 or further roadmap
scope is created.
