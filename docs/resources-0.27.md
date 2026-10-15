# Resources, extraction, energy and networks — 0.27

**Status:** 0.27 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization (2026-10-15). This is
**implementation authorization, not acceptance**; no milestone is accepted
without its independent review and CI. **0.27.1 is the current sub-milestone.**
The independent parts (matter/energy taxonomy, canonical-owner inventory, open
design gates) proceed now; the conditional parts (intra-regional spatial grid,
detailed agriculture/climate/environment) are **not** decided and stay
`BLOCKED_DESIGN` until a human answers the gates below.

This document is the canonical contract for 0.27. It complements
[the roadmap decomposition](roadmap-submilestones.md) and the existing subsystem
contracts (assets 0.24, economy 0.25, trade 0.17); it does not replace them and
does not authorize implementation on its own.

## 0.27.1 scope — matter/energy taxonomy and contract

The first sub-milestone establishes the **matter/energy vocabulary** and the
**single canonical owner of every existing material/energy quantity**, without
building any new mechanism (parallel to 0.25.1 and 0.26.1):

- Inventory: resources, fuels, refined products, electricity and capacities;
  distinct scopes for reserves, deposits, production and stock.
- Determine the single canonical owner of each scope.
- Define physical units convertible only with explicit, justified factors.
- Record the open design decisions as explicit `undecided` gates.

0.27.1 introduces **no** second material store, no second production engine, no
new scheduler task, no new RNG, no migration and no new canonical-state schema.
The executable counterpart lives in `src/simulation/resources/contract.ts` and
is validated by `src/simulation/__tests__/resourcesContract.test.ts`.

## Scopes and canonical owners

| Scope | Meaning | Canonical owner |
| --- | --- | --- |
| reserve | in-situ, not yet extractable | **none yet** (0.27.2 admits dated evidence); `unavailable != 0` |
| deposit | admitted extractable | **none yet** (0.27.2 admits dated evidence); `unavailable != 0` |
| production | extracted/produced flow | `state.socioeconomy.regions[regionId].economy.output` — the one socioeconomic output engine |
| stock | stored quantity | `state.trade.countries[countryId].markets[category].stock` (`TradeStock`) — the sole stock store |

Production and stock reuse the canonical owners named in 0.25.1; no parallel
material or energy store is created.

## Physical units

Admitted units are `tonne` (mass), `cubic_metre` and `barrel` (volume), and
`megawatt_hour` (energy). Conversion across units requires an explicit,
justified conversion factor; incompatible unit mixing is rejected. A physical
quantity is never silently replaced by its dollar value.

## Admitted inventory

0.27.1 admits **no real** resource, fuel, refined-product or energy-carrier
inventory: a record is admitted only with compatible dated evidence or an
explicit synthetic label. The registries start empty so a fabricated reserve,
deposit, basin or capacity can never slip in as an observation. `unavailable != 0`.

## Open design decisions (BLOCKED_DESIGN)

1. **Intra-regional spatial grid (0.27.2).** Points, cells/grid or
   asset/deposit geometries, with what resolution and level of proof? A
   geological basin must never become point-by-point exploitable density
   without evidence.
2. **Agriculture / climate / environment (0.27.9).** Which of agriculture,
   climate, deforestation, emissions and environmental effects are actually
   validated, with which causal loops and legal powers? Do not activate any
   silently.

## Non-duplication invariants

1. **One output engine** — `state.socioeconomy` alone produces output; extraction
   constrains existing production, never a second engine.
2. **One stock store** — `state.trade` `TradeStock` alone stores physical
   quantities.
3. **One ownership map** — `state.regionOwnership` is the sole sovereignty map.
4. **`unavailable != 0`** — an unknown reserve/deposit/stock is never a zero.

Later sub-milestones must reconcile to the canonical owner named here and
register any new canonical state with `InvariantRegistry`, a dated migration
that never replays history, and save/reload + determinism + conservation
coverage.

## Deferred (not implemented)

Intra-regional spatial grid, extraction/installations (0.27.3), refining
(0.27.4), energy production (0.27.5), networks (0.27.6), and the
agriculture/climate/environment sub-systems are deferred until their
micro-blocks. 0.27 is accepted only after its complete independent audit and
green CI.
