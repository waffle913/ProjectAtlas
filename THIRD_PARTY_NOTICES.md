# Third-party data notices

ProjectAtlas source code is distributed under the ISC licence stated in `package.json`. That code licence does not replace or broaden the licences of bundled source data or data derived from it.

## Inter-Parliamentary Union (IPU) Parline

`src/data/source-snapshots/ipu-parline-politics-2026-01-01.json` contains a dated extract from the IPU Parline API. The snapshot identifies the Inter-Parliamentary Union as publisher, records its retrieval and reference dates, and declares **CC BY-NC-SA 4.0** under the [IPU terms of use](https://www.ipu.org/terms-use). `src/data/political-registry.json` and `src/data/politics-coverage-report.json` contain derived mappings from that snapshot. Attribution and the non-commercial/share-alike conditions therefore remain relevant to those derived portions.

## Organized-interest source lists

`src/data/source-snapshots/organized-interests-2026-01-01.json` contains a small factual cross-section derived from the International Trade Union Confederation's *List of affiliated organisations, December 2024* and the International Organisation of Employers' *Annual Report 2023-2024*. Neither publication supplied an open-data licence in the material reviewed. Their names are retained only as an audit basis; gameplay identities and interests are fictional, and membership totals are not copied or inferred.

## V-Party and Party Facts identifiers

`src/data/source-snapshots/vparty-ideology-2022.json` contains a small derived extract of V-Party Country-Party-Date v2 observations distributed in the V-Dem Institute `vdemdata` R package under GPL-3.0. The extractor pins package commit `f4dd26922e658442524dfd954bf14f7ebe622d5d`, retains the source publication and codebook URLs, and includes only explicitly reviewed Party Facts ID joins. ProjectAtlas records the original ordinal labels and coder counts, then deterministically maps them into fictional gameplay profiles. Party names are retained only for provenance and never drive classification.

## Distribution

Commercial distribution clearance must be resolved before release. The ISC licence for ProjectAtlas code does not authorize commercial use of IPU-derived data or override third-party publication terms. A distributor must review, attribute, replace, separately license, or remove affected datasets and derived outputs as required.
