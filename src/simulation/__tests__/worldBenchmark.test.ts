import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptySocioeconomy } from '../../simulation/socioeconomy/model';
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
  schemaVersion: 19, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {},
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

// The historical v1 probe above intentionally stays frozen (it excluded derived data).
// This second workload runs the actual default runtime and the complete 0.10 world.
import { createHash } from 'node:crypto';
import { socioeconomicWorld, worldContext } from './worldScenario';
import { createCoreScheduler } from '../engine';
import { assertSimulationInvariants } from '../invariants';
import { serializeSimulationState, restoreSimulationState } from '../save';
import { cloneSimulationState } from '../state';

it('benchmarks ten years with actual monthly socioeconomic tasks and valid world state', () => {
  let state = socioeconomicWorld();
  const initial = state;
  const scheduler = createCoreScheduler();
  let monthlyExecutions = 0;
  const startedAt = performance.now();
  for (let day = 0; day < 3650; day++) {
    const result = scheduler.advanceOneDay(state); state = result.state;
    monthlyExecutions += result.trace.filter(t => t.taskId === 'socioeconomy.monthly').length;
    if (state.date.endsWith('-01-01')) assertSimulationInvariants(state, worldContext, 'tick');
  }
  const elapsedMs = performance.now() - startedAt;
  expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true);
  expect(state.socioeconomy.regions).toEqual(initial.socioeconomy.regions);
  expect(monthlyExecutions).toBe(119);
  const snapshotStart = performance.now();
  const snapshot = cloneSimulationState(state);
  const snapshotMs = performance.now() - snapshotStart;
  const serialized = serializeSimulationState(state, worldContext);
  const restored = restoreSimulationState(serialized, worldContext.regions, {}, {}, worldContext);
  expect(restored).toEqual(snapshot);
  const checksum = createHash('sha256').update(JSON.stringify(state.socioeconomy)).digest('hex');
  expect(checksum).toBe('212dc47e790b4de352fb30c66289ea279eda2f5d80dfd42531bf67af1a87a415');
  const result = { benchmark: 'projectatlas-socioeconomy-0.10', ticks: state.engine.tick, countries: 252, regions: 4574, activeRegions: Object.values(state.socioeconomy.regions).filter(r => r.economy).length, cohorts: Object.values(state.socioeconomy.regions).reduce((n, r) => n + r.cohorts.length, 0), monthlyExecutions, finalDate: state.date, checksum, elapsedMs: Number(elapsedMs.toFixed(2)), ticksPerSecond: Math.round(3650 * 1000 / elapsedMs), snapshotMs: Number(snapshotMs.toFixed(2)), saveBytes: Buffer.byteLength(serialized) };
  console.info(`SOCIOECONOMIC_BENCHMARK ${JSON.stringify(result)}`);
}, 30000);

import { SimulationClock } from '../clock';
import { advanceSimulationDays } from '../engine';

it('measures the real daily UI path with cached defensive snapshots across a full year', () => {
  const initial = socioeconomicWorld();
  const clock = new SimulationClock(initial);
  const coldStart = performance.now();
  let previous = clock.snapshot();
  const coldSnapshotMs = performance.now() - coldStart;
  let reusedDays = 0, changedDays = 0, reusedDayMs = 0, changedDayMs = 0;
  for (let day = 0; day < 365; day++) {
    const start = performance.now();
    const next = clock.advanceIfChanged(1000)!;
    const elapsed = performance.now() - start;
    if (next.socioeconomy === previous.socioeconomy) { reusedDays++; reusedDayMs += elapsed; }
    else { changedDays++; changedDayMs += elapsed; }
    previous = next;
  }
  expect(reusedDays).toBe(353); expect(changedDays).toBe(12);
  expect(previous).toEqual(advanceSimulationDays(initial, 365));
  expect(Object.isFrozen(previous.socioeconomy.regions)).toBe(true);
  const result = { benchmark: 'projectatlas-daily-ui-snapshot-0.10', days: 365, reusedDays, changedDays,
    coldSnapshotMs: Number(coldSnapshotMs.toFixed(2)),
    reusedDayMeanMs: Number((reusedDayMs / reusedDays).toFixed(4)),
    monthlyDayMeanMs: Number((changedDayMs / changedDays).toFixed(2)),
    dailyPathTotalMs: Number((reusedDayMs + changedDayMs).toFixed(2)),
    checksum: createHash('sha256').update(JSON.stringify(previous.socioeconomy)).digest('hex') };
  console.info(`DAILY_UI_BENCHMARK ${JSON.stringify(result)}`);
}, 30000);
import { initializeFiscal } from '../fiscal/runtime';

it('benchmarks ten fiscal years, accounting invariants and the real daily snapshot path', () => {
  const initial = initializeFiscal(socioeconomicWorld());
  const scheduler = createCoreScheduler();
  let state = initial, months = 0;
  const started = performance.now();
  for (let day = 0; day < 3650; day++) {
    const result = scheduler.advanceOneDay(state); state = result.state;
    if (result.trace.some(t => t.taskId === 'fiscal.monthly')) { months++; assertSimulationInvariants(state, worldContext, 'tick'); }
  }
  const elapsedMs = performance.now() - started;
  expect(months).toBe(119);
  expect(Object.keys(state.fiscal.countries).sort()).toEqual([...worldContext.countryIds].sort());
  expect(state.regionOwnership).toEqual(initial.regionOwnership);
  const saved = serializeSimulationState(state, worldContext);
  const restored = restoreSimulationState(saved, worldContext.regions, {}, {}, worldContext);
  expect(restored).toEqual(state);
  expect(advanceSimulationDays(restored, 35)).toEqual(advanceSimulationDays(state, 35));
  const clock = new SimulationClock(initial);
  let previous = clock.snapshot(), reusedDays = 0, changedDays = 0, dailyMs = 0, monthlyMs = 0;
  for (let d = 0; d < 365; d++) {
    const start = performance.now(), next = clock.advanceIfChanged(1000)!;
    const elapsed = performance.now() - start;
    if (next.fiscal === previous.fiscal && next.socioeconomy === previous.socioeconomy) { reusedDays++; dailyMs += elapsed; }
    else { changedDays++; monthlyMs += elapsed; }
    previous = next;
  }
  expect(reusedDays).toBe(353); expect(changedDays).toBe(12);
  expect(previous).toEqual(advanceSimulationDays(initial, 365));
  const result = { benchmark: 'projectatlas-fiscal-0.11', countries: Object.keys(state.fiscal.countries).length, regions: Object.keys(state.fiscal.regions).length, ticks: state.engine.tick, months, finalDate: state.date,
    elapsedMs: Number(elapsedMs.toFixed(2)), ticksPerSecond: Math.round(3650000 / elapsedMs), saveBytes: Buffer.byteLength(saved),
    fiscalSha256: createHash('sha256').update(JSON.stringify(state.fiscal)).digest('hex'), reusedDays, changedDays,
    reusedDayMeanMs: Number((dailyMs / reusedDays).toFixed(4)), monthlySnapshotDayMeanMs: Number((monthlyMs / changedDays).toFixed(2)),
    countriesWithArrears: Object.values(state.fiscal.countries).filter(c => c.account!.stress.unpaidCommitments > 0).length };
  console.info(`FISCAL_WORLD_BENCHMARK ${JSON.stringify(result)}`);
}, 60000);
