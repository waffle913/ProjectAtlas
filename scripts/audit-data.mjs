import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const stableJson = value => `${JSON.stringify(value, null, 2)}\n`;
const scenarioStart = '2026-01-01';
const outputJson = 'src/data/data-audit-report.json';
const outputMarkdown = 'docs/data-audit.md';

const registry = read('src/data/entity-registry.json');
const entityAssignments = read('src/data/entity-id-assignments.json');
const regionRegistry = read('src/data/region-registry.json');
const regionAssignments = read('src/data/region-id-assignments.json');
const admin1Coverage = read('src/data/admin1-coverage-report.json');
const facts = read('src/data/country-facts.json');
const politics = read('src/data/political-offices.json');
const population = read('src/data/region-demographics.json');
const nationalPopulation = read('src/data/source-snapshots/wpp2024-population-2026-01-01.json');
const populationCoverage = read('src/data/population-coverage-report.json');
const populationManifest = read('src/data/population-source-manifest.json');
const economics = read('src/data/region-economic-baselines.json');
const economicCoverage = read('src/data/economic-coverage-report.json');

const errors = [];
const requireCondition = (condition, message) => { if (!condition) errors.push(message); };
const validDate = value => {
  if (typeof value !== 'string') return false;
  if (/^\d{4}$/.test(value)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};
const validSource = source => source && typeof source === 'object' && ['name', 'url', 'datasetId', 'retrievedAt'].every(key => typeof source[key] === 'string' && source[key]) && validDate(source.retrievedAt);
const percent = (count, total) => Number((count * 100 / total).toFixed(2));
const unique = (items, label) => {
  const set = new Set();
  for (const item of items) { requireCondition(typeof item === 'string' && item.length > 0, `${label} contains an empty ID.`); requireCondition(!set.has(item), `${label} contains duplicate ID ${item}.`); set.add(item); }
  return set;
};
const hashIds = ids => createHash('sha256').update([...ids].sort().join('\n')).digest('hex');
const normalizedStatus = status => status === 'unavailable' ? 'unavailable' : 'available';

const countryIds = unique(registry.countries.map(country => country.id), 'Country registry');
const territoryIds = unique(registry.territories.map(territory => territory.id), 'Territory registry');
const regionIds = unique(regionRegistry.regions.map(region => region.id), 'Region registry');
const activeAssignmentIds = unique(regionAssignments.regions.filter(region => region.status === 'active').map(region => region.id), 'Active Region assignments');
requireCondition(countryIds.size === registry.countries.length, 'Country ID count does not match the registry.');
requireCondition(regionIds.size === activeAssignmentIds.size && [...regionIds].every(id => activeAssignmentIds.has(id)), 'Runtime Region IDs differ from permanent active assignments.');

const assignedEntities = Object.values(entityAssignments.entities);
const assignedCountryIds = new Set(assignedEntities.map(item => item.countryId));
const assignedTerritoryIds = new Set(assignedEntities.map(item => item.territoryId));
requireCondition([...countryIds].every(id => assignedCountryIds.has(id)), 'A Country ID is absent from permanent entity assignments.');
requireCondition([...territoryIds].every(id => assignedTerritoryIds.has(id)), 'A Territory ID is absent from permanent entity assignments.');

const territoryByCountry = new Map();
for (const territory of registry.territories) {
  requireCondition(countryIds.has(territory.initialOwnerCountryId), `Territory ${territory.id} references unknown Country ${territory.initialOwnerCountryId}.`);
  const list = territoryByCountry.get(territory.initialOwnerCountryId) ?? []; list.push(territory); territoryByCountry.set(territory.initialOwnerCountryId, list);
  if (territory.geographicMapping.status === 'mapped') requireCondition(Boolean(territory.geographicMapping.datasetId && territory.geographicMapping.sourceId), `Mapped Territory ${territory.id} lacks a stable dataset mapping.`);
  else requireCondition(Boolean(territory.geographicMapping.reason && validDate(territory.geographicMapping.checkedAt) && validSource(territory.geographicMapping.source)), `Unavailable Territory ${territory.id} lacks provenance.`);
}
for (const country of registry.countries) requireCondition(territoryByCountry.get(country.id)?.length === 1, `Country ${country.id} must own exactly one registered initial Territory.`);

const assignmentByRegion = new Map(regionAssignments.regions.filter(item => item.status === 'active').map(item => [item.id, item]));
const regionsByCountry = new Map();
for (const region of regionRegistry.regions) {
  requireCondition(countryIds.has(region.parentCountryId), `Region ${region.id} references unknown parent Country ${region.parentCountryId}.`);
  requireCondition(countryIds.has(region.initialOwnerCountryId), `Region ${region.id} references unknown initial owner ${region.initialOwnerCountryId}.`);
  requireCondition(!region.macroTerritoryId || territoryIds.has(region.macroTerritoryId), `Region ${region.id} references unknown macro Territory.`);
  const assignment = assignmentByRegion.get(region.id);
  requireCondition(assignment?.parentCountryId === region.parentCountryId && assignment?.initialOwnerCountryId === region.initialOwnerCountryId, `Region ${region.id} identity differs from its permanent assignment.`);
  const mapping = region.geographyMapping;
  if (mapping.status === 'mapped') requireCondition(Boolean(mapping.datasetId && mapping.sourceFeatureIds?.length), `Mapped Region ${region.id} lacks source aliases.`);
  else requireCondition(Boolean(mapping.reason && validDate(mapping.checkedAt) && validSource(mapping.source)), `Region ${region.id} fallback/unavailable geometry lacks provenance.`);
  if (mapping.status === 'fallback_admin0') requireCondition(territoryIds.has(mapping.territoryId), `Region ${region.id} fallback references unknown Territory.`);
  const list = regionsByCountry.get(region.parentCountryId) ?? []; list.push(region); regionsByCountry.set(region.parentCountryId, list);
}
for (const country of registry.countries) requireCondition((regionsByCountry.get(country.id)?.length ?? 0) > 0, `Country ${country.id} has no Region.`);

const factsByCountry = new Map(facts.countries.map(record => [record.countryId, record]));
const officesByCountry = new Map();
const officeById = new Map(politics.offices.map(office => [office.id, office]));
for (const holder of politics.officeholders) {
  const office = officeById.get(holder.officeId);
  requireCondition(Boolean(office), `Officeholder references unknown office ${holder.officeId}.`);
  if (!office) continue;
  const list = officesByCountry.get(office.countryId) ?? []; list.push({ office, holder }); officesByCountry.set(office.countryId, list);
}
for (const country of registry.countries) {
  const record = factsByCountry.get(country.id);
  requireCondition(Boolean(record), `Country ${country.id} lacks a facts record.`);
  for (const [field, fact] of Object.entries(record?.facts ?? {})) {
    if (fact.status === 'available') requireCondition(validSource(fact.source) && validDate(fact.referenceDate) && typeof fact.isEstimate === 'boolean', `Available fact ${country.id}/${field} lacks date or provenance.`);
    else requireCondition(fact.status === 'unavailable' && fact.reason && validDate(fact.checkedAt) && validSource(fact.source) && !Object.hasOwn(fact, 'value'), `Unavailable fact ${country.id}/${field} is malformed or carries a value.`);
  }
}

const populationByRegion = new Map();
for (const record of population.records) {
  requireCondition(regionIds.has(record.regionId) && !populationByRegion.has(record.regionId), `Population has unknown or duplicate Region ${record.regionId}.`);
  populationByRegion.set(record.regionId, record);
  if (record.status === 'unavailable') requireCondition(Boolean(record.reason && validDate(record.checkedAt) && validSource(record.source) && !Object.hasOwn(record, 'baselinePopulation')), `Unavailable population ${record.regionId} is malformed or represented as a value.`);
  else requireCondition(Number.isSafeInteger(record.baselinePopulation) && record.baselinePopulation >= 0 && validDate(record.baselineDate) && record.sourceObservations?.every(observation => Number.isSafeInteger(observation.value) && observation.value >= 0 && validDate(observation.referenceDate) && validSource(observation.source)), `Population baseline ${record.regionId} is invalid.`);
}
requireCondition(populationByRegion.size === regionIds.size, 'Population does not provide exactly one status per Region.');
const nationalPopulationByCountry = new Map(nationalPopulation.records.map(record => [record.countryId, record]));
const populationCoverageByCountry = new Map(populationCoverage.countries.map(record => [record.countryId, record]));
for (const [countryId, regions] of regionsByCountry) {
  const records = regions.map(region => populationByRegion.get(region.id));
  const known = records.filter(record => record.status !== 'unavailable');
  requireCondition(known.length === 0 || known.length === records.length, `Country ${countryId} has a partial population allocation.`);
  if (known.length) {
    const national = nationalPopulationByCountry.get(countryId), coverage = populationCoverageByCountry.get(countryId);
    requireCondition(Boolean(national) && known.reduce((sum, record) => sum + record.baselinePopulation, 0) === national.value, `Population allocation does not conserve national total for ${countryId}.`);
    requireCondition(coverage?.status === 'allocated' && coverage.regionalTotal === coverage.nationalTotal, `Population coverage report disagrees for ${countryId}.`);
  }
}

const economicByRegion = new Map();
for (const record of economics.records) {
  requireCondition(regionIds.has(record.regionId) && !economicByRegion.has(record.regionId), `Economy has unknown or duplicate Region ${record.regionId}.`);
  economicByRegion.set(record.regionId, record);
  if (record.status === 'unavailable') requireCondition(Boolean(record.reason && validDate(record.checkedAt) && validSource(record.source) && !Object.hasOwn(record, 'baselineAnnualOutputUsd')), `Unavailable economy ${record.regionId} is malformed or represented as a value.`);
  else requireCondition(Number.isSafeInteger(record.baselineAnnualOutputUsd) && record.baselineAnnualOutputUsd >= 0 && record.unit === 'USD_PER_YEAR' && validDate(record.baselineDate) && record.nationalSourceObservation?.status === 'available' && validDate(record.nationalSourceObservation.referenceDate) && validSource(record.nationalSourceObservation.source), `Economic baseline ${record.regionId} is invalid.`);
}
requireCondition(economicByRegion.size === regionIds.size, 'Economy does not provide exactly one status per Region.');
const economicCoverageByCountry = new Map(economicCoverage.countries.map(record => [record.countryId, record]));
for (const [countryId, regions] of regionsByCountry) {
  const records = regions.map(region => economicByRegion.get(region.id)), known = records.filter(record => record.status !== 'unavailable');
  requireCondition(known.length === 0 || known.length === records.length, `Country ${countryId} has a partial economic allocation.`);
  if (known.length) {
    const total = known.reduce((sum, record) => sum + record.baselineAnnualOutputUsd, 0), expected = known[0].nationalAllocationTotalUsd, coverage = economicCoverageByCountry.get(countryId);
    requireCondition(total === expected && known.every(record => record.nationalAllocationTotalUsd === expected), `Economic allocation does not conserve national total for ${countryId}.`);
    requireCondition(coverage?.status === 'allocated' && coverage.regionalTotalUsd === coverage.allocationTotalUsd, `Economic coverage report disagrees for ${countryId}.`);
  }
}

const datasets = new Map();
const addSource = (source, usage, referenceDate) => {
  if (!validSource(source)) { errors.push(`Dataset used by ${usage} lacks valid provenance.`); return; }
  const existing = datasets.get(source.datasetId) ?? { datasetId: source.datasetId, name: source.name, url: source.url, retrievedAt: source.retrievedAt, referenceDates: new Set(), uses: new Set() };
  requireCondition(existing.name === source.name && existing.url === source.url && existing.retrievedAt === source.retrievedAt, `Dataset ${source.datasetId} has inconsistent provenance.`);
  if (referenceDate) existing.referenceDates.add(referenceDate);
  existing.uses.add(usage); datasets.set(source.datasetId, existing);
};
for (const country of registry.countries) for (const [usage, sources] of Object.entries(country.sources)) for (const source of sources) addSource(source, `country-identity:${usage}`);
for (const record of facts.countries) for (const [field, fact] of Object.entries(record.facts)) addSource(fact.source, `national-fact:${field}`, fact.status === 'available' ? fact.referenceDate : fact.checkedAt);
for (const holder of politics.officeholders) addSource(holder.source, 'political-officeholder', holder.status === 'available' ? holder.referenceDate : holder.checkedAt);
for (const record of population.records) if (record.status === 'unavailable') addSource(record.source, 'region-population-unavailable', record.checkedAt); else { for (const observation of record.sourceObservations) addSource(observation.source, 'national-population', observation.referenceDate); addSource(record.spatialWeightSource, 'population-spatial-weight', record.baselineDate); }
for (const record of economics.records) if (record.status === 'unavailable') addSource(record.source, 'region-economy-unavailable', record.checkedAt); else addSource(record.nationalSourceObservation.source, 'national-nominal-gdp', record.nationalSourceObservation.referenceDate);
const admin0Source = registry.territories.find(territory => territory.geographicMapping.status === 'unavailable')?.geographicMapping.source;
if (admin0Source) addSource(admin0Source, 'admin0-territory-geometry');
addSource({ name: 'Natural Earth 10m Admin-1 States and Provinces', url: regionRegistry.sourceSnapshot.sourceUrl, datasetId: regionRegistry.sourceSnapshot.snapshotId, retrievedAt: regionRegistry.sourceSnapshot.retrievedAt }, 'admin1-region-geometry');

const sourceInventory = [...datasets.values()].map(item => ({ ...item, referenceDates: [...item.referenceDates].sort(), uses: [...item.uses].sort() })).sort((a, b) => a.datasetId.localeCompare(b.datasetId));
const factFields = Object.keys(facts.countries[0].facts).sort();
const countryRows = [...registry.countries].sort((a, b) => a.id.localeCompare(b.id)).map(country => {
  const regions = regionsByCountry.get(country.id) ?? [], territory = territoryByCountry.get(country.id)?.[0];
  const geometryCounts = { mapped: 0, fallback: 0, unavailable: 0 };
  for (const region of regions) geometryCounts[region.geographyMapping.status === 'fallback_admin0' ? 'fallback' : region.geographyMapping.status] += 1;
  const geometryStatus = geometryCounts.unavailable === regions.length ? 'unavailable' : geometryCounts.mapped === regions.length ? 'available' : 'partial';
  const populationRecords = regions.map(region => populationByRegion.get(region.id)), economicRecords = regions.map(region => economicByRegion.get(region.id));
  const knownPopulation = populationRecords.filter(record => record.status !== 'unavailable'), knownEconomy = economicRecords.filter(record => record.status !== 'unavailable');
  const factRecord = factsByCountry.get(country.id), factAudit = Object.fromEntries(factFields.map(field => {
    const fact = factRecord.facts[field];
    return [field, fact.status === 'available' ? { status: 'available', estimated: fact.isEstimate, referenceDate: fact.referenceDate, datasetId: fact.source.datasetId } : { status: 'unavailable', checkedAt: fact.checkedAt, datasetId: fact.source.datasetId, reason: fact.reason }];
  }));
  const availableFacts = Object.values(factRecord.facts).filter(fact => fact.status === 'available').length;
  const offices = officesByCountry.get(country.id) ?? [], officesApplicable = ['sovereign_state', 'partially_recognized'].includes(country.entityType);
  const availableOffices = offices.filter(item => item.holder.status === 'available').length;
  const officeStatus = !officesApplicable ? 'not_applicable' : availableOffices === offices.length && offices.length > 0 ? 'available' : availableOffices === 0 ? 'unavailable' : 'partial';
  return {
    countryId: country.id, name: country.commonName, entityType: country.entityType,
    identity: { status: 'available', externalIdCount: Object.keys(country.externalIds).length },
    territorialRepresentation: { status: geometryStatus, admin0Geometry: territory.geographicMapping.status === 'mapped' ? 'available' : 'unavailable', regionGeometry: geometryCounts },
    population: { status: knownPopulation.length === regions.length ? 'available' : knownPopulation.length ? 'partial' : 'unavailable', estimated: knownPopulation.length > 0, regionRecords: { total: regions.length, available: knownPopulation.length, derived: knownPopulation.filter(record => record.status === 'derived').length, unavailable: populationRecords.length - knownPopulation.length } },
    nominalEconomicOutput: { status: knownEconomy.length === regions.length ? 'available' : knownEconomy.length ? 'partial' : 'unavailable', estimated: knownEconomy.length > 0, unit: 'USD_PER_YEAR', regionRecords: { total: regions.length, available: knownEconomy.length, derived: knownEconomy.filter(record => record.status === 'derived').length, unavailable: economicRecords.length - knownEconomy.length } },
    nationalFacts: { status: availableFacts === factFields.length ? 'available' : availableFacts ? 'partial' : 'unavailable', availableFields: availableFacts, totalFields: factFields.length, fields: factAudit },
    politicalOffices: { status: officeStatus, availableHolders: availableOffices, unavailableHolders: offices.length - availableOffices, offices: offices.map(item => ({ kind: item.office.kind, status: item.holder.status, referenceDate: item.holder.status === 'available' ? item.holder.referenceDate : undefined, checkedAt: item.holder.status === 'unavailable' ? item.holder.checkedAt : undefined, datasetId: item.holder.source.datasetId })) },
  };
});

const regionRows = [...regionRegistry.regions].sort((a, b) => a.id.localeCompare(b.id)).map(region => {
  const demographic = populationByRegion.get(region.id), economic = economicByRegion.get(region.id), geometry = region.geographyMapping;
  return {
    regionId: region.id, parentCountryId: region.parentCountryId, initialOwnerCountryId: region.initialOwnerCountryId,
    identity: { status: 'available', permanentAssignment: true },
    geometry: geometry.status === 'mapped' ? { status: 'available', sourceStatus: 'mapped', datasetId: geometry.datasetId } : geometry.status === 'fallback_admin0' ? { status: 'partial', sourceStatus: 'fallback_admin0', datasetId: geometry.source.datasetId, reason: geometry.reason } : { status: 'unavailable', sourceStatus: 'unavailable', datasetId: geometry.source.datasetId, reason: geometry.reason },
    population: demographic.status === 'unavailable' ? { status: 'unavailable', checkedAt: demographic.checkedAt, datasetId: demographic.source.datasetId, reason: demographic.reason } : { status: 'available', sourceStatus: demographic.status, estimated: demographic.isEstimate, projected: demographic.isProjection, derived: demographic.isDerived, referenceDates: [...new Set(demographic.sourceObservations.map(item => item.referenceDate))].sort(), baselineDate: demographic.baselineDate },
    nominalEconomicOutput: economic.status === 'unavailable' ? { status: 'unavailable', checkedAt: economic.checkedAt, datasetId: economic.source.datasetId, reason: economic.reason } : { status: 'available', sourceStatus: economic.status, estimated: economic.nationalSourceObservation.isEstimate, modelledRegionalAllocation: true, referenceDate: economic.nationalSourceObservation.referenceDate, baselineDate: economic.baselineDate, unit: economic.unit },
  };
});

const countStatuses = (rows, selector) => rows.reduce((counts, row) => ({ ...counts, [selector(row)]: (counts[selector(row)] ?? 0) + 1 }), {});
const populationKnown = population.records.filter(record => record.status !== 'unavailable').length;
const economyKnown = economics.records.filter(record => record.status !== 'unavailable').length;
const jointRegions = regionRegistry.regions.filter(region => populationByRegion.get(region.id).status !== 'unavailable' && economicByRegion.get(region.id).status !== 'unavailable').length;
const jointCountries = countryRows.filter(country => country.population.status === 'available' && country.nominalEconomicOutput.status === 'available').length;
const entityTypeCounts = Object.fromEntries([...new Set(registry.countries.map(country => country.entityType))].sort().map(type => [type, registry.countries.filter(country => country.entityType === type).length]));
const fieldCoverage = Object.fromEntries(factFields.map(field => {
  const available = facts.countries.filter(record => record.facts[field].status === 'available').length;
  return [field, { available, unavailable: registry.countries.length - available, coveragePercent: percent(available, registry.countries.length) }];
}));

const report = {
  schemaVersion: 1,
  milestone: '0.9',
  scenarioStart,
  generatedFrom: {
    entityRegistrySchema: registry.schemaVersion,
    regionRegistrySchema: regionRegistry.schemaVersion,
    regionGeometrySnapshot: regionRegistry.sourceSnapshot.snapshotId,
    populationSnapshot: populationManifest.snapshotId,
    populationSpatialAuditSha256: populationCoverage.spatialAudit.sha256,
    economicBaselineDate: economics.baselineDate,
  },
  identityFingerprints: { countryIdsSha256: hashIds(countryIds), regionIdsSha256: hashIds(regionIds) },
  summary: {
    countries: registry.countries.length, territories: registry.territories.length, regions: regionRegistry.regions.length,
    entityTypes: entityTypeCounts,
    territoryGeometry: countStatuses(registry.territories, territory => territory.geographicMapping.status === 'mapped' ? 'available' : 'unavailable'),
    regionGeometry: { mapped: regionRegistry.regions.filter(region => region.geographyMapping.status === 'mapped').length, fallback: regionRegistry.regions.filter(region => region.geographyMapping.status === 'fallback_admin0').length, unavailable: regionRegistry.regions.filter(region => region.geographyMapping.status === 'unavailable').length },
    countryRegionGeometry: countStatuses(countryRows, country => country.territorialRepresentation.status),
    population: { regionsAvailable: populationKnown, regionsUnavailable: regionRegistry.regions.length - populationKnown, regionCoveragePercent: percent(populationKnown, regionRegistry.regions.length), countriesAvailable: countryRows.filter(country => country.population.status === 'available').length, countriesUnavailable: countryRows.filter(country => country.population.status === 'unavailable').length, countryCoveragePercent: percent(countryRows.filter(country => country.population.status === 'available').length, countryRows.length), directlyAssignedRegions: populationCoverage.summary.available, spatiallyDerivedRegions: populationCoverage.summary.derived, countriesExactlyNormalized: populationCoverage.summary.countriesExactlyNormalized },
    nominalEconomicOutput: { unit: economics.unit, regionsAvailable: economyKnown, regionsUnavailable: regionRegistry.regions.length - economyKnown, regionCoveragePercent: percent(economyKnown, regionRegistry.regions.length), countriesAvailable: countryRows.filter(country => country.nominalEconomicOutput.status === 'available').length, countriesUnavailable: countryRows.filter(country => country.nominalEconomicOutput.status === 'unavailable').length, countryCoveragePercent: percent(countryRows.filter(country => country.nominalEconomicOutput.status === 'available').length, countryRows.length), directlyAssignedRegions: economicCoverage.summary.available, populationWeightedDerivedRegions: economicCoverage.summary.derived, countriesExactlyNormalized: economicCoverage.summary.countriesExactlyNormalized },
    nationalFacts: fieldCoverage,
    politicalOffices: { applicableCountries: countryRows.filter(country => country.politicalOffices.status !== 'not_applicable').length, availableCountries: countryRows.filter(country => country.politicalOffices.status === 'available').length, partialCountries: countryRows.filter(country => country.politicalOffices.status === 'partial').length, unavailableCountries: countryRows.filter(country => country.politicalOffices.status === 'unavailable').length, notApplicableCountries: countryRows.filter(country => country.politicalOffices.status === 'not_applicable').length, availableHolders: politics.officeholders.filter(holder => holder.status === 'available').length, unavailableHolders: politics.officeholders.filter(holder => holder.status === 'unavailable').length },
    readinessFor010: { regionsWithPopulationAndEconomicOutput: jointRegions, regionCoveragePercent: percent(jointRegions, regionRows.length), countriesWithCompletePopulationAndEconomicOutput: jointCountries, countryCoveragePercent: percent(jointCountries, countryRows.length), regionsWithSourcedIncomeCohorts: 0, regionsWithSourcedPoliticalOrientationCohorts: 0 },
  },
  datasets: sourceInventory,
  anomalies: {
    blocking: [],
    warnings: [
      { code: 'admin1-review-needed', count: admin1Coverage.summary.countriesPotentiallyIncompleteOrAmbiguous, message: 'Countries whose Natural Earth Admin-1 coverage remains potentially incomplete or ambiguous.' },
      { code: 'population-unavailable', count: countryRows.filter(country => country.population.status === 'unavailable').length, message: 'Countries without a complete defensible regional population allocation.' },
      { code: 'economic-output-unavailable', count: countryRows.filter(country => country.nominalEconomicOutput.status === 'unavailable').length, message: 'Countries without a complete regional nominal-output baseline.' },
      { code: 'officeholder-unavailable', count: politics.officeholders.filter(holder => holder.status === 'unavailable').length, message: 'Applicable political offices with an explicitly unavailable holder.' },
    ],
  },
  nextMilestoneDataNeeds: [
    { category: 'income-cohorts', currentInputs: ['Region population where available', 'modelled Region nominal output where available', 'national GDP per capita facts where available'], missing: 'No sourced low/middle/high income distribution exists in the repository.', allowedFutureFallback: 'A documented synthetic initialization may be used only if clearly labelled as modelled, conserves population and income totals, and never masquerades as observed data.' },
    { category: 'political-orientation-cohorts', currentInputs: ['government type', 'political office and officeholder records'], missing: 'No sourced Region-level left/centre/right population distribution exists in the repository.', allowedFutureFallback: 'Keep unavailable until a dated election, survey or explicitly synthetic initialization methodology is reviewed; do not infer shares from the government type or current officeholder.' },
    { category: 'minimal-ai-administration', currentInputs: ['permanent Country/Region identity', 'ownership', 'population and nominal output when available'], missing: `${registry.countries.length - jointCountries} Countries lack either complete regional population or complete regional nominal output.`, allowedFutureFallback: 'Future logic must branch on unavailable data explicitly and may use only documented model inputs.' },
  ],
  countries: countryRows,
  regions: regionRows,
};

if (errors.length) {
  console.error(`ProjectAtlas data audit found ${errors.length} blocking anomalies:\n${errors.map(error => `- ${error}`).join('\n')}`);
  process.exit(1);
}

const markdown = `# ProjectAtlas 0.9 data audit\n\n` +
`Scenario start: **${scenarioStart}**. This date is not assigned to older observations. Source reference dates remain unchanged in the machine-readable report.\n\n` +
`## What ProjectAtlas actually knows\n\n` +
`| Category | Coverage | Meaning |\n|---|---:|---|\n` +
`| Country identity | ${report.summary.countries}/${report.summary.countries} | Permanent registry identities with explicit entity classification |\n` +
`| Region identity | ${report.summary.regions}/${report.summary.regions} | Permanent Region assignments independent from geometry and sovereignty |\n` +
`| Region geometry | ${report.summary.regionGeometry.mapped} mapped, ${report.summary.regionGeometry.fallback} fallback, ${report.summary.regionGeometry.unavailable} unavailable | Natural Earth Admin-1 mappings or explicit documented absence |\n` +
`| Region population | ${report.summary.population.regionsAvailable}/${report.summary.regions} (${report.summary.population.regionCoveragePercent}%) | ${report.summary.population.directlyAssignedRegions} direct and ${report.summary.population.spatiallyDerivedRegions} spatially allocated records |\n` +
`| Region nominal output | ${report.summary.nominalEconomicOutput.regionsAvailable}/${report.summary.regions} (${report.summary.nominalEconomicOutput.regionCoveragePercent}%) | Whole USD/year baseline; regional values are modelled allocations, not observations |\n` +
`| 0.10 joint population/output input | ${report.summary.readinessFor010.regionsWithPopulationAndEconomicOutput}/${report.summary.regions} Regions (${report.summary.readinessFor010.regionCoveragePercent}%) | Both current baseline inputs are available |\n\n` +
`Country types: ${Object.entries(report.summary.entityTypes).map(([type, count]) => `\`${type}\` ${count}`).join(', ')}. Every Country owns one registered Territory and at least one Region.\n\n` +
`Population is complete and exactly normalized for **${report.summary.population.countriesExactlyNormalized} Countries**. It is explicitly unavailable for **${report.summary.population.countriesUnavailable} Countries**. Economic output is complete and exactly normalized for **${report.summary.nominalEconomicOutput.countriesExactlyNormalized} Countries** and unavailable for **${report.summary.nominalEconomicOutput.countriesUnavailable} Countries**. Zero is retained only when it is a valid sourced or allocated value; unavailable records carry no numeric value.\n\n` +
`## National facts\n\n| Field | Available | Unavailable | Coverage |\n|---|---:|---:|---:|\n${Object.entries(report.summary.nationalFacts).map(([field, value]) => `| ${field} | ${value.available} | ${value.unavailable} | ${value.coveragePercent}% |`).join('\n')}\n\n` +
`Political offices apply to ${report.summary.politicalOffices.applicableCountries} sovereign or partially recognized Countries. ${report.summary.politicalOffices.availableHolders}/398 holder records are available; ${report.summary.politicalOffices.unavailableHolders} are explicitly unavailable. The remaining ${report.summary.politicalOffices.notApplicableCountries} entities are marked \`not_applicable\` under the current office model.\n\n` +
`## Provenance and limitations\n\nAll available real-world records retain their dataset ID, retrieval date and actual reference date. Population projections remain marked estimated/projected. Regional economic output remains marked as a modelled allocation from a dated national nominal-GDP observation. Geometry is cartographic source data and does not determine sovereignty.\n\n` +
`Non-blocking limitations:\n${report.anomalies.warnings.map(item => `- **${item.code} (${item.count})** — ${item.message}`).join('\n')}\n\n` +
`The detailed status of every Country and Region is in [\`src/data/data-audit-report.json\`](../src/data/data-audit-report.json). The permanent identity fingerprints are \`${report.identityFingerprints.countryIdsSha256}\` for Countries and \`${report.identityFingerprints.regionIdsSha256}\` for Regions.\n\n` +
`## Deferred to 0.10+\n\nNo income or political-orientation cohort percentages were created. The repository currently contains no sourced low/middle/high income distribution and no Region-level left/centre/right population distribution. Government type and officeholder identity are not substitutes for public political orientation. Future fallbacks must be explicitly modelled, dated, documented and conservation-safe.\n\n` +
`## Corrections in 0.9\n\nNo underlying Country, Region, population, economic, political or geometry data value required correction. Milestone 0.9 adds this deterministic cross-dataset audit and makes existing gaps visible without changing permanent IDs or accepted 0.2–0.8 data decisions.\n`;

