# Diplomacy / strategic trade and military V2 — 0.31

**Status:** 0.31 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization. This is **implementation
authorization, not acceptance**. **0.31.4 is the current sub-milestone.**

## 0.31.1 scope — actor and commitment contract

The actor/commitment contract (`src/simulation/diplomacy/contract.ts`): names the
canonical owners of diplomatic actors, relations, disputes, decisions, clauses
and obligations — never a second treaty system — and defines the mandate an
actor must actually hold to act diplomatically (parliamentary head of government
or presidential head of state; unresolved fails closed; ministers hold no
diplomatic capability in the current 0.14/0.23 model). A `DiplomaticCommitment`
instantiates an existing 0.20 `TreatyClause` kind, never a new clause type.
Validated by `src/simulation/__tests__/diplomacyContract.test.ts`.

## Non-duplication invariants

1. **One treaty system** — `multilateral.treaties[].clauses` and
   `multilateral.obligations` are the sole clause/obligation stores.
2. **Authority from the office actually held** — unresolved mandates fail closed.
3. **`unavailable != 0`** everywhere.

## 0.31.2 scope — negotiations, concessions and guarantees

The negotiation contract (`src/simulation/diplomacy/negotiation.ts`): a proposal
is resolved only by an explicit accept/reject decision or by its deadline —
never automatically from a relation score crossing a threshold. A concession is
a dated, validated unilateral give from a mandated actor (relation adjustment or
tariff reduction, bounded). Credibility is causal (honored vs violated
obligations) and unavailable-safe (`unavailable != 0`). Validated by
`src/simulation/__tests__/diplomacyNegotiation.test.ts`.

## 0.31.3 scope — sanctions, embargoes and dependencies

The coercion contract (`src/simulation/diplomacy/sanctions.ts`): sanctions,
embargoes and condemnations map onto the existing 0.18 international-action
system; an intervention is a 0.19 military operation, never a trade control.
Circumvention is only representable when actually modelled — not modelled here.
Validated by `src/simulation/__tests__/diplomacySanctions.test.ts`.

## 0.31.4 scope — multilateral diplomacy and de-escalation

The de-escalation contract (`src/simulation/diplomacy/multilateralDiplomacy.ts`):
mediation and concrete de-escalation measures (lift restriction, withdraw
condemnation, mediation offer) map onto the existing 0.20 multilateral bodies /
decisions and the 0.18 international-action system — no second store. A mediator
is non-omniscient: its information basis is explicit and mediating never grants
hidden access. Validated by
`src/simulation/__tests__/diplomacyMultilateral.test.ts`.

## Deferred (not implemented)

0.31.5–0.31.11 are deferred until their micro-blocks. 0.31 is accepted only
after its complete independent audit and green CI.
