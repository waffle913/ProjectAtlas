import { describe, expect, it } from 'vitest';
// @ts-expect-error Executable ESM generator shared with the offline data pipeline.
import { allocateEconomicOutput, buildEconomicArtifacts } from '../../../scripts/economic-model.mjs';
import { economicBaselineState, validateEconomicData, type EconomicBaselinesData } from '../economicData';
import economicJson from '../region-economic-baselines.json';
import regionsJson from '../region-registry.json';
import type { RegionRegistry } from '../regionData';
import type { RegionEntity } from '../../types';

const economics = economicJson as unknown as EconomicBaselinesData, registry = regionsJson as unknown as RegionRegistry;
describe('regional economic baseline', () => {
  it.each(['2026-02-30', '2026-13-01', '2026-01-01T00:00:00Z'])('rejects impossible or non-day economic dates while preserving year-only observations: %s', date => {
    const invalid = structuredClone(economics), record = invalid.records.find(item => item.status !== 'unavailable')!;
    record.nationalSourceObservation.referenceDate = date;
    expect(() => validateEconomicData(invalid, registry.regions)).toThrow(/lacks provenance/);
    record.nationalSourceObservation.referenceDate = '2025';
    expect(validateEconomicData(invalid, registry.regions)).toBe(true);
    record.baselineDate = date;
    expect(() => validateEconomicData(invalid, registry.regions)).toThrow(/lacks methodology/);
  });
  it('requires day precision for baseline and retrieval dates, not for national GDP reference years', () => {
    const invalid = structuredClone(economics);
    invalid.baselineDate = '2026';
    expect(() => validateEconomicData(invalid, registry.regions)).toThrow(/baseline schema/);
    invalid.baselineDate = economics.baselineDate;
    invalid.records.find(item => item.status !== 'unavailable')!.nationalSourceObservation.source.retrievedAt = '2026';
    expect(() => validateEconomicData(invalid, registry.regions)).toThrow(/lacks provenance/);
  });
  it('covers every permanent Region once and never converts unavailable to zero', () => {
    expect(validateEconomicData(economics, registry.regions)).toBe(true);
    expect(economics.records).toHaveLength(registry.regions.length); expect(new Set(economics.records.map(record => record.regionId)).size).toBe(registry.regions.length);
    const unavailable = economics.records.find(record => record.status === 'unavailable')!;
    expect(economicBaselineState(economics)[unavailable.regionId]).toBeUndefined(); expect(unavailable).not.toHaveProperty('baselineAnnualOutputUsd');
    const falseZero = structuredClone(economics);
    Object.assign(falseZero.records.find(record => record.status === 'unavailable')!, { baselineAnnualOutputUsd: 0 });
    expect(() => validateEconomicData(falseZero, registry.regions)).toThrow(/Unavailable economic record is malformed/);
  });
  it('allocates deterministically with stable-ID ties and preserves exact whole USD', () => {
    const weights = [{ regionId: 'region.b', populationWeight: 1 }, { regionId: 'region.a', populationWeight: 1 }, { regionId: 'region.c', populationWeight: 1 }];
    const first = allocateEconomicOutput(10, weights), second = allocateEconomicOutput(10, [...weights].reverse());
    expect(first).toEqual(second); expect(first.reduce((sum: number, item: {output:number}) => sum + item.output, 0)).toBe(10); expect(first.find((item:{regionId:string}) => item.regionId === 'region.a').output).toBe(4);
  });
  it('preserves each allocated national GDP total exactly', () => {
    const byCountry = new Map<string, typeof economics.records>();
    for (const record of economics.records) { const list = byCountry.get(record.parentCountryId) ?? []; list.push(record); byCountry.set(record.parentCountryId, list); }
    let checked = 0;
    for (const records of byCountry.values()) { if (records.some(record => record.status === 'unavailable')) continue; const allocated = records.filter(record => record.status !== 'unavailable'); expect(allocated.reduce((sum, record) => sum + record.baselineAnnualOutputUsd, 0)).toBe(allocated[0].nationalAllocationTotalUsd); checked += 1; }
    expect(checked).toBeGreaterThan(50);
  });
  it('keeps every Region unavailable when multi-Region population coverage is incomplete', () => {
    const source = { name: 'World Bank', url: 'https://api.worldbank.org/', datasetId: 'test', retrievedAt: '2026-01-01' };
    const result = buildEconomicArtifacts({ countries: [{ id: 'country.a' }], regions: [{ id: 'region.a', parentCountryId: 'country.a' }, { id: 'region.b', parentCountryId: 'country.a' }], countryFacts: [{ countryId: 'country.a', facts: { nominalGdpUsd: { status: 'available', value: 100, source, referenceDate: '2024', isEstimate: false } } }], demographics: [{ regionId: 'region.a', status: 'available', baselinePopulation: 10 }, { regionId: 'region.b', status: 'unavailable' }] });
    expect(result.baselines.records.every((record: {status:string}) => record.status === 'unavailable')).toBe(true);
  });
  it('rejects malformed and duplicate records and keeps identity independent from geometry', () => {
    const available = economics.records.find(record => record.status !== 'unavailable')!;
    const duplicate = structuredClone(economics); duplicate.records.push(structuredClone(available));
    expect(() => validateEconomicData(duplicate, registry.regions)).toThrow(/Duplicate economic record/);
    const invalid = structuredClone(economics), invalidRecord = invalid.records.find(record => record.status !== 'unavailable')!;
    invalidRecord.baselineAnnualOutputUsd = -1;
    expect(() => validateEconomicData(invalid, registry.regions)).toThrow(/Invalid economic output/);
    const malformedSource = structuredClone(economics), sourceRecord = malformedSource.records.find(record => record.status !== 'unavailable')!;
    sourceRecord.nationalSourceObservation.source.datasetId = '';
    expect(() => validateEconomicData(malformedSource, registry.regions)).toThrow(/lacks provenance/);
    const replacementGeometryRegions: RegionEntity[] = registry.regions.map(region => ({ ...region, commonName: `Renamed ${region.id}`, geographyMapping: { status: 'mapped', datasetId: 'replacement-admin1-v2', sourceFeatureIds: [`replacement:${region.id}`] } }));
    expect(() => validateEconomicData(economics, replacementGeometryRegions)).not.toThrow();
    expect(economics.records.map(record => record.regionId).sort()).toEqual(replacementGeometryRegions.map(region => region.id).sort());
  });
});
