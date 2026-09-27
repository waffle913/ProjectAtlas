export const stableJson = value => `${JSON.stringify(value, null, 2)}\n`;

export function allocateIntegerPopulation(total, weightedRegions) {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('National population must be a non-negative safe integer.');
  if (!weightedRegions.length) throw new Error('At least one Region weight is required.');
  const sum = weightedRegions.reduce((value, item) => value + item.weight, 0);
  if (!Number.isFinite(sum) || sum <= 0 || weightedRegions.some(item => !Number.isFinite(item.weight) || item.weight < 0)) throw new Error('Spatial weights must be finite, non-negative, and have a positive sum.');
  const rows = weightedRegions.map(item => { const exact = total * item.weight / sum; return { ...item, population: Math.floor(exact), remainder: exact - Math.floor(exact) }; });
  const remaining = total - rows.reduce((value, item) => value + item.population, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.regionId.localeCompare(b.regionId));
  for (let index = 0; index < remaining; index += 1) rows[index].population += 1;
  return rows.sort((a, b) => a.regionId.localeCompare(b.regionId)).map(({ remainder, ...item }) => item);
}

export function buildPopulationArtifacts({ countries, regions, nationalObservations, spatialWeights, spatialAudit, manifest }) {
  const observations = new Map(nationalObservations.map(item => [item.countryId, item]));
  const weightsByCountry = new Map();
  for (const item of spatialWeights) { const list = weightsByCountry.get(item.countryId) ?? []; list.push(item); weightsByCountry.set(item.countryId, list); }
  const baselines = [];
  const audit = { schemaVersion: 1, generatedFrom: manifest.snapshotId, spatialAudit: spatialAudit ? { status: 'accepted', sha256: spatialAudit.sha256, acceptedCountries: spatialAudit.summary.acceptedCountries, rejectedCountries: spatialAudit.summary.rejectedCountries, preprocessingRejectedCountries: spatialAudit.summary.preprocessingRejectedCountries, acceptedWeights: spatialAudit.summary.acceptedWeights, authoritativeGeometry: spatialAudit.authoritativeRegionGeometry, processingEngine: spatialAudit.processingTools.engine, processingToolVersions: spatialAudit.processingTools, note: 'Only countries passing the committed WorldPop audit receive spatially derived baselines. Rejected and unprocessed countries remain explicitly unavailable.' } : { status: 'required_on_rebuild', authoritativeGeometry: 'src/data/source-snapshots/natural-earth-admin1-v5.1.2.geojson', note: 'No verified accepted spatial audit was supplied.' }, summary: { regions: regions.length, available: 0, derived: 0, unavailable: 0, countriesExactlyNormalized: 0 }, countries: [] };
  for (const country of countries) {
    const countryRegions = regions.filter(region => region.parentCountryId === country.id);
    const observation = observations.get(country.id);
    let weights = weightsByCountry.get(country.id) ?? [];
    if (!weights.length && countryRegions.length === 1) weights = [{ countryId: country.id, regionId: countryRegions[0].id, weight: 1, source: { name: 'Single-Region national allocation', url: manifest.wppSource.canonicalUrl, datasetId: 'projectatlas-single-region-allocation-v1', retrievedAt: manifest.retrievedAt }, note: 'No spatial distribution is needed because the country has one gameplay Region.' }];
    const weightIds = new Set(weights.map(item => item.regionId));
    const complete = weights.length === countryRegions.length && countryRegions.every(region => weightIds.has(region.id));
    if (observation && complete) {
      const allocated = allocateIntegerPopulation(observation.value, weights);
      for (const item of allocated) baselines.push({ regionId: item.regionId, status: weights.length === 1 ? 'available' : 'derived', baselinePopulation: item.population, baselineDate: '2026-01-01', sourceObservations: [observation], spatialWeightSource: item.source, spatialWeight: item.weight, allocationMethod: 'largest-remainder-normalized-by-country-v1', isEstimate: true, isProjection: observation.isProjection, isDerived: weights.length > 1, provenance: { generatedFrom: manifest.snapshotId, generator: 'generate-population-data.mjs' }, limitationNote: item.note });
      audit.summary[weights.length === 1 ? 'available' : 'derived'] += allocated.length; audit.summary.countriesExactlyNormalized += 1;
      audit.countries.push({ countryId: country.id, status: 'allocated', nationalTotal: observation.value, regionalTotal: allocated.reduce((sum, item) => sum + item.population, 0), regionCount: allocated.length });
    } else {
      const reason = !observation ? 'No defensible national observation in the pinned WPP snapshot or reviewed alternate source.' : 'Pinned WorldPop spatial weights are not available for every gameplay Region in this country.';
      for (const region of countryRegions) baselines.push({ regionId: region.id, status: 'unavailable', reason, checkedAt: manifest.retrievedAt, source: observation?.source ?? manifest.wppSource.publicationSource });
      audit.summary.unavailable += countryRegions.length; audit.countries.push({ countryId: country.id, status: 'unavailable', reason, regionCount: countryRegions.length });
    }
  }
  baselines.sort((a, b) => a.regionId.localeCompare(b.regionId));
  return { demographics: { schemaVersion: 1, baselineDate: '2026-01-01', records: baselines }, audit };
}
