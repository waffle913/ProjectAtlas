import demographicsUrl from './region-demographics.json?url';
import nationalUrl from './source-snapshots/wpp2024-population-2026-01-01.json?url';
import coverageUrl from './population-coverage-report.json?url';
import type { DataSource, RegionEntity } from '../types';
import { isSimulationDate as validDate } from '../simulation/date';

export interface PopulationObservation { countryId: string; value: number; referenceDate: string; isEstimate: boolean; isProjection: boolean; source: DataSource }
export type RegionDemographicRecord =
  | { regionId: string; status: 'available' | 'derived'; baselinePopulation: number; baselineDate: string; sourceObservations: PopulationObservation[]; spatialWeightSource: DataSource; spatialWeight: number; allocationMethod: string; isEstimate: boolean; isProjection: boolean; isDerived: boolean; provenance: { generatedFrom: string; generator: string }; limitationNote?: string }
  | { regionId: string; status: 'unavailable'; reason: string; checkedAt: string; source: DataSource };
export interface RegionDemographicsData { schemaVersion: number; baselineDate: string; records: RegionDemographicRecord[] }
export interface NationalPopulationData { schemaVersion: number; sourceSnapshot: string; records: PopulationObservation[] }
export interface PopulationCoverageReport { schemaVersion: number; generatedFrom: string; summary: Record<string, number>; countries: unknown[] }
export interface LoadedPopulationData { demographics: RegionDemographicsData; national: NationalPopulationData; coverage: PopulationCoverageReport; byRegionId: Map<string, RegionDemographicRecord>; nationalByCountryId: Map<string, PopulationObservation> }

const validSource = (source: DataSource) => { try { const url = new URL(source?.url); return Boolean(source.name && source.datasetId && validDate(source.retrievedAt) && ['http:', 'https:'].includes(url.protocol)); } catch { return false; } };
export function validateNationalPopulationData(national: NationalPopulationData, knownCountryIds: Set<string>) {
  const errors: string[] = []; const seen = new Set<string>();
  if (national.schemaVersion !== 1 || !national.sourceSnapshot) errors.push('Unsupported or malformed national population schema.');
  for (const observation of national.records) {
    if (!observation.countryId || seen.has(observation.countryId)) errors.push(`Duplicate or missing national population countryId: ${observation.countryId}`);
    seen.add(observation.countryId);
    if (!knownCountryIds.has(observation.countryId)) errors.push(`National population references unknown country: ${observation.countryId}`);
    if (!Number.isSafeInteger(observation.value) || observation.value < 0) errors.push(`Invalid national population value: ${observation.countryId}`);
    if (!validDate(observation.referenceDate)) errors.push(`Malformed national population date: ${observation.countryId}`);
    if (typeof observation.isEstimate !== 'boolean' || typeof observation.isProjection !== 'boolean' || !validSource(observation.source)) errors.push(`National population lacks valid provenance: ${observation.countryId}`);
  }
  if (errors.length) throw new Error(errors.join('\n')); return true;
}
export function validatePopulationData(data: RegionDemographicsData, national: NationalPopulationData, regions: RegionEntity[], knownCountryIds = new Set(regions.map(region => region.parentCountryId))) {
  const errors: string[] = []; const known = new Set(regions.map(region => region.id)); const seen = new Set<string>();
  if (data.schemaVersion !== 1 || national.schemaVersion !== 1 || !validDate(data.baselineDate)) errors.push('Unsupported or malformed population data schema.');
  try { validateNationalPopulationData(national, knownCountryIds); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  for (const record of data.records) {
    if (!known.has(record.regionId)) errors.push(`Demographic record references unknown Region: ${record.regionId}`);
    if (seen.has(record.regionId)) errors.push(`Duplicate demographic record: ${record.regionId}`); seen.add(record.regionId);
    if (record.status === 'unavailable') { if (!record.reason || !validDate(record.checkedAt) || !validSource(record.source)) errors.push(`Unavailable population lacks provenance: ${record.regionId}`); continue; }
    if (!Number.isSafeInteger(record.baselinePopulation) || record.baselinePopulation < 0) errors.push(`Invalid population value: ${record.regionId}`);
    if (!validDate(record.baselineDate) || !record.sourceObservations.length || !validSource(record.spatialWeightSource) || !record.allocationMethod || !record.provenance?.generatedFrom) errors.push(`Population baseline lacks provenance: ${record.regionId}`);
    if (!Number.isFinite(record.spatialWeight) || record.spatialWeight < 0) errors.push(`Invalid spatial weight: ${record.regionId}`);
    for (const observation of record.sourceObservations) if (!Number.isSafeInteger(observation.value) || observation.value < 0 || !validDate(observation.referenceDate) || !validSource(observation.source)) errors.push(`Invalid source observation: ${record.regionId}`);
  }
  for (const region of regions) if (!seen.has(region.id)) errors.push(`Region lacks explicit demographic status: ${region.id}`);
  if (errors.length) throw new Error(errors.join('\n')); return true;
}
export function indexPopulationData(demographics: RegionDemographicsData, national: NationalPopulationData, coverage: PopulationCoverageReport, regions: RegionEntity[], countryIds?: Set<string>): LoadedPopulationData {
  validatePopulationData(demographics, national, regions, countryIds);
  return { demographics, national, coverage, byRegionId: new Map(demographics.records.map(record => [record.regionId, record])), nationalByCountryId: new Map(national.records.map(record => [record.countryId, record])) };
}
export function populationBaselineState(data: RegionDemographicsData) {
  return Object.fromEntries(data.records.map(record => [record.regionId, record.status === 'unavailable' ? undefined : record.baselinePopulation]));
}
export async function loadPopulationData(regions: RegionEntity[], countryIds?: Set<string>) {
  const responses = await Promise.all([demographicsUrl, nationalUrl, coverageUrl].map(url => fetch(url)));
  if (responses.some(response => !response.ok)) throw new Error('One or more local population data assets are unavailable.');
  const [demographics, national, coverage] = await Promise.all(responses.map(response => response.json()));
  return indexPopulationData(demographics, national, coverage, regions, countryIds);
}
