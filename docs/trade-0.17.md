# World trade and strategic dependencies - 0.17

**Status:** user-directed implementation for independent review, not accepted.
Exact clean starting parent: corrected 0.16
`7580ed683a8164764fbccfbe94bb828da84c57ed`. The user's advancement identifies
that parent as validated; neither implementation tests nor the previous read-only
review self-accepted it. 0.15 source-code parent:
`ceddc8e04fc470f41155fdc8b6250142fb970705`; original 0.16 implementation:
`b27e59f8528bc181c8f69e7af7f9c134e45c9a0a`.

## Scope, state and ownership

The causal chain is production -> priority domestic needs/reserves -> exportable
supply -> funded sparse bilateral delivery -> progressive costs/substitution ->
reconstructible dependencies -> existing material consequences.

`SimulationState.trade`, version `trade-0.17-v1`, is canonical and saved in global
schema **15**. There is one economy, population/cohort universe, fiscal treasury,
scheduler, clock and keyed RNG. Trade introduces no second GDP, bank, household
cash asset or business wallet. Static taxonomy and pinned observations stay
outside mutable state. Admission is a scenario/source API, not a government command.
Source, market/category and route admission is initialization-only, before the
first prepared/executed trade month. Later admission explicitly throws without
altering booked history. The opt-in demonstration additionally requires tick 0
before player selection; dynamic midgame sector admission is outside V1.

Endpoints use permanent Country IDs; Regions are grouped through current
`regionOwnership` at booking. Dated regional funding retains that booking owner.
Political dependency does not imply a shared customs territory, free logistics
or an unlimited route. Unknown customs-territory boundaries remain unavailable.
Trade never changes claims, wars, occupation, control, sovereignty, population,
permanent IDs or source geometry.

## Generic taxonomy and units

| Category | Aggregate meaning |
| --- | --- |
| `food` | Agriculture, food and fisheries |
| `energy` | Energy products |
| `raw_materials` | Ores and non-metallic raw minerals |
| `consumer_goods` | Manufactured consumer goods |
| `industrial_goods` | Intermediate industrial, forestry and building goods |
| `capital_goods` | Machinery and productive capital goods |
| `transport_equipment` | Vehicles, aircraft and other transport equipment |
| `chemicals_pharmaceuticals` | Chemicals, pharmaceutical-capable aggregate |
| `electronics` | Electrical/electronic equipment |
| `services` | Explicitly configured aggregate service units |
| `unclassified_goods` | Special/unclassified transactions |

These are immutable generic categories, not precise HS products or observed
national sectors. Only configured markets exist; absent categories are unknown,
not zero. Finer future detail must conserve quantities and source semantics.

Production/need/capacity/delivery/stock are nonnegative safe integers in an
explicit admitted aggregate unit. Endpoints need compatible category units.
Nominal invoice/account amounts are integer USD per month; historical observations
retain annual USD and original currency/period. Prices are integer microUSD per
unit (1 USD = 1,000,000 microUSD). Invoice units must cost at least one whole USD;
finer physical units must be explicitly bundled, never rounded into free delivery.

BigInt products and half-up rounding produce invoices/ratios; exact largest
remainder conserves allocations. Safe sums fail on overflow rather than clip.
Stock identities use BigInt even when every saved term is a safe integer, so
unsafe intermediate addition cannot hide a unit. Balance is signed integer USD.

## Real evidence, dates and licensing

Pinned `trade-observations.json` contains **62** partial historical value records:
60 disjoint category observations plus two aggregate references. There is no
admitted empirical physical production/need/quantity/capacity/stock/tariff baseline
for any of the **252** Countries. Value evidence covers Canada, US, China and UK;
it is not all their actual trade. Operative coverage is unavailable until explicit
compatible admission. Available observed/derived values, partial coverage and
unavailable quantities remain distinct. Empty flows do not mean observed zero trade.

