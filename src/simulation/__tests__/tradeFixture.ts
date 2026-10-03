import type { RegionEntity, SimulationState } from '../../types';
import { emptyMilitary } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptySocioeconomy } from '../socioeconomy/model';
import { emptyTrade } from '../trade/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { initializeFiscal } from '../fiscal/runtime';
import { initializeMilitary } from '../military/runtime';
import { initializeTrade, admitTradeMarket, admitTradeRoute } from '../trade/runtime';
import { createEngineState } from '../state';
import { advanceSimulationDays } from '../engine';
import { syntheticTradeMarket, SYNTHETIC_TRADE_SOURCE } from '../trade/scenario';
import { assignPoliticalOffice, createPoliticalPerson, setControlledPerson } from '../governance/runtime';

export const tradeCountries = ['country.u6myyj', 'country.1aj872z', 'country.zwicjl', 'country.97e14s'];
export const tradeRegions: RegionEntity[] = tradeCountries.map((id, i) => ({
  id: `region.trade-fixture-${i}`, commonName: `Explicit synthetic trade Region ${i}`,
  parentCountryId: id, initialOwnerCountryId: id, administrativeLevel: 1, externalIds: {},
  geographyMapping: { status: 'mapped', datasetId: 'synthetic-trade-fixture', sourceFeatureIds: [String(i)] },
}));
export const tradeContext = { regions: tradeRegions, countryIds: new Set(tradeCountries), regionIds: new Set(tradeRegions.map(r => r.id)) };
export function tradeFixture(admit = true): SimulationState {
  let state: SimulationState = { schemaVersion: 15, trade: emptyTrade(), military: emptyMilitary(),
    fiscal: emptyFiscal(), crisis: emptyCrisis(), politics: emptyPolitics(), socioeconomy: emptySocioeconomy(),
    governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'),
    date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {},
    regionOwnership: Object.fromEntries(tradeRegions.map(r => [r.id, r.initialOwnerCountryId])),
    populationByRegion: Object.fromEntries(tradeRegions.map(r => [r.id, 10000])),
    economicOutputByRegion: Object.fromEntries(tradeRegions.map(r => [r.id, 1200000000])),
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {},
    engine: createEngineState(tradeCountries, 'explicit-synthetic-trade-test') };
  state = initializeTrade(initializeMilitary(initializeFiscal(initializeSocioeconomy(state, tradeRegions))));
  state = createPoliticalPerson(state, { countryId: tradeCountries[0], displayName: 'Explicit synthetic trade executive' });
  const person = Object.keys(state.governance.persons)[0];
  state = setControlledPerson(assignPoliticalOffice(state, person, { countryId: tradeCountries[0], role: 'head_of_government' }), person);
  if (!admit) return state;
  for (const [i, countryId] of tradeCountries.entries()) state = admitTradeMarket(state, countryId, syntheticTradeMarket('food', {
    productionPerMonth: i < 2 ? 120 : 0, domesticNeedPerMonth: i < 2 ? 20 : 0,
    importNeedPerMonth: i < 2 ? 0 : 80, strategicUse: 'Represented food purchases',
    domesticReplacementCapacity: i < 2 ? 0 : 30, domesticReplacementPerMonth: 3,
    priceMicroUsd: i === 1 ? 11000000000 : 10000000000,
    baselinePriceMicroUsd: i === 1 ? 11000000000 : 10000000000,
  }));
  for (const exporter of tradeCountries.slice(0, 2)) for (const importer of tradeCountries.slice(2)) {
    state = admitTradeRoute(state, { id: `route.fixture:${exporter}:${importer}:food`, exporterId: exporter,
      importerId: importer, category: 'food', source: { ...SYNTHETIC_TRADE_SOURCE },
      capacityPerMonth: 100, establishedCapacity: 60, expansionPerMonth: 10, logisticsBps: 250, tariffBps: 500 });
  }
  return state;
}
export function tradeMonth(state: SimulationState): SimulationState {
  let next = advanceSimulationDays(state, 1);
  while (!next.date.endsWith('-01')) next = advanceSimulationDays(next, 1);
  return next;
}
