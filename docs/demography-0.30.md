# Demography/migration V2, police, justice and intelligence — 0.30

**Status:** 0.30 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization. This is **implementation
authorization, not acceptance**. **0.30.4 is the current sub-milestone.** The
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

**Judicial detail degree (0.30.6).** What degree of procedural detail and what
institutional perimeter per country, without fictional generalization of laws?
**Intelligence perimeter (0.30.7).** What collection perimeter and guarantees?

## Non-duplication invariants

1. **One population** — `state.socioeconomy` cohorts are the sole population.
2. **`unavailable != 0`** everywhere.

## 0.30.2 scope — births, deaths and internal movements

The transition contract (`src/simulation/demography/transition.ts`): dated,
conserved transitions (birth/death/move_in/move_out); population never changes
magically and never goes negative. Validated by
`src/simulation/__tests__/demographyTransition.test.ts`.

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

## Deferred (not implemented)

0.30.5–0.30.10 are deferred until their micro-blocks. 0.30 is accepted only
after its complete independent audit and green CI.
