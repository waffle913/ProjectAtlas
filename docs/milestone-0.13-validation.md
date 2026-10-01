# Milestone 0.13 final corrective validation

Data-semantics validation from base `91e1d1baf4ceac65fba55ebe455674a0a938d777`.

## Delivered contract

- Global save schema 11 and dynamic model `politics-0.13-v1` remain unchanged.
- Static `political-registry-0.13-v4` is reproducibly generated from dated IPU, V-Party and partial organized-interest snapshots.
- No party profile is derived from a hash, source identifier or party name. Explicit reviewed Party Facts ID joins admit 35 V-Party profiles; missing ideology uses a uniform neutral low-confidence fallback.
- V-Party inputs are explicitly historical priors from 2017–2019. Only economic left-right, immigration, a limited three-variable social composite and pluralism are mapped; unsupported dimensions remain neutral with per-dimension limitations.
- IPU political-system/sub-category values feed a documented deterministic executive classification.
- Organized Interests V1 contains 20 fictional organizations grounded in dated sources across ten Countries. Their weekly positions respond with inertia to represented cohorts and simulated material conditions; membership remains unavailable and positions have no direct effect on socioeconomic, fiscal or crisis state.
- Governing-bloc matching is partial derived evidence retaining source text, method, result and ambiguity.
- Source absence means unavailable. No political coverage field is inferred `not_applicable` from entity type.
- Sovereignty remaps opinion at weekly priority 400; occupation and crisis phase remain neutral. There is no 0.14 feature.

## Coverage

| Field | Sourced | Partial | Modelled fallback | Unavailable | Not applicable |
| --- | ---: | ---: | ---: | ---: | ---: |
| Institutions | 0 | 193 | 0 | 59 | 0 |
| Executive system | 181 | 12 | 0 | 59 | 0 |
| Legislature | 193 | 0 | 0 | 59 | 0 |
| Electoral system | 179 | 14 | 0 | 59 | 0 |
| Party basis | 118 | 0 | 0 | 134 | 0 |
| Party ideology | 0 | 8 | 110 | 134 | 0 |
| Seats | 153 | 0 | 0 | 99 | 0 |
| Governing bloc | 0 | 56 | 0 | 196 | 0 |
| Organized interests | 0 | 10 | 0 | 242 | 0 |
| Opinion anchor | 0 | 0 | 252 | 0 | 0 |

Executive kinds: presidential 46, parliamentary 47, semi-presidential 41, collective 0, parliamentary monarchy 30, other 29, unavailable 59. The registry contains 281 chambers; 182 allocations reconcile to 31,736 seats. It contains 948 parties and 20 organizations. Party-level ideological coverage is 20 `sourced`, 15 `partial` and 913 neutral `modelled_fallback`. All 20 registered organizations receive dynamic state in a full-world game.

## Validation results

`npm run verify` passed data audits, production TypeScript/Vite build and all **25 test files / 193 tests** in **115.56 s**. The production build transformed 112 modules; the main bundle was 3,678.00 kB (308.43 kB gzip).

`npm run politics:audit` passed the three source hashes, reproducible generation, source-ID/name independence checks, semantic mapping and temporal/licence assertions, coverage assertions and **3 test files / 24 tests** in **111.61 s**. Its embedded world run completed in 86,121.43 ms, at 13 ticks/s.

`npm run politics:benchmark` passed **3 tests** in **124.30 s**. The three-year run retained 156 weekly executions, 40,572 cohorts and 20 dynamic organizations:

| Measure | Result |
| --- | ---: |
| Runtime / 1,095 days | 98,482.00 ms |
| Ticks per second | 11 |
| Weekly changed snapshot | 109.65 ms |
| Coincident monthly + weekly snapshot | 404.22 ms |
| Full save reload | 601.08 ms |
| Save size | 30,175,105 bytes |

`npm run benchmark:world` passed **4 tests** in **47.62 s**:

- frozen world integrity: 3,650 ticks in 54.01 ms, 67,579 ticks/s, checksum 25,750,886;
- socioeconomic runtime: 3,650 ticks in 6,561.95 ms, 556 ticks/s, snapshot 27.08 ms, save 15,820,371 bytes;
- cached daily UI path: 353 reused days and 12 changed days, 0.0147 ms reused-day mean, 122.85 ms monthly-day mean, 1,479.34 ms total;
- fiscal runtime: 3,650 ticks in 24,219.33 ms, 151 ticks/s, save 23,803,838 bytes, zero Countries with arrears.

## Migration and distribution

Schema 10→11 still initializes politics at the saved logical date without invented history. Early schema-11 saves lacking a registry subversion are normalized. Registry-v2/v3 saves preserve preferences, salience, engagement, material sentiment, baseline income and recent material drivers, but discard old hash-derived party support and deterministically recompute it against v4 profiles. Dynamic organization positions are initialized on the saved date; non-political branches are preserved.

[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) separates ISC-licensed ProjectAtlas code, CC BY-NC-SA 4.0 IPU source/derived data, GPL-3.0 `vdemdata` tooling, V-Party v2 data licensing marked `requires_confirmation`, and ITUC/IOE material whose open-data licence was not established. Commercial distribution clearance remains required before release.
