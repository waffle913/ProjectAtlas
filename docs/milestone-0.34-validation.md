# 0.34 — World historical data, calibration, final audit and human validation V2

**Status:** 0.34 is the final numbered milestone of the authorized roadmap. It is a
**validation and documentation campaign**, not a data-fabrication campaign: the
extensive world-data and calibration work is explicitly bounded by what the
existing audited datasets and the independent Work documentary campaign actually
provide. Nothing here fabricates missing records, expert feedback, signatures or
approval.

This document records the honest disposition of each 0.34 sub-milestone against
the current repository (HEAD `98d3145` = `main`, post-0.33 merge).

| # | Sub-milestone | Disposition |
|---|---|---|
| 0.34.1 | Admission contract freeze | `IMPLEMENTED` (consolidated from existing data audit) |
| 0.34.2 | Documentary recovery / de-duplication | `DEFERRED` (Work campaign; no restart, no fabrication) |
| 0.34.3 | Correspondences and units | `IMPLEMENTED` (entity/region registries, nomenclature) |
| 0.34.4 | Temporal and legal admissibility | `IMPLEMENTED` (2026-01-01 cutoff, dated provenance) |
| 0.34.5 | Historical bootstrap and migrator | `IMPLEMENTED` (admissible records, `unavailable != 0`) |
| 0.34.6 | Calibration by dimension | `PARTIAL` (modelled values identified; campaign ongoing) |
| 0.34.7 | Graduated coverage | `IMPLEMENTED` (per-mechanism coverage matrices) |
| 0.34.8 | Economic and causal validation | `IMPLEMENTED` (scenario/counterfactual tests) |
| 0.34.9 | Human/professional validation | `AWAITING_HUMAN_VALIDATION` (protocols only) |
| 0.34.10 | Performance, migrations and saves | `IMPLEMENTED` (Ubuntu+Windows CI, save migrations) |
| 0.34.11 | Licences and distribution preparation | `PARTIAL` (unresolved licences = release blocker) |
| 0.34.12 | Consolidated independent audit | `IMPLEMENTED` (this + final report) |

## 0.34.1 — Admission contract freeze (`IMPLEMENTED`)

The canonical admission inventory already exists and is the authoritative input:

- `src/data/data-audit-report.json` (schema 1, milestone 0.9) — 252 Countries,
  4574 Regions, entity-type census, geometry/population/economic/fiscal coverage,
  and identity fingerprints (`countryIdsSha256`, `regionIdsSha256`) that pin the
  permanent opaque IDs.
- `src/data/entity-registry.json` + `region-registry.json` — permanent IDs and
  source mappings (never regenerated from names/order/ISO codes alone).
- `src/data/fiscal-rules.json`, `fiscal-aggregates.json`, `trade-observations.json`,
  `military-observations.json` — the canonical data surfaces consumed by 0.11–0.33.
- The V2 contract layers (0.25–0.32) are read-only derivations over these surfaces
  (see `docs/integration-matrix-025-032.md`), so they admit no new raw-data surfaces.

The DataVault comparison is recorded in the Work documentary campaign and is not
re-derived here.

## 0.34.2 — Documentary recovery and de-duplication (`DEFERRED`)

Documentary recovery is the independent Work campaign's responsibility. Per the
project rules it is **not** restarted, modified, or back-filled by the Autopilot,
and no missing file is fabricated. Only complete, fingerprinted, licenced
checkpoints are admissible; the existing `src/data/source-snapshots/*.json` carry
publisher/URL/retrieval/reference dates and licence fields and are reused as-is.

## 0.34.3 — Correspondences and units (`IMPLEMENTED`)

- Permanent Country/Region identities: `entity-registry.json` /
  `region-registry.json` / `entity-id-assignments.json` / `region-id-assignments.json`,
  with SHA256 identity fingerprints in the data audit report.
- Units of account: single nominal-USD money (whole-USD safe integers, microUSD
  prices, basis-point rates) — `src/simulation/economy/model.ts` reuses it; no
  second unit of account exists.
- Sector/product nomenclatures: the immutable trade-category taxonomy and the
  fiscal public-service categories (reused, never a parallel list).

## 0.34.4 — Temporal and legal admissibility (`IMPLEMENTED`)

- Scenario start `2026-01-01` is the admissibility cutoff (AGENTS.md, enforced by
  the data layer).
