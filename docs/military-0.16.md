# Military capabilities and readiness 0.16 (corrected validated foundation)

This explicitly authorized task extends parent `ceddc8e04fc470f41155fdc8b6250142fb970705`.
0.15 is now the accepted/validated parent following the user's independent-review
decision. The user's explicit new 0.17 direction identifies corrected 0.16
`7580ed683a8164764fbccfbe94bb828da84c57ed` as validated; this is not acceptance
inferred from our tests or the earlier read-only review. Original implementation:
`b27e59f8528bc181c8f69e7af7f9c134e45c9a0a`. Historical correction/measurement
records below retain their chronology. Accepted 0.8-0.16 contracts remain the foundation. This is administrative peacetime
capability, not operational use.

The authorized [0.17 trade extension](trade-0.17.md), pending independent review,
adds an explicitly configured supplementary `industrial_goods` input per actual
factory unit. Fulfilled domestic/imported units cap both requested and executed
manufacturing; actual work consumes them exactly once alongside original finite
industrial materials. No direct readiness, troop operation, war or ownership
modifier exists. Original next-boundary funding, catalogue delay and economic
public-resource delivery proofs remain intact. Current global schema is 15;
the verified bounded old-schema-14 readiness-report upgrade still runs for both
14 and 15 loads before validating reports.

## Canonical state and admission

Schema 14 adds `SimulationState.military`, version `military-0.16-v1`.
One shared scheduler, economy, fiscal engine, clock and RNG remain authoritative.
The equipment catalogue is immutable static data outside saves. It defines
generic individual equipment, trucks, armour, artillery, aircraft, ships,
communications, ammunition and fuel. Every price, interval, lead time and
capacity coefficient is an explicit **modelled engineering prior**, not national
calibration. Registry order is stable; integer allocation uses existing BigInt
largest remainder. No random process or readiness multiplier is introduced.

Default initialization creates explicit unavailable coverage for 252 registered
Countries. It does **not** initialize 252 empty armies. `admitMilitaryBaseline`
is a scenario/source-admission API, not a gameplay command. It requires a
complete explicitly configured capability, current-date admission, permanent
references, provenance and scenario-date applicability. Missing item categories
stay absent. Orders cannot turn absent stocks into known zeros. Requirements
can reference only admitted stock categories; unconfigured requirements do not
describe an unknown real army. Positive configured mechanisms also require their
direct inputs independently of desired-stock targets: personal equipment for
instruction, ammunition/fuel for positive consumption rates, and trucks for
positive logistics staffing/throughput. Missing such inputs rejects admission
and saves rather than silently producing a numeric zero. Explicit known-zero
stocks remain valid; genuinely unused categories may remain absent.

The optional checkbox on the new-game starting screen configures **only the
selected Country** with an original synthetic demonstration: 50 persons,
10 trainees, 100 authorized posts, 100 personal kits, 5 trucks, 1000 ammunition
and fuel units each, 1000 industrial material units and a 12 million USD annual
defense authorization. It grants no cash, debt capacity, population, tax revenue,
public office or executive powers. It is locked to tick 0 before player selection,
fails explicitly when existing workforce/economy is insufficient, and is
labelled synthetic in saved provenance and government reports. The ordinary
scenario remains unavailable. Select a resolved executive officeholder to
exercise management; being a party leader does not confer it.

## Personnel, wages and civilian causality

The autonomous V1 engineering assumption reserves military personnel within the
**same existing regional labour/population/cohort universe**. It is not a
user-approved change in modelling direction. The minimally extended 0.10 identity is
`civilian employed + civilian unemployed + reserved military = labourForce`.
Civilian employed still means productive civilian jobs. Population, demographic
cohorts and baseline references are not duplicated or rewritten. Recruitment
withdraws available civilian labour, and existing capacity/output equations
respond to that physical reservation, not to an arbitrary GDP/employment bonus.
A WeakMap reservation index is derived outside saves; no second ownership map
is maintained.

Authorized posts, present personnel, training cohorts and qualified available
personnel are distinct. Recruitment and release are gradual configured rates,
bounded by existing labour, authorized vacancies, authorization affordability
and salary arrears. Three consecutive underpaid months cause gradual retention
loss through the same release mechanism; departing staff do not erase arrears.
Affiliation remains with the employing Country after sovereign transfer; resident
Regions/population are not transferred with it.

