import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants } from '../invariants';
import { serializeSimulationState, restoreSimulationState } from '../save';
import { SimulationClock } from '../clock';
import { configureSyntheticMilitaryScenario } from '../military/scenario';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { placeMilitaryOrder } from '../military/runtime';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';

describe('military0.16 actual252-Country world workload', () => {
  it('measures ordinary/monthly cadence, bounded reporting, saves and deterministic active synthetic continuation', () => {
    const started = performance.now();
    let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    const initializationMs = performance.now() - started;
    expect(Object.values(state.military.countries)).toHaveLength(252);
    expect(Object.values(state.military.countries).every(c => c.status === 'unavailable')).toBe(true);
    const countryId = 'country.u6myyj';
    const calibration = structuredClone(state.fiscal.countries[countryId].revenueCalibration);
    state = configureSyntheticMilitaryScenario(state, countryId);
    state = createPoliticalPerson(state, { countryId, displayName: 'Explicit synthetic benchmark executive' });
    const person = `person.${String(state.governance.nextPersonSequence - 1).padStart(8, '0')}`;
    state = setControlledPerson(assignPoliticalOffice(state, person, { countryId, role: 'head_of_government' }), person);
    state = placeMilitaryOrder(state, countryId, person, 'truck', 2);
    const clock = new SimulationClock(state);
    let ordinaryMs = 0, monthlyMs = 0, weeklyMs = 0, ordinary = 0, monthly = 0, weekly = 0;
    for (let day = 0; day < 31; day++) {
      const began = performance.now();
      const next = clock.advance(1000);
      const elapsed = performance.now() - began;
      if (next.date.endsWith('-01')) { monthlyMs += elapsed; monthly++; }
      else if (new Date(`${next.date}T00:00:00.000Z`).getUTCDay() === 1) { weeklyMs += elapsed; weekly++; }
      else { ordinaryMs += elapsed; ordinary++; }
    }
    state = clock.snapshot();
    expect(state.engine.tick).toBe(31); expect(monthly).toBe(1); expect(weekly).toBe(4);
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
    expect(state.fiscal.countries[countryId].revenueCalibration).toEqual(calibration);
    expect(state.wars).toEqual([]); expect(state.regionOwnership).toEqual(worldBase().regionOwnership); expect(state.occupationByRegion).toEqual({});
    const snapshotStarted = performance.now(); clock.snapshot(); const snapshotMs = performance.now() - snapshotStarted;
    const coldClock = new SimulationClock(state), coldStarted = performance.now(); coldClock.snapshot(); const coldSnapshotMs = performance.now() - coldStarted;
    const saveStarted = performance.now(); const saved = serializeSimulationState(state, worldContext); const saveMs = performance.now() - saveStarted;
    const reloadStarted = performance.now(); const restored = restoreSimulationState(saved, worldRegions, {}, {}, worldContext); const reloadMs = performance.now() - reloadStarted;
    expect(restored).toEqual(state);
    expect(advanceSimulationDays(restored, 7)).toEqual(advanceSimulationDays(state, 7));
    const reports = state.information.militaryReports!;
    expect(Object.keys(reports.latest)).toHaveLength(252);
    expect(Object.keys(reports.byId).length).toBeLessThanOrEqual(252 + state.information.briefings.length);
    expect(reports.latest['country.zwicjl'].historicalReference?.regularPersonnelReported).toBe(136960);
    expect(reports.latest['country.zwicjl'].data).toBeUndefined();
    console.info(`MILITARY_WORLD_BENCHMARK ${JSON.stringify({ countries: 252, regions: worldRegions.length, activeSyntheticCapabilities: 1,
      days: 31, ordinary, monthly, weekly, initializationMs, ordinaryAverageMs: ordinaryMs / ordinary, monthlyAverageMs: monthlyMs / monthly, weeklyAverageMs: weeklyMs / weekly,
      cachedSnapshotMs: snapshotMs, coldSnapshotMs, saveMs, reloadMs, saveBytes: Buffer.byteLength(saved), retainedReports: Object.keys(reports.byId).length })}`);
  }, 30000);
});
