# Fiscal runtime contract — Milestone 0.11

## Entry points and ownership

The [0.16 extension](military-0.16.md) adds optional modelled annual defense authorization without changing the six civilian categories. Only actual requested/funded personnel/work executes. Existing financing pays gross salary plus employer contributions, with PIT/employee withholding and one net household receipt; withholding cannot self-finance the payment. Military salary arrears contribute to fiscal stress. Procurement is counted once as next-month public demand; prepaid unfulfilled production claims are reissued without another expense. Fixed revenue calibration never changes. Paying-Country tax law is a documented modelled jurisdiction proxy after sovereignty transfers.

`SimulationState.fiscal` is the national fiscal truth, schema **9**, fiscal sub-model `fiscal-0.11-v2`. `fiscal/model.ts` defines accounts and centralized model assumptions; `math.ts` contains pure tax functions; `runtime.ts` initializes, executes and accepts reforms; `invariants.ts` reconciles flows. `fiscal-rules.json` is an independently audited legal input, never mutable simulation state. `fiscal-aggregates.json` separately accepts compatible dated national revenue/debt observations. `fiscal-coverage-report.json` covers legal and aggregate-source data and `fiscal-initialization-report.json` describes actual engine initialization for all 252 Country IDs.

Its global schema-9 origin is historical; current global save schema is **15**. [0.17 trade](trade-0.17.md) retains the same fiscal sub-model and treasury: opening disposable-income envelopes pay landed imports, imported household goods add one consumption-tax component, ordinary customs enter `knownTaxRevenue` as separately dated `admitted_flows_only` receipts, and fixed calibration never offsets them. Unknown customs rates block route execution rather than becoming zero-rate invoices. Country `customsRevenue` and regional `tradePurchases` reconcile with saved goods/payment evidence. Public orders, salary withholding, borrowing/debt/cash and the existing next-month lag remain unchanged. Foreign seller receipts are subdestinations of already represented private output; logistics receipts remain explicit outside-sector counterparties, not a second financial wallet.

There is one economy (`state.socioeconomy`), one scheduler and one save format. `initializeFiscal(state)` reads current saved regional economies and ownership, never annual reference maps. `SimulationClock.reformFiscal` and `scheduleFiscalReform` accept explicit annual USD budgets or complete policy objects with rates, bands and allowances. `inspectFiscal` returns a defensive debug projection. Country inspection includes a JSON reform editor, not political decision UI. Policies changed from the pinned legal extracts must carry `status: modelled`; data holes are explicit `null` rules, not zero-rate laws. Legal-only `ReservedTaxRule` is an extension point for excise/property; no missing economic base is fabricated.

## Source coverage and interpretation

At 2026-01-01, PIT: 1 partial/251 unavailable; consumption: 1 partial/251 unavailable; payroll: 1 partial/251 unavailable; corporate: 2 partial/250 unavailable. US PIT/payroll/corporate and Canadian federal GST/corporate are the implemented factual extracts. Detailed references and limitations are in [fiscal-data-0.11.md](fiscal-data-0.11.md).

All national fiscal aggregate observations and public service observations are currently unavailable. Initialization is explicitly modelled. 209 Countries have complete usable economic bases; 43 have none. Their fiscal state exists, but zero operational budget/flows do **not** mean observed zero real activity. Service coverage is null/unavailable without a usable service reference. Missing tax categories incur no simulated tax charge and remain unavailable.

Accounts distinguish `knownTaxRevenue`, `otherRevenue` and `totalRevenue`. At initialization, a compatible sourced aggregate revenue observation would set the total baseline, with `otherRevenue = max(0, observed monthly revenue − initial knownTaxRevenue)`. Since none is accepted yet, the modelled total baseline is current appropriations plus opening interest; `otherRevenue` is the residual after initial known taxes. This fixed nominal residual prevents legal coverage gaps alone from manufacturing a structural deficit. It is never a tax rate and never fills an unavailable statutory category. Its provenance and status accompany each Country and fiscal-stress record. It is fixed after initialization: policy reforms change known taxes, total revenue and balances without automatic offset.

Monetary thresholds are annual nominal USD. Canadian percentage-only rules can operate on a USD base; Canadian monetary thresholds are rejected without sourced FX. The 2026 legal snapshot is held fixed after the start date until a reform: this is a simulation convention, not a claim about real subsequent laws. No tax history is reconstructed in migration.

## Shared cadence and lag

Daily priority 50: activate due fiscal reforms (constant empty-queue fast path). Monthly priority 100: the existing economy produces output and gross income using previous disposable income and funded public orders. Priority 150: calculate current liabilities, collect, finance, execute spending, pay transfers, prepare next disposable income/orders, update service capacity. Priority 200: administrative reporting. This is identical for player and AI Countries and for all fidelity levels; administration makes no political policy choices.

