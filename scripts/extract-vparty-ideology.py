"""Build the compact V-Party ideology snapshot.

Requires pandas and pyreadr. Entity links are reviewed Party Facts ID links; this
script never matches or classifies a party from its name.
"""
import json
import os
import tempfile
import urllib.request

import pyreadr

REFERENCE_DATE = "2026-01-01"
RETRIEVED_AT = "2026-09-30"
COMMIT = "f4dd26922e658442524dfd954bf14f7ebe622d5d"
URL = f"https://raw.githubusercontent.com/vdeminstitute/vdemdata/{COMMIT}/data/vparty.RData"
OUTPUT = "src/data/source-snapshots/vparty-ideology-2022.json"

# IPU source party ID -> reviewed V-Party / Party Facts identity.
LINKS = {
    "us-democratic_party_0": 432, "us-republican_party": 809,
    "ca-liberal_party": 1739, "ca-conservative_party": 1004,
    "ca-bloc_qu__b__cois_bq": 1428, "ca-ndp_new_democratic_party_ndp_": 152,
    "ca-green_party": 931,
    "gb-labour_party": 1516, "gb-conservative_party": 1567,
    "gb-scottish_national_party": 986,
    "de-christian_democratic_union_cdu": 1375, "de-alternative_germany_afd": 1976,
    "de-social_democratic_party_spd": 383, "de-green_party": 1816,
    "de-left_party_die_linke": 1545, "de-christian_social_union_bavaria_csu": 1731,
    "fr-national_rally_rn_": 433, "fr-republicans_lr": 1595,
    "fr-socialist_party_ps": 1478,
    "au-australian_labor_party_alp": 424, "au-greens_0": 1209,
    "jp-liberal_democratic_party_ldp": 1746,
    "jp-constitutional_democratic_party_japan": 6135,
    "jp-nippon_ishin_no_japan_restoration_party": 2080,
    "jp-komeito": 1515, "jp-japanese_communist_party_jcp": 736,
    "br-liberal_party_pl": 4405, "br-workers_party_pt": 356,
    "br-progressive_party_pp": 781, "br-brazilian_democratic_movement_mdb_": 654,
    "br-social_democratic_party_psd": 4613, "br-republicans_republicanos_": 7079,
    "br-democratic_labour_party_pdt": 1009, "br-brazilian_socialist_party_psb": 723,
    "br-brazilian_social_democratic_party_psdb": 225,
}

VARIABLES = ["v2pariglef", "v2pawelf", "v2paimmig", "v2palgbt", "v2paminor", "v2paplur", "v2pawomlab", "v2paculsup"]
MAPPED_VARIABLES = ["v2pariglef", "v2paimmig", "v2palgbt", "v2paminor", "v2paplur", "v2pawomlab"]
TEMPORAL_APPLICABILITY_CONFIDENCE_BPS = 2500

with urllib.request.urlopen(URL) as response:
    payload = response.read()
with tempfile.NamedTemporaryFile(suffix=".RData", delete=False) as handle:
    handle.write(payload)
    temporary = handle.name
try:
    frame = pyreadr.read_r(temporary)["vparty"]
finally:
    os.unlink(temporary)

