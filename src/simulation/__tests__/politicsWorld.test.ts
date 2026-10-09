/// <reference types="node" />
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { SimulationClock } from '../clock';
import { createCoreScheduler } from '../engine';
import { initializeNewGame } from '../initialization';
import { assertSimulationInvariants } from '../invariants';
import { politicalRegistry } from '../politics/registry';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { createSimulationSnapshotCache } from '../state';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
const fullWorld = () => initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);

describe('full-world corrected politics 0.13', () => {
  it('covers all Countries with real chambers, reconciled seats and variable fictional party counts', () => {
    const state = fullWorld(), definitions = Object.values(politicalRegistry.countries), chambers = Object.values(politicalRegistry.institutions).flatMap(item => item.chambers);
    expect(Object.keys(state.politics.countries)).toHaveLength(252); expect(Object.keys(state.politics.regionalOpinion)).toHaveLength(4_574); expect(chambers.length).toBe(281);
    expect(Object.keys(state.politics.organizations)).toHaveLength(Object.keys(politicalRegistry.organizations).length + Object.keys(politicalRegistry.parties).length);
    expect(chambers.filter(item => item.seatAllocationStatus === 'sourced').length).toBe(182);
    expect(new Set(definitions.map(item => item.partyIds.length)).size).toBeGreaterThan(10);
    expect(Object.isFrozen(politicalRegistry)).toBe(true); expect(Object.isFrozen(politicalRegistry.parties[Object.keys(politicalRegistry.parties)[0]])).toBe(true);
    for (const chamber of chambers.filter(item => item.seatAllocationStatus === 'sourced')) expect(Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0) + (chamber.independentOtherSeats ?? 0)).toBe(chamber.totalSeats);
    expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true);
  }, 30_000);

  it('preserves the politics branch on ordinary days and replaces it on weekly updates', () => {
    const clock = new SimulationClock(fullWorld()), first = clock.snapshot(); let previous = first;
    for (let day = 0; day < 3; day++) { const next = clock.advanceIfChanged(1_000)!; expect(next.politics).toBe(previous.politics); previous = next; }
    const monday = clock.advanceIfChanged(1_000)!; expect(monday.date).toBe('2026-01-05'); expect(monday.politics).not.toBe(previous.politics); expect(monday.socioeconomy).toBe(previous.socioeconomy);
  }, 30_000);

  it('benchmarks simulation, changed snapshots, coincident updates and save/reload', () => {
    let state = fullWorld(), weeklyRuns = 0; const scheduler = createCoreScheduler(), started = performance.now();
    for (let day = 0; day < 1_095; day++) { const result = scheduler.advanceOneDay(state); state = result.state; if (result.trace.some(item => item.taskId === 'politics.opinion-weekly')) weeklyRuns++; }
    const elapsedMs = performance.now() - started; expect(weeklyRuns).toBe(156); expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true);
    const snapshot = createSimulationSnapshotCache(); let measured = fullWorld(); snapshot(measured); for (let day = 0; day < 3; day++) { measured = scheduler.advanceOneDay(measured).state; snapshot(measured); } measured = scheduler.advanceOneDay(measured).state; let t = performance.now(); snapshot(measured); const weeklySnapshotMs = performance.now() - t;
    let coincident = fullWorld(); for (let day = 0; day < 150; day++) coincident = scheduler.advanceOneDay(coincident).state; const coincidentCache = createSimulationSnapshotCache(); coincidentCache(coincident); coincident = scheduler.advanceOneDay(coincident).state; t = performance.now(); coincidentCache(coincident); const coincidentSnapshotMs = performance.now() - t; expect(coincident.date).toBe('2026-06-01');
    const serialized = serializeSimulationState(state, worldContext), reloadStarted = performance.now(), restored = restoreSimulationState(serialized, worldRegions, {}, {}, worldContext), reloadMs = performance.now() - reloadStarted; expect(restored).toEqual(state);
    const definitions = Object.values(politicalRegistry.countries), chambers = Object.values(politicalRegistry.institutions).flatMap(item => item.chambers), statuses = ['sourced', 'partial', 'modelled_fallback', 'unavailable', 'not_applicable'].map(status => [status, definitions.filter(item => Object.values(item.coverage).includes(status as never)).length]);
    console.info(`POLITICS_WORLD_BENCHMARK ${JSON.stringify({ benchmark: 'projectatlas-politics-0.13-final', years: 3, countries: definitions.length, regions: Object.keys(state.politics.regionalOpinion).length, cohorts: Object.values(state.politics.regionalOpinion).reduce((sum, region) => sum + Object.keys(region.cohorts).length, 0), parties: Object.keys(politicalRegistry.parties).length, dynamicOrganizations: Object.keys(state.politics.organizations).length, distinctPartyCounts: [...new Set(definitions.map(item => item.partyIds.length))].sort((a,b)=>a-b), chambers: chambers.length, representedSeats: chambers.filter(item => item.seatAllocationStatus === 'sourced').reduce((sum, item) => sum + (item.totalSeats ?? 0), 0), weeklyRuns, elapsedMs: Number(elapsedMs.toFixed(2)), ticksPerSecond: Math.round(1_095_000 / elapsedMs), weeklyChangedSnapshotMs: Number(weeklySnapshotMs.toFixed(2)), coincidentMonthlyWeeklySnapshotMs: Number(coincidentSnapshotMs.toFixed(2)), reloadMs: Number(reloadMs.toFixed(2)), saveBytes: Buffer.byteLength(serialized), statusCountryCounts: Object.fromEntries(statuses) })}`);
  }, 180_000);
});
