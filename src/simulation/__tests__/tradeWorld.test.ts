import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants } from '../invariants';
import { serializeSimulationState, restoreSimulationState } from '../save';
import { SimulationClock } from '../clock';
import { configureSyntheticMilitaryScenario } from '../military/scenario';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { admitTradeMarket, admitTradeRoute } from '../trade/runtime';
import { syntheticTradeMarket, SYNTHETIC_TRADE_SOURCE } from '../trade/scenario';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import registry from '../../data/entity-registry.json';

describe('trade0.17 actual252-Country4574-Region sparse multicategory workload', () => {
  it('measures twelve material trade months, snapshots, saved reports and deterministic active continuation', () => {
    const started = performance.now();
    let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    const initializationMs = performance.now() - started;
    expect(worldCountryIds).toHaveLength(252); expect(worldRegions).toHaveLength(4574);
    const calibration = Object.fromEntries(Object.entries(state.fiscal.countries).map(([id, c]) => [id, structuredClone(c.revenueCalibration)]));
    const iso = ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'CHN', 'JPN', 'IND'];
    const participants = iso.map(code => {
      const matches = registry.countries.filter(c => c.externalIds.isoAlpha3 === code);
      if (matches.length !== 1) throw new Error('Ambiguous permanent benchmark Country mapping.');
      return matches[0].id;
    });
    const configured = performance.now();
    for (const category of ['food', 'energy', 'raw_materials', 'industrial_goods', 'consumer_goods'] as const) {
      const industrial = category === 'industrial_goods' || category === 'raw_materials';
      for (const [i, id] of participants.entries()) {
        state = admitTradeMarket(state, id, syntheticTradeMarket(category, {
          productionPerMonth: i < 4 ? 160 : 0, domesticNeedPerMonth: i < 4 ? 20 : 0,
          importNeedPerMonth: i < 4 ? 0 : 120, use: industrial ? 'industrial' : 'household',
          domesticReplacementCapacity: i < 4 ? 0 : 40, domesticReplacementPerMonth: 2,
          strategicUse: 'Explicit synthetic represented household or productive resource need',
          ...(category === 'industrial_goods' && i === 0 ? { militaryInputPerFactoryUnit: 2 } : {}),
          stock: { opening: 10, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 10, capacity: 100, target: 20 },
          priceMicroUsd: 10000000000 + i * 100000000, baselinePriceMicroUsd: 10000000000 + i * 100000000,
        }));
      }
      for (const exporter of participants.slice(0, 4)) for (const importer of participants.slice(4)) {
        state = admitTradeRoute(state, { id: `route.benchmark:${category}:${exporter}:${importer}`, exporterId: exporter,
          importerId: importer, category, source: { ...SYNTHETIC_TRADE_SOURCE }, capacityPerMonth: 50,
          establishedCapacity: 30, expansionPerMonth: 5, logisticsBps: 250, tariffBps: 500 });
      }
    }
    state = configureSyntheticMilitaryScenario(state, participants[0]);
    state = createPoliticalPerson(state, { countryId: participants[0], displayName: 'Explicit synthetic trade benchmark executive' });
    const person = `person.${String(state.governance.nextPersonSequence - 1).padStart(8, '0')}`;
    state = setControlledPerson(assignPoliticalOffice(state, person, { countryId: participants[0], role: 'head_of_government' }), person);
    const scenarioConfigurationMs = performance.now() - configured;
    const clock = new SimulationClock(state), annualStarted = performance.now();
    let ordinaryMs = 0, monthlyMs = 0, weeklyMs = 0, ordinary = 0, monthly = 0, weekly = 0;
    let peakActiveFlows = 0;
    for (let day = 0; day < 365; day++) {
      const began = performance.now(), next = clock.advance(1000), elapsed = performance.now() - began;
      if (next.date.endsWith('-01')) {
        monthlyMs += elapsed; monthly++; peakActiveFlows = Math.max(peakActiveFlows, next.trade.flows.length);
      } else if (new Date(`${next.date}T00:00:00.000Z`).getUTCDay() === 1) { weeklyMs += elapsed; weekly++; }
      else { ordinaryMs += elapsed; ordinary++; }
    }
    const annualMs = performance.now() - annualStarted;
    state = clock.snapshot();
    expect(state.engine.tick).toBe(365); expect(state.date).toBe('2027-01-01'); expect(monthly).toBe(12);
    expect(state.trade.routes).toHaveLength(80); expect(state.trade.flows.length).toBeGreaterThan(20);
    expect(peakActiveFlows).toBeLessThanOrEqual(80);
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
    for (const [id, c] of Object.entries(state.fiscal.countries)) expect(c.revenueCalibration).toEqual(calibration[id]);
    expect(state.wars).toEqual([]); expect(state.regionOwnership).toEqual(worldBase().regionOwnership); expect(state.occupationByRegion).toEqual({});
    const snapshotStarted = performance.now(); clock.snapshot(); const warmSnapshotMs = performance.now() - snapshotStarted;
    const coldClock = new SimulationClock(state), coldStarted = performance.now(); coldClock.snapshot(); const coldSnapshotMs = performance.now() - coldStarted;
    const saveStarted = performance.now(), saved = serializeSimulationState(state, worldContext), serializeMs = performance.now() - saveStarted;
    const reloadStarted = performance.now(), restored = restoreSimulationState(saved, worldRegions, {}, {}, worldContext), reloadMs = performance.now() - reloadStarted;
    expect(restored).toEqual(state);
    expect(advanceSimulationDays(restored, 35)).toEqual(advanceSimulationDays(state, 35));
    const reports = state.information.tradeReports!;
    expect(Object.keys(reports.latest)).toHaveLength(252);
    expect(Object.keys(reports.byId).length).toBeLessThanOrEqual(252 + state.information.briefings.length);
    const dependencies = Object.values(reports.latest).reduce((n, r) => n + (r.data?.dependencies.length ?? 0), 0);
    expect(dependencies).toBeGreaterThan(0);
    console.info(`TRADE_WORLD_BENCHMARK ${JSON.stringify({
      countries: 252, regions: 4574, syntheticTradeCountries: 8, configuredCategories: 5, admittedMarkets: 40,
      routes: 80, activeFlows: state.trade.flows.length, peakActiveFlows, derivedDependencies: dependencies,
      days: 365, monthly, weekly, ordinary, initializationMs, scenarioConfigurationMs, annualMs,
      ordinaryAverageMs: ordinaryMs / ordinary, monthlyAverageMs: monthlyMs / monthly, weeklyAverageMs: weeklyMs / weekly,
      warmSnapshotMs, coldSnapshotMs, serializeMs, reloadMs, saveBytes: Buffer.byteLength(saved),
      retainedTradeReports: Object.keys(reports.byId).length, deterministicContinuationDays: 35,
      limitation: 'Explicit synthetic resource/capacity assumptions on the real permanent world registry. Not factual world-trade calibration. CPU timing is local and sensitive to concurrent host load.',
    })}`);
  }, 600000);
});
