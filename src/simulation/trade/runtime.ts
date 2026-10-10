import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { allocate, evolve, integer, MODEL, ratio, type Economy } from '../socioeconomy/model';
import { baseFiscalDemand } from '../fiscal/runtime';
import { consumptionCollected, netGoodsBudget } from '../fiscal/math';
import { reservedPersonnel, hasMilitaryManagementAuthority } from '../military/runtime';
import { constructionReservedPersonnel } from '../assets/workforce';
import { CONSTRUCTION_MATERIAL_CATEGORY } from '../assets/model';
import { constructionMaterialDemandPerMonth } from '../assets/materials';
import { tradeObservations } from './data';
import { blockedRouteKeysForDate, routeRestrictionKey } from '../international/runtime';
import { affordableQuantity, CATEGORY_REGISTRY, emptyTrade, money, quoteFlow, TRADE_CATEGORIES, TRADE_MODEL,
  validateTradeSource, tradeSum as sum, type TradeCategory, type TradeCategoryLedger, type TradeMarket, type TradeFlow,
  type TradePreparedRegion, type TradeRoute } from './model';

export function initializeTrade(state: SimulationState): SimulationState {
  if (state.trade.initializedOn) return state;
  return { ...state, trade: { ...emptyTrade(state.date),
    countries: Object.fromEntries(Object.keys(state.engine.fidelityByCountry).sort().map(countryId => [countryId, {
      coverage: tradeObservations.some(r => r.exporterId === countryId || r.importerId === countryId) ? 'partial' as const : 'unavailable' as const,
      limitation: 'Historical value evidence is not current physical supply. Unadmitted production, quantities, need, capacity, stocks, tariff and customs-territory boundaries remain unavailable, never zero.',
      markets: {},
    }])) } };
}
export function validateMarket(m: TradeMarket) {
  validateTradeSource(m.source);
  if (!TRADE_CATEGORIES.includes(m.category) || !m.unit?.trim() || !['household', 'industrial'].includes(m.use)
    || m.strategicUse !== null && !m.strategicUse.trim()) throw new Error('Invalid trade category, unit, use or strategic evidence.');
  for (const k of ['productionPerMonth', 'domesticNeedPerMonth', 'importNeedPerMonth', 'domesticReplacementCapacity',
    'domesticReplacementPerMonth', 'replacementQuantity', 'priceMicroUsd', 'baselinePriceMicroUsd',
    'importCapacityPerMonth', 'exportCapacityPerMonth'] as const) integer(m[k]);
  if (m.priceMicroUsd < TRADE_MODEL.microUsd || m.baselinePriceMicroUsd < TRADE_MODEL.microUsd
    || m.replacementQuantity > m.domesticReplacementCapacity) throw new Error('Invalid whole-dollar aggregate unit price/replacement capacity.');
  if (m.militaryInputPerFactoryUnit !== undefined) {
    integer(m.militaryInputPerFactoryUnit);
    if (!m.militaryInputPerFactoryUnit || m.use !== 'industrial' || m.category !== 'industrial_goods') throw new Error('Military binding requires explicit positive industrial input units, not a readiness score.');
  }
  if (m.stock) {
    for (const field of ['opening', 'produced', 'received', 'consumed', 'exported', 'quantity', 'capacity', 'target'] as const) integer(m.stock[field]);
    if (m.stock.quantity > m.stock.capacity || m.stock.target > m.stock.capacity
      || BigInt(m.stock.opening) + BigInt(m.stock.produced) + BigInt(m.stock.received)
        - BigInt(m.stock.consumed) - BigInt(m.stock.exported) !== BigInt(m.stock.quantity)) throw new Error('Trade stock conservation failed.');
  }
  money(integer(m.productionPerMonth + m.domesticReplacementCapacity), m.priceMicroUsd);
  integer(m.domesticNeedPerMonth + m.importNeedPerMonth);
}
export function validateRoute(r: TradeRoute, state: SimulationState) {
  validateTradeSource(r.source);
  const exporter = state.trade.countries[r.exporterId]?.markets[r.category];
  const importer = state.trade.countries[r.importerId]?.markets[r.category];
  if (!r.id?.trim() || r.exporterId === r.importerId || !exporter || !importer
    || exporter.unit !== importer.unit || !TRADE_CATEGORIES.includes(r.category)
    || r.source.referenceDate > state.date || (r.source.publishedOn ?? r.source.retrievedAt) > state.date) throw new Error('Route requires distinct registered Countries with admitted compatible category units and available dated evidence.');
  for (const k of ['capacityPerMonth', 'establishedCapacity', 'expansionPerMonth', 'logisticsBps'] as const) integer(r[k]);
  if (r.establishedCapacity > r.capacityPerMonth || r.logisticsBps > 10000
    || r.tariffBps !== null && (!Number.isSafeInteger(r.tariffBps) || r.tariffBps < 0 || r.tariffBps > 10000)) throw new Error('Invalid represented route capacity, logistics or ordinary customs rate.');
}
/** Explicit scenario/source admission, not an office command or empirical GDP allocation. */
export function admitTradeMarket(state: SimulationState, countryId: string, market: TradeMarket): SimulationState {
  if (state.trade.prepared || state.trade.lastMonthlyDate) throw new Error('Trade source/market admission is initialization-only, before the first prepared/executed trade month; booked history cannot be rewritten.');
  if (!state.trade.initializedOn || !state.trade.countries[countryId] || state.trade.countries[countryId].markets[market.category]) throw new Error('Trade market admission requires an initialized unavailable category in a registered Country.');
  validateMarket(market);
  if (market.source.referenceDate > state.date || (market.source.publishedOn ?? market.source.retrievedAt) > state.date
    || !market.source.synthetic && (market.source.referenceDate !== state.date
      || (market.source.publishedOn ?? market.source.retrievedAt) > state.date)
    || !Object.keys(state.socioeconomy.regions).some(id => state.regionOwnership[id] === countryId && state.socioeconomy.regions[id].economy)) throw new Error('Trade production admission needs current applicable available evidence and an existing economic recipient.');
  const country = state.trade.countries[countryId];
  return { ...state, trade: { ...state.trade, countries: { ...state.trade.countries,
    [countryId]: { ...country, coverage: 'partial', markets: { ...country.markets, [market.category]: structuredClone(market) } },
  } } };
}
export function admitTradeRoute(state: SimulationState, route: TradeRoute): SimulationState {
  if (state.trade.prepared || state.trade.lastMonthlyDate) throw new Error('Trade route admission is initialization-only, before the first prepared/executed trade month; booked customs cannot be rewritten.');
  validateRoute(route, state);
  if (state.trade.routes.length >= TRADE_MODEL.maximumRoutes || state.trade.routes.some(r => r.id === route.id
    || r.exporterId === route.exporterId && r.importerId === route.importerId && r.category === route.category)) throw new Error('Duplicate route or sparse route bound reached.');
  return { ...state, trade: { ...state.trade, routes: [...state.trade.routes, structuredClone(route)].sort((a, b) => a.id.localeCompare(b.id)) } };
}
export function setTradeStockTarget(state: SimulationState, countryId: string, personId: string, category: TradeCategory, target: number): SimulationState {
  if (!hasMilitaryManagementAuthority(state, countryId, personId)) throw new Error('Trade stock management requires a controlled active resolved executive office with information and budget capabilities.');
  integer(target);
  const market = state.trade.countries[countryId]?.markets[category];
  if (!market?.stock || target > market.stock.capacity) throw new Error('Stock target needs an admitted existing store and cannot exceed physical storage.');
  const countries = { ...state.trade.countries }, country = countries[countryId];
  countries[countryId] = { ...country, markets: { ...country.markets, [category]: { ...market, stock: { ...market.stock, target } } } };
  return { ...state, trade: { ...state.trade, countries } };
}
const ledgerFor = (m: TradeMarket): TradeCategoryLedger => ({
  category: m.category, unit: m.unit, priceMicroUsd: m.priceMicroUsd, production: 0, domesticConsumed: 0,
  need: integer(m.domesticNeedPerMonth + m.importNeedPerMonth),
  imports: 0, exports: 0, shortage: 0, openingStock: m.stock?.quantity ?? 0,
  closingStock: m.stock?.quantity ?? 0, stocked: 0, stockConsumed: 0, received: 0, constructionNeed: 0,
  productionBackingUsd: 0, exportValueUsd: 0, importValueUsd: 0,
  importReferenceUsd: 0,
  importPaymentUsd: 0, logisticsUsd: 0, customsUsd: 0,
  purchasingBudgetUsd: 0, unspentUsd: 0, alternativeCapacity: 0,
  replacementQuantity: m.replacementQuantity, militaryInputAvailable: 0, militaryInputConsumed: 0,
  productionCapacity: 0, productionCapacityBackingUsd: 0, exportableCapacity: 0,
  exportDemandShortage: 0,
});

