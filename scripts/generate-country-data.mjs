import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [assignments, m49Snapshot, worldSnapshot, bankSnapshot, officesSnapshot, governmentSnapshot, mapping] = await Promise.all([
  readJson('src/data/entity-id-assignments.json'), readJson('src/data/source-snapshots/un-m49.json'),
  readJson('src/data/source-snapshots/world-countries.json'), readJson('src/data/source-snapshots/world-bank.json'),
  readJson('src/data/source-snapshots/wikidata-offices.json'), readJson('src/data/source-snapshots/wikidata-government-types.json'),
  readJson('src/data/natural-earth-mapping.json'),
]);
const source = (name, snapshot) => ({ name, url: snapshot.sourceUrl, datasetId: snapshot.snapshotId, retrievedAt: snapshot.retrievedAt });
const sources = {
  un: source('United Nations Statistics Division M49', m49Snapshot),
  iso: { name: 'ISO 3166 Maintenance Agency', url: 'https://www.iso.org/obp/ui/#search/code/', datasetId: 'ISO-3166-1', retrievedAt: m49Snapshot.retrievedAt },
  world: source('World Countries dataset by mledoze', worldSnapshot), bank: source('World Bank World Development Indicators', bankSnapshot),
  offices: source('Wikidata officeholder snapshot', officesSnapshot), government: source('Wikidata government-form snapshot', governmentSnapshot),
  naturalEarth: { name:'Natural Earth Admin 0 Countries 110m', url:'https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/', datasetId:mapping.datasetId, retrievedAt:m49Snapshot.retrievedAt },
};
const unByIso3 = new Map(m49Snapshot.entities.map(item => [item.isoAlpha3, item]));
const worldByIso3 = new Map(worldSnapshot.countries.map(item => [item.isoAlpha3, item]));
const mappedByCountry = new Map(mapping.features.map(item => [item.countryId, item]));
const assignmentByIso3 = new Map(Object.entries(assignments.entities).filter(([key]) => key.startsWith('iso:')).map(([key,value]) => [key.slice(4), value]));
const idForIso3 = iso3 => assignmentByIso3.get(iso3)?.countryId;
const dependencySovereigns = {
  ALA:'FIN', ASM:'USA', ABW:'NLD', AIA:'GBR', BES:'NLD', BLM:'FRA', BMU:'GBR', BVT:'NOR', CCK:'AUS', CUW:'NLD', CXR:'AUS', CYM:'GBR',
  FLK:'GBR', FRO:'DNK', GIB:'GBR', GLP:'FRA', GRL:'DNK', GUF:'FRA', GUM:'USA', HMD:'AUS', IOT:'GBR', JEY:'GBR',
  GGY:'GBR', MAF:'FRA', MNP:'USA', MSR:'GBR', MTQ:'FRA', MYT:'FRA', NCL:'FRA', NFK:'AUS', PCN:'GBR', PRI:'USA', PYF:'FRA',
  REU:'FRA', SGS:'GBR', SHN:'GBR', SJM:'NOR', SPM:'FRA', SXM:'NLD', TCA:'GBR', TKL:'NZL', UMI:'USA', VGB:'GBR', VIR:'USA', WLF:'FRA', ATF:'FRA',
};
const specialSovereigns = { COK:'NZL', NIU:'NZL', HKG:'CHN', MAC:'CHN', IMN:'GBR' };
const manualProfiles = {
  'atlas:northern-cyprus': { commonName:'Northern Cyprus', officialName:'Turkish Republic of Northern Cyprus', entityType:'partially_recognized', continent:'Asia', unSubregion:'Western Asia', capital:'North Nicosia', source:{name:'Turkish Cypriot Public Information Office',url:'https://pio.mfa.gov.ct.tr/en/',datasetId:'TRNC-PIO',retrievedAt:m49Snapshot.retrievedAt} },
  'atlas:somaliland': { commonName:'Somaliland', officialName:'Republic of Somaliland', entityType:'partially_recognized', continent:'Africa', unSubregion:'Sub-Saharan Africa', capital:'Hargeisa', source:{name:'Government of Somaliland',url:'https://somalilandgov.com/',datasetId:'Somaliland-government-portal',retrievedAt:m49Snapshot.retrievedAt} },
  'atlas:kosovo': { commonName:'Kosovo', officialName:'Republic of Kosovo', entityType:'partially_recognized', continent:'Europe', unSubregion:'Southern Europe', capital:'Pristina', source:{name:'Government of Kosovo',url:'https://www.rks-gov.net/EN/',datasetId:'Kosovo-government-portal',retrievedAt:m49Snapshot.retrievedAt} },
};
const manualPersonNames = { Q22686:'Donald Trump', Q5771800:'Claudia Sheinbaum', Q3052772:'Emmanuel Macron', Q1780398:'Ulf Kristersson', Q42478807:'Đuro Macut' };
const manualOfficeholders = {
  VEN:{ head_of_state:{personId:'Q58132',personName:'Nicolás Maduro',startDate:'2025-01-10'}, head_of_government:{personId:'Q58132',personName:'Nicolás Maduro',startDate:'2025-01-10'} },
  GNB:{ head_of_state:{personId:'Q136640489',personName:'Horta Inta-A',startDate:'2025-11-27'} },
  'atlas:northern-cyprus':{ head_of_state:{personId:'Q47188815',personName:'Tufan Erhürman',startDate:'2025-10-24'}, head_of_government:{personId:'Q12812869',personName:'Ünal Üstel',startDate:'2022-05-12'} },
  'atlas:somaliland':{ head_of_state:{personId:'Q4664994',personName:'Abdirahman Mohamed Abdullahi',startDate:'2024-12-12'}, head_of_government:{personId:'Q4664994',personName:'Abdirahman Mohamed Abdullahi',startDate:'2024-12-12'} },
  'atlas:kosovo':{ head_of_state:{personId:'Q13047644',personName:'Vjosa Osmani',startDate:'2021-04-04',endDate:'2026-04-04'}, head_of_government:{personId:'Q441633',personName:'Albin Kurti',startDate:'2021-03-22'} },
};

