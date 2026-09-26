import { readFile } from 'node:fs/promises';
import { loadAdmin1Model, toReconciliationCandidates } from './admin1-model.mjs';
import { reconcileRegionCandidates } from '../src/data/regionReconciliation.js';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [model, identities, priorMapping, overrides] = await Promise.all([
  loadAdmin1Model(),
  readJson('src/data/region-id-assignments.json'),
  readJson('src/data/admin1-mapping.json'),
  readJson('src/data/region-reconciliation-overrides.json'),
]);
if (identities.schemaVersion !== 2) throw new Error('Unsupported Region identity registry schema.');
const allPermanentIds = [...identities.regions.map(identity => identity.id), ...identities.reservedRegionIds.map(identity => identity.id)];
if (new Set(allPermanentIds).size !== allPermanentIds.length) throw new Error('Region identity registry reuses a permanent or reserved ID.');
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
  reviewedMatches: overrides.matches,
});
for (const country of model.fallbackCountries) {
  const matches = identities.regions.filter(identity => identity.status === 'active' && identity.identityKind === 'national_fallback' && identity.parentCountryId === country.id);
  if (matches.length !== 1) throw new Error(`Fallback Region identity requires explicit review: ${country.id}`);
}
console.log(`Reconciled ${reconciled.length} source groups without allocating or replacing any permanent Region ID.`);
