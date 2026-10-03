import type { SimulationState } from '../../types';
import { admitTradeMarket, admitTradeRoute } from './runtime';
import type { TradeCategory, TradeMarket, TradeSource } from './model';

export const SYNTHETIC_TRADE_SOURCE: Readonly<TradeSource> = Object.freeze({
  status: 'modelled', publisher: 'ProjectAtlas explicit synthetic trade demonstration',
  dataset: 'Synthetic aggregate resource and capacity assumptions, not empirical calibration',
  url: 'scenario:synthetic-trade-0.17', referenceDate: '2026-01-01', publishedOn: '2026-01-01',
  retrievedAt: '2026-10-03', licence: 'ProjectAtlas synthetic scenario (ISC)',
  attribution: 'ProjectAtlas', synthetic: true,
  transformation: 'Explicit aggregate units and independently declared resource ceilings; existing residual production and spending constrain fulfillment.',
  limitation: 'No factual national sector production, strategic stock, tariff, logistics, quantity or dependency claim. No funds, income, population, army, office or diplomatic authority are created.',
});
export function syntheticTradeMarket(category: TradeCategory, values: Partial<Omit<TradeMarket, 'category' | 'source'>> = {}): TradeMarket {
  return { category, source: { ...SYNTHETIC_TRADE_SOURCE }, unit: 'synthetic_aggregate_unit',
    productionPerMonth: 0, domesticNeedPerMonth: 0, importNeedPerMonth: 0,
    domesticReplacementCapacity: 0, domesticReplacementPerMonth: 0, replacementQuantity: 0,
    use: 'household', strategicUse: null, priceMicroUsd: 10000000000, baselinePriceMicroUsd: 10000000000,
    importCapacityPerMonth: 200, exportCapacityPerMonth: 200, ...values };
}
export function configureSyntheticTradeScenario(state: SimulationState, selectedCountryId: string): SimulationState {
  if (state.engine.tick !== 0 || state.governance.player.controlledPersonId) throw new Error('The explicit synthetic trade demonstration is initialization-only before player selection.');
  const candidates = ['country.u6myyj', 'country.1aj872z', 'country.zwicjl', 'country.97e14s']
    .filter(id => id !== selectedCountryId && state.trade.countries[id]
      && Object.keys(state.socioeconomy.regions).some(r => state.regionOwnership[r] === id && state.socioeconomy.regions[r].economy))
    .slice(0, 2);
  if (!state.trade.countries[selectedCountryId] || candidates.length < 2) throw new Error('The explicit trade demonstration needs a selected economic recipient and two existing economic partners.');
  let next = state;
  for (const category of ['food', 'energy', 'industrial_goods'] as const) {
    const industrial = category === 'industrial_goods';
    next = admitTradeMarket(next, selectedCountryId, syntheticTradeMarket(category, {
      productionPerMonth: industrial ? 4 : 10, domesticNeedPerMonth: industrial ? 8 : 20, importNeedPerMonth: 50,
      domesticReplacementCapacity: 30, domesticReplacementPerMonth: 2,
      use: industrial ? 'industrial' : 'household', strategicUse: industrial ? 'Supplementary factory input throughput' : 'Represented essential purchases',
      ...(industrial ? { militaryInputPerFactoryUnit: 1 } : {}),
      stock: { opening: 10, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 10, target: 10, capacity: 100 },
    }));
    for (const [index, id] of candidates.entries()) {
      next = admitTradeMarket(next, id, syntheticTradeMarket(category, {
        productionPerMonth: 100, domesticNeedPerMonth: 20, use: industrial ? 'industrial' : 'household',
        priceMicroUsd: 10000000000 + index * 1000000000, baselinePriceMicroUsd: 10000000000 + index * 1000000000,
      }));
      next = admitTradeRoute(next, { id: `route.synthetic-demo:${category}:${id}:${selectedCountryId}`,
        exporterId: id, importerId: selectedCountryId, category, source: { ...SYNTHETIC_TRADE_SOURCE },
        capacityPerMonth: 60, establishedCapacity: index ? 10 : 30, expansionPerMonth: 5, logisticsBps: 250, tariffBps: 500 });
    }
  }
  return next;
}
