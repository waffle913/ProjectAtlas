# ProjectAtlas — Milestone 0.10

An original political-map foundation for a future geopolitical simulation, with the starting simulation date fixed at **2026-01-01**.

## Milestone 0.10

Monthly population/cohort/economy loop, explicit simulation priors separate from audited data, bounded administrative AI, exogenous shock diagnostics and save schema 8. See [the model and migration contract](docs/socioeconomy-0.10.md) and [per-Country coverage](src/data/socioeconomic-coverage-report.json). `npm run economy:audit` verifies the reproducible report; `npm run benchmark:world` measures the actual monthly world runtime alongside the historical probe.

## Run

`npm install` then `npm run dev`. Run `npm run verify` for country, Region, demographic and economic reproducibility validation, type-checking, production compilation and automated tests. `npm run data:generate`, `npm run data:regions:generate`, `npm run data:population:generate` and `npm run data:economy:generate` regenerate derived data offline from checked-in inputs.

Milestone 0.8 adds the shared deterministic engine contract used by future simulation systems: canonical state access, a daily multi-cadence scheduler, keyed RNG, dirty domains, persistent adaptive fidelity, shared invariant validation and explicit reality/information/perception types. See [`docs/engine-contract.md`](docs/engine-contract.md). Run `npm run benchmark:world` to produce the reproducible full-world performance baseline.

Milestone 0.9 audits the actual V1 data without changing permanent identities or inventing missing values. Run `npm run data:audit` for the aggregate reproducibility and structural audit. The human summary is [`docs/data-audit.md`](docs/data-audit.md), and [`src/data/data-audit-report.json`](src/data/data-audit-report.json) contains normalized coverage for every Country and Region.

Source updates are deliberately separate from generation. `npm run data:sources:update` refreshes country sources. `npm run data:regions:sources:update` downloads the pinned Admin-1 version, then `npm run data:regions:reconcile` matches it against existing permanent identities without allocating IDs. Any unmatched, ambiguous, split or missing identity fails and requires review before regeneration.

## Population baseline

Population identity is keyed only by permanent ProjectAtlas Region IDs. The committed `region-demographics.json` keeps published observations and immutable baseline metadata separate from mutable `SimulationState.populationByRegion`. Country population under control is calculated from current Region owners; transferring a Region never rewrites its inhabitants.

The compact national snapshot is reproducibly extracted from the UN World Population Prospects 2024 Medium variant. Its `TPopulation1Jan` value for 2026 remains explicitly a UN projection dated 2026-01-01. The checksum-verified compressed CSV belongs in `.cache/population/` and is not committed. `npm run data:population:sources:extract` rebuilds the compact snapshot.

WorldPop Global2 R2025A v1 constrained population counts for 2026 at 1 km are the pinned spatial source (DOI `10.5258/SOTON/WP00845`). The 289 MB GeoTIFF stays in the ignored cache and is verified by SHA-256 before processing. `scripts/worldpop_zonal.py` uses the authoritative source Admin-1 geometry with Rasterio/GDAL and Shapely to detect overlaps, double-counting, suspicious gaps, zero-population Regions and population outside parent boundaries. Exact tool versions, thresholds and every rejected country are recorded in `population-spatial-audit.json`. Only accepted complete country weight sets enter `population-spatial-weights.json`; zero is never shorthand for unknown.

`npm run data:population:generate` regenerates compact artifacts, `npm run data:population:verify` checks byte-for-byte offline reproducibility, and `npm run data:population:rebuild` performs the deliberate full-raster audit. The rebuild requires Python 3 with the exact versions `rasterio==1.4.3`, `shapely==2.1.2` and `numpy==2.2.6`; it fails with a setup command when unavailable. Ordinary `npm run verify` remains offline and practical.

## Regional economic baseline

`src/data/country-facts.json` remains the sole source of national nominal-GDP observations. Each observation retains its actual reference date, estimate flag and source provenance; it is never relabelled as a 2026 statistic. `src/data/region-economic-baselines.json` is a separate generated model layer keyed only by permanent ProjectAtlas Region IDs, while mutable values live in `SimulationState.economicOutputByRegion`.