The monthly boundary is a discrete accounting period, not retrospective continuous accrual. A reform effective on/before a boundary applies at that boundary, with no daily proration; a later reform waits for the following boundary. A same-date reform can be accepted during pause without advancing time or changing prior accounts. Existing accounts retain `policyApplied`, collection efficiency and the booked date for explanation after reforms. Tax collection affects next month's household demand; a consumption policy changes the wedge at the next economic boundary. Fiscal ledgers retain the owner at booking even if territory changes afterward. The next month books current ownership; national debt and budgets never transfer implicitly with a Region.

## Bases, rounding and incidence

All modelled quantities use integer USD and persons. Basis points represent 1/100 of a percent; exact BigInt products and final nearest rounding avoid unsafe intermediate floating arithmetic. Allocations use deterministic largest remainder. There are three representative income groups, not individual tax returns or households.

For group income G per month and population N, PIT uses annual representative income 12G/N minus allowance A and the marginal schedule. Implementation scales bracket limits by N before applying marginal widths, then divides the total annual liability by 12. This avoids rounding each person's income before aggregation. Annual `progressiveTax` is separately testable. Children and household composition are not resolved: using all persons as representatives is an explicit approximation, not tax microsimulation.

Modelled labour compensation is 80% of group gross income when that group has employed representatives. Employed persons are allocated to groups by population. Annual payroll caps/thresholds apply per representative worker. Employer collected contributions are a real additional labour cost recorded in `labourCost`, and reduce the surplus available for corporate taxation. Their effect on hiring is **deferred** because 0.10 has no wage-cost labour demand mechanism. No employment multiplier is applied.

Modelled taxable business surplus = max(0, output − household income − employer contributions collected) × 50%. It is not GDP and not a complete corporate profit measure. Corporate liability = surplus × rate; retained surplus = surplus − collected corporate tax. Investment/capital transmission is deferred. There is no direct GDP penalty.

Collection efficiency is centrally modelled at 90%, not an observation. Liability and collected cash are separate. Personal and employee cash deductions cannot jointly exceed group gross income (employee cash is capped by the remaining income); uncollected liability is not government cash and is not modelled as household tax debt. Every ledger stores base, gross liability, collected amount and coverage status.

Gross income − collected PIT − collected employee contributions + transfers = disposable income. The 0.10 consumption propensities (95/85/65%) apply to this income. For consumption tax, modelled taxable share = 70% of net goods. Liability = taxable goods × statutory rate; collected wedge = liability × efficiency. A bounded integer search finds the maximum goods purchasable such that net goods + collected wedge ≤ nominal household budget. Production may ration goods; VAT is booked only on realized goods, once. Untaxed/unspent nominal purchasing capacity is not a financial asset system in 0.11. Product-level exemptions and substitution are deferred; the taxable share does not claim to reproduce them individually.

## Initialization and demand closure

Annual appropriations derive from current monthly output × 12, using modelled shares: health 1.5%, education 1.5%, pensions 2%, income support 1%, infrastructure maintenance 1%, administration 0.5%. These are **initial dollar amounts**, not ongoing budget sliders or observations. No statutory rate is fitted to revenue. Treasury starts at three months of these appropriations. In the absence of a compatible accepted debt observation, opening debt is an explicit modelled zero and carries provenance stating that it is not a real observation. A future sourced aggregate record can initialize debt without changing its legal-tax coverage.

Initial regional ledgers are labelled by the absence of `lastMonthlyDate`/Country account: they are demand calibration projections, not executed taxes or transfers. Economic state, cohorts and references remain byte-for-byte equal to the pre-fiscal state. Projected disposable spending and public procurement are removed from the former residual once:

private closure = max(0, current output − projected net household demand − projected public orders).

Monthly other demand = fixed calibrated private closure + prior funded public orders. Thus government orders do not simply get added on top of the old government-containing residual. Normal world initialization preserves first-month output (apart from integer rounding where applicable). Saved disequilibrium is not erased; fiscal initialization does not force past output or income to a new equilibrium. The private residual remains the explicitly modelled outside-sector closure inherited from 0.10; it is not trade or investment accounting.

## Execution, transfers and treasury

Annual appropriations are split across twelve months with exact remainder dollars assigned to the first months. Categories: health, education, pensions, incomeSupport, infrastructure, administration. No military budget, local government or investment expansion is introduced.

