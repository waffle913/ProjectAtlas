import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { cohortsFor, emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { CATEGORIES, emptyFiscal, type Policy, type TaxRule } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { initializePartyLeaders } from '../governance/runtime';
import { emptyInformation } from '../information/model';
import { initializeFiscal, scheduleFiscalReform, evolveService, inspectFiscal, evaluateImmediateFiscalPolicyCounterfactual, monthlyBudgetForDate } from '../fiscal/runtime';
import { consumptionCollected, consumptionLiability, netGoodsBudget, payrollMonthly, progressiveTax, progressiveMonthly, validateRule } from '../fiscal/math';
import { createEngineState, cloneSimulationState } from '../state';
import { advanceSimulationDays, createCoreScheduler } from '../engine';
import { assertSimulationInvariants, validateSimulationInvariants, validateFidelityConservation } from '../invariants';
import { SimulationClock } from '../clock';
import { migrateSimulationState, restoreSimulationState, serializeSimulationState } from '../save';
import { requestFidelityTransition } from '../fidelity';
import { simulationDelta } from '../world';
const ids = ['country.u6myyj', 'country.1aj872z', 'unknown'];
const regions: RegionEntity[] = ids.map(id => ({ id: `r-${id}`, parentCountryId: id, initialOwnerCountryId: id, commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } }));
const context = { regions, regionIds: new Set(regions.map(r => r.id)), countryIds: new Set(ids) };
const base = (): SimulationState => initializeSocioeconomy({ schemaVersion: 19, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {}, regionOwnership: Object.fromEntries(regions.map(r => [r.id, r.parentCountryId])), populationByRegion: Object.fromEntries(regions.map(r => [r.id, 10000])), economicOutputByRegion: Object.fromEntries(regions.map(r => [r.id, 1200000000])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(ids) }, regions);
const initial = () => initializeFiscal(base());
const us = ids[0], ca = ids[1], rid = `r-${us}`;
const custom = (rule: TaxRule, changes: Partial<TaxRule>): TaxRule => ({ ...rule, ...changes, status: 'modelled', id: `debug-${rule.id}`, source: 'debug:explicit-policy', document: 'Test reform', limitations: 'Modelled test policy, not observed law.' });
const reform = (s: SimulationState, countryId: string, policy: Policy, effectiveDate = s.date) => scheduleFiscalReform(s, { countryId, policy, effectiveDate });

describe('0.11 fiscal legal and numeric contracts', () => {
  it('requires one ledger per active economy, rejects unknown ledgers and preserves booked owners through transfer', () => {
    const state = advanceSimulationDays(initial(), 31), before = structuredClone(state.fiscal.regions[rid]);
    expect(assertSimulationInvariants(state, context, 'reload')).toBe(true);
    const missing = structuredClone(state); delete missing.fiscal.regions[rid];
    expect(() => assertSimulationInvariants(missing, context, 'reload')).toThrow(/Missing active economic Region fiscal ledger/);
    const extra = structuredClone(state); extra.fiscal.regions['region.unknown'] = structuredClone(before);
    expect(() => assertSimulationInvariants(extra, context, 'reload')).toThrow(/Unknown\/non-economic Region/);
    state.regionOwnership[rid] = ca;
    expect(assertSimulationInvariants(state, context, 'reload')).toBe(true);
    expect(state.fiscal.regions[rid]).toEqual(before);
  });
  it.each(['initialization', 'history', 'account'] as const)('rejects impossible fiscal %s dates', field => {
    const state = advanceSimulationDays(initial(), 31); state.date = '2026-03-01';
    const country = state.fiscal.countries[us];
    if (field === 'initialization') country.initialization.date = '2026-02-30';
    if (field === 'history') country.policyHistory[0].date = '2026-02-30';
    if (field === 'account') country.account!.date = '2026-02-30';
    expect(() => assertSimulationInvariants(state, context, 'reload')).toThrow(/initialization provenance|policy history date|Account date/);
  });
  it('conserves every annual category through the canonical dated monthly appropriation', () => {
    const budget = initial().fiscal.countries[us].annualBudget;
    for (const category of CATEGORIES) budget[category] = CATEGORIES.indexOf(category) * 13 + 1;
    const months = Array.from({ length: 12 }, (_, index) => monthlyBudgetForDate(budget, `2026-${String(index + 1).padStart(2, '0')}-01`));
    for (const category of CATEGORIES) expect(months.reduce((sum, month) => sum + month[category], 0)).toBe(budget[category]);
    expect(months[0].health).toBeGreaterThanOrEqual(months[11].health);
    expect(() => monthlyBudgetForDate(budget, '2026-02-30')).toThrow();
  });
  it('compares B with current same-day law A rather than a booked older ledger', () => {
    const original = initial(), policy = original.fiscal.countries[us].policy;
    const lawA = { ...policy, personal: custom(policy.personal!, { allowance: 0, bands: [{ lower: 0, rateBps: 1000 }] }) };
    const lawB = { ...policy, personal: custom(policy.personal!, { allowance: 0, bands: [{ lower: 0, rateBps: 2000 }] }) };
    const changed = reform(original, us, lawA), before = structuredClone(changed);
    const current = evaluateImmediateFiscalPolicyCounterfactual(changed, us, lawA, changed.date)!;
    const proposed = evaluateImmediateFiscalPolicyCounterfactual(changed, us, lawB, changed.date)!;
    expect(current.proposedKnownRevenue).toBe(current.currentKnownRevenue); expect(current.proposedDisposableByIncome).toEqual(current.currentDisposableByIncome);
    expect(proposed.currentKnownRevenue).toBe(current.currentKnownRevenue); expect(proposed.proposedKnownRevenue).toBeGreaterThan(proposed.currentKnownRevenue);
    expect(changed).toEqual(before); expect(changed.fiscal.regions[rid]).toEqual(original.fiscal.regions[rid]);
  });
  it('uses the new sovereign current law without rewriting the booked owner or non-tax flows', () => {
    const state = initial(), booked = state.fiscal.regions[rid]; booked.transfers = [101, 202, 303]; booked.publicOrders = 777; booked.privateResidual = 888;
    state.regionOwnership[rid] = ca;
    const before = structuredClone(state), currentLaw = state.fiscal.countries[ca].policy;
    const unchanged = evaluateImmediateFiscalPolicyCounterfactual(state, ca, currentLaw, state.date)!;
    expect(unchanged.currentKnownRevenue).toBe(unchanged.proposedKnownRevenue); expect(unchanged.currentDisposableByIncome).toEqual(unchanged.proposedDisposableByIncome);
    expect(unchanged.currentTransfersByIncome).toEqual(unchanged.proposedTransfersByIncome); expect(unchanged.currentTransfersByIncome.reduce((a, b) => a + b)).toBeGreaterThanOrEqual(606);
    expect(state).toEqual(before); expect(booked).toMatchObject({ owner: us, publicOrders: 777, privateResidual: 888 });
  });
  it('calculates true marginal brackets, thresholds, allowances and large multi-band income', () => {
    const b = [{ lower: 0, rateBps: 1000 }, { lower: 10000, rateBps: 2000 }, { lower: 20000, rateBps: 3000 }];
    expect(progressiveTax(0, b)).toBe(0);
    expect(progressiveTax(10000, b)).toBe(1000);
    expect(progressiveTax(20000, b)).toBe(3000);
    expect(progressiveTax(30000, b)).toBe(6000);
    expect(progressiveTax(5000, b, 6000)).toBe(0);
    expect(progressiveTax(36000, b, 6000)).toBe(6000);
    expect(progressiveMonthly(2500000, 1000, b)).toBe(500000);
    expect(progressiveMonthly(0, 0, b)).toBe(0);
    expect(() => progressiveTax(-1, b)).toThrow();
  });
  it('uses documented 2026 rules, explicit unknowns, cap and additional Medicare threshold', () => {
    const s = initial(), p = s.fiscal.countries[us].policy;
    expect(p.personal).toMatchObject({ allowance: 16100, effectiveDate: '2026-01-01', status: 'partial', currency: 'USD' });
    expect(s.fiscal.countries.unknown.policy.corporate).toBeNull();
    expect(payrollMonthly(20000, 1, p.payroll!.employer!)).toBe(1243);
    expect(payrollMonthly(20000, 1, p.payroll!.employee!)).toBe(1273);
    expect(() => validateRule({ ...p.personal!, effectiveDate: '2027-01-01' }, us, s.date)).toThrow(/future/);
    expect(() => validateRule({ ...p.personal!, currency: 'CAD' }, us, s.date)).toThrow(/FX/);
    expect(() => validateRule({ ...p.personal!, bands: [{ lower: 10, rateBps: 1000 }] }, us, s.date)).toThrow();
  });
  it('consumption wedge raises liability on a fixed base and consumes a nominal budget exactly once', () => {
    const r = initial().fiscal.countries[ca].policy.consumption!;
    const raised = custom(r, { rateBps: 2000 });
    expect(consumptionLiability(10000, raised)).toBeGreaterThan(consumptionLiability(10000, r));
    for (const budget of [0, 1, 100, 1234567]) {
      const net = netGoodsBudget(budget, raised), tax = consumptionCollected(net, raised);
      expect(net + tax).toBeLessThanOrEqual(budget);
      expect(net + 1 + consumptionCollected(net + 1, raised)).toBeGreaterThan(budget);
    }
    expect(netGoodsBudget(12345, custom(r, { rateBps: 0 }))).toBe(12345);
  });
});

describe('0.11 causal monthly integration', () => {
  it('preserves economic initialization and remains close to equilibrium in the first month', () => {
    const before = base(), s = initializeFiscal(before);
    expect(s.socioeconomy).toBe(before.socioeconomy);
    expect(s.fiscal.countries[us].account).toBeUndefined();
    const next = advanceSimulationDays(s, 31);
    for (const r of regions) expect(next.socioeconomy.regions[r.id].economy!.output).toBe(before.socioeconomy.regions[r.id].economy!.output);
    expect(assertSimulationInvariants(next, context, 'tick')).toBe(true);
  });
  it('a PIT reform changes liability, cash revenue and disposable income, then next-month demand', () => {
    const s = initial(), policy = s.fiscal.countries[us].policy;
    const amended = reform(s, us, { ...policy, personal: custom(policy.personal!, { allowance: 0, bands: [{ lower: 0, rateBps: 5000 }] }) }, '2026-02-01');
    const a = advanceSimulationDays(s, 31), b = advanceSimulationDays(amended, 31);
    expect(b.fiscal.countries[us].account!.taxes.personal.liability).toBeGreaterThan(a.fiscal.countries[us].account!.taxes.personal.liability);
    expect(b.fiscal.countries[us].account!.knownTaxRevenue).toBeGreaterThan(a.fiscal.countries[us].account!.knownTaxRevenue);
    expect(b.fiscal.countries[us].account!.otherRevenue).toBe(a.fiscal.countries[us].account!.otherRevenue);
    expect(b.fiscal.countries[us].account!.totalRevenue).toBeGreaterThan(a.fiscal.countries[us].account!.totalRevenue);
    expect(b.fiscal.countries[us].account!.overallBalance).toBeGreaterThan(a.fiscal.countries[us].account!.overallBalance);
    expect(b.fiscal.regions[rid].disposable.reduce((a, b) => a + b)).toBeLessThan(a.fiscal.regions[rid].disposable.reduce((a, b) => a + b));
    expect(b.socioeconomy.regions[rid].economy!.output).toBe(a.socioeconomy.regions[rid].economy!.output);
    const laterA = advanceSimulationDays(a, 28), laterB = advanceSimulationDays(b, 28);
    expect(laterB.socioeconomy.regions[rid].economy!.householdDemand).toBeLessThan(laterA.socioeconomy.regions[rid].economy!.householdDemand);
    expect(assertSimulationInvariants(laterB, context, 'tick')).toBe(true);
    console.info('FISCAL_CAUSAL_SCENARIO', JSON.stringify({ baseline: { liability: a.fiscal.countries[us].account!.taxes.personal.liability, knownTaxRevenue: a.fiscal.countries[us].account!.knownTaxRevenue, otherRevenue: a.fiscal.countries[us].account!.otherRevenue, totalRevenue: a.fiscal.countries[us].account!.totalRevenue, balance: a.fiscal.countries[us].account!.overallBalance, disposable: a.fiscal.regions[rid].disposable, nextDemand: laterA.socioeconomy.regions[rid].economy!.householdDemand }, reform: { liability: b.fiscal.countries[us].account!.taxes.personal.liability, knownTaxRevenue: b.fiscal.countries[us].account!.knownTaxRevenue, otherRevenue: b.fiscal.countries[us].account!.otherRevenue, totalRevenue: b.fiscal.countries[us].account!.totalRevenue, balance: b.fiscal.countries[us].account!.overallBalance, disposable: b.fiscal.regions[rid].disposable, nextDemand: laterB.socioeconomy.regions[rid].economy!.householdDemand } }));
  });
  it('corporate taxes reduce retained surplus without a direct output penalty', () => {
    const s = initial(), p = s.fiscal.countries[us].policy;
    const a = advanceSimulationDays(s, 31), b = advanceSimulationDays(reform(s, us, { ...p, corporate: custom(p.corporate!, { rateBps: 6000 }) }), 31);
    expect(b.fiscal.regions[rid].businessSurplus).toBeLessThan(b.socioeconomy.regions[rid].economy!.output);
    expect(b.fiscal.regions[rid].retainedBusinessSurplus).toBeLessThan(a.fiscal.regions[rid].retainedBusinessSurplus);
    expect(b.socioeconomy.regions[rid].economy!.output).toBe(a.socioeconomy.regions[rid].economy!.output);
    expect(b.fiscal.regions[rid].disposable).toEqual(a.fiscal.regions[rid].disposable);
  });
  it('higher transfers appear exactly once as public expense and household receipts', () => {
    const s = initial(), c = s.fiscal.countries[us];
    const changed = scheduleFiscalReform(s, { countryId: us, effectiveDate: s.date, annualBudget: { ...c.annualBudget, pensions: c.annualBudget.pensions * 2 } });
    const a = advanceSimulationDays(s, 31), b = advanceSimulationDays(changed, 31);
    expect(b.fiscal.regions[rid].transfers.reduce((a, b) => a + b)).toBe(b.fiscal.countries[us].account!.transferPaid);
    expect(b.fiscal.regions[rid].disposable.reduce((a, b) => a + b)).toBeGreaterThan(a.fiscal.regions[rid].disposable.reduce((a, b) => a + b));
    expect(assertSimulationInvariants(b, context, 'tick')).toBe(true);
  });
  it('debt financing is bounded, obligations become arrears, and interest uses debt stock', () => {
    let s = initial();
    s.fiscal.countries.unknown.cash = 0; s.fiscal.countries.unknown.debt = 120000; s.fiscal.countries.unknown.monthlyBorrowingLimit = 100; s.fiscal.countries.unknown.revenueCalibration.monthlyAmount = 0;
    const a = advanceSimulationDays(s, 31).fiscal.countries.unknown.account!;
    expect(a.interestDue).toBe(200); expect(a.borrowed).toBe(100); expect(a.interestPaid).toBe(100);
    expect(a.closingDebt).toBe(120100); expect(a.interestArrears).toBe(100); expect(a.stress.unpaidCommitments).toBeGreaterThan(100);
    s = initial(); s.fiscal.countries[us].debt = 100;
    const b = advanceSimulationDays(s, 31);
    expect(b.fiscal.countries[us].debt).toBeGreaterThanOrEqual(0);
    expect(assertSimulationInvariants(b, context, 'tick')).toBe(true);
  });
  it('keeps a Country with unavailable legal rules stable under unchanged policy', () => {
    const s = initial(), opening = s.fiscal.countries.unknown;
    expect(Object.values(opening.policy).every(rule => rule === null)).toBe(true);
    expect(opening.revenueCalibration).toMatchObject({ status: 'modelled', referenceDate: s.date });
    expect(opening.debtInitialization).toMatchObject({ status: 'modelled', amount: 0 });
    const after = advanceSimulationDays(s, 3650).fiscal.countries.unknown;
    expect(after.account!.knownTaxRevenue).toBe(0);
    expect(after.account!.otherRevenue).toBe(opening.revenueCalibration.monthlyAmount);
    expect(after.account!.totalRevenue).toBe(after.account!.otherRevenue);
    expect(after.debt).toBe(0);
    expect(after.interestArrears).toBe(0);
    expect(Object.values(after.arrears).every(value => value === 0)).toBe(true);
    expect(after.account!.stress).toMatchObject({ financingBaselineStatus: 'modelled', unpaidCommitments: 0, debtToAnnualOutputBps: 0 });
  });
  it('keeps residual revenue frozen when a previously uncovered Country enacts a tax reform', () => {
    const s = initial(), country = s.fiscal.countries.unknown;
    const corporate: TaxRule = { id: 'debug-unknown-corporate', countryId: 'unknown', kind: 'corporate', status: 'modelled', scope: 'national', currency: 'USD', unit: 'annual_currency_units_and_basis_points',
      effectiveDate: s.date, referenceDate: s.date, retrievedAt: s.date, source: 'debug:explicit-policy', document: 'Synthetic reform test', limitations: 'Modelled test rule, not observed law.', rateBps: 5000 };
    const changed = reform(s, 'unknown', { ...country.policy, corporate });
    const baseline = advanceSimulationDays(s, 31).fiscal.countries.unknown.account!;
    const reformed = advanceSimulationDays(changed, 31).fiscal.countries.unknown.account!;
    expect(baseline.otherRevenue).toBeGreaterThan(0);
    expect(reformed.otherRevenue).toBe(baseline.otherRevenue);
    expect(reformed.knownTaxRevenue).toBeGreaterThan(baseline.knownTaxRevenue);
    expect(reformed.totalRevenue - baseline.totalRevenue).toBe(reformed.knownTaxRevenue - baseline.knownTaxRevenue);
    expect(reformed.overallBalance).toBeGreaterThan(baseline.overallBalance);
  });
  it('service underfunding accumulates backlog and restoration recovers progressively', () => {
    let service = initial().fiscal.countries[us].services.health;
    expect(evolveService(service, 10000, service.required).capacity).toBe(10000);
    for (let n = 0; n < 12; n++) service = evolveService(service, 10000, 0);
    expect(service.backlog).toBeGreaterThan(0); expect(service.capacity).toBeLessThan(10000);
    const repaired = evolveService(service, 10000, service.required * 2);
    expect(repaired.capacity).toBeGreaterThan(service.capacity); expect(repaired.capacity).toBeLessThan(10000); expect(repaired.backlog).toBeLessThan(service.backlog);
    console.info('FISCAL_SERVICE_SCENARIO', JSON.stringify({ after12UnfundedMonths: service, firstRecoveryMonth: repaired }));
  });
  it('reforms are immutable, dated, applicable while paused, and never recalculate old accounts', () => {
    const s = advanceSimulationDays(initial(), 31), c = s.fiscal.countries[us];
    const clock = new SimulationClock({ ...s, paused: true });
    const budget = { ...c.annualBudget, health: 0 };
    clock.reformFiscal({ countryId: us, effectiveDate: '2026-03-01', annualBudget: budget }); budget.health = 99;
    expect(clock.snapshot().fiscal.countries[us].annualBudget.health).toBe(c.annualBudget.health);
    expect(clock.advanceIfChanged(10000)).toBeUndefined();
    clock.setPaused(false); clock.setSpeed(2); clock.advance(14000);
    expect(clock.snapshot().fiscal.countries[us].annualBudget.health).toBe(0);
    expect(s.fiscal.countries[us].account).toEqual(c.account);
    expect(() => reform(s, us, c.policy, '2026-01-01')).toThrow(/retroactive/);
  });
  it('schema 8 migrates at saved date without rewriting socioeconomic state or reference values', () => {
    const s = advanceSimulationDays(base(), 420);
    const { fiscal: _f, ...body } = s;
    const restored = migrateSimulationState({ ...body, schemaVersion: 8 }, regions, {}, {}, context);
    expect(restored.schemaVersion).toBe(19); expect(restored.socioeconomy).toEqual(s.socioeconomy); expect(restored.engine).toEqual(s.engine);
    expect(restored.populationByRegion).toEqual(s.populationByRegion);
    expect(restored.fiscal.initializedOn).toBe(s.date); expect(restored.fiscal.lastMonthlyDate).toBeUndefined();
    expect(restored.fiscal.countries[us].account).toBeUndefined(); expect(assertSimulationInvariants(restored, context, 'reload')).toBe(true);
  });
  it('upgrades an initial schema-9 fiscal v1 save deterministically without calling modelled debt observed', () => {
    const current = advanceSimulationDays(initial(), 31);
    const legacy = structuredClone(current) as unknown as { fiscal: { version: string; countries: Record<string, Record<string, unknown>> } };
    legacy.fiscal.version = 'fiscal-0.11-v1';
    for (const country of Object.values(legacy.fiscal.countries)) {
      delete country.revenueCalibration;
      delete country.debtInitialization;
      const account = country.account as Record<string, unknown> | undefined;
      if (account) {
        account.revenue = account.totalRevenue;
        delete account.knownTaxRevenue; delete account.otherRevenue; delete account.totalRevenue;
        delete (account.stress as Record<string, unknown>).financingBaselineStatus;
      }
    }
    const a = migrateSimulationState(legacy, regions, {}, {}, context);
    const b = migrateSimulationState(legacy, regions, {}, {}, context);
    expect(a).toEqual(b);
    expect(a.schemaVersion).toBe(19); expect(a.fiscal.version).toBe('fiscal-0.11-v2');
    expect(a.fiscal.countries.unknown.revenueCalibration.status).toBe('modelled');
    expect(a.fiscal.countries.unknown.debtInitialization).toMatchObject({ status: 'modelled', limitation: expect.stringMatching(/not be interpreted as observed/) });
    expect(a.fiscal.countries.unknown.account).toBeUndefined();
    expect(assertSimulationInvariants(a, context, 'reload')).toBe(true);
  });
  it('save/reload continues identically with pending reforms; same seed and input reproduce results', () => {
    const initialized = initializePartyLeaders(initial());
    const s = scheduleFiscalReform(initialized, { countryId: us, effectiveDate: '2026-07-01', annualBudget: { ...initialized.fiscal.countries[us].annualBudget, health: 0 } });
    const a = advanceSimulationDays(s, 120);
    const reloaded = restoreSimulationState(serializeSimulationState(a, context), regions, {}, {}, context);
    expect(advanceSimulationDays(reloaded, 365)).toEqual(advanceSimulationDays(a, 365));
    expect(advanceSimulationDays(s, 485)).toEqual(advanceSimulationDays(a, 365));
  });
  it('all fidelity levels share fiscal results and transitions conserve all fiscal state', () => {
    const s = initial();
    const a = advanceSimulationDays(requestFidelityTransition(s, us, 'Detailed', context.countryIds), 1);
    expect(validateFidelityConservation(s, a)).toEqual([]); expect(a.fiscal).toBe(s.fiscal);
    const background = { ...s, engine: { ...s.engine, fidelityByCountry: Object.fromEntries(ids.map(id => [id, 'Background' as const])) } };
    expect(advanceSimulationDays(background, 365).fiscal).toEqual(advanceSimulationDays(a, 364).fiscal);
  });
  it('daily UI snapshots share fiscal and cohort branches, monthly updates are defensive, and speeds agree', () => {
    const s = initial();
    for (const speed of [1, 2, 5] as const) {
      const clock = new SimulationClock({ ...s, speed });
      const first = clock.snapshot(), second = clock.advance(1000 / speed);
      expect(first.fiscal).toBe(second.fiscal); expect(first.socioeconomy).toBe(second.socioeconomy);
      const monthly = clock.advance(30000 / speed);
      expect(monthly.fiscal).not.toBe(first.fiscal); expect(monthly).toEqual(advanceSimulationDays({ ...s, speed }, 31));
      expect(() => { monthly.fiscal.countries[us].cash = 0; }).toThrow();
      expect(simulationDelta(first, second).changedDomains).toEqual(['time']);
    }
    expect(inspectFiscal(s, us).country).not.toBe(s.fiscal.countries[us]);
  });
  it('invariants detect real ledger corruption, not just missing fields', () => {
    const s = advanceSimulationDays(initial(), 31), bad = cloneSimulationState(s);
    bad.fiscal.countries[us].account!.totalRevenue++;
    bad.fiscal.regions[rid].disposable[0]++;
    bad.fiscal.countries[us].debt++;
    const errors = validateSimulationInvariants(bad, context, 'tick').violations.map(x => x.message).join(' ');
    expect(errors).toMatch(/Revenue/); expect(errors).toMatch(/Disposable/); expect(errors).toMatch(/Debt/);
  });
});