Economic baselines use integer whole US dollars per year (`USD_PER_YEAR`). A one-Region country receives its rounded whole-dollar national observation directly. A multi-Region country is allocated only when every Region has a usable demographic baseline. Allocation uses baseline population weights and an exact BigInt largest-remainder calculation, with permanent Region ID as the tie-breaker, so the Region sum equals the selected whole-dollar national total exactly. These values are modelled allocations, not observed regional GDP. Incomplete demographic coverage or a missing national GDP keeps every affected Region explicitly unavailable; zero is never used as a substitute for unknown.

`npm run data:economy:generate` rebuilds the baselines and coverage report from committed country facts, Region identities and demographic records. `npm run data:economy:verify` regenerates them and requires byte-for-byte equality. No network access or duplicate economic source snapshot is involved.

## Diplomacy, claims and casus belli

Diplomacy is sparse simulation state keyed only by permanent ProjectAtlas Country IDs. Bilateral pair keys are canonical and order-independent; a missing pair means score `0` and `neutral`. Scores are bounded to −100…+100, and all update helpers are immutable.

Territorial claims target permanent Region IDs, never Natural Earth geometry, Admin-0 features or legacy macro Territories. The reviewed 2026 baseline is deliberately empty: ProjectAtlas does not infer claims from borders, history, ethnicity, language, proximity or source-map dispute labels. Renounced claims remain in save history. A claim is not rewritten when ownership changes.

Territorial-claim casus belli are derived at query time from active claims and the authoritative `SimulationState.regionOwnership`. If a claimed Region changes owner, the same claim automatically targets its new owner; a claimant controlling the Region receives no self-CB. Persistent explicit CB records support future event-created `territorial_claim`, `retaliation` and `containment` reasons, but this milestone creates none automatically. Used, revoked and expired records are excluded from availability queries.

Admin-0 polygons remain a navigation and overview layer, not authoritative political ownership. Their overview fill is derived from child Region owners and becomes neutral when ownership is mixed. Detailed Region rendering already colours each Region by its current owner, allowing partial control without changing source geometry.

## Limited war, occupation and peace

Wars are persistent bilateral records keyed only by opaque ProjectAtlas IDs. Milestone 0.7 supports one objective, `take_region`, authorized by a currently available territorial CB. Declaration snapshots that CB permanently; later claim renunciation or CB expiry cannot invalidate the war. Explicit CBs are marked `used`, while derived claim CBs have no redundant persistent record to consume. Ended wars remain in save history.

Occupation is stored separately in `occupationByRegion`. It never changes sovereign `regionOwnership`, population, economic output, claims, identity or legacy macro ownership. Only opposing belligerents in an active war may occupy one another's Regions, and one Region can have at most one occupation. The map preserves the sovereign owner fill and adds a dashed red occupation boundary.

The attacker objective is satisfied only when it occupies the declared target under that war. Attacker victory then transfers exactly that one Region through `regionOwnership`; every other occupied Region remains with its sovereign owner. Defender victory and white peace transfer nothing. Every peace outcome records the result, retains the ended war, and clears that war's occupations. There is deliberately no war score, army, combat, pathfinding, alliance or military-economy model yet.

## Model

The map is explicitly not the game state. `Country` holds stable political identity, `Region` is the primary gameplay ownership unit, and the existing macro `Territory` remains for compatibility and source mapping. `SimulationState.regionOwnership` changes independently from identity and geometry. The model is Country → Region → replaceable source feature(s); replacing, reordering or simplifying geometry does not replace a Region.

### Global Region registry

`src/data/region-id-assignments.json` is the authoritative identity registry. Its 4,574 active records contain the permanent opaque ID, ProjectAtlas name and aliases, parent/initial country, administrative type/level, optional unique ISO 3166-2, stable external identifiers and lifecycle status. It contains no Natural Earth feature ID or `adm1_code`. Reserved and retired IDs remain recorded and can never be recycled. `src/data/region-registry.json` is the derived runtime view that adds current geography status and contains all 4,574 Regions covering every one of the 252 country entities.

`src/data/admin1-mapping.json` is the dataset-specific alias layer. It maps the pinned dataset/version, Natural Earth feature IDs, `adm1_code` values and source labels to permanent Region IDs. Multiple source features may intentionally map to one Region. None of these aliases participates in permanent ID construction. Ambiguous duplicate ISO codes remain source metadata and are never promoted to duplicate authoritative codes.

