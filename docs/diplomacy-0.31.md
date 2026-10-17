# Diplomacy / strategic trade and military V2 — 0.31

**Status:** 0.31 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization. This is **implementation
authorization, not acceptance**. **0.31.1 is the current sub-milestone.**

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

## Deferred (not implemented)

0.31.2–0.31.11 are deferred until their micro-blocks. 0.31 is accepted only
after its complete independent audit and green CI.
