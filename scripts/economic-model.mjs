export const stableJson = value => `${JSON.stringify(value, null, 2)}\n`;

export function allocateEconomicOutput(totalUsd, weightedRegions) {
  if (!Number.isSafeInteger(totalUsd) || totalUsd < 0) throw new Error('National GDP allocation total must be non-negative safe integer whole USD.');
  if (!weightedRegions.length) throw new Error('At least one economic allocation weight is required.');
  const denominator = weightedRegions.reduce((sum, item) => sum + item.populationWeight, 0);
  if (!Number.isSafeInteger(denominator) || denominator <= 0 || weightedRegions.some(item => !Number.isSafeInteger(item.populationWeight) || item.populationWeight < 0)) throw new Error('Economic population weights must be non-negative safe integers with a positive total.');
  const denominatorBigInt = BigInt(denominator);
  const rows = weightedRegions.map(item => {
    const numerator = BigInt(totalUsd) * BigInt(item.populationWeight);
    return { ...item, output: Number(numerator / denominatorBigInt), remainder: numerator % denominatorBigInt };
  });
  const remaining = totalUsd - rows.reduce((sum, item) => sum + item.output, 0);
  rows.sort((a, b) => a.remainder === b.remainder ? a.regionId.localeCompare(b.regionId) : a.remainder > b.remainder ? -1 : 1);
  for (let index = 0; index < remaining; index += 1) rows[index].output += 1;
  return rows.sort((a, b) => a.regionId.localeCompare(b.regionId)).map(({ remainder, ...item }) => ({ ...item, denominator }));
}

export function buildEconomicArtifacts({ countries, regions, countryFacts, demographics, baselineDate = '2026-01-01' }) {
  const facts = new Map(countryFacts.map(item => [item.countryId, item.facts.nominalGdpUsd]));
  const demographicByRegion = new Map(demographics.map(item => [item.regionId, item]));
  const records = [], coverage = { schemaVersion: 1, baselineDate, summary: { regions: regions.length, available: 0, derived: 0, unavailable: 0, countriesExactlyNormalized: 0 }, countries: [] };
  for (const country of countries) {
    const countryRegions = regions.filter(region => region.parentCountryId === country.id), gdp = facts.get(country.id);
    const validGdp = gdp?.status === 'available' && Number.isFinite(gdp.value) && gdp.value >= 0;
    const totalUsd = validGdp ? Math.round(gdp.value) : undefined;
    const completePopulation = countryRegions.every(region => { const record = demographicByRegion.get(region.id); return record && record.status !== 'unavailable' && Number.isSafeInteger(record.baselinePopulation) && record.baselinePopulation >= 0; });
    const canAllocate = countryRegions.length > 0 && validGdp && Number.isSafeInteger(totalUsd) && (countryRegions.length === 1 || completePopulation);
    if (canAllocate) {
      const weighted = countryRegions.map(region => ({ regionId: region.id, parentCountryId: country.id, populationWeight: countryRegions.length === 1 ? 1 : demographicByRegion.get(region.id).baselinePopulation }));
      const allocated = allocateEconomicOutput(totalUsd, weighted);
      for (const item of allocated) records.push({ regionId: item.regionId, parentCountryId: country.id, status: countryRegions.length === 1 ? 'available' : 'derived', baselineAnnualOutputUsd: item.output, unit: 'USD_PER_YEAR', baselineDate, nationalSourceObservation: gdp, nationalAllocationTotalUsd: totalUsd, allocationWeight: { kind: countryRegions.length === 1 ? 'single_region_direct' : 'region_baseline_population', numerator: item.populationWeight, denominator: item.denominator }, allocationMethod: countryRegions.length === 1 ? 'direct-national-gdp-to-single-region-v1' : 'largest-remainder-by-region-population-v1', isObservedRegionalValue: false, isDerived: countryRegions.length > 1, provenance: { generator: 'generate-economic-data.mjs', countryFactsDataset: 'src/data/country-facts.json', demographicDataset: 'src/data/region-demographics.json' }, limitationNote: countryRegions.length === 1 ? 'The national nominal GDP observation is used directly because this country has one gameplay Region; it is not a separately observed regional statistic.' : 'Modelled allocation of national nominal GDP using Region baseline population weights; not an observed regional GDP statistic.' });
      coverage.summary[countryRegions.length === 1 ? 'available' : 'derived'] += allocated.length; coverage.summary.countriesExactlyNormalized += 1;
      coverage.countries.push({ countryId: country.id, status: 'allocated', sourceReferenceDate: gdp.referenceDate, sourceValueUsd: gdp.value, allocationTotalUsd: totalUsd, regionalTotalUsd: allocated.reduce((sum, item) => sum + item.output, 0), regionCount: allocated.length });
    } else {
      const reason = !validGdp ? 'No defensible nominal GDP observation is available in the committed country facts.' : !Number.isSafeInteger(totalUsd) ? 'Nominal GDP cannot be represented safely in the whole-USD integer unit.' : 'Complete usable Region population baselines are required for multi-Region economic allocation.';
      for (const region of countryRegions) records.push({ regionId: region.id, parentCountryId: country.id, status: 'unavailable', reason, checkedAt: '2026-09-27', source: gdp?.source ?? { name: 'ProjectAtlas country facts', url: 'https://github.com/waffle913/ProjectAtlas', datasetId: 'country-facts', retrievedAt: '2026-09-27' } });
      coverage.summary.unavailable += countryRegions.length; coverage.countries.push({ countryId: country.id, status: 'unavailable', reason, regionCount: countryRegions.length });
    }
  }
  records.sort((a, b) => a.regionId.localeCompare(b.regionId));
  return { baselines: { schemaVersion: 1, baselineDate, unit: 'USD_PER_YEAR', records }, coverage };
}
