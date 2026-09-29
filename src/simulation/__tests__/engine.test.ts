import { emptyFiscal } from '../fiscal/model';
import { emptySocioeconomy } from '../../simulation/socioeconomy/model';
import { describe, expect, it } from 'vitest';
import type { Country, RegionEntity, SimulationState } from '../../types';
import { clearDirty, inspectDirty, markDirty } from '../dirty';
import { simulationDiagnostics } from '../diagnostics';
import { advanceSimulationDays, createCoreScheduler } from '../engine';
import { canonicalReality, type EpistemicView } from '../epistemic';
import { getCountryFidelity, requestFidelityTransition } from '../fidelity';
import { assertSimulationInvariants, createCoreInvariantRegistry, validateFidelityConservation, validateSimulationInvariants } from '../invariants';
import { deterministicFloat, deterministicInteger, deterministicUint32 } from '../rng';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { SimulationScheduler } from '../scheduler';
import { cloneSimulationState, createEngineState } from '../state';
import { canonicalWorld, simulationDelta } from '../world';

const countries = new Set(['country.a', 'country.b']);
const region: RegionEntity = { id: 'region.a', parentCountryId: 'country.a', initialOwnerCountryId: 'country.a', commonName: 'A', administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: ['geometry-a'] } };
const context = { countryIds: countries, regionIds: new Set([region.id]), regions: [region] };
const initial = (seed = 'seed.001'): SimulationState => ({
  schemaVersion: 9, fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
  territoryOwnership: { 'territory.a': 'country.a' }, regionOwnership: { [region.id]: 'country.a' },
  populationByRegion: { [region.id]: 1_000 }, economicOutputByRegion: { [region.id]: 5_000 },
  bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {},
  engine: createEngineState(countries, seed),
});

