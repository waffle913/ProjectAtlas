import baselinesUrl from './region-economic-baselines.json?url';
import coverageUrl from './economic-coverage-report.json?url';
import type { DataSource, RegionEntity } from '../types';
import type { FactValue } from './countryData';

export type EconomicBaselineRecord =
  | { regionId: string; parentCountryId: string; status: 'available' | 'derived'; baselineAnnualOutputUsd: number; unit: 'USD_PER_YEAR'; baselineDate: string; nationalSourceObservation: FactValue & { status: 'available'; value: number }; nationalAllocationTotalUsd: number; allocationWeight: { kind: 'single_region_direct' | 'region_baseline_population'; numerator: number; denominator: number }; allocationMethod: string; isObservedRegionalValue: false; isDerived: boolean; provenance: { generator: string; countryFactsDataset: string; demographicDataset: string }; limitationNote: string }
  | { regionId: string; parentCountryId: string; status: 'unavailable'; reason: string; checkedAt: string; source: DataSource };
export interface EconomicBaselinesData { schemaVersion: number; baselineDate: string; unit: 'USD_PER_YEAR'; records: EconomicBaselineRecord[] }
export interface EconomicCoverageReport { schemaVersion: number; baselineDate: string; summary: Record<string, number>; countries: unknown[] }
export interface LoadedEconomicData { baselines: EconomicBaselinesData; coverage: EconomicCoverageReport; byRegionId: Map<string, EconomicBaselineRecord> }

const validDate = (value: string) => { if (!/^\d{4}(?:-\d{2}-\d{2})?$/.test(value)) return false; if (/^\d{4}$/.test(value)) return true; const parsed = new Date(`${value}T00:00:00Z`); return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value; };
const validSource = (source: DataSource) => { try { const url = new URL(source?.url); return Boolean(source.name && source.datasetId && validDate(source.retrievedAt) && ['http:', 'https:'].includes(url.protocol)); } catch { return false; } };
export function validateEconomicData(data: EconomicBaselinesData, regions: RegionEntity[]) {
  const errors: string[] = [], regionById = new Map(regions.map(region => [region.id, region])), seen = new Set<string>(), recordsByCountry = new Map<string, EconomicBaselineRecord[]>();
  if (data.schemaVersion !== 1 || data.unit !== 'USD_PER_YEAR' || !validDate(data.baselineDate)) errors.push('Unsupported or malformed economic baseline schema.');
  for (const record of data.records) {
    const region = regionById.get(record.regionId); if (!region) errors.push(`Economic record references unknown Region: ${record.regionId}`);
    if (seen.has(record.regionId)) errors.push(`Duplicate economic record: ${record.regionId}`); seen.add(record.regionId);
    if (region && (record.parentCountryId !== region.parentCountryId)) errors.push(`Economic record uses wrong parent country: ${record.regionId}`);
    const countryRecords = recordsByCountry.get(record.parentCountryId) ?? []; countryRecords.push(record); recordsByCountry.set(record.parentCountryId, countryRecords);
    if (record.status === 'unavailable') { if (!record.reason || !validDate(record.checkedAt) || !validSource(record.source) || Object.hasOwn(record, 'baselineAnnualOutputUsd')) errors.push(`Unavailable economic record is malformed: ${record.regionId}`); continue; }
    if (!Number.isSafeInteger(record.baselineAnnualOutputUsd) || record.baselineAnnualOutputUsd < 0 || !Number.isSafeInteger(record.nationalAllocationTotalUsd) || record.nationalAllocationTotalUsd < 0) errors.push(`Invalid economic output: ${record.regionId}`);
    if (record.unit !== 'USD_PER_YEAR' || !validDate(record.baselineDate) || !record.allocationMethod || !record.limitationNote || !record.provenance?.generator) errors.push(`Economic baseline lacks methodology: ${record.regionId}`);
    const weight = record.allocationWeight; if (!weight || !Number.isSafeInteger(weight.numerator) || weight.numerator < 0 || !Number.isSafeInteger(weight.denominator) || weight.denominator <= 0) errors.push(`Invalid economic allocation weight: ${record.regionId}`);
    const source = record.nationalSourceObservation; if (!source || source.status !== 'available' || typeof source.value !== 'number' || !Number.isFinite(source.value) || source.value < 0 || !validDate(source.referenceDate) || typeof source.isEstimate !== 'boolean' || !validSource(source.source)) errors.push(`Economic source observation lacks provenance: ${record.regionId}`);
    else if (Math.round(source.value) !== record.nationalAllocationTotalUsd) errors.push(`Economic allocation does not match its national source observation: ${record.regionId}`);
  }
  for (const region of regions) if (!seen.has(region.id)) errors.push(`Region lacks explicit economic status: ${region.id}`);
  for (const [countryId, records] of recordsByCountry) {
    const allocated = records.filter(record => record.status !== 'unavailable'); if (!allocated.length) continue;
    if (allocated.length !== records.length) errors.push(`Country has partial economic allocation: ${countryId}`);
    const total = allocated.reduce((sum, record) => sum + record.baselineAnnualOutputUsd, 0), expected = allocated[0].nationalAllocationTotalUsd;
    if (!Number.isSafeInteger(total) || total !== expected || allocated.some(record => record.nationalAllocationTotalUsd !== expected)) errors.push(`Economic allocation does not equal national total: ${countryId}`);
  }
  if (errors.length) throw new Error(errors.join('\n')); return true;
}
export function indexEconomicData(baselines: EconomicBaselinesData, coverage: EconomicCoverageReport, regions: RegionEntity[]): LoadedEconomicData { validateEconomicData(baselines, regions); return { baselines, coverage, byRegionId: new Map(baselines.records.map(record => [record.regionId, record])) }; }
export function economicBaselineState(data: EconomicBaselinesData) { return Object.fromEntries(data.records.map(record => [record.regionId, record.status === 'unavailable' ? undefined : record.baselineAnnualOutputUsd])); }
export async function loadEconomicData(regions: RegionEntity[]) { const responses = await Promise.all([baselinesUrl, coverageUrl].map(url => fetch(url))); if (responses.some(response => !response.ok)) throw new Error('One or more local economic data assets are unavailable.'); const [baselines, coverage] = await Promise.all(responses.map(response => response.json())); return indexEconomicData(baselines, coverage, regions); }
