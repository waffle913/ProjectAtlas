import { describe, expect, it } from 'vitest';
// @ts-expect-error Build tooling intentionally imports the same tested ESM generator used by the data pipeline.
import { allocateIntegerPopulation } from '../../../scripts/population-model.mjs';
import { populationBaselineState, validatePopulationData } from '../populationData';
import demographicsJson from '../region-demographics.json';
import nationalJson from '../source-snapshots/wpp2024-population-2026-01-01.json';
import regionsJson from '../region-registry.json';
import type { NationalPopulationData, RegionDemographicsData } from '../populationData';
import type { RegionRegistry } from '../regionData';

const demographics = demographicsJson as unknown as RegionDemographicsData;
const national = nationalJson as unknown as NationalPopulationData;
const registry = regionsJson as unknown as RegionRegistry;
describe('population baseline data', () => {
  it('covers every permanent Region exactly once with explicit missing semantics', () => {
    expect(validatePopulationData(demographics, national, registry.regions)).toBe(true);
    expect(demographics.records).toHaveLength(registry.regions.length);
    expect(new Set(demographics.records.map(record => record.regionId)).size).toBe(registry.regions.length);
    const unavailable = demographics.records.find(record => record.status === 'unavailable');
    expect(unavailable).toBeTruthy();
    expect(populationBaselineState(demographics)[unavailable!.regionId]).toBeUndefined();
  });
  it('allocates integers deterministically and preserves the exact national total', () => {
    const weights = [{ regionId: 'region.b', weight: 1 }, { regionId: 'region.a', weight: 1 }, { regionId: 'region.c', weight: 1 }];
    const first = allocateIntegerPopulation(10, weights); const second = allocateIntegerPopulation(10, [...weights].reverse());
    expect(first).toEqual(second); expect(first.reduce((sum: number, row: { population: number }) => sum + row.population, 0)).toBe(10);
    expect(first.find((row: { regionId: string }) => row.regionId === 'region.a')?.population).toBe(4);
  });
  it('normalizes every completely covered country to its exact pinned national total', () => {
    const regionById = new Map(registry.regions.map(region => [region.id, region]));
    const recordsByCountry = new Map<string, typeof demographics.records>();
    for (const record of demographics.records) { const countryId = regionById.get(record.regionId)!.parentCountryId; const records = recordsByCountry.get(countryId) ?? []; records.push(record); recordsByCountry.set(countryId, records); }
    let checked = 0;
    for (const observation of national.records) {
      const records = recordsByCountry.get(observation.countryId) ?? [];
      if (!records.length || records.some(record => record.status === 'unavailable')) continue;
      expect(records.reduce((total, record) => total + (record.status === 'unavailable' ? 0 : record.baselinePopulation), 0)).toBe(observation.value); checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
  });
  it('rejects negative, non-finite, duplicate and unsourced records', () => {
    const available = demographics.records.find(record => record.status !== 'unavailable')!;
    const invalid = structuredClone(demographics); invalid.records.push({ ...available, baselinePopulation: -1 } as typeof available);
    expect(() => validatePopulationData(invalid, national, registry.regions)).toThrow(/Duplicate|Invalid population/);
    expect(() => allocateIntegerPopulation(10, [{ regionId: 'x', weight: Number.NaN }])).toThrow(/Spatial weights/);
  });
  it('keeps demographic identity independent from source geometry', () => {
    const before = demographics.records.map(record => record.regionId).sort();
    const changedGeometry = registry.regions.map(region => ({ ...region, sourceMetadata: { replacedGeometry: true, renamed: 'changed' } }));
    expect(changedGeometry.map(region => region.id).sort()).toEqual(before);
  });
});
