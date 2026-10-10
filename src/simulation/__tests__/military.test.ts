import { emptyOperations } from '../operations/model';
import { initializeOperations } from '../operations/runtime';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyAssets } from '../assets/model';
import { emptyTrade } from '../trade/model';
import { describe, expect, it, vi } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { EQUIPMENT_REGISTRY, MILITARY_ITEMS, DEFENSE_COSTS, emptyMilitary, equipmentTotal, militaryReadiness, militarySupportStaff, presentPersonnel, trainingPersonnel, type MilitaryParameters } from '../military/model';
import { admitMilitaryBaseline, initializeMilitary, placeMilitaryOrder, prepareMilitaryMonth, reservedPersonnel, setMilitaryAuthorization } from '../military/runtime';
import { inspectMilitaryReports, runMilitaryReports } from '../military/reports';
import * as militaryDates from '../military/dates';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { emptyFiscal } from '../fiscal/model';
import { initializeFiscal, scheduleFiscalReform, evaluateImmediateFiscalPolicyCounterfactual } from '../fiscal/runtime';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { assignPoliticalOffice, createPoliticalPerson, createFiscalProposal, revokePoliticalOffice, setControlledPerson } from '../governance/runtime';
import { analyzeProposal } from '../governance/analysis';
import { configureSyntheticMilitaryScenario } from '../military/scenario';
import { createEngineState } from '../state';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants, validateFidelityConservation } from '../invariants';
import { requestFidelityTransition } from '../fidelity';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { transferRegion } from '../region';
import { simulationDelta } from '../world';
import { SimulationClock } from '../clock';
import { deterministicFingerprint } from '../fingerprint';
import { createClaim } from '../diplomacy';
import { declareLimitedWar, occupyRegion } from '../war';
import schema13Fixture from './fixtures/military-migration-schema13.json';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MilitaryCapabilities } from '../../components/MilitaryCapabilities';

export const militaryCountry = 'country.u6myyj', otherCountry = 'country.1aj872z';
export const militaryRegions: RegionEntity[] = [militaryCountry, otherCountry].map((id, i) => ({
  id: `region.synthetic-${i}`, commonName: `Explicit synthetic test Region ${i}`, parentCountryId: id, initialOwnerCountryId: id,
  administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'synthetic-test', sourceFeatureIds: [String(i)] },
}));
export const militaryContext = { regions: militaryRegions, countryIds: new Set([militaryCountry, otherCountry]), regionIds: new Set(militaryRegions.map(r => r.id)) };
export const militaryParameters: MilitaryParameters = {
  monthlySalaryUsd: 1000, recruitmentPerMonth: 10, reductionPerMonth: 5, trainingMonths: 3,
  instructors: 20, trainingCostPerPersonUsd: 100, technicians: 10, factoryUnitsPerMonth: 10, factoryMaterialPerUnit: 1,
  logisticsStaff: 5, logisticsPersonsPerStaff: 20, exerciseAmmunitionPerPerson: 1, exerciseFuelPerPerson: 1,
  desiredEquipment: { personal: 100, truck: 5 }, desiredConsumables: { ammunition: 500, fuel: 500 },
};
export function militaryFixture(admit = true): SimulationState {
  let state: SimulationState = {
    schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), socioeconomy: emptySocioeconomy(), fiscal: emptyFiscal(), crisis: emptyCrisis(),
    politics: emptyPolitics(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'),
    date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {},
    regionOwnership: Object.fromEntries(militaryRegions.map(r => [r.id, r.initialOwnerCountryId])),
    populationByRegion: Object.fromEntries(militaryRegions.map(r => [r.id, 10000])),
    economicOutputByRegion: Object.fromEntries(militaryRegions.map(r => [r.id, 1200000000])),
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(militaryContext.countryIds),
  };
  state = initializeMilitary(initializeFiscal(initializeSocioeconomy(state, militaryRegions)));
  state = createPoliticalPerson(state, { countryId: militaryCountry, displayName: 'Synthetic executive fixture' });
  const person = Object.keys(state.governance.persons)[0];
  state = setControlledPerson(assignPoliticalOffice(state, person, { countryId: militaryCountry, role: 'head_of_government' }), person);
  state = scheduleFiscalReform(state, { countryId: militaryCountry, effectiveDate: state.date, annualBudget: { ...state.fiscal.countries[militaryCountry].annualBudget, defense: 12000000 } });
  if (!admit) return state;
  return admitMilitaryBaseline(state, {
    countryId: militaryCountry, source: { status: 'modelled', publisher: 'ProjectAtlas explicit synthetic integration fixture',
      url: 'scenario:synthetic-military-test', referenceDate: '2026-01-01', retrievedAt: '2026-10-03',
      licence: 'ProjectAtlas test fixture (ISC)', attribution: 'ProjectAtlas', limitation: 'Entirely synthetic; not a real US army, personnel, wages, equipment, stocks or industry observation.', scenarioFixture: true },
    parameters: militaryParameters, authorized: 100, present: 50, trainees: 10,
    equipment: { personal: { operational: 100, unavailable: 0, maintenance: 0, reserve: 0 }, truck: { operational: 5, unavailable: 0, maintenance: 0, reserve: 0 } },
    consumables: { ammunition: { quantity: 1000, capacity: 10000 }, fuel: { quantity: 1000, capacity: 10000 } }, industrialMaterials: 1000,
  });
}
const cap = (s: SimulationState) => s.military.countries[militaryCountry].capability!;
const person = (s: SimulationState) => s.governance.player.controlledPersonId!;
const month = (state: SimulationState) => {
  let next = advanceSimulationDays(state, 1);
  while (!next.date.endsWith('-01')) next = advanceSimulationDays(next, 1);
  return next;
};
const territory = (state: SimulationState) => [state.wars, state.regionOwnership, state.occupationByRegion, state.claims, state.explicitCasusBelli];

