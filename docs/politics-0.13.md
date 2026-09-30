# National institutions and political opinion 0.13

## Scope and sources

Schema 11 retains `politics-0.13-v1`. Static definitions use pinned subversion `political-registry-0.13-v2` and are not serialized in every game. `scripts/update-politics-source.mjs` retrieves IPU Parline historical chamber, election and political-party records applicable on 2026-01-01. The committed source snapshot records retrieval date, publisher, URL, licence and limitations. `scripts/generate-politics-data.mjs` deterministically produces the immutable registry and supports an offline `--check` mode.

The source covers 193 registry Countries and 281 chambers. Complete seat allocations are accepted only when the election renewed the chamber's complete statutory seat count and the allocation reconciles without an excess. This produces 182 complete chamber allocations representing 31,736 seats. Other chamber facts remain present with an unavailable seat-allocation status. Executive-system classification remains unavailable because the admitted source does not establish it. Dependencies and special-status entities without a separate national legislature are `not_applicable`; other evidence gaps are `unavailable`.

## Fictional identities over a sourced basis

Real source party identifiers and names are retained only in the static audit mapping. Every source force in an accepted seat allocation maps one-to-one to a Country-specific fictional gameplay party. Visible names and deterministic ideology/issue profiles are modelled and never presented as facts about the real organization. Party counts are not forced: the registry contains 948 fictional parties and Country counts range from zero to 43 across 21 distinct values. Countries without an accepted partisan basis get no invented three-party system. Organized interests remain unavailable because this pipeline does not source them.

The governing bloc is recorded only when IPU's government-party text matches a sourced party name after deterministic normalization. Otherwise coalition coverage remains unavailable. Election and next-election dates are retained when supplied. Every sourced chamber allocation satisfies `fictional party seats + independent/other = totalSeats`.

## Dynamic opinion and ownership

The dynamic save contains Country aggregates and all nine existing socioeconomic cohorts per populated Region. Each cohort stores compact numeric vectors for six issue preferences, six salience values, support in registry-party order plus undecided, engagement, sentiment, baseline income and recent issue indexes. Population remains authoritative in the socioeconomic branch and is not duplicated. Static party, chamber, ideology and provenance definitions remain in the immutable registry.

The shared scheduler runs `politics.opinion-weekly` at priority 400. Public-services experience always means health plus education; infrastructure is a separate issue at initialization and runtime. Material deterioration and recovery change preferences, salience, sentiment and support progressively. Crisis phase is not an input.

Every weekly update reads canonical `state.regionOwnership`. A sovereign transfer moves the Region between Country aggregates, preserves local issue preferences and salience, and deterministically remaps support into the new Country's party order. A destination with no partisan basis receives 100% undecided support. `occupationByRegion` is deliberately ignored.

## Saves, snapshots and migration

Ordinary days retain the exact politics branch. Weekly evaluation replaces dynamic political objects; the static registry remains the same frozen module object. The UI snapshot cache therefore copies no static political evidence. Schema-10 migration initializes politics on the saved date without reconstructed history. Early schema-11 saves that embedded the pre-correction generic registries are detected by the missing registry subversion and deterministically reinitialized against v2, preventing stale party references while retaining every non-political branch.

`inspectPolitics()` expands compact vectors into named debug fields and returns a defensive clone. The milestone still has no election simulation, candidacies, legislation, player political actions, ministers, protests, coups, media or political AI.

Run `npm run politics:audit` to verify generated data, coverage and behavioral tests; `npm run politics:benchmark` measures the three-year world path, weekly changed snapshot, coincident monthly/weekly snapshot and save/reload; `npm run benchmark:world` validates the shared engine baseline.
