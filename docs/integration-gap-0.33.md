# 0.33 — Integration-gap inventory

This matrix records the honest integration status of each 0.33 requirement against
the **actual application** (`src/App.tsx`, `src/components/*`, `src/app/*`), not
against standalone contracts. A single `integrated` label is deliberately **not**
used: each requirement is scored across six independent dimensions so a working
navigation link cannot be confused with a working gameplay subsystem.

| Status | Meaning |
|---|---|
| `✓` | Real, exercised in the running application against canonical state. |
| `partial` | Some, but not all, of the dimension is real. |
| `—` | Nothing functional exists for that dimension. |
| `n/a` | The dimension does not apply to this requirement. |
| `blocked` | Explicitly gated on an undecided design/authorization. |

| # | Requirement | Navigation | Canonical read | Authorized commands | Consequences | Integration test | Smoke test |
|---|---|---|---|---|---|---|---|
| 0.33.1 | Interface/state integration | `n/a` | `✓` | `✓` | `✓` | `✓` | `—` |
| 0.33.2 | Map and layers | `✓` | `partial` | `—` | `—` | `—` | `—` |
| 0.33.3 | Domain navigation | `✓` | `✓` | `partial` | `partial` | `partial` | `—` |
| 0.33.4 | Left rail (advisors/actors/notifications, urgency) | `—` | `—` | `—` | `—` | `—` | `—` |
| 0.33.5 | Context panels and Tablet | `partial` | `partial` | `—` | `—` | `partial` | `—` |
| 0.33.6 | Commands and powers | `✓` | `✓` | `partial` | `partial` | `partial` | `—` |
| 0.33.7 | Decisions and consequences | `✓` | `✓` | `partial` | `partial` | `—` | `—` |
| 0.33.8 | Time and alerts | `✓` | `✓` | `partial` | `—` | `partial` | `—` |
| 0.33.9 | Gameplay paths | `✓` | `✓` | `partial` | `partial` | `partial` | `—` |
| 0.33.10 | Creative/professional sandbox | `blocked` | `blocked` | `blocked` | `blocked` | `blocked` | `blocked` |
| 0.33.11 | UX review / cross-cutting audit | `—` | `—` | `—` | `—` | `—` | `—` |

## Per-requirement evidence

### 0.33.1 — Interface/state integration (`✓` read/commands/consequences/test)
`App.tsx` observes the single canonical `sim` (`useState(initialState)`), reads
reports through the engine (`inspectGovernmentReports`), and mutates only through
`commitCommand`/`applyState` → `SimulationClock`; `setControlledPerson` routes
through the governance runtime. `playabilityIntegration.test.ts` exercises init,
authority gating and save/restore. No dedicated desktop smoke test yet.

### 0.33.2 — Map and layers (`partial` read only)
`App.tsx` renders Country territories + Admin-1 Regions from `buildWorld`/GeoJSON
and colours them from `sim.regionOwnership` (canonical). There is **no layer
toggle** and no data binding for economy/politics/resources/trade/logistics/military
layers — the `map-note` legend is descriptive text, not a control.

### 0.33.3 — Domain navigation (`✓` navigation/read; `partial` commands/consequences)
All `navItems` domains render real panels: fiscal (`FiscalPolicy`, issues engine
commands), economy (`inspectGovernmentReports`, authority-gated read), politics
(`politicalRegistry`), services (fiscal `annualBudget`), security (emergency status,
active wars, active crisis episodes), treaties (`MultilateralPanel`, commands),
diplomacy (`publicInternationalActions`, read-only), military (`MilitaryCapabilities`,
commands), operations (`OperationsPanel`, commands), trade (`TradeInspection`,
commands). Command-bearing domains are a subset; the read-only domains are honestly
labelled.

### 0.33.4 — Left rail (`—`)
The left `nav-rail` is domain navigation. The advisors/actors/notifications rail
with normal/hover/selected/urgency states is not implemented.

### 0.33.5 — Context panels and Tablet (`partial`)
`BriefingTablet` (briefings + urgent briefing count), `CountryPanel` and `RegionPanel`
exist and read canonical data. News/statements/messages/reports sections and full
Information/Perception compartmentalization are not wired.

### 0.33.6 — Commands and powers (`partial` commands)
`FiscalPolicy`/`MilitaryCapabilities`/`OperationsPanel`/`MultilateralPanel` issue
engine commands; authority gating uses `hasGovernmentInformationAccess` and office
roles. `src/simulation/ui/commands.ts` is **contract-only** vocabulary (it names
commands; it is not the runtime authority check). Explicit per-action refusal
feedback (why a command is refused) is not surfaced in the UI.

### 0.33.7 — Decisions and consequences (`partial`)
Governance analysis computes consequences; commands mutate canonical state. The UI
does not yet surface execution status, uncertainty or provenance per decision.

### 0.33.8 — Time and alerts (`partial`)
`Clock` + `SimulationClock` advance logical time; `BriefingTablet` shows briefings.
Urgency/interruption states (only grave events pause) are not fully wired.

### 0.33.9 — Gameplay paths (`partial`)
Governing (fiscal), opposition (authority-gated economy read), succession
(governance), budget, crises, diplomacy and warfare paths exist. No automated
end-to-end verification of every path; no desktop smoke test.

### 0.33.10 — Creative/professional sandbox (`blocked`)
Not implemented, pending an explicit human decision (roadmap gate).

### 0.33.11 — UX review / cross-cutting audit (`—`)
The consolidated independent review of the integration delta has not run.

## Deferred engine integration (0.25–0.32 → 0.33)

The 0.26–0.32 milestones were pure contract/vocabulary layers. Their engine
integration is the substance of 0.33 and is only partially realized in the
existing shell:

- `economy`, `finance`, `resources`, `industry`, `services`, `demography`,
  `security`, `media` contracts have **no UI panels** and no engine wiring yet.
- `ui/contract.ts`, `ui/navigation.ts`, `ui/commands.ts`, `ui/frame.ts` are
  **vocabulary only** — they name the shell, they do not implement it.
- Some cross-module imports already exist (e.g. `socioeconomy/runtime.ts` uses
  `regionalCapitalCapacityUsd` from the economy module); not every V2 module is
  disconnected.

## Conclusion

0.33 is **not** functionally complete. The existing React shell covers a subset of
0.33.1/0.33.3/0.33.5/0.33.6/0.33.8/0.33.9; the remaining work is real UI wiring
(map layers, left rail, Tablet sections, decision consequences, urgency states)
plus automated playability verification and a desktop smoke test.