Actual gross wages are `present * monthly salary`, plus unpaid contractual gross
salary. The sole fiscal engine finances gross pay and collected employer
contributions. Existing progressive PIT/payroll calculators apply; employee/PIT
withholding is deducted, and net pay reaches the existing Region/income-group
household ledger once. It is separate from civilian productive household income,
which remains bounded by civilian output. Employer contributions are public
labour cost, not another household receipt. Withholding enters revenue and
closing resources but cannot circularly finance the payroll that generated it.
Fixed `revenueCalibration` is never recalibrated.

V1 tax incidence uses aggregate representative income groups, not individual
soldiers. The paying employer's national law applies, including cross-sovereign
residence: this is a **modelled employment-jurisdiction proxy**, not observed
cross-border tax law. Arrears paid after all present staff leave use original
recipient Regions and a labelled representative-worker fallback. The existing
immediate tax counterfactual holds funded gross pay and non-tax flows constant,
rebases both current and proposed legal withholding without rewriting paid ledgers;
foreign-resident household incidence is not a complete distribution forecast.

## Physical work, consumables and production

Owned equipment is exactly partitioned as operational, unavailable, maintenance
and reserve. `owned = opening + funded deliveries`; no wear or repair creates or
destroys equipment. Maintenance accrues operational unit-months with an exact
remainder and one catalogue interval. Queued unit-months form the backlog.
Unavailable equipment can be restored only using qualified technical capacity
and financed repair work. Reserve equipment is stored but not operational;
V1 does not implement deployments or unit formation.

Instructor, technician and logistics requests are apportioned from the same
qualified available personnel; they cannot manufacture or double-count staff.
Training cohorts advance at most one completed month per boundary, using funded
instruction, real personal equipment, instructors and ammunition/fuel.
Remaining instruction capacity performs peacetime exercises. Consumption is
booked once: `stock = opening + deliveries - consumed`, with storage bounds.
Exercise evidence is bounded aggregate person-months, not a mutable readiness
bonus. V1 does not model individual skill decay. No qualified instructor means no miraculous training of a wholly
untrained force.

An order is a commitment, not a delivery or immediate expense. It can first
receive production funding on the **next monthly boundary**; even AI commitments
created during monthly preparation wait for that next boundary. For a
January 31 truck order, production can start February 1 and the two-month catalogue delay
permits first delivery April 1. `startedOn` and exact `availableOn` are saved per
funded batch. The invariant checks catalogue lead time without replaying history.

Actual paid production is constrained by factory units/month, existing industrial
material stock and fiscal allocation. Mature batches deliver only against actual
existing-economy public-demand fulfillment. Prepaid but unfulfilled resource
claims are retained and reissued as next-month demand **without another expense**.
Whole-dollar received supply and fractional basis-point remainders are conserved;
they are delivery/resource claims, not a military treasury. Unavailable national
industrial inputs are not inferred from GDP. Industrial materials in this V1
scenario are finite opening resources, not an unmodelled automatic resource source.

Procurement/repair/instruction demand enters the single existing public-order
ledger and affects the **next** economy month. Payroll is not counted again as
procurement. Outstanding orders are capped at128, rejected rather than discarded
at the bound. Pipeline length is bounded by lead time. Completed obligations
compact into exact per-item quantities/paid totals; mature undelivered work stays
outstanding, including storage or supply constraints.

## Financing, readiness and management

Optional `annualBudget.defense` is a modelled spending ceiling. Existing six
civilian categories remain unchanged. Actual requested defense obligations,
limited by that ceiling, compete through the existing priority150 financing,
cash, borrowing and interest engine. No entire appropriation is automatically
spent. Unpaid contractual salaries remain explicit and enter fiscal stress;
unfunded training/new manufacture is not fictional executed work.

Defense-only legislative proposals record the explicit legal delta. Future
capability consequences remain unsupported/UNKNOWN. Fiscal pressure is evaluated
only against an existing dated actual defense request, capped by authorization;
raising an unused ceiling is not automatically expenditure or power. No military
ideology/goal or institutional bonus is invented. Absent-defense proposals retain
previous 0.15 results and historical evidence.

Readiness is a pure decomposition: authorized qualified staffing, required
operational equipment, qualified exercise evidence, required consumables and
logistical throughput. Material ratios saturate before division to avoid overflow.
The limiting ratio is an explanatory bottleneck, **not combat effectiveness**.
Transport depends on actual operational trucks and apportioned logistics staff.
Only strictly positive equipment/consumable targets enter their respective
readiness components. No positive target means `null`, excluded from the
limiting ratio; explicit `required: 0` remains visible in dated reports.
Report validation reconstructs the same applicability from reported evidence.
Zero configured need is distinguishable from missing coverage.
New modelled reports mark `readinessVersion: positive-targets-0.16-v1`.
Schema-14 reload verifies an unmarked report's original fingerprint and full
legacy evidence before correcting zero-only components from `10000` to `null`
and updating its fingerprint/version. Only saved report evidence is used, never
current Reality or historical simulation replay. Unaffected unmarked reports
and all briefings remain unchanged; inconsistent latest/retained copies and
corrupt legacy ratios are rejected. The global save schema remains 14.