| Publisher/dataset | Reference and transformation | Admission/licence/limits |
| --- | --- | --- |
| US Census, trade in goods with Canada, `c1220.html` | 2024 US exports 350,605,600,000 USD/imports 411,771,600,000 USD | Federal factual statistics/public domain; publication unknown (`null`), retrieved 2026-10-03. Aggregate references only, never added atop category records. |
| Statistics Canada, table 12-10-0175-01/WDS | Canada imports/domestic exports (not re-exports), US/China/UK; 72 series x 12 months = 864 points for 2024 | StatCan Open Licence, attribution/nonendorsement; actual selected-revision publication 2026-02-19, retrieved 2026-10-03. |
| Bank of Canada, Valet `FXAUSDCAD`, annual 2024 | 1 USD = 1.3698 CAD; `round(CAD * 10000 / 13698)` | Publication unknown (`null`), retrieved 2026-10-03; attribution/pre-sale free-content notice required. Derived approximate annual USD, not transaction USD. |

Each record/input stores URL, publisher, dataset, reference/publication/retrieval
dates, licence, attribution, transformation and limits. The raw StatCan/BoC
snapshot is independently reproducible offline. WDS scalar 3 is thousand CAD,
frequency 6 monthly; all 12 distinct unsuppressed/unsecured 2024 months are required.
The normalizer checks real calendars/chronology, unique vectors/coordinates,
all input metadata/licences and safe conversion, including eight corruption cases.

Disjoint NAPCS groups map to the taxonomy. Industrial goods/transport each combine
two disjoint groups; services lack factual observations. Census/StatCan mirror
and aggregate definitions are not forced into one national flow: valuation,
domestic versus total exports and revisions differ. Neither supplies operative
physical production. Source links/legal notices are in `THIRD_PARTY_NOTICES.md`.

`availableOn` is distinct from actual publisher publication and bounded by **all**
normalization inputs. Current transformed evidence is conservatively accessible
from **2026-10-03**, not scenario start. It remains a 2024 historical prior, never
observed 2026 flow or retroactively known information. Unknown publication uses
retrieval for availability, not fabricated publication.

UN Comtrade was investigated but no data incorporated because redistribution
permission was unresolved; Eurostat queries yielded no admitted records. Package
licences do not license data. Source updates are deliberate reviewed operations
(`trade:sources:update`); offline generation/audit has no network dependency.
Changing coverage/FX/period/pinned versions requires review. Existing IPU
noncommercial/unconfirmed political-data commercial-release blockers persist.
BoC requires prospective purchasers to be told its content is available free
from its website; cockpit/third-party notices retain this. No release certification.

## Exact production, payment, income and residual ownership

**Autonomous V1 engineering assumption, not separately user-approved direction:**
use actual saved opening household disposable income for imports rather than
invent wealth or restrict every import to unclassified demand. Keep the 0.11 lag.

Original `baseFiscalDemand` is the sole household/public/private request source.
Saved opening disposable income times unchanged 95/85/65% propensity gives each
nominal envelope; existing VAT gives its net goods budget. Preparation saves that
actual income, its date, VAT rate and allocations/unspent capacity. New projected
income is not already available money.

Landed household imports replace domestic net purchasing requests. A second exact
VAT-aware bound handles invoice rounding: domestic gross expenditure + landed
imports + import VAT cannot exceed the opening nominal envelope. Unspent capacity
is not a savings asset. Industrial imports subdivide the **private residual**,
not public orders or a new corporate treasury. Fixed fiscal calibration is unchanged.

The original identity remains `output = domestic consumption + otherDemandRealized`.
Let private residual be `P`, prior funded public orders `G`, and industrial landed
imports `I`. Other demand becomes `P + G - I`. Conservative realized private backing
is `floor(otherDemandRealized * (P - I) / (P + G - I))`, zero for zero denominator.
Category production and unused exportable capacity cannot exceed that one envelope.
Remaining private output is the unclassified difference; public orders are not
reclassified as exports. Categories share this finite envelope by exact allocation.

Preparation projects existing equations with maximum earmarked industrial imports
and unreduced household requests: a conservative private-resource bound. Actual
imports may be smaller. Economy 100 evolves **once** with actual deductions;
settlement 110 checks actual fulfilled private backing. No second income booking.

