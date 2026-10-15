# Finance, banking, credit and money — 0.26

**Status:** 0.26 is planned in the approved roadmap 0.26–0.34 and is now under a
standing multi-milestone implementation authorization (2026-10-15). This is
**implementation authorization, not acceptance**; no milestone is accepted
without its independent review and CI. **0.26.1 is implemented** (branch CI
green, run 38772265361); **0.26.3 (payments and settlement) is in progress.**
The independent parts (single monetary ledger, monetary-surface inventory,
payments/settlement, public-debt schedules, solvency) proceed now; the
conditional parts (national currency/FX, commercial-bank credit-created money,
bank deposits balance) are **not** decided and stay `BLOCKED_DESIGN` until a
human answers the gates below.

This document is the canonical contract for 0.26. It complements
[the roadmap decomposition](roadmap-submilestones.md) and the existing subsystem
contracts (fiscal 0.11, trade 0.17, economy 0.25); it does not replace them and
does not authorize implementation on its own.

## 0.26.1 scope — monetary contract and open decisions

The first sub-milestone establishes the **monetary contract** and the **single
canonical owner of every existing monetary quantity**, without building any new
mechanism. It is a vocabulary and accounting-contract milestone, exactly
parallel in kind to 0.25.1 ("contracts and units of account") and 0.24.1A
("identities and types"):

- Inventory: treasuries, revenues, receivables, obligations, payments, prices
  and existing debt.
- Determine the single canonical owner of each monetary quantity.
- Declare the single monetary unit of account (integer nominal USD).
- Record the open design decisions as explicit `undecided` gates; a dependent
  sub-milestone raises `BLOCKED_DESIGN` until a human decides them.

0.26.1 introduces **no** second money ledger, no bank, no second treasury, no new
scheduler task, no new RNG, no migration and no new canonical-state schema. It
adds static vocabulary, a static monetary-surface registry and a static
decision-gate registry that the later 0.26 sub-milestones build on. The
executable counterpart lives in `src/simulation/finance/contract.ts` and is
validated by `src/simulation/__tests__/financeContract.test.ts`.

## One monetary ledger, many views

There is exactly one fiscal treasury, one trade engine, one economy and one
canonical `SimulationState`. 0.26 enriches these existing systems; it never
creates a parallel monetary world. The 0.26 monetary contract is therefore
**not a new ledger**: it names where each monetary quantity already lives, so
later sub-milestones (payments, loans/bonds, liquidity, default, treasury) read
and write exactly one place.

### Canonical monetary-surface inventory

"Canonical owner" means the exact single `SimulationState` field that holds the
live value; every other occurrence is a dated bookkeeping/reference view, never a
second source of truth. The machine-readable registry
(`src/simulation/finance/contract.ts` → `MONEY_SURFACES`) asserts uniqueness: no
two surfaces claim the same owner path, and every surface in the inventory is
present.

| Kind | Quantity | Canonical owner | Unit | Measure |
| --- | --- | --- | --- | --- |
| treasury | cash | `state.fiscal.countries[countryId].cash` (dated `account.openingCash`/`closingCash`) | USD_NOMINAL | stock |
| debt | public debt | `state.fiscal.countries[countryId].debt` (dated `account.openingDebt`/`closingDebt`, `debtInitialization.amount`) | USD_NOMINAL | stock |
| debt | debt limit | `state.fiscal.countries[countryId].debtLimit` | USD_NOMINAL | limit |
| debt | monthly borrowing limit | `state.fiscal.countries[countryId].monthlyBorrowingLimit` | USD_PER_MONTH | limit |
| debt | borrowing rate | `state.fiscal.countries[countryId].interestRateBps` (modelled prior) | basis_points | rate |
| revenue | known tax revenue | `account.knownTaxRevenue` | USD_PER_MONTH | flow |
| revenue | other/baseline revenue | `account.otherRevenue` | USD_PER_MONTH | flow |
| revenue | total revenue | `account.totalRevenue` | USD_PER_MONTH | flow |
| revenue | financing revenue | `account.financingRevenue` | USD_PER_MONTH | flow |
| revenue | customs revenue | `account.customsRevenue.collected` | USD_PER_MONTH | flow |
| receivable | arrears | `account.arrears` (with `openingArrears`) | USD_NOMINAL | stock |
| receivable | interest arrears | `account.interestArrears` (with `openingInterestArrears`) | USD_NOMINAL | stock |
| obligation | interest due | `account.interestDue` | USD_PER_MONTH | flow |
| obligation | defence obligation | `account.defense.obligation` | USD_NOMINAL | stock |
| obligation | construction committed | `account.construction.committed` | USD_NOMINAL | stock |
| payment | interest paid | `account.interestPaid` | USD_PER_MONTH | flow |
| payment | borrowed | `account.borrowed` | USD_PER_MONTH | flow |
| payment | repaid | `account.repaid` | USD_PER_MONTH | flow |
| payment | financing need | `account.financingNeed` | USD_PER_MONTH | flow |
| payment | transfers paid | `account.transferPaid` | USD_PER_MONTH | flow |
| price | trade prices | `state.trade.countries[countryId].markets[category].{priceMicroUsd,baselinePriceMicroUsd}` | microUSD / unit | state |
| payment | trade payments | `state.trade.flows[]` (`valueUsd`, `logisticsUsd`, `customsUsd`, `landedUsd`) and the category ledger (`importPaymentUsd`, `exportValueUsd`, `purchasingBudgetUsd`, `unspentUsd`) | USD | flow |

