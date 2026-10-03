# Third-party data notices

ProjectAtlas source code is distributed under the ISC licence stated in `package.json`. That code licence does not replace or broaden the licences of bundled source data or data derived from it.

## Inter-Parliamentary Union (IPU) Parline

`src/data/source-snapshots/ipu-parline-politics-2026-01-01.json` contains a dated extract from the IPU Parline API. The snapshot identifies the Inter-Parliamentary Union as publisher, records its retrieval and reference dates, and declares **CC BY-NC-SA 4.0** under the [IPU terms of use](https://www.ipu.org/terms-use). `src/data/political-registry.json` and `src/data/politics-coverage-report.json` contain derived mappings from that snapshot. Attribution and the non-commercial/share-alike conditions therefore remain relevant to those derived portions.

## Organized-interest source lists

`src/data/source-snapshots/organized-interests-2026-01-01.json` contains a small factual cross-section derived from the International Trade Union Confederation's *List of affiliated organisations, December 2024* and the International Organisation of Employers' *Annual Report 2023-2024*. Neither publication supplied an open-data licence in the material reviewed. Their names are retained only as an audit basis; gameplay identities and interests are fictional, and membership totals are not copied or inferred.

## V-Party and Party Facts identifiers

`src/data/source-snapshots/vparty-ideology-2022.json` contains a small derived extract of V-Party Country-Party-Date v2 observations. The extractor pins `vdemdata` package commit `f4dd26922e658442524dfd954bf14f7ebe622d5d`; **GPL-3.0 applies to that package/tooling and is not treated as the dataset licence**.

The official V-Party v2 download page does not state a dataset licence. Its February 2022 codebook says “Copyright © University of Gothenburg, V-Dem Institute — All rights reserved”. The separate general V-Dem dataset page currently states CC BY-SA 4.0, but it does not explicitly establish that V-Party v2 is covered. The V-Party v2 dataset licence is therefore recorded as **`requires_confirmation`**. Distribution or relicensing of this extract must not assume GPL-3.0 or CC BY-SA 4.0 without confirmation from V-Dem.

Citation: Staffan I. Lindberg et al. (2022), *Codebook Varieties of Party Identity and Organization (V-Party) V2*, Varieties of Democracy (V-Dem) Project, https://doi.org/10.23696/vpartydsv2.

The snapshot includes only explicitly reviewed Party Facts ID joins. ProjectAtlas retains the original ordinal labels and coder counts, then maps only semantically compatible variables into fictional historical priors. Party names are retained only for provenance and never drive classification.

## Party Facts crosswalk and Wikidata chairperson claims

`src/data/source-snapshots/partyfacts-wikidata-2026-10-01.json` contains only the 35 Party Facts rows whose IDs are already connected to ProjectAtlas parties by the reviewed V-Party/IPU identifier crosswalk. The source CSV is pinned to Party Facts repository commit `61e04e83a4eff4e285bdb724cc11cc8bdf4beb16`. Party Facts' repository `MIT` licence covers its software; no data licence was established for this crosswalk, so its data status remains **`requires_confirmation`**.

`src/data/source-snapshots/wikidata-party-chairs-2026-10-01.json` contains the pinned Wikidata Query Service extract of `P488` chairperson statements and `P580`/`P582` tenure qualifiers for those exact party QIDs. Wikidata structured data is **CC0 1.0**; attribution is recorded in the snapshot. The query was retrieved on 2026-10-01, after the 2026-01-01 scenario date. A chair claim is treated as applicable only when both start and end qualifiers are present and explicitly bound an interval containing the scenario date. An absent `P582` is not positive evidence of continued tenure; a current structured extract can be incomplete or stale. `P488` denotes a chairperson or presiding member and does not by itself prove the constitutional or electoral party-leader role.

`src/data/source-snapshots/party-leadership-evidence-2026-01-01.json` records individually reviewed, dated primary-source overrides and a hand-reviewed fictional analogue name for each retained source identity. Primary-source publication licences remain **`requires_confirmation`** unless explicitly documented in their source record; no such source licence is inferred from the publisher or site. The documented source role is preserved separately from the fictional gameplay party-head role. Gameplay names do not reproduce source names.

`npm run information:audit` verifies the pinned inputs, stable-ID joins, dated claim selection, ambiguous/unavailable handling, and complete 948-party coverage. It does not make the Party Facts data licence clear or grant redistribution rights.

## UK Ministry of Defence personnel reference (0.16 candidate)

`src/data/military-observations.json` contains only two dated UK Regular Forces figures from [Quarterly service personnel statistics1January2026](https://www.gov.uk/government/statistics/quarterly-service-personnel-statistics-2026/quarterly-service-personnel-statistics-1-january-2026), published2026-04-02, retrieved2026-10-03. Contains public sector information licensed under the [Open Government Licencev3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/); Ministry of Defence, Crown copyright2026. Third-party content is excluded. Independently rounded historical figures are explicitly partial, not exact operational stock partitions, current availability or an admitted army. No factual equipment/pay/industrial dataset is bundled. The optional military scenario and catalogue are ProjectAtlas's original, explicitly modelled assumptions under ISC, not observations.

## Distribution

Commercial distribution clearance must be resolved before release. The ISC licence for ProjectAtlas code does not authorize commercial use of IPU-derived data, clear the Party Facts crosswalk, or override third-party publication terms. A distributor must review, attribute, replace, separately license, or remove affected datasets and derived outputs as required.