const profiles = [];
const territories = [];
for (const [key, ids] of Object.entries(assignments.entities)) {
  const iso3 = key.startsWith('iso:') ? key.slice(4) : undefined;
  const un = iso3 ? unByIso3.get(iso3) : undefined;
  const world = iso3 ? worldByIso3.get(iso3) : undefined;
  const manual = manualProfiles[key] ?? {};
  if (!un && !world && !manual.commonName) throw new Error(`No pinned profile source for ${key}`);
  const unMembership = iso3 === 'VAT' || iso3 === 'PSE' ? 'observer' : world?.unMember ? 'member' : 'non_member';
  let entityType = manual.entityType;
  let sovereignCountryId;
  if (!entityType && dependencySovereigns[iso3]) { entityType = 'dependency'; sovereignCountryId = idForIso3(dependencySovereigns[iso3]); }
  if (!entityType && specialSovereigns[iso3]) { entityType = 'special_status'; sovereignCountryId = idForIso3(specialSovereigns[iso3]); }
  if (!entityType && iso3 === 'ESH') entityType = 'disputed';
  if (!entityType && ['PSE','TWN'].includes(iso3)) entityType = 'partially_recognized';
  if (!entityType && iso3 === 'ATA') entityType = 'special_status';
  if (!entityType) entityType = world?.independent || unMembership === 'member' || iso3 === 'VAT' ? 'sovereign_state' : 'dependency';
  if (entityType === 'dependency' && !sovereignCountryId) throw new Error(`Dependency needs an explicit sovereign mapping: ${iso3}`);
  const mappingRecord = mappedByCountry.get(ids.countryId);
  const commonName = manual.commonName ?? un?.commonName ?? world?.name?.common;
  profiles.push({ id:ids.countryId, commonName, officialName:manual.officialName ?? world?.name?.official,
    externalIds:{ ...(world?.isoAlpha2 && {isoAlpha2:world.isoAlpha2}), ...(iso3 && {isoAlpha3:iso3}), ...((un?.unM49 ?? world?.unM49) && {unM49:un?.unM49 ?? world?.unM49}) },
    entityType, unMembership, ...(sovereignCountryId && {sovereignCountryId}), continent:manual.continent ?? un?.continent ?? world?.continent,
    unSubregion:manual.unSubregion ?? un?.unSubregion ?? world?.subregion, capital:manual.capital ?? world?.capital?.[0],
    sources:{identity:[...(un?[sources.un]:[]),...(world?.isoAlpha3?[sources.iso]:[]),...(manual.source?[manual.source]:[])],details:world?[sources.world]:[]},
  });
  territories.push({ id:ids.territoryId, label:commonName, initialOwnerCountryId:ids.countryId,
    geographicMapping: mappingRecord ? {status:'mapped',datasetId:mapping.datasetId,sourceId:mappingRecord.sourceId} : {status:'unavailable',reason:'No geometry for this entity is included in the bundled Natural Earth 110m political layer.',checkedAt:m49Snapshot.retrievedAt,source:sources.naturalEarth} });
}
const registry = {schemaVersion:3,countries:profiles,territories};

