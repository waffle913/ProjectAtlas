# Milestone 0.13 final corrective validation

Corrective validation from base `051564a4a2d5b7724d286961f1688dd97a9422dc`.

## Delivered contract

- Global save schema 11 and dynamic model `politics-0.13-v1` remain unchanged.
- Static `political-registry-0.13-v3` is reproducibly generated from dated IPU and partial organized-interest snapshots.
- No party profile is derived from a hash or source identifier. Missing ideology uses a uniform neutral low-confidence fallback; family and constituency remain unavailable.
- IPU political-system/sub-category values feed a documented deterministic executive classification.
- Organized Interests V1 contains 20 fictional organizations grounded in dated sources across ten Countries, with membership unavailable and no direct effects.
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
| Party ideology | 0 | 0 | 118 | 134 | 0 |
| Seats | 153 | 0 | 0 | 99 | 0 |
| Governing bloc | 0 | 56 | 0 | 196 | 0 |
| Organized interests | 0 | 10 | 0 | 242 | 0 |
| Opinion anchor | 0 | 0 | 252 | 0 | 0 |

Executive kinds: presidential 46, parliamentary 47, semi-presidential 41, collective 0, parliamentary monarchy 30, other 29, unavailable 59. The registry contains 281 chambers; 182 allocations reconcile to 31,736 seats. It contains 948 parties and 20 organizations.

## Validation results

`npm run verify` passed data audits, production TypeScript/Vite build and all **24 test files / 185 tests** in **117.64 s**. The production build transformed 112 modules; the main bundle was 3,515.16 kB (293.56 kB gzip).

`npm run politics:audit` passed the hashes, reproducible generation, source-ID-independent profile check, coverage assertions and **2 test files / 16 tests** in **106.23 s**. Its embedded world run completed in 83,484.13 ms, at 13 ticks/s.

`npm run politics:benchmark` passed **3 tests** in **117.00 s**. The three-year run retained 156 weekly executions and 40,572 cohorts:

| Measure | Result |
| --- | ---: |
| Runtime / 1,095 days | 92,465.03 ms |
| Ticks per second | 12 |
| Weekly changed snapshot | 115.49 ms |
| Coincident monthly + weekly snapshot | 630.01 ms |
| Full save reload | 528.96 ms |
| Save size | 30,160,167 bytes |

`npm run benchmark:world` passed **4 tests** in **52.67 s**:

- frozen world integrity: 3,650 ticks in 60.51 ms, 60,322 ticks/s, checksum 25,750,886;
- socioeconomic runtime: 3,650 ticks in 5,937.51 ms, 615 ticks/s, snapshot 28.18 ms, save 15,820,352 bytes;
- cached daily UI path: 353 reused days and 12 changed days, 0.016 ms reused-day mean, 134.6 ms monthly-day mean, 1,620.88 ms total;
- fiscal runtime: 3,650 ticks in 25,037.9 ms, 146 ticks/s, save 23,803,819 bytes, zero Countries with arrears.

## Migration and distribution

Schema 10→11 still initializes politics at the saved logical date without invented history. Early schema-11 saves lacking a registry subversion are normalized. Corrected v2 saves retain their dynamic opinion while upgrading the registry reference to v3 because party identities and ordering did not change.

[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) separates ISC-licensed ProjectAtlas code, CC BY-NC-SA 4.0 IPU source/derived data, and ITUC/IOE material whose open-data licence was not established. Commercial distribution clearance remains required before release.