The reconciler uses existing aliases, exact unique ISO 3166-2, stable Wikidata identifiers, parent country and reviewed name aliases. Conflicting or absent signals fail. A confirmed genuinely new administrative entity requires a reviewed decision file passed to `npm run data:regions:confirm-new -- <decision.json>`, followed by an explicit reconciliation override. Splits never reuse an existing ID for both children. Merges require old identities to be marked retired with an explicit successor; old IDs remain available for save migration.

`src/data/admin1-coverage-report.json` separates countries with clean source coverage, countries using fallback Regions, and countries whose source coverage is potentially incomplete or ambiguous. The current snapshot yields 213 countries with Admin-1 source regions and 39 fallback countries; 69 of the 213 require extra review. A fallback uses the existing Admin-0 Territory where available, otherwise the Region remains playable with an explicit unavailable-geometry record.

The original 40.7 MB source snapshot stays under `src/data/source-snapshots/`. Generated runtime geography is topology-simplified and split into 213 country-scoped assets under `public/data/admin1/countries/`; it is fetched only after selecting a country. A separate heavily simplified local overview provides subtle global Region boundaries. No Region geometry requires a runtime network request.

### Persistent entity registry

`src/data/entity-registry.json` is the authoritative, versioned geopolitical registry and the sole runtime source for country names, classifications, sovereign relationships, ISO/M49 codes, capitals and UN regions. It contains 252 entities: all 193 UN members, the two UN observer states, dependencies, partially recognized entities and special-status territories. IDs are opaque literals: never regenerate, rename, recycle, or derive them from labels, codes, ordering or coordinates. Their durable assignments live in `src/data/entity-id-assignments.json`; missing official codes remain absent.

Registry coverage is intentionally broader than map coverage. Every entity owns a registered territory, but geographic mapping is optional: 177 territories map to the bundled Natural Earth layer and 75 explicitly record that bundled geometry is unavailable, with provenance. Conversely, every displayed source feature must map exactly once to one registered territory. This lets saves retain entity references when geometry is absent or later replaced.

`src/data/country-facts.json` stores separately dated observations. Every required field has an explicit `available` or `unavailable` status. Available values include source, URL/dataset identifier, retrieval date, reference year/date and estimate flag; unavailable values include a reason, checked date and the source consulted. World Bank values retain their published year—ProjectAtlas does not relabel them as 2026 statistics. Currency and language records use the pinned open mledoze World Countries snapshot. Government forms come from a dated, pinned Wikidata snapshot rather than an undated label.

`src/data/political-offices.json` keeps office definitions separate from officeholder timelines. Every sovereign or partially recognized registry entity has head-of-state and head-of-government office definitions, each with either a dated holder or an explicit sourced unavailable status for 2026-01-01. This model allows later officeholder succession without changing country identity.

`src/data/natural-earth-mapping.json` maps this particular geographic dataset's NE_ID values to existing registry entities. Natural Earth supplies geometry and debug metadata only. `buildWorld()` obtains political identity exclusively from ProjectAtlas data. Unmapped, duplicate, missing or ambiguous features and broken references fail explicitly, reaching the application's loading-error screen.

The registry freezes the IDs produced by release `83ce014` for the bundled dataset, preserving existing country and ownership references without a migration. Their hash-like spelling is historical only: no runtime hashing remains. Saves should persist these internal IDs, never source feature IDs.

To adopt a new dataset or resolution, add a reviewed DatasetMapping that maps its external feature IDs to the same registry IDs and pass it to `buildWorld`. Edit external aliases when standards change; do not edit internal IDs. The current importer expects one Polygon/MultiPolygon feature per territory: merge multipart source features explicitly before import. A real new entity requires a newly assigned, unused opaque ID committed to the registry. Splits/mergers need an explicit future save migration; geometry updates alone do not. Retain old IDs for saved references rather than silently deleting them.

Tests cover the 193-member invariant, registry/map decoupling, exact feature mappings, legacy IDs and saved ownership. Region tests replace every source feature ID, `adm1_code`, name, geometry and order while retaining the same permanent IDs through reconciliation. They also cover explicit split allocation, mandatory merge retirement/successor migration, unique ISO 3166-2 codes, missing-geography provenance, immutable transfers, save round trips and rejection of unsupported future save schemas. Reproducibility checks regenerate every country and Region output and fail if committed bytes differ.

`SimulationClock` is UI-independent. It starts from 2026-01-01, measures real elapsed time, progresses one game day per second at ×1 (with ×2 / ×5 multipliers), and is separately tested along with pure territory transfers.