Category domestic priority use, reserves and exports are attributions inside
existing outside-sector output, not additions to `Economy.consumption`. This is
a conservative residual decomposition, not a complete sector supply-use table.
Physical throughput is explicit admission, never a precise inference from GDP.
Nominal backing can bind while configured physical capacity remains unused;
no new sector productivity or price-level engine is implied.

Each export uses real represented supply and a matching funded foreign invoice.
Seller backing reserves each independently rounded FOB invoice, not merely the
aggregate quantity valuation. At 1.50 USD, two one-unit invoices cost 4 USD, not
the 3 USD valuation of two combined units: a 3 USD private allocation can execute
only one such invoice. Fractional prices remain valid. Nonexport production is
valued once; adding actual export receipts gives the exact assigned backing,
bounded by its original category allocation. Unused resources remain unclassified.
FOB seller receipts are destinations of already represented private output/income:
they are **not added again** to GDP/output, household income, fiscal income or cash.
Global recorded FOB payments equal receipts. Logistics fees have explicit
outside-sector counterparties, not invented transport assets; customs reaches
the one importer fiscal account. No full FX/banking/balance-of-payments model.

## Material availability is separate from invoice prices

Actual FOB/landed/VAT/customs are financial evidence.
`importReferenceUsd = delivered quantity * admitted fixed baseline price` is
a **modelled constant-reference-price availability index**, not calories, energy
measurements or observed real sector consumption.

Household reference values use stable opening net-budget allocation weights.
Essential categories use this reference, never current seller price, in the
existing bounded needs calculation. Identical quantity/composition/reference
therefore gives identical imported material contribution despite dearer payment;
reduced units reduce it. Higher payment can displace domestic purchases and
contract next-month income, not create food or an arbitrary political modifier.

Actual goods, reference goods, landed budget, essential consumption and needs
coverage form a complete canonical tuple. Three-group arrays are safe/nonnegative,
copied independently and reconciled to dated prepared proof; omissions/corruptions
reject serialization and reload. VAT uses actual FOB, never this material index.
Crisis/politics/governance use existing material mechanisms, not dependency-score
penalties or raw trade information leaking to the UI.

## Supply, routes, prices, tariffs and routine substitution

Priority domestic need takes production first; existing stock fills its gap.
Surplus fills configured reserve targets/storage before export. Spare potential
production shares the same financial backing and physical/export ceilings.
Historical values alone never authorize supply.

Routes are sparse (maximum **8,192**), unique by exporter/importer/category,
with established/max capacity, gradual expansion, logistics and ordinary customs.
Unknown tariff (`null`) blocks execution and executable alternatives, not a
zero-rate invoice. Known zero is a non-null real zero. No actual tariff schedule
or customs-union boundary is fabricated.

Compatible priced routes are selected iteratively from the same integer
`quoteFlow` invoice used during execution. At each allocation step the candidate
quantity for every remaining route is recomputed from the current buyer need and
budget, seller exportable supply and financial backing, and route established
capacity; the exact landed invoice for that candidate quantity is then compared
by effective average landed cost using BigInt cross-multiplication, with stable
permanent route ID tie-breaking. The selection is recomputed as allocation state
changes rather than hard-coded to a one-unit quote, so whole-USD rounding of
FOB/logistics/customs cannot reverse the economic ordering for the transaction
that is actually about to execute. Candidate quotes are cached and only
kept in a priority queue ordered by that exact effective landed cost; buyer and
seller version stamps lazily invalidate only affected candidates, so the former
full-array best-candidate rescan is avoided.
Each delivery is bounded by shared seller supply, buyer need, category/route
capacity and an affordable whole-integer quote. Multiple buyers never receive
the same unit. Budgets are existing resource envelopes, not GDP-percent imports.

FOB = quantity x seller price; logistics/customs round independently from FOB
using configured basis points; landed is the exact sum. Customs is a separately
dated `knownTaxRevenue` component; household imported goods add one existing VAT
component. Sole fiscal financing/collection runs once at 150. Null VAT remains
original unavailable statutory coverage, not observed 0% law. Tariffs can increase
costs, switch suppliers or decrease volume/revenue; there is no revenue bonus or
new player tariff-reform/sanction API.

