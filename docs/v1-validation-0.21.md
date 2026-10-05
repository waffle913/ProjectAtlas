# V1 validation and long-duration coherence — 0.21

**Status:** implemented for independent review, not accepted.
Parent: 0.20 candidate `3b426f0fe34a9139bdad966cf4b8dc2dcb78ea50`, save schema 18 (unchanged).

## Validation architecture

0.21 is a validation and correction milestone, not feature expansion. It runs
campaigns over the existing V1 systems and corrects root causes in consolidated
batches, then records a single final consolidated review.

Commands added:

- `npm run v1:endurance` — full-world 365-day baseline with monthly invariant
  validation and bounded diagnostics.
- `npm run v1:audit` — orchestrates `data:audit`, `military:audit`,
  `trade:audit`, `international:audit`, `operations:audit`,
  `multilateral:audit` and `v1:endurance`.

## Campaigns executed

- **Phase A (static coherence):** no `Math.random`/`Date.now`/`performance.now`
  in simulation runtime; all `new Date(...)` uses are deterministic ISO parsing.
- **Phase B (baseline endurance):** 365 simulated days over 252 Countries /
  4574 Regions with 12 monthly invariant passes; population conserved at
  8,264,575,700; unavailable coverage preserved.
- **Phases C–F (stress):** 609 tests across fiscal/crisis/trade/international/
  operations/war/multilateral/governance/politics suites exercising the legal →
  fiscal → economic → crisis/opinion, trade → sanctions, capability → combat →
  occupation → settlement, and treaty → obligation → effect chains.
- **Phases G–H (fidelity + save/reload):** 57 engine/snapshot/clock tests plus
  the deterministic round-trip/continuation suites; no canonical quantity is
  created or destroyed on fidelity transition or reload.
- **Phase I (sparse performance):** endurance 365 days ≈ 37s; sparse subsystem
  benchmarks ≈ 3–4s per 31 days; trade scaling confirms no full-route rescan.

## Cross-system defect discovered and corrected

- **Canonical population/output divergence (critical).**
  `initializeSocioeconomy` computed the full observed + modelled population into
  `socioeconomy.regions` but never wrote it back to the canonical
  `populationByRegion` / `economicOutputByRegion` maps, leaving them at the
  observed-baseline subset (≈3.17B) while the simulation used ≈8.26B. This was a
  silent source-of-truth conflict that would undercount `controlledBaselinePopulation`
  and later territory accounting. Root-cause fix: initialize the canonical maps
  from the initialized socioeconomic regions, and add an invariant that a
  Region's socioeconomic population must equal `populationByRegion`.

## Long-duration results

`V1_ENDURANCE { days: 365, monthlyChecks: 12, startPopulation: 8264575700,
endPopulation: 8264575700, tradeFlows: 0, briefings: 0, elapsedMs: ≈37000 }`.

## Determinism / save equivalence

Same seed + same actions reproduce the same result; reload continuation is
equivalent; unrelated insertion order does not perturb keyed outcomes; no
wall-clock-derived simulation choices remain.

## Fidelity

Detailed/Standard/Background transitions conserve all mutable canonical state
(population, debt, money, personnel, equipment, stocks, sovereignty, occupation,
treaty history, political state).

## Remaining known limitations (non-blocking, deferred post-V1)

- Naval/air/missile warfare and deep strategic AI.
- Detailed police/intelligence/crime and company/banking micro-simulation.
- Infrastructure/energy expansion and detailed secondary-component effects.
- Advanced treaty negotiation and factual 2026 military baseline.
- No release tag is created by this milestone.
