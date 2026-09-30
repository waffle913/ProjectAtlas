/// <reference types="node" />
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { SimulationClock } from '../clock';
import { createCoreScheduler } from '../engine';
import { initializeNewGame } from '../initialization';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { createSimulationSnapshotCache } from '../state';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';

const fullWorld = () => initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);

describe('full-world politics 0.13', () => {
  it('initializes complete Country coverage with honest source status and stable identities', () => {
    const state = fullWorld();
    expect(state.schemaVersion).toBe(11); expect(state.politics.initializedOn).toBe('2026-01-01'); expect(state.politics.lastOpinionUpdate).toBeUndefined();
    expect(Object.keys(state.politics.countries)).toHaveLength(252); expect(Object.keys(state.politics.institutions)).toHaveLength(252);
    expect(Object.keys(state.politics.partyRegistry)).toHaveLength(756); expect(Object.keys(state.politics.organizationRegistry)).toHaveLength(504);
    expect(Object.keys(state.politics.regionalOpinion)).toHaveLength(4_574);
    expect(Object.keys(state.politics.countries).sort()).toEqual([...worldCountryIds].sort());
    expect(Object.keys(state.politics.regionalOpinion).sort()).toEqual(worldRegions.map(region => region.id).sort());
    const coverages = Object.values(state.politics.countries).map(country => country.coverage.institutions);
    expect(coverages.filter(status => status === 'partial')).toHaveLength(199); expect(coverages.filter(status => status === 'unavailable')).toHaveLength(53);
    expect(Object.values(state.politics.countries).every(country => country.coverage.legislature === 'unavailable' && country.coverage.seats === 'unavailable' && country.coverage.coalition === 'unavailable')).toBe(true);
    expect(Object.values(state.politics.partyRegistry).every(party => party.fictional && ['Social Compact', 'Civic Centre', 'National Stewardship'].includes(party.displayName))).toBe(true);
    expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true);
  }, 30_000);

  it('updates weekly through the shared scheduler and preserves copy-on-write branches', () => {
    const clock = new SimulationClock(fullWorld());
    const friday = clock.snapshot(), saturday = clock.advanceIfChanged(1_000)!, sunday = clock.advanceIfChanged(1_000)!, monday = clock.advanceIfChanged(1_000)!;
    expect([friday.date, saturday.date, sunday.date, monday.date]).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
    expect(friday.politics).toBe(saturday.politics); expect(saturday.politics).toBe(sunday.politics); expect(sunday.politics).toBe(monday.politics);
    const evaluated = clock.advanceIfChanged(1_000)!;
    expect(evaluated.date).toBe('2026-01-05'); expect(evaluated.politics).not.toBe(monday.politics); expect(evaluated.politics.lastOpinionUpdate).toBe('2026-01-05');
    expect(evaluated.socioeconomy).toBe(monday.socioeconomy); expect(evaluated.fiscal).toBe(monday.fiscal); expect(evaluated.crisis).toBe(monday.crisis);
  }, 30_000);

  it('benchmarks three years of deterministic full-world weekly opinion', () => {
    let state = fullWorld(), weeklyRuns = 0;
    const scheduler = createCoreScheduler(), started = performance.now();
    for (let day = 0; day < 1_095; day++) {
      const result = scheduler.advanceOneDay(state); state = result.state;
      if (result.trace.some(item => item.taskId === 'politics.opinion-weekly')) weeklyRuns++;
    }
    const elapsedMs = performance.now() - started;
    expect(weeklyRuns).toBe(156); expect(state.politics.weeklyEvaluations).toBe(156 * 4_574);
    expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true);
    const snapshot = createSimulationSnapshotCache(), snapshotStarted = performance.now(), coldSnapshot = snapshot(state), coldSnapshotMs = performance.now() - snapshotStarted;
    const reusedStarted = performance.now(), reusedSnapshot = snapshot(state), reusedSnapshotMs = performance.now() - reusedStarted;
    expect(reusedSnapshot).toBe(coldSnapshot);
    const serialized = serializeSimulationState(state, worldContext), reloadStarted = performance.now();
    const restored = restoreSimulationState(serialized, worldRegions, {}, {}, worldContext), reloadMs = performance.now() - reloadStarted;
    expect(restored).toEqual(state);
    const chambers = Object.values(state.politics.institutions).flatMap(institution => institution.chambers);
    const result = {
      benchmark: 'projectatlas-politics-0.13', years: 3, countries: Object.keys(state.politics.countries).length,
      regions: Object.keys(state.politics.regionalOpinion).length, cohorts: Object.values(state.politics.regionalOpinion).reduce((sum, region) => sum + Object.keys(region.cohorts).length, 0),
      parties: Object.keys(state.politics.partyRegistry).length, unions: Object.values(state.politics.organizationRegistry).filter(item => item.type === 'union').length,
      associations: Object.values(state.politics.organizationRegistry).filter(item => item.type === 'association').length,
      chambers: chambers.length, representedSeats: chambers.reduce((sum, chamber) => sum + (chamber.totalSeats ?? 0), 0),
      partialInstitutions: Object.values(state.politics.countries).filter(item => item.coverage.institutions === 'partial').length,
      unavailableInstitutions: Object.values(state.politics.countries).filter(item => item.coverage.institutions === 'unavailable').length,
      weeklyRuns, cohortRegionEvaluations: state.politics.weeklyEvaluations, ticks: state.engine.tick,
      elapsedMs: Number(elapsedMs.toFixed(2)), ticksPerSecond: Math.round(1_095_000 / elapsedMs), coldSnapshotMs: Number(coldSnapshotMs.toFixed(2)), reusedSnapshotMs: Number(reusedSnapshotMs.toFixed(4)), reloadMs: Number(reloadMs.toFixed(2)), saveBytes: Buffer.byteLength(serialized),
    };
    console.info(`POLITICS_WORLD_BENCHMARK ${JSON.stringify(result)}`);
    expect(serialized).not.toMatch(/NaN|Infinity/);
  }, 120_000);
});
