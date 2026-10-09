import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { SimulationClock } from '../clock';
import { createEngineState } from '../state';
import { emptySocioeconomy, NO_SHOCK } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { controlledBaselinePopulation, controlledBaselineAnnualOutput, simulatedPopulationByCountry, simulatedMonthlyOutputByCountry, transferRegion } from '../region';
import { restoreSimulationState, serializeSimulationState } from '../save';

const regions: RegionEntity[] = ['a', 'b'].map(id => ({ id, parentCountryId: id, initialOwnerCountryId: id, commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } }));
const base = (): SimulationState => ({ schemaVersion: 19, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {}, regionOwnership: { a: 'a', b: 'b' }, populationByRegion: { a: 10000, b: 10000 }, economicOutputByRegion: { a: 12000000, b: 24000000 }, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(['a', 'b']), socioeconomy: emptySocioeconomy() });
const initialized = () => initializeSocioeconomy(base(), regions);

describe('immutable cached UI snapshots', () => {
  it('reuses untouched branches across actual days and replaces monthly flows without copying cohorts', () => {
    const clock = new SimulationClock(initialized());
    const first = clock.snapshot(), day1 = clock.advanceIfChanged(1000)!, day2 = clock.advanceIfChanged(1000)!;
    expect(day1.date).toBe('2026-01-02'); expect(day2.engine.tick).toBe(2);
    expect(first).not.toBe(day1);
    expect(first.socioeconomy).toBe(day1.socioeconomy);
    expect(day1.socioeconomy).toBe(day2.socioeconomy);
    expect(first.regionOwnership).toBe(day2.regionOwnership);
    expect(first.populationByRegion).toBe(day2.populationByRegion);
    expect(first.engine.fidelityByCountry).toBe(day2.engine.fidelityByCountry);
    const monthly = clock.advanceIfChanged(29000)!;
    expect(monthly.date).toBe('2026-02-01');
    expect(monthly.socioeconomy).not.toBe(day2.socioeconomy);
    expect(monthly.socioeconomy.regions.a.economy).not.toBe(day2.socioeconomy.regions.a.economy);
    expect(monthly.socioeconomy.regions.a.cohorts).toBe(first.socioeconomy.regions.a.cohorts);
    expect(first.socioeconomy.lastMonthlyDate).toBeUndefined();
    expect(clock.snapshot()).toBe(monthly);
  });
  it('deeply freezes UI copies, isolates constructor input and protects the engine and other readers', () => {
    const input = initialized(), clock = new SimulationClock(input), snapshot = clock.snapshot();
    input.socioeconomy.regions.a.cohorts[0].persons = 999;
    expect(snapshot.socioeconomy).not.toBe(input.socioeconomy);
    expect(() => { snapshot.socioeconomy.regions.a.cohorts[0].persons = 0; }).toThrow(TypeError);
    expect(() => { snapshot.socioeconomy.regions.a.economy!.shock.capacityBps = 0; }).toThrow(TypeError);
    expect(() => { snapshot.socioeconomy.regions.a.populationProvenance.inputs.push({ dataset: 'bad', referenceDate: '2026' }); }).toThrow(TypeError);
    expect(() => { snapshot.regionOwnership.a = 'b'; }).toThrow(TypeError);
    expect(() => { snapshot.engine.tick = 999; }).toThrow(TypeError);
    expect(() => { snapshot.date = '2100-01-01'; }).toThrow(TypeError);
    const next = clock.advance(1000);
    expect(next.regionOwnership.a).toBe('a'); expect(next.engine.tick).toBe(1);
    expect(next.socioeconomy.regions.a.cohorts).toEqual(initialized().socioeconomy.regions.a.cohorts);
    expect(next.socioeconomy).toBe(snapshot.socioeconomy);
  });
  it.each([1, 2, 5] as const)('preserves pause, fractional days and speed x%s', speed => {
    const clock = new SimulationClock({ ...initialized(), paused: true });
    clock.setSpeed(speed);
    const paused = clock.snapshot();
    expect(clock.advanceIfChanged(5000)).toBeUndefined();
    expect(clock.advance(5000)).toBe(paused);
    clock.setPaused(false);
    expect(clock.advanceIfChanged(100)).toBeUndefined();
    const running = clock.advanceIfChanged(900)!;
    expect(running.engine.tick).toBe(speed);
    expect(running.date).toBe(`2026-01-${String(1 + speed).padStart(2, '0')}`);
    expect(running.socioeconomy).toBe(paused.socioeconomy);
  });
  it('invalidates changed regions for immediate shocks while sharing unrelated regions', () => {
    const clock = new SimulationClock(initialized()), before = clock.snapshot();
    clock.setEconomicShock('a', { ...NO_SHOCK, capacityBps: 8000 });
    const requested = clock.snapshot(), projected = clock.advance(1000);
    expect(requested.socioeconomy).not.toBe(before.socioeconomy);
    expect(projected.socioeconomy).not.toBe(requested.socioeconomy);
    expect(projected.socioeconomy.regions.b).toBe(before.socioeconomy.regions.b);
    expect(projected.socioeconomy.regions.a.cohorts).toBe(before.socioeconomy.regions.a.cohorts);
    expect(before.socioeconomy.regions.a.economy!.capacity).toBe(1000000);
    expect(projected.socioeconomy.regions.a.economy!.capacity).toBe(800000);
    clock.setDiplomacy({ bilateralRelations: {}, claims: [], explicitCasusBelli: [] });
    clock.setWars({ wars: [], occupationByRegion: {} });
    expect(clock.snapshot().socioeconomy).toBe(projected.socioeconomy);
  });
});

