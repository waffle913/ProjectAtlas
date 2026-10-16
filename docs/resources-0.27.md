# Resources, extraction, energy and networks — 0.27

**Status:** 0.27 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization (2026-10-15). This is
**implementation authorization, not acceptance**; no milestone is accepted
without its independent review and CI. **0.27.1–0.27.8 are implemented** (branch
CI green); **0.27.9 (consolidated review) is in progress.**
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

## 0.27.2 scope — territorial anchoring and geographic evidence

Region-level anchoring (`src/simulation/resources/anchor.ts`):

- a resource or installation is anchored to a permanent Region id — never to a
  grid cell, point or polygon;
- 0.27.2 admits whole-Region anchoring only (`precision: 'region'`); intra-region
  positioning (`documented_intra_region`) requires admitted geometry + dated
  provenance and stays `BLOCKED_DESIGN` until the spatial-grid decision;
- `unavailable != 0`: an unknown anchor is explicitly unavailable, never a
  fabricated Region or position;
- real geometry references carry dated, traceable provenance.

Validated by `src/simulation/__tests__/resourcesAnchor.test.ts`.

## 0.27.3 scope — extraction installations

The installation contract (`src/simulation/resources/installation.ts`):

- an `ExtractionInstallation` is a mine/well/quarry anchored to one permanent
  Region, extracting one resource, with an admitted `capacityPerMonth`
  (`null` = unavailable, never a fabricated zero);
- output requires operating status AND an admitted capacity; personnel, inputs
  and maintenance are validated required fields the engine later matches
  against the canonical labour/stock owners;
- ownership (sovereign owner), exploitation (operator) and effective control
  are three distinct concepts kept as three distinct ids — never conflated.

Validated by `src/simulation/__tests__/resourcesInstallation.test.ts`.

## 0.27.4 scope — refining and primary transformation

The transformation contract (`src/simulation/resources/transformation.ts`):

- a batch consumes `inputPerBatch` and produces `productPerBatch` +
  `byProductPerBatch` + `residuePerBatch` + `lossPerBatch`; the four outputs sum
  exactly to the input — **no net creation of matter**;
- output is bounded by the installation's batch capacity (saturation) and by the
  available input;
- verified losses and costs are explicit; `unavailable != 0`.

Validated by `src/simulation/__tests__/resourcesTransformation.test.ts`.

## 0.27.5 scope — energy production

The energy-plant contract (`src/simulation/resources/energy.ts`):

- a plant converts a fuel (thermal/nuclear) or a renewable flow
  (hydro/wind/solar) into electricity with an explicit efficiency and — for
  intermittent sources — an availability loss;
- electricity never comes from nothing: a fuelled plant's output is bounded by
  the fuel's energy content times the efficiency; a renewable plant's output is
  bounded by capacity and availability;
- output requires operating status and an admitted capacity; `null` capacity is
  unavailable, never a fabricated zero; water/other input dependence is
  represented only when documented.

Validated by `src/simulation/__tests__/resourcesEnergy.test.ts`.

## 0.27.6 scope — networks and accessibility

The network contract (`src/simulation/resources/network.ts`):

- a network is a set of directed links between permanent Regions, each with a
  capacity (MWh/month) and availability;
- no flow without a connection: a requested delivery with no link is curtailed
  entirely, never fabricated;
- `delivered <= requested` and `delivered <= available path capacity`; the
  shortfall is the bottleneck curtailment;
- `null` capacity is unavailable, never a fabricated zero.

Validated by `src/simulation/__tests__/resourcesNetwork.test.ts`.

## 0.27.7 scope — stocks and physical trade

The stock contract (`src/simulation/resources/stock.ts`) reconciles to the
canonical `TradeStock`:

- conservation: `opening + produced + received === consumed + exported + closing`
  exactly — no net creation or destruction by accounting;
- no negative stock: consumption is bounded by the closing stock, and the
  shortfall is a shortage, never a fabricated quantity;
- cross-resource substitution stays out of scope (`undecided` gate); a shortage
  is a shortage, never a silent replacement;
- `null` capacity is unavailable, never a fabricated zero.

Validated by `src/simulation/__tests__/resourcesStock.test.ts`.

## 0.27.8 scope — war, sovereignty and damage

The control/damage contract (`src/simulation/resources/control.ts`):

- sovereignty (owner), exploitation (operator) and effective control
  (controller) are three distinct ids; military occupation is a fourth, distinct
  fact — occupation is not sovereignty;
- the operator may exploit an installation only as the effective controller;
  sovereignty alone does not authorize exploitation under occupation;
- damage reduces capacity and is never auto-repaired at war's end; repair is
  explicit and bounded by the original capacity.

Validated by `src/simulation/__tests__/resourcesControl.test.ts`.

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

Only the conditional gates — intra-regional spatial grid and the detailed
agriculture/climate/environment sub-systems — remain deferred (`BLOCKED_DESIGN`),
together with the 0.27.9 consolidated review. 0.27 is accepted only after its
complete independent audit and green CI.