/** All budgets below are bounded nominal flow allocations, never financial assets or another treasury. */
export function prepareTradeMonth(state: SimulationState): SimulationState {
  if (!state.trade.initializedOn || state.trade.prepared?.date === state.date) return state;
  const active = Object.keys(state.trade.countries).filter(id => Object.keys(state.trade.countries[id].markets).length).sort();
  if (!active.length) return state;
  const countries = { ...state.trade.countries };
  const grouped = new Map<string, string[]>();
  for (const id of Object.keys(state.socioeconomy.regions).sort()) {
    const owner = state.regionOwnership[id];
    if (owner && state.socioeconomy.regions[id].economy && countries[owner]) {
      const ids = grouped.get(owner) ?? []; ids.push(id); grouped.set(owner, ids);
    }
  }
  const regions: Record<string, TradePreparedRegion> = {};
  const remainingNeed = new Map<string, number>();
  const importBudgets = new Map<string, number>(), exportRemaining = new Map<string, number>();
  const exportBackingRemaining = new Map<string, number>();
  const ledgers = new Map<string, TradeCategoryLedger>();
  const key = (id: string, category: TradeCategory) => `${id}:${category}`;
  const blockedRouteKeys = blockedRouteKeysForDate(state, state.date);
  const routeLegal = (route: TradeRoute) => !blockedRouteKeys.has(routeRestrictionKey(route));
  for (const countryId of active) {
    const old = countries[countryId], markets = structuredClone(old.markets);
    const ids = grouped.get(countryId) ?? [];
    const demands = ids.map(id => {
      const demand = baseFiscalDemand(state, id);
      if (!demand) throw new Error('Trade requires the one initialized fiscal consumption/order ledger.');
      return demand;
    });
    const householdBudget = sum(demands.flatMap(d => d.householdRequests));
    const privateBudget = sum(ids.map(id => state.fiscal.regions[id].privateResidual));
    const categoryMarkets = TRADE_CATEGORIES.flatMap(category => markets[category] ? [markets[category]!] : []);
    for (const m of categoryMarkets) {
      const prior = old.ledger?.categories.find(l => l.category === m.category);
      if (prior?.shortage) m.replacementQuantity = Math.min(m.domesticReplacementCapacity,
        integer(m.replacementQuantity + Math.min(m.domesticReplacementPerMonth, m.domesticReplacementCapacity - m.replacementQuantity)));
    }
    const wants = categoryMarkets.map(m => {
      const constructionDemand = m.category === CONSTRUCTION_MATERIAL_CATEGORY ? constructionMaterialDemandPerMonth(state, countryId) : 0;
      const expectedNeed = integer(m.importNeedPerMonth + constructionDemand + Math.max(0, m.domesticNeedPerMonth
        - m.productionPerMonth - m.replacementQuantity - (m.stock?.quantity ?? 0)));
      const quotes = state.trade.routes.filter(r => r.importerId === countryId && r.category === m.category && r.tariffBps !== null && routeLegal(r))
        .map(r => quoteFlow(r, state.trade.countries[r.exporterId].markets[m.category]!.priceMicroUsd,
          expectedNeed, m.unit, state.date).landedUsd);
      return Math.max(money(expectedNeed, m.priceMicroUsd), ...quotes);
    });
    const householdWeights = wants.map((v, i) => categoryMarkets[i].use === 'household' ? v : 0);
    const industrialWeights = wants.map((v, i) => categoryMarkets[i].use === 'industrial' ? v : 0);
    const householdLimits = allocate(Math.min(householdBudget, sum(householdWeights)), householdWeights);
    const industrialLimits = allocate(Math.min(privateBudget, sum(industrialWeights)), industrialWeights);
    const industrialMaximum = sum(industrialLimits);
    const industrialByRegion = allocate(industrialMaximum, ids.map(id => state.fiscal.regions[id].privateResidual));
    let backing = 0;
    ids.forEach((id, i) => {
      const request = { ...demands[i], otherDemand: demands[i].otherDemand - industrialByRegion[i] };
      const projected = evolve(state.socioeconomy.regions[id], request, reservedPersonnel(state, id) + constructionReservedPersonnel(state, id)).economy!;
      const localPrivate = state.fiscal.regions[id].privateResidual - industrialByRegion[i];
      const realizedPrivate = request.otherDemand ? Number(BigInt(projected.otherDemandRealized) * BigInt(localPrivate) / BigInt(request.otherDemand)) : 0;
      backing = integer(backing + realizedPrivate);
      regions[id] = { owner: countryId, householdRequests: [...demands[i].householdRequests],
        industrialBudgetUsd: 0, importedGoodsByGroup: [0, 0, 0], essentialImportsByGroup: [0, 0, 0],
        importedReferenceByGroup: [0, 0, 0],
        householdLandedByGroup: [0, 0, 0], productionBackingUsd: 0,
        netBudgetByGroup: [...demands[i].householdRequests],
        nominalBudgetByGroup: state.fiscal.regions[id].disposable.map((v, n) => ratio(v, MODEL.consumptionBps[n], 10000)),
        privateDemandUsd: state.fiscal.regions[id].privateResidual, publicDemandUsd: state.fiscal.regions[id].publicOrders,
        unspentNetBudgetByGroup: [0, 0, 0], budgetAsOfDate: state.fiscal.lastMonthlyDate ?? state.fiscal.initializedOn!,
        openingDisposableByGroup: [...state.fiscal.regions[id].disposable],
        consumptionTaxRateBps: state.fiscal.countries[countryId].policy.consumption?.rateBps ?? null };
    });
    const productionWants = categoryMarkets.map(m => money(integer(m.productionPerMonth + m.replacementQuantity), m.priceMicroUsd));
    const productionBudgets = allocate(Math.min(backing, sum(productionWants)), productionWants);
    const categoryLedgers = categoryMarkets.map((m, i) => {
      const k = key(countryId, m.category), ledger = ledgerFor(m);
      // 0.24.5D — an active project's material requirement causally feeds the
      // construction-material category's import need (no second material system).
      if (m.category === CONSTRUCTION_MATERIAL_CATEGORY) {
        ledger.constructionNeed = constructionMaterialDemandPerMonth(state, countryId);
        ledger.need = integer(m.domesticNeedPerMonth + m.importNeedPerMonth + ledger.constructionNeed);
      }
      const produced = affordableQuantity(productionBudgets[i], integer(m.productionPerMonth + m.replacementQuantity), n => money(n, m.priceMicroUsd));
      ledger.productionCapacity = produced; ledger.productionCapacityBackingUsd = money(produced, m.priceMicroUsd);
      const domestic = Math.min(produced, ledger.need);
      const stockConsumed = Math.min(ledger.openingStock, ledger.need - domestic);
      ledger.domesticConsumed = domestic + stockConsumed; ledger.stockConsumed = stockConsumed;
      ledger.closingStock -= stockConsumed;
      const reserve = m.stock ? Math.min(produced - domestic, Math.max(0, m.stock.target - ledger.closingStock)) : 0;
      ledger.stocked = reserve; ledger.closingStock += reserve;
      ledger.production = domestic + reserve;
      ledger.purchasingBudgetUsd = householdLimits[i] + industrialLimits[i];
      remainingNeed.set(k, Math.min(m.importCapacityPerMonth, ledger.need - ledger.domesticConsumed));
      ledger.exportableCapacity = Math.min(m.exportCapacityPerMonth, produced - domestic - reserve);
      importBudgets.set(k, ledger.purchasingBudgetUsd); exportRemaining.set(k, ledger.exportableCapacity);
      exportBackingRemaining.set(k, integer(ledger.productionCapacityBackingUsd - money(ledger.production, m.priceMicroUsd)));
      ledgers.set(k, ledger);
      return ledger;
    });
    countries[countryId] = { ...old, markets, ledger: { date: state.date, categories: categoryLedgers, alternatives: [] } };
  }
  const routes = state.trade.routes.map(r => {
    const shortage = state.trade.countries[r.importerId].ledger?.categories.find(l => l.category === r.category)?.shortage ?? 0;
    return shortage ? { ...r, establishedCapacity: Math.min(r.capacityPerMonth, integer(r.establishedCapacity + Math.min(r.expansionPerMonth, r.capacityPerMonth - r.establishedCapacity))) } : r;
  }).sort((a, b) => a.id.localeCompare(b.id));
  const flows: TradeFlow[] = [];
  const routeUsed = new Map<string, number>();
  const executableRoutes = routes.filter(r => r.tariffBps !== null && routeLegal(r));
  const version = new Map<string, number>();
  const currentVersion = (k: string) => version.get(k) ?? 0;
  const bumpVersion = (k: string) => version.set(k, currentVersion(k) + 1);
  type Candidate = { route: TradeRoute; quantity: number; flow: TradeFlow; numerator: bigint; denominator: bigint; buyerVersion: number; sellerVersion: number };
  const candidateFor = (route: TradeRoute): Candidate | undefined => {
      const seller = key(route.exporterId, route.category), buyer = key(route.importerId, route.category);
      const market = countries[route.exporterId].markets[route.category]!;
      const physicalMaximum = Math.min(exportRemaining.get(seller) ?? 0, remainingNeed.get(buyer) ?? 0, route.establishedCapacity);
      if (!physicalMaximum) return undefined;
      const sellerMaximum = affordableQuantity(exportBackingRemaining.get(seller) ?? 0, physicalMaximum, n => money(n, market.priceMicroUsd));
      if (!sellerMaximum) return undefined;
      const quantity = affordableQuantity(importBudgets.get(buyer) ?? 0, sellerMaximum,
        n => quoteFlow(route, market.priceMicroUsd, n, market.unit, state.date).landedUsd);
      if (!quantity) return undefined;
      const flow = quoteFlow(route, market.priceMicroUsd, quantity, market.unit, state.date);
      const numerator = BigInt(flow.landedUsd), denominator = BigInt(quantity);
      return { route, quantity, flow, numerator, denominator, buyerVersion: currentVersion(buyer), sellerVersion: currentVersion(seller) };
  };
  const better = (a: Candidate, b: Candidate) => {
    const lhs = a.numerator * BigInt(b.denominator), rhs = b.numerator * BigInt(a.denominator);
    return lhs === rhs ? a.route.id.localeCompare(b.route.id) < 0 : lhs < rhs;
  };
  const heap: Candidate[] = [];
  const pushCandidate = (candidate: Candidate) => {
    heap.push(candidate);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!better(heap[index], heap[parent])) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
  };
  const popCandidate = (): Candidate | undefined => {
    if (!heap.length) return undefined;
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1, right = left + 1;
        let target = index;
        if (left < heap.length && better(heap[left], heap[target])) target = left;
        if (right < heap.length && better(heap[right], heap[target])) target = right;
        if (target === index) break;
        [heap[index], heap[target]] = [heap[target], heap[index]];
        index = target;
      }
    }
    return top;
  };
  for (const route of executableRoutes) {
    const candidate = candidateFor(route);
    if (candidate) pushCandidate(candidate);
  }
  for (;;) {
    const best = popCandidate();
    if (!best) break;
    const seller = key(best.route.exporterId, best.route.category), buyer = key(best.route.importerId, best.route.category);
    if (best.buyerVersion !== currentVersion(buyer) || best.sellerVersion !== currentVersion(seller)) {
      const fresh = candidateFor(best.route);
      if (fresh) pushCandidate(fresh);
      continue;
    }
    const market = countries[best.route.exporterId].markets[best.route.category]!;
    flows.push(best.flow); routeUsed.set(best.route.id, best.quantity);
    exportRemaining.set(seller, exportRemaining.get(seller)! - best.quantity);
    exportBackingRemaining.set(seller, exportBackingRemaining.get(seller)! - best.flow.valueUsd);
    remainingNeed.set(buyer, remainingNeed.get(buyer)! - best.quantity);
    importBudgets.set(buyer, importBudgets.get(buyer)! - best.flow.landedUsd);
    const exporter = ledgers.get(seller)!, importer = ledgers.get(buyer)!;
    exporter.exports = integer(exporter.exports + best.quantity); exporter.exportValueUsd = integer(exporter.exportValueUsd + best.flow.valueUsd);
    importer.imports = integer(importer.imports + best.quantity); importer.importValueUsd = integer(importer.importValueUsd + best.flow.valueUsd);
    importer.importPaymentUsd = integer(importer.importPaymentUsd + best.flow.landedUsd);
    importer.logisticsUsd = integer(importer.logisticsUsd + best.flow.logisticsUsd); importer.customsUsd = integer(importer.customsUsd + best.flow.customsUsd);
    bumpVersion(seller); bumpVersion(buyer);
  }
  for (const id of active) {
    const ids = grouped.get(id) ?? [], country = countries[id];
    let householdPayment = 0, industrialPayment = 0, importedGoods = 0, referenceGoods = 0, essentialGoods = 0, productionBacking = 0,
      householdShortfall = 0;
    for (const ledger of country.ledger!.categories) {
      const m = country.markets[ledger.category]!;
      ledger.production = integer(ledger.production + ledger.exports);
      ledger.productionBackingUsd = integer(money(ledger.production - ledger.exports, m.priceMicroUsd) + ledger.exportValueUsd);
      ledger.shortage = ledger.need - ledger.domesticConsumed - ledger.imports;
      ledger.importReferenceUsd = money(ledger.imports, m.baselinePriceMicroUsd);
      ledger.unspentUsd = ledger.purchasingBudgetUsd - ledger.importPaymentUsd;
      const alternatives = routes.filter(r => r.importerId === id && r.category === ledger.category && r.tariffBps !== null && routeLegal(r)
        && !flows.some(f => f.routeId === r.id)).map(r => {
          const supply = ledgers.get(key(r.exporterId, r.category))!;
          const remainingBackingUsd = exportBackingRemaining.get(key(r.exporterId, r.category)) ?? 0;
          const spareSupply = affordableQuantity(remainingBackingUsd, exportRemaining.get(key(r.exporterId, r.category)) ?? 0,
            n => money(n, supply.priceMicroUsd));
          const spareCapacity = r.establishedCapacity - (routeUsed.get(r.id) ?? 0);
          return { category: ledger.category, unit: ledger.unit, supplierId: r.exporterId, routeId: r.id,
            exportableCapacity: supply.exportableCapacity, exportedQuantity: supply.exports,
            remainingBackingUsd, priceMicroUsd: supply.priceMicroUsd,
            productionCapacityBackingUsd: supply.productionCapacityBackingUsd,
            nonExportProduction: supply.domesticConsumed - supply.stockConsumed + supply.stocked, exportValueUsd: supply.exportValueUsd,
            spareSupply, spareCapacity, availableQuantity: Math.min(spareSupply, spareCapacity), source: structuredClone(r.source) };
        });
      country.ledger!.alternatives.push(...alternatives);
      ledger.alternativeCapacity = sum(alternatives.map(a => a.availableQuantity));
      if (m.militaryInputPerFactoryUnit) ledger.militaryInputAvailable = ledger.domesticConsumed + ledger.imports;
      if (m.stock) {
        // 0.24.5D — delivered imports of the construction-material category are
        // received into the canonical stock buffer (bounded by physical storage), so
        // a shortage can be closed by imports and consumed downstream. All other
        // categories keep their existing direct-consumption / availability semantics.
        const stockedImports = m.category === CONSTRUCTION_MATERIAL_CATEGORY
          ? Math.min(ledger.imports, Math.max(0, m.stock.capacity - ledger.closingStock))
          : 0;
        ledger.received = stockedImports;
        ledger.closingStock = integer(ledger.closingStock + stockedImports);
        m.stock.received = integer(m.stock.received + stockedImports);
        m.stock.quantity = ledger.closingStock;
        m.stock.produced = integer(m.stock.produced + ledger.stocked);
        m.stock.consumed = integer(m.stock.consumed + ledger.stockConsumed);
      }
      if (m.use === 'household') {
        householdPayment = integer(householdPayment + ledger.importPaymentUsd);
        importedGoods = integer(importedGoods + ledger.importValueUsd);
        referenceGoods = integer(referenceGoods + ledger.importReferenceUsd);
        if (CATEGORY_REGISTRY[m.category].essential) {
          essentialGoods = integer(essentialGoods + ledger.importReferenceUsd);
          const importShortfallUnits = Math.max(0, m.importNeedPerMonth - ledger.imports - Math.max(0, ledger.domesticConsumed - m.domesticNeedPerMonth));
          householdShortfall = integer(householdShortfall + money(importShortfallUnits, m.baselinePriceMicroUsd));
        }
      } else industrialPayment = integer(industrialPayment + ledger.importPaymentUsd);
      productionBacking = integer(productionBacking + ledger.productionBackingUsd);
    }
    const groupWeights = ids.flatMap(r => regions[r].householdRequests);
    const paid = allocate(householdPayment, groupWeights);
    const goods = allocate(importedGoods, paid);
    const reference = allocate(referenceGoods, groupWeights);
    const essentials = allocate(essentialGoods, reference);
    const shortfalls = sum(groupWeights) ? allocate(householdShortfall, groupWeights) : groupWeights.map(() => 0);
    const industrial = allocate(industrialPayment, ids.map(r => state.fiscal.regions[r].privateResidual));
    const backingWeights = ids.map((r, index) => {
      const d = baseFiscalDemand(state, r)!;
      const otherDemand = d.otherDemand - industrial[index];
      const p = evolve(state.socioeconomy.regions[r], { ...d, otherDemand }, reservedPersonnel(state, r) + constructionReservedPersonnel(state, r)).economy!;
      return otherDemand ? Number(BigInt(p.otherDemandRealized) * BigInt(state.fiscal.regions[r].privateResidual - industrial[index]) / BigInt(otherDemand)) : 0;
    });
    const backings = allocate(productionBacking, backingWeights);
    ids.forEach((r, n) => {
      const p = regions[r];
      p.householdLandedByGroup = paid.slice(n * 3, n * 3 + 3);
      p.importedGoodsByGroup = goods.slice(n * 3, n * 3 + 3);
      p.importedReferenceByGroup = reference.slice(n * 3, n * 3 + 3);
      p.essentialImportsByGroup = essentials.slice(n * 3, n * 3 + 3);
      const shortfall = shortfalls.slice(n * 3, n * 3 + 3);
      p.householdRequests = p.householdRequests.map((v, i) => Math.min(Math.max(0, v - p.householdLandedByGroup[i] - shortfall[i]),
        netGoodsBudget(integer(p.nominalBudgetByGroup[i] - p.householdLandedByGroup[i]
          - consumptionCollected(p.importedGoodsByGroup[i], state.fiscal.countries[id].policy.consumption)),
        state.fiscal.countries[id].policy.consumption)));
      p.unspentNetBudgetByGroup = p.netBudgetByGroup.map((v, i) => v - p.householdRequests[i] - p.householdLandedByGroup[i]);
      p.industrialBudgetUsd = industrial[n]; p.productionBackingUsd = backings[n];
    });
  }
  for (const id of active) for (const ledger of countries[id].ledger!.categories) {
    if (!ledger.exportableCapacity || ledger.exports !== ledger.exportableCapacity) continue;
    ledger.exportDemandShortage = sum(routes.filter(r => r.exporterId === id && r.category === ledger.category && r.tariffBps !== null && routeLegal(r)).map(r => {
      const buyer = ledgers.get(key(r.importerId, r.category))!;
      return affordableQuantity(buyer.unspentUsd, Math.min(buyer.shortage, r.capacityPerMonth - (routeUsed.get(r.id) ?? 0)),
        n => quoteFlow(r, ledger.priceMicroUsd, n, ledger.unit, state.date).landedUsd);
    }));
  }
  return { ...state, trade: { ...state.trade, countries, routes, flows: flows.sort((a, b) => a.routeId.localeCompare(b.routeId)),
    prepared: { date: state.date, regions } } };
}