Management commands require the controlled active person, government information
access, an executive office (`head_of_government` or `head_of_state`), a non-unresolved
institutional authority record and explicit existing budget-sponsorship capability.
This is a conservative **modelled administrative-defense authority** within the
existing appropriation, not a constitutional commander-in-chief claim or 0.19
operational power. A legislator with information and sponsorship flags cannot
manage forces. Country selection, membership and party leadership grant none.
The minimal AI maintains explicitly configured peacetime stocks only when the
Country is not currently player-managed, salary arrears are absent and configured
factory capacity is positive. Known zero factory capacity explicitly defers needs,
not a zero-quantity order or unavailable datum. Zero
closing cash is not absence of financing: the fiscal engine repays surplus debt.
Its conservative **prospective decision**, not an executed expense, uses cash,
last recorded financing revenue excluding current military withholding, and the
same canonical monthly borrowing/debt-room constraint as the fiscal engine.
Changed or absent tax-law evidence admits only the fixed baseline/other calibration
to that revenue projection. Civilian monthly ceilings (rounded up), existing
civilian/interest arrears, current interest, recurring defense requests and every
unfunded outstanding commitment are reserved first. Remaining room is also
capped by the defense monthly ceiling rounded down; each new commitment reduces
that shared forecast margin. Future receipts are not guaranteed. Only later
actual fiscal allocation can fund manufacture, and delivery still requires
time/material/public-demand fulfillment. The forecast is not another treasury,
prepayment or a budget-to-power effect. AI chooses no threats, wars or objectives.
Monthly preparation validates the capability again after AI decisions, before
returning canonical state; an invalid AI-created commitment cannot escape it.

## Government Information, UI and ordering

Monthly priorities are 90 personnel reservation/release, 100 civilian economy,
150 fiscal financing/pay/work, 200 existing administration, 250 military
administrative report, 300 crises and 350 existing Government Information.
Weekly politics stays unchanged. Ordinary days perform no military work and
reuse the military snapshot branch. Fidelity changes never change these laws.

Reports are explicit, dated, government-only saved evidence, with provenance,
coverage, confidence, uncertainty and deterministic fingerprints. A complete
configured administrative census is modelled, with 7000 bps confidence, never a
real readiness observation. Missing capability has unavailable coverage,
confidence 0 and no fabricated numeric army. UI and ministers consume these
reports, not live canonical capability. Management affects Reality now but does
not refresh an earlier report. Inspectors defensively copy evidence and mark
staleness. New report records do not weaken the six prior information-integrity
rules or succession/institutional UNKNOWN contracts.

The defense portfolio receives deduplicated advisory alerts for changed material
shortfalls/backlogs/arrears, including clearance of the last alert, and actual
deliveries, referencing retained reports. An initial report with no alerts or
deliveries emits no briefing. Headlines distinguish active alerts, actual
deliveries and no active alerts; a clearance without delivery never claims one.
They do not auto-pause or impersonate reserved crisis/urgent events. Existing
difficulty interpretation remains downstream. Reports retain current evidence
for every Country plus reports referenced by bounded retained briefings; no
unbounded monthly history is added.

The military page displays dated staffing, salaries/arrears, exact equipment
partitions, stocks, maintenance, decomposed readiness/logistics, manufacturing
resources and paid/outstanding delayed orders. Commands set a gradual staffing
target or make later-funded procurement commitments. Defense authorization uses
the existing draft/submitted/enacted fiscal proposal lifecycle, never direct UI
treasury mutation. A stale report remains visibly stale after commands.

## Data, licences, migration and limits

`src/data/military-observations.json` retains one **partial historical source
reference** for UK Regular Forces: 136960 personnel and 10720 untrained, explicitly
dated 2026-01-01, from the UK Ministry of Defence publication of 2026-04-02.
The source is retrieved 2026-10-03 and attributed under OGL v3.0/Crown copyright 2026;
third-party content is excluded. Independently rounded figures are not exact
stock partitions, all personnel, trained availability or ready troops. They
initialize no army or payroll. Salary, authorized/available staff, equipment,
stocks and industry remain unavailable for all 252 Countries in the factual
scenario. The dated source can remain a historical reference in later reports,
never a current strength observation.

