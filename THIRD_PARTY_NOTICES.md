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

## Historical merchandise trade (0.17 candidate)

`src/data/trade-observations.json` bundles two 2024 US/Canada annual
goods-value references from the [US Census Bureau](https://www.census.gov/foreign-trade/balance/c1220.html)
(federal factual statistics, public domain), plus sixty historical
bilateral/category value observations adapted from Statistics Canada
[Table 12-10-0175-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1210017501).
The [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/terms-conditions/open-licence)
permits reuse and sale with accurate attribution. Adapted from Statistics
Canada, Table 12-10-0175-01, 2024. This does not constitute an endorsement by
Statistics Canada of this product.

The pinned extract contains 864 monthly observations, selected national
Canada imports/domestic exports with the United States, China and United
Kingdom, retrieved 2026-10-03. Category mappings combine only disjoint
top-level NAPCS groups; domestic exports exclude re-exports. No physical
production, quantities, logistics capacities, stocks or tariffs are sourced.
2024 historical evidence is never presented as an observed 2026 flow.

Approximate annual USD conversion uses the Bank of Canada's
[2024 annual average FXAUSDCAD series](https://www.bankofcanada.ca/valet/observations/FXAUSDCAD/json?start_date=2024-01-01&end_date=2024-12-31),
1 USD = 1.3698 CAD. This is an annual average conversion, not transaction-level
USD valuation. Attribution: Bank of Canada. Its [reproduction terms](https://www.bankofcanada.ca/terms/)
require attribution and, for paid products, a pre-sale notice:
**Bank of Canada content is available free of charge on the Bank of Canada
website; prospective purchasers must be informed before sale.**
That notice is also carried in the source records and trade inspection.
The original FX publication date is unavailable; admission of the complete
transformed historical evidence to Government Information is conservatively
no earlier than retrieval 2026-10-03.

UN Comtrade was investigated but not bundled because its redistribution
terms require permission. No data licence is inferred from transport tooling.

## Distribution

Commercial distribution clearance must be resolved before release. The ISC licence for ProjectAtlas code does not authorize commercial use of IPU-derived data, clear the Party Facts crosswalk, or override third-party publication terms. A distributor must review, attribute, replace, separately license, or remove affected datasets and derived outputs as required.