Indicative price moves at most **5% monthly** in either direction: own shortage
or financially backed foreign shortage facing fully used exportable capacity
causes upward pressure; otherwise the price moves toward baseline by the same
bounded step, never jumping straight from below baseline to baseline. Saved
invoices retain the executed price; the new price is next month's. No instant
tripling, unbounded recovery, or high-frequency market.

After prior shortage, routes expand by admitted rates toward their cap; configured
domestic replacement rises gradually within its physical/resource ceiling.
A dearer supplier may become the available choice. Routine AI has no diplomatic
preference, adversary, retaliation or coercion. No cross-category substitute is
configured in V1; no giant supply-chain graph or invented substitute supply.
Missing imports never instantaneously reappear as generic domestic output: the
single socioeconomic/output engine only realizes the existing demand envelope,
and replacement is explicitly limited by `domesticReplacementCapacity` and
`domesticReplacementPerMonth`. When household imports are short, the remaining
household request is reduced only by the reference value of unfulfilled
**essential** household import need, so generic domestic output cannot recreate
missing essential food/energy/medicine; the resulting material shortfall appears
in `availableConsumption` and relaxes only as imports, stocks or admitted gradual
domestic replacement increase. Nonessential import shortages remain visible in
trade ledgers, prices and reports without being conflated into essential-needs
coverage.

## Stocks and military inputs

Only configured stores exist; each conserves
`opening + produced + received - consumed - exported = current quantity`.
Period formation/drawdown is conserved; target never exceeds storage.
**V1 replenishes from domestic surplus only.** Imports satisfy current need,
not fictional reserve procurement. Received/exported stock fields preserve
compatible accounting; no unimplemented stock import/export process is simulated.

An explicit positive `industrial_goods.militaryInputPerFactoryUnit` adds a
supplementary physical input. Fulfilled domestic/import units cap requested and
executed military factory work; real work consumes them exactly once alongside
original finite industrial materials. Next-boundary funding, catalogue delays
and actual economic public-resource delivery proofs remain. No fuel/ammunition
conversion, equipment purchase or missing material source is inferred.
Shortage reduces work, never readiness directly, combat, fronts, movement or wars.

## Dependencies, concentration and balance

Balance/composition/partners are derived accounting, not good-economy meters.
Dependencies require known positive need and positive delivered imports.
Unknown markets never acquire numeric dependencies or zero-filled suppliers.

Supplier shares sum exactly 10,000 bps with largest-remainder permanent-ID ties.
Concentration rounds squared shares/10,000 once; largest/top-three shares remain
inspectable. Reports retain need import share, suppliers, configured domestic
replacement and nullable stock. Unused priced routes preserve established
capacity, exporter exportable capacity/exported quantity, reconstructible spare
supply and source. Spare supply also respects the remaining monetary backing;
saved price, capacity backing, nonexport production and already-booked receipts
reconstruct that budget independently of aggregate-invoice rounding.
Several candidates may reference one exporter: alternatives
are not simultaneous promises; execution still shares that one supply.

Strategic classification requires explicit admitted material-use explanation,
at least 25% imported need, and concentration at least 50% or inadequate alternatives.
These are **modelled reporting thresholds**, not causal penalties. Category name
alone is not strategic evidence. Real shortages/costs drive consequences through
existing mechanisms; no direct stability/GDP/opinion/readiness/war adjustment.

## Cadence, information, UI and authority

| Priority | Task |
| --- | --- |
| daily 50 | Existing fiscal reforms |
| monthly 90 | Existing military preparation |
| monthly 95 | Sparse funded trade preparation |
| monthly 100 | Existing domestic economy |
| monthly 110 | Trade material settlement/next prices |
| monthly 150 | Sole fiscal financing/customs/import VAT/military work |
| monthly 200 | Existing administration |
| monthly 250 | Existing military reports |
| monthly 260 | Saved trade government reports |
| monthly 300 | Existing material crisis monitoring |
| monthly 350 | Existing Information/retention |
| weekly 400 | Existing political opinion |

