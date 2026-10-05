import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants } from '../invariants';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';

const sumRegions = (state: { populationByRegion: Record<string, number | undefined> }) => {
  let total = 0;
  for (const value of Object.values(state.populationByRegion)) total += value ?? 0;
  return total;
};
const cohortTotal = (state: ReturnType<typeof initializeNewGame>) => {
  let total = 0;
  for (const region of Object.values(state.socioeconomy.regions)) total += region.population ?? 0;
  return total;
};
const finite = (value: unknown): boolean => Number.isFinite(value as number);

describe('0.21 V1 baseline endurance', () => {
  it('runs a full-world 365-day baseline with periodic invariant validation and bounded history', () => {
    let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    const startPopulation = sumRegions(state);
    const started = performance.now();
    let monthlyChecks = 0;
    for (let day = 0; day < 365; day++) {
      state = advanceSimulationDays(state, 1);
      if (state.date.endsWith('-01')) {
        expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
        monthlyChecks += 1;
      }
    }
    const elapsed = performance.now() - started;
    expect(monthlyChecks).toBeGreaterThanOrEqual(12);
    expect(sumRegions(state)).toBe(startPopulation);
    expect(cohortTotal(state)).toBe(sumRegions(state));
    for (const region of Object.values(state.socioeconomy.regions)) {
      if (region.population !== undefined) expect(region.population).toBeGreaterThanOrEqual(0);
    }
    for (const country of Object.values(state.fiscal.countries)) {
      expect(finite(country.debt)).toBe(true);
      expect(country.debt).toBeGreaterThanOrEqual(0);
    }
    expect(state.information.briefings.length).toBeLessThanOrEqual(2048);
    expect(Object.keys(state.multilateral.treaties)).toHaveLength(0);
    expect(Object.keys(state.multilateral.organizations)).toHaveLength(0);
    console.info(`V1_ENDURANCE ${JSON.stringify({ days: 365, monthlyChecks, startPopulation, endPopulation: sumRegions(state), tradeFlows: state.trade.flows.length, briefings: state.information.briefings.length, elapsedMs: Math.round(elapsed) })}`);
  }, 900000);
});
