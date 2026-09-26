import registryJson from './entity-registry.json';
import factsJson from './country-facts.json';
import officesJson from './political-offices.json';
import mappingJson from './natural-earth-mapping.json';
import type { DataSource, SourceValue } from '../types';
import type { EntityRegistry, DatasetMapping } from './registry';

export interface CountryFactsRecord {
  countryId: string;
  facts: Record<string, SourceValue<unknown>>;
}
export interface PoliticalOffice { id: string; countryId: string; kind: 'head_of_state' | 'head_of_government'; title: string }
export interface Officeholder {
  officeId: string; person: { id: string; name: string }; startDate?: string; endDate?: string;
  referenceDate: string; source: DataSource;
}
export interface PoliticalOfficesData { schemaVersion: number; referenceDate: string; offices: PoliticalOffice[]; officeholders: Officeholder[] }
export interface CountryFactsData { schemaVersion: number; observationsAsOf: string; countries: CountryFactsRecord[] }

export const countryRegistry = registryJson as EntityRegistry;
export const countryFacts = factsJson as CountryFactsData;
export const politicalOffices = officesJson as PoliticalOfficesData;
export const naturalEarthDatasetMapping = mappingJson as DatasetMapping;

const validDate = (value: unknown) => {
  if (typeof value !== 'string') return false;
  if (/^\d{4}$/.test(value)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};
const validSource = (source: unknown): source is DataSource => {
  if (!source || typeof source !== 'object') return false;
  const item = source as Record<string, unknown>;
  return ['name','url','datasetId','retrievedAt'].every(key => typeof item[key] === 'string' && item[key] !== '') && validDate(item.retrievedAt);
};

export function validateCountryData(
  registry: EntityRegistry = countryRegistry,
  facts: CountryFactsData = countryFacts,
  politics: PoliticalOfficesData = politicalOffices,
  mapping: DatasetMapping = naturalEarthDatasetMapping,
) {
  const errors: string[] = [];
  const countryIds = new Set<string>();
  const codes = { isoAlpha2: new Map<string,string>(), isoAlpha3: new Map<string,string>(), unM49: new Map<string,string>() };
  for (const country of registry.countries) {
    if (!country.id) errors.push('Country is missing a permanent ID.');
    else if (countryIds.has(country.id)) errors.push(`Duplicate country ID: ${country.id}`);
    countryIds.add(country.id);
    if (!country.commonName || !country.entityType) errors.push(`Country profile is incomplete: ${country.id}`);
    for (const [field, pattern] of [['isoAlpha2',/^[A-Z]{2}$/],['isoAlpha3',/^[A-Z]{3}$/],['unM49',/^\d{3}$/]] as const) {
      const value = country.externalIds[field];
      if (!value) continue;
      if (!pattern.test(value)) errors.push(`Malformed ${field}: ${value}`);
      const prior = codes[field].get(value);
      if (prior && prior !== country.id) errors.push(`Duplicate ${field}: ${value}`);
      codes[field].set(value, country.id);
    }
  }
  for (const country of registry.countries) {
    if (country.sovereignCountryId && !countryIds.has(country.sovereignCountryId)) errors.push(`Broken sovereignty relationship: ${country.id}`);
    if (country.entityType === 'dependency' && !country.sovereignCountryId) errors.push(`Dependency has no sovereign relationship: ${country.id}`);
  }
  const territoryIds = new Set(registry.territories.map(territory => territory.id));
  for (const territory of registry.territories) {
    if (!territory.id) errors.push('Territory is missing a permanent ID.');
    if (!countryIds.has(territory.initialOwnerCountryId)) errors.push(`Territory references unknown country: ${territory.id}`);
  }
  for (const feature of mapping.features) {
    if (!countryIds.has(feature.countryId)) errors.push(`Map references unknown country: ${feature.sourceId}`);
    if (!territoryIds.has(feature.territoryId)) errors.push(`Map references unknown territory: ${feature.sourceId}`);
  }
  const factCountries = new Set<string>();
  for (const record of facts.countries) {
    if (!countryIds.has(record.countryId)) errors.push(`Facts reference unknown country: ${record.countryId}`);
    factCountries.add(record.countryId);
    for (const [field, observation] of Object.entries(record.facts)) {
      if (!observation || !Object.hasOwn(observation, 'value') || !validSource(observation.source) || !validDate(observation.referenceDate) || typeof observation.isEstimate !== 'boolean') errors.push(`Fact lacks valid provenance: ${record.countryId}.${field}`);
    }
  }
  for (const id of countryIds) if (!factCountries.has(id)) errors.push(`Missing country facts record: ${id}`);
  const officeIds = new Set<string>();
  const officeKinds = new Map<string, Set<string>>();
  for (const office of politics.offices) {
    if (!office.id) errors.push('Political office is missing an ID.');
    if (!countryIds.has(office.countryId)) errors.push(`Office references unknown country: ${office.id}`);
    if (officeIds.has(office.id)) errors.push(`Duplicate political office: ${office.id}`);
    officeIds.add(office.id);
    const kinds = officeKinds.get(office.countryId) ?? new Set<string>(); kinds.add(office.kind); officeKinds.set(office.countryId, kinds);
  }
  const heldOfficeIds = new Set<string>();
  for (const holder of politics.officeholders) {
    if (!officeIds.has(holder.officeId)) errors.push(`Officeholder references unknown office: ${holder.officeId}`);
    heldOfficeIds.add(holder.officeId);
    if (!holder.person?.id || !holder.person?.name || !validDate(holder.referenceDate) || (holder.startDate && !validDate(holder.startDate)) || (holder.endDate && !validDate(holder.endDate)) || (holder.startDate && holder.startDate > holder.referenceDate) || (holder.endDate && holder.endDate < holder.referenceDate) || !validSource(holder.source)) errors.push(`Malformed officeholder: ${holder.officeId}`);
  }
  for (const office of politics.offices) if (!heldOfficeIds.has(office.id)) errors.push(`Political office has no holder at ${politics.referenceDate}: ${office.id}`);
  for (const country of registry.countries.filter(item => ['sovereign_state','partially_recognized'].includes(item.entityType))) {
    const kinds = officeKinds.get(country.id);
    if (!kinds?.has('head_of_state') || !kinds.has('head_of_government')) errors.push(`Country is missing required political offices: ${country.id}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return true;
}

validateCountryData();
export const countryFactsById = new Map(countryFacts.countries.map(record => [record.countryId, record]));
const officeById = new Map(politicalOffices.offices.map(office => [office.id, office]));
export const officeholdersByCountryId = new Map<string, Array<{ office: PoliticalOffice; holder: Officeholder }>>();
for (const holder of politicalOffices.officeholders) {
  const office = officeById.get(holder.officeId)!;
  const records = officeholdersByCountryId.get(office.countryId) ?? [];
  records.push({ office, holder }); officeholdersByCountryId.set(office.countryId, records);
}
