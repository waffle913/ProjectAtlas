# A1 — Player-Facing Functional Recovery: consolidated report

Branch `waffle913-a1-player-facing-recovery`, created from validated `main`
`a920465` (the merged V2 runtime-integration + playability hardening baseline,
after its bounded independent review and exact-SHA CI gates).

This report separates **technically demonstrated** behavior (code + tests + CI)
from **human acceptance** (the owner's playtest verdict), which A1 does not
grant.

## 1. Initial findings, grouped by severity

**Confirmed defects (corrected)**

- D1 (map): `src/App.tsx` applied the selected layer only to region geometry
  when a country was selected and zoomed ≥ 4; the global map was always
  ownership-coloured. Population/Economy/Occupation had no effect at world zoom.
- D2 (presentation): panels leaked opaque permanent IDs (`ProjectAtlas Region
  ID`, `Region <id>`), raw status enums, `source.datasetId`, and a misleading
  `1.0.0` version label; geographic names contained literal HTML entities
  (`Cura&#231;ao`, `C&#244;te d'Ivoire`, `T&#252;rkiye`).
- D3 (operations): `OperationsPanel` dumped `state.operations.regionControl`
  for **every** Region — foreign operational reality, unfiltered — plus raw
  region/deployment IDs and internal status strings.
- D4 (coverage): `selection.ts`/`StartGame.tsx` gated playability on party or
  officeholder evidence and disabled every other entity with one opaque label.
- D5 (commands): the diplomacy screen reported "not implemented" while
  `condemn`/`imposeImportRestriction`/`imposeExportRestriction`/`applyConcession`
  (and the emergency declare/end procedure) are already implemented and
  authority-gated in the engine.
- D6 (save/load): a failed/unreadable save surfaced the fatal "Map data
  unavailable" full-screen error and forced a reload.

**Probable risks (reviewed, recorded)**

- `validateStock` and `serviceSupplyFactorBps` use unchecked arithmetic on
  extreme magnitudes; demography zero-population edge; solvency snapshot-vs-live
  view divergence; `militarySupportLinks` stock/flow unit conflation. All are
  low-severity and recorded in the autopilot deferred-defect register.

**Optional improvements (out of A1 scope, not performed)**

- Full artistic UI redesign; Economy-V2 documentary campaign; milestone 0.35;
  any new diplomatic/security mechanic.

## 2. Corrections (dependency order)

| Block | Commit | What changed |
|---|---|---|
| V2 review+merge | `a920465` (main) | D1 review finding fixed: pause genuinely suspends and resumes; `applyConcession` authority-gated. |
| A1.1 | `4bffcf3` | Global map honours all four layers via `territoryLayerColour` (aggregates admissible Region values, mixes multi-owner areas, never fabricates); zero-vs-unavailable distinct; `LAYER_LEGEND` explains colours/units/aggregation; region overlay re-keys on layer change. |
| A1.2 | `1797941` | HTML entities decoded at load; enum strings humanized; raw Region ID + datasetId behind the existing "Show provenance details" setting; EconomyPanel uses Region names; version label → `alpha (pre-release)` (no `1.0.0`, no `schema` noise). |
| A1.3 | `f243417` | Operations: foreign `regionControl` dump removed (control now only via the authority-gated fog-of-war report, labelled distinct from sovereignty/occupation); Region names + humanized statuses; bounded searchable Region picker; commands stay tied to real military-command authority. |
| A1.4 | `8634cd2` | Save-load failure recoverable in the Load Game screen (no forced reload). Pause/new-game/init-gating/save-confirm inherited verbatim from V2 — not re-implemented. |
| A1.5 | `4a64a49` | Coverage documented (below); disabled entities labelled by real reason. |
| A1.6 | `c3b9219` | DiplomacyPanel + SecurityPanel wire the existing canonical commands; recorded actions shown with Country names and effective dates. |

## 3. UI interaction tests (mounted via `renderToStaticMarkup`; full map interaction is covered by the owner's Windows playtest)

- `mapLayers.test.ts` (5 new): zero-vs-unavailable; territory aggregation;
  mixed-owner; territory occupation; legend coverage.
- `decodeEntities.test.ts`: decimal/hex/named references; passthrough; unknown
  references left intact.
- `OperationsPanel.test.ts`: foreign control not rendered; Region name not
  deployment id; command refusal without authority.
- `DiplomacyPanel.test.ts`: recorded action by Country name (not id); refusal
  without resolved executive diplomatic authority.
- `SecurityPanel.test.ts`: declaration only for the executive head.

## 4. Causal command integration evidence

Each A1.6 action calls the existing engine function and mutates canonical state:

- `condemn` → `InternationalAction` (`kind: 'condemnation'`, dated, effective
  next day) in `state.international.actions`.
- `imposeImportRestriction`/`imposeExportRestriction` → dated active restriction;
  `sanctionBlocksRoute` then blocks the matching trade route.
- `applyConcession` → `bilateralRelations` score or route `tariffBps` (authority
  via `hasInternationalAuthority`).
- `declareEmergency`/`endEmergency` → `constitution.countries[..].emergency`
  (active crisis + executive office required; fails closed).

These consequences are already covered by the engine suites
(`international.test.ts`, `governance.test.ts`, `constitution*`, `war.test.ts`),
which CI runs.

## 5. Save/load and new-game regression evidence

- New Game re-initialises from the captured fresh base + seed (V2, in main).
- Pause resumes exactly its prior state (V2 review fix, in main).
- Save success is reported only after the storage medium accepts the write;
  autosave is a distinct `__autosave__` slot; Continue/New/Load are gated on
  data+storage readiness.
- `saveReliability.test.ts`, `playabilityIntegration.test.ts`, `engine.test.ts`
  and the migration tests run in CI and assert conservation, determinism and
  save/reload round-trips.

## 6. Coverage and the open design decision

199/252 entities are selectable today (all 194 sovereign states + 5 partially
recognized states via the officeholder path; 118 sovereign states also via the
party-leader path). 53 entities are not playable (46 dependencies, 6
special-status, 1 disputed) — none has a reconciled HOG/HOS officeholder or a
registered party. See `docs/a1-playable-coverage.md`.

**Open human decision (not resolved):** whether initial playable selection must
cover all 252 entities or sovereign states first, with separate arrangements for
dependencies. Unknown governmental powers are never fabricated.

## 7. Remaining incomplete V2 / design-blocked dependencies

- Demography/diplomacy/media V2 integration functions are implemented and
  tested as library functions but **not yet consumed** by a canonical runtime
  task (documented in `docs/v2-runtime-integration-report.md` §7).
- FX / bank-created money; extraction/energy/network installations; competition
  and market structures; rent rules; justice/intelligence/security-events;
  disinformation/censorship; mediation — `BLOCKED_DESIGN` or deferred.
- 0.34 documentary recovery (0.34.2 DEFERRED), calibration (0.34.6 PARTIAL),
  professional validation (0.34.9 AWAITING_HUMAN_VALIDATION), licences
  (0.34.11 PARTIAL) — commercial-release blockers unchanged by A1.

## 8. Acceptance boundary

Everything above is **technically demonstrated** (code + tests + green CI at the
exact SHAs below). It is **not** human acceptance: the owner's Windows playtest
is the acceptance gate, and 0.24 remains the last human-accepted/sealed
milestone; 0.33 is technically validated but not accepted; 0.34 is
`AWAITING_HUMAN_ACCEPTANCE`.

## 9. CI and SHAs

- V2 branch verify: run `39089763817` @ `a920465c73a229200f0ed28ff71b5d89277086c5` — success.
- `main` verify: run `39091599407` @ `a920465` — success.
- `main` desktop-windows: run `39091599415` @ `a920465` — success (Windows packaging).
- A1 branch verify: run `39096999563` @ `160b00b30193a91123ea98783f44ce06e9fd676e` — success (Ubuntu + Windows).
- A1 branch desktop-windows: run `39096999843` @ `160b00b` — success (cargo test + `tauri:build` Windows packaging).

Final A1 branch head: `160b00b30193a91123ea98783f44ce06e9fd676e`
(`waffle913-a1-player-facing-recovery`). The Windows test build is produced as the
`desktop-windows` run artifact for this SHA; the owner's playtest accepts or
rejects it — A1 is technically demonstrated, not human-accepted.
