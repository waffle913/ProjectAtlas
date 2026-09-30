# Milestone 0.13 final corrective validation

Corrective validation from base `2b0ff323e938b5d2029cd8cedfba9b8e07c5b50e`.

## Delivered contract

- Global save schema 11 and dynamic model `politics-0.13-v1` remain unchanged.
- Static `political-registry-0.13-v4` is reproducibly generated from dated IPU, V-Party and partial organized-interest snapshots.
- No party profile is derived from a hash, source identifier or party name. Explicit reviewed Party Facts ID joins admit 35 V-Party profiles; missing ideology uses a uniform neutral low-confidence fallback.
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

`npm run verify` passed data audits, production TypeScript/Vite build and all **24 test files / 187 tests** in **113.91 s**. The production build transformed 112 modules; the main bundle was 3,538.04 kB (298.95 kB gzip).

`npm run politics:audit` passed the three source hashes, reproducible generation, source-ID/name independence checks, distinct-evidence profile check, coverage assertions and **2 test files / 18 tests** in **109.19 s**. Its embedded world run completed in 85,540.02 ms, at 13 ticks/s.

`npm run politics:benchmark` passed **3 tests** in **109.48 s**. The three-year run retained 156 weekly executions, 40,572 cohorts and 20 dynamic organizations:

| Measure | Result |
| --- | ---: |
| Runtime / 1,095 days | 85,909.22 ms |
| Ticks per second | 13 |
| Weekly changed snapshot | 106.02 ms |
| Coincident monthly + weekly snapshot | 357.91 ms |
| Full save reload | 529.79 ms |
| Save size | 30,174,943 bytes |

`npm run benchmark:world` passed **4 tests** in **44.58 s**:

- frozen world integrity: 3,650 ticks in 61.59 ms, 59,265 ticks/s, checksum 25,750,886;
- socioeconomic runtime: 3,650 ticks in 5,560.26 ms, 656 ticks/s, snapshot 26.74 ms, save 15,820,371 bytes;
- cached daily UI path: 353 reused days and 12 changed days, 0.0145 ms reused-day mean, 117.83 ms monthly-day mean, 1,419.07 ms total;
- fiscal runtime: 3,650 ticks in 22,417.4 ms, 163 ticks/s, save 23,803,838 bytes, zero Countries with arrears.

## Migration and distribution

Schema 10→11 still initializes politics at the saved logical date without invented history. Early schema-11 saves lacking a registry subversion are normalized. Registry-v2/v3 saves preserve preferences, salience, engagement, material sentiment, baseline income and recent material drivers, but discard old hash-derived party support and deterministically recompute it against v4 profiles. Dynamic organization positions are initialized on the saved date; non-political branches are preserved.

[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) separates ISC-licensed ProjectAtlas code, CC BY-NC-SA 4.0 IPU source/derived data, GPL-3.0 V-Party distribution, and ITUC/IOE material whose open-data licence was not established. Commercial distribution clearance remains required before release.