Save schema version 2 adds `regionOwnership`, version 3 adds Region population, version 4 adds mutable Region economic output, version 5 adds diplomacy, version 6 adds persistent wars plus Region occupations, and version 7 adds deterministic engine state. The explicit v6 → v7 migration preserves the complete world and initializes the seed, tick, scheduler queues, dirty state and every Country at `Standard` fidelity. Restoring v7 requires Country/Region registry context and runs shared invariant validation, including diplomacy and war checks. Unknown future schema versions are rejected rather than guessed to be v1. `transferRegion()` is pure: a transfer produces a new state without mutating the prior save, country profile, Region identity, population, economic output, claim or geometry. Country-controlled population and output are complete-only sums of sovereignly owned Regions; occupation alone changes neither aggregate.

Natural Earth admin-0 country geometry, plus its 110m physical land, lakes, and river centreline datasets, are stored in `public/data/`. They are public domain. The map uses no runtime tile service or remotely loaded map asset, and remains usable while disconnected. Attribution is retained in the application and this document; see [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).

The physical layers are a local visual basemap only. Political ownership and international borders are rendered separately above them from territory state; no political border is baked into the background.

Admin-0 outlines remain the strong international border layer. Admin-1 boundaries are a separate subtle layer that becomes clearer at closer zoom. Country fills use a deterministic muted palette, and all Regions with the same current owner share that owner's colour. After selecting a country, zoom level 4 or closer exposes its lazy-loaded Region polygons and Region panel.

## Geopolitical assumptions

ProjectAtlas explicitly classifies sovereign states, dependencies, disputed entities, partially recognized entities and special-status territories. Dependencies link to their sovereign entity. Natural Earth classifications are retained only under `sourceMetadata` for debugging; they cannot change the ProjectAtlas classification. Map boundaries are a visual baseline, not a legal statement.

## Country-data sources and limits

The complete source inputs are committed under `src/data/source-snapshots/`, including snapshot IDs, retrieval dates and source URLs. ISO codes are referenced to the ISO 3166 Maintenance Agency; names, M49 codes and UN regions use the UN Statistics Division M49 list. Population, area and GDP observations use World Bank World Development Indicators. Capitals, currencies and languages use a mledoze World Countries revision pinned to a Git commit predating the simulation start. Officeholder timelines and government forms use pinned Wikidata query results, supplemented by reviewed explicit overrides for documented gaps. The UI cites every displayed fact and exposes its actual reference date and estimate status.

Some disputed or partially recognized entities have no assigned ISO or M49 code; those fields remain absent. Statistical and government-form coverage varies because the consulted sources do not publish every field for every territory; these gaps remain explicit rather than being fabricated.

## Admin-1 source, licence and limitations

The pinned source is Natural Earth **10m Admin-1 States and Provinces 5.1.2**, Git commit `f1890d9f152c896d250a77557a5751a93d494776`, retrieved 2026-09-26 and verified by the SHA-256 stored in `natural-earth-admin1-metadata.json`. Natural Earth data are public domain; see [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/).

Natural Earth describes this global Admin-1 layer as beta. It can be incomplete, generalized, inconsistent in administrative level, or geopolitically ambiguous. ProjectAtlas therefore does not equate source coverage with a legal or exhaustive administrative claim. The coverage report, fallback Regions, candidate-code metadata and explicit excluded-feature records preserve these limitations instead of hiding them.

## National fiscal simulation (0.11)

The monthly economy now feeds national tax liabilities, collected revenue, annual dollar budgets, household transfers, bounded financing, debt interest and progressive public-service capacity. Household disposable income drives the next month's consumption. Country inspection includes a fiscal debug panel and an explicit dated JSON reform API. Save schema 9 migrates schema 8 without replacing saved socioeconomic values.

Legal coverage is intentionally incomplete: five partial US/Canadian federal rule extracts; other laws are unavailable, never world-average substitutes. Fiscal initialization and service parameters are modelled, not observed national accounts. Read [the fiscal contract](docs/fiscal-0.11.md), [source audit](docs/fiscal-data-0.11.md) and [validation report](docs/milestone-0.11-validation.md) before interpreting outputs. `npm run fiscal:audit` verifies legal and actual simulation coverage; `npm run benchmark:world` includes ten fiscal years and the cached daily UI path.
