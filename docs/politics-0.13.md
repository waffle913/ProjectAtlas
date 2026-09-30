# National institutions and political opinion 0.13

## Scope and sources

Schema 11 retains `politics-0.13-v1`. Static definitions use pinned subversion `political-registry-0.13-v4` and are not serialized in every game. The IPU updater retrieves historical country-system, chamber, election and political-party records applicable on 2026-01-01. Committed snapshots record reference/retrieval dates, publishers, URLs, licences and limitations. The generator deterministically produces the immutable registry and supports offline checking.

The IPU source covers 193 registry Countries and 281 chambers. Complete seat allocations are admitted only when a full renewal reconciles to the statutory chamber size, producing 182 complete allocations and 31,736 represented seats. IPU political system/sub-category values produce 181 sourced and 12 partial executive classifications; 59 remain unavailable. Source absence always means `unavailable`: entity type alone never proves `not_applicable`.

## Fictional identities over sourced bases

Every admitted parliamentary force maps one-to-one to a Country-specific fictional gameplay party. Source identifiers and names remain audit-only. No source ID or party name generates political content. A reviewed explicit join to V-Party v2 through Party Facts IDs provides dated expert-coded evidence for 35 parties: 20 `sourced` and 15 `partial`. Eight ordinal source dimensions are retained with coder counts and transformed by the documented `vparty_ordinal_linear_v1` method. The remaining 913 parties stay neutral, low-confidence `modelled_fallback`; missing coverage is never fabricated.

Organized Interests V1 adds 20 fictional organizations across ten Countries, grounded in a deliberately partial dated cross-section of ITUC affiliates and IOE members. Source identities remain audit-only and membership is unavailable. Their dynamic state stores current issue positions, last update date and bounded recent drivers. Weekly positions combine represented cohorts, current cohort preferences, simulated unemployment/income conditions, service/tax conditions and inertia. They have no direct economic, fiscal, crisis, strike, protest or other effect.

Governing blocs are `partial` derivations. Each record preserves the IPU source text, normalized matching method, matched party IDs and ambiguity flag. Ambiguous matches are never promoted to certainty. Every sourced chamber allocation satisfies `fictional party seats + independent/other = totalSeats`.

## Dynamic opinion and ownership

The dynamic save contains Country aggregates, organization positions and the existing socioeconomic cohorts per populated Region. Each cohort stores compact vectors for six issue preferences, salience, support in registry-party order plus undecided, engagement, sentiment, baseline income and recent drivers. Static definitions stay outside saves.

The shared scheduler runs `politics.opinion-weekly` at priority 400. Material deterioration and recovery change preferences, salience, sentiment and support progressively. Crisis phase is not an input. Every weekly update reads canonical `state.regionOwnership`; sovereign transfer preserves local issue state and remaps support into the destination party order, while occupation is ignored.

## Saves, tests and licensing

Ordinary days retain the exact politics branch. Weekly evaluation replaces dynamic political objects. Schema-10 migration initializes politics on the saved date without fake history. Early schema-11 saves without a registry subversion are reinitialized. Registry-v2 and v3 saves migrate to v4 by preserving preferences, salience, engagement, material sentiment, baseline income and recent material drivers, while deterministically recalculating party support against the v4 profiles and initializing organization positions on the saved date. No political history or non-political branch is reconstructed.

The milestone contains no election simulation, candidacies, legislation, player political actions, ministers, protests, coups, media or political AI. `npm run politics:audit` checks data generation, coverage and behavioral contracts; `npm run politics:benchmark` measures the world path, snapshots and save/reload. Data licensing and commercial-release constraints are recorded in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
