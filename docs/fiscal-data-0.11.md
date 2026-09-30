# Fiscal data audit — 0.11

The schema 8 audit found current regional income, employment, consumption and output, but no corporate accounts, statutory tax rules, FX, public debt or public-service observations. Historical population/output maps remain audit references only. The existing scheduler, immutable snapshot cache, invariant registry and save migration are reused. No second economy or clock is introduced.

## Legal schema and source boundary

`src/data/fiscal-rules.json` pins factual extracts, original limitations and exact document references. Each record carries permanent Country ID, category, rate/bands/allowance or payroll components, currency, annual monetary unit, effect/reference/retrieval dates and federal scope. All five initial extracts are **partial**, because national tax systems have material excluded cases. No source text or third-party tables are redistributed. A SHA-256 digest in the generated coverage report pins these extracts, not the remote pages. Updating sources requires explicit review and regenerating coverage.

US 2026 single-filer PIT is documented by IRS Rev. Proc. 2025-32. Payroll uses IRS Publication 15 (2026). US general corporate tax follows 26 USC 11 and its 2017 amendment applicability note. Canadian federal GST and general corporate rates use CRA tables and original government effective-date announcements. No Canadian currency thresholds are used: proportional rates can apply to USD bases without FX conversion. Any later monetary Canadian rule needs dated sourced FX before use.

## Coverage before engine implementation

Initial legal coverage: personal 1 partial; consumption 1 partial; payroll 1 partial; corporate 2 partial. All other country/category combinations are unavailable, with no numeric substitute. This is deliberately incomplete coverage, not a claim of globally accurate fiscal outcomes. Collection efficiency, business surplus, taxable consumption share, beneficiaries, budget, treasury/debt and service initialization are separate **modelled** assumptions. `fiscal-aggregates.json` is the independent input for compatible dated observations of aggregate national revenue or debt; it currently has no accepted records, so coverage remains explicitly unavailable rather than zero. Revenue from known statutory components remains distinct from the fixed aggregate/residual financing calibration.

The per-Country legal report is distinct from `fiscal-initialization-report.json`, generated from actual engine initialization. The latter reports 209 Countries with complete economic bases and 43 without usable economic bases; all 252 receive an explicit fiscal status. There are no world-average substitute rates and no inference from government type.

## Integration plan

1. Validate these data and their 252-Country coverage before fiscal formulas.
2. Add national fiscal accounts, region household flow ledgers and dated reform queue to schema 9; preserve all schema 8 economic values in migration.
3. Shared monthly order: economy, fiscal collection and financing, household transfers and services, administrative reporting. The following month uses disposable income. Daily work checks the reform queue only.
4. Keep tax liability distinct from collected cash; reconcile household, treasury and debt stocks/flows. Service stocks adjust progressively. Employer employment incidence and retained-profit investment remain deferred.
5. Integrate invariants, debug inspection, migration, causal tests, world benchmark and fiscal audit. No 0.12 crises, politics, inflation, debt markets or regional governments.