Retrieved HTML SHA256: `318eec30314f1a484d40fd6171bab8c0361430de45fb605ded34231c0449026e`.
Publication URL and limitations are persisted in the admitted reference. OGL
clearance does not clear existing IPU noncommercial or other unconfirmed
political-source licences; commercial release remains blocked.

Schema 13->14 migration preserves date, tick, seed, simulated existing branches,
votes, laws, wars, occupation and sovereignty. It initializes unavailable
military coverage at the **saved date**, with no replay, past reports, fictional
recruitment or historical spending. Genuine migration fixture
`military-migration-schema13.json` was generated by the exact parent engine at
800 days/2028-03-11, including active structural war and occupation, then
round-tripped by that original loader before migration testing. It was not made
by downgrading a schema 14 save. Existing genuine 0.14/0.15 fixtures remain intact.
Current-schema clone, snapshots, delta, invariant registry, save validation,
reload and fidelity conservation include the military branch.

Reproduction uses `scripts/generate-military-schema13-fixture.template`: archive
the exact parent with `git archive`, copy the template into that archive's
`src/simulation/__tests__/generateAdvanced.test.ts`, provide the current installed
dependencies without changing the parent source, set `ATLAS_SCHEMA13_OUTPUT` to
the explicit destination and run Vitest with that archive as `--root`. The
generator requires 800 actual ticks and an exact parent-loader round trip before
writing. The archived parent is a disposable task artifact, not the main or
parent worktree.

Run `npm run military:audit` for source admission plus synthetic behavioral/
failure integration tests, and `npm run military:benchmark` for the actual
252-Country world with one explicitly synthetic active capability. Run existing
economy/fiscal/information/politics/governance audits and benchmarks and final
`npm run verify -- -- --maxWorkers=1`. Tests include funding shortages,
maintenance accrual/recovery, real consumption, bounded commitments, lead-time
proof, fiscal withholding, government staleness/authority, genuine migration,
invalid-save rejection, deterministic continuation and fidelity conservation.

**Strict 0.19 exclusions:** no war/objective creation, combat, fronts, troop
movement, battle losses, operational logistics, occupation/control, sovereignty,
annexation, peace, victory or defeat. Every military command/month leaves the
pre-existing structural-war state untouched, including nonempty war/occupation
fixtures. No 0.17 systems are introduced. This V1 is generic and modelled, not
empirical global military calibration or a full military organizational model.
Global military calibration remains deferred debt before 0.19. Long-workload
performance remains under surveillance for later rebenchmarking, not a target
for this bounded post-audit correction.

## Original candidate validation record (before the post-audit correction)

Final local validation on Windows / Node 24.21.0:

| Command | Actual result |
| --- | --- |
| `npm run verify -- -- --maxWorkers=1` | 749/749 tests, 32/32 files; 463.44 s. Pinned-data audit, TypeScript build and Vite production build passed. |
| `npm run military:audit` | 67/67 behavioral/failure tests; 252 unavailable factual operative capabilities, one partial historical reference, zero factual operative admissions. |
| `npm run military:benchmark` | 1/1 actual-world workload passed, 15.43 s including runner overhead. |
| `npm run economy:audit` | 5/5 tests, reproducible coverage report. |
| `npm run fiscal:audit` | 26/26 tests. |
| `npm run politics:audit` | 42/42 tests, including the unchanged three-year world workload. |
| `npm run information:audit` | Source pipeline passed; 948 fictional leaders, seven derived source mappings, 941 modelled fallback leaders. |
| `npm run governance:audit` | 229/229 tests. |
| `git diff --check`; runtime `Math.random` and introduced TODO/FIXME/stub scan | Passed; no new forbidden runtime markers. |

The 749-test final run includes deterministic twins/save continuation, the
genuine 800-day schema-13 migration, the four-level fidelity cycle, nonempty
structural-war/occupation preservation, and rejection by invariants/serialization/
reload. New adversarial tests cover missing positive-mechanism inputs even after
desired targets are removed, known-zero versus unused categories, unknown
completed items, erased/antidated reports, blank metadata, non-array alerts,
fabricated briefings/provenance, paid salary above recorded expense, and invalid
readiness rendering evidence. Zero-cash AI financing, refusal with no financing/
arrears, and known-zero factory capacity are exercised through real cadence.

Latest military measurement: 252 Countries / 4574 Regions, one explicitly
synthetic active capability, 31 days (26 ordinary, four weekly, one monthly).

