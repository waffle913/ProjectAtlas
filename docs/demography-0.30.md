# Demography/migration V2, police, justice and intelligence — 0.30

**Status:** 0.30 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization. This is **implementation
authorization, not acceptance**. **0.30.9 is the current sub-milestone.** The
independent parts proceed now; the conditional parts (judicial detail degree,
intelligence perimeter) stay `BLOCKED_DESIGN`.

## 0.30.1 scope — cohort and transition contracts

The first sub-milestone reuses the single 0.10 population (nine income×orientation
cohorts) — never a second population — and names cohort transition statuses
(resident / migrant_in / migrant_out / deceased / born) and the
observed/modelled/unavailable distinction. `unavailable != 0`.

Executable counterpart: `src/simulation/demography/contract.ts`; validated by
`src/simulation/__tests__/demographyContract.test.ts`.

## Open design decisions (BLOCKED_DESIGN)

0.30.6 and 0.30.7 are **not implemented** in this milestone. Both are gated on a
human design decision (roadmap open design gate #5) and cannot be started without
inventing a procedural/institutional perimeter:

**Judicial detail degree (0.30.6).** What degree of procedural detail and what
institutional perimeter per country, without fictional generalization of laws?
→ `BLOCKED_DESIGN`: no justice primitives are added until this is decided.

**Intelligence perimeter (0.30.7).** What collection perimeter and guarantees?
→ `BLOCKED_DESIGN`: no intelligence primitives are added until this is decided.

## Non-duplication invariants

1. **One population** — `state.socioeconomy` cohorts are the sole population.
2. **`unavailable != 0`** everywhere.

## 0.30.2 scope — births, deaths and internal movements

The transition contract (`src/simulation/demography/transition.ts`): dated,
conserved transitions — `birth`/`death` change a cohort intrinsically, and an
internal movement is an atomic, conserved `move` transfer between two cohorts
(never two independent `move_in`/`move_out` deltas that could create
population). Population never changes magically and never goes negative.
Validated by `src/simulation/__tests__/demographyTransition.test.ts`.

## 0.30.3 scope — international migration

The migration contract (`src/simulation/demography/migration.ts`): conserved
flows between origin and destination (entries/exits, net migration), no double
counting; migration never changes sovereignty. Validated by
`src/simulation/__tests__/demographyMigration.test.ts`.

## 0.30.4 scope — legal statuses and integration

The legal-status contract (`src/simulation/demography/legalStatus.ts`): a legal
status is only asserted against an explicitly documented legal instrument
(citizenship / residence / work / family / protection); an unknown rule is
`unavailable`, never zero rights and never zero service access. Social
integration is a contextualized material mechanism (residence duration,
employment, service access), never an arbitrary cultural-conformity gauge.
Validated by `src/simulation/__tests__/demographyLegalStatus.test.ts`.

## 0.30.5 scope — police

The police contract (`src/simulation/security/police.ts`): police resources stay
in their canonical owners (personnel = socioeconomy, stations = 0.24 assets,
budget = fiscal — no second population/asset/budget). A legal order is authorized
only by the office/institution that actually holds police power under the
0.14/0.23 model (parliamentary head of government, presidential head of state, or
the interior-portfolio minister); unresolved authority fails closed. Deployment
is bounded by real personnel availability and typed by availability — an
unavailable or paused station never fabricates a shortage. Validated by
`src/simulation/__tests__/police.test.ts`.

## 0.30.8 scope — security, events and consequences (deferred)

0.30.8 is **not implemented** in this milestone. It depends on 0.30.6 (justice —
rights violations) and on demonstrations (reserved for a later public-actions
milestone, per `AGENTS.md`); its independent law-enforcement core is already
covered by 0.30.5. No security-event or "repression" mechanism is added until
those dependencies are decided.

## 0.30.9 scope — interconnections

Contract-level interconnection coverage
(`src/simulation/__tests__/demographyInterconnections.test.ts`): population
conservation across births/deaths/internal moves/international migration; legal
status → service access → contextual integration; police order authority gating
and availability-typed deployment. Engine wiring of these contracts (cadences,
scheduler, opinion) stays deferred to the 0.33 integration milestone — no
concurrent loop is introduced here.

## Deferred (not implemented)

0.30.6 (justice), 0.30.7 (intelligence) and 0.30.8 (security/events) are
`BLOCKED_DESIGN`/deferred (see above). 0.30.10 (validation) is the consolidated
independent review. 0.30 is accepted only after its complete independent audit
and green CI.
