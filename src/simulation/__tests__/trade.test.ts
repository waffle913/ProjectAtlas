import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { RegionEntity } from '../../types';
import { tradeCountries, tradeRegions, tradeContext, tradeFixture, tradeMonth } from './tradeFixture';
import { assertSimulationInvariants, validateFidelityConservation } from '../invariants';
import { money, quoteFlow, deriveDependency, affordableQuantity } from '../trade/model';
import { admitTradeMarket, admitTradeRoute, availableConsumption, prepareTradeMonth, setTradeStockTarget } from '../trade/runtime';
import { syntheticTradeMarket, SYNTHETIC_TRADE_SOURCE } from '../trade/scenario';
import { governmentHistoricalTrade, tradeObservations, validateTradeObservations, tradeEvidenceAvailableOn } from '../trade/data';
import { inspectTradeReports, runTradeReports } from '../trade/reports';
import { advanceSimulationDays } from '../engine';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { createSimulationSnapshotCache, cloneSimulationState } from '../state';
import { SimulationClock } from '../clock';
import { requestFidelityTransition } from '../fidelity';
import { simulationDelta } from '../world';
import { revokePoliticalOffice, createPoliticalPerson } from '../governance/runtime';
import { placeMilitaryOrder } from '../military/runtime';
import { militaryReadiness } from '../military/model';
import { consumptionCollectedAtRate } from '../fiscal/math';
import { deterministicFingerprint } from '../fingerprint';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TradeInspection } from '../../components/TradeInspection';
import schema14 from './fixtures/trade-migration-schema14.json';
import oracle from './fixtures/trade-schema14-continuation90.json';