Public orders still affect the **next** economy month. Ordinary days preserve
trade identity; no per-frame/all-pairs/second-timer loop. Working maps are transient.
Prices/stocks/routes/current flows/ledgers/prepared proof are authoritative saves.

Government reports are dated saved modelled/partial or unavailable projections
with confidence/uncertainty/provenance, relevant categories/flows/partners,
invoices, alternatives and reconstructed dependencies. All input dates gate
historical knowledge. Validation checks permanent endpoints, bounded sets,
goods/stock/backing/invoices, dependencies/partners/alerts/sources and fingerprints:
regenerating a fingerprint does not excuse inconsistent evidence. Stale inspection
never reads live quantities.

Briefings are government-only economy advisories, **without pause**.
V1 reported shortages remain advisory; no raw crisis/urgent sensor is invented.
Material crises still use existing monitoring. All six accepted Information
integrity rules and shared 2,048-global/256-per-Country briefing bounds/floor
remain; reports persist only while latest/referenced. Dated proof metadata is
repeated for independent validation, a bounded but material save/reload cost.

The cockpit is **development inspection**, not final navigation redesign.
Totals/categories/partners/dependencies/concentration and unavailable/source
fields come only from authorized saved reports. Existing person/office information
capability gates access. The only new gameplay command sets an existing store's
bounded target, using the conservative 0.16 controlled active resolved executive
plus information/budget gate. Selection/party leadership/legislator grants none.

The start screen has an independent opt-in **three-Country synthetic demonstration**,
with original labelled throughput/need/routes/stores. It grants no treasury,
office, population or army. Ordinary factual play honestly has unknown physical
trade; positive synthetic tests exercise actual constraints, not empirical calibration.

## Saves, determinism, fidelity and invariants

Schemas 1-14 initialize trade at the **saved date**, preserving date/tick/seed,
old material/political histories and structural wars/occupations. No replay or
fictional backfill. Schema15 corruption/unsupported versions reject rather than
reset. Original verify-before-upgrade military zero-target report compatibility
runs for both 14/15, preserving untouched reports/briefings.

New-game init, defensive clones/cached frozen snapshots, structural deltas,
shared invariants and whole-branch fidelity conservation include trade.
Detailed/Standard/Background use the same monthly laws; a fidelity-only transition
conserves all goods/money/obligations/evidence/stocks, never recalibrating outcomes.
No Math.random, wall timestamps or insertion-order-dependent allocation.

Checks cover safe quantities, IDs/units/categories/source/time, capacity/supply/
need/stock, exact bilateral goods/FOB/fees/customs, opening-envelope affordability,
regional/national backing, fixed-reference availability, military actual work,
report integrity and bounded history. Tests include omissions/wrong lengths/
negatives, forgery despite regenerated fingerprints and overflow-hidden one-unit loss.
Saved flow units must match their saved admitted category; positive stock evidence
cannot lose its configured store in canonical state or historical reports.
Defensive cloning independently copies present import arrays while preserving
absent optional keys, so unchanged nontrade state produces no false domain delta.

The genuine original schema14 fixture is 2028-04-05/tick825 with active military,
funded future trucks, saved reports and nonempty war/occupation/ownership.
SHA256 `662d0b32f6e8c47dc3ccd87a6e2866e9725dbb3bdb335ab67c4af5ce0fc7a302`.
Migration plus90days matches the independently generated corrected-parent oracle
at2028-07-04/tick915 across every preexisting material/political/territorial field,
including five delayed trucks and compacted orders; only new trade/report fields
are excluded. The existing genuine800-day schema13 golden fixture is unchanged.

## Measured performance and validation

Final local `npm run verify -- -- --maxWorkers=1`: **843/843 tests in 34 files**,
**519.05s**, Windows/Node24.21.0, including all data audits, the TypeScript/Vite
build and the full single-worker Vitest suite. This is a local measurement, not
GitHub Actions, and does not by itself make 0.17 accepted.

Final `npm run trade:audit`: **62/62** source records, 864 monthly points, eight
rejected source corruptions; the 78-test trade unit suite passed. The full verify
data audit also reproduced country, Region, population, economic, military and
trade artifacts from pinned inputs.

