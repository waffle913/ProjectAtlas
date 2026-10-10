import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { deterministicFingerprint } from '../fingerprint';
import { hasGovernmentInformationAccess } from '../information/runtime';
import { briefingId, controlledBriefingCountry, retainCountryBriefings, retainedMilitaryReports, referencedGovernmentReportIds } from '../information/model';
import { governmentHistoricalTrade } from './data';
import { deriveDependency, money, quoteFlow, TRADE_MODEL, TRADE_CATEGORIES, validateTradeSource, type TradeCategoryLedger, type TradeDependency,
  affordableQuantity, tradeSum as sum, type TradeFlow, type TradeObservation, type TradeSource, type TradeMarket, type TradeRoute, type TradeAlternative } from './model';
import { validateMarket } from './runtime';
import { integer } from '../socioeconomy/model';
import { isSimulationDate } from '../date';

export interface GovernmentTradeReport {
  id: string; countryId: string; asOfDate: string; producedOn: string;
  source: 'trade.administrative-report'; access: 'government';
  coverage: 'partial' | 'unavailable'; status: 'modelled' | 'unavailable';
  confidenceBps: number; limitation: string; uncertainty: string;
  historicalPriors: TradeObservation[];
  data?: { unit: 'USD_PER_MONTH'; importsUsd: number; exportsUsd: number; balanceUsd: number;
    customsUsd: number; categories: TradeCategoryLedger[]; flows: TradeFlow[];
    dependencies: TradeDependency[];
    partners: { countryId: string; importsUsd: number; exportsUsd: number }[];
    sources: { category: string; source: TradeSource }[]; alertCodes: string[];
    admittedMarkets: TradeMarket[]; routes: TradeRoute[]; alternatives: TradeAlternative[] };
  fingerprint: string;
}
export function inspectTradeReports(state: SimulationState, countryId: string, personId: string) {
  if (!hasGovernmentInformationAccess(state, personId, countryId)) return undefined;
  const r = state.information.tradeReports?.latest[countryId];
  return r ? structuredClone({ ...r, stale: r.asOfDate < state.date }) : undefined;
}
export const tradeHeadline = (r: GovernmentTradeReport) => r.data
  ? `Dated trade report: imports $${r.data.importsUsd}, exports $${r.data.exportsUsd}; ${r.data.alertCodes.length ? r.data.alertCodes.join(', ') : 'no represented shortage'}.`
  : 'Trade quantities, need, production and dependencies unavailable; historical values do not establish current flows.';
