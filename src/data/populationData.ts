import demographicsUrl from './region-demographics.json?url';
import nationalUrl from './source-snapshots/wpp2024-population-2026-01-01.json?url';
import coverageUrl from './population-coverage-report.json?url';
import type { DataSource, RegionEntity } from '../types';

export interface PopulationObservation { countryId: string; value: number; referenceDate: string; isEstimate: boolean; isProjection: boolean; source: DataSource }
export type RegionDemographicRecord =
  | { regionId: string; status: 'available' | 'derived'; baselinePopulation: number; baselineDate: string; sourceObservations: PopulationObservation[]; spatialWeightSource: DataSource; spatialWeight: number; allocationMethod: string; isEstimate: boolean; isProjection: boolean; isDerived: boolean; provenance: { generatedFrom: string; generator: string }; limitationNote?: string }
  | { regionId: string; status: 'unavailable'; reason: string; checkedAt: string; source: DataSource };
export interface RegionDemographicsData { schemaVersion: number; baselineDate: string; records: RegionDemographicRecord[] }
export interface NationalPopulationData { schemaVersion: number; sourceSnapshot: string; records: PopulationObservation[] }
export interface PopulationCoverageReport { schemaVersion: number; generatedFrom: string; summary: Record<string, number>; countries: unknown[] }
export interface LoadedPopulationData { demographics: RegionDemographicsData; national: NationalPopulationData; coverage: PopulationCoverageReport; byRegionId: Map<string, RegionDemographicRecord>; nationalByCountryId: Map<string, PopulationObservation> }

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const validSource = (source: DataSource) => Boolean(source?.name && source.url && source.datasetId && validDate(source.retrievedAt));
export function validatePopulationData(data: RegionDemographicsData, national: NationalPopulationData, regions: RegionEntity[]) {
  const errors: string[] = []; const known = new Set(regions.map(region => region.id)); const seen = new Set<string>();
  if (data.schemaVersion !== 1 || national.schemaVersion !== 1 || !validDate(data.baselineDate)) errors.push('Unsupported or malformed population data schema.');
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
export function indexPopulationData(demographics: RegionDemographicsData, national: NationalPopulationData, coverage: PopulationCoverageReport, regions: RegionEntity[]): LoadedPopulationData {
  validatePopulationData(demographics, national, regions);
  return { demographics, national, coverage, byRegionId: new Map(demographics.records.map(record => [record.regionId, record])), nationalByCountryId: new Map(national.records.map(record => [record.countryId, record])) };
}
export function populationBaselineState(data: RegionDemographicsData) {
  return Object.fromEntries(data.records.map(record => [record.regionId, record.status === 'unavailable' ? undefined : record.baselinePopulation]));
}
export async function loadPopulationData(regions: RegionEntity[]) {
  const responses = await Promise.all([demographicsUrl, nationalUrl, coverageUrl].map(url => fetch(url)));
  if (responses.some(response => !response.ok)) throw new Error('One or more local population data assets are unavailable.');
  const [demographics, national, coverage] = await Promise.all(responses.map(response => response.json()));
  return indexPopulationData(demographics, national, coverage, regions);
}
