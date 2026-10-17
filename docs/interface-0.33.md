# Final interface, playability and cross-cutting integration — 0.33

**Status:** 0.33 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization. This is **implementation
authorization, not acceptance**. **0.33.1–0.33.9 are the current sub-milestones.**

## 0.33.1 scope — interface/state contract

`src/simulation/ui/contract.ts`: the UI observes the one canonical
`SimulationState` and issues commands — never a source of truth, never a direct
mutation. Public reads are authority-free; authorized reads and commands require
real office authority; only commands mutate.

## 0.33.2–0.33.5 scope — navigation shell

`src/simulation/ui/navigation.ts`: map layers, domain bar, left rail
(advisors/actors/notifications) and right Tablet are named with visibility rules;
a layer/section is shown only when its information is available (`unavailable !=
0`, never an empty screen).

## 0.33.6 scope — commands and powers

`src/simulation/ui/commands.ts`: a UI command is authorized only by the office
actually held; unresolved authority fails closed.

## 0.33.7–0.33.9 scope — decisions, consequences, time and gameplay paths

`src/simulation/ui/frame.ts`: consequences are explained with uncertainty and
provenance; only grave/urgent alerts may pause (no mandatory hourly simulation);
gameplay paths are named without exposing non-existent engine functions.

## 0.33.10 — creative/professional sandbox (BLOCKED_DESIGN)

0.33.10 is **not implemented**: it is a proposal to validate, pending an explicit
user decision.

## Non-duplication invariants

1. **One source of truth** — `engine`; the UI never mutates canonical state.
2. **`unavailable != 0`** everywhere.

## Deferred (not implemented)

0.33.11 (UX review / cross-cutting audit) is the consolidated independent review.
0.33 is accepted only after its complete independent audit and green CI.
