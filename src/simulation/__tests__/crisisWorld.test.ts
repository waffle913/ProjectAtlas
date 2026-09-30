/// <reference types="node" />
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { CRISIS_TYPES, type CrisisType } from '../crisis/model';
import { createCoreScheduler } from '../engine';
import { initializeFiscal } from '../fiscal/runtime';
import { assertSimulationInvariants } from '../invariants';
import { serializeSimulationState } from '../save';
import { cloneSimulationState } from '../state';
import { socioeconomicWorld, worldContext } from './worldScenario';

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

describe('full-world crisis validation', () => {
  it('evaluates all Countries for five years with bounded causal episodes', () => {
    let state = initializeFiscal(socioeconomicWorld());
    const scheduler = createCoreScheduler(); let monthlyEvaluations = 0;
    const started = performance.now();
    for (let day = 0; day < 1_825; day += 1) {
      const result = scheduler.advanceOneDay(state); state = result.state;
      if (result.trace.some(entry => entry.taskId === 'crisis.monthly')) monthlyEvaluations += 1;
    }
    const runtimeMs = performance.now() - started;
    expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true);
    expect(Object.keys(state.crisis.countries)).toHaveLength(252);
    const histories = Object.values(state.crisis.countries).flatMap(country => country.history);
    const currents = Object.values(state.crisis.countries).flatMap(country => Object.values(country.currentByType));
    const pressureEpisodes = histories.length + currents.filter(item => item.pressureStartedOn).length;
    const activeEpisodes = histories.filter(item => item.activatedOn).length + currents.filter(item => item.activatedOn).length;
    const recoveringEpisodes = histories.filter(item => item.recoveringOn).length + currents.filter(item => item.state === 'RECOVERING').length;
    const durations = histories.map(item => daysBetween(item.pressureStartedOn, item.endedOn));
    const byType = Object.fromEntries(CRISIS_TYPES.map(type => [type, {
      pressure: histories.filter(item => item.type === type).length + currents.filter(item => item.type === type && item.pressureStartedOn).length,
      active: histories.filter(item => item.type === type && item.activatedOn).length + currents.filter(item => item.type === type && item.activatedOn).length,
      current: Object.fromEntries(['NORMAL', 'PRESSURE', 'ACTIVE', 'RECOVERING'].map(phase => [phase, currents.filter(item => item.type === type && item.state === phase).length])),
    }])) as Record<CrisisType, unknown>;
    const snapshotStarted = performance.now(); cloneSimulationState(state); const snapshotMs = performance.now() - snapshotStarted;
    const serialized = serializeSimulationState(state, worldContext);
    const report = {
      benchmark: 'projectatlas-crisis-0.12', countries: Object.keys(state.crisis.countries).length,
      years: 5, ticks: state.engine.tick, monthlyEvaluations, countryCrisisEvaluations: state.crisis.evaluations,
      pressureEpisodes, activeEpisodes, recoveringEpisodes, endedEpisodes: histories.length, byType,
      averageEndedDurationDays: durations.length ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)) : 0,
      maximumEndedDurationDays: durations.length ? Math.max(...durations) : 0,
      runtimeMs: Number(runtimeMs.toFixed(2)), snapshotMs: Number(snapshotMs.toFixed(2)), saveBytes: Buffer.byteLength(serialized),
    };
    console.info(`CRISIS_WORLD_BENCHMARK ${JSON.stringify(report)}`);
    expect(monthlyEvaluations).toBe(59);
    expect(state.crisis.evaluations).toBe(59 * 252 * CRISIS_TYPES.length);
    expect(serialized).not.toMatch(/NaN|Infinity/);
  }, 60_000);
});
