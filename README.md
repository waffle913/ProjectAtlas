# ProjectAtlas — Milestone 0.2

An original political-map foundation for a future geopolitical simulation, with the starting simulation date fixed at **2026-01-01**.

## Run

`npm install` then `npm run dev`. Run `npm run verify` for reproducible-data validation, type-checking, production compilation and automated tests. `npm run data:generate` regenerates country data offline from the checked-in source snapshots. `npm run data:sources:update` is the separate, deliberate network step that refreshes those snapshots; review and validate its diff before committing.

## Model

The map is explicitly not the game state. `Country` holds stable internal identity and sourced facts. `Territory` has an assigned, permanent internal ID. `SimulationState.territoryOwnership` overrides the initial owner at runtime. Country → Territory → geometry remains the model; replacing geometry does not replace the entity.

### Persistent entity registry

`src/data/entity-registry.json` is the authoritative, versioned geopolitical registry and the sole runtime source for country names, classifications, sovereign relationships, ISO/M49 codes, capitals and UN regions. It contains 252 entities: all 193 UN members, the two UN observer states, dependencies, partially recognized entities and special-status territories. IDs are opaque literals: never regenerate, rename, recycle, or derive them from labels, codes, ordering or coordinates. Their durable assignments live in `src/data/entity-id-assignments.json`; missing official codes remain absent.

Registry coverage is intentionally broader than map coverage. Every entity owns a registered territory, but geographic mapping is optional: 177 territories map to the bundled Natural Earth layer and 75 explicitly record that bundled geometry is unavailable, with provenance. Conversely, every displayed source feature must map exactly once to one registered territory. This lets saves retain entity references when geometry is absent or later replaced.

`src/data/country-facts.json` stores separately dated observations. Every required field has an explicit `available` or `unavailable` status. Available values include source, URL/dataset identifier, retrieval date, reference year/date and estimate flag; unavailable values include a reason, checked date and the source consulted. World Bank values retain their published year—ProjectAtlas does not relabel them as 2026 statistics. Currency and language records use the pinned open mledoze World Countries snapshot. Government forms come from a dated, pinned Wikidata snapshot rather than an undated label.

`src/data/political-offices.json` keeps office definitions separate from officeholder timelines. Every sovereign or partially recognized registry entity has head-of-state and head-of-government office definitions, each with either a dated holder or an explicit sourced unavailable status for 2026-01-01. This model allows later officeholder succession without changing country identity.

`src/data/natural-earth-mapping.json` maps this particular geographic dataset's NE_ID values to existing registry entities. Natural Earth supplies geometry and debug metadata only. `buildWorld()` obtains political identity exclusively from ProjectAtlas data. Unmapped, duplicate, missing or ambiguous features and broken references fail explicitly, reaching the application's loading-error screen.

The registry freezes the IDs produced by release `83ce014` for the bundled dataset, preserving existing country and ownership references without a migration. Their hash-like spelling is historical only: no runtime hashing remains. Saves should persist these internal IDs, never source feature IDs.

To adopt a new dataset or resolution, add a reviewed DatasetMapping that maps its external feature IDs to the same registry IDs and pass it to `buildWorld`. Edit external aliases when standards change; do not edit internal IDs. The current importer expects one Polygon/MultiPolygon feature per territory: merge multipart source features explicitly before import. A real new entity requires a newly assigned, unused opaque ID committed to the registry. Splits/mergers need an explicit future save migration; geometry updates alone do not. Retain old IDs for saved references rather than silently deleting them.

Tests cover the 193-member invariant, registry/map decoupling, exact feature mappings, legacy ID compatibility, changed labels and geometry, feature order, replacement dataset mappings and saved territorial ownership. They also reject duplicate ISO/M49 codes, missing IDs, broken sovereignty, unknown references, malformed dates, unsourced or implicit missing facts, unavailable geometry without provenance and incomplete map coverage. The reproducibility check regenerates all derived country-data files and fails if the committed outputs differ.

`SimulationClock` is UI-independent. It starts from 2026-01-01, measures real elapsed time, progresses one game day per second at ×1 (with ×2 / ×5 multipliers), and is separately tested along with pure territory transfers.

Natural Earth admin-0 country geometry, plus its 110m physical land, lakes, and river centreline datasets, are stored in `public/data/`. They are public domain. The map uses no runtime tile service or remotely loaded map asset, and remains usable while disconnected. Attribution is retained in the application and this document; see [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).

The physical layers are a local visual basemap only. Political ownership and international borders are rendered separately above them from territory state; no political border is baked into the background.

## Geopolitical assumptions

ProjectAtlas explicitly classifies sovereign states, dependencies, disputed entities, partially recognized entities and special-status territories. Dependencies link to their sovereign entity. Natural Earth classifications are retained only under `sourceMetadata` for debugging; they cannot change the ProjectAtlas classification. Map boundaries are a visual baseline, not a legal statement.

## Country-data sources and limits

The complete source inputs are committed under `src/data/source-snapshots/`, including snapshot IDs, retrieval dates and source URLs. ISO codes are referenced to the ISO 3166 Maintenance Agency; names, M49 codes and UN regions use the UN Statistics Division M49 list. Population, area and GDP observations use World Bank World Development Indicators. Capitals, currencies and languages use a mledoze World Countries revision pinned to a Git commit predating the simulation start. Officeholder timelines and government forms use pinned Wikidata query results, supplemented by reviewed explicit overrides for documented gaps. The UI cites every displayed fact and exposes its actual reference date and estimate status.

Some disputed or partially recognized entities have no assigned ISO or M49 code; those fields remain absent. Statistical and government-form coverage varies because the consulted sources do not publish every field for every territory; these gaps remain explicit rather than being fabricated.
