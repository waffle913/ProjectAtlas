# ProjectAtlas — Milestone 0.1

An original political-map foundation for a future geopolitical simulation, with the starting simulation date fixed at **2026-01-01**.

## Run

`npm install` then `npm run dev`. Run `npm run verify` for type-checking, production compilation and automated simulation tests.

## Model

The map is explicitly not the game state. `Country` holds stable internal identity and sourced facts; ISO and Natural Earth codes are external identifiers only. `Territory` has a deterministic internal ID derived from immutable source identity and geometry, never its GeoJSON array position. `SimulationState.territoryOwnership` overrides the initial owner at runtime. This allows future treaties, annexations, and subnational regions without rewriting source geometry.

`SimulationClock` is UI-independent. It starts from 2026-01-01, measures real elapsed time, progresses one game day per second at ×1 (with ×2 / ×5 multipliers), and is separately tested along with pure territory transfers.

Natural Earth admin-0 country geometry, plus its 110m physical land, lakes, and river centreline datasets, are stored in `public/data/`. They are public domain. The map uses no runtime tile service or remotely loaded map asset, and remains usable while disconnected. Attribution is retained in the application and this document; see [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).

The physical layers are a local visual basemap only. Political ownership and international borders are rendered separately above them from territory state; no political border is baked into the background.

## Geopolitical assumptions

Natural Earth feature classifications are preserved as source metadata. A dedicated normalization layer applies explicit 2026-start overrides for known dependencies and disputed entities before a limited source-label fallback; no polygon is silently promoted into an equivalent sovereign country. Map boundaries are a visual baseline, not a legal statement. The source snapshot's date is distinct from the simulation start date.

## Data integrity roadmap

Country identity fields are derived from the geographic dataset. The panel deliberately leaves demographic, economic, leader, government, and other time-sensitive values blank until imported from a dated authoritative source (e.g. UN Data, World Bank, national statistical offices). Each imported value must use `SourceValue`, which includes value, source URL and source date—therefore a 2024/2025 observation cannot be mislabeled as a 2026 fact.
