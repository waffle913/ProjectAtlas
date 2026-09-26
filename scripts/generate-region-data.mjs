import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAdmin1Model, toReconciliationCandidates } from './admin1-model.mjs';
import { reconcileRegionCandidates } from '../src/data/regionReconciliation.js';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [model, identities, priorMapping, reconciliationOverrides] = await Promise.all([
  loadAdmin1Model(),
  readJson('src/data/region-id-assignments.json'),
  readJson('src/data/admin1-mapping.json'),
  readJson('src/data/region-reconciliation-overrides.json'),
]);
if (identities.schemaVersion !== 2) throw new Error('Unsupported Region identity registry schema.');
const allPermanentIds = [...identities.regions.map(identity => identity.id), ...identities.reservedRegionIds.map(identity => identity.id)];
if (new Set(allPermanentIds).size !== allPermanentIds.length) throw new Error('Region identity registry reuses a permanent or reserved ID.');
const sourcePath = fileURLToPath(new URL(`src/data/source-snapshots/natural-earth-admin1-v${model.metadata.version}.geojson`, root));
const sourceBytes = await readFile(sourcePath);
if (createHash('sha256').update(sourceBytes).digest('hex') !== model.metadata.sha256) throw new Error('Pinned Admin-1 snapshot checksum does not match its metadata.');

const source = {
  name: 'Natural Earth 10m Admin-1 States and Provinces',
  url: model.metadata.sourceUrl,
  datasetId: model.metadata.snapshotId,
  retrievedAt: model.metadata.retrievedAt,
};
const admin0Source = {
  name: 'ProjectAtlas bundled Natural Earth Admin-0 mapping',
  url: 'https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/',
  datasetId: 'natural-earth-admin-0-110m',
  retrievedAt: model.metadata.retrievedAt,
};
const aliases = priorMapping.features.map(feature => ({
  datasetId: priorMapping.datasetId,
  sourceId: feature.sourceId,
  sourceAdmin1Code: feature.sourceAdmin1Code,
  regionId: feature.regionId,
}));
const reconciled = reconcileRegionCandidates({
  identities: identities.regions,
  aliases,
  candidates: toReconciliationCandidates(model),
  reviewedMatches: reconciliationOverrides.matches,
});
const reconciledByKey = new Map(reconciled.map(item => [item.reviewKey, item]));
const identityById = new Map(identities.regions.map(identity => [identity.id, identity]));