ipu = json.load(open("src/data/source-snapshots/ipu-parline-politics-2026-01-01.json", encoding="utf-8"))
ipu_parties = {seat["sourcePartyId"]: seat["sourcePartyName"] for country in ipu["countries"] for chamber in country["chambers"] for seat in (chamber.get("election") or {}).get("seats", [])}
records = []
for source_party_id, party_facts_id in sorted(LINKS.items()):
    if source_party_id not in ipu_parties:
        raise ValueError(f"Unknown IPU party link: {source_party_id}")
    rows = frame[frame["pf_party_id"] == party_facts_id].sort_values("year")
    if rows.empty:
        raise ValueError(f"Missing Party Facts ID: {party_facts_id}")
    row = rows.iloc[-1]
    values = {variable: {"ordinal": int(row[f"{variable}_ord"]), "coderCount": int(row[f"{variable}_nr"])} for variable in VARIABLES if not row[[f"{variable}_ord", f"{variable}_nr"]].isna().any()}
    minimum = min(values[variable]["coderCount"] for variable in MAPPED_VARIABLES)
    if len(values) != len(VARIABLES) or minimum < 3:
        raise ValueError(f"Insufficient V-Party evidence for {party_facts_id}")
    records.append({
        "sourcePartyId": source_party_id,
        "sourcePartyName": ipu_parties[source_party_id],
        "partyFactsId": party_facts_id,
        "vPartyId": int(row["v2paid"]),
        "vPartyName": row["v2paenname"],
        "effectiveDate": str(row["historical_date"])[:10],
        "status": "sourced" if minimum >= 4 else "partial",
        "measurementConfidenceBps": 7000 if minimum >= 4 else 4500,
        "temporalStatus": "historical_prior",
        "temporalApplicabilityConfidenceBps": TEMPORAL_APPLICABILITY_CONFIDENCE_BPS,
        "politicalFamily": "economic_left" if values["v2pariglef"]["ordinal"] <= 2 else "economic_centre" if values["v2pariglef"]["ordinal"] == 3 else "economic_right",
        "sourceIdeologicalLabels": values,
        "linkMethod": "reviewed_ipu_party_to_partyfacts_id_v1",
        "transformationMethod": "vparty_ordinal_linear_v1",
        "limitations": "Election-specific V-Party evidence from 2017-2019 is a historical prior, not a 2026 observation. Coder count qualifies historical measurement quality only; temporal applicability is separately low-confidence. Unmapped or semantically incompatible ProjectAtlas dimensions remain neutral.",
    })

snapshot = {
    "schemaVersion": 1,
    "referenceDate": REFERENCE_DATE,
    "retrievedAt": RETRIEVED_AT,
    "source": {
        "name": "V-Party Country-Party-Date v2 via vdemdata 16.0",
        "publisher": "V-Dem Institute",
        "published": "2022-02-01",
        "url": "https://v-dem.net/data/v-party-dataset/",
        "codebook": "https://v-dem.net/documents/6/vparty_codebook_v2.pdf",
        "distributionUrl": URL,
        "distributionCommit": COMMIT,
        "datasetLicence": {
            "status": "requires_confirmation",
            "checkedOn": RETRIEVED_AT,
            "officialDatasetPage": "https://v-dem.net/data/v-party-dataset/",
            "evidence": "The official V-Party v2 page does not state a dataset licence, while the v2 codebook says Copyright University of Gothenburg, V-Dem Institute, All rights reserved. The general V-Dem dataset page states CC BY-SA 4.0 but does not explicitly identify V-Party v2 as covered.",
        },
        "tooling": {
            "name": "vdemdata R package",
            "version": "16.0",
            "repository": "https://github.com/vdeminstitute/vdemdata",
            "licence": "GPL-3.0",
        },
        "citation": "Lindberg, Staffan I., et al. 2022. Codebook Varieties of Party Identity and Organization (V-Party) V2. Varieties of Democracy (V-Dem) Project. https://doi.org/10.23696/vpartydsv2",
    },
    "methodology": "Explicit reviewed IPU-to-Party-Facts entity links only. Latest historical V-Party observation per Party Facts ID. Eight ordinal variables are retained for audit, but only six semantically compatible variables feed ProjectAtlas priors. Mapped variables require at least three coders; coder count qualifies historical measurement quality and does not determine 2026 applicability. No name-based classification or source-ID-derived ideology.",
    "parties": records,
}
with open(OUTPUT, "w", encoding="utf-8", newline="\n") as handle:
    json.dump(snapshot, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
print(json.dumps({"parties": len(records), "sourced": sum(item["status"] == "sourced" for item in records), "partial": sum(item["status"] == "partial" for item in records)}, indent=2))