export const tradeInterpretation = (r: GovernmentTradeReport) => ({
  basis: r.data ? 'modelled' as const : 'unavailable' as const,
  summary: 'Supplier concentration follows the reported fulfilled flows and known needs, not a geopolitical score.',
  tradeoffs: ['Alternative suppliers need real spare production, capacity, payment and time. Customs can raise costs while reducing volume.'],
  limitations: [r.limitation, r.uncertainty],
});
function partnersFor(flows: readonly TradeFlow[], id: string) {
  const partners = new Map<string, { countryId: string; importsUsd: number; exportsUsd: number }>();
  for (const f of flows) {
    const partner = f.exporterId === id ? f.importerId : f.exporterId;
    const p = partners.get(partner) ?? { countryId: partner, importsUsd: 0, exportsUsd: 0 };
    if (f.exporterId === id) p.exportsUsd = integer(p.exportsUsd + f.valueUsd); else p.importsUsd = integer(p.importsUsd + f.valueUsd);
    partners.set(partner, p);
  }
  return [...partners.values()].sort((a, b) => {
    const av = BigInt(a.importsUsd) + BigInt(a.exportsUsd), bv = BigInt(b.importsUsd) + BigInt(b.exportsUsd);
    return av === bv ? a.countryId.localeCompare(b.countryId) : av > bv ? -1 : 1;
  });
}
function alertsFor(categories: readonly TradeCategoryLedger[], markets: readonly TradeMarket[]) {
  return categories.flatMap(l => {
    const m = markets.find(m => m.category === l.category)!;
    return [...(l.shortage ? [`${l.category}:unfulfilled_need`] : []),
      ...(m.priceMicroUsd > m.baselinePriceMicroUsd ? [`${l.category}:indicative_price_above_baseline`] : []),
      ...(m.replacementQuantity ? [`${l.category}:domestic_replacement`] : [])];
  });
}
export function validateTradeReport(report: GovernmentTradeReport, initializedOn: string, date: string, countryIds: ReadonlySet<string>) {
  if (!report || report.id !== `trade-report:${report.countryId}:${report.producedOn}`
    || report.source !== 'trade.administrative-report' || report.access !== 'government'
    || !isSimulationDate(report.asOfDate) || !isSimulationDate(report.producedOn)
    || report.asOfDate < initializedOn || report.asOfDate > report.producedOn || report.producedOn > date
    || !report.limitation?.trim() || !report.uncertainty?.trim()
    || !Array.isArray(report.historicalPriors)
    || report.status !== (report.data ? 'modelled' : 'unavailable')
    || report.coverage !== (report.data || report.historicalPriors.length ? 'partial' : 'unavailable')
    || report.confidenceBps !== (report.data ? 6000 : 0)
    || report.fingerprint !== deterministicFingerprint({ ...report, fingerprint: undefined })) throw new Error('Invalid dated government trade report metadata/fingerprint.');
  const admissible = governmentHistoricalTrade(report.countryId, report.producedOn);
  if (deterministicFingerprint(admissible) !== deterministicFingerprint(report.historicalPriors)) throw new Error('Trade report exposes unavailable/future publication evidence.');
  if (report.data) {
    const d = report.data;
    for (const values of [d.flows, d.categories, d.admittedMarkets, d.routes, d.alternatives, d.partners, d.dependencies, d.sources])
      if (!Array.isArray(values)) throw new Error('Trade report lacks bounded reconstructed evidence.');
    if (d.unit !== 'USD_PER_MONTH' || d.importsUsd !== sum(d.flows.filter(f => f.importerId === report.countryId).map(f => f.valueUsd))
      || d.exportsUsd !== sum(d.flows.filter(f => f.exporterId === report.countryId).map(f => f.valueUsd))
      || d.balanceUsd !== d.exportsUsd - d.importsUsd || d.customsUsd !== sum(d.categories.map(c => c.customsUsd))
      || !Array.isArray(d.alertCodes) || new Set(d.categories.map(c => c.category)).size !== d.categories.length) throw new Error('Trade report accounting does not reconcile.');
    [d.importsUsd, d.exportsUsd, d.customsUsd].forEach(integer);
    if (d.categories.length > TRADE_MODEL.maximumCategoriesPerCountry || d.routes.length > TRADE_MODEL.maximumRoutes
      || d.alternatives.length > d.routes.length
      || d.admittedMarkets.length !== d.categories.length || new Set(d.admittedMarkets.map(m => m.category)).size !== d.categories.length
      || new Set(d.routes.map(r => r.id)).size !== d.routes.length || new Set(d.flows.map(f => f.routeId)).size !== d.flows.length) throw new Error('Trade report evidence has duplicate/missing categories or routes.');
    for (const m of d.admittedMarkets) {
      validateMarket(m);
      if (m.source.referenceDate > report.producedOn || (m.source.publishedOn ?? m.source.retrievedAt) > report.producedOn) throw new Error('Trade report reveals future operative source evidence.');
    }
    for (const r of d.routes) {
      validateTradeSource(r.source);
      [r.capacityPerMonth, r.establishedCapacity, r.expansionPerMonth, r.logisticsBps].forEach(integer);
      if (!r.id?.trim() || !countryIds.has(r.exporterId) || !countryIds.has(r.importerId)
        || !TRADE_CATEGORIES.includes(r.category) || !d.admittedMarkets.some(m => m.category === r.category)
        || r.exporterId === r.importerId || r.importerId !== report.countryId && r.exporterId !== report.countryId
        || r.establishedCapacity > r.capacityPerMonth || r.logisticsBps > 10000
        || r.tariffBps !== null && (!Number.isSafeInteger(r.tariffBps) || r.tariffBps < 0 || r.tariffBps > 10000)
        || r.source.referenceDate > report.producedOn || (r.source.publishedOn ?? r.source.retrievedAt) > report.producedOn) throw new Error('Invalid dated report route evidence.');
    }
    for (const f of d.flows) {
      const route = d.routes.find(r => r.id === f.routeId);
      const market = d.admittedMarkets.find(m => m.category === f.category);
      integer(f.quantity);
      if (!route || !market || f.unit !== market.unit || !f.quantity || f.quantity > route.establishedCapacity || f.date !== report.asOfDate
        || deterministicFingerprint(f) !== deterministicFingerprint(quoteFlow(route, f.priceMicroUsd, f.quantity, f.unit, f.date))) throw new Error('Government trade flow altered its exact invoice or capacity.');
    }
    for (const l of d.categories) {
      for (const [field, value] of Object.entries(l)) if (field !== 'category' && field !== 'unit') integer(value);
      const m = d.admittedMarkets.find(m => m.category === l.category);
      const imports = d.flows.filter(f => f.importerId === report.countryId && f.category === l.category);
      const exports = d.flows.filter(f => f.exporterId === report.countryId && f.category === l.category);
      if (!m || m.unit !== l.unit || l.priceMicroUsd < TRADE_MODEL.microUsd
        || l.productionBackingUsd !== money(l.production - l.exports, l.priceMicroUsd) + l.exportValueUsd
        || l.productionBackingUsd > l.productionCapacityBackingUsd
        || l.productionCapacityBackingUsd !== money(l.productionCapacity, l.priceMicroUsd)
        || l.need !== m.domesticNeedPerMonth + m.importNeedPerMonth + (l.constructionNeed ?? 0)
        || l.imports !== sum(imports.map(f => f.quantity)) || l.exports !== sum(exports.map(f => f.quantity))
        || l.shortage !== l.need - l.domesticConsumed - l.imports
        || BigInt(l.production) + BigInt(l.openingStock) + BigInt(l.received ?? 0) !== BigInt(l.domesticConsumed) + BigInt(l.exports) + BigInt(l.closingStock)
        || l.production > l.productionCapacity || l.productionCapacity > m.productionPerMonth + l.replacementQuantity
        || l.replacementQuantity > m.domesticReplacementCapacity || l.imports > m.importCapacityPerMonth
        || l.exports > m.exportCapacityPerMonth
        || l.exportableCapacity !== Math.min(m.exportCapacityPerMonth, l.productionCapacity - l.domesticConsumed + l.stockConsumed - l.stocked)
        || l.exports > l.exportableCapacity
        || BigInt(l.closingStock) !== BigInt(l.openingStock) + BigInt(l.stocked) - BigInt(l.stockConsumed) + BigInt(l.received ?? 0)
        || (l.openingStock || l.closingStock || l.stocked || l.stockConsumed) && !m.stock
        || m.stock && l.closingStock !== m.stock.quantity
        || l.importValueUsd !== sum(imports.map(f => f.valueUsd)) || l.exportValueUsd !== sum(exports.map(f => f.valueUsd))
        || l.importReferenceUsd !== money(l.imports, m.baselinePriceMicroUsd)
        || l.customsUsd !== sum(imports.map(f => f.customsUsd)) || l.importPaymentUsd !== sum(imports.map(f => f.landedUsd))
        || l.logisticsUsd !== sum(imports.map(f => f.logisticsUsd)) || l.importPaymentUsd !== l.importValueUsd + l.logisticsUsd + l.customsUsd
        || l.unspentUsd !== l.purchasingBudgetUsd - l.importPaymentUsd
        || l.alternativeCapacity !== sum(d.alternatives.filter(a => a.category === l.category).map(a => a.availableQuantity))) throw new Error('Dated government trade goods/funding/capacity proof failed.');
    }
    if (new Set(d.alternatives.map(a => a.routeId)).size !== d.alternatives.length) throw new Error('Dated trade alternatives repeat a route.');
    for (const a of d.alternatives) {
      validateTradeSource(a.source);
      [a.spareSupply, a.spareCapacity, a.availableQuantity, a.exportableCapacity, a.exportedQuantity, a.remainingBackingUsd, a.priceMicroUsd,
        a.productionCapacityBackingUsd, a.nonExportProduction, a.exportValueUsd].forEach(integer);
      const r = d.routes.find(r => r.id === a.routeId);
      if (!r || r.importerId !== report.countryId || r.exporterId !== a.supplierId || r.category !== a.category
        || r.tariffBps === null || a.unit !== d.admittedMarkets.find(m => m.category === a.category)?.unit
        || a.priceMicroUsd < TRADE_MODEL.microUsd
        || a.remainingBackingUsd !== a.productionCapacityBackingUsd - money(a.nonExportProduction, a.priceMicroUsd) - a.exportValueUsd
        || a.spareSupply !== affordableQuantity(a.remainingBackingUsd, a.exportableCapacity - a.exportedQuantity, n => money(n, a.priceMicroUsd))
        || a.availableQuantity !== Math.min(a.spareCapacity, a.spareSupply) || a.spareCapacity !== r.establishedCapacity
        || d.flows.some(f => f.routeId === a.routeId)
        || deterministicFingerprint(a.source) !== deterministicFingerprint(r.source)) throw new Error('Trade alternative has no preserved distinct unallocated route/supply evidence.');
    }
    const dependencies = d.categories.flatMap(l => {
      const dependency = deriveDependency(d.admittedMarkets.find(m => m.category === l.category)!, l, d.flows.filter(f => f.importerId === report.countryId));
      return dependency ? [dependency] : [];
    });
    if (deterministicFingerprint(dependencies) !== deterministicFingerprint(d.dependencies)
      || deterministicFingerprint(partnersFor(d.flows, report.countryId)) !== deterministicFingerprint(d.partners)
      || deterministicFingerprint(alertsFor(d.categories, d.admittedMarkets)) !== deterministicFingerprint(d.alertCodes)
      || deterministicFingerprint(d.admittedMarkets.map(m => ({ category: m.category, source: m.source }))) !== deterministicFingerprint(d.sources)) throw new Error('Trade dependencies, partners, alerts or provenance are not reconstructible.');
  }
}
export function runTradeReports(state: SimulationState): SimulationState {
  if (!state.trade.initializedOn) return state;
  const latest = { ...state.information.tradeReports?.latest }, byId = { ...state.information.tradeReports?.byId };
  const briefings = [...state.information.briefings];
  const countryIds = new Set(Object.keys(state.engine.fidelityByCountry));
  for (const [id, c] of Object.entries(state.trade.countries).sort(([a], [b]) => a.localeCompare(b))) {
    if (latest[id]?.producedOn === state.date) continue;
    const flows = state.trade.flows.filter(f => f.importerId === id || f.exporterId === id);
    const categories = c.ledger?.date === state.date ? structuredClone(c.ledger.categories) : undefined;
    const markets = categories?.map(l => structuredClone(c.markets[l.category]!)) ?? [];
    const dependencies = categories?.flatMap(l => {
      const dependency = deriveDependency(c.markets[l.category]!, l, flows.filter(f => f.importerId === id));
      return dependency ? [dependency] : [];
    }) ?? [];
    const historicalPriors = governmentHistoricalTrade(id, state.date);
    const report: GovernmentTradeReport = {
      id: `trade-report:${id}:${state.date}`, countryId: id, asOfDate: state.date, producedOn: state.date,
      access: 'government', source: 'trade.administrative-report', status: categories ? 'modelled' : 'unavailable',
      coverage: categories || historicalPriors.length ? 'partial' : 'unavailable', confidenceBps: categories ? 6000 : 0,
      limitation: c.limitation, uncertainty: 'Partial admitted categories only. Simulated production is not observed national sector production. Historical values are not 2026 quantities or current government knowledge.',
      historicalPriors: structuredClone(historicalPriors), fingerprint: '',
      data: categories ? { unit: 'USD_PER_MONTH', categories, flows: structuredClone(flows), dependencies,
        importsUsd: sum(flows.filter(f => f.importerId === id).map(f => f.valueUsd)),
        exportsUsd: sum(flows.filter(f => f.exporterId === id).map(f => f.valueUsd)),
        balanceUsd: sum(flows.filter(f => f.exporterId === id).map(f => f.valueUsd)) - sum(flows.filter(f => f.importerId === id).map(f => f.valueUsd)),
        customsUsd: sum(categories.map(l => l.customsUsd)),
        partners: partnersFor(flows, id), admittedMarkets: markets,
        routes: structuredClone(state.trade.routes.filter(r => r.importerId === id || r.exporterId === id)),
        alternatives: structuredClone(c.ledger!.alternatives),
        sources: markets.map(m => ({ category: m.category, source: m.source })),
        alertCodes: alertsFor(categories, markets),
      } : undefined,
    };
    report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
    validateTradeReport(report, state.trade.initializedOn, state.date, countryIds);
    latest[id] = report; byId[report.id] = report;
    if (categories) briefings.push({ id: briefingId('trade_report', id, report.id), countryId: id, portfolio: 'economy',
      access: 'government', eventType: 'trade_report', severity: 'advisory', createdOn: state.date, sourceId: report.id,
      headline: tradeHeadline(report), fact: { kind: 'trade_report', reportId: report.id, evidenceStatus: 'modelled' },
      interpretation: tradeInterpretation(report), pauseRequested: false });
  }
  const retained = retainCountryBriefings(briefings, controlledBriefingCountry(state));
  const referenced = new Set([...Object.values(latest).map(r => r.id), ...retained.filter(b => b.eventType === 'trade_report').map(b => b.sourceId)]);
  return { ...state, information: { ...state.information, briefings: retained,
    militaryReports: retainedMilitaryReports(state.information, retained),
    governmentReportsById: Object.fromEntries([...referencedGovernmentReportIds({
      latestGovernmentReports: state.information.latestGovernmentReports, briefings: retained,
    })].sort().map(id => [id, state.information.governmentReportsById[id]])),
    tradeReports: { latest, byId: Object.fromEntries([...referenced].sort().map(id => [id, byId[id]])) } } };
}
export const registerTradeReportTasks = (scheduler: SimulationScheduler) => scheduler.register({
  id: 'trade.administrative-reports', cadence: 'monthly', priority: 260, run: runTradeReports,
});
