# Economy V2 — 0.25.12 Consolidated independent audit

Scope: full 0.25 delta on `waffle913-economy-v2-025` vs merge-base `3ecaee7`
(23 commits, 31 files, +3496/−37). Audited by an isolated review subagent
(`tool:review`, ref `sa_20261015_033507_000000000_ca30179ce5c8`) plus this
milestone's performance/triage pass. Verdict: **warn — no default-path blocker**.

The 0.25 layer is confirmed **pure read-only** over the canonical
`SimulationState`: it adds no save schema, no migration, no second engine. The
ownership registry and taxonomies do not duplicate canonical state,
`inspectEconomy` is authority-gated and non-mutating, and the `fiscal.ts` tax
mirror matches `taxRegion` line-for-line at region scope.

## A. DEFECT FINDINGS — Bugs certains

### A1 — `employment.ts:80` wage-bill conservation breaks for multi-activity sets
- **Severity:** BLOCKING_CRITICAL (conservation invariant).
- **Evidence:** `wageBillUsd = ratio(householdIncome, employedPersons, employed)` rounds
  half-up per activity; the module's stated invariant is `sum(wageBillUsd) === householdIncome`.
  Example: H=10, E=3, three equal activities → 3×3 = 9 ≠ 10.
- **Cause:** per-activity rounding instead of largest-remainder allocation.
- **Consequence:** any future caller that decomposes labour across multiple productive
  activities silently loses/gains income, breaking accounting conservation.
- **Latent today:** the default `decomposeRegionalProduction` yields exactly one
  non-zero-output activity, so the current test passes vacuously.
- **Fix:** distribute `householdIncome` across activities with `allocate` (largest remainder).

## B. PROBABLE RISKS — Risques probables

### B1 — `fiscal.ts:157` country-level `reconciled` overclaims
- **Evidence:** country `reconciled` is derived only from region ledgers, but the
  returned country `taxes`/`derivedKnownTaxRevenueUsd` exclude military-payroll tax and
  customs while canonical `account.taxes`/`knownTaxRevenue` include them.
- **Trigger:** any Country with a military payroll (or customs) reports `reconciled`
  while its aggregate does not match the ledger.
- **Fix:** reconcile the country aggregate against `account.taxes` and document the
  military/customs exclusion.

### B2 — `firms.ts:42` pre-fiscal fallback doubles surplus
- **Evidence:** before fiscal init `labourCostUsd = householdIncome` and
  `businessSurplusUsd = output − labourCost`, omitting `wageIncomeBps`/`surplusBps`/corporate
  tax — about 2× the canonical surplus, with a discontinuity at fiscal init.
- **Context:** intentional and asserted by `economyFirms.test.ts` ("falls back … before
  fiscal initialization"); it only affects the transient pre-fiscal view.
- **Triage:** DEFERRED_DEFECT — align the fallback with `FISCAL_MODEL.surplusBps` in a later
  pass; no critical downstream dependency.

### B3 — `production.ts:195` unit-mismatch returns a binding 0
- **Evidence:** `regionalCapitalCapacityUsd` skips unit-mismatched assets inside the loop
  yet returns `0` when every mapped asset is unit-mismatched, contradicting the
  "skip unit mismatches" comment and zeroing production where there is no binding.
- **Trigger:** a Region whose only mapped assets use an incompatible capacity unit.
- **Fix:** return `undefined` (no binding) when no mapped asset has a compatible unit.

## C. OPTIONAL IMPROVEMENTS — Améliorations (non bloquantes)

1. `production.ts:263` — stock-conservation check uses `number` addition (canonical uses BigInt).
2. `production.ts:232` — no `quantityPerOutputUsd > 0` guard (0 → infinite ceiling).
3. `production.ts:325` — asset activities hardcode the global registry and stay
   `capacityUsd=0` even when mapped; iterated unsorted.
4. `tradeIntegration.ts:54` — trade balance mixes FOB exports with landed imports.
5. `prices.ts:53` / `inspect.ts:70` — the modelled domestic price index never persists a
   prior, so each inspection restarts at baseline.
6. `fiscal.ts:85` — the view is more lenient than `tradePurchasesFor`'s throw on missing
   landed-expenditure evidence.
7. `economyFiscal.test.ts:134` — one tautological assertion; no `runFiscalMonth`
   reconciliation test at country scope.
8. `vite.config.ts:10` — the test `exclude` override drops vitest's other default excludes
   despite the "superset" comment.
9. `production.ts:183` — scans all assets per region every call even when the registry is
   empty (hot path via `socioeconomy.runtime` monthly).

## Triage

| Id | Disposition | Action |
| --- | --- | --- |
| A1 | BLOCKING_CRITICAL | Fix now (largest-remainder wage bill) + regression test |
| B3 | BLOCKING_CRITICAL | Fix now (unit-mismatch → no binding) + fold C9 early-return |
| B1 | BLOCKING_CRITICAL | Fix now (honest country `reconciled`) + test |
| B2 | DEFERRED_DEFECT | Documented; align fallback with `FISCAL_MODEL` in a later pass |
| C1–C9 | OPTIONAL_IMPROVEMENT | Documented, not applied in this batch (C9 folded into B3) |

Performance: reused the 4 existing world benchmarks (`worldBenchmark.test.ts`); the 0.25
layer is off the scheduler hot path except `regionalCapitalCapacityUsd` (C9, fixed here).
CI verify (Ubuntu + Windows) is the reproducible measurement environment.
