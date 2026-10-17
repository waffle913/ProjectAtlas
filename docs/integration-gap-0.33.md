# 0.33 — Integration-gap inventory

This matrix records the honest integration status of each 0.33 requirement against
the **actual application** (`src/App.tsx`, `src/components/*`, `src/app/*`), not
against standalone contracts. A requirement is `integrated` only when the running
application reads canonical state and issues authorized commands through the
engine; `contract-only` means a type/validator exists but nothing wires it;
`partial` means some, but not all, of the requirement is real; `unimplemented`
means nothing functional exists.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 0.33.1 | Interface/state integration | **integrated** | `App.tsx` reads `sim` (canonical state) and applies changes via `commitCommand`/`applyState` → `SimulationClock`; `setControlledPerson`, `inspectGovernmentReports` route through the engine. |
| 0.33.2 | Map and layers | **partial** | `App.tsx` renders countries + Admin-1 Regions from `buildWorld`/GeoJSON with ownership colours. No explicit economy/politics/resources/trade/logistics/military **layer toggle** exists. |
| 0.33.3 | Domain navigation | **integrated** | All `navItems` domains (overview/fiscal/economy/politics/services/security/operations/treaties/diplomacy/military/trade) render real canonical-state panels; commands exist where the engine supports them, reads are authority-gated, and unavailable systems are honestly labelled. |
| 0.33.4 | Left rail (advisors/actors/notifications) | **unimplemented** | The left `nav-rail` is domain navigation; the advisors/actors/notifications rail with urgency states is not implemented. |
| 0.33.5 | Context panels and Tablet | **partial** | `BriefingTablet` (briefings), `CountryPanel`, `RegionPanel` exist. News/statements/messages/reports sections are not fully wired. |
| 0.33.6 | Commands and powers | **partial** | `FiscalPolicy`, `MilitaryCapabilities`, `OperationsPanel`, `MultilateralPanel` issue engine commands; authority gating via `hasGovernmentInformationAccess` and office roles. `src/simulation/ui/commands.ts` is **contract-only** vocabulary (not the runtime authority check). |
| 0.33.7 | Decisions and consequences | **partial** | Governance analysis computes consequences; the UI does not yet surface execution status/uncertainty/provenance per decision. |
| 0.33.8 | Time and alerts | **partial** | `Clock` + `SimulationClock` advance time; `BriefingTablet` shows briefings. Urgency/interruption states are not fully wired. |
| 0.33.9 | Gameplay paths | **partial** | Governing (`FiscalPolicy`), opposition (authority-gated economy read), succession (governance), budget, crises, diplomacy (claims/wars count), warfare (`OperationsPanel`) exist. No automated end-to-end verification of every path. |
| 0.33.10 | Creative/professional sandbox | **BLOCKED_DESIGN** | Not implemented (pending explicit human decision). |
| 0.33.11 | UX review / cross-cutting audit | **pending** | Consolidated independent review not yet run for the integration delta. |

## Deferred engine integration (0.25–0.32 → 0.33)

The 0.26–0.32 milestones were pure contract/vocabulary layers. Their engine
integration is the substance of 0.33 and is only partially realized in the
existing shell:

- `economy`, `finance`, `resources`, `industry`, `services`, `demography`,
  `security`, `media` contracts have **no UI panels** and no engine wiring yet.
- `ui/contract.ts`, `ui/navigation.ts`, `ui/commands.ts`, `ui/frame.ts` are
  **vocabulary only** — they name the shell, they do not implement it.

## Conclusion

0.33 is **not** functionally complete. The existing React shell already covers a
subset of 0.33.1/0.33.3/0.33.5/0.33.6/0.33.8/0.33.9; the remaining work is real
UI wiring (map layers, left rail, Tablet sections, decision consequences,
urgency states) plus automated playability verification.