export function tradeDemand(state: SimulationState, regionId: string, base: { householdRequests: number[]; otherDemand: number }) {
  const p = state.trade.prepared?.date === state.date ? state.trade.prepared.regions[regionId] : undefined;
  return p ? { householdRequests: p.householdRequests, otherDemand: integer(base.otherDemand - p.industrialBudgetUsd) } : base;
}
export function availableConsumption(e: Economy): number { return integer(e.consumption + sum(e.importedReferenceConsumptionByGroup ?? [])); }
export function availableNeedsCoverage(e: Economy): number { return e.importAvailableNeedsCoverageBps ?? e.basicNeedsCoverageBps; }
export function settleTradeMonth(state: SimulationState): SimulationState {
  if (!state.trade.prepared || state.trade.prepared.date !== state.date || state.trade.lastMonthlyDate === state.date) return state;
  const regions = { ...state.socioeconomy.regions };
  for (const [id, prepared] of Object.entries(state.trade.prepared.regions)) {
    const r = regions[id], e = r.economy!;
    const privateDemand = state.fiscal.regions[id].privateResidual - prepared.industrialBudgetUsd;
    const other = state.fiscal.regions[id].publicOrders + privateDemand;
    const realizedPrivate = other ? Number(BigInt(e.otherDemandRealized) * BigInt(privateDemand) / BigInt(other)) : 0;
    if (prepared.productionBackingUsd > realizedPrivate) throw new Error('Trade production exceeded actual private resource fulfillment; no fictional supply or public-order diversion.');
    const essential = e.consumptionByGroup.reduce((s, v, i) =>
      s + Math.min(e.essentialReferenceByGroup[i], ratio(v + prepared.essentialImportsByGroup[i], MODEL.essentialBps[i], 10000)), 0);
    const reference = sum(e.essentialReferenceByGroup);
    regions[id] = { ...r, economy: { ...e,
      importedConsumptionByGroup: [...prepared.importedGoodsByGroup],
      importedReferenceConsumptionByGroup: [...prepared.importedReferenceByGroup],
      importAvailableNeedsCoverageBps: reference ? Math.min(10000, ratio(essential, 10000, reference)) : 10000,
      importEssentialConsumption: essential, importRequestedBudgetByGroup: [...prepared.householdLandedByGroup] } };
  }
  const countries = Object.fromEntries(Object.entries(state.trade.countries).map(([id, country]) => [id,
    country.ledger?.date === state.date ? { ...country, markets: Object.fromEntries(Object.entries(country.markets).map(([category, m]) => {
      const ledger = country.ledger!.categories.find(l => l.category === category)!;
      const step = Math.max(1, ratio(m!.priceMicroUsd, TRADE_MODEL.priceAdjustmentBps, 10000));
      const target = ledger.shortage || ledger.exportDemandShortage ? integer(m!.priceMicroUsd + step)
        : m!.priceMicroUsd < m!.baselinePriceMicroUsd ? Math.min(m!.baselinePriceMicroUsd, integer(m!.priceMicroUsd + step))
        : Math.max(m!.baselinePriceMicroUsd, integer(m!.priceMicroUsd - step));
      return [category, { ...m!, priceMicroUsd: target }];
    })) } : country]));
  return { ...state, socioeconomy: { ...state.socioeconomy, regions },
    trade: { ...state.trade, countries, lastMonthlyDate: state.date } };
}
export function tradeCustomsRevenue(state: SimulationState, countryId: string) {
  return state.trade.lastMonthlyDate === state.date ? sum(state.trade.flows.filter(f => f.importerId === countryId).map(f => f.customsUsd)) : 0;
}
export function tradeFactoryCapacity(state: SimulationState, countryId: string): number | undefined {
  const m = state.trade.countries[countryId]?.markets.industrial_goods;
  if (!m?.militaryInputPerFactoryUnit) return undefined;
  const ledger = state.trade.countries[countryId].ledger?.categories.find(l => l.category === 'industrial_goods');
  if (state.trade.countries[countryId].ledger?.date !== state.date || !ledger) return 0;
  return Math.floor((ledger.militaryInputAvailable - ledger.militaryInputConsumed) / m.militaryInputPerFactoryUnit);
}
export function consumeTradeFactoryInput(state: SimulationState, countryId: string, units: number): SimulationState {
  const m = state.trade.countries[countryId]?.markets.industrial_goods;
  if (!m?.militaryInputPerFactoryUnit) return state;
  const country = state.trade.countries[countryId], ledger = country.ledger!;
  const used = integer(units * m.militaryInputPerFactoryUnit);
  const categories = ledger.categories.map(l => {
    if (l.category !== 'industrial_goods') return l;
    if (used > l.militaryInputAvailable - l.militaryInputConsumed) throw new Error('Military factory consumed unavailable trade inputs.');
    return { ...l, militaryInputConsumed: integer(l.militaryInputConsumed + used) };
  });
  return { ...state, trade: { ...state.trade, countries: { ...state.trade.countries, [countryId]: { ...country, ledger: { ...ledger, categories } } } } };
}
export const registerTradeTasks = (scheduler: SimulationScheduler) => scheduler
  .register({ id: 'trade.prepare-monthly', cadence: 'monthly', priority: 95, run: prepareTradeMonth })
  .register({ id: 'trade.settle-monthly', cadence: 'monthly', priority: 110, run: settleTradeMonth });