describe('trade 0.17 causal aggregate goods, payments and evidence', () => {
  it('retains partial historical values, unknown physical coverage and future-publication separation', () => {
    const countries = new Set(tradeObservations.flatMap(r => [r.exporterId, r.importerId]));
    validateTradeObservations(countries);
    expect(tradeObservations).toHaveLength(62);
    expect(tradeObservations.every(r => r.quantity === undefined && r.temporalStatus === 'historical_prior')).toBe(true);
    expect(governmentHistoricalTrade(tradeCountries[0], '2026-01-01')).toEqual([]);
    expect(governmentHistoricalTrade(tradeCountries[0], '2026-10-03').length).toBeGreaterThan(1);
    const state = tradeFixture(false);
    expect(state.trade.countries[tradeCountries[0]].coverage).toBe('partial');
    expect(Object.keys(state.trade.countries[tradeCountries[0]].markets)).toEqual([]);
    const reports = runTradeReports(state).information.tradeReports!;
    expect(reports.latest[tradeCountries[0]].data).toBeUndefined();
    expect(reports.latest[tradeCountries[0]].status).toBe('unavailable');
  });
  it('preserves actual publisher publication and gates transformed evidence on every dated source input', () => {
    const r = structuredClone(tradeObservations.find(r => r.inputs?.length)!);
    expect(r.source.publishedOn).toBe('2026-02-19');
    expect(r.availableOn).toBe('2026-10-03');
    expect(tradeEvidenceAvailableOn(r)).toBe(r.availableOn);
    r.inputs![0].retrievedAt = '2027-01-01';
    expect(tradeEvidenceAvailableOn(r)).toBe('2027-01-01');
    r.inputs![0].licence = '';
    expect(() => tradeEvidenceAvailableOn(r)).toThrow();
  });
  it('books exact goods, existing expenditure, export receipts and customs without a second GDP or wallet', () => {
    const initial = tradeFixture(), state = tradeMonth(initial);
    expect(assertSimulationInvariants(state, tradeContext, 'save')).toBe(true);
    expect(state.trade.flows.length).toBeGreaterThan(2);
    for (const id of tradeCountries) {
      const ledger = state.trade.countries[id].ledger!.categories[0];
      expect(ledger.production + ledger.openingStock).toBe(ledger.domesticConsumed + ledger.exports + ledger.closingStock);
      expect(ledger.importPaymentUsd).toBe(ledger.importValueUsd + ledger.logisticsUsd + ledger.customsUsd);
      expect(state.fiscal.countries[id].revenueCalibration).toEqual(initial.fiscal.countries[id].revenueCalibration);
      expect(state.fiscal.countries[id].account!.customsRevenue!.collected).toBe(ledger.customsUsd);
    }
    for (const r of Object.values(state.socioeconomy.regions)) {
      const e = r.economy!;
      expect(e.output).toBe(e.consumption + e.otherDemandRealized);
      expect(e.householdIncome).toBeLessThanOrEqual(e.output);
      expect(availableConsumption(e)).toBe(e.consumption + e.importedReferenceConsumptionByGroup!.reduce((a, b) => a + b, 0));
    }
    const paid = state.trade.flows.reduce((a, f) => a + f.valueUsd, 0);
    const exported = Object.values(state.trade.countries).flatMap(c => c.ledger!.categories).reduce((a, l) => a + l.exportValueUsd, 0);
    expect(paid).toBe(exported); expect(paid).toBeGreaterThan(0);
  });
  it('preserves exact baseline material fields when no operative trade is admitted', () => {
    const initial = tradeFixture(false), next = tradeMonth(initial);
    expect(next.trade.flows).toEqual([]);
    expect(next.trade.prepared).toBeUndefined();
    expect(Object.values(next.socioeconomy.regions).every(r => r.economy!.importedConsumptionByGroup === undefined)).toBe(true);
    expect(Object.values(next.fiscal.countries).every(c => c.account!.customsRevenue === undefined)).toBe(true);
  });
  it('constrains multiple competing importers by shared exporters and route capacity', () => {
    const state = tradeMonth(tradeFixture());
    for (const id of tradeCountries.slice(0, 2)) expect(state.trade.flows.filter(f => f.exporterId === id).reduce((a, f) => a + f.quantity, 0)).toBeLessThanOrEqual(100);
    expect(state.trade.flows.every(f => f.quantity <= 60)).toBe(true);
    expect(state.trade.countries[tradeCountries[2]].ledger!.categories[0].imports).toBe(80);
    expect(state.trade.countries[tradeCountries[3]].ledger!.categories[0].imports).toBe(80);
  });
  it('derives dependency, supplier concentration and strategic explanation from fulfilled evidence', () => {
    const state = tradeMonth(tradeFixture()), id = tradeCountries[2], country = state.trade.countries[id];
    const dependency = deriveDependency(country.markets.food!, country.ledger!.categories[0], state.trade.flows.filter(f => f.importerId === id))!;
    expect(dependency.importShareBps).toBe(10000);
    expect(dependency.suppliers.reduce((a, s) => a + s.quantity, 0)).toBe(dependency.imports);
    expect(dependency.concentrationBps).toBeGreaterThan(0); expect(dependency.strategicUse).toBeTruthy();
    expect(state.information.tradeReports!.latest[id].data!.dependencies[0]).toEqual(dependency);
  });
  it('keeps supplier switching and domestic replacement gradual and resource constrained', () => {
    let state = tradeFixture();
    state.trade.routes = state.trade.routes.map(r => ({ ...r, establishedCapacity: 1 }));
    state = tradeMonth(state);
    const old = state.trade.countries[tradeCountries[2]].ledger!.categories[0];
    expect(old.shortage).toBeGreaterThan(0);
    state = tradeMonth(state);
    expect(state.trade.countries[tradeCountries[2]].markets.food!.replacementQuantity).toBe(3);
    expect(state.trade.routes.every(r => r.establishedCapacity === 11)).toBe(true);
    expect(state.trade.countries[tradeCountries[2]].ledger!.categories[0].production).toBeLessThanOrEqual(3);
  });
  it('lets tariffs raise landed costs and reduce volume instead of adding a flat trade penalty', () => {
    const initial = tradeFixture();
    for (const [i, id] of tradeCountries.entries()) {
      const m = initial.trade.countries[id].markets.food!;
      m.priceMicroUsd = m.baselinePriceMicroUsd = 1000000000000;
      if (i < 2) m.domesticNeedPerMonth = 0; else m.importNeedPerMonth = 200;
    }
    const without = structuredClone(initial), withTariff = structuredClone(initial);
    without.trade.routes = without.trade.routes.map(r => ({ ...r, tariffBps: 0 }));
    withTariff.trade.routes = withTariff.trade.routes.map(r => ({ ...r, tariffBps: 10000 }));
    const a = tradeMonth(without), b = tradeMonth(withTariff);
    expect(b.trade.flows.reduce((a, f) => a + f.quantity, 0)).toBeLessThan(a.trade.flows.reduce((a, f) => a + f.quantity, 0));
    expect(b.trade.flows.every(f => f.customsUsd === f.valueUsd)).toBe(true);
  });
  it('does not report an unavailable customs rule as a known zero rate', () => {
    let state = tradeFixture();
    state.trade.routes = state.trade.routes.map(r => ({ ...r, tariffBps: null }));
    state = tradeMonth(state);
    expect(state.trade.flows).toEqual([]);
    expect(state.trade.countries[tradeCountries[2]].ledger!.categories[0].shortage).toBe(80);
    expect(() => quoteFlow(state.trade.routes[0], 1000000, 1, 'aggregate', state.date)).toThrow(/unavailable is not zero/);
    expect(state.fiscal.countries[tradeCountries[2]].account!.customsRevenue!.unavailableRates).toBeGreaterThan(0);
  });
  it('rejects invalid admissions, units, overspend, goods creation and unsafe monetary input', () => {
    const state = tradeFixture(false), m = syntheticTradeMarket('food');
    expect(() => admitTradeMarket(state, 'country.nonexistent', m)).toThrow();
    expect(() => admitTradeMarket(state, tradeCountries[0], { ...m, productionPerMonth: -1 })).toThrow();
    expect(() => money(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toThrow();
    expect(() => admitTradeRoute(state, { id: 'invalid', exporterId: tradeCountries[0], importerId: tradeCountries[1],
      category: 'food', source: { ...SYNTHETIC_TRADE_SOURCE }, capacityPerMonth: 1,
      establishedCapacity: 1, expansionPerMonth: 1, logisticsBps: 0, tariffBps: 0 })).toThrow();
    const active = tradeMonth(tradeFixture());
    active.trade.flows[0].quantity++;
    expect(() => assertSimulationInvariants(active, tradeContext, 'save')).toThrow();
  });
  it('preserves known zero needs as not exposed instead of dividing by zero', () => {
    let state = tradeFixture(false);
    state = admitTradeMarket(state, tradeCountries[0], syntheticTradeMarket('food'));
    state = tradeMonth(state);
    const c = state.trade.countries[tradeCountries[0]];
    expect(c.ledger!.categories[0].need).toBe(0);
    expect(deriveDependency(c.markets.food!, c.ledger!.categories[0], [])).toBeUndefined();
    expect(assertSimulationInvariants(state, tradeContext, 'save')).toBe(true);
  });
  it('keeps preparation idempotent and preserves immutable incoming state', () => {
    const state = { ...tradeFixture(), date: '2026-02-01' }, old = structuredClone(state);
    const prepared = prepareTradeMonth(state);
    expect(state).toEqual(old); expect(prepareTradeMonth(prepared)).toBe(prepared);
  });
  it('makes route and Country insertion order immaterial', () => {
    const initial = tradeFixture(), shuffled = structuredClone(initial);
    shuffled.trade.countries = Object.fromEntries(Object.entries(shuffled.trade.countries).reverse());
    shuffled.trade.routes.reverse();
    const a = tradeMonth(initial), b = tradeMonth(shuffled);
    expect(a.trade).toEqual(b.trade); expect(a.socioeconomy).toEqual(b.socioeconomy); expect(a.fiscal).toEqual(b.fiscal);
  });
  it('serializes active trade exactly and continues deterministically with frozen snapshots and deltas', () => {
    const state = tradeMonth(tradeFixture());
    const saved = serializeSimulationState(state, tradeContext);
    const restored = restoreSimulationState(saved, tradeRegions, {}, {}, tradeContext);
    expect(restored).toEqual(state);
    expect(advanceSimulationDays(restored, 62)).toEqual(advanceSimulationDays(state, 62));
    expect(cloneSimulationState(state)).toEqual(state);
    const snapshot = createSimulationSnapshotCache()(state);
    expect(Object.isFrozen(snapshot.trade.flows)).toBe(true);
    expect(simulationDelta(tradeFixture(), state).changedDomains).toContain('trade');
    const clock = new SimulationClock(state);
    expect(clock.snapshot()).toBe(clock.snapshot());
  });
  it.each(['missingGoods', 'missingReference', 'changedReference', 'missingBudget', 'missingEssential', 'missingCoverage', 'negativeBudget', 'shortBudget',
    'negativeGoods', 'shortGoods', 'changedBudget', 'changedEssential', 'changedCoverage'] as const)(
    'rejects %s import evidence at serialization and reload without reconstructing history', corruption => {
      const state = tradeMonth(tradeFixture()), e = state.socioeconomy.regions[tradeRegions[2].id].economy!;
      expect(e.importedConsumptionByGroup!.some(v => v > 0)).toBe(true);
      if (corruption === 'missingGoods') delete e.importedConsumptionByGroup;
      if (corruption === 'missingReference') delete e.importedReferenceConsumptionByGroup;
      if (corruption === 'changedReference') e.importedReferenceConsumptionByGroup![0]++;
      if (corruption === 'missingBudget') delete e.importRequestedBudgetByGroup;
      if (corruption === 'missingEssential') delete e.importEssentialConsumption;
      if (corruption === 'missingCoverage') delete e.importAvailableNeedsCoverageBps;
      if (corruption === 'negativeBudget') e.importRequestedBudgetByGroup = [-1, 0, 0];
      if (corruption === 'shortBudget') e.importRequestedBudgetByGroup = [1];
      if (corruption === 'negativeGoods') e.importedConsumptionByGroup = [-1, 0, 0];
      if (corruption === 'shortGoods') e.importedConsumptionByGroup = [1];
      if (corruption === 'changedBudget') e.importRequestedBudgetByGroup![0]++;
      if (corruption === 'changedEssential') e.importEssentialConsumption!++;
      if (corruption === 'changedCoverage') e.importAvailableNeedsCoverageBps!++;
      expect(() => serializeSimulationState(state, tradeContext)).toThrow();
      expect(() => restoreSimulationState(JSON.stringify(state), tradeRegions, {}, {}, tradeContext)).toThrow();
    });
  it('defensively clones both canonical imported flow arrays', () => {
    const state = tradeMonth(tradeFixture()), cloned = cloneSimulationState(state);
    for (const [id, r] of Object.entries(state.socioeconomy.regions)) {
      const e = cloned.socioeconomy.regions[id].economy!;
      expect(e.importedConsumptionByGroup).not.toBe(r.economy!.importedConsumptionByGroup);
      expect(e.importRequestedBudgetByGroup).not.toBe(r.economy!.importRequestedBudgetByGroup);
      expect(e.importedReferenceConsumptionByGroup).not.toBe(r.economy!.importedReferenceConsumptionByGroup);
      e.importedConsumptionByGroup![0]++;
      e.importRequestedBudgetByGroup![0]++;
      expect(e.importedConsumptionByGroup).not.toEqual(r.economy!.importedConsumptionByGroup);
      expect(e.importRequestedBudgetByGroup).not.toEqual(r.economy!.importRequestedBudgetByGroup);
    }
  });
  it('rejects deleted prepared proof or fiscal booking even when imported tuple fields are also removed', () => {
    const state = tradeMonth(tradeFixture()), missingProof = structuredClone(state);
    delete missingProof.trade.prepared;
    for (const r of Object.values(missingProof.socioeconomy.regions)) {
      delete r.economy!.importedConsumptionByGroup; delete r.economy!.importedReferenceConsumptionByGroup;
      delete r.economy!.importRequestedBudgetByGroup; delete r.economy!.importEssentialConsumption;
      delete r.economy!.importAvailableNeedsCoverageBps;
    }
    expect(() => serializeSimulationState(missingProof, tradeContext)).toThrow();
    expect(() => restoreSimulationState(JSON.stringify(missingProof), tradeRegions, {}, {}, tradeContext)).toThrow();
    delete state.fiscal.regions[tradeRegions[2].id].tradePurchases;
    expect(() => serializeSimulationState(state, tradeContext)).toThrow();
    expect(() => restoreSimulationState(JSON.stringify(state), tradeRegions, {}, {}, tradeContext)).toThrow();
  });
  it('conserves complete fidelity cycles including trade, stock and receipts', () => {
    let state = tradeFixture();
    state.trade.countries[tradeCountries[0]].markets.food!.stock = {
      opening: 5, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 5, target: 10, capacity: 20,
    };
    state = tradeMonth(state);
    for (const target of ['Detailed', 'Standard', 'Background', 'Detailed'] as const) {
      const previous = state;
      state = advanceSimulationDays(requestFidelityTransition(state, tradeCountries[0], target, tradeContext.countryIds), 1);
      expect(validateFidelityConservation(previous, state)).toEqual([]);
    }
  });
  it('changes delivered costs progressively from real shortages and financially backed export demand', () => {
    let state = tradeFixture();
    state.trade.countries[tradeCountries[0]].markets.food!.productionPerMonth = 21;
    state.trade.countries[tradeCountries[1]].markets.food!.productionPerMonth = 20;
    state = tradeMonth(state);
    const first = state.trade.countries[tradeCountries[0]].ledger!.categories[0];
    expect(first.exportDemandShortage).toBeGreaterThan(0);
    expect(state.trade.countries[tradeCountries[0]].markets.food!.priceMicroUsd).toBe(10500000000);
    const second = tradeMonth(state);
    expect(second.trade.flows.some(f => f.exporterId === tradeCountries[0] && f.priceMicroUsd === 10500000000)).toBe(true);
    expect(second.trade.countries[tradeCountries[0]].markets.food!.priceMicroUsd).toBe(11025000000);
    expect(assertSimulationInvariants(second, tradeContext, 'save')).toBe(true);
  });
  it('keeps imported material availability at fixed reference prices while actual prices change payment and VAT', () => {
    const initial = tradeFixture(), dear = structuredClone(initial);
    for (const id of tradeCountries.slice(0, 2)) dear.trade.countries[id].markets.food!.priceMicroUsd *= 2;
    const a = tradeMonth(initial), b = tradeMonth(dear);
    expect(b.trade.flows.map(f => f.quantity)).toEqual(a.trade.flows.map(f => f.quantity));
    expect(b.trade.flows.reduce((n, f) => n + f.valueUsd, 0)).toBe(2 * a.trade.flows.reduce((n, f) => n + f.valueUsd, 0));
    for (const [id, p] of Object.entries(a.trade.prepared!.regions)) {
      const q = b.trade.prepared!.regions[id];
      expect(q.importedReferenceByGroup).toEqual(p.importedReferenceByGroup);
      expect(q.essentialImportsByGroup).toEqual(p.essentialImportsByGroup);
    }
    const short = structuredClone(initial);
    short.trade.routes = short.trade.routes.map(r => ({ ...r, capacityPerMonth: 10, establishedCapacity: 10 }));
    const c = tradeMonth(short);
    const essential = (s: typeof a) => Object.values(s.trade.prepared!.regions).flatMap(p => p.essentialImportsByGroup).reduce((n, v) => n + v, 0);
    expect(essential(b)).toBe(essential(a));
    expect(essential(c)).toBeLessThan(essential(a));
    expect(assertSimulationInvariants(b, tradeContext, 'save')).toBe(true);
    expect(assertSimulationInvariants(c, tradeContext, 'save')).toBe(true);
  });
  it('does not create exports or dependence when represented foreign need is insufficient', () => {
    const initial = tradeFixture();
    for (const id of tradeCountries.slice(2)) initial.trade.countries[id].markets.food!.importNeedPerMonth = 0;
    const state = tradeMonth(initial);
    expect(state.trade.flows).toEqual([]);
    expect(state.trade.countries[tradeCountries[0]].ledger!.categories[0].production).toBe(20);
    expect(Object.values(state.information.tradeReports!.latest).every(r => !r.data?.dependencies.length)).toBe(true);
  });
  it('allocates exact supplier shares with stable ties and a reconstructible concentration formula', () => {
    const state = tradeMonth(tradeFixture()), c = state.trade.countries[tradeCountries[2]], l = c.ledger!.categories[0];
    const flow = state.trade.flows[0];
    const flows = [tradeCountries[0], tradeCountries[1], tradeCountries[3]].map(exporterId => ({ ...flow, exporterId, quantity: 1 }));
    const evidence = { ...l, imports: 3, need: 3 };
    const a = deriveDependency(c.markets.food!, evidence, flows)!;
    expect(a.suppliers.reduce((n, s) => n + s.shareBps, 0)).toBe(10000);
    expect(a.concentrationBps).toBe(3333);
    expect(deriveDependency(c.markets.food!, evidence, [...flows].reverse())).toEqual(a);
    expect(() => deriveDependency(c.markets.food!, evidence, [])).toThrow();
    expect(deriveDependency(c.markets.food!, { ...l, imports: 1, need: 80 }, [{ ...flow, quantity: 1 }])!.importShareBps).toBe(125);
  });
  it('restricts commands to the existing controlled resolved executive office and existing stocks', () => {
    let state = tradeFixture(false);
    const person = state.governance.player.controlledPersonId!;
    state = admitTradeMarket(state, tradeCountries[0], syntheticTradeMarket('food', {
      stock: { opening: 10, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 10, capacity: 100, target: 10 },
    }));
    expect(setTradeStockTarget(state, tradeCountries[0], person, 'food', 20).trade.countries[tradeCountries[0]].markets.food!.stock!.target).toBe(20);
    expect(() => setTradeStockTarget(state, tradeCountries[0], person, 'food', 101)).toThrow();
    expect(() => setTradeStockTarget(revokePoliticalOffice(state, person), tradeCountries[0], person, 'food', 20)).toThrow();
    expect(() => setTradeStockTarget(state, tradeCountries[1], person, 'food', 20)).toThrow();
  });
  it('presents only dated authorized reports; later raw shortages do not alter the briefing', () => {
    const state = tradeMonth(tradeFixture()), person = state.governance.player.controlledPersonId!;
    const report = inspectTradeReports(state, tradeCountries[0], person)!;
    expect(report.stale).toBe(false);
    const later = advanceSimulationDays(state, 1);
    later.trade.countries[tradeCountries[0]].ledger!.categories[0].shortage = 999;
    expect(inspectTradeReports(later, tradeCountries[0], person)).toEqual({ ...report, stale: true });
    expect(inspectTradeReports(revokePoliticalOffice(state, person), tradeCountries[0], person)).toBeUndefined();
    const other = createPoliticalPerson(state, { countryId: tradeCountries[0], displayName: 'No office' });
    const noOffice = Object.keys(other.governance.persons).find(id => !state.governance.persons[id])!;
    expect(inspectTradeReports(other, tradeCountries[0], noOffice)).toBeUndefined();
    expect(state.information.briefings.filter(b => b.eventType === 'trade_report').every(b => !b.pauseRequested && b.access === 'government')).toBe(true);
  });
  it('migrates a genuine schema14 advanced save without replay and matches the independent original 90-day oracle', () => {
    expect(createHash('sha256').update(readFileSync(new URL('./fixtures/trade-migration-schema14.json', import.meta.url))).digest('hex')).toBe(oracle.referenceFixtureSha256);
    expect(schema14.referenceCommit).toBe('7580ed683a8164764fbccfbe94bb828da84c57ed');
    const regions = schema14.regions as RegionEntity[];
    const context = { regions, countryIds: new Set(Object.keys(schema14.state.engine.fidelityByCountry)), regionIds: new Set(regions.map(r => r.id)) };
    const state = restoreSimulationState(JSON.stringify(schema14.state), regions, {}, {}, context);
    expect(state.date).toBe('2028-04-05'); expect(state.engine.tick).toBe(825); expect(state.trade.initializedOn).toBe(state.date);
    for (const field of ['socioeconomy', 'fiscal', 'military', 'engine', 'wars', 'occupationByRegion', 'regionOwnership', 'governance', 'politics', 'crisis'] as const) expect(state[field]).toEqual(schema14.state[field]);
    const continued = advanceSimulationDays(state, 90);
    for (const field of ['socioeconomy', 'fiscal', 'military', 'engine', 'wars', 'occupationByRegion', 'regionOwnership', 'governance', 'politics', 'crisis'] as const) expect(continued[field]).toEqual(oracle.state[field]);
    expect(continued.date).toBe('2028-07-04'); expect(continued.trade.flows).toEqual([]);
    const { tradeReports: _newReporting, ...oldInformation } = continued.information;
    expect(oldInformation).toEqual(oracle.state.information);
    expect(assertSimulationInvariants(continued, context, 'save')).toBe(true);
  });
  it('keeps 0.18/0.19/0.20 APIs and structural war/sovereignty outside trade', async () => {
    const api = await import('../trade/runtime');
    expect(Object.keys(api).some(k => /sanction|embargo|blockade|war|occup|treaty|troop|sovereign|retaliat/i.test(k))).toBe(false);
    const initial = tradeFixture(), state = tradeMonth(initial);
    for (const field of ['wars', 'occupationByRegion', 'regionOwnership', 'claims', 'explicitCasusBelli', 'bilateralRelations'] as const) expect(state[field]).toEqual(initial[field]);
  });
  it('uses only actually recorded opening income and contracts the following month after domestic income falls', () => {
    const first = tradeMonth(tradeFixture()), second = tradeMonth(first);
    const id = tradeRegions[2].id, p = second.trade.prepared!.regions[id];
    expect(p.budgetAsOfDate).toBe(first.date);
    expect(p.openingDisposableByGroup).toEqual(first.fiscal.regions[id].disposable);
    expect(p.nominalBudgetByGroup.reduce((a, b) => a + b, 0)).toBeLessThan(first.trade.prepared!.regions[id].nominalBudgetByGroup.reduce((a, b) => a + b, 0));
    for (const state of [first, second]) for (const [rid, prepared] of Object.entries(state.trade.prepared!.regions)) {
      const region = state.fiscal.regions[rid];
      for (let i = 0; i < 3; i++) expect(region.grossExpenditure[i] + prepared.householdLandedByGroup[i]
        + region.tradePurchases!.importConsumptionTax[i]).toBeLessThanOrEqual(prepared.nominalBudgetByGroup[i]);
      expect(prepared.industrialBudgetUsd).toBeLessThanOrEqual(prepared.privateDemandUsd);
    }
  });
  it('collects import consumption taxes exactly once and keeps taxed goods, fees and household purchases distinct', () => {
    const state = tradeMonth(tradeFixture());
    for (const [rid, p] of Object.entries(state.trade.prepared!.regions)) {
      const r = state.fiscal.regions[rid], imports = r.tradePurchases!;
      expect(imports.importConsumptionTax).toEqual(imports.importedGoods.map(v => consumptionCollectedAtRate(v, p.consumptionTaxRateBps)));
      expect(r.taxes.consumption.collected).toBe(r.consumptionTax.reduce((a, b) => a + b, 0) + imports.importConsumptionTax.reduce((a, b) => a + b, 0));
      expect(imports.importedGoods).toEqual(p.importedGoodsByGroup);
      expect(imports.landedPayment).toEqual(p.householdLandedByGroup);
      expect(imports.landedPayment.every((v, i) => v >= imports.importedGoods[i])).toBe(true);
    }
  });
  it('conserves configured stock formation, drawdown and bounded storage without free imported inventory', () => {
    let state = tradeFixture(false);
    state = admitTradeMarket(state, tradeCountries[0], syntheticTradeMarket('industrial_goods', {
      productionPerMonth: 10, domesticNeedPerMonth: 5, use: 'industrial',
      stock: { opening: 2, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 2, capacity: 20, target: 15 },
    }));
    state = tradeMonth(state);
    expect(state.trade.countries[tradeCountries[0]].markets.industrial_goods!.stock!.quantity).toBe(7);
    state.trade.countries[tradeCountries[0]].markets.industrial_goods!.productionPerMonth = 0;
    state = tradeMonth(state);
    const stock = state.trade.countries[tradeCountries[0]].markets.industrial_goods!.stock!;
    expect(stock.quantity).toBe(2); expect(stock.consumed).toBe(5);
    expect(stock.opening + stock.produced + stock.received - stock.consumed - stock.exported).toBe(stock.quantity);
    expect(assertSimulationInvariants(state, tradeContext, 'save')).toBe(true);
  });
  it('constrains military manufacturing through actual supplementary input units, never a readiness multiplier', () => {
    const regions = schema14.regions as RegionEntity[];
    const context = { regions, countryIds: new Set(Object.keys(schema14.state.engine.fidelityByCountry)), regionIds: new Set(regions.map(r => r.id)) };
    const original = restoreSimulationState(JSON.stringify(schema14.state), regions, {}, {}, context);
    const id = tradeCountries[0], person = original.governance.player.controlledPersonId!;
    const ordered = placeMilitaryOrder(original, id, person, 'truck', 6);
    const admitted = admitTradeMarket(ordered, id, syntheticTradeMarket('industrial_goods', {
      productionPerMonth: 1, domesticNeedPerMonth: 1, use: 'industrial', militaryInputPerFactoryUnit: 1,
      strategicUse: 'Explicit supplementary manufacturing throughput',
    }));
    const blocked = structuredClone(admitted);
    blocked.trade.countries[id].markets.industrial_goods!.productionPerMonth = 0;
    const a = tradeMonth(admitted), b = tradeMonth(blocked);
    const first = a.military.countries[id].capability!, second = b.military.countries[id].capability!;
    expect(first.lastLedger!.productionUnits).toBe(1); expect(second.lastLedger!.productionUnits).toBe(0);
    expect(a.trade.countries[id].ledger!.categories[0].militaryInputConsumed).toBe(1);
    expect(b.trade.countries[id].ledger!.categories[0].militaryInputConsumed).toBe(0);
    expect(first.industrialMaterials.quantity).toBe(second.industrialMaterials.quantity - first.parameters.factoryMaterialPerUnit);
    expect(militaryReadiness(first)).toEqual(militaryReadiness(second));
    expect(a.wars).toEqual(b.wars); expect(a.regionOwnership).toEqual(b.regionOwnership); expect(a.occupationByRegion).toEqual(b.occupationByRegion);
    expect(assertSimulationInvariants(a, context, 'save')).toBe(true);
    expect(assertSimulationInvariants(b, context, 'save')).toBe(true);
  });
  it.each(['flow', 'unit', 'blankUnit', 'need', 'dependency', 'partner', 'alert', 'tax', 'capacity', 'unknownPartner', 'missingCategory', 'backing'] as const)('rejects internally altered %s report evidence even with a regenerated fingerprint', field => {
    const state = tradeMonth(tradeFixture()), r = state.information.tradeReports!.latest[tradeCountries[2]], d = r.data!;
    if (field === 'flow') d.flows[0].quantity++;
    if (field === 'need') d.categories[0].need++;
    if (field === 'dependency') d.dependencies[0].concentrationBps++;
    if (field === 'partner') d.partners[0].importsUsd++;
    if (field === 'alert') d.alertCodes.push('invented_alert');
    if (field === 'tax') d.categories[0].customsUsd++;
    if (field === 'capacity') d.admittedMarkets[0].productionPerMonth = -1;
    if (field === 'unknownPartner') d.routes.push({ ...d.routes[0], id: 'forged-unused-route', exporterId: 'country.nonexistent' });
    if (field === 'missingCategory') d.routes.push({ ...d.routes[0], id: 'forged-unused-route', category: 'energy' });
    if (field === 'unit') d.flows[0].unit = 'incompatible_invented_unit';
    if (field === 'blankUnit') d.flows[0].unit = '';
    if (field === 'backing') d.categories[0].productionBackingUsd++;
    r.fingerprint = deterministicFingerprint({ ...r, fingerprint: undefined });
    expect(() => assertSimulationInvariants(state, tradeContext, 'save')).toThrow();
    expect(() => serializeSimulationState(state, tradeContext)).toThrow();
    expect(() => restoreSimulationState(JSON.stringify(state), tradeRegions, {}, {}, tradeContext)).toThrow();
  });
  it('renders the government snapshot, unavailable coverage and source notices without live Reality', () => {
    const state = tradeMonth(tradeFixture()), personId = state.governance.player.controlledPersonId!;
    state.trade.countries[tradeCountries[0]].markets.food!.unit = 'PRIVATE_REALITY_MARKER';
    const markup = renderToStaticMarkup(createElement(TradeInspection, {
      state, countryId: tradeCountries[0], personId, onStateChange: () => { throw new Error('Inspection issued a command.'); },
    }));
    expect(markup).toContain('Booked monthly flows'); expect(markup).toContain('Reconstructible dependencies');
    expect(markup).not.toContain('PRIVATE_REALITY_MARKER');
    const withoutOffice = revokePoliticalOffice(state, personId);
    expect(renderToStaticMarkup(createElement(TradeInspection, {
      state: withoutOffice, countryId: tradeCountries[0], personId, onStateChange: () => {},
    }))).toContain('No accessible dated trade report');
  });
  it('uses exact integer landed quotes, including a real known zero customs rate', () => {
    const route = tradeFixture().trade.routes[0], flow = quoteFlow({ ...route, tariffBps: 0 }, 1000000, 7, 'aggregate', '2026-02-01');
    expect(flow.valueUsd).toBe(7); expect(flow.customsCoverage).toBe('modelled'); expect(flow.tariffBps).toBe(0);
    expect(flow.landedUsd).toBe(flow.valueUsd + flow.logisticsUsd);
  });
  it('rejects sub-dollar invoice units instead of delivering positive quantities for zero rounded payment', () => {
    const route = tradeFixture().trade.routes[0];
    expect(() => quoteFlow(route, 100000, 4, 'fine_unit', '2026-02-01')).toThrow(/aggregate/);
    expect(() => affordableQuantity(0, 4, n => money(n, 100000))).toThrow(/positive represented whole-USD/);
    expect(affordableQuantity(0, 4, n => money(n, 1000000))).toBe(0);
    const state = tradeFixture(false);
    expect(() => admitTradeMarket(state, tradeCountries[0], syntheticTradeMarket('food', {
      priceMicroUsd: 100000, baselinePriceMicroUsd: 100000,
    }))).toThrow();
  });
  it('rejects a one-unit stock imbalance hidden by unsafe intermediate floating sums', () => {
    const state = tradeFixture(false), limit = Number.MAX_SAFE_INTEGER;
    const stock = { opening: limit, produced: 2, received: 0, consumed: limit, exported: 0, quantity: 1, capacity: 10, target: 1 };
    expect(stock.opening + stock.produced - stock.consumed).toBe(stock.quantity);
    expect(() => admitTradeMarket(state, tradeCountries[0], syntheticTradeMarket('food', { stock }))).toThrow(/stock conservation/);
  });
  it('backs each fractional-price export invoice inside the same actual private output envelope', () => {
    let state = tradeFixture(false);
    const seller = tradeCountries[0], buyers = tradeCountries.slice(2);
    state.fiscal.regions[tradeRegions[0].id].privateResidual = 3;
    state = admitTradeMarket(state, seller, syntheticTradeMarket('food', {
      productionPerMonth: 2, priceMicroUsd: 1500000, baselinePriceMicroUsd: 1500000,
    }));
    for (const buyer of buyers) {
      state = admitTradeMarket(state, buyer, syntheticTradeMarket('food', {
        importNeedPerMonth: 1, priceMicroUsd: 1500000, baselinePriceMicroUsd: 1500000,
      }));
      state = admitTradeRoute(state, { id: `fractional:${buyer}`, exporterId: seller, importerId: buyer, category: 'food',
        source: { ...SYNTHETIC_TRADE_SOURCE }, capacityPerMonth: 1, establishedCapacity: 1, expansionPerMonth: 0, logisticsBps: 0, tariffBps: 0 });
    }
    state = tradeMonth(state);
    const l = state.trade.countries[seller].ledger!.categories[0];
    expect(money(2, 1500000)).toBe(3);
    expect(l.exports).toBe(1); expect(l.exportValueUsd).toBe(2);
    expect(l.productionBackingUsd).toBe(2); expect(l.productionCapacityBackingUsd).toBe(3);
    const prepared = state.trade.prepared!.regions[tradeRegions[0].id];
    const realizedOther = state.socioeconomy.regions[tradeRegions[0].id].economy!.otherDemandRealized;
    expect(BigInt(realizedOther) * BigInt(prepared.privateDemandUsd)
      / BigInt(prepared.privateDemandUsd + prepared.publicDemandUsd)).toBe(3n);
    expect(Object.values(state.trade.countries).flatMap(c => c.ledger?.alternatives ?? []).every(a => a.spareSupply === 0)).toBe(true);
    expect(assertSimulationInvariants(state, tradeContext, 'save')).toBe(true);
    const overbooked = structuredClone(state);
    overbooked.trade.countries[seller].ledger!.categories[0].exportValueUsd = 4;
    overbooked.trade.countries[seller].ledger!.categories[0].productionBackingUsd = 3;
    expect(() => serializeSimulationState(overbooked, tradeContext)).toThrow();
    expect(() => restoreSimulationState(JSON.stringify(overbooked), tradeRegions, {}, {}, tradeContext)).toThrow();
  });
  it('rejects source/category/route admission after booking instead of rewriting saved history', () => {
    const state = tradeMonth(tradeFixture()), previous = structuredClone(state);
    expect(() => admitTradeMarket(state, tradeCountries[0], syntheticTradeMarket('energy'))).toThrow(/initialization-only/);
    expect(() => admitTradeRoute(state, { ...state.trade.routes[0], id: 'post-month-route',
      importerId: tradeCountries[1], tariffBps: null })).toThrow(/initialization-only/);
    expect(state).toEqual(previous); expect(assertSimulationInvariants(state, tradeContext, 'save')).toBe(true);
  });
  it('rejects configured-stock omission from canonical or retained report evidence without losing conserved units', () => {
    const initial = tradeFixture(false), seller = tradeCountries[0];
    const state = tradeMonth(admitTradeMarket(initial, seller, syntheticTradeMarket('food', { productionPerMonth: 20,
      stock: { opening: 5, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 5, target: 10, capacity: 20 } })));
    expect(state.trade.countries[seller].ledger!.categories[0].closingStock).toBe(10);
    for (const surface of ['canonical', 'report']) {
      const corrupt = structuredClone(state);
      if (surface === 'canonical') delete corrupt.trade.countries[seller].markets.food!.stock;
      else {
        const report = corrupt.information.tradeReports!.latest[seller];
        delete report.data!.admittedMarkets[0].stock;
        report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
        corrupt.information.tradeReports!.byId[report.id] = report;
      }
      expect(() => serializeSimulationState(corrupt, tradeContext)).toThrow();
      expect(() => restoreSimulationState(JSON.stringify(corrupt), tradeRegions, {}, {}, tradeContext)).toThrow();
    }
  });
  it('rejects future-publication operative source admission even for a synthetic assumption', () => {
    const state = tradeFixture(false), market = syntheticTradeMarket('food');
    market.source.publishedOn = '2026-02-01';
    expect(() => admitTradeMarket(state, tradeCountries[0], market)).toThrow(/available evidence/);
  });
});