const assetName = countryId => `${countryId.replace(/[^a-zA-Z0-9.-]/g, '_')}.geojson`;
const geometryAssetsByCountry = {};
const regions = [];
const mappingFeatures = [];
const sourceToRegion = new Map();
for (const group of model.regionGroups) {
  const reviewKey = `${model.metadata.snapshotId}:${group.sourceGroupKey}`;
  const regionId = reconciledByKey.get(reviewKey)?.regionId;
  const identity = identityById.get(regionId);
  if (!identity) throw new Error(`Reconciliation did not resolve an authoritative Region identity: ${reviewKey}`);
  const runtimeAsset = `/data/admin1/countries/${assetName(group.country.id)}`;
  geometryAssetsByCountry[group.country.id] = runtimeAsset;
  regions.push({
    id: identity.id,
    parentCountryId: identity.parentCountryId,
    initialOwnerCountryId: identity.initialOwnerCountryId,
    macroTerritoryId: identity.macroTerritoryId,
    commonName: identity.commonName,
    ...(identity.localAdministrativeType && { localAdministrativeType: identity.localAdministrativeType }),
    administrativeLevel: identity.administrativeLevel,
    ...(identity.iso31662 && { iso31662: identity.iso31662 }),
    externalIds: identity.stableExternalIds,
    geographyMapping: {
      status: 'mapped', datasetId: model.metadata.snapshotId,
      sourceFeatureIds: group.sourceIds,
    },
    sourceMetadata: { currentSourceNames: [...new Set(group.records.map(record => record.properties.name))], notes: group.notes, sourceFeatureCount: group.sourceIds.length },
  });
  for (const record of group.records) {
    mappingFeatures.push({
      sourceId: record.sourceId,
      sourceAdmin1Code: String(record.properties.adm1_code),
      sourceName: record.properties.name,
      ...(record.sourceIso && { sourceIso31662: record.sourceIso }),
      ...(record.properties.wikidataid && { sourceWikidataId: record.properties.wikidataid }),
      regionId: identity.id,
      countryId: identity.parentCountryId,
    });
    sourceToRegion.set(record.sourceId, { regionId: identity.id, countryId: identity.parentCountryId });
  }
}
for (const country of model.fallbackCountries) {
  const matches = identities.regions.filter(identity => identity.status === 'active' && identity.identityKind === 'national_fallback' && identity.parentCountryId === country.id);
  if (matches.length !== 1) throw new Error(`Fallback Region identity requires explicit review: ${country.id}`);
  const identity = matches[0];
  const territory = model.territoryByCountry.get(country.id);
  const admin0Available = territory?.geographicMapping.status === 'mapped';
  regions.push({
    id: identity.id,
    parentCountryId: identity.parentCountryId,
    initialOwnerCountryId: identity.initialOwnerCountryId,
    macroTerritoryId: identity.macroTerritoryId,
    commonName: identity.commonName,
    localAdministrativeType: identity.localAdministrativeType,
    administrativeLevel: identity.administrativeLevel,
    externalIds: identity.stableExternalIds,
    geographyMapping: admin0Available ? {
      status: 'fallback_admin0', territoryId: territory.id,
      reason: 'No reliable first-order subdivision set is present in the pinned Admin-1 snapshot; the existing Admin-0 territory is used as one playable region.',
      checkedAt: model.metadata.retrievedAt, source: admin0Source,
    } : {
      status: 'unavailable',
      reason: 'No reliable first-order subdivision set or bundled Admin-0 geometry is available; the gameplay region exists without display geometry.',
      checkedAt: model.metadata.retrievedAt, source,
    },
  });
}
const generatedIds = new Set(regions.map(region => region.id));
const activeIdentityIds = identities.regions.filter(identity => identity.status === 'active').map(identity => identity.id);
if (activeIdentityIds.some(id => !generatedIds.has(id)) || generatedIds.size !== activeIdentityIds.length) {
  throw new Error('Generated Region coverage does not exactly match the authoritative active identity registry.');
}
regions.sort((a, b) => a.id.localeCompare(b.id));
mappingFeatures.sort((a, b) => a.sourceId.localeCompare(b.sourceId));

const countriesWithSource = [...model.groupsByCountry].map(([countryId, groups]) => ({
  countryId,
  commonName: model.countriesById.get(countryId).commonName,
  regionCount: groups.length,
  sourceFeatureCount: groups.reduce((total, group) => total + group.sourceIds.length, 0),
  ambiguousRegionCount: groups.filter(group => group.ambiguous).length,
}));
const completeAdmin1Coverage = countriesWithSource.filter(item => item.ambiguousRegionCount === 0);
const potentiallyIncompleteOrAmbiguous = countriesWithSource.filter(item => item.ambiguousRegionCount > 0).map(item => ({
  ...item,
  reason: 'One or more source regions have missing/ambiguous ISO 3166-2 codes or Natural Earth notes. Geometry remains usable but coverage requires review.',
}));
const fallbackRegions = model.fallbackCountries.map(country => {
  const region = regions.find(item => item.parentCountryId === country.id);
  return { countryId: country.id, commonName: country.commonName, regionId: region.id, geographyStatus: region.geographyMapping.status, reason: region.geographyMapping.reason };
});
const coverage = {
  schemaVersion: 1,
  generatedFrom: model.metadata.snapshotId,
  generatedAt: model.metadata.retrievedAt,
  summary: {
    registeredCountries: model.countryRegistry.countries.length,
    totalRegions: regions.length,
    countriesWithAdmin1: countriesWithSource.length,
    countriesUsingFallback: fallbackRegions.length,
    countriesPotentiallyIncompleteOrAmbiguous: potentiallyIncompleteOrAmbiguous.length,
    mappedSourceFeatures: mappingFeatures.length,
    excludedSourceFeatures: model.excluded.length,
  },
  completeAdmin1Coverage,
  fallbackRegions,
  potentiallyIncompleteOrAmbiguous,
  excludedSourceFeatures: model.excluded,
  limitations: model.metadata.limitations,
};
const registry = {
  schemaVersion: 2,
  sourceSnapshot: model.metadata,
  geometryAssetsByCountry,
  regions,
  retiredRegions: identities.regions.filter(identity => identity.status === 'retired'),
  reservedRegionIds: identities.reservedRegionIds,
};
const mapping = {
  schemaVersion: 2,
  datasetId: model.metadata.snapshotId,
  featureIdProperty: 'ne_id',
  features: mappingFeatures,
  excludedFeatures: model.excluded,
};