const available = (value, sourceRef, referenceDate, isEstimate=false) => ({status:'available',value,source:sourceRef,referenceDate,isEstimate});
const unavailable = (reason, sourceRef) => ({status:'unavailable',reason,checkedAt:sourceRef.retrievedAt,source:sourceRef});
const indicator = (code, iso3, estimate) => {
  const row = bankSnapshot.indicators[code]?.[iso3];
  return row ? available(row.value,sources.bank,row.referenceDate,estimate) : unavailable(`No ${code} observation is present for this entity in the pinned World Bank snapshot.`,sources.bank);
};
const facts = profiles.map(profile => {
  const iso3=profile.externalIds.isoAlpha3, world=worldByIso3.get(iso3), forms=governmentSnapshot.forms[iso3];
  return {countryId:profile.id,facts:{
    population:indicator('SP.POP.TOTL',iso3,true),totalAreaKm2:indicator('AG.SRF.TOTL.K2',iso3,false),landAreaKm2:indicator('AG.LND.TOTL.K2',iso3,false),
    nominalGdpUsd:indicator('NY.GDP.MKTP.CD',iso3,true),gdpPerCapitaUsd:indicator('NY.GDP.PCAP.CD',iso3,true),
    currencies:world?.currencies?available(Object.entries(world.currencies).map(([code,item])=>({code,name:item.name,symbol:item.symbol})),sources.world,worldSnapshot.referenceDate):unavailable('No currency record is present in the pinned country-profile snapshot.',sources.world),
    languages:world?.languages?available(Object.values(world.languages),sources.world,worldSnapshot.referenceDate):unavailable('No language record is present in the pinned country-profile snapshot.',sources.world),
    governmentType:forms?.length?available(forms,sources.government,governmentSnapshot.referenceDate):unavailable('No government-form statement is present in the pinned Wikidata snapshot.',sources.government),
  }};
});
const factsData={schemaVersion:2,observationsAsOf:'2026-01-01',countries:facts};

const offices=[],officeholders=[];
for(const profile of profiles.filter(item=>['sovereign_state','partially_recognized'].includes(item.entityType))){
  const key=profile.externalIds.isoAlpha3 ?? Object.entries(assignments.entities).find(([,ids])=>ids.countryId===profile.id)?.[0];
  for(const [kind,title,snapshotRecords] of [['head_of_state','Head of State',officesSnapshot.headsOfState],['head_of_government','Head of Government',officesSnapshot.headsOfGovernment]]){
    const officeId=`office:${profile.id}:${kind}`;offices.push({id:officeId,countryId:profile.id,kind,title});
    const record=manualOfficeholders[key]?.[kind] ?? snapshotRecords[key];
    officeholders.push(record?{status:'available',officeId,person:{id:`wikidata:${record.personId}`,name:manualPersonNames[record.personId]??record.personName},startDate:record.startDate,endDate:record.endDate,referenceDate:'2026-01-01',source:sources.offices}:{status:'unavailable',officeId,reason:'No qualifying officeholder statement is present in the pinned snapshot.',checkedAt:officesSnapshot.retrievedAt,source:sources.offices});
  }
}
const politics={schemaVersion:2,referenceDate:'2026-01-01',offices,officeholders};
await Promise.all([
  writeFile(new URL('src/data/entity-registry.json',root),JSON.stringify(registry,null,2)+'\n'),
  writeFile(new URL('src/data/country-facts.json',root),JSON.stringify(factsData,null,2)+'\n'),
  writeFile(new URL('src/data/political-offices.json',root),JSON.stringify(politics,null,2)+'\n'),
]);
console.log(`Generated ${profiles.length} registry entities (${profiles.filter(p=>p.unMembership==='member').length} UN members), ${mapping.features.length} mapped territories and ${profiles.length-mapping.features.length} entities without bundled geometry.`);
