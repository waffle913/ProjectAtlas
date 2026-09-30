# Milestone 0.13 validation

Corrective validation from base `1af0b3cddb03d24c6b2ad3a87518ab6ce5006c22`.

## Delivered contract

- Global save schema 11 and dynamic model `politics-0.13-v1` remain unchanged.
- Pinned static `political-registry-0.13-v2`, generated reproducibly from an IPU Parline historical snapshot applicable on 2026-01-01.
- 193 sourced parliamentary landscapes, country-specific fictional party identities and honest unavailable/not-applicable gaps.
- Canonical sovereign ownership reconciliation each weekly update; military occupation alone has no political ownership effect.
- Compact dynamic cohort tuples with all 40,572 world cohorts retained, exact 10,000-bps support and no static definitions/provenance in saves.
- Identical health-plus-education public-service definition at initialization and runtime; infrastructure remains separate.
- No 0.14 player decisions, election simulation, legislation, political actions or effects.

## Coverage

| Field | Sourced | Partial | Unavailable | Not applicable |
| --- | ---: | ---: | ---: | ---: |
| Institutions | 0 | 193 | 7 | 52 |
| Legislature | 193 | 0 | 7 | 52 |
| Electoral system | 179 | 14 | 7 | 52 |
| Party basis | 118 | 0 | 82 | 52 |
| Seats | 153 | 0 | 47 | 52 |
| Governing bloc | 56 | 0 | 144 | 52 |
| Organized interests | 0 | 0 | 200 | 52 |

The registry contains 281 chambers. Of these, 182 have complete reconciled allocations totaling 31,736 seats. There are 948 fictional parties backed one-to-one by sourced seat forces. Country party counts range from zero to 43 and use 21 distinct values: 0–15 except 16, then 17, 18, 21, 23 and 43. Opinion anchors remain `modelled_fallback` for all 252 Countries because no polling dataset is admitted.

## Validation results

`npm run verify` passed the data audits, production build and all 24 test files / 179 tests. The final test stage completed in 125.49 s. The build transformed 112 modules; the main bundle was 2,897.13 kB (361.24 kB gzip), including the pinned static registry.

`npm run politics:audit` passed its generated-data hash/reproduction check and ten focused/full-world tests. It verified seat conservation, variable party counts, sovereign-transfer remapping, occupation neutrality, unavailable/not-applicable semantics, compact save round-trip, early-schema-11 normalization and public-service/infrastructure separation.

The corrected three-year benchmark retained 156 weekly runs and all 40,572 cohorts:

| Measure | Before correction | Corrected |
| --- | ---: | ---: |
| Runtime / 1,095 days | 83,583.90 ms | 91,230.98 ms |
| Ticks per second | 13 | 12 |
| Full/cold snapshot | 940.32 ms | replaced by changed-path measures |
| Weekly changed snapshot | not measured | 120.73 ms |
| Coincident monthly + weekly snapshot | not measured | 400.00 ms |
| Full save reload | 1,377.10 ms | 584.29 ms |
| Save size | 77,552,988 bytes | 30,157,846 bytes |

The broader `npm run benchmark:world` suite passed:

- frozen world integrity: 3,650 ticks in 68.31 ms, 53,432 ticks/s, checksum 25,750,886;
- socioeconomic runtime: 3,650 ticks in 6,539.69 ms, 558 ticks/s, snapshot 33.32 ms, save 15,820,352 bytes;
- cached daily UI path: 353 reused days and 12 changed days, 0.0169 ms reused-day mean, 142.46 ms monthly-day mean, 1,715.43 ms total;
- fiscal/shared runtime: 3,650 ticks in 25,426.80 ms, 144 ticks/s, save 23,803,819 bytes, zero Countries with arrears.

## Migration and limits

Schema 10→11 still initializes politics at the saved logical date with no invented history. An early schema-11 save without registry subversion is deterministically normalized against v2, so obsolete generic party references cannot survive; its non-political branches are preserved. Current v2 schema-11 saves round-trip exactly.

IPU Parline establishes parliament/election facts, not a complete executive-system classification, polling, or organized-interest membership dataset. These fields remain unavailable rather than inferred. Full seat allocations are deliberately omitted for partial-renewal or non-reconciling election records. Fictional ideology, issue positions and initial opinion are modelled gameplay inputs, not claims about real parties or voters. The richer variable party landscape makes the three-year opinion calculation modestly slower, while save, reload and changed-snapshot costs fall sharply and remain below a one-second UI pause.
