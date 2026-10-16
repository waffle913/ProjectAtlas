# Health, housing, education, social protection and public services V2 — 0.29

**Status:** 0.29 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization. This is **implementation
authorization, not acceptance**. **0.29.1 is the current sub-milestone.** The
independent parts proceed now; the conditional part (rent rules) is **not**
decided and stays `BLOCKED_DESIGN`.

This document is the canonical contract for 0.29. It complements
[the roadmap decomposition](roadmap-submilestones.md) and the existing subsystem
contracts (fiscal 0.11, socioeconomy 0.10, assets 0.24); it does not replace
them and does not authorize implementation on its own.

## 0.29.1 scope — service/capacity/access contract

The first sub-milestone names where each public service already lives, without
building a second budget or population (parallel to 0.25.1/0.26.1/0.27.1/0.28.1):

- budget is the fiscal engine only;
- personnel and cohorts are the socioeconomic engine only;
- establishments are the 0.24 asset store only;
- access is gated by rights, office authorization or universality, never a magic
  service.

The executable counterpart lives in `src/simulation/services/contract.ts` and is
validated by `src/simulation/__tests__/servicesContract.test.ts`.

## Open design decisions (BLOCKED_DESIGN)

**Rent rules (0.29.5).** Should rents and rental rules be simulated in this
version? Do not activate without an explicit decision.

## Non-duplication invariants

1. **One budget** — `state.fiscal` alone books service spending; no second budget.
2. **One population** — `state.socioeconomy` cohorts are the sole population.
3. **One asset store** — establishments are 0.24 assets.
4. **`unavailable != 0`** everywhere.

## Deferred (not implemented)

Health/education/pensions/incomeSupport/infrastructure/administration mechanisms
(0.29.2–0.29.8), rent rules (0.29.5, `BLOCKED_DESIGN`) and validation (0.29.9)
are deferred until their micro-blocks. 0.29 is accepted only after its complete
independent audit and green CI.
