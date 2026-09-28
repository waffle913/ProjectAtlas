/// <reference types="node" />
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import entityRegistryJson from '../../data/entity-registry.json';
import regionRegistryJson from '../../data/region-registry.json';
import demographicsJson from '../../data/region-demographics.json';
import economicsJson from '../../data/region-economic-baselines.json';
import { SimulationScheduler } from '../scheduler';
import { createEngineState } from '../state';

const regions = regionRegistryJson.regions as unknown as RegionEntity[];
const countryIds = entityRegistryJson.countries.map(country => country.id);
const demographicByRegion = new Map(demographicsJson.records.map(record => [record.regionId, record]));
const economicByRegion = new Map(economicsJson.records.map(record => [record.regionId, record]));
const worldState = (): SimulationState => ({
  schemaVersion: 7, date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {},
  regionOwnership: Object.fromEntries(regions.map(region => [region.id, region.initialOwnerCountryId])),
  populationByRegion: Object.fromEntries(regions.map(region => { const record = demographicByRegion.get(region.id); return [region.id, record?.status === 'available' ? record.baselinePopulation : undefined]; })),
  economicOutputByRegion: Object.fromEntries(regions.map(region => { const record = economicByRegion.get(region.id); return [region.id, record?.status === 'available' ? record.baselineAnnualOutputUsd : undefined]; })),
  bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(countryIds, 'benchmark-world-v1'),
});

describe('reproducible full-world baseline', () => {
  it('advances ten years over the complete current registry', () => {
    let integrityChecksum = 0;
    const scheduler = new SimulationScheduler().register({ id: 'benchmark.world-integrity', cadence: 'monthly', run: state => {
      for (const region of regions) integrityChecksum = (integrityChecksum + region.id.length + (state.populationByRegion[region.id] ?? 0) % 997 + (state.economicOutputByRegion[region.id] ?? 0) % 991) >>> 0;
      return state;
    } });
    let state = worldState();
    const startedAt = performance.now();
    for (let day = 0; day < 3_650; day += 1) state = scheduler.advanceOneDay(state).state;
    const elapsedMs = performance.now() - startedAt;
    const result = { benchmark: 'projectatlas-world-v1', ticks: state.engine.tick, countries: countryIds.length, regions: regions.length, finalDate: state.date, integrityChecksum, elapsedMs: Number(elapsedMs.toFixed(2)), ticksPerSecond: Number((3_650 / (elapsedMs / 1_000)).toFixed(0)) };
    console.info(`WORLD_BENCHMARK ${JSON.stringify(result)}`);
    expect(result).toMatchObject({ benchmark: 'projectatlas-world-v1', ticks: 3_650, countries: 252, regions: 4_574, finalDate: '2035-12-30', integrityChecksum: 25_750_886 });
    expect(state.regionOwnership).toEqual(worldState().regionOwnership);
  });
});