## 0.26.3 scope — payments and settlement

The payments/settlement primitives formalize the atomic money-movement rules
over the canonical treasury balance, without introducing a second ledger:

- a payment order names a payer, a payee, a whole-USD amount, a date and a
  purpose (`PaymentOrder` in `src/simulation/finance/settlement.ts`);
- settlement is atomic: an order is settled exactly once or refused, never
  partially; insufficient funds produce a `refused` order, never silent loss and
  never created money;
- no double spending: an order id settles at most once (duplicates are refused);
- balance conservation: `paidUsd + remainingAvailable === available` for every
  batch; settlement never over-spends the available balance.

The executable layer is pure and deterministic (order-invariant), validated by
`src/simulation/__tests__/financeSettlement.test.ts`. It reads the canonical
`FiscalCountry.cash` / `constructionCommitted` (uncommitted cash) exactly as
named in the monetary-surface inventory; it writes nothing and adds no schema.

## Single monetary unit

The single monetary unit of account is **nominal US dollars**, stored as
non-negative safe integers of whole USD (inherited from 0.25.1
`MONETARY_UNIT`). Prices are integer microUSD (`1,000,000` microUSD = `1` USD);
rates are basis points (`10,000` bps = `100%`). No fractional money, no
floating-point money, no second currency. A foreign-currency or FX ledger exists
only if a human decides it in the gate below; until then it is out of scope.

## Open design decisions (BLOCKED_DESIGN)

Adopting the 0.26–0.34 roadmap did **not** decide these mechanics. Each stays
`undecided` in `FINANCE_DECISIONS` (`src/simulation/finance/contract.ts`) and a
dependent sub-milestone must raise `BLOCKED_DESIGN` before starting:

1. **National currency / FX (0.26.8).** Keep nominal USD as the sole canonical
   accounting unit with an explicit multi-currency *display* representation, or
   add real national currencies and FX conversion?
2. **Bank credit-created money (0.26.2/0.26.5/0.26.6).** Should commercial-bank
   credit-created deposits be simulated, and at what aggregate level?
3. **Bank deposits balance (0.26.2/0.26.5).** Should an aggregate
   bank/counterparty balance sheet (deposits vs loans) be modelled?

The independent parts of 0.26 — aggregate treasury payments and settlement,
public-debt schedules, and solvency/default on the single USD_NOMINAL ledger —
proceed regardless of these gates.

## Non-duplication invariants

1. **One fiscal treasury** — `state.fiscal` alone books cash, revenue, debt,
   interest, arrears and disposable income; governance acts through
   `scheduleFiscalReform`, never by writing the ledger directly.
2. **One trade engine, one price store** — `state.trade` alone books flows,
   prices and payments; no parallel payment or price store.
3. **One monetary unit** — integer nominal USD; no second currency, no
   fractional money, no floating-point money.
4. **No accounting incoherence** — every obligation has a matching liability,
   every payment moves money that already exists, and every balance reconciles
   against the canonical owners above. No money created or destroyed by a bug.
5. **`unavailable != 0`** — an unknown debt, rate, revenue or price is never a
   zero; a modelled rate is never presented as an observed market rate.

Later sub-milestones must reconcile to the canonical owner named here and
register any new canonical state with `InvariantRegistry`, a dated migration
that never replays history, and save/reload + determinism + conservation
coverage.

## Deferred (not implemented)

National currency/FX, commercial banks, credit-created money, bank deposits
balance, and the deeper loan/bond/default mechanisms (0.26.2–0.26.9) are
deferred until their micro-blocks. 0.26 is accepted only after its complete
independent audit and green CI.