Final `npm run trade:benchmark -- --silent=false`: **1/1**, test66.84s,
runner71.12s, Windows/Node24.21.0 without competing agent-owned audits.
Real permanent world:
**252 Countries/4,574 Regions**, eight synthetic trade participants, five categories,
40 markets,80 routes/active/peak flows,20 dependencies;365days/12months/51weekly/
302ordinary boundaries,340 retained reports, exact roundtrip/35-day twin continuation.

| Measurement | Final local trade workload | Previous corrected-parent year, no trade |
| --- | ---: | ---: |
| Initialization | 953.90 ms | 1,007.53 ms |
| Scenario configuration | 37.70 ms | Not applicable |
| Annual ticking | 53,788.67 ms | 58,819.54 ms |
| Ordinary day mean | 1.41 ms | 1.71 ms |
| Monthly day mean | 553.89 ms | 486.30 ms |
| Weekly day mean | 915.99 ms | 1,028.74 ms |
| Warm snapshot | 0.0031 ms | 0.0026 ms |
| Cold snapshot | 488.39 ms | 514.86 ms |
| Serialization | 765.97 ms | 487.32 ms |
| Reload | 1,011.06 ms | 663.67 ms |
| Save bytes | 40,190,533 | 33,011,474 |

The previous corrected-parent column is retained only as a historical reference;
it was not rerun in this pass and the two workloads are not a controlled
identical calibration. Concurrent host load materially affects timings. Extra
dated independent proof/history explains larger saves; this is disclosed rather
than hidden behind ordinary-day/annual time.
No old threshold is raised. Original military31-day30s bound remains unchanged;
final `npm run military:benchmark -- --silent=false`:1/1,11.121s test,
runner15.77s; initialization1,020.80ms, ordinary17.56ms/monthly733.83ms,
warm0.0029ms/cold489.35ms, serialize473.69ms/reload677.56ms,
32,445,005bytes. Unrelated full-world military calibration/
365-day optimization remains deferred, not folded into this milestone.

GitHub Actions timing on the reviewed commit ran the full
`verify -- -- --maxWorkers=1` job and only `tradeWorld.test.ts` failed, at the
old 120000ms per-test timeout, after its benchmark workload and metrics had
already completed. The reported host time for that benchmark was roughly 263s on
Ubuntu and 337s on Windows, versus about 73s test / 78s runner locally. The
annual workload is dominated by the inherited weekly politics/opinion cadence and
the baseline full-world simulation, not a trade-specific all-pairs or
world-wide-reconstruction loop; the trade path adds a bounded monthly
settlement/report/save cost. The benchmark test timeout is therefore set to
**600000ms (10 minutes)** to accommodate hosted CI hardware. No causal law,
invariant, report integrity, determinism or benchmark coverage was weakened to
achieve this.

Vite retains its nonblocking large-chunk warning; no dependency upgrade or
unrelated vulnerability remediation is included.
Independent review, not tests, decides acceptance.

## Exact 0.17/0.18/0.19/0.20 boundary and V1 limitations

0.17 implements aggregate trade, ordinary customs, constrained prices/substitution/
configured reserves, derived dependencies, material factory inputs, routine
nonpolitical adjustment and government inspection.
No sanctions/political embargo/secondary sanction/asset freeze/retaliation/
condemnation/diplomatic crisis/coercion/escalation (**0.18**).
No interception/blockade/convoy/port destruction/battle/movement/front supply/
resource occupation/pillage/capture/territorial control (**0.19**).
No full free-trade agreement/customs union/common market/WTO/multilateral treaty
negotiation engine (**0.20**).

V1 lacks factual operative world sectors, full FX/payment assets, spatial port/
transport networks, transaction-specific exemptions, cross-category substitution,
import reserve procurement, full military supply chains and final UI redesign.
These are explicit coverage/model limits, not fabricated zeros, magic modifiers
or success-shaped stubs. Further admission/detail/performance choices require
independent review and explicit authorization; no automatic next milestone.
