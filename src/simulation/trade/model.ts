import { integer, ratio, allocate } from '../socioeconomy/model';
import { isSimulationDate } from '../date';

export const TRADE_VERSION = 'trade-0.17-v1' as const;
export const TRADE_CATEGORIES = Object.freeze([
  'food', 'energy', 'raw_materials', 'consumer_goods', 'industrial_goods',
  'capital_goods', 'transport_equipment', 'chemicals_pharmaceuticals',
  'electronics', 'services', 'unclassified_goods',
] as const);
export type TradeCategory = typeof TRADE_CATEGORIES[number];
export const CATEGORY_REGISTRY = Object.freeze(Object.fromEntries(TRADE_CATEGORIES.map(id => [id, Object.freeze({
  id, essential: ['food', 'energy', 'chemicals_pharmaceuticals'].includes(id),
  limitation: 'Generic aggregate, not a precise HS product, national sector or observed strategic importance.',
})]))) as Readonly<Record<TradeCategory, { id: TradeCategory; essential: boolean; limitation: string }>>;
export const TRADE_MODEL = Object.freeze({
  priceAdjustmentBps: 500, maximumRoutes: 8192,
  maximumCategoriesPerCountry: TRADE_CATEGORIES.length, microUsd: 1000000,
});
export interface TradeSource {
  status: 'observed' | 'derived' | 'modelled';
  publisher: string; dataset: string; url: string;
  referenceDate: string; publishedOn: string | null; retrievedAt: string;
  licence: string; attribution: string; transformation: string; limitation: string;
  synthetic: boolean;
}
export interface TradeObservation {
  id: string; exporterId: string; importerId: string; category: TradeCategory;
  annualValueUsd: number; quantity?: number; quantityUnit?: string;
  temporalStatus: 'historical_prior'; coverage: 'partial'; source: TradeSource;
  availableOn: string;
  aggregateOnly?: boolean;
  originalCurrency?: string; originalAnnualValue?: number;
  inputs?: { publisher: string; dataset: string; url: string; referenceDate: string; publishedOn: string | null; retrievedAt: string; licence: string; attribution: string; limitation: string }[];
}
export interface TradeStock {
  opening: number; produced: number; received: number; consumed: number; exported: number;
  quantity: number; capacity: number; target: number;
}
export interface TradeMarket {
  category: TradeCategory; unit: string; source: TradeSource;
  productionPerMonth: number; domesticNeedPerMonth: number; importNeedPerMonth: number;
  domesticReplacementCapacity: number; domesticReplacementPerMonth: number; replacementQuantity: number;
  use: 'household' | 'industrial'; strategicUse: string | null;
  priceMicroUsd: number; baselinePriceMicroUsd: number;
  importCapacityPerMonth: number; exportCapacityPerMonth: number;
  stock?: TradeStock;
  militaryInputPerFactoryUnit?: number;
}
export interface TradeRoute {
  id: string; exporterId: string; importerId: string; category: TradeCategory;
  source: TradeSource; capacityPerMonth: number; establishedCapacity: number;
  expansionPerMonth: number; logisticsBps: number; tariffBps: number | null;
}
export interface TradeFlow {
  routeId: string; exporterId: string; importerId: string; category: TradeCategory; unit: string;
  date: string; quantity: number; priceMicroUsd: number; valueUsd: number;
  logisticsBps: number; logisticsUsd: number; tariffBps: number; customsUsd: number;
  landedUsd: number; customsCoverage: 'modelled';
}
export interface TradeCategoryLedger {
  category: TradeCategory; unit: string; priceMicroUsd: number;
  production: number; domesticConsumed: number; need: number;
  imports: number; exports: number; shortage: number;
  openingStock: number; closingStock: number; stocked: number; stockConsumed: number; received: number;
  productionBackingUsd: number; exportValueUsd: number; importValueUsd: number;
  importReferenceUsd: number;
  importPaymentUsd: number; logisticsUsd: number; customsUsd: number;
  purchasingBudgetUsd: number; unspentUsd: number;
  alternativeCapacity: number; replacementQuantity: number;
  militaryInputAvailable: number; militaryInputConsumed: number;
  productionCapacity: number; productionCapacityBackingUsd: number; exportableCapacity: number;
  exportDemandShortage: number;
}
export interface TradeAlternative {
  category: TradeCategory; unit: string; supplierId: string; routeId: string;
  exportableCapacity: number; exportedQuantity: number;
  remainingBackingUsd: number; priceMicroUsd: number;
  productionCapacityBackingUsd: number; nonExportProduction: number; exportValueUsd: number;
  spareSupply: number; spareCapacity: number; availableQuantity: number; source: TradeSource;
}
export interface TradeDependency {
  category: TradeCategory; unit: string; need: number; imports: number; importShareBps: number;
  suppliers: { countryId: string; quantity: number; shareBps: number }[];
  largestSupplierBps: number; topThreeBps: number; concentrationBps: number;
  alternativeCapacity: number; domesticReplacementCapacity: number; stockQuantity: number | null;
  strategic: boolean; strategicUse: string | null; explanation: string;
}
export interface TradeCountry {
  coverage: 'partial' | 'unavailable'; limitation: string;
  markets: Partial<Record<TradeCategory, TradeMarket>>;
  ledger?: { date: string; categories: TradeCategoryLedger[]; alternatives: TradeAlternative[] };
}
export interface TradePreparedRegion {
  owner: string; householdRequests: number[]; industrialBudgetUsd: number;
  importedGoodsByGroup: number[]; essentialImportsByGroup: number[];
  importedReferenceByGroup: number[];
  householdLandedByGroup: number[]; productionBackingUsd: number;
  netBudgetByGroup: number[]; nominalBudgetByGroup: number[];
  privateDemandUsd: number; publicDemandUsd: number;
  unspentNetBudgetByGroup: number[];
  budgetAsOfDate: string; openingDisposableByGroup: number[]; consumptionTaxRateBps: number | null;
}
export interface TradeState {
  version: typeof TRADE_VERSION; initializedOn?: string; lastMonthlyDate?: string;
  countries: Record<string, TradeCountry>; routes: TradeRoute[]; flows: TradeFlow[];
  prepared?: { date: string; regions: Record<string, TradePreparedRegion> };
}
export const emptyTrade = (initializedOn?: string): TradeState => ({
  version: TRADE_VERSION, initializedOn, countries: {}, routes: [], flows: [],
});
export const money = (quantity: number, priceMicroUsd: number): number => {
  integer(quantity); integer(priceMicroUsd);
  return integer(Number((BigInt(quantity) * BigInt(priceMicroUsd) + 500000n) / 1000000n));
};
export const tradeSum = (values: readonly number[]): number => values.reduce((total, n) => integer(total + integer(n)), 0);
export function affordableQuantity(budget: number, maximum: number, cost: (n: number) => number) {
  integer(budget); integer(maximum);
  if (maximum && integer(cost(1)) === 0) throw new Error('A positive trade unit needs a positive represented whole-USD cost; aggregate the unit before admission.');
  let lo = 0, hi = maximum;
  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (integer(cost(mid)) <= budget) lo = mid; else hi = mid - 1;
  }
  return lo;
}
export function quoteFlow(route: TradeRoute, price: number, quantity: number, unit: string, date: string): TradeFlow {
  if (route.tariffBps === null) throw new Error('A complete landed invoice requires an explicitly known/modelled ordinary customs rate; unavailable is not zero.');
  integer(price);
  if (price < TRADE_MODEL.microUsd) throw new Error('Trade invoice unit price must represent at least one whole USD; aggregate finer physical units explicitly.');
  const valueUsd = money(quantity, price);
  const logisticsUsd = ratio(valueUsd, route.logisticsBps, 10000);
  const customsUsd = ratio(valueUsd, route.tariffBps, 10000);
  return { routeId: route.id, exporterId: route.exporterId, importerId: route.importerId,
    category: route.category, unit, date, quantity, priceMicroUsd: price, valueUsd,
    logisticsBps: route.logisticsBps, logisticsUsd, tariffBps: route.tariffBps, customsUsd,
    landedUsd: integer(valueUsd + logisticsUsd + customsUsd),
    customsCoverage: 'modelled' };
}
export function validateTradeSource(s: TradeSource) {
  if (!s || !['observed', 'derived', 'modelled'].includes(s.status)
    || !['publisher', 'dataset', 'url', 'licence', 'attribution', 'transformation', 'limitation'].every(k => typeof s[k as keyof TradeSource] === 'string' && String(s[k as keyof TradeSource]).trim())
    || !isSimulationDate(s.referenceDate) || !isSimulationDate(s.retrievedAt)
    || s.publishedOn !== null && !isSimulationDate(s.publishedOn)
    || s.referenceDate > s.retrievedAt || s.publishedOn !== null && s.publishedOn > s.retrievedAt
    || typeof s.synthetic !== 'boolean' || s.synthetic && s.status !== 'modelled') throw new Error('Invalid trade source, dates, licensing or synthetic status.');
}
export function deriveDependency(market: TradeMarket, ledger: TradeCategoryLedger, flows: readonly TradeFlow[]): TradeDependency | undefined {
  if (!ledger.need || !ledger.imports) return undefined;
  const grouped = new Map<string, number>();
  for (const f of flows) if (f.category === market.category) grouped.set(f.exporterId, integer((grouped.get(f.exporterId) ?? 0) + f.quantity));
  const ordered = [...grouped].sort(([a], [b]) => a.localeCompare(b));
  if (tradeSum(ordered.map(([, quantity]) => quantity)) !== ledger.imports) throw new Error('Dependency lacks matching known delivered flow evidence.');
  const shares = allocate(10000, ordered.map(([, quantity]) => quantity));
  const suppliers = ordered.map(([countryId, quantity], i) => ({ countryId, quantity, shareBps: shares[i] }))
    .sort((a, b) => b.quantity - a.quantity || a.countryId.localeCompare(b.countryId));
  const importShareBps = Math.min(10000, ratio(ledger.imports, 10000, ledger.need));
  const concentrationBps = Number((suppliers.reduce((sum, s) => sum + BigInt(s.shareBps) ** 2n, 0n) + 5000n) / 10000n);
  const strategic = Boolean(market.strategicUse && importShareBps >= 2500
    && (concentrationBps >= 5000 || ledger.alternativeCapacity < ledger.imports));
  return { category: market.category, unit: market.unit, need: ledger.need, imports: ledger.imports,
    importShareBps, suppliers, largestSupplierBps: suppliers[0]?.shareBps ?? 0,
    topThreeBps: Math.min(10000, suppliers.slice(0, 3).reduce((s, v) => s + v.shareBps, 0)),
    concentrationBps: Math.min(10000, concentrationBps), alternativeCapacity: ledger.alternativeCapacity,
    domesticReplacementCapacity: market.domesticReplacementCapacity, stockQuantity: market.stock?.quantity ?? null,
    strategic, strategicUse: market.strategicUse,
    explanation: 'Derived from this booked need, delivered imports, supplier shares and represented spare/replacement capacity. Strategic classification is an inspectable modelled threshold, never a causal penalty.' };
}
