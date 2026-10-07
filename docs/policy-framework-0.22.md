# 0.22 — Generic decision / policy / law framework

**Status:** implemented for independent review, not accepted. Schema 18 (unchanged).

## Purpose

Generalize the governance proposal system so it can later represent arbitrary
political decisions and laws, without yet implementing a mutable constitution,
elections, police, detailed health, etc. The validated fiscal-proposal behaviour
is preserved exactly.

## Generalized proposal model

- `ProposalKind` — machine category of a proposal. First (and currently only)
  member: `fiscal_reform`. Future milestones add members with their own typed
  payloads and effects.
- `ProposalInstrumentClass` — `administrative_action | regulatory_policy | law |
  constitutional_amendment`. A proposal records its class so future 0.23 logic
  can choose the required authority/procedure without reworking the model. The
  current fiscal reform is `law`.
- `ProposalEffect` — a typed, immutable record of the effect a proposal produced
  once it became effective. `FiscalReformEnactment` records the scheduled fiscal
  reform sequence and fingerprint; the owning fiscal subsystem applied the effect
  through its own runtime.
- `PolicyCategoryDescriptor` + `POLICY_CATEGORY_REGISTRY` — a static pedagogical
  description (summary, usage, context, tradeoffs). It is documentation, not a
  mechanic, and is never serialized into saves.

## Lifecycle (unchanged)

`draft → submitted → enacted/rejected/withdrawn/unavailable`, with the immutable
submitted-payload fingerprint, dated resolution, parliamentary/public estimates,
and the existing situational-plurality evaluation. The fiscal effect is
scheduled exactly once on adoption and never before the effective date.

## Authority

`proposalSubmitCapabilities(proposal)` is the narrow extension point mapping a
proposal to its required office capabilities. Fiscal proposals still require
`sponsor_legislation` plus `sponsor_fiscal_reform`/`sponsor_budget_reform`.
No new powers are granted to current officeholders.

## Migration

Schema stays 18. `upgradeGovernanceProposalModel` is an idempotent, derived
backfill: existing fiscal proposals gain `instrumentClass: 'law'` and a typed
effect record derived from the already-recorded `enactmentReference`. It never
replays votes, opinion or reform scheduling.

## Invariants

- `instrumentClass` must be a known class.
- `effects` must be a well-formed typed array.
- An enacted proposal records exactly one fiscal effect matching its
  `enactmentReference`; a non-enacted proposal records none.

## Information boundary

`inspectProposalSupport` remains `engine_debug_reality` (a debug inspection, not
a government estimate). The generalization does not widen what a government
estimate may access.

## Not implemented (deferred to later milestones)

Mutable constitution, elections, campaigns, new parties, active unions,
demonstrations/strikes, police, justice, intelligence, immigration, health/
housing systems, product/service economy V2, money, construction, energy,
research, diplomacy V2, military V2, and any final UI redesign.

## Tests

`src/simulation/__tests__/policyFramework.test.ts` covers: migration backfill of
pre-0.22 fiscal proposals, exactly-once effect with no re-application after
reload, no effect before adoption/rejection, descriptors absent from saves,
unknown instrument class rejected (no arbitrary effect), and the debug-reality
information boundary.
