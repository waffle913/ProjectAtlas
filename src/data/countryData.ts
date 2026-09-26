import registryUrl from './entity-registry.json?url';
import factsUrl from './country-facts.json?url';
import officesUrl from './political-offices.json?url';
import mappingUrl from './natural-earth-mapping.json?url';
import type { DataSource, SourceValue } from '../types';
import type { EntityRegistry, DatasetMapping } from './registry';

export interface MissingFact {
  status: 'unavailable';
  reason: string;
  checkedAt: string;
  source: DataSource;
}
export type FactValue = (SourceValue<unknown> & { status: 'available' }) | MissingFact;
export interface CountryFactsRecord { countryId: string; facts: Record<string, FactValue> }
export interface PoliticalOffice {
  id: string;
  countryId: string;
  kind: 'head_of_state' | 'head_of_government';
  title: string;
}
export type Officeholder =
  | { status: 'available'; officeId: string; person: { id: string; name: string }; startDate?: string; endDate?: string; referenceDate: string; source: DataSource }
  | { status: 'unavailable'; officeId: string; reason: string; checkedAt: string; source: DataSource };
export interface PoliticalOfficesData { schemaVersion: number; referenceDate: string; offices: PoliticalOffice[]; officeholders: Officeholder[] }
export interface CountryFactsData { schemaVersion: number; observationsAsOf: string; countries: CountryFactsRecord[] }
export interface LoadedCountryData {
  registry: EntityRegistry;
  facts: CountryFactsData;
  politics: PoliticalOfficesData;
  mapping: DatasetMapping;
  factsByCountryId: Map<string, CountryFactsRecord>;
  officeholdersByCountryId: Map<string, Array<{ office: PoliticalOffice; holder: Officeholder }>>;
}

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
  return ['name', 'url', 'datasetId', 'retrievedAt'].every(
    key => typeof item[key] === 'string' && item[key] !== '',
  ) && validDate(item.retrievedAt);
};

