# Deeper industry, goods/services, research and technology — 0.28

**Status:** 0.28 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization (2026-10-15). This is
**implementation authorization, not acceptance**; no milestone is accepted
without its independent review and CI. **0.28.1–0.28.4 are implemented** (branch
CI green, runs 38845742726 / 38848441311 / 38850692395 / 38853385325); **0.28.5
(research projects) is in progress.**
The independent parts (product/sector/nomenclature vocabulary, transformation
chains, capacities, service sectors, research, diffusion, military/civilian
technology) proceed now; the conditional part (detailed competition/monopoly
market structures) is **not** decided and stays `BLOCKED_DESIGN`.

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
- production is bounded by available inputs and batch capacity; energy and
  personnel are validated requirements, never part of the matter identity;
- `null` capacity is unavailable, never a fabricated zero.

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
- delivery is bounded by capacity and available personnel; undelivered demand is
  a shortfall, never a stored quantity;
- `null` capacity is unavailable, never a fabricated zero.

Validated by `src/simulation/__tests__/industryService.test.ts`.

## 0.28.5 scope — research projects

The research contract (`src/simulation/industry/research.ts`):

- a project advances only with schedule, funding and researchers; no instant
  discovery caused by a budget;
- completion is schedule-only (full duration elapsed);
- risk is a documented/modelled bps figure, never a hidden random roll.

Validated by `src/simulation/__tests__/industryResearch.test.ts`.

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

Transformation chains (0.28.2), capacities/bottlenecks (0.28.3), service sectors
(0.28.4), research projects (0.28.5), diffusion/adoption (0.28.6),
military/civilian technology (0.28.7), competition/market structures (0.28.8,
`BLOCKED_DESIGN`) and validation (0.28.9) are deferred until their micro-blocks.
0.28 is accepted only after its complete independent audit and green CI.