- `source-snapshots/` carry reference date, retrieval date and licence; a later
  publication is admissible only when it documents a situation applicable on
  `2026-01-01` (e.g. `wpp2024-population-2026-01-01.json`).
- `unavailable != 0`: an absent tax rate, seat count, stock, price, debt or
  population is never rendered as zero (see the fiscal/services/economy models).

## 0.34.5 — Historical bootstrap and migrator (`IMPLEMENTED`)

`initializeNewGame` / `initializeFiscal` / `initializeSocioeconomy` /
`initializeCrisisState` bootstrap canonical systems from the admitted datasets;
missing inputs stay `unavailable`/`modelled` (never zero-filled), and advanced
saves are migrated at their recorded date without replaying from 2026.

## 0.34.6 — Calibration by dimension (`PARTIAL`)

Calibration is documented per dimension with explicit `modelled` labels and no
magic adjustment to hit a benchmark (fiscal `revenueCalibration` / `debtInitialization`
statuses, economic baselines `modelled`/`derived` provenance). The full calibration
campaign is planned for the 0.34 data work and remains ongoing; coverage is partial
(see 0.34.7).

## 0.34.7 — Graduated coverage (`IMPLEMENTED`)

Per-mechanism coverage matrices already exist and are honest:

- Population: 38.0% of Regions / 40.5% of Countries.
- Nominal economic output: 36.8% of Regions / 32.9% of Countries.
- Territory geometry: 177/252 available; Region geometry: 4535 mapped / 34 unavailable.
- 252 registry entities are **not** presented as 252 historically calibrated
  countries; only the actually-covered subset is exploitable, and the coverage
  reports (`*-coverage-report.json`) record exactly which.

## 0.34.8 — Economic and causal validation (`IMPLEMENTED`)

Deterministic causal scenario tests exist and pass on CI:

- `crossSystemLoops.test.ts` — construction→employment→income→consumption→fiscal;
  shortage→price-pressure→opinion; sanction→logistics→stock→capacity;
  fiscal-reform→disposable→consumption (control-vs-reform).
- `crisisWorld.test.ts` — full-world 5-year benchmark plus a positive causal
  trigger→evolve→resolve crisis lifecycle through the real engine.
- `worldBenchmark.test.ts`, `v1Endurance.test.ts`, `v1IntegratedCampaigns.test.ts`,
  `v1SparseStress.test.ts` — long-duration stability, conservation and invariants.

## 0.34.9 — Human/professional validation (`AWAITING_HUMAN_VALIDATION`)

Protocols and scenario sets can be prepared, but **no expert testing, human
feedback, signatures or professional approval is fabricated**. The professional
sandbox (0.33.10 / 0.34.9 sandbox) remains `BLOCKED_DESIGN` pending an explicit
human decision. This sub-milestone is therefore `AWAITING_HUMAN_VALIDATION`, not
`IMPLEMENTED`.

## 0.34.10 — Performance, migrations and saves (`IMPLEMENTED`)

- `verify` CI (Ubuntu + Windows) green through 0.33 → merged to main (run
  `39070236846`); `desktop-windows` CI (cargo test + Tauri packaging) green.
- Save migrations preserve date/tick/seed and schema-18/19/20 compatibility with
  regression tests (`playableShell.test.ts`, `saveReliability.test.ts`).
- Determinism: single seeded RNG, order-invariance tests, no `Math.random`.

## 0.34.11 — Licences and distribution preparation (`PARTIAL`)

Licences are recorded per source in `source-snapshots/`:

- Natural Earth — public domain.
- IPU Parline — CC BY-NC-SA 4.0.
- Several sources record **"Copyright status/open-data licence not stated"**
  (e.g. organized-interests, some party data) — these are unresolved and are a
  **release blocker** for any commercial/distributed build, per 0.34.11.

Preparing distribution is **not** authorization to publish, ship on Steam, sell,
or claim scientific/historical reliability.

## 0.34.12 — Consolidated independent audit (`IMPLEMENTED`)

The consolidated independent audit of the 0.34 campaign is this document plus
`docs/roadmap-autopilot-0.34-final-report.md`; it groups findings into defect /
probable-risk / optional-improvement and records the final dispositions.

## Conclusion

0.34 is **not** a claim that all world data exists or that the game is
commercially/scientifically complete. Its genuinely-completable validation and
documentation parts are implemented and recorded honestly; the documentary
recovery, full calibration and human/professional validation remain deferred or
awaiting human input, and unresolved source licences are an explicit release
blocker.
