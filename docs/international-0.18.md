# International tensions, crises and sanctions — 0.18

**Status:** implemented for independent review, not accepted.
Parent: 0.17 candidate `a4e27364fdcffc2a165c71f5a67fffbad869c2ba`.

## Scope and architecture

0.18 adds a bounded canonical `international-0.18-v1` domain separate from the
domestic 0.12 crisis engine. International episodes concern bilateral Country
pairs, directional actions, and foreign-policy history. Save schema is bumped
from 15 to 16.

The causal chain is:

represented issues / actions
-> sparse bilateral tension
-> deterministic international crisis lifecycle
-> legal trade restrictions
-> actual 0.17 route eligibility / flows / prices / stocks / receipts
-> existing socioeconomic, fiscal and domestic-crisis observation

No relation-score or hostility threshold ever declares war. Explicit force,
military operations, fronts and territorial control remain 0.19. Treaties and
multilateral machinery remain 0.20.

## Canonical state

`SimulationState.international`, version `international-0.18-v1`, holds:

- `actions` / `actionOrder`: bounded dated directional actions.
- `episodes`: sparse bilateral pair episodes, keyed by canonical sorted Country
  IDs, each with phase, severity, pressure, inspectable drivers and bounded
  history.

Schema 15 -> 16 migration preserves all 0.17 trade, military, politics,
governance, information, domestic crises, relations, claims, CBs, wars,
occupations, ownership, date/tick/RNG, and initializes empty international
coverage at the saved date. No replay or retroactive sanctions.

## Actions

- `condemnation`: public directional diplomatic action; dated history and
  tension pressure only, no direct economic penalty.
- `import_restriction`: actor restricts imports from target for selected trade
  categories.
- `export_restriction`: actor restricts exports to target for selected
  categories.
- `lift_sanction`: prospectively ends a restriction. Historical flows are never
  rewritten.

Sanctions block matching 0.17 route direction/category at execution time; routes,
capacity, provenance and previous flows remain intact. Lifting restores future
eligibility.

Unsupported in 0.18 because no full banking/capital system exists: asset freezes,
SWIFT exclusion, reserve seizure, banking/capital sanctions, and secondary
sanctions. These remain explicit V1 limitations.

## Tension and lifecycle

Only pairs with represented drivers maintain state. Drivers include active
territorial claims, active restrictions, reciprocal coercion, and recent
condemnations. The lifecycle is `NORMAL -> PRESSURE -> ACTIVE -> RECOVERING ->
NORMAL` with deterministic persistence and hysteresis. Activation requires
three dangerous evaluations at or above modelled pressure.

## Authority and information

The player controls a person. Actions require the controlled active person to
hold a resolved head-of-government or head-of-state office with government
information access. This is an explicit modelled executive abstraction, not a
factual constitutional claim.

Public condemnations and sanctions are public facts. Internal assessments
(dependency exposure, pressure, drivers, severity) are government-gated and
stale-safe; the UI never reads live canonical international state.

## Scheduler and performance

`international.monthly` runs at priority 320, after trade/material crises and
before Information retention. State is sparse and keyed by active pairs and
actions; no all-pairs 252x252 scan exists. Trade sanction lookup is O(active
actions) per route.

## Factual coverage and synthetic assumptions

No factual 2026 sanctions baseline is fabricated. Operative sanctions coverage
starts unavailable; synthetic tests exercise the engine. No new real-world
dataset is imported.

## Validation

Run `npm run international:audit`, `npm run trade:audit`, `npm run trade:benchmark`
and the full `npm run verify -- -- --maxWorkers=1`.
