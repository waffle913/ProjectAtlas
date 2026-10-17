# Deeper industry, goods/services, research and technology — 0.28

**Status:** 0.28 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization (2026-10-15). This is
**implementation authorization, not acceptance**; no milestone is accepted
without its independent review and CI. **0.28.1–0.28.7 are implemented** as a
pure contract/vocabulary layer and **technically validated** (Round 2 pass;
merged to `main`, main CI green run 38866968841). The conditional part (detailed
competition/monopoly market structures, 0.28.8) is **not** decided and stays
`BLOCKED_DESIGN`. Engine integration (canonical state, scheduler, save,
invariants) is deferred to the roadmap validation milestones (0.28.9 → 0.33),
not implemented here.

This document is the canonical contract for 0.28. It complements
[the roadmap decomposition](roadmap-submilestones.md) and the existing subsystem
contracts (economy 0.25, trade 0.17, assets 0.24); it does not replace them and
does not authorize implementation on its own.

## 0.28.1 scope — product, sector and nomenclature contracts

The first sub-milestone establishes the **product/sector/nomenclature
vocabulary** and the **admission rule**, without building any mechanism
(parallel to 0.25.1/0.26.1/0.27.1):

- product/sector/activity identifiers are permanent and opaque;
- the external documentary classifications `isic`/`nace`/`hs`/`cpc`/`prodcom` are
  named but never equated abusively — an HS code is not a sector, a NACE class
  is not a PRODCOM product;
- a nomenclature mapping is a dated, traceable correspondence; it is admitted
  only with compatible dated evidence or an explicit synthetic label;
- `unavailable != 0`: an unknown product/sector is never a fabricated zero.

0.28.1 introduces **no** second production engine, no second goods list and no
second stock store. The executable counterpart lives in
`src/simulation/industry/contract.ts` and is validated by
`src/simulation/__tests__/industryContract.test.ts`.

## 0.28.2 scope — transformation chains

The industrial-process contract (`src/simulation/industry/process.ts`):

- a batch conserves matter exactly: sum of input quantities === sum of output +
  by-product + residue quantities + documented material loss (no net creation);
  every quantity shares the process's single declared `unitOfAccount`, so
  incompatible units are never summed implicitly;
- production is bounded by available inputs, batch capacity and the available
  energy/personnel/funds; energy/personnel/cost are validated requirements,
  never part of the matter identity;
- `null` capacity is unavailable: `runProcess` fails closed rather than producing
  unbounded batches; results are safe integers (overflow fails closed).

Validated by `src/simulation/__tests__/industryProcess.test.ts`.

## 0.28.3 scope — capacities and bottlenecks

The capacity contract (`src/simulation/industry/capacity.ts`):

- effective batches per month are bounded by utilization and maintenance
  outage, never negative;
- `planBatches` bounds production by effective capacity AND material inputs, and
  reports which constraint binds (capacity or a specific input);
- expansion happens through 0.24 construction, never magically.

Validated by `src/simulation/__tests__/industryCapacity.test.ts`.

## 0.28.4 scope — service sectors

The service-sector contract (`src/simulation/industry/service.ts`):

- a service is delivered, not stocked: it has no material inventory, only
  capacity, personnel, cost, revenue and material purchases;
- delivery is bounded by capacity, available personnel, available funds (the
  monthly operating cost) and the availability of the declared purchases — a
  service cannot operate through a budget or purchase shortage; undelivered
  demand is a shortfall, never a stored quantity;
- `null` capacity is unavailable and yields an `unavailable` result, never a
  fabricated zero or shortage.

Validated by `src/simulation/__tests__/industryService.test.ts`.

## 0.28.5 scope — research projects

The research contract (`src/simulation/industry/research.ts`):

- a project advances only with schedule, funding and researchers; no instant
  discovery caused by a budget;
- completion is schedule-only (full duration elapsed);
- risk is a documented/modelled bps figure, never a hidden random roll.

Validated by `src/simulation/__tests__/industryResearch.test.ts`.

## 0.28.6 scope — diffusion and adoption

The diffusion contract (`src/simulation/industry/diffusion.ts`):

- adoption advances through investment and equipment replacement over time,
  bounded by supply and the 10,000 bps ceiling;
- adoption is never free or instant: a record must carry at least one causal
  constraint (positive investment or equipment requirement) and each step
  actually consumes that investment/equipment;
- adoption affects material processes, never a global GDP bonus.

Validated by `src/simulation/__tests__/industryDiffusion.test.ts`.

## 0.28.7 scope — military/civilian technology

The technology-link contract (`src/simulation/industry/technology.ts`):

- a technology links to the production capacity of equipment/goods (0.16
  military, 0.24 assets, 0.25 production);
- it applies a production-capacity effect, never a military-readiness change
  (that stays in 0.31);
- `null` capacity stays unavailable.

Validated by `src/simulation/__tests__/industryTechnology.test.ts`.

## Open design decisions (BLOCKED_DESIGN)

**Competition / market structures (0.28.8).** Which detailed competition,
concentration or monopoly mechanisms and antitrust powers are actually
validated, with which market rules and legal powers? Do not activate any
silently.

## Non-duplication invariants

1. **One output engine** — `state.socioeconomy` alone produces output; industrial
   transformation constrains existing production, never a second engine.
2. **One goods vocabulary** — the trade category taxonomy (0.17/0.25) remains the
   aggregate goods list; finer products are admitted only with dated evidence.
3. **One stock store** — `state.trade` `TradeStock` alone stores physical
   quantities.
4. **`unavailable != 0`** everywhere.

## Deferred (not implemented)

- Detailed competition/monopoly market structures (0.28.8, `BLOCKED_DESIGN`).
- Engine integration: the 0.28 primitives are a pure contract layer with no
  canonical state, scheduler, save or migration; wiring them into
  `SimulationState` is deferred to the roadmap validation milestones (0.28.9 →
  0.33). 0.28 is accepted only after its complete independent audit and green CI.