export function validateCountryData(
  registry: EntityRegistry,
  facts: CountryFactsData,
  politics: PoliticalOfficesData,
  mapping: DatasetMapping,
) {
  const errors: string[] = [];
  const countryIds = new Set<string>();
  const codes = {
    isoAlpha2: new Map<string, string>(),
    isoAlpha3: new Map<string, string>(),
    unM49: new Map<string, string>(),
  };

  for (const country of registry.countries) {
    if (!country.id) errors.push('Country is missing a permanent ID.');
    else if (countryIds.has(country.id)) errors.push(`Duplicate country ID: ${country.id}`);
    countryIds.add(country.id);
    if (!country.commonName || !country.entityType) errors.push(`Country profile is incomplete: ${country.id}`);
    if (!['member', 'observer', 'non_member'].includes(country.unMembership)) errors.push(`Invalid UN membership status: ${country.id}`);
    for (const [field, pattern] of [['isoAlpha2', /^[A-Z]{2}$/], ['isoAlpha3', /^[A-Z]{3}$/], ['unM49', /^\d{3}$/]] as const) {
      const value = country.externalIds[field];
      if (!value) continue;
      if (!pattern.test(value)) errors.push(`Malformed ${field}: ${value}`);
      const prior = codes[field].get(value);
      if (prior && prior !== country.id) errors.push(`Duplicate ${field}: ${value}`);
      codes[field].set(value, country.id);
    }
  }
  if (registry.countries.filter(country => country.unMembership === 'member').length !== 193) {
    errors.push('Registry must contain exactly 193 UN member states.');
  }
  for (const country of registry.countries) {
    if (country.sovereignCountryId && !countryIds.has(country.sovereignCountryId)) errors.push(`Broken sovereignty relationship: ${country.id}`);
    if (country.entityType === 'dependency' && !country.sovereignCountryId) errors.push(`Dependency has no sovereign relationship: ${country.id}`);
  }

  const territoryIds = new Set<string>();
  for (const territory of registry.territories) {
    if (!territory.id) errors.push('Territory is missing a permanent ID.');
    if (territoryIds.has(territory.id)) errors.push(`Duplicate territory ID: ${territory.id}`);
    territoryIds.add(territory.id);
    if (!countryIds.has(territory.initialOwnerCountryId)) errors.push(`Territory references unknown country: ${territory.id}`);
    if (territory.geographicMapping.status === 'unavailable' && (
      !territory.geographicMapping.reason
      || !validDate(territory.geographicMapping.checkedAt)
      || !validSource(territory.geographicMapping.source)
    )) errors.push(`Unavailable geography lacks provenance: ${territory.id}`);
  }

  const mappedSources = new Set<string>();
  const mappedTerritories = new Set<string>();
  const territoryById = new Map(registry.territories.map(territory => [territory.id, territory]));
  for (const feature of mapping.features) {
    if (mappedSources.has(feature.sourceId)) errors.push(`Displayed feature maps more than once: ${feature.sourceId}`);
    if (mappedTerritories.has(feature.territoryId)) errors.push(`Multiple displayed features map to one territory: ${feature.territoryId}`);
    mappedSources.add(feature.sourceId);
    mappedTerritories.add(feature.territoryId);
    if (!countryIds.has(feature.countryId)) errors.push(`Map references unknown country: ${feature.sourceId}`);
    if (!territoryIds.has(feature.territoryId)) errors.push(`Map references unknown territory: ${feature.sourceId}`);
    const territory = territoryById.get(feature.territoryId);
    if (territory && territory.initialOwnerCountryId !== feature.countryId) errors.push(`Map ownership disagrees with the registry: ${feature.sourceId}`);
  }
  for (const territory of registry.territories) {
    const isMapped = mappedTerritories.has(territory.id);
    if ((territory.geographicMapping.status === 'mapped') !== isMapped) errors.push(`Territory geographic status disagrees with mapping: ${territory.id}`);
  }

  const requiredFacts = ['population', 'totalAreaKm2', 'landAreaKm2', 'nominalGdpUsd', 'gdpPerCapitaUsd', 'currencies', 'languages', 'governmentType'];
  const factCountries = new Set<string>();
  for (const record of facts.countries) {
    if (!countryIds.has(record.countryId)) errors.push(`Facts reference unknown country: ${record.countryId}`);
    factCountries.add(record.countryId);
    for (const field of requiredFacts) {
      const item = record.facts[field];
      if (!item) errors.push(`Missing explicit fact status: ${record.countryId}.${field}`);
      else if (item.status === 'available') {
        if (!Object.hasOwn(item, 'value') || !validSource(item.source) || !validDate(item.referenceDate) || typeof item.isEstimate !== 'boolean') errors.push(`Fact lacks valid provenance: ${record.countryId}.${field}`);
      } else if (item.status === 'unavailable') {
        if (!item.reason || !validDate(item.checkedAt) || !validSource(item.source)) errors.push(`Unavailable fact lacks provenance: ${record.countryId}.${field}`);
      } else errors.push(`Invalid fact status: ${record.countryId}.${field}`);
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
    const kinds = officeKinds.get(office.countryId) ?? new Set<string>();
    kinds.add(office.kind);
    officeKinds.set(office.countryId, kinds);
  }
  const heldOfficeIds = new Set<string>();
  for (const holder of politics.officeholders) {
    if (!officeIds.has(holder.officeId)) errors.push(`Officeholder references unknown office: ${holder.officeId}`);
    heldOfficeIds.add(holder.officeId);
    if (holder.status === 'available') {
      if (!holder.person?.id || !holder.person?.name || !validDate(holder.referenceDate)
        || (holder.startDate && !validDate(holder.startDate))
        || (holder.endDate && !validDate(holder.endDate))
        || (holder.startDate && holder.startDate > holder.referenceDate)
        || (holder.endDate && holder.endDate < holder.referenceDate)
        || !validSource(holder.source)) errors.push(`Malformed officeholder: ${holder.officeId}`);
    } else if (holder.status === 'unavailable') {
      if (!holder.reason || !validDate(holder.checkedAt) || !validSource(holder.source)) errors.push(`Unavailable officeholder lacks provenance: ${holder.officeId}`);
    } else errors.push(`Invalid officeholder status: ${(holder as { officeId?: string }).officeId}`);
  }
  for (const office of politics.offices) if (!heldOfficeIds.has(office.id)) errors.push(`Political office has no holder status: ${office.id}`);
  for (const country of registry.countries.filter(item => ['sovereign_state', 'partially_recognized'].includes(item.entityType))) {
    const kinds = officeKinds.get(country.id);
    if (!kinds?.has('head_of_state') || !kinds.has('head_of_government')) errors.push(`Country is missing required political offices: ${country.id}`);
  }

  if (errors.length) throw new Error(errors.join('\n'));
  return true;
}

export function indexCountryData(
  registry: EntityRegistry,
  facts: CountryFactsData,
  politics: PoliticalOfficesData,
  mapping: DatasetMapping,
): LoadedCountryData {
  validateCountryData(registry, facts, politics, mapping);
  const factsByCountryId = new Map(facts.countries.map(record => [record.countryId, record]));
  const officeById = new Map(politics.offices.map(office => [office.id, office]));
  const officeholdersByCountryId = new Map<string, Array<{ office: PoliticalOffice; holder: Officeholder }>>();
  for (const holder of politics.officeholders) {
    const office = officeById.get(holder.officeId)!;
    const records = officeholdersByCountryId.get(office.countryId) ?? [];
    records.push({ office, holder });
    officeholdersByCountryId.set(office.countryId, records);
  }
  return { registry, facts, politics, mapping, factsByCountryId, officeholdersByCountryId };
}

export async function loadCountryData() {
  const responses = await Promise.all([registryUrl, factsUrl, officesUrl, mappingUrl].map(url => fetch(url)));
  if (responses.some(response => !response.ok)) throw new Error('One or more local country-data assets are unavailable.');
  const [registry, facts, politics, mapping] = await Promise.all(responses.map(response => response.json()));
  return indexCountryData(registry, facts, politics, mapping);
}
