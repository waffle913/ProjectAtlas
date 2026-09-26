# ProjectAtlas — Milestone 0.1

An original political-map foundation for a future geopolitical simulation, with the starting simulation date fixed at **2026-01-01**.

## Run

`npm install` then `npm run dev`. Run `npm run verify` for type-checking, production compilation and automated simulation tests.

## Model

The map is explicitly not the game state. `Country` holds stable internal identity and sourced facts. `Territory` has an assigned, permanent internal ID. `SimulationState.territoryOwnership` overrides the initial owner at runtime. Country → Territory → geometry remains the model; replacing geometry does not replace the entity.

### Persistent entity registry

`src/data/entity-registry.json` is the authoritative, versioned registry of country and territory identities and initial ownership. IDs are opaque literals: never regenerate, rename, recycle, or derive them from labels, codes, ordering or coordinates. Registry labels are descriptive and editable. ISO/M49 codes are optional external mappings on country records; Natural Earth administrative codes are not substitutes for ISO codes.

`src/data/natural-earth-mapping.json` maps this particular geographic dataset's NE_ID values to existing registry entities. The importer looks up this mapping and does not generate identities. Unmapped, duplicate, missing or ambiguous features and broken references fail explicitly, reaching the application's loading-error screen.

The registry freezes the IDs produced by release `83ce014` for the bundled dataset, preserving existing country and ownership references without a migration. Their hash-like spelling is historical only: no runtime hashing remains. Saves should persist these internal IDs, never source feature IDs.

To adopt a new dataset or resolution, add a reviewed DatasetMapping that maps its external feature IDs to the same registry IDs and pass it to `buildWorld`. Edit external aliases when standards change; do not edit internal IDs. The current importer expects one Polygon/MultiPolygon feature per territory: merge multipart source features explicitly before import. A real new entity requires a newly assigned, unused opaque ID committed to the registry. Splits/mergers need an explicit future save migration; geometry updates alone do not. Retain old IDs for saved references rather than silently deleting them.

Tests cover registry coverage, legacy ID compatibility, changed labels and geometry, feature order, replacement dataset mappings and saved territorial ownership, as well as invalid mappings.

`SimulationClock` is UI-independent. It starts from 2026-01-01, measures real elapsed time, progresses one game day per second at ×1 (with ×2 / ×5 multipliers), and is separately tested along with pure territory transfers.

Natural Earth admin-0 country geometry, plus its 110m physical land, lakes, and river centreline datasets, are stored in `public/data/`. They are public domain. The map uses no runtime tile service or remotely loaded map asset, and remains usable while disconnected. Attribution is retained in the application and this document; see [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).

The physical layers are a local visual basemap only. Political ownership and international borders are rendered separately above them from territory state; no political border is baked into the background.

## Geopolitical assumptions

Natural Earth feature classifications are preserved as source metadata. A dedicated normalization layer applies explicit 2026-start overrides for known dependencies and disputed entities before a limited source-label fallback; no polygon is silently promoted into an equivalent sovereign country. Map boundaries are a visual baseline, not a legal statement. The source snapshot's date is distinct from the simulation start date.

## Data integrity roadmap

Country identity fields are derived from the geographic dataset. The panel deliberately leaves demographic, economic, leader, government, and other time-sensitive values blank until imported from a dated authoritative source (e.g. UN Data, World Bank, national statistical offices). Each imported value must use `SourceValue`, which includes value, source URL and source date—therefore a 2024/2025 observation cannot be mislabeled as a 2026 fact.
