# ProjectAtlas — Milestone 0.2

An original political-map foundation for a future geopolitical simulation, with the starting simulation date fixed at **2026-01-01**.

## Run

`npm install` then `npm run dev`. Run `npm run verify` for type-checking, production compilation and automated tests. `npm run data:generate` refreshes the checked-in country profiles and dated observations from their documented sources; review its diff before committing.

## Model

The map is explicitly not the game state. `Country` holds stable internal identity and sourced facts. `Territory` has an assigned, permanent internal ID. `SimulationState.territoryOwnership` overrides the initial owner at runtime. Country → Territory → geometry remains the model; replacing geometry does not replace the entity.

### Persistent entity registry

`src/data/entity-registry.json` is the authoritative, versioned geopolitical registry and the sole runtime source for country names, classifications, sovereign relationships, ISO/M49 codes, capitals and UN regions. IDs are opaque literals: never regenerate, rename, recycle, or derive them from labels, codes, ordering or coordinates. Missing official codes remain absent. France and Norway have explicit ISO/M49 aliases in this registry.

`src/data/country-facts.json` stores separately dated observations. Each value includes its source, URL/dataset identifier, retrieval date, reference year/date and estimate flag. World Bank values retain their published year; ProjectAtlas does not relabel them as 2026 statistics. Currency and language records use the open mledoze World Countries dataset and display their retrieval date.

`src/data/political-offices.json` keeps office definitions separate from officeholder timelines. Its snapshot covers the head-of-state and head-of-government offices for every sovereign or partially recognized entity displayed at 2026-01-01, with effective dates when available and a cited source. This model allows later officeholder succession without changing country identity.

`src/data/natural-earth-mapping.json` maps this particular geographic dataset's NE_ID values to existing registry entities. Natural Earth supplies geometry and debug metadata only. `buildWorld()` obtains political identity exclusively from ProjectAtlas data. Unmapped, duplicate, missing or ambiguous features and broken references fail explicitly, reaching the application's loading-error screen.

The registry freezes the IDs produced by release `83ce014` for the bundled dataset, preserving existing country and ownership references without a migration. Their hash-like spelling is historical only: no runtime hashing remains. Saves should persist these internal IDs, never source feature IDs.

To adopt a new dataset or resolution, add a reviewed DatasetMapping that maps its external feature IDs to the same registry IDs and pass it to `buildWorld`. Edit external aliases when standards change; do not edit internal IDs. The current importer expects one Polygon/MultiPolygon feature per territory: merge multipart source features explicitly before import. A real new entity requires a newly assigned, unused opaque ID committed to the registry. Splits/mergers need an explicit future save migration; geometry updates alone do not. Retain old IDs for saved references rather than silently deleting them.

Tests cover registry coverage, legacy ID compatibility, changed labels and geometry, feature order, replacement dataset mappings and saved territorial ownership. They also reject duplicate ISO/M49 codes, missing IDs, broken sovereignty, unknown references, malformed dates, unsourced facts and incomplete map coverage.

`SimulationClock` is UI-independent. It starts from 2026-01-01, measures real elapsed time, progresses one game day per second at ×1 (with ×2 / ×5 multipliers), and is separately tested along with pure territory transfers.

Natural Earth admin-0 country geometry, plus its 110m physical land, lakes, and river centreline datasets, are stored in `public/data/`. They are public domain. The map uses no runtime tile service or remotely loaded map asset, and remains usable while disconnected. Attribution is retained in the application and this document; see [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).

The physical layers are a local visual basemap only. Political ownership and international borders are rendered separately above them from territory state; no political border is baked into the background.

## Geopolitical assumptions

ProjectAtlas explicitly classifies sovereign states, dependencies, disputed entities, partially recognized entities and special-status territories. Dependencies link to their sovereign entity. Natural Earth classifications are retained only under `sourceMetadata` for debugging; they cannot change the ProjectAtlas classification. Map boundaries are a visual baseline, not a legal statement.

## Country-data sources and limits

ISO codes are referenced to the ISO 3166 Maintenance Agency; names, M49 codes and UN regions use the UN Statistics Division M49 list. Population, area and GDP observations use World Bank World Development Indicators. Capitals, currencies and languages use the mledoze World Countries snapshot committed on 2025-05-23, pinned by Git commit. Officeholder timelines use dated Wikidata statements, supplemented by official government sources for documented gaps. The UI cites every displayed fact and exposes its actual reference date and estimate status.

Some disputed or partially recognized entities have no assigned ISO or M49 code; those fields remain absent. Government type is supported by the facts schema and panel but remains blank until a consistently sourced historical dataset is imported. Statistical coverage varies because the source organizations do not publish every indicator for every territory.