describe('0.16 explicit synthetic causal integration (not factual armies)', () => {
  it('rejects an invalid AI-created order before returning monthly preparation, without changing the input', () => {
    const initial = militaryFixture(), state = revokePoliticalOffice(initial, person(initial));
    cap(state).consumables.ammunition = { opening: 0, delivered: 0, consumed: 0, quantity: 0, capacity: 10000 };
    const before = structuredClone(state);
    const deliveryDate = vi.spyOn(militaryDates, 'militaryDeliveryDate').mockReturnValueOnce('1900-01-01');
    try {
      expect(() => prepareMilitaryMonth(state)).toThrow('Invalid military order identity/date.');
      expect(deliveryDate).toHaveBeenCalledTimes(2);
      expect(state).toEqual(before);
    } finally {
      deliveryDate.mockRestore();
    }
  });
  it.each([
    { name: 'zero equipment', equipment: { personal: 0, truck: 0 }, stocks: { ammunition: 500, fuel: 500 }, expectedEquipment: null, expectedStocks: 10000 },
    { name: 'zero consumables', equipment: { personal: 100, truck: 5 }, stocks: { ammunition: 0, fuel: 0 }, expectedEquipment: 10000, expectedStocks: null },
    { name: 'mixed zero and positive targets', equipment: { personal: 0, truck: 10 }, stocks: { ammunition: 0, fuel: 2000 }, expectedEquipment: 5000, expectedStocks: 5000 },
    { name: 'no positive targets', equipment: { personal: 0, truck: 0 }, stocks: { ammunition: 0, fuel: 0 }, expectedEquipment: null, expectedStocks: null },
  ])('derives applicable readiness and saved government evidence for $name', targets => {
    let state = militaryFixture();
    const c = cap(state);
    c.authorized = 40; c.exercisePersonMonths = 40;
    c.parameters.desiredEquipment = targets.equipment; c.parameters.desiredConsumables = targets.stocks;
    const readiness = militaryReadiness(c);
    expect(readiness.components).toEqual({ personnel: 10000, equipment: targets.expectedEquipment, training: 10000, stocks: targets.expectedStocks, logistics: 10000 });
    expect(readiness.limitingBps).toBe(Math.min(...Object.values(readiness.components).filter((v): v is number => v !== null)));
    state = runMilitaryReports(state);
    const report = state.information.militaryReports!.latest[militaryCountry];
    expect(report.data!.readiness).toEqual(readiness);
    expect(report.data!.equipment.map(e => e.required)).toEqual([targets.equipment.personal, targets.equipment.truck]);
    expect(report.data!.stocks.map(s => s.required)).toEqual([targets.stocks.ammunition, targets.stocks.fuel]);
    const restored = restoreSimulationState(serializeSimulationState(state, militaryContext), militaryRegions, {}, {}, militaryContext);
    expect(restored).toEqual(state);
    expect(month(restored)).toEqual(month(state));
    if (targets.expectedEquipment === null || targets.expectedStocks === null) {
      const forged = structuredClone(state), forgedReport = forged.information.militaryReports!.latest[militaryCountry];
      forgedReport.data!.readiness.components[targets.expectedEquipment === null ? 'equipment' : 'stocks'] = 10000;
      forgedReport.fingerprint = deterministicFingerprint({ ...forgedReport, fingerprint: undefined });
      expect(() => serializeSimulationState(forged, militaryContext)).toThrow(/readiness is not derived/);
      expect(() => restoreSimulationState(JSON.stringify(forged), militaryRegions, {}, {}, militaryContext)).toThrow(/readiness is not derived/);
    }
  });
  it('upgrades only derived zero-target readiness in the original schema-14 report shape, rejecting corrupt legacy evidence', () => {
    let state = militaryFixture();
    cap(state).parameters.desiredEquipment = { personal: 0, truck: 0 };
    cap(state).parameters.desiredConsumables = { ammunition: 0, fuel: 0 };
    state = month(setMilitaryAuthorization(state, militaryCountry, person(state), 1000));
    state = month(state);
    state = advanceSimulationDays(setMilitaryAuthorization(state, militaryCountry, person(state), 3000), 10);
    const legacy = structuredClone(state), report = legacy.information.militaryReports!.latest[militaryCountry];
    for (const historical of Object.values(legacy.information.militaryReports!.byId)) {
      if (!historical.data) continue;
      Reflect.deleteProperty(historical, 'readinessVersion');
      historical.data.readiness.components.equipment = historical.data.readiness.components.stocks = 10000;
      historical.fingerprint = deterministicFingerprint({ ...historical, fingerprint: undefined });
    }
    expect(report.data!.authorized).toBe(1000);
    expect(report.asOfDate < state.date).toBe(true);
    expect(cap(state).authorized).toBe(3000);
    const restored = restoreSimulationState(JSON.stringify(legacy), militaryRegions, {}, {}, militaryContext);
    expect(restored).toEqual(state);
    expect(month(restored)).toEqual(month(state));
    for (const mode of ['badReadiness', 'badFingerprint', 'inconsistentLatest'] as const) {
      const invalid = structuredClone(legacy), r = invalid.information.militaryReports!.byId[report.id];
      if (mode === 'badReadiness') {
        r.data!.readiness.components.stocks = 5000;
        r.fingerprint = deterministicFingerprint({ ...r, fingerprint: undefined });
      } else if (mode === 'badFingerprint') r.fingerprint = 'corrupt evidence';
      else {
        const latest = { ...r, uncertainty: 'Different independently fingerprinted evidence.' };
        latest.fingerprint = deterministicFingerprint({ ...latest, fingerprint: undefined });
        invalid.information.militaryReports!.latest[militaryCountry] = latest;
      }
      expect(() => restoreSimulationState(JSON.stringify(invalid), militaryRegions, {}, {}, militaryContext)).toThrow();
    }
  });
  it('preserves unaffected original schema-14 reports and briefings byte-for-byte', () => {
    let state = militaryFixture();
    state = month(setMilitaryAuthorization(state, militaryCountry, person(state), 1000));
    const report = state.information.militaryReports!.latest[militaryCountry];
    Reflect.deleteProperty(report, 'readinessVersion');
    report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
    const evidence = JSON.stringify(state.information.militaryReports), briefings = JSON.stringify(state.information.briefings);
    const restored = restoreSimulationState(JSON.stringify(state), militaryRegions, {}, {}, militaryContext);
    expect(JSON.stringify(restored.information.militaryReports)).toBe(evidence);
    expect(JSON.stringify(restored.information.briefings)).toBe(briefings);
    expect(restored).toEqual(state);
  });
  it.each(['missingVersion', 'unknownVersion'] as const)('rejects corrected zero-target reports with %s on save and reload', mode => {
    let state = militaryFixture();
    cap(state).parameters.desiredEquipment = { personal: 0, truck: 0 };
    state = month(state);
    const report = state.information.militaryReports!.latest[militaryCountry];
    if (mode === 'missingVersion') Reflect.deleteProperty(report, 'readinessVersion');
    else Reflect.set(report, 'readinessVersion', 'unrecognized');
    report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
    expect(() => serializeSimulationState(state, militaryContext)).toThrow();
    expect(() => restoreSimulationState(JSON.stringify(state), militaryRegions, {}, {}, militaryContext)).toThrow();
  });
  it.each(['initialClean', 'appearance', 'change', 'clearance', 'delivery', 'alertAndDelivery'] as const)('emits truthful dated advisory evidence for %s without pausing', mode => {
    let state = militaryFixture();
    if (mode === 'change') cap(state).consumables.ammunition!.opening = cap(state).consumables.ammunition!.quantity = 130;
    if (mode === 'change' || mode === 'clearance' || mode === 'alertAndDelivery') state = setMilitaryAuthorization(state, militaryCountry, person(state), 1000);
    const beforeTerritory = structuredClone(territory(state));
    state = runMilitaryReports(state);
    const initialCount = state.information.briefings.filter(b => b.eventType === 'military_report').length;
    expect(initialCount).toBe(mode === 'change' || mode === 'clearance' || mode === 'alertAndDelivery' ? 1 : 0);
    if (mode === 'appearance') state = setMilitaryAuthorization(state, militaryCountry, person(state), 1000);
    if (mode === 'clearance') state = setMilitaryAuthorization(state, militaryCountry, person(state), 60);
    if (mode === 'delivery' || mode === 'alertAndDelivery') state = placeMilitaryOrder(state, militaryCountry, person(state), 'fuel', 10);
    state = month(state);
    if (mode === 'delivery' || mode === 'alertAndDelivery') {
      expect(state.information.briefings.filter(b => b.eventType === 'military_report')).toHaveLength(initialCount);
      state = month(state);
    }
    const report = state.information.militaryReports!.latest[militaryCountry];
    const briefings = state.information.briefings.filter(b => b.eventType === 'military_report');
    expect(briefings).toHaveLength(initialCount + (mode === 'initialClean' ? 0 : 1));
    if (mode !== 'initialClean') {
      const briefing = briefings.at(-1)!;
      expect(briefing.sourceId).toBe(report.id); expect(briefing.createdOn).toBe(report.producedOn);
      expect(briefing.access).toBe('government'); expect(briefing.severity).toBe('advisory'); expect(briefing.pauseRequested).toBe(false);
      if (mode === 'clearance') {
        expect(report.alertCodes).toEqual([]); expect(report.data!.deliveredThisMonth).toBe(0);
        expect(briefing.headline).toBe('Defense administrative report: no active alerts.');
      } else if (mode === 'delivery' || mode === 'alertAndDelivery') {
        expect(report.data!.deliveredThisMonth).toBeGreaterThan(0);
        expect(briefing.headline).toBe(`Defense administrative report: ${mode === 'delivery' ? 'delivery completed' : 'personnel_shortfall'}; ${report.data!.deliveredThisMonth} units delivered.`);
      } else {
        expect(report.alertCodes).toEqual(mode === 'appearance' ? ['personnel_shortfall'] : ['personnel_shortfall', 'consumable_shortfall']);
        expect(briefing.headline).toBe(`Defense administrative report: ${report.alertCodes.join(', ')}.`);
      }
    }
    expect(state.paused).toBe(false);
    expect(territory(state)).toEqual(beforeTerritory);
    expect(runMilitaryReports(state)).toEqual(state);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
    const restored = restoreSimulationState(serializeSimulationState(state, militaryContext), militaryRegions, {}, {}, militaryContext);
    expect(restored).toEqual(state);
    expect(month(restored)).toEqual(month(state));
  });
  it('keeps catalogue definitions and deterministic static allocation lists immutable outside saves', () => {
    expect(Object.isFrozen(EQUIPMENT_REGISTRY)).toBe(true);
    for (const d of Object.values(EQUIPMENT_REGISTRY)) expect(Object.isFrozen(d)).toBe(true);
    expect(Reflect.set(EQUIPMENT_REGISTRY.truck, 'unitCostUsd', 1)).toBe(false);
    expect(Reflect.set(MILITARY_ITEMS, 0, 'fuel')).toBe(false);
    expect(Object.isFrozen(DEFENSE_COSTS)).toBe(true);
  });
  it.each(['personal', 'ammunition', 'fuel', 'truck'] as const)('rejects missing %s used by a positive mechanism even when desired coverage is removed', item => {
    const state = militaryFixture(), c = cap(state);
    Reflect.deleteProperty(c.equipment, item); Reflect.deleteProperty(c.consumables, item);
    Reflect.deleteProperty(c.parameters.desiredEquipment, item); Reflect.deleteProperty(c.parameters.desiredConsumables, item);
    expect(() => admitMilitaryBaseline(militaryFixture(false), {
      countryId: militaryCountry, source: c.source, parameters: c.parameters, authorized: c.authorized,
      present: presentPersonnel(c), trainees: trainingPersonnel(c), industrialMaterials: c.industrialMaterials.quantity,
      equipment: Object.fromEntries(Object.entries(c.equipment).map(([key, e]) => [key, { operational: e!.operational, unavailable: e!.unavailable, maintenance: e!.maintenance, reserve: e!.reserve }])),
      consumables: Object.fromEntries(Object.entries(c.consumables).map(([key, s]) => [key, { quantity: s!.quantity, capacity: s!.capacity }])),
    })).toThrow(/missing is not zero/);
    expect(() => assertSimulationInvariants(state, militaryContext, 'save')).toThrow();
    expect(() => serializeSimulationState(state, militaryContext)).toThrow();
    expect(() => restoreSimulationState(JSON.stringify(state), militaryRegions, {}, {}, militaryContext)).toThrow();
  });
  it.each(['absentUnused', 'knownZero'] as const)('preserves %s stocks without fabricating coverage or rejecting an explicit known zero', mode => {
    let state = militaryFixture(), c = cap(state);
    if (mode === 'absentUnused') {
      c.parameters.instructors = c.parameters.exerciseAmmunitionPerPerson = c.parameters.exerciseFuelPerPerson = c.parameters.logisticsStaff = 0;
      c.parameters.desiredEquipment = {}; c.parameters.desiredConsumables = {};
      c.equipment = {}; c.consumables = {};
    } else {
      for (const e of Object.values(c.equipment)) e!.opening = e!.operational = 0;
      for (const s of Object.values(c.consumables)) s!.opening = s!.quantity = 0;
    }
    state = month(state);
    expect(cap(state).lastLedger!.trained).toBe(0);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
    expect(restoreSimulationState(serializeSimulationState(state, militaryContext), militaryRegions, {}, {}, militaryContext)).toEqual(state);
    if (mode === 'absentUnused') {
      expect(cap(state).equipment).toEqual({}); expect(cap(state).consumables).toEqual({});
      expect(state.information.militaryReports!.latest[militaryCountry].data!.readiness.components.equipment).toBeNull();
    } else expect(cap(state).consumables.ammunition!.quantity).toBe(0);
  });
  it('produces equivalent material results across Country/Region/equipment/cohort insertion order', () => {
    let state = militaryFixture();
    cap(state).trainees = [{ persons: 5, monthsCompleted: 0 }, { persons: 5, monthsCompleted: 1 }];
    state = setMilitaryAuthorization(state, militaryCountry, person(state), 5);
    const reversed = structuredClone(state);
    reversed.military.countries = Object.fromEntries(Object.entries(reversed.military.countries).reverse());
    reversed.socioeconomy.regions = Object.fromEntries(Object.entries(reversed.socioeconomy.regions).reverse());
    cap(reversed).equipment = Object.fromEntries(Object.entries(cap(reversed).equipment).reverse());
    cap(reversed).assignments = Object.fromEntries(Object.entries(cap(reversed).assignments).reverse());
    cap(reversed).trainees.reverse();
    expect(month(month(reversed))).toEqual(month(month(state)));
  });
  it('renders dated government evidence, unavailable coverage and real management controls without live Reality', () => {
    let state = month(militaryFixture());
    state = setMilitaryAuthorization(state, militaryCountry, person(state), 999);
    const html = renderToStaticMarkup(createElement(MilitaryCapabilities, { state, countryId: militaryCountry, personId: person(state), onStateChange: () => {}, onBudget: () => {} }));
    expect(html).toContain('60 present / 100 authorized');
    expect(html).not.toContain('999 authorized');
    expect(html).toContain('Place commitment for later funded production');
    expect(html).toContain('not a real US army');
    const unavailable = runMilitaryReports(militaryFixture(false));
    const missing = renderToStaticMarkup(createElement(MilitaryCapabilities, { state: unavailable, countryId: militaryCountry, personId: person(unavailable), onStateChange: () => {}, onBudget: () => {} }));
    expect(missing).toContain('unavailable, not zero');
    expect(missing).not.toContain('Set gradual recruitment');
  });
  it.each(['headline', 'interpretation', 'access', 'pause'] as const)('rejects military briefing %s fabrication without rereading live capability', field => {
    let state = militaryFixture();
    cap(state).consumables.ammunition!.quantity = 0; cap(state).consumables.ammunition!.consumed = 1000;
    state = month(state);
    const b = state.information.briefings.find(b => b.eventType === 'military_report')!;
    if (field === 'headline') b.headline = 'All forces are ready.';
    if (field === 'interpretation') b.interpretation!.limitations = [];
    if (field === 'access') b.access = 'public';
    if (field === 'pause') b.pauseRequested = true;
    expect(() => serializeSimulationState(state, militaryContext)).toThrow();
    expect(() => restoreSimulationState(JSON.stringify(state), militaryRegions, {}, {}, militaryContext)).toThrow();
  });
  it('rejects an uninitialized military sensor, erased national reporting coverage and invented pre-migration reports', () => {
    const state = month(militaryFixture());
    const uninitialized = structuredClone(state);
    uninitialized.military = emptyMilitary();
    expect(() => serializeSimulationState(uninitialized, militaryContext)).toThrow();
    const missing = structuredClone(state), report = missing.information.militaryReports!.latest[otherCountry];
    delete missing.information.militaryReports!.latest[otherCountry]; delete missing.information.militaryReports!.byId[report.id];
    expect(() => restoreSimulationState(JSON.stringify(missing), militaryRegions, {}, {}, militaryContext)).toThrow();
    const later = structuredClone(state);
    later.military.initializedOn = '2026-02-02';
    later.date = '2026-03-01';
    expect(() => serializeSimulationState(later, militaryContext)).toThrow();
  });
  it.each(['completedKey', 'erasedReports', 'staleReports', 'monthlyBeforeInitialization', 'blankUncertainty', 'blankReportLimitation', 'nonArrayAlerts', 'blankCountryLimitation'] as const)('rejects %s through invariants, serialization and reload', mode => {
    const state = month(militaryFixture());
    expect(state.information.briefings.filter(b => b.eventType === 'military_report')).toHaveLength(0);
    if (mode === 'completedKey') Reflect.set(cap(state).completedByItem, 'ghost', { quantity: 0, paidUsd: 0 });
    if (mode === 'erasedReports') state.information.militaryReports = { latest: {}, byId: {} };
    if (mode === 'staleReports') {
      const reports = Object.values(state.information.militaryReports!.latest);
      for (const report of reports) {
        report.asOfDate = report.producedOn = '2026-01-01';
        report.id = `military-report:${report.countryId}:${report.producedOn}`;
        report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
      }
      state.information.militaryReports!.byId = Object.fromEntries(reports.map(report => [report.id, report]));
    }
    if (mode === 'monthlyBeforeInitialization') state.military.lastMonthlyDate = '2025-12-01';
    if (mode === 'blankCountryLimitation') state.military.countries[otherCountry].limitation = ' \t';
    if (mode === 'blankUncertainty' || mode === 'blankReportLimitation' || mode === 'nonArrayAlerts') {
      const report = state.information.militaryReports!.latest[otherCountry];
      if (mode === 'blankUncertainty') report.uncertainty = ' \t';
      if (mode === 'blankReportLimitation') report.limitation = ' \t';
      if (mode === 'nonArrayAlerts') Reflect.set(report, 'alertCodes', {});
      report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
    }
    expect(() => assertSimulationInvariants(state, militaryContext, 'save')).toThrow();
    expect(() => serializeSimulationState(state, militaryContext)).toThrow();
    expect(() => restoreSimulationState(JSON.stringify(state), militaryRegions, {}, {}, militaryContext)).toThrow();
  });
  it.each(['paidBeyondExpense', 'nonStringReadinessLimitation'] as const)('rejects material report %s without rewriting legitimate salary arrears', mode => {
    const state = month(militaryFixture()), report = state.information.militaryReports!.latest[militaryCountry];
    if (mode === 'paidBeyondExpense') report.data!.payrollPaid = report.data!.expenditureUsd + 1;
    else Reflect.set(report.data!.readiness, 'limitation', {});
    report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
    expect(() => assertSimulationInvariants(state, militaryContext, 'save')).toThrow();
    expect(() => serializeSimulationState(state, militaryContext)).toThrow();
    expect(() => restoreSimulationState(JSON.stringify(state), militaryRegions, {}, {}, militaryContext)).toThrow();
  });
  it('replenishes with zero closing cash and real fiscal financing room, without prepaying or delivering commitments', () => {
    let state = militaryFixture();
    const fiscal = state.fiscal.countries[militaryCountry];
    fiscal.cash = 0; fiscal.debt = 1000000000; fiscal.debtLimit = 1100000000;
    fiscal.monthlyBorrowingLimit = 10000000; fiscal.interestRateBps = 0;
    fiscal.debtInitialization = { ...fiscal.debtInitialization, status: 'modelled', amount: fiscal.debt, method: 'Explicit synthetic AI financing fixture opening debt.' };
    cap(state).consumables.ammunition = { opening: 0, delivered: 0, consumed: 0, quantity: 0, capacity: 10000 };
    state = month(state);
    expect(state.fiscal.countries[militaryCountry].cash).toBe(0);
    expect(state.fiscal.countries[militaryCountry].debt).toBeGreaterThan(0);
    expect(cap(state).payrollArrears).toBe(0);
    state = revokePoliticalOffice(state, person(state));
    const beforeTerritory = structuredClone(territory(state));
    state = month(state);
    expect(cap(state).orders.some(o => o.item === 'ammunition')).toBe(true);
    expect(cap(state).orders.every(o => o.funded === 0 && o.paidUsd === 0 && o.delivered === 0)).toBe(true);
    expect(cap(state).lastLedger!.executed.production).toBe(0);
    expect(cap(state).ai.reason).toContain('prospective');
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
    state = month(state);
    expect(cap(state).lastLedger!.executed.production).toBeGreaterThan(0);
    expect(cap(state).consumables.ammunition!.delivered).toBe(0);
    state = month(state);
    expect(cap(state).consumables.ammunition!.delivered).toBeGreaterThan(0);
    expect(cap(state).productionSupplyPendingUsd + cap(state).productionSupplyReceivedUsd).toBeGreaterThanOrEqual(0);
    expect(territory(state)).toEqual(beforeTerritory);
    expect(restoreSimulationState(serializeSimulationState(state, militaryContext), militaryRegions, {}, {}, militaryContext)).toEqual(state);
  });
  it.each(['noFinancing', 'salaryArrears'] as const)('defers AI replenishment at zero cash with %s, despite positive defense authorization', mode => {
    let state = militaryFixture();
    const fiscal = state.fiscal.countries[militaryCountry];
    fiscal.cash = 0; fiscal.monthlyBorrowingLimit = 0; fiscal.debtLimit = fiscal.debt;
    fiscal.revenueCalibration = { ...fiscal.revenueCalibration, status: 'modelled', monthlyAmount: 0, method: 'Explicit synthetic no-financing fixture.' };
    state = scheduleFiscalReform(state, { countryId: militaryCountry, effectiveDate: state.date, policy: { personal: null, consumption: null, payroll: null, corporate: null } });
    cap(state).consumables.ammunition = { opening: 0, delivered: 0, consumed: 0, quantity: 0, capacity: 10000 };
    if (mode === 'salaryArrears') {
      state = month(state);
      expect(cap(state).payrollArrears).toBeGreaterThan(0);
      state.fiscal.countries[militaryCountry].monthlyBorrowingLimit = 100000000;
      state.fiscal.countries[militaryCountry].debtLimit = 1000000000;
    }
    state = month(revokePoliticalOffice(state, person(state)));
    expect(cap(state).orders).toEqual([]);
    expect(cap(state).ai.reason).toContain(mode === 'salaryArrears' ? 'salary arrears' : 'financing');
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('defers AI needs with known zero factory capacity despite financing and avoids zero-quantity commitments', () => {
    let state = militaryFixture();
    expect(state.fiscal.countries[militaryCountry].cash).toBeGreaterThan(0);
    cap(state).parameters.factoryUnitsPerMonth = 0;
    cap(state).consumables.ammunition = { opening: 0, delivered: 0, consumed: 0, quantity: 0, capacity: 10000 };
    state = month(revokePoliticalOffice(state, person(state)));
    expect(cap(state).orders).toEqual([]);
    expect(cap(state).ai.reason).toContain('No configured manufacturing capacity');
    expect(cap(state).lastLedger!.grossPayrollPaid).toBeGreaterThan(0);
    expect(cap(state).lastLedger!.executed.production).toBe(0);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
    expect(restoreSimulationState(serializeSimulationState(state, militaryContext), militaryRegions, {}, {}, militaryContext)).toEqual(state);
  });
  it('admits the optional synthetic scenario only before play, with no cash/debt/revenue-calibration grant', () => {
    const initial = militaryFixture(false);
    delete initial.governance.player.controlledPersonId;
    const configured = configureSyntheticMilitaryScenario(initial, militaryCountry);
    expect(presentPersonnel(cap(configured))).toBe(50); expect(cap(configured).source.scenarioFixture).toBe(true);
    expect(configured.military.countries[otherCountry].status).toBe('unavailable');
    for (const key of ['cash', 'debt', 'revenueCalibration'] as const) expect(configured.fiscal.countries[militaryCountry][key]).toEqual(initial.fiscal.countries[militaryCountry][key]);
    expect(() => configureSyntheticMilitaryScenario(advanceSimulationDays(initial, 1), militaryCountry)).toThrow(/before/);
    expect(() => configureSyntheticMilitaryScenario(militaryFixture(false), militaryCountry)).toThrow(/before/);
  });
  it('exposes defense-only legal deltas without inventing power, military ideology or unsupported fiscal expenditure', () => {
    const initial = militaryFixture(false);
    const proposed = createFiscalProposal(initial, { proposerPersonId: person(initial), countryId: militaryCountry, effectiveDate: '2026-02-01', payload: { annualBudget: { ...initial.fiscal.countries[militaryCountry].annualBudget, defense: 24000000 } } });
    const analysis = analyzeProposal(proposed, proposed.governance.proposals[proposed.governance.proposalOrder.at(-1)!]);
    expect(analysis.genuinelyNeutral).toBe(false); expect(analysis.coverage).toBe('unavailable');
    expect(analysis.directPolicyChanges).toContainEqual(expect.objectContaining({ path: 'annualBudget.defense', delta: 12000000 }));
    expect(analysis.expectedConsequences).toEqual([]); expect(analysis.institutionalEffects).toEqual([]);
    const funded = month(militaryFixture()), budget = { ...funded.fiscal.countries[militaryCountry].annualBudget, defense: 1200000 };
    const changed = createFiscalProposal(funded, { proposerPersonId: person(funded), countryId: militaryCountry, effectiveDate: '2026-03-01', payload: { annualBudget: budget } });
    const capped = analyzeProposal(changed, changed.governance.proposals[changed.governance.proposalOrder.at(-1)!]);
    expect(capped.expectedConsequences).toEqual([]);
    expect(capped.unsupportedChanges.some(c => c.path === 'annualBudget.defense.capability')).toBe(true);
  });
  it('never invents instructors/technicians/logistics staff or overflows saturated readiness ratios', () => {
    const c = cap(militaryFixture());
    c.parameters.instructors = 500; c.parameters.technicians = 500; c.parameters.logisticsStaff = 500;
    expect(Object.values(militarySupportStaff(c)).reduce((a, b) => a + b)).toBe(presentPersonnel(c) - trainingPersonnel(c));
    c.authorized = 1; c.parameters.desiredEquipment.personal = 1;
    c.equipment.personal!.operational = Number.MAX_SAFE_INTEGER;
    expect(militaryReadiness(c).components.equipment).toBe(10000);
  });
  it('bounds outstanding commitments without losing obligations and rejects unsafe monetary multiplication', () => {
    let state = militaryFixture();
    for (let i = 0; i < 128; i++) state = placeMilitaryOrder(state, militaryCountry, person(state), 'fuel', 1);
    const before = structuredClone(state);
    expect(() => placeMilitaryOrder(state, militaryCountry, person(state), 'fuel', 1)).toThrow(/bound/);
    expect(state).toEqual(before);
    expect(() => placeMilitaryOrder(militaryFixture(), militaryCountry, person(state), 'truck', Number.MAX_SAFE_INTEGER)).toThrow();
  });
  it('maintains peacetime stocks for a Country whose controlled person no longer holds management office', () => {
    let state = militaryFixture();
    cap(state).consumables.ammunition!.quantity = 0; cap(state).consumables.ammunition!.consumed = 1000;
    state = revokePoliticalOffice(state, person(state));
    const next = month(state);
    expect(cap(next).ai.lastDecisionOn).toBe(next.date);
    expect(cap(next).orders.some(o => o.item === 'ammunition')).toBe(true);
    expect(next.governance.player.controlledPersonId).toBe(person(state));
    expect(next.wars).toEqual(state.wars);
  });
  it('migrates a genuine800-day schema13 parent save without replay or historical/territorial changes', () => {
    expect(schema13Fixture.referenceCommit).toBe('ceddc8e04fc470f41155fdc8b6250142fb970705');
    expect(schema13Fixture.state.schemaVersion).toBe(13);
    const restored = restoreSimulationState(JSON.stringify(schema13Fixture.state), militaryRegions, {}, {}, militaryContext);
    const { schemaVersion, military, trade, international, operations, multilateral, constitution, elections, ...preserved } = restored;
    expect(schemaVersion).toBe(20); expect(military.initializedOn).toBe('2028-03-11');
    expect(trade.initializedOn).toBe('2028-03-11'); expect(trade.flows).toEqual([]);
    // Historical data stays identical; the only admitted deviations are the structural 0.23
    // backfills in governance and politics, each verified explicitly below.
    const { schemaVersion: _legacySchemaVersion, governance: legacyGovernance, politics: legacyPolitics, ...legacyPreserved } = schema13Fixture.state;
    const { governance: restoredGovernance, politics: restoredPolitics, ...preservedRest } = preserved;
    expect(preservedRest).toEqual(legacyPreserved);
    const { cabinets, ministerialSuggestions, nextSuggestionSequence, settings, ...restoredGovernanceRest } = restoredGovernance;
    expect(cabinets).toEqual({});
    expect(ministerialSuggestions).toEqual([]);
    expect(nextSuggestionSequence).toBe(0);
    expect(settings).toEqual({ spontaneousMinisterialProposalsEnabled: true });
    expect(restoredGovernanceRest).toEqual(legacyGovernance);
    const { religiousOrganizationsCoverage, ...restoredPoliticsRest } = restoredPolitics;
    expect(religiousOrganizationsCoverage.status).toBe('unavailable');
    expect(typeof religiousOrganizationsCoverage.limitation).toBe('string');
    expect(religiousOrganizationsCoverage.limitation.length).toBeGreaterThan(0);
    expect(restoredPoliticsRest).toEqual(legacyPolitics);
    expect(Object.values(military.countries).every(c => c.status === 'unavailable' && !c.capability)).toBe(true);
    expect(restoreSimulationState(serializeSimulationState(restored), militaryRegions, {}, {}, militaryContext)).toEqual(restored);
  });
  it('preserves nonempty structural wars, claims, occupation and sovereignty through all management commands/months', () => {
    let state = militaryFixture();
    state = createClaim(state, { id: 'claim.military-scope', claimantCountryId: militaryCountry, regionId: militaryRegions[1].id, type: 'territorial', creationDate: state.date, reason: 'Synthetic old structural-war fixture only.' }, militaryContext);
    state = declareLimitedWar(state, { warId: 'war.military-scope', attackerCountryId: militaryCountry, defenderCountryId: otherCountry, targetRegionId: militaryRegions[1].id, casusBelliId: `claim-derived:claim.military-scope:${otherCountry}` }, militaryContext);
    state = initializeOperations(state);
    const scopeComponents = { ...state.operations.components };
    for (const [id, component] of Object.entries(scopeComponents)) {
      if (component.regionId === militaryRegions[1].id && component.kind === 'decisive') scopeComponents[id] = { ...component, controllingCountryId: militaryCountry };
    }
    state = { ...state, operations: { ...state.operations, components: scopeComponents, regionControl: { ...state.operations.regionControl, [militaryRegions[1].id]: 'foreign_controlled' as const } } };
    state = occupyRegion(state, { regionId: militaryRegions[1].id, warId: 'war.military-scope', occupierCountryId: militaryCountry }, militaryContext);
    const before = structuredClone(territory(state));
    state = setMilitaryAuthorization(state, militaryCountry, person(state), 80);
    expect(territory(state)).toEqual(before);
    state = placeMilitaryOrder(state, militaryCountry, person(state), 'truck', 2);
    expect(territory(state)).toEqual(before);
    for (let i = 0; i < 12; i++) { state = month(state); expect(territory(state)).toEqual(before); }
  });
  it('rejects legislative sponsorship as defense management authority, even with explicit information access', () => {
    const state = militaryFixture();
    state.governance.persons[person(state)].office!.role = 'legislator';
    expect(inspectMilitaryReports(runMilitaryReports(state), militaryCountry, person(state))).toBeDefined();
    expect(() => setMilitaryAuthorization(state, militaryCountry, person(state), 10)).toThrow(/requires/);
    expect(() => placeMilitaryOrder(state, militaryCountry, person(state), 'truck', 1)).toThrow(/requires/);
  });
  it('rejects historical report provenance tampering even with a recomputed fingerprint', () => {
    const state = month(militaryFixture()), report = state.information.militaryReports!.latest[militaryCountry];
    report.provenance = {} as typeof report.provenance;
    report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
    state.information.militaryReports!.byId[report.id] = structuredClone(report);
    expect(() => assertSimulationInvariants(state, militaryContext, 'save')).toThrow();
    expect(() => restoreSimulationState(serializeSimulationState(state), militaryRegions, {}, {}, militaryContext)).toThrow();
  });
  it('retains manufacturing start proof and enforces catalogue lead time on end-of-month commitments', () => {
    let state = advanceSimulationDays(militaryFixture(), 30);
    state = placeMilitaryOrder(state, militaryCountry, person(state), 'truck', 2);
    expect(cap(state).orders[0].orderedOn).toBe('2026-01-31'); expect(cap(state).orders[0].earliestDeliveryOn).toBe('2026-04-01');
    state = month(state);
    expect(cap(state).orders[0].pipeline[0]).toMatchObject({ startedOn: '2026-02-01', availableOn: '2026-04-01' });
    const malformed = structuredClone(state);
    cap(malformed).orders[0].earliestDeliveryOn = '2026-02-01'; cap(malformed).orders[0].pipeline[0].availableOn = '2026-02-01';
    expect(() => assertSimulationInvariants(malformed, militaryContext, 'save')).toThrow();
    expect(() => restoreSimulationState(serializeSimulationState(malformed), militaryRegions, {}, {}, militaryContext)).toThrow();
  });
  it('keeps absent army data unavailable and rejects management/admission abuse', () => {
    const state = militaryFixture(false);
    expect(state.military.countries[militaryCountry].capability).toBeUndefined();
    const reported = runMilitaryReports(state), report = inspectMilitaryReports(reported, militaryCountry, person(state))!;
    expect(report.data).toBeUndefined(); expect(report.status).toBe('unavailable'); expect(report.confidenceBps).toBe(0);
    expect(() => setMilitaryAuthorization(state, militaryCountry, person(state), 10)).toThrow(/unavailable/);
    expect(() => placeMilitaryOrder(state, militaryCountry, person(state), 'truck', 1)).toThrow(/unavailable/);
    expect(assertSimulationInvariants(reported, militaryContext, 'save')).toBe(true);
  });
  it('recruits gradually within existing labour and pays actual personnel, not authorized posts', () => {
    const initial = militaryFixture(), before = structuredClone(initial.socioeconomy.regions);
    const state = month(initial), c = cap(state), e = state.socioeconomy.regions[militaryRegions[0].id].economy!;
    expect(presentPersonnel(c)).toBe(60); expect(c.lastLedger!.recruited).toBe(10);
    expect(e.employed + e.unemployed + reservedPersonnel(state, militaryRegions[0].id)).toBe(e.labourForce);
    expect(c.lastLedger!.payrollDue).toBe(60000);
    expect(state.socioeconomy.regions[militaryRegions[0].id].population).toBe(before[militaryRegions[0].id].population);
    expect(state.socioeconomy.regions[militaryRegions[0].id].cohorts).toEqual(before[militaryRegions[0].id].cohorts);
    expect(e.householdIncome).toBeLessThanOrEqual(e.output);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('reduces progressively without destroying population, arrears or civilian jobs', () => {
    const initial = militaryFixture(), commanded = setMilitaryAuthorization(initial, militaryCountry, person(initial), 0);
    expect(presentPersonnel(cap(commanded))).toBe(50);
    const state = month(commanded);
    expect(presentPersonnel(cap(state))).toBe(45); expect(cap(state).lastLedger!.released).toBe(5);
    expect(territory(state)).toEqual(territory(initial));
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('withholds known PIT/employee payroll and funds employer payroll once; tax reform affects funded wages', () => {
    const state = month(militaryFixture()), a = state.fiscal.countries[militaryCountry].account!, payroll = a.militaryPayroll!;
    expect(payroll.gross).toBe(60000); expect(payroll.taxes.personal.collected).toBeGreaterThan(0);
    expect(payroll.taxes.employee.collected).toBeGreaterThan(0); expect(payroll.employerCost).toBeGreaterThan(0);
    expect(a.defense!.payroll).toBe(payroll.gross + payroll.employerCost);
    expect(state.fiscal.regions[militaryRegions[0].id].militaryPay!.reduce((a, b) => a + b)).toBe(payroll.gross - payroll.taxes.personal.collected - payroll.taxes.employee.collected);
    expect(a.closingCash).toBe(a.openingCash + a.totalRevenue + a.borrowed - a.totalSpending - a.repaid);
    const policy = structuredClone(state.fiscal.countries[militaryCountry].policy);
    policy.personal = { ...policy.personal!, status: 'modelled', allowance: 0, bands: [{ lower: 0, rateBps: 8000 }], limitations: 'Synthetic reform only.' };
    const estimate = evaluateImmediateFiscalPolicyCounterfactual(state, militaryCountry, policy);
    expect(estimate.proposedKnownRevenue).toBeGreaterThan(estimate.currentKnownRevenue);
    expect(estimate.proposedTransfersByIncome).toEqual(estimate.currentTransfersByIncome);
    expect(estimate.proposedDisposableByIncome.reduce((a, b) => a + b)).toBeLessThan(estimate.currentDisposableByIncome.reduce((a, b) => a + b));
  });
  it('recomputes the military counterfactual current legal baseline after a reform without rewriting funded payslips', () => {
    const state = month(militaryFixture()), before = evaluateImmediateFiscalPolicyCounterfactual(state, militaryCountry, state.fiscal.countries[militaryCountry].policy);
    const policy = structuredClone(state.fiscal.countries[militaryCountry].policy);
    policy.personal = { ...policy.personal!, status: 'modelled', allowance: 0, bands: [{ lower: 0, rateBps: 8000 }], limitations: 'Synthetic current-law reform only.' };
    const changed = scheduleFiscalReform(state, { countryId: militaryCountry, effectiveDate: state.date, policy });
    const estimate = evaluateImmediateFiscalPolicyCounterfactual(changed, militaryCountry, policy);
    expect(estimate.currentDisposableByIncome).toEqual(estimate.proposedDisposableByIncome);
    expect(estimate.currentDisposableByIncome.reduce((a, b) => a + b)).toBeLessThan(before.currentDisposableByIncome.reduce((a, b) => a + b));
    expect(changed.fiscal.countries[militaryCountry].account!.militaryPayroll).toEqual(state.fiscal.countries[militaryCountry].account!.militaryPayroll);
    const changedWithoutMilitary = structuredClone(changed);
    delete changedWithoutMilitary.fiscal.countries[militaryCountry].account!.militaryPayroll;
    const civilian = evaluateImmediateFiscalPolicyCounterfactual(changedWithoutMilitary, militaryCountry, policy);
    expect(estimate.currentDisposableByIncome.reduce((a, b) => a + b)).toBeLessThan(civilian.currentDisposableByIncome.reduce((a, b) => a + b));
  });
  it('keeps unfunded actual salary obligations visible and causes gradual retention loss', () => {
    let state = militaryFixture();
    state = scheduleFiscalReform(state, { countryId: militaryCountry, effectiveDate: state.date, annualBudget: { ...state.fiscal.countries[militaryCountry].annualBudget, defense: 0 } });
    state = month(state);
    expect(cap(state).payrollArrears).toBe(50000);
    expect(state.fiscal.countries[militaryCountry].account!.stress.unpaidCommitments).toBeGreaterThanOrEqual(50000);
    const count = presentPersonnel(cap(state));
    state = month(month(month(state)));
    expect(presentPersonnel(cap(state))).toBeLessThan(count);
    expect(presentPersonnel(cap(state))).toBeGreaterThan(0);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('trains over time using instructors, operational equipment, funding and consumables', () => {
    const initial = militaryFixture(), after = month(initial);
    expect(trainingPersonnel(cap(after))).toBeGreaterThan(0);
    expect(cap(after).trainees.some(t => t.monthsCompleted === 1)).toBe(true);
    expect(cap(after).consumables.ammunition!.quantity).toBe(980);
    expect(cap(after).consumables.fuel!.quantity).toBe(980);
    expect(cap(after).lastLedger!.executed.training).toBeGreaterThan(0);
    const blocked = militaryFixture(); cap(blocked).parameters = { ...cap(blocked).parameters, instructors: 0 };
    expect(cap(month(blocked)).trainees.every(t => t.monthsCompleted === 0)).toBe(true);
    const noAmmo = militaryFixture(); cap(noAmmo).consumables.ammunition = { opening: 0, quantity: 0, capacity: 10000, delivered: 0, consumed: 0 };
    expect(cap(month(noAmmo)).trainees.every(t => t.monthsCompleted === 0)).toBe(true);
  });
  it('preserves owned equipment through operational-maintenance-unavailable-repair transitions', () => {
    let state = militaryFixture(); cap(state).parameters = { ...cap(state).parameters, technicians: 0 };
    for (let i = 0; i < 8; i++) state = month(state);
    const e = cap(state).equipment.truck!;
    expect(e.operational).toBeLessThan(5); expect(e.unavailable).toBeGreaterThan(0); expect(e.backlogUnitMonths).toBeGreaterThan(0);
    expect(equipmentTotal(e)).toBe(5);
    cap(state).parameters = { ...cap(state).parameters, technicians: 10 };
    let repaired = month(state);
    for (let i = 0; i < 12 && cap(repaired).equipment.truck!.operational <= e.operational; i++) repaired = month(repaired);
    expect(cap(repaired).equipment.truck!.operational).toBeGreaterThan(e.operational);
    expect(equipmentTotal(cap(repaired).equipment.truck!)).toBe(5);
    expect(assertSimulationInvariants(repaired, militaryContext, 'save')).toBe(true);
  });
  it('accrues maintenance once per exact operational unit-month over a 24-month trace', () => {
    let state = militaryFixture();
    cap(state).parameters = { ...cap(state).parameters, technicians: 0, recruitmentPerMonth: 0, instructors: 0 };
    cap(state).equipment.personal = { opening: 24, delivered: 0, operational: 24, unavailable: 0, maintenance: 0, reserve: 0, maintenanceClock: 0, backlogUnitMonths: 0 };
    let accrued = 0;
    for (let i = 0; i < 24; i++) {
      accrued += cap(state).equipment.personal!.operational;
      state = month(state);
      const e = cap(state).equipment.personal!;
      expect(e.maintenanceClock).toBe(accrued % 24);
      expect(e.unavailable + e.maintenance).toBe(Math.floor(accrued / 24));
      expect(equipmentTotal(e)).toBe(24);
    }
    expect(cap(state).equipment.personal!.unavailable).toBeGreaterThan(1);
  });
  it('a one-vehicle fleet accrues six months before maintenance without losing fractional work', () => {
    let state = militaryFixture();
    cap(state).parameters = { ...cap(state).parameters, technicians: 0, recruitmentPerMonth: 0, instructors: 0 };
    cap(state).equipment.truck = { opening: 1, delivered: 0, operational: 1, unavailable: 0, maintenance: 0, reserve: 0, maintenanceClock: 0, backlogUnitMonths: 0 };
    for (let i = 0; i < 5; i++) { state = month(state); expect(cap(state).equipment.truck!.operational).toBe(1); }
    state = month(state);
    expect(cap(state).equipment.truck!.operational).toBe(0); expect(cap(state).equipment.truck!.unavailable).toBe(1);
    expect(equipmentTotal(cap(state).equipment.truck!)).toBe(1);
  });
  it('orders are not instant delivery, production uses money/materials and conserved delayed batches', () => {
    const initial = militaryFixture(), ordered = placeMilitaryOrder(initial, militaryCountry, person(initial), 'truck', 3);
    expect(equipmentTotal(cap(ordered).equipment.truck!)).toBe(5);
    const funded = month(ordered);
    expect(cap(funded).orders[0].funded).toBe(3); expect(cap(funded).orders[0].delivered).toBe(0);
    expect(cap(funded).lastLedger!.executed.production).toBe(150000);
    expect(cap(funded).industrialMaterials.quantity).toBe(997);
    const waiting = month(funded); expect(cap(waiting).orders[0].delivered).toBe(0);
    let delivered = month(waiting);
    expect(equipmentTotal(cap(delivered).equipment.truck!)).toBeGreaterThan(5);
    for (let i = 0; i < 6 && cap(delivered).orders.length; i++) delivered = month(delivered);
    expect(equipmentTotal(cap(delivered).equipment.truck!)).toBe(8);
    expect(cap(delivered).completed.quantity).toBe(3);
    expect(assertSimulationInvariants(delivered, militaryContext, 'save')).toBe(true);
  });
  it('replenishes consumables only through paid delayed production and respects storage', () => {
    const initial = militaryFixture(); cap(initial).parameters = { ...cap(initial).parameters, instructors: 0 };
    let state = placeMilitaryOrder(initial, militaryCountry, person(initial), 'ammunition', 10);
    state = month(state); expect(cap(state).consumables.ammunition!.quantity).toBe(1000);
    for (let i = 0; i < 6 && cap(state).orders.length; i++) state = month(state);
    expect(cap(state).consumables.ammunition!.quantity).toBe(1010);
    expect(cap(state).consumables.ammunition!.delivered).toBe(10);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('cannot produce without industrial resources or finance; zero stock never becomes negative', () => {
    const initial = militaryFixture(); cap(initial).industrialMaterials = { opening: 0, quantity: 0, consumed: 0 };
    let state = placeMilitaryOrder(initial, militaryCountry, person(initial), 'truck', 3);
    state = month(month(state));
    expect(cap(state).orders[0].funded).toBe(0); expect(cap(state).orders[0].delivered).toBe(0);
    expect(cap(state).consumables.ammunition!.quantity).toBeGreaterThanOrEqual(0);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('requires office and controlled-person authority, not Country selection or party leadership', () => {
    const state = militaryFixture(), id = person(state);
    expect(() => placeMilitaryOrder(revokePoliticalOffice(state, id), militaryCountry, id, 'truck', 1)).toThrow(/authority/);
    expect(() => setMilitaryAuthorization(setControlledPerson(state, undefined), militaryCountry, id, 100)).toThrow(/authority/);
    expect(inspectMilitaryReports(runMilitaryReports(revokePoliticalOffice(state, id)), militaryCountry, id)).toBeUndefined();
    expect(() => placeMilitaryOrder(state, otherCountry, id, 'truck', 1)).toThrow(/authority/);
  });
  it('reports are dated government evidence and stale Reality never leaks into UI', () => {
    const state = month(militaryFixture()), report = inspectMilitaryReports(state, militaryCountry, person(state))!;
    const changed = setMilitaryAuthorization(state, militaryCountry, person(state), 300);
    expect(inspectMilitaryReports(changed, militaryCountry, person(changed))).toEqual(report);
    expect(inspectMilitaryReports(advanceSimulationDays(changed, 1), militaryCountry, person(changed))!.stale).toBe(true);
    expect(simulationDelta(state, changed).changedDomains).toContain('military');
    report.data!.present = 0;
    expect(inspectMilitaryReports(state, militaryCountry, person(state))!.data!.present).toBe(60);
    expect(state.paused).toBe(false);
  });
  it('derived preparedness reacts to actual staff/equipment/training/stocks/logistics, never a stored bonus', () => {
    const state = militaryFixture(), c = structuredClone(cap(state));
    c.exercisePersonMonths = presentPersonnel(c) - trainingPersonnel(c);
    const complete = militaryReadiness(c);
    c.equipment.truck!.operational = 0; c.equipment.truck!.maintenance = 5;
    expect(militaryReadiness(c).components.logistics).toBeLessThan(complete.components.logistics);
    c.consumables.ammunition!.quantity = 0; c.consumables.ammunition!.consumed = c.consumables.ammunition!.opening;
    expect(militaryReadiness(c).components.stocks).toBe(0);
    expect('readiness' in cap(state)).toBe(false);
  });
  it('keeps military affiliation and person/cohort reservations through sovereignty transfers', () => {
    const initial = militaryFixture(), before = structuredClone(initial.military);
    const transferred = transferRegion(initial, militaryRegions[0].id, militaryCountry, otherCountry);
    expect(transferred.military).toEqual(before);
    const advanced = month(transferred);
    expect(presentPersonnel(cap(advanced))).toBe(50);
    expect(advanced.fiscal.regions[militaryRegions[0].id].owner).toBe(otherCountry);
    expect(advanced.fiscal.regions[militaryRegions[0].id].militaryPay!.reduce((a, b) => a + b)).toBeGreaterThan(0);
    expect(assertSimulationInvariants(advanced, militaryContext, 'save')).toBe(true);
  });
  it('round-trips ongoing production, workforce, ledgers, reports and deterministic continuation', () => {
    const initial = militaryFixture(), ordered = placeMilitaryOrder(initial, militaryCountry, person(initial), 'truck', 6);
    const state = month(ordered);
    const serialized = serializeSimulationState(state, militaryContext);
    const restored = restoreSimulationState(serialized, militaryRegions, {}, {}, militaryContext);
    expect(restored).toEqual(state);
    expect(month(month(restored))).toEqual(month(month(state)));
    expect(month(month(ordered))).toEqual(month(month(structuredClone(ordered))));
  });
  it('conserves all military resources across Detailed/Standard/Background/Detailed', () => {
    let state = month(militaryFixture());
    for (const level of ['Detailed', 'Standard', 'Background', 'Detailed'] as const) {
      const requested = requestFidelityTransition(state, militaryCountry, level, militaryContext.countryIds);
      const next = advanceSimulationDays(requested, 1);
      expect(validateFidelityConservation(state, next)).toEqual([]);
      expect(next.military).toEqual(state.military); state = next;
    }
  });
  it('uses defensive cached snapshots and ordinary days do not run military work', () => {
    const initial = militaryFixture(), clock = new SimulationClock(initial), before = clock.snapshot();
    const next = clock.advance(1000);
    expect(next.military).toBe(before.military); expect(Object.isFrozen(next.military)).toBe(true);
    expect(territory(next)).toEqual(territory(initial));
  });
  it.each(['negative', 'duplicate', 'overflow', 'delivery', 'sourceDate', 'training', 'pipeline', 'missingStockField', 'materialProof'] as const)('rejects invalid %s rather than repairing saves', mode => {
    const state = month(placeMilitaryOrder(militaryFixture(), militaryCountry, person(militaryFixture()), 'truck', 2)), c = cap(state);
    if (mode === 'negative') c.equipment.truck!.operational = -1;
    if (mode === 'duplicate') c.equipment.truck!.reserve++;
    if (mode === 'overflow') c.authorized = Number.MAX_SAFE_INTEGER + 1;
    if (mode === 'delivery') c.orders[0].delivered = c.orders[0].quantity + 1;
    if (mode === 'sourceDate') c.source.referenceDate = '2026-02-01';
    if (mode === 'training') c.trainees[0].persons = 100000;
    if (mode === 'pipeline') c.orders[0].pipeline[0].quantity++;
    if (mode === 'missingStockField') Reflect.deleteProperty(c.equipment.truck!, 'maintenanceClock');
    if (mode === 'materialProof') c.industrialMaterials = { opening: 1000, quantity: 1000, consumed: 0 };
    expect(() => serializeSimulationState(state, militaryContext)).toThrow();
    expect(() => restoreSimulationState(JSON.stringify(state), militaryRegions, {}, {}, militaryContext)).toThrow();
  });
});