if (process.argv.includes('--write')) {
  writeFileSync(outputJson, stableJson(report));
  writeFileSync(outputMarkdown, markdown);
  console.log(`Wrote ${outputJson} and ${outputMarkdown}.`);
} else {
  const stale = [[outputJson, stableJson(report)], [outputMarkdown, markdown]].filter(([path, expected]) => {
    try { return readFileSync(path, 'utf8') !== expected; } catch { return true; }
  }).map(([path]) => path);
  if (stale.length) {
    console.error(`Data audit report is missing or stale: ${stale.join(', ')}. Run npm run data:audit:generate.`);
    process.exit(1);
  }
}

console.log(`Audited ${report.summary.countries} Countries and ${report.summary.regions} Regions with no blocking anomalies.`);
console.log(`Population coverage: ${report.summary.population.regionsAvailable}/${report.summary.regions} Regions (${report.summary.population.regionCoveragePercent}%), ${report.summary.population.countriesAvailable}/${report.summary.countries} Countries (${report.summary.population.countryCoveragePercent}%).`);
console.log(`Economic coverage: ${report.summary.nominalEconomicOutput.regionsAvailable}/${report.summary.regions} Regions (${report.summary.nominalEconomicOutput.regionCoveragePercent}%), ${report.summary.nominalEconomicOutput.countriesAvailable}/${report.summary.countries} Countries (${report.summary.nominalEconomicOutput.countryCoveragePercent}%).`);
