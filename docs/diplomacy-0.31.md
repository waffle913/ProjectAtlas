# Diplomacy / strategic trade and military V2 — 0.31

**Status:** 0.31 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization. This is **implementation
authorization, not acceptance**. **0.31.10 is the current sub-milestone.**

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

## 0.31.5 scope — military support chain

The support-chain contract (`src/simulation/military/supportChain.ts`): fuels,
ammunition, parts, maintenance, transport and personnel map onto their canonical
owners (0.16 military stocks/personnel, 0.17 trade transport); purchase contracts
and military products come from the existing 0.16 orders and 0.28 industry — no
second supply engine. Every link is typed by availability: an unknown requirement
or stock yields `unavailable`, never a fabricated rupture. Validated by
`src/simulation/__tests__/militarySupportChain.test.ts`.

## 0.31.6 scope — military industry and acquisition

The acquisition contract (`src/simulation/military/acquisition.ts`): orders,
financing, factory capacity and delivery delays map onto their canonical owners
(0.16 `MilitaryOrder` + funded/paidUsd, 0.28 industrial capacity, 0.26 finance) —
no second order or production store. Production is never instant: a computed plan
takes at least one month, is bounded by factory capacity, and requires full
funding first. Validated by
`src/simulation/__tests__/militaryAcquisition.test.ts`.

## 0.31.7 scope — training, availability and command

The training/command contract (`src/simulation/military/trainingCommand.ts`):
command authority mirrors the 0.14 capability model (`command_military_operations`
held by a head of government or head of state, never a minister/legislator,
unresolved fails closed); training and reconstitution are time-bounded (never
instant), constrained by instructor capacity / recruitment rate, and typed by
availability. Validated by
`src/simulation/__tests__/militaryTrainingCommand.test.ts`.

## 0.31.8 scope — operations and territorial control

The territorial-control contract (`src/simulation/operations/territorialControl.ts`):
sovereignty, effective control and occupation are three distinct layers —
sovereignty lives in `state.regionOwnership` and is never changed by a control
change; control/occupation extend the 0.19 operations model, never
annexation-by-pixel-movement. Asset damage is bounded and never auto-repaired.
Validated by `src/simulation/__tests__/territorialControl.test.ts`.

## 0.31.9 scope — crises, peace and security

The conflict/peace contract (`src/simulation/operations/crisisPeace.ts`): force
follows the real causal chain — a dispute, a tension episode, a crisis, then an
explicit decision to use force — never a relation-score threshold. A peace
agreement is explicit (truce / peace / guarantee instantiating the existing 0.20
defensive-guarantee clause). Validated by
`src/simulation/__tests__/crisisPeace.test.ts`.

## 0.31.10 scope — information, authorities and costs

The order-cost/information-access contract (`src/simulation/operations/orderCosts.ts`):
an order has a real whole-USD cost and is funded only when committed funds cover
it (unknown funding is never assumed funded); leaders know only what their
services and office can access — public always, office by 0.15 access,
intelligence only when actually provided. Domestic/international consequences are
engine-level and deferred. Validated by
`src/simulation/__tests__/orderCosts.test.ts`.

## Deferred (not implemented)

0.31.11 (validation) is the consolidated independent review. 0.31 is accepted
only after its complete independent audit and green CI.
