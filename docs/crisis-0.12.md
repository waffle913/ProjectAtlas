# Generic crisis and tripwire engine 0.12

## Contract

The crisis layer is exact simulation reality. It observes existing socioeconomic and fiscal results; it does not change output, employment, taxes, services, transfers, diplomacy or politics. A crisis therefore records and explains a material condition rather than applying another abstract penalty. Public perception, unrest, political reactions and imperfect information remain deferred.

Schema 10 adds `SimulationState.crisis` with model version `crisis-0.12-v1`. Every Country has one current monitor for each V1 type and at most 24 completed summaries. The V1 types are `fiscal_stress`, `public_service_degradation`, `household_distress`, `transfer_system_stress` and `infrastructure_degradation`. IDs have the deterministic form `crisis:{countryId}:{type}:{episodeOrdinal}`. Resolution increments the ordinal, so recurrence never reuses an episode ID.

`initializeNewGame()` composes socioeconomic, fiscal and crisis initialization. Once the Country registry is loaded, it creates all five `NORMAL` monitors for every Country at the current date. This is initialization only: it leaves pressure, history, evaluation count and `lastMonthlyDate` empty until the first scheduled monthly evaluation. Schema 9→10 migration retains the same current-date initialization rule.

The shared scheduler runs `crisis.monthly` at priority 300, after monthly economy (100), fiscal/services (150) and administration (200). It aggregates current Region economies once by owner Country and never scans cohorts. It has no daily task or private clock. Its copy-on-write branch changes only on monthly evaluation; normal daily UI snapshots reuse it.

## State machine and diagnostics

The state machine is `NORMAL → PRESSURE → ACTIVE → RECOVERING → NORMAL`. The phase and quantitative severity (`none`, `low`, `moderate`, `severe`, `critical`) are separate. Each tripwire exposes its stable ID, source system, indicator, basis-point value, danger and recovery thresholds, exceedance, dangerous and recovery persistence, severity/persistence/deterioration contributions, total pressure contribution and provenance. Episode pressure is exactly the sum of tripwire contributions. Debug inspection is available through `inspectCrises(state, countryId)`.

Entry and recovery thresholds differ. A brief danger enters `PRESSURE` but two improved evaluations resolve it without activation. Tipping requires at least three dangerous evaluations, two dangerous tripwires and 18,000 pressure. `ACTIVE` needs two improved evaluations to enter `RECOVERING`; three further improved evaluations resolve the episode. A material relapse returns `RECOVERING` to `ACTIVE`.

Tipping is the only random operation. Below eligibility its probability is exactly zero. Eligible checks use the shared deterministic RNG with entity key `crisis:{countryId}:{type}:{date}:{episodeOrdinal}`; Country iteration is sorted and no global stream is consumed. Activation retains the key, roll, chance and a defensive snapshot of its tripwires.

## Modelled constants

All thresholds, weights and hazard parameters below are modelled engineering assumptions, not sourced national observations. They are centralized in `CRISIS_MODEL`.

- Severity starts at 1/12,000/24,000/40,000 pressure for low/moderate/severe/critical.
- Persistence adds 500 pressure per dangerous month per tripwire, capped at 3,000.
- A stress numerator above zero with a zero denominator uses a deterministic 30,000 bps maximum. A zero numerator over a zero denominator is neutral. This degenerate-stress cap is modelled and recorded in tripwire provenance.
- Eligible hazard starts at 1,000 bps, adds `(pressure - 18,000) / 4`, 400 bps per month beyond minimum persistence, 250 bps per dangerous tripwire and deterioration/10, capped at 9,000 bps.
- Fiscal danger/recovery: unpaid commitments to revenue 1,500/400 bps; interest burden 1,800/1,000; debt to annual output 9,000/7,000; deficit to output 800/200.
- Public services: health/education coverage 8,000/9,000 bps (lower is worse); underfunding 1,500/500; backlog 4,000/1,000.
- Infrastructure: coverage, funded capacity and executed spending 8,500/9,300 bps (lower is worse); backlog 3,000/1,000.
- Transfers: pension and income-support gaps 1,500/500 bps; transfer arrears 1,000/200; execution 8,500/9,500 (lower is worse).
- Households: unemployment 1,500/900 bps; employment loss 1,000/500; disposable-income decline 1,000/300; basic-needs coverage 8,500/9,300 (lower is worse); shortage 1,000/300; consumption coverage 9,000/9,700 (lower is worse).

Fiscal financing provenance is copied into fiscal tripwire diagnostics. A `modelled` financing baseline remains simulated reality and receives no penalty. Unavailable tax laws are not tripwires. Unavailable service/economic coverage is not treated as zero performance.

Ratios have explicit semantics. Stress ratios distinguish normal division, zero exposure and a positive exposure with no denominator. Coverage ratios with no reference denominator are unavailable and their tripwire is omitted; they are never represented as 0% coverage. Nullable precomputed indicators from 0.10/0.11 are likewise omitted rather than coerced to observed zero. This applies to fiscal burden/output ratios, service and transfer execution, employment, shortages, basic needs and household consumption.

## Saves, fidelity and limits

Migration 9→10 preserves every saved field and initializes empty Country monitors at the save's current date. It performs no retroactive evaluation and creates no history. Schema-10 save/reload preserves complete current episodes, history, persistence, ordinals and activation RNG evidence. Crisis state is part of fidelity conservation and core invariants.

History is bounded to 24 completed episodes per Country. It retains start, activation, recovery and end dates, maximum pressure/severity, dominant activation drivers and resolution drivers, rather than every monthly sample.

The current engine has no direct crisis effects, causal links from one crisis score to another, manual resolve command, political crisis, unrest, famine, energy/banking/trade/pandemic/migration crisis, sanctions or war crisis. Future systems must change underlying variables and let these monitors observe the result.

Run `npm run crisis:audit` for focused behavioral checks, `npm run crisis:benchmark` for the five-year 252-Country validation, and `npm run benchmark:world` for the complete shared runtime benchmark.