const tempDir = await mkdtemp(join(tmpdir(), 'projectatlas-admin1-'));
const mapshaperBin = fileURLToPath(new URL('../node_modules/mapshaper/bin/mapshaper', import.meta.url));
const simplify = (percentage, outputPath) => {
  const result = spawnSync(process.execPath, [mapshaperBin, sourcePath, '-simplify', percentage, 'keep-shapes', '-filter-fields', 'ne_id', '-o', 'format=geojson', 'precision=0.0001', outputPath], { encoding: 'utf8', maxBuffer: 10_000_000 });
  if (result.status !== 0) throw new Error(`Mapshaper failed (${percentage}): ${result.stderr || result.stdout}`);
};
const detailedPath = join(tempDir, 'detailed.geojson');
const overviewPath = join(tempDir, 'overview.geojson');
try {
  simplify('8%', detailedPath);
  simplify('1%', overviewPath);
  const [detailed, overview] = await Promise.all([
    readFile(detailedPath, 'utf8').then(JSON.parse),
    readFile(overviewPath, 'utf8').then(JSON.parse),
  ]);
  const byCountry = new Map();
  for (const feature of detailed.features) {
    const binding = sourceToRegion.get(String(feature.properties?.ne_id));
    if (!binding) continue;
    const features = byCountry.get(binding.countryId) ?? [];
    features.push({ type: 'Feature', properties: { sourceId: String(feature.properties.ne_id), regionId: binding.regionId, countryId: binding.countryId }, geometry: feature.geometry });
    byCountry.set(binding.countryId, features);
  }
  if ([...byCountry.values()].reduce((total, features) => total + features.length, 0) !== mappingFeatures.length) throw new Error('Simplified detailed geometry does not cover every mapped source feature.');
  const outputDir = fileURLToPath(new URL('public/data/admin1/', root));
  const countriesDir = join(outputDir, 'countries');
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(countriesDir, { recursive: true });
  await Promise.all([...byCountry].map(([countryId, features]) => writeFile(join(countriesDir, assetName(countryId)), JSON.stringify({ type: 'FeatureCollection', features }))));
  const overviewFeatures = overview.features.flatMap(feature => {
    const binding = sourceToRegion.get(String(feature.properties?.ne_id));
    return binding ? [{ type: 'Feature', properties: { sourceId: String(feature.properties.ne_id), regionId: binding.regionId, countryId: binding.countryId }, geometry: feature.geometry }] : [];
  });
  if (overviewFeatures.length !== mappingFeatures.length) throw new Error('Simplified overview geometry does not cover every mapped source feature.');
  await writeFile(join(outputDir, 'overview.geojson'), JSON.stringify({ type: 'FeatureCollection', features: overviewFeatures }));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

await Promise.all([
  writeFile(new URL('src/data/region-registry.json', root), JSON.stringify(registry, null, 2) + '\n'),
  writeFile(new URL('src/data/admin1-mapping.json', root), JSON.stringify(mapping, null, 2) + '\n'),
  writeFile(new URL('src/data/admin1-coverage-report.json', root), JSON.stringify(coverage, null, 2) + '\n'),
]);
console.log(`Generated ${regions.length} regions for ${model.countryRegistry.countries.length} countries: ${countriesWithSource.length} Admin-1, ${fallbackRegions.length} fallback, ${mappingFeatures.length} mapped source features.`);
