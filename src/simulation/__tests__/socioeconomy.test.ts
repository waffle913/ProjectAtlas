import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { allocate, cohortsFor, emptySocioeconomy, evolve, inspectSocioeconomy, NO_SHOCK } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { requestEconomicShock } from '../socioeconomy/runtime';
import { createEngineState, cloneSimulationState } from '../state';
import { advanceSimulationDays, createCoreScheduler } from '../engine';
import { SimulationClock } from '../clock';
import { assertSimulationInvariants, validateSimulationInvariants, validateFidelityConservation } from '../invariants';
import { requestFidelityTransition } from '../fidelity';
import { migrateSimulationState, restoreSimulationState, serializeSimulationState } from '../save';
import { simulationDelta } from '../world';

const regions: RegionEntity[] = ['a', 'b'].map(id => ({ id, parentCountryId: id, initialOwnerCountryId: id, commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } }));
const context = { regions, regionIds: new Set(['a', 'b']), countryIds: new Set(['a', 'b']) };
const initial = (): SimulationState => initializeSocioeconomy({ schemaVersion: 12, governance: emptyGovernance('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {}, regionOwnership: { a: 'a', b: 'b' }, populationByRegion: { a: 10000, b: 10000 }, economicOutputByRegion: { a: 12000000, b: 12000000 }, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(['a', 'b']) }, regions);
const economy = (s: SimulationState) => s.socioeconomy.regions.a.economy!;

describe('0.10 deterministic socioeconomic model', () => {
  it('allocates exact integer populations including tiny populations and large safe totals', () => {
    for (const n of [0, 1, 2, 3, 7, 101, 10000, 8000000000, Number.MAX_SAFE_INTEGER]) {
      const cohorts = cohortsFor(n);
      expect(cohorts).toHaveLength(9);
      expect(cohorts.reduce((s, c) => s + c.persons, 0)).toBe(n);
      const groups = ['low', 'middle', 'high'].map(g => cohorts.filter(c => c.income === g).reduce((s, c) => s + c.persons, 0));
      expect(groups).toEqual(allocate(n, [40, 40, 20]));
      for (const g of ['low', 'middle', 'high']) { const parts = cohorts.filter(c => c.income === g).map(c => c.persons); expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1); }
    }
    expect(allocate(7, [40, 40, 20])).toEqual([3, 3, 1]);
    expect(() => cohortsFor(-1)).toThrow();
    expect(() => allocate(10, [0, 0])).toThrow();
  });
  it('initializes 40/40/20 persons separately from 20/40/40 income and a labelled political prior', () => {
    const r = initial().socioeconomy.regions.a;
    expect(r.cohorts.filter(c => c.income === 'low').reduce((s, c) => s + c.persons, 0)).toBe(4000);
    expect(r.economy!.incomeByGroup).toEqual([130000, 260000, 260000]);
    expect(r.orientationProvenance).toMatchObject({ status: 'modelled', method: 'modelled_noninformative_prior' });
  });
  it('has no political effect on any economic calculation', () => {
    const r = initial().socioeconomy.regions.a, changed = structuredClone(r);
    changed.cohorts.forEach(c => { c.orientation = c.orientation === 'left' ? 'right' : c.orientation === 'right' ? 'left' : 'centre'; });
    expect(evolve(changed).economy).toEqual(evolve(r).economy);
  });
  it('stays calibrated over ten years with monthly accounting and no phantom growth', () => {
    const s = initial(), end = advanceSimulationDays(s, 3650);
    expect(economy(end)).toEqual(economy(s));
    expect(economy(s).output).toBe(1000000);
    expect(economy(s).output).toBe(economy(s).consumption + economy(s).otherDemandResidual);
    expect(assertSimulationInvariants(end, context, 'tick')).toBe(true);
    expect(end.socioeconomy.administration).toHaveLength(48);
  });
  it('propagates capacity loss into production, jobs, incomes, consumption and needs, then recovers', () => {
    const scheduler = createCoreScheduler(), s = initial();
    const queued = requestEconomicShock(s, scheduler, 'a', { ...NO_SHOCK, capacityBps: 8000 });
    const hit = advanceSimulationDays(queued, 181, scheduler);
    for (const field of ['output', 'employed', 'householdIncome', 'consumption', 'basicNeedsCoverageBps'] as const) expect(economy(hit)[field]).toBeLessThan(economy(s)[field]);
    expect(economy(hit).output).toBeLessThanOrEqual(800000);
    const recovered = advanceSimulationDays(requestEconomicShock(hit, scheduler, 'a', NO_SHOCK), 730, scheduler);
    expect(economy(recovered).output).toBeGreaterThan(economy(hit).output);
    expect(economy(recovered).output).toBeGreaterThan(999000);
    expect(assertSimulationInvariants(recovered, context, 'tick')).toBe(true);
  });
  it.each(['productivityBps', 'labourBps'] as const)('supports a %s shock independently', field => {
    const scheduler = createCoreScheduler(), s = initial();
    const hit = advanceSimulationDays(requestEconomicShock(s, scheduler, 'a', { ...NO_SHOCK, [field]: 5000 }), 60, scheduler);
    expect(economy(hit).output).toBeLessThanOrEqual(500000);
    expect(economy(hit).householdIncome).toBeLessThan(economy(s).householdIncome);
    expect(assertSimulationInvariants(hit, context, 'tick')).toBe(true);
  });
  it('runs in the actual clock, with pause, local dirty projection and no extra monthly booking', () => {
    const scheduler = createCoreScheduler(), s = initial();
    const queued = requestEconomicShock({ ...s, paused: true }, scheduler, 'a', { ...NO_SHOCK, capacityBps: 8000 });
    const clock = new SimulationClock(queued, scheduler);
    expect(clock.advance(50000)).toEqual(queued);
    clock.setPaused(false);
    const projected = clock.advance(1000);
    expect(economy(projected).capacity).toBe(800000);
    expect(economy(projected).output).toBe(1000000); // Last booked month, not a second flow.
    expect(projected.socioeconomy.regions.b).toEqual(s.socioeconomy.regions.b);
    expect(projected.engine.dirtyDomains).toEqual([]);
    expect(assertSimulationInvariants(projected, context, 'tick')).toBe(true);
    const monthly = clock.advance(30000);
    expect(monthly.date).toBe('2026-02-01');
    expect(economy(monthly).output).toBe(800000);
    const boundary = requestEconomicShock({ ...s, date: '2026-01-31' }, scheduler, 'a', { ...NO_SHOCK, capacityBps: 8000 });
    expect(economy(advanceSimulationDays(boundary, 1, scheduler))).toEqual(economy(monthly));
  });
  it('gives equal results for chunked elapsed time, serialized continuation and all fidelity levels', () => {
    const a = new SimulationClock(initial()), b = new SimulationClock(initial());
    a.advance(40000); for (let i = 0; i < 160; i++) b.advance(250);
    expect(a.snapshot()).toEqual(b.snapshot());
    const first = advanceSimulationDays(initial(), 46);
    const restored = restoreSimulationState(serializeSimulationState(first, context), regions, {}, {}, context);
    expect(advanceSimulationDays(restored, 400)).toEqual(advanceSimulationDays(initial(), 446));
    const changed = advanceSimulationDays(requestFidelityTransition(first, 'a', 'Background', context.countryIds), 1);
    expect(validateFidelityConservation(first, changed)).toEqual([]);
    const detailed = advanceSimulationDays(requestFidelityTransition(first, 'a', 'Detailed', context.countryIds), 100);
    const background = advanceSimulationDays(requestFidelityTransition(first, 'a', 'Background', context.countryIds), 100);
    expect(detailed.socioeconomy).toEqual(background.socioeconomy);
  });
  it('persists pending paused shock requests and resumes at the same deterministic boundary', () => {
    const scheduler = createCoreScheduler();
    const queued = requestEconomicShock({ ...initial(), paused: true }, scheduler, 'a', { ...NO_SHOCK, capacityBps: 8000 });
    const restored = restoreSimulationState(serializeSimulationState(queued, context), regions, {}, {}, context);
    expect(restored).toEqual(queued);
    expect(advanceSimulationDays(restored, 92)).toEqual(advanceSimulationDays(queued, 92));
  });
  it('migrates v7 using saved values and date, preserving old advanced world state', () => {
    const s = initial();
    const { socioeconomy: _s, ...body } = s;
    const legacy = { ...body, schemaVersion: 7, date: '2033-06-14', populationByRegion: { a: 9876, b: undefined }, economicOutputByRegion: { a: 9876543, b: undefined }, regionOwnership: { a: 'b', b: 'a' } };
    const migrated = migrateSimulationState(legacy, regions, { a: 1 }, { a: 1 }, context);
    expect(migrated.schemaVersion).toBe(12);
    expect(migrated.socioeconomy.regions.a.population).toBe(9876);
    expect(migrated.socioeconomy.initializedOn).toBe('2033-06-14');
    for (const field of ['populationByRegion', 'economicOutputByRegion', 'engine', 'regionOwnership', 'wars', 'claims'] as const) expect(migrated[field]).toEqual(legacy[field]);
    expect(migrated.socioeconomy.regions.b.population).toBeUndefined();
    expect(migrated.socioeconomy.regions.b.cohorts).toEqual([]);
    expect(migrated.socioeconomy.regions.b.populationProvenance.status).toBe('unavailable');
    expect(assertSimulationInvariants(migrated, context, 'reload')).toBe(true);
    expect(migrateSimulationState(legacy, regions, {}, {}, context)).toEqual(migrated);
  });
  it('does not copy the world on idle UI polls and accepts clock-level shock requests', () => {
    const clock = new SimulationClock({ ...initial(), paused: true });
    expect(clock.advanceIfChanged(10000)).toBeUndefined();
    clock.setEconomicShock('a', { ...NO_SHOCK, capacityBps: 8000 });
    clock.setPaused(false);
    expect(clock.advanceIfChanged(500)).toBeUndefined();
    expect(economy(clock.advanceIfChanged(500)! ).capacity).toBe(800000);
  });
  it('handles zero output, tiny populations and complete temporary shutdown safely', () => {
    for (const population of [0, 1, 2, 3, 17]) for (const output of [0, 1, 12, 9999]) {
      const s = initial(); s.populationByRegion.a = population; s.economicOutputByRegion.a = output;
      const seeded = initializeSocioeconomy(s, regions);
      const end = advanceSimulationDays(seeded, 365);
      expect(assertSimulationInvariants(end, context, 'tick')).toBe(true);
    }
    const scheduler = createCoreScheduler();
    const stopped = advanceSimulationDays(requestEconomicShock(initial(), scheduler, 'a', { ...NO_SHOCK, labourBps: 0 }), 60, scheduler);
    expect(economy(stopped).output).toBe(0);
    expect(economy(stopped).employed).toBe(0);
    const recovered = advanceSimulationDays(requestEconomicShock(stopped, scheduler, 'a', NO_SHOCK), 365, scheduler);
    expect(economy(recovered).output).toBeGreaterThan(900000);
  });
  it('reports corrupted quantities via the common invariant registry', () => {
    for (const value of [-1, NaN, Infinity, 1.5]) {
      const bad = initial(); bad.socioeconomy.regions.a.cohorts[0].persons = value;
      expect(validateSimulationInvariants(bad, context, 'save').valid).toBe(false);
    }
    const bad = initial(); economy(bad).output++;
    expect(() => restoreSimulationState(serializeSimulationState(bad), regions, {}, {}, context)).toThrow(/accounting/);
  });
  it('returns defensive diagnostics, recognizes cloned deltas and bounds AI without resource creation', () => {
    const s = initial(), copy = cloneSimulationState(s);
    copy.socioeconomy.regions.a.cohorts[0].persons++;
    expect(copy.socioeconomy).not.toEqual(s.socioeconomy);
    expect(simulationDelta(s, cloneSimulationState(s)).changedDomains).toEqual([]);
    expect(simulationDelta(s, copy).changedDomains).toContain('socioeconomy');
    const debug = inspectSocioeconomy(s, 'a'); debug.cohorts[0].persons++;
    expect(debug.cohorts).not.toEqual(s.socioeconomy.regions.a.cohorts);
    s.socioeconomy.playerCountryIds = ['a'];
    const end = advanceSimulationDays(s, 1000);
    expect(end.socioeconomy.administration.every(e => e.countryId === 'b')).toBe(true);
    expect(end.socioeconomy.administration).toHaveLength(24);
    expect(economy(end)).toEqual(economy(s));
  });
});
