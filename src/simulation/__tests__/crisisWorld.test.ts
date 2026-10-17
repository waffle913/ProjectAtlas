/// <reference types="node" />
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { CRISIS_TYPES, type CrisisType } from '../crisis/model';
import { createCoreScheduler } from '../engine';
import { initializeFiscal, runFiscalMonth } from '../fiscal/runtime';
import { runCrisisMonth } from '../crisis/runtime';
import { deterministicInteger } from '../rng';
import type { SchedulerTaskContext } from '../scheduler';
import { assertSimulationInvariants } from '../invariants';
import { serializeSimulationState } from '../save';
import { cloneSimulationState } from '../state';
import { initializeNewGame } from '../initialization';
import { socioeconomicWorld, worldBase, worldContext, worldCountryIds, worldInputs, worldRegions } from './worldScenario';

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const crisisContext = (state: ReturnType<typeof socioeconomicWorld>): SchedulerTaskContext => ({
  date: state.date,
  tick: state.engine.tick,
  cadence: 'monthly',
  execution: 'scheduled',
  eventKey: 'cadence:monthly',
  random: {
    uint32: key => deterministicInteger(state.engine.seed, { system: 'crisis.monthly', entityId: key?.entityId, date: state.date, tick: state.engine.tick, eventKey: 'cadence:monthly' }, 0, 0x1_0000_0000),
    float: key => deterministicInteger(state.engine.seed, { system: 'crisis.monthly', entityId: key?.entityId, date: state.date, tick: state.engine.tick, eventKey: 'cadence:monthly' }, 0, 1_000_000) / 1_000_000,
    integer: (min, max, key) => deterministicInteger(state.engine.seed, { system: 'crisis.monthly', entityId: key?.entityId, date: state.date, tick: state.engine.tick, eventKey: 'cadence:monthly' }, min, max),
  },
});

describe('full-world crisis validation', () => {
  it('initializes all fresh-game monitors without evaluating or inventing history', () => {
    let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs);
    expect(state.date).toBe('2026-01-01'); expect(state.crisis.initializedOn).toBe('2026-01-01');
    expect(Object.keys(state.crisis.countries)).toHaveLength(252); expect(state.crisis.lastMonthlyDate).toBeUndefined(); expect(state.crisis.evaluations).toBe(0);
    for (const country of Object.values(state.crisis.countries)) {
      expect(country.history).toEqual([]);
      expect(Object.values(country.currentByType)).toHaveLength(5);
      expect(Object.values(country.currentByType).every(item => item.state === 'NORMAL' && item.currentPressure === 0 && item.lastEvaluatedOn === undefined)).toBe(true);
    }
    const scheduler = createCoreScheduler();
    for (let day = 0; day < 30; day += 1) state = scheduler.advanceOneDay(state).state;
    expect(state.date).toBe('2026-01-31'); expect(state.crisis.evaluations).toBe(0); expect(state.crisis.lastMonthlyDate).toBeUndefined();
    state = scheduler.advanceOneDay(state).state;
    expect(state.date).toBe('2026-02-01'); expect(state.crisis.evaluations).toBe(252 * CRISIS_TYPES.length); expect(state.crisis.lastMonthlyDate).toBe('2026-02-01');
  }, 15_000);

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

  it('triggers, evolves and resolves a fiscal-stress crisis through the crisis engine on the full world', () => {
    let state = initializeFiscal(socioeconomicWorld());
    state = runFiscalMonth({ ...state, date: '2026-02-01' });
    const targetId = Object.keys(state.fiscal.countries).find(id => state.fiscal.countries[id].account);
    expect(targetId).toBeTruthy();
    const stable = structuredClone(state);
    const country = state.fiscal.countries[targetId!];
    const account = country.account!;
    const revenue = Math.max(1, account.totalRevenue);
    // Credible fiscal deterioration (mirrors the unit-test fixture).
    account.stress.unpaidCommitments = revenue * 2;
    account.interestPaid = Math.max(1, Math.floor(revenue * 0.3));
    country.debt = revenue * 18;
    account.totalSpending = revenue * 2;
    const evaluate = (month: number) => {
      const date = `2026-${String(month).padStart(2, '0')}-01`;
      const next = { ...state, date, engine: { ...state.engine, tick: state.engine.tick + 30 } };
      return runCrisisMonth(next, crisisContext(next));
    };
    for (const month of [3, 4, 5]) state = evaluate(month);
    const episode = state.crisis.countries[targetId!].currentByType['fiscal_stress'];
    expect(episode.state).toBe('ACTIVE');
    expect(episode.activatedOn).toBeTruthy();
    // Sustained material improvement drives recovery, then resolution.
    const recover = (month: number) => {
      const date = `2026-${String(month).padStart(2, '0')}-01`;
      const next = { ...stable, date, engine: state.engine, crisis: state.crisis };
      return runCrisisMonth(next, crisisContext(next));
    };
    for (const month of [6, 7]) state = recover(month);
    expect(state.crisis.countries[targetId!].currentByType['fiscal_stress'].state).toBe('RECOVERING');
    for (const month of [8, 9, 10]) state = recover(month);
    expect(state.crisis.countries[targetId!].currentByType['fiscal_stress'].state).toBe('NORMAL');
    const resolved = state.crisis.countries[targetId!].history[0];
    expect(resolved).toMatchObject({ activatedOn: expect.any(String), recoveringOn: expect.any(String), endedOn: expect.any(String) });
  }, 60_000);
});
