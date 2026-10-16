# Health, housing, education, social protection and public services V2 — 0.29

**Status:** 0.29 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization. This is **implementation
authorization, not acceptance**. **0.29.1–0.29.5 are implemented** (branch CI green, runs 38870564763 /
38874174997 / 38877076958 / 38880735870 / 38883713458); **0.29.6
(pensions/benefits) is in progress.** The
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

## 0.29.2 scope — health and establishments

The health contract (`src/simulation/services/health.ts`):

- care is delivered, never stocked; capacity is beds/admitted capacity
  (`null` = unavailable);
- delivery is bounded by capacity and available personnel; the shortfall is a
  queue/backlog;
- outcome is distinct from mere spending.

Validated by `src/simulation/__tests__/servicesHealth.test.ts`.

## 0.29.3 scope — medicines, consumables, energy, maintenance

The supply contract (`src/simulation/services/supplies.ts`):

- a service's physical needs are met from available stock (the canonical
  `TradeStock`); the shortfall is a supply rupture, never a fabricated quantity.

Validated by `src/simulation/__tests__/servicesSupplies.test.ts`.

## 0.29.4 scope — education and training

The education contract (`src/simulation/services/education.ts`):

- enrolment is delivered, never stocked; capacity is admitted seats
  (`null` = unavailable);
- enrolment is bounded by capacity and personnel; the shortfall is a backlog;
- a pathway graduates only after its full duration — skills/labour effects are
  temporal, never instant from spending.

Validated by `src/simulation/__tests__/servicesEducation.test.ts`.

## 0.29.5 scope — housing

The housing contract (`src/simulation/services/housing.ts`):

- housing is a stock of dwelling units with availability, quality and
  maintenance; allocation is bounded by availability and the shortfall is a
  backlog, never a fabricated unit;
- rent rules stay out of scope (`BLOCKED_DESIGN`) until the human decides the
  gate; `applyRent` fails closed.

Validated by `src/simulation/__tests__/servicesHousing.test.ts`.

## 0.29.6 scope — pensions and benefits

The benefit contract (`src/simulation/services/benefits.ts`):

- benefits are paid per documented legal eligibility, bounded by budget — never
  infinite automatic benefits and never an invented exclusion;
- the unserved eligible population is a shortfall.

Validated by `src/simulation/__tests__/servicesBenefits.test.ts`.

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
