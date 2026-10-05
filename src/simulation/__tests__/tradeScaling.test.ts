import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyMilitary } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptySocioeconomy } from '../socioeconomy/model';
import { emptyTrade, TRADE_CATEGORIES } from '../trade/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { initializeFiscal } from '../fiscal/runtime';
import { initializeMilitary } from '../military/runtime';
import { initializeTrade, admitTradeMarket, admitTradeRoute } from '../trade/runtime';
import { createEngineState } from '../state';
import { advanceSimulationDays } from '../engine';
import { syntheticTradeMarket, SYNTHETIC_TRADE_SOURCE } from '../trade/scenario';
import { assertSimulationInvariants } from '../invariants';

const scalingCountries = Array.from({ length: 20 }, (_, i) => `country.scaling-${i}`);
const scalingRegions: RegionEntity[] = scalingCountries.map((id, i) => ({
  id: `region.scaling-${i}`, commonName: `Synthetic scaling Region ${i}`, parentCountryId: id,
  initialOwnerCountryId: id, administrativeLevel: 1, externalIds: {},
  geographyMapping: { status: 'mapped', datasetId: 'synthetic-trade-scaling', sourceFeatureIds: [String(i)] },
}));
const scalingContext = { regions: scalingRegions, countryIds: new Set(scalingCountries), regionIds: new Set(scalingRegions.map(r => r.id)) };

function scalingFixture(): SimulationState {
  let state: SimulationState = {
    schemaVersion: 18, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), trade: emptyTrade(), military: emptyMilitary(), fiscal: emptyFiscal(), crisis: emptyCrisis(),
    politics: emptyPolitics(), socioeconomy: emptySocioeconomy(), governance: emptyGovernance('2026-01-01'),
    information: emptyInformation('2026-01-01'), date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {},
    regionOwnership: Object.fromEntries(scalingRegions.map(r => [r.id, r.initialOwnerCountryId])),
    populationByRegion: Object.fromEntries(scalingRegions.map(r => [r.id, 10000])),
    economicOutputByRegion: Object.fromEntries(scalingRegions.map(r => [r.id, 1200000000])),
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {},
    engine: createEngineState(scalingCountries, 'explicit-synthetic-trade-scaling'),
  };
  state = initializeTrade(initializeMilitary(initializeFiscal(initializeSocioeconomy(state, scalingRegions))));
  return state;
}

function scalingMonth(state: SimulationState): SimulationState {
  let next = advanceSimulationDays(state, 1);
  while (!next.date.endsWith('-01')) next = advanceSimulationDays(next, 1);
  return next;
}

describe('trade 0.17 route allocation scaling', () => {
  it('allocates 1,100 exact-invoice routes deterministically without full rescanning behavior', () => {
    let state = scalingFixture();
    for (const [i, id] of scalingCountries.entries()) {
      for (const category of TRADE_CATEGORIES) {
        state = admitTradeMarket(state, id, syntheticTradeMarket(category, {
          productionPerMonth: i < 10 ? 30 : 0, domesticNeedPerMonth: 0, importNeedPerMonth: i < 10 ? 0 : 10,
          exportCapacityPerMonth: i < 10 ? 50 : 0, importCapacityPerMonth: i < 10 ? 0 : 50,
        }));
      }
    }
    for (const exporter of scalingCountries.slice(0, 10)) {
      for (const importer of scalingCountries.slice(10)) {
        for (const category of TRADE_CATEGORIES) {
          state = admitTradeRoute(state, {
            id: `route.scaling:${category}:${exporter}:${importer}`, exporterId: exporter, importerId: importer, category,
            source: { ...SYNTHETIC_TRADE_SOURCE }, capacityPerMonth: 50, establishedCapacity: 50, expansionPerMonth: 0,
            logisticsBps: 250, tariffBps: 500,
          });
        }
      }
    }
    expect(state.trade.routes).toHaveLength(10 * 10 * TRADE_CATEGORIES.length);
    const original = scalingMonth(state);
    const shuffled = structuredClone(state);
    shuffled.trade.routes.reverse();
    const reversed = scalingMonth(shuffled);
    expect(reversed.trade).toEqual(original.trade);
    expect(original.trade.flows.length).toBeGreaterThan(0);
    expect(assertSimulationInvariants(original, scalingContext, 'save')).toBe(true);
  });
});