Monthly interest due = opening debt × annual interest bps / 120000. Committed obligations include current appropriations plus prior unpaid commitments and interest arrears. `totalRevenue = knownTaxRevenue + otherRevenue`. Financing need = max(0, obligations − cash − totalRevenue). New borrowing is the minimum of need, a fixed monthly limit (20% of initial monthly output) and remaining debt ceiling (100% of initial annual output). This is a modelled creditor supply assumption, not a bond market. Outstanding interest is paid first, then remaining resources proportionally fund all primary commitments; unpaid amounts remain visible as arrears. No spending category is randomly forgotten. Excess resources repay principal, then remain cash. Countries with no economic recipients retain primary obligations as arrears rather than paying fictional households.

closing debt = opening debt + borrowed − repaid

closing cash = opening cash + total revenue + borrowed − executed primary spending − interest paid − repaid

primary balance = total revenue − executed primary spending

overall balance = primary balance − interest paid

Debt principal flows are financing, not revenue/spending. Creditors are an external accounting counterparty in this V1; their assets and interest receipts are not inserted into household income or an invented banking system. Revenue and spending are cash-basis; interest due and unpaid obligations are exposed separately.

Pensions use a modelled 15% recipient share across group populations (person weights as the fractional fallback for tiny populations). Support goes to low-income groups, with regional weights = low-income population + unemployed persons. These are representative targeting weights, not a register of individual recipients. Executed pensions/support are allocated exactly once to household transfer receipts; their sum equals public transfer expense. Health/education/infrastructure/admin payments create next-month public goods orders allocated by population. Orders share existing production/rationing with private demand; spending denotes nominal funded resources, not a claim that every order was physically delivered or that suppliers/creditors have full balance sheets.

## Service stock dynamics

A service reference stores initial population and monthly resource cost. Required resources scale with current economic-region population; funded capacity is spending divided by that per-person reference cost, capped at twice current population. Capacity is measured in person-equivalent service coverage, not a health outcome. Actual stock moves one twelfth of the distance toward min(population, funded capacity), with a minimum one-person change when unequal. Backlog = max(0, prior backlog + required resources − spending). Underfunding lowers capacity progressively; restored funding recovers it progressively; surplus funds also retire backlog. Ordinary full funding can restore a service stock while a historical resource backlog persists; backlog is not a second hidden GDP penalty. Infrastructure models maintenance only. Service spending is a funded-capacity approximation; detailed physical supply constraints and welfare outcomes are deferred.

## Integrity, saves and performance

The core InvariantRegistry checks policy shape/IDs/dates, tax/nonnegative flows, household identities, national/region ledger sums, transfer conservation, treasury/debt evolution, interest, financing need, appropriation/arrears reconciliation, units and service quantities. Fidelity conservation includes the entire fiscal branch. Diagnostic corruption tests verify actual reconciliations.

Schema 8→9 preserves all saved socioeconomic state and initializes fiscal state at the saved date. Legacy 1–7 migrations retain their existing economic initialization then initialize fiscal state. Fiscal sub-model v2 remains current inside global schema 15; schema 9 is its historical introduction. Saves from the initial `fiscal-0.11-v1` release upgrade deterministically to sub-model v2: current stocks are retained, aggregate financing is calibrated once and tagged modelled, and the flawed last-period v1 account is not reinterpreted as historical residual revenue. Fiscal 9 reload thereafter preserves the frozen calibration, debt provenance, pending reforms, policy history, accounts, debt, cash, budgets, services and household demand drivers.

Copy-on-write branches and the existing cached frozen snapshots remain in use. No fiscal calculation scans Regions daily. Monthly work groups active Regions once, computes local ledgers and aggregates national accounts; per-Country service/account work is small. Daily UI snapshots reuse both fiscal and economic branches; monthly branches are newly frozen copies. Full editable copies and explicit save serialization still copy the complete state. World benchmark reports these real UI costs separately from engine ticking; no claim of a zero-cost monthly snapshot is made.

## Debug procedure and deferred scope

Select the United States or Canada and open Fiscal debug. Prepare an explicit JSON reform; keep Country ID and enter an effective date. For modified laws set `status` to `modelled`, assign a debug ID/source/document/limitation, then edit a rate, bands or allowance. For a budget edit change an annual USD amount. Apply while paused, then advance to the monthly boundary and compare liabilities, revenue and disposable income; advance one more month to see demand transmission. Reducing health appropriations to zero shows backlog and gradual capacity loss; restoring funding shows gradual recovery.

Fiscal stress exposes unpaid commitments, interest/debt burdens, deficit ratio, pension/support gaps, service underfunding, infrastructure backlog and disposable-income decline. No crisis is triggered. Politics, opinion, institutional information, debt markets, inflation, banks, detailed corporate investment, regional governments, product excises and trade remain outside 0.11.

Run `npm run fiscal:audit` to validate pinned legal coverage and actual initialization, `npm run verify` for regressions/build/data contracts, and `npm run benchmark:world` for historical and fiscal world workloads. Regenerate coverage only after reviewed data/model changes with `npm run fiscal:audit:generate`.