| Measurement | Observed |
| --- | --- |
| Initialization | 978.94 ms |
| Ordinary-day mean, including the first cold UI snapshot | 16.30 ms |
| Weekly-day mean | 701.92 ms |
| Monthly-day | 615.47 ms |
| Warm cached snapshot | 0.0036 ms |
| Cold snapshot | 984.10 ms |
| Serialize / reload | 483.35 / 688.99 ms |
| Save size / retained military reports | 31993745 bytes / 252 |

These are local samples, not empirical military calibration or a promised frame
budget. The successful verbose pre-final 742-test run also measured the existing
ten-year socioeconomic workload at 6.33 s, ten-year fiscal workload at 27.08 s,
three-year politics at 93.69 s, and dated information/governance world workloads.
Those unchanged workloads also passed in the final 749-test suite. The final
named politics audit measured three years at 86.67 s.

An exploratory 365-day full military UI sample exceeded its new 30-second bound
under concurrent work (117.8 s); no existing threshold was raised. The final new
benchmark is explicitly the bounded 31-day cadence/sample plus seven-day
save-continuation comparison, while existing long-world workloads remain intact.
An earlier full run had 728 passes and one obsolete future-schema assertion
(`14` is now current); the assertion now rejects `15`. Subsequent 737/742/743
passes were pre-final evidence, not the delivered final count.

**Separately reported inherited metadata repair:** the exact parent contained
stale checksum references for unchanged V-Party and leadership-evidence sources.
The existing information generator changed only five hashes across
`party-leadership-2026-01-01.json` and `party-leader-coverage-report.json`; no
source records, mappings, leaders, identities, counts or licences changed.
Both underlying sources, both permanent registries and all three original
historical golden fixtures remain byte-identical to the parent. No institutional
interest or succession implementation was rewritten.

The existing large production bundle warning and six dependency-audit findings
from dependency restoration (two moderate, four high) were not hidden or fixed
through unrelated upgrades. Military UI report-only rendering/controls are
covered by SSR tests; the development server returned HTTP 200, but no automated
interactive-browser click/screenshot validation is claimed.

## Post-audit correction validation (pending user diff review)

This bounded correction starts from `b27e59f8528bc181c8f69e7af7f9c134e45c9a0a`.
0.15 acceptance follows the user's independent-review decision; 0.16 still
requires the user's final complete-diff review. Earlier execution records above
describe their original revisions, not this correction.

The four repairs are final post-AI capability validation, positive-only
equipment/stock readiness, advisory notification on the last alert's clearance
with truthful headlines, and removal of the unused completed-order limit.
The directly coupled schema-14 compatibility correction validates old saved
evidence before changing affected derived zero-target components only. It
preserves dates, physical/fiscal state, source observations, retained briefings
and unaffected reports; it does not read current Reality or replay history.

Fifteen new regression cases cover invalid AI-created dates, four target
configurations, old saved-report compatibility/staleness and corrupt evidence,
missing/unknown readiness versions, and six alert/delivery transitions.
They include save/reload, deterministic continuation, no pause, government
access and unchanged structural-war/ownership fields. The initial eleven-case
reproduction failed five cases before the code repairs; the separate original
zero-target schema-14 compatibility test also failed before its bounded upgrade.
No existing test, benchmark threshold or dependency was weakened or changed.

| Command | Actual result (Windows, Node 24.21.0) |
| --- | --- |
| `npm run military:audit` | 82/82 passed; 252 unavailable factual operative capabilities, one partial historical reference, zero factual operative admissions. |
| `npm run military:benchmark` | 1/1 passed; runner 15.60 s, workload 11.229 s, unchanged 30-second threshold. |
| `npm run verify -- -- --maxWorkers=1` | Exit 0; pinned-data audit, TypeScript and production build passed; 764/764 tests in 32/32 files, Vitest 481.28 s. Existing large-bundle warning remains. |
| `npm run information:audit` | Passed; 948 gameplay parties, seven derived leader mappings, 941 modelled fallback leaders, unchanged source coverage. |
| `git diff --check` and introduced runtime TODO/FIXME/stub/Math.random scan | Passed; no introduced forbidden markers. |

The 31-day military sample retained 252 reports across 252 Countries / 4574
Regions with one synthetic capability: initialization 1002.14 ms, ordinary-day
mean 20.42 ms, weekly mean 724.05 ms, monthly 693.19 ms, cached/cold snapshot
0.0033/483.83 ms, save/reload 470.45/693.43 ms, save size 31993837 bytes.
These remain local workload measurements, not a long-term performance guarantee.
Global calibration before 0.19, later long-workload rebenchmarking and existing
commercial data-licence blockers remain deferred; no 0.17 or 0.19 work is added.
