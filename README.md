# ProjectAtlas — Milestone 0.1

An original political-map foundation for a future geopolitical simulation, with the starting simulation date fixed at **2026-01-01**.

## Run

`npm install` then `npm run dev`.

## Model

The map is explicitly not the game state. `Country` holds stable identity and sourced facts. `Territory` holds a named geometry and an initial owner. `SimulationState.territoryOwnership` overrides that owner at runtime. This allows future treaties, annexations, and subnational regions without rewriting source geometry.

Natural Earth admin-0 country geometry is stored in `public/data/natural-earth-admin-0.geojson`. It is public domain. Attribution is retained in the application and this document; see [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).

OpenStreetMap is used only as an optional background tile layer and is attributed in the map control; production use must comply with [ODbL attribution requirements](https://www.openstreetmap.org/copyright).

## Geopolitical assumptions

Natural Earth feature classifications are preserved as `sovereign`, `dependency`, `disputed`, or `other`; no polygon is silently promoted into an equivalent sovereign country. Map boundaries are a visual baseline, not a legal statement. The source snapshot's date is distinct from the simulation start date.

## Data integrity roadmap

Country identity fields are derived from the geographic dataset. The panel deliberately leaves demographic, economic, leader, government, and other time-sensitive values blank until imported from a dated authoritative source (e.g. UN Data, World Bank, national statistical offices). Each imported value must use `SourceValue`, which includes value, source URL and source date—therefore a 2024/2025 observation cannot be mislabeled as a 2026 fact.
