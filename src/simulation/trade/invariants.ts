import type { SimulationInvariant } from '../invariants';
import { integer, ratio, allocate, MODEL } from '../socioeconomy/model';
import { consumptionCollectedAtRate, netGoodsBudgetAtRate } from '../fiscal/math';
import { deterministicFingerprint } from '../fingerprint';
import { isSimulationDate } from '../date';
import { TRADE_VERSION, TRADE_MODEL, money, quoteFlow, tradeSum as sum, affordableQuantity } from './model';
import { validateMarket, validateRoute } from './runtime';
import { validateTradeReport, tradeHeadline, tradeInterpretation } from './reports';
import { sanctionBlocksRoute } from '../international/runtime';

export const tradeInvariant: SimulationInvariant = {
  id: 'trade-goods-payments-evidence',
  check: (state, context) => {
    const errors: string[] = [], t = state.trade;
    if (!t || t.version !== TRADE_VERSION || !t.countries || !Array.isArray(t.routes) || !Array.isArray(t.flows)) return ['Malformed trade state.'];
    if (!t.initializedOn) return Object.keys(t.countries).length || t.routes.length || t.flows.length || t.prepared ? ['Uninitialized trade contains material state.'] : [];
    if (!isSimulationDate(t.initializedOn) || t.initializedOn > state.date
      || t.lastMonthlyDate !== undefined && (!isSimulationDate(t.lastMonthlyDate) || t.lastMonthlyDate < t.initializedOn || t.lastMonthlyDate > state.date)) errors.push('Invalid trade initialization/monthly dates.');
    if (t.lastMonthlyDate !== undefined && !t.prepared) errors.push('Executed trade lost its dated funding/fulfillment record.');
    const capture = (run: () => void) => { try { run(); } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); } };
    if (t.routes.length > TRADE_MODEL.maximumRoutes || new Set(t.routes.map(r => r.id)).size !== t.routes.length
      || new Set(t.routes.map(r => `${r.exporterId}:${r.importerId}:${r.category}`)).size !== t.routes.length) errors.push('Trade sparse route bounds/uniqueness failed.');
    for (const r of t.routes) capture(() => validateRoute(r, state));
    const seenFlows = new Set<string>();
    for (const f of t.flows) capture(() => {
      const r = t.routes.find(r => r.id === f.routeId);
      integer(f.quantity);
      if (!r || seenFlows.has(f.routeId) || !f.quantity || f.date !== t.lastMonthlyDate
        || f.quantity > r.establishedCapacity || f.priceMicroUsd < TRADE_MODEL.microUsd
        || f.unit !== t.countries[f.exporterId]?.markets[f.category]?.unit
        || f.priceMicroUsd !== t.countries[f.exporterId]?.ledger?.categories.find(l => l.category === f.category)?.priceMicroUsd
        || !context.countryIds.has(f.importerId) || !context.countryIds.has(f.exporterId)
        || f.exporterId === f.importerId
        || sanctionBlocksRoute(state, r, f.date)
        || deterministicFingerprint(f) !== deterministicFingerprint(quoteFlow(r, f.priceMicroUsd, f.quantity, f.unit, f.date))) throw new Error('Invalid trade route/quantity/payment/customs proof.');
      seenFlows.add(f.routeId);
    });
    for (const id of context.countryIds) if (!t.countries[id]) errors.push(`Missing trade coverage for ${id}.`);
    for (const [id, country] of Object.entries(t.countries)) capture(() => {
      if (!context.countryIds.has(id) || !['partial', 'unavailable'].includes(country.coverage)
        || !country.limitation?.trim() || !country.markets) throw new Error('Invalid trade Country coverage/identity.');
      for (const [category, m] of Object.entries(country.markets)) {
        validateMarket(m!);
        if (m!.category !== category || country.coverage === 'unavailable' || m!.source.referenceDate > state.date
          || (m!.source.publishedOn ?? m!.source.retrievedAt) > state.date) throw new Error('Trade market category/provenance mismatch.');
      }
      const ledger = country.ledger;
      if (!ledger) return;
      if (!Array.isArray(ledger.categories) || !Array.isArray(ledger.alternatives) || ledger.date !== t.lastMonthlyDate
      || !Object.keys(country.markets).length
        || ledger.categories.length !== Object.keys(country.markets).length
        || new Set(ledger.categories.map(l => l.category)).size !== ledger.categories.length) throw new Error('Invalid dated trade ledger category set.');
      for (const l of ledger.categories) {
        for (const [field, value] of Object.entries(l)) if (field !== 'category' && field !== 'unit') integer(value);
        const m = country.markets[l.category], imports = t.flows.filter(f => f.importerId === id && f.category === l.category);
        const exports = t.flows.filter(f => f.exporterId === id && f.category === l.category);
        if (!m || l.unit !== m.unit || l.productionBackingUsd !== money(l.production - l.exports, l.priceMicroUsd) + l.exportValueUsd
          || l.productionBackingUsd > l.productionCapacityBackingUsd
          || l.production > l.productionCapacity || l.productionCapacity > m.productionPerMonth + l.replacementQuantity
          || l.productionCapacityBackingUsd !== money(l.productionCapacity, l.priceMicroUsd)
          || l.exportableCapacity !== Math.min(m.exportCapacityPerMonth, l.productionCapacity - l.domesticConsumed + l.stockConsumed - l.stocked)
          || l.exports > l.exportableCapacity || l.replacementQuantity > m.domesticReplacementCapacity
          || l.imports !== sum(imports.map(f => f.quantity)) || l.exports !== sum(exports.map(f => f.quantity))
          || l.imports > m.importCapacityPerMonth || l.exports > m.exportCapacityPerMonth
          || l.exportValueUsd !== sum(exports.map(f => f.valueUsd)) || l.importValueUsd !== sum(imports.map(f => f.valueUsd))
          || l.importReferenceUsd !== money(l.imports, m.baselinePriceMicroUsd)
          || l.importPaymentUsd !== sum(imports.map(f => f.landedUsd)) || l.customsUsd !== sum(imports.map(f => f.customsUsd))
          || l.logisticsUsd !== sum(imports.map(f => f.logisticsUsd))
          || l.importPaymentUsd !== l.importValueUsd + l.customsUsd + l.logisticsUsd
          || l.need !== m.domesticNeedPerMonth + m.importNeedPerMonth
          || l.shortage !== l.need - l.domesticConsumed - l.imports
          || l.unspentUsd !== l.purchasingBudgetUsd - l.importPaymentUsd
          || BigInt(l.production) + BigInt(l.openingStock) + BigInt(l.received) !== BigInt(l.domesticConsumed) + BigInt(l.exports) + BigInt(l.closingStock)
          || BigInt(l.closingStock) !== BigInt(l.openingStock) + BigInt(l.stocked) - BigInt(l.stockConsumed) + BigInt(l.received)
          || l.militaryInputConsumed > l.militaryInputAvailable
          || l.militaryInputAvailable !== (m.militaryInputPerFactoryUnit ? l.domesticConsumed + l.imports : 0)
          || (l.openingStock || l.closingStock || l.stocked || l.stockConsumed) && !m.stock
          || m.stock && l.closingStock !== m.stock.quantity) throw new Error('Trade goods/need/stock/payment/production identity failed.');
        const military = state.military.countries[id]?.capability?.lastLedger;
        if (l.militaryInputConsumed !== (m.militaryInputPerFactoryUnit && military?.date === ledger.date
          ? integer(military.productionUnits * m.militaryInputPerFactoryUnit) : 0)) throw new Error('Trade input consumption lacks matching real military factory work.');
        const pressure = !l.exportableCapacity || l.exports !== l.exportableCapacity ? 0 : sum(t.routes
          .filter(r => r.exporterId === id && r.category === l.category && r.tariffBps !== null && !sanctionBlocksRoute(state, r, ledger.date)).map(r => {
            const buyer = t.countries[r.importerId].ledger!.categories.find(l => l.category === r.category)!;
            const used = t.flows.find(f => f.routeId === r.id)?.quantity ?? 0;
            return affordableQuantity(buyer.unspentUsd, Math.min(buyer.shortage, r.capacityPerMonth - used),
              n => quoteFlow(r, l.priceMicroUsd, n, l.unit, ledger.date).landedUsd);
          }));
        if (l.exportDemandShortage !== pressure
          || l.alternativeCapacity !== sum(ledger.alternatives.filter(a => a.category === l.category).map(a => a.availableQuantity))) throw new Error('Trade price pressure/alternative capacity lacks its represented demand and supply.');
      }
      if (new Set(ledger.alternatives.map(a => a.routeId)).size !== ledger.alternatives.length) throw new Error('Trade alternatives repeat a route.');
      for (const a of ledger.alternatives) {
        const route = t.routes.find(r => r.id === a.routeId), supply = t.countries[a.supplierId]?.ledger?.categories.find(l => l.category === a.category);
        [a.spareSupply, a.spareCapacity, a.availableQuantity, a.exportableCapacity, a.exportedQuantity, a.remainingBackingUsd, a.priceMicroUsd,
          a.productionCapacityBackingUsd, a.nonExportProduction, a.exportValueUsd].forEach(integer);
        if (!route || !supply || route.importerId !== id || route.exporterId !== a.supplierId
          || route.category !== a.category || route.tariffBps === null || a.unit !== country.markets[a.category]?.unit
          || sanctionBlocksRoute(state, route, ledger.date)
          || t.flows.some(f => f.routeId === a.routeId) || a.spareCapacity !== route.establishedCapacity
          || a.exportableCapacity !== supply.exportableCapacity || a.exportedQuantity !== supply.exports
          || a.remainingBackingUsd !== supply.productionCapacityBackingUsd - supply.productionBackingUsd
          || a.priceMicroUsd !== supply.priceMicroUsd
          || a.productionCapacityBackingUsd !== supply.productionCapacityBackingUsd
          || a.nonExportProduction !== supply.production - supply.exports || a.exportValueUsd !== supply.exportValueUsd
          || a.spareSupply !== affordableQuantity(a.remainingBackingUsd, supply.exportableCapacity - supply.exports, n => money(n, supply.priceMicroUsd))
          || a.availableQuantity !== Math.min(a.spareSupply, a.spareCapacity)
          || deterministicFingerprint(a.source) !== deterministicFingerprint(route.source)) throw new Error('Trade alternatives invent unpriced routes, shared supply or capacity.');
      }
    });
    const prepared = t.prepared;
    if (prepared) capture(() => {
      if (prepared.date !== t.lastMonthlyDate || !prepared.regions) throw new Error('Trade funding evidence lacks its executed monthly boundary.');
      for (const [id, p] of Object.entries(prepared.regions)) {
        if (!context.regionIds.has(id) || !context.countryIds.has(p.owner)) throw new Error('Unknown trade economic recipient/booking owner.');
        const e = state.socioeconomy.regions[id]?.economy;
        if (!e) throw new Error('Trade funds have no economic recipient.');
        const purchase = state.fiscal.regions[id]?.tradePurchases;
        if (!purchase || purchase.date !== prepared.date
          || [purchase.importedGoods, purchase.landedPayment, purchase.nominalBudget, purchase.importConsumptionTax]
            .some(values => !Array.isArray(values) || values.length !== 3)
          || purchase.importedGoods.some((v, i) => v !== p.importedGoodsByGroup[i])
          || purchase.landedPayment.some((v, i) => v !== p.householdLandedByGroup[i])
          || purchase.nominalBudget.some((v, i) => v !== p.nominalBudgetByGroup[i])
          || purchase.importConsumptionTax.some((v, i) => v !== consumptionCollectedAtRate(p.importedGoodsByGroup[i], p.consumptionTaxRateBps))) throw new Error('Import funds lost their exactly-once dated fiscal booking.');
        for (const values of [p.householdRequests, p.importedGoodsByGroup, p.importedReferenceByGroup, p.essentialImportsByGroup,
          p.householdLandedByGroup, p.netBudgetByGroup, p.nominalBudgetByGroup, p.unspentNetBudgetByGroup, p.openingDisposableByGroup]) {
          if (!Array.isArray(values) || values.length !== 3) throw new Error('Invalid import funding group evidence.');
          values.forEach(integer);
        }
        [p.industrialBudgetUsd, p.productionBackingUsd, p.privateDemandUsd, p.publicDemandUsd].forEach(integer);
        if (!isSimulationDate(p.budgetAsOfDate) || p.budgetAsOfDate < state.fiscal.initializedOn!
          || p.budgetAsOfDate >= prepared.date || p.consumptionTaxRateBps !== null
          && (!Number.isSafeInteger(p.consumptionTaxRateBps) || p.consumptionTaxRateBps < 0 || p.consumptionTaxRateBps > 10000)
          || p.nominalBudgetByGroup.some((v, i) => v !== ratio(p.openingDisposableByGroup[i], MODEL.consumptionBps[i], 10000))
          || p.netBudgetByGroup.some((v, i) => v !== netGoodsBudgetAtRate(p.nominalBudgetByGroup[i], p.consumptionTaxRateBps))) throw new Error('Trade purchases have no saved opening disposable-income budget/date/tax basis.');
        if (p.industrialBudgetUsd > p.privateDemandUsd
          || p.householdRequests.some((v, i) => v + p.householdLandedByGroup[i] + p.unspentNetBudgetByGroup[i] !== p.netBudgetByGroup[i]
            || p.netBudgetByGroup[i] > p.nominalBudgetByGroup[i]
            || p.importedGoodsByGroup[i] > p.householdLandedByGroup[i]
            || p.essentialImportsByGroup[i] > p.importedReferenceByGroup[i])
          || e.otherDemandResidual !== p.privateDemandUsd + p.publicDemandUsd - p.industrialBudgetUsd
          || !Array.isArray(e.importedConsumptionByGroup) || e.importedConsumptionByGroup.length !== 3
          || e.importedConsumptionByGroup.some((v, i) => v !== p.importedGoodsByGroup[i])
          || !Array.isArray(e.importedReferenceConsumptionByGroup) || e.importedReferenceConsumptionByGroup.length !== 3
          || e.importedReferenceConsumptionByGroup.some((v, i) => v !== p.importedReferenceByGroup[i])
          || !Array.isArray(e.importRequestedBudgetByGroup) || e.importRequestedBudgetByGroup.length !== 3
          || e.importRequestedBudgetByGroup.some((v, i) => v !== p.householdLandedByGroup[i])) throw new Error('Trade overspent or lost existing nominal household/residual resources.');
        const essential = sum(e.consumptionByGroup.map((v, i) =>
          Math.min(e.essentialReferenceByGroup[i], ratio(integer(v + p.essentialImportsByGroup[i]), MODEL.essentialBps[i], 10000))));
        const reference = sum(e.essentialReferenceByGroup);
        if (e.importEssentialConsumption !== essential
          || e.importAvailableNeedsCoverageBps !== (reference ? Math.min(10000, ratio(essential, 10000, reference)) : 10000)) throw new Error('Imported essential availability lost its dated fulfillment evidence.');
        const other = p.privateDemandUsd + p.publicDemandUsd - p.industrialBudgetUsd;
        const realPrivate = other ? Number(BigInt(e.otherDemandRealized) * BigInt(p.privateDemandUsd - p.industrialBudgetUsd) / BigInt(other)) : 0;
        if (p.productionBackingUsd > realPrivate) throw new Error('Trade production/exports divert public orders or create output.');
      }
      for (const [id, c] of Object.entries(t.countries)) {
        if (!c.ledger) continue;
        const recipients = Object.values(prepared.regions).filter(p => p.owner === id);
        const household = c.ledger.categories.filter(l => c.markets[l.category]!.use === 'household');
        const industrial = c.ledger.categories.filter(l => c.markets[l.category]!.use === 'industrial');
        if (sum(recipients.flatMap(p => p.householdLandedByGroup)) !== sum(household.map(l => l.importPaymentUsd))
          || sum(recipients.flatMap(p => p.importedGoodsByGroup)) !== sum(household.map(l => l.importValueUsd))
          || sum(recipients.flatMap(p => p.importedReferenceByGroup)) !== sum(household.map(l => l.importReferenceUsd))
          || sum(recipients.flatMap(p => p.essentialImportsByGroup)) !== sum(household.filter(l =>
            ['food', 'energy', 'chemicals_pharmaceuticals'].includes(l.category)).map(l => l.importReferenceUsd))
          || sum(recipients.map(p => p.industrialBudgetUsd)) !== sum(industrial.map(l => l.importPaymentUsd))
          || sum(recipients.map(p => p.productionBackingUsd)) !== sum(c.ledger.categories.map(l => l.productionBackingUsd))) throw new Error('Trade regional funding/production counterparties do not reconcile.');
        const ordered = Object.entries(prepared.regions).filter(([, p]) => p.owner === id).sort(([a], [b]) => a.localeCompare(b));
        const groupWeights = ordered.flatMap(([, p]) => p.netBudgetByGroup);
        const householdShortfall = sum(c.ledger.categories.filter(l => c.markets[l.category]!.use === 'household'
          && ['food', 'energy', 'chemicals_pharmaceuticals'].includes(l.category)).map(l => {
            const m = c.markets[l.category]!;
            return money(Math.max(0, m.importNeedPerMonth - l.imports - Math.max(0, l.domesticConsumed - m.domesticNeedPerMonth)), m.baselinePriceMicroUsd);
          }));
        const shortfalls = sum(groupWeights) ? allocate(householdShortfall, groupWeights) : groupWeights.map(() => 0);
        ordered.forEach(([, p], regionIndex) => {
          for (let i = 0; i < 3; i++) {
            const shortfall = shortfalls[regionIndex * 3 + i];
            const availableDomestic = Math.max(0, p.netBudgetByGroup[i] - p.householdLandedByGroup[i] - shortfall);
            const expected = Math.min(availableDomestic, netGoodsBudgetAtRate(
              integer(p.nominalBudgetByGroup[i] - p.householdLandedByGroup[i] - consumptionCollectedAtRate(p.importedGoodsByGroup[i], p.consumptionTaxRateBps)),
              p.consumptionTaxRateBps));
            if (p.householdRequests[i] !== expected) throw new Error('Household import shortfall does not reconstruct from canonical trade evidence.');
          }
        });
        const reference = allocate(sum(household.map(l => l.importReferenceUsd)), ordered.flatMap(([, p]) => p.netBudgetByGroup));
        const essential = allocate(sum(household.filter(l => ['food', 'energy', 'chemicals_pharmaceuticals'].includes(l.category))
          .map(l => l.importReferenceUsd)), reference);
        if (ordered.flatMap(([, p]) => p.importedReferenceByGroup).some((v, i) => v !== reference[i])
          || ordered.flatMap(([, p]) => p.essentialImportsByGroup).some((v, i) => v !== essential[i])) throw new Error('Material import allocation changed its fixed-price quantity/opening-weight evidence.');
        const capacityBacking = sum(c.ledger.categories.map(l => l.productionCapacityBackingUsd));
        const realPrivate = Object.entries(prepared.regions).filter(([, p]) => p.owner === id).reduce((total, [rid, p]) => {
          const other = p.privateDemandUsd + p.publicDemandUsd - p.industrialBudgetUsd;
          return total + (other ? Number(BigInt(state.socioeconomy.regions[rid].economy!.otherDemandRealized)
            * BigInt(p.privateDemandUsd - p.industrialBudgetUsd) / BigInt(other)) : 0);
        }, 0);
        if (capacityBacking > realPrivate) throw new Error('Trade spare productive capacity has no conservative existing resource backing.');
      }
    });
    const reports = state.information.tradeReports;
    if (reports) {
      const referenced = new Set([...Object.values(reports.latest).map(r => r.id),
        ...state.information.briefings.filter(b => b.eventType === 'trade_report').map(b => b.sourceId)]);
      if (Object.keys(reports.byId).length !== referenced.size) errors.push('Trade reports are not bounded to current/referenced evidence.');
      for (const [id, r] of Object.entries(reports.byId)) capture(() => {
        if (id !== r.id || !referenced.has(id) || !context.countryIds.has(r.countryId)) throw new Error('Unknown or unreferenced government trade report.');
        validateTradeReport(r, t.initializedOn!, state.date, context.countryIds);
      });
      for (const [id, r] of Object.entries(reports.latest)) if (r.countryId !== id
        || deterministicFingerprint(r) !== deterministicFingerprint(reports.byId[r.id])) errors.push('Latest government trade evidence is not retained exactly.');
      for (const b of state.information.briefings.filter(b => b.eventType === 'trade_report' || b.fact.kind === 'trade_report')) {
        const r = reports.byId[b.sourceId];
        if (!r?.data || b.countryId !== r.countryId || b.createdOn !== r.producedOn
          || b.eventType !== 'trade_report' || b.fact.kind !== 'trade_report' || b.fact.reportId !== r.id || b.fact.evidenceStatus !== 'modelled'
          || b.access !== 'government' || b.portfolio !== 'economy' || b.pauseRequested || b.severity !== 'advisory'
          || b.headline !== tradeHeadline(r) || deterministicFingerprint(b.interpretation) !== deterministicFingerprint(tradeInterpretation(r))) errors.push('Trade briefing changed its dated government-only evidence or pause policy.');
      }
    } else if (state.information.briefings.some(b => b.eventType === 'trade_report')) errors.push('Trade briefing lacks retained evidence.');
    return errors;
  },
};