describe('shared deterministic engine contracts', () => {
  it('runs scheduler tasks in stable priority/id order and exposes the logical date', () => {
    const executions: string[] = [];
    const scheduler = new SimulationScheduler()
      .register({ id: 'zeta', cadence: 'daily', priority: 10, run: (state, ctx) => { executions.push(`zeta:${ctx.date}:${ctx.tick}`); return state; } })
      .register({ id: 'beta', cadence: 'daily', run: state => { executions.push('beta'); return state; } })
      .register({ id: 'alpha', cadence: 'daily', run: state => { executions.push('alpha'); return state; } });
    const result = scheduler.advanceOneDay(initial());
    expect(executions).toEqual(['alpha', 'beta', 'zeta:2026-01-02:1']);
    expect(result.trace.map(item => item.taskId)).toEqual(['alpha', 'beta', 'zeta']);
  });

  it('supports daily, weekly, monthly, quarterly and yearly cadence boundaries', () => {
    const counts: Record<string, number> = {};
    const scheduler = new SimulationScheduler();
    for (const cadence of ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const) scheduler.register({ id: cadence, cadence, run: state => { counts[cadence] = (counts[cadence] ?? 0) + 1; return state; } });
    let state = { ...initial(), date: '2025-12-31' };
    for (let day = 0; day < 6; day += 1) state = scheduler.advanceOneDay(state).state;
    expect(counts).toEqual({ daily: 6, monthly: 1, quarterly: 1, yearly: 1, weekly: 1 });
  });

  it('queues immediate work persistently and executes it at the next deterministic boundary', () => {
    const scheduler = new SimulationScheduler().register({ id: 'event-projection', cadence: 'yearly', run: (state, ctx) => markDirty(state, { domain: 'projection', reason: ctx.eventKey }) });
    const queued = scheduler.requestImmediate(initial(), 'event-projection', 'war-declared:war.1');
    expect(queued.engine.pendingImmediateUpdates).toHaveLength(1);
    const result = scheduler.advanceOneDay(queued);
    expect(result.trace).toEqual([{ taskId: 'event-projection', cadence: 'yearly', execution: 'immediate', eventKey: 'war-declared:war.1' }]);
    expect(inspectDirty(result.state)[0].reasons).toEqual(['war-declared:war.1']);
  });

  it('produces stable keyed random values independent from call order', () => {
    const key = { system: 'economy', entityId: 'country.a', date: '2026-02-01', tick: 31, eventKey: 'monthly' };
    const expected = deterministicUint32('seed.001', key);
    deterministicUint32('seed.001', { ...key, entityId: 'country.b' });
    expect(deterministicUint32('seed.001', key)).toBe(expected);
    expect(deterministicUint32('seed.002', key)).not.toBe(expected);
    expect(deterministicFloat('seed.001', key)).toBeGreaterThanOrEqual(0);
    expect(deterministicInteger('seed.001', key, 10, 20)).toBeGreaterThanOrEqual(10);
    expect(deterministicInteger('seed.001', key, 10, 20)).toBeLessThan(20);
  });

  it('gives identical results for the same seed and decisions, including after save/reload', () => {
    const scheduler = new SimulationScheduler().register({ id: 'test.output', cadence: 'daily', run: (state, ctx) => ({ ...state, economicOutputByRegion: { ...state.economicOutputByRegion, [region.id]: state.economicOutputByRegion[region.id]! + ctx.random.integer(0, 100, { entityId: region.id }) } }) });
    const uninterrupted = Array.from({ length: 20 }).reduce<SimulationState>(state => scheduler.advanceOneDay(state).state, initial());
    const firstHalf = Array.from({ length: 10 }).reduce<SimulationState>(state => scheduler.advanceOneDay(state).state, initial());
    const restored = restoreSimulationState(serializeSimulationState(firstHalf, context), [region], {}, {}, context);
    const resumed = Array.from({ length: 10 }).reduce<SimulationState>(state => scheduler.advanceOneDay(state).state, restored);
    expect(resumed).toEqual(uninterrupted);
    const differentSeed = Array.from({ length: 20 }).reduce<SimulationState>(state => scheduler.advanceOneDay(state).state, initial('another-seed'));
    expect(differentSeed.economicOutputByRegion[region.id]).not.toBe(uninterrupted.economicOutputByRegion[region.id]);
  });

  it('applies fidelity transitions only at a day boundary and conserves world quantities', () => {
    const geometryBefore = structuredClone(region.geographyMapping);
    const queued = requestFidelityTransition(initial(), 'country.a', 'Detailed', countries, 'player focus');
    expect(getCountryFidelity(queued, 'country.a')).toBe('Standard');
    const detailed = advanceSimulationDays(queued, 1);
    expect(getCountryFidelity(detailed, 'country.a')).toBe('Detailed');
    expect(validateFidelityConservation(queued, detailed)).toEqual([]);
    const background = advanceSimulationDays(requestFidelityTransition(detailed, 'country.a', 'Background', countries), 1);
    expect(getCountryFidelity(background, 'country.a')).toBe('Background');
    expect(region.geographyMapping).toEqual(geometryBefore);
    expect(background.regionOwnership).toEqual(initial().regionOwnership);
    expect(background.populationByRegion).toEqual(initial().populationByRegion);
    expect(background.wars).toEqual(initial().wars);
    expect(background.occupationByRegion).toEqual(initial().occupationByRegion);
  });

  it('tracks and clears typed dirty domains without recalculating unrelated state', () => {
    const dirty = markDirty(markDirty(initial(), { domain: 'governmentRevenue', entityId: 'country.a', reason: 'tax-rate' }), { domain: 'governmentRevenue', entityId: 'country.a', reason: 'tax-rate' });
    expect(inspectDirty(dirty)).toEqual([{ domain: 'governmentRevenue', entityIds: ['country.a'], markedAtTick: 0, reasons: ['tax-rate'] }]);
    expect(clearDirty(dirty, 'governmentRevenue', 'country.a').engine.dirtyDomains).toEqual([]);
  });

  it('preserves global dirty semantics when local and global marks are combined or cleared', () => {
    const globalThenEntity = markDirty(markDirty(initial(), { domain: 'consumption', reason: 'global-event' }), { domain: 'consumption', entityId: 'country.a', reason: 'local-event' });
    expect(inspectDirty(globalThenEntity)[0].entityIds).toEqual([]);
    expect(clearDirty(globalThenEntity, 'consumption', 'country.a').engine.dirtyDomains).toHaveLength(1);
    expect(clearDirty(globalThenEntity, 'consumption').engine.dirtyDomains).toEqual([]);

    const entityThenGlobal = markDirty(markDirty(initial(), { domain: 'consumption', entityId: 'country.a', reason: 'local-event' }), { domain: 'consumption', reason: 'global-event' });
    expect(inspectDirty(entityThenGlobal)[0].entityIds).toEqual([]);
    expect(inspectDirty(entityThenGlobal)[0].reasons).toEqual(['global-event', 'local-event']);
  });

  it('keeps sovereignty, occupation and geometry as distinct sources of truth', () => {
    const occupied = { ...initial(), occupationByRegion: { [region.id]: { regionId: region.id, warId: 'war.a', occupierCountryId: 'country.b', startDate: '2026-01-01' } } };
    const countryA = { id: 'country.a', commonName: 'A', externalIds: {}, entityType: 'sovereign_state', unMembership: 'member', sources: {}, kind: 'sovereign' } satisfies Country;
    const world = canonicalWorld(occupied, new Map([[countryA.id, countryA]]), new Map([[region.id, region]]));
    expect(world.ownerOfRegion(region.id)).toBe('country.a');
    expect(world.occupierOfRegion(region.id)).toBe('country.b');
    expect(world.regionsById.get(region.id)?.geographyMapping).toBe(region.geographyMapping);
    const snapshot = world.snapshot(); snapshot.regionOwnership[region.id] = 'country.b';
    expect(occupied.regionOwnership[region.id]).toBe('country.a');
    const beforeTick = cloneSimulationState(initial());
    const afterTick = cloneSimulationState(beforeTick); afterTick.date = '2026-01-02'; afterTick.engine.tick += 1;
    expect(simulationDelta(beforeTick, afterTick).changedDomains).toEqual(['time']);
    const transferred = cloneSimulationState(beforeTick); transferred.regionOwnership[region.id] = 'country.b';
    expect(simulationDelta(beforeTick, transferred).changedDomains).toEqual(['sovereignty']);
  });

  it('reports shared invariant violations and exposes separate epistemic layers', () => {
    expect(assertSimulationInvariants(initial(), context, 'tick')).toBe(true);
    const invalid = { ...initial(), regionOwnership: { 'region.unknown': 'country.a' } };
    expect(validateSimulationInvariants(invalid, context, 'tick').violations.some(item => item.invariantId === 'permanent-region-references')).toBe(true);
    const view: EpistemicView<number> = { reality: () => canonicalReality(42, '2026-01-01'), governmentInformation: () => undefined, publicPerception: () => undefined };
    expect(view.reality()).toEqual({ layer: 'reality', value: 42, observedAt: '2026-01-01', sourceKey: undefined });
    expect(view.governmentInformation('country.a')).toBeUndefined();
  });

  it('registers future system invariants in a reusable shared registry', () => {
    const registry = createCoreInvariantRegistry().register({ id: 'future.minimum-output', check: state => state.economicOutputByRegion[region.id]! >= 5_000 ? [] : ['Output fell below the test floor.'] });
    expect(registry.describe()).toContain('future.minimum-output');
    expect(registry.validate(initial(), context, 'tick').valid).toBe(true);
    const invalid = { ...initial(), economicOutputByRegion: { [region.id]: 4_999 } };
    expect(registry.validate(invalid, context, 'tick').violations).toContainEqual({ invariantId: 'future.minimum-output', phase: 'tick', message: 'Output fell below the test floor.' });
  });

  it('persists fidelity, scheduler queues, dirty state and deterministic seed in schema 7', () => {
    const scheduler = createCoreScheduler();
    let state = requestFidelityTransition(initial(), 'country.a', 'Detailed', countries);
    state = scheduler.requestImmediate(markDirty(state, { domain: 'population', reason: 'fixture' }), 'engine.apply-fidelity-transitions', 'focus-changed');
    const restored = restoreSimulationState(serializeSimulationState(state, context), [region], {}, {}, context);
    expect(restored).toEqual(state);
    expect(restored.engine.seed).toBe('seed.001');
    expect(simulationDiagnostics(restored, scheduler)).toMatchObject({ date: '2026-01-01', tick: 0, seed: 'seed.001', fidelityCounts: { Standard: 2 } });
  });
});