describe('baseline references versus current Country aggregates', () => {
  it('distinguishes current persons and monthly dollars from immutable reference maps', () => {
    const s = initialized();
    s.socioeconomy.regions.a.population = 1234;
    s.socioeconomy.regions.a.economy!.output = 456;
    expect(controlledBaselinePopulation(s, 'a')).toBe(10000);
    expect(controlledBaselineAnnualOutput(s, 'a')).toBe(12000000);
    expect(simulatedPopulationByCountry(s, 'a')).toBe(1234);
    expect(simulatedMonthlyOutputByCountry(s, 'a')).toBe(456);
    const transferred = transferRegion(s, 'b', 'b', 'a');
    expect(simulatedPopulationByCountry(transferred, 'a')).toBe(11234);
    expect(simulatedMonthlyOutputByCountry(transferred, 'a')).toBe(2000456);
    expect(simulatedMonthlyOutputByCountry(transferred, 'b')).toBeUndefined();
  });
  it('never substitutes baseline data for unknown current values or reports partial totals', () => {
    const s = transferRegion(initialized(), 'b', 'b', 'a');
    s.socioeconomy.regions.b.population = undefined;
    s.socioeconomy.regions.b.economy = undefined;
    expect(simulatedPopulationByCountry(s, 'a')).toBeUndefined();
    expect(simulatedMonthlyOutputByCountry(s, 'a')).toBeUndefined();
    expect(controlledBaselinePopulation(s, 'a')).toBe(20000);
    const zero = initialized(); zero.socioeconomy.regions.a.population = 0; zero.socioeconomy.regions.a.economy!.output = 0;
    expect(simulatedPopulationByCountry(zero, 'a')).toBe(0);
    expect(simulatedMonthlyOutputByCountry(zero, 'a')).toBe(0);
  });
  it('allows reference initialization, rejects post-initialization changes including after reload', () => {
    const boot = new SimulationClock(base());
    const population = { a: 123 };
    boot.setPopulationByRegion(population); population.a = 999;
    boot.setEconomicOutputByRegion({ a: 456 });
    expect(boot.snapshot().populationByRegion.a).toBe(123);
    expect(boot.snapshot().economicOutputByRegion.a).toBe(456);
    const context = { countryIds: new Set(['a', 'b']), regionIds: new Set(['a', 'b']) };
    const saved = restoreSimulationState(serializeSimulationState(initialized()), regions, {}, {}, context);
    for (const initial of [initialized(), saved]) {
      const clock = new SimulationClock(initial), before = clock.snapshot();
      expect(() => clock.setPopulationByRegion({ a: 1 })).toThrow(/initialization-only/);
      expect(() => clock.setEconomicOutputByRegion({ a: 1 })).toThrow(/initialization-only/);
      expect(clock.snapshot()).toBe(before);
    }
  });
});
