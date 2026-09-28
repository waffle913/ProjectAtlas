# ProjectAtlas 0.9 data audit

Scenario start: **2026-01-01**. This date is not assigned to older observations. Source reference dates remain unchanged in the machine-readable report.

## What ProjectAtlas actually knows

| Category | Coverage | Meaning |
|---|---:|---|
| Country identity | 252/252 | Permanent registry identities with explicit entity classification |
| Region identity | 4574/4574 | Permanent Region assignments independent from geometry and sovereignty |
| Region geometry | 4535 mapped, 5 fallback, 34 unavailable | Natural Earth Admin-1 mappings or explicit documented absence |
| Region population | 1739/4574 (38.02%) | 28 direct and 1711 spatially allocated records |
| Region nominal output | 1681/4574 (36.75%) | Whole USD/year baseline; regional values are modelled allocations, not observations |
| 0.10 joint population/output input | 1681/4574 Regions (36.75%) | Both current baseline inputs are available |

Country types: `dependency` 46, `disputed` 1, `partially_recognized` 5, `sovereign_state` 194, `special_status` 6. Every Country owns one registered Territory and at least one Region.

Population is complete and exactly normalized for **102 Countries**. It is explicitly unavailable for **150 Countries**. Economic output is complete and exactly normalized for **83 Countries** and unavailable for **169 Countries**. Zero is retained only when it is a valid sourced or allocated value; unavailable records carry no numeric value.

## National facts

| Field | Available | Unavailable | Coverage |
|---|---:|---:|---:|
| currencies | 249 | 3 | 98.81% |
| gdpPerCapitaUsd | 209 | 43 | 82.94% |
| governmentType | 167 | 85 | 66.27% |
| landAreaKm2 | 215 | 37 | 85.32% |
| languages | 249 | 3 | 98.81% |
| nominalGdpUsd | 209 | 43 | 82.94% |
| population | 215 | 37 | 85.32% |
| totalAreaKm2 | 215 | 37 | 85.32% |

Political offices apply to 199 sovereign or partially recognized Countries. 392/398 holder records are available; 6 are explicitly unavailable. The remaining 53 entities are marked `not_applicable` under the current office model.

## Provenance and limitations

All available real-world records retain their dataset ID, retrieval date and actual reference date. Population projections remain marked estimated/projected. Regional economic output remains marked as a modelled allocation from a dated national nominal-GDP observation. Geometry is cartographic source data and does not determine sovereignty.

Non-blocking limitations:
- **admin1-review-needed (69)** — Countries whose Natural Earth Admin-1 coverage remains potentially incomplete or ambiguous.
- **population-unavailable (150)** — Countries without a complete defensible regional population allocation.
- **economic-output-unavailable (169)** — Countries without a complete regional nominal-output baseline.
- **officeholder-unavailable (6)** — Applicable political offices with an explicitly unavailable holder.

The detailed status of every Country and Region is in [`src/data/data-audit-report.json`](../src/data/data-audit-report.json). The permanent identity fingerprints are `d63eb55201d4bb990808b7974e22a7d006c66df4f203bd563060a89293010729` for Countries and `89cf07b43b40f855da72e3f47bf2819e3488c9ea5ba4fdd328305a983ff2eb9a` for Regions.

## Deferred to 0.10+

No income or political-orientation cohort percentages were created. The repository currently contains no sourced low/middle/high income distribution and no Region-level left/centre/right population distribution. Government type and officeholder identity are not substitutes for public political orientation. Future fallbacks must be explicitly modelled, dated, documented and conservation-safe.

## Corrections in 0.9

No underlying Country, Region, population, economic, political or geometry data value required correction. Milestone 0.9 adds this deterministic cross-dataset audit and makes existing gaps visible without changing permanent IDs or accepted 0.2–0.8 data decisions.
