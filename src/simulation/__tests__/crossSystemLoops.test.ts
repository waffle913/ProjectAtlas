import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyOperations } from '../operations/model';
import { initializeOperations } from '../operations/runtime';
import { emptyInternational } from '../international/model';
import { initializeInternational, imposeImportRestriction, sanctionBlocksRoute } from '../international/runtime';
import { emptyTrade } from '../trade/model';
import { initializeTrade, admitTradeMarket, admitTradeRoute, tradeFactoryCapacity } from '../trade/runtime';
import { SYNTHETIC_TRADE_SOURCE, syntheticTradeMarket } from '../trade/scenario';
import { emptyMilitary } from '../military/model';
import { initializeMilitary, admitMilitaryBaseline } from '../military/runtime';
import type { MilitaryParameters } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { initializeFiscal, scheduleFiscalReform } from '../fiscal/runtime';
import { emptyCrisis, initializeCrisisState } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { initializePolitics } from '../politics/initialization';
import { emptyGovernance } from '../governance/model';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { emptyInformation } from '../information/model';
import { initializeInformationState } from '../information/runtime';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { requestEconomicShock } from '../socioeconomy/runtime';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyAssets } from '../assets/model';
import { initializeMultilateral } from '../multilateral/runtime';
import { proposeConstruction, authorizeConstruction, fundConstruction, startWork } from '../assets/runtime';
import { constructionReservedPersonnel } from '../assets/workforce';
import { domesticMarketPrice } from '../economy/prices';
import { createEngineState } from '../state';
import { advanceSimulationDays, createCoreScheduler } from '../engine';
import { assertSimulationInvariants } from '../invariants';

const A = 'country.synth-a', B = 'country.synth-b';
const regionA = 'region.synth-a', regionB = 'region.synth-b';
const regions: RegionEntity[] = [A, B].map((id, i) => ({ id: i === 0 ? regionA : regionB, parentCountryId: id, initialOwnerCountryId: id, commonName: `Synthetic Region ${i}`, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'synthetic-test', sourceFeatureIds: [String(i)] } }));
const context = { regions, countryIds: new Set([A, B]), regionIds: new Set([regionA, regionB]) };
const parameters: MilitaryParameters = { monthlySalaryUsd: 1000, recruitmentPerMonth: 10, reductionPerMonth: 5, trainingMonths: 3, instructors: 20, trainingCostPerPersonUsd: 100, technicians: 10, factoryUnitsPerMonth: 10, factoryMaterialPerUnit: 1, logisticsStaff: 5, logisticsPersonsPerStaff: 20, exerciseAmmunitionPerPerson: 1, exerciseFuelPerPerson: 1, desiredEquipment: { personal: 100, truck: 5 }, desiredConsumables: { ammunition: 500, fuel: 500 } };
const source = { status: 'modelled' as const, publisher: 'Synthetic loop campaign', url: 'scenario:synthetic-loops', referenceDate: '2026-01-01', retrievedAt: '2026-10-03', licence: 'ProjectAtlas test fixture (ISC)', attribution: 'ProjectAtlas', limitation: 'Entirely synthetic loop fixture.', scenarioFixture: true };

function fixture(): SimulationState {
  let state: SimulationState = {
    schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
    territoryOwnership: {}, regionOwnership: { [regionA]: A, [regionB]: B },
    populationByRegion: { [regionA]: 10000, [regionB]: 10000 }, economicOutputByRegion: { [regionA]: 1200000000, [regionB]: 1200000000 },
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState([A, B]),
  };
  state = initializeInformationState(initializeFiscal(initializeSocioeconomy(state, regions)));
  state = { ...state, crisis: initializeCrisisState(state.crisis, [A, B], state.date), politics: initializePolitics(state, [A, B], regions) };
  state = initializeMilitary(state);
  state = initializeTrade(state);
  state = initializeInternational(state);
  state = initializeOperations(state);
  state = initializeMultilateral(state);
  for (const countryId of [A, B]) {
    state = admitMilitaryBaseline(state, { countryId, source, parameters, authorized: 100, present: 50, trainees: 0, equipment: { personal: { operational: 100, unavailable: 0, maintenance: 0, reserve: 0 }, truck: { operational: 10, unavailable: 0, maintenance: 0, reserve: 0 } }, consumables: { ammunition: { quantity: 1000, capacity: 10000 }, fuel: { quantity: 1000, capacity: 10000 } }, industrialMaterials: 1000 });
  }
  state = createPoliticalPerson(state, { countryId: A, displayName: 'Synthetic executive' });
  const personId = Object.keys(state.governance.persons)[0];
  state = setControlledPerson(assignPoliticalOffice(state, personId, { countryId: A, role: 'head_of_government' }), personId);
  return state;
}
const person = (state: SimulationState) => state.governance.player.controlledPersonId!;

describe('0.25.10 cross-system causal loops', () => {
  it('loop 1: construction -> employment -> income -> consumption -> fiscal', () => {
    let state = fixture();
    state = admitTradeMarket(state, A, syntheticTradeMarket('raw_materials', {
      use: 'industrial', stock: { opening: 1000, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 1000, target: 1000, capacity: 10000 },
    }));
    state = proposeConstruction(state, { proposerPersonId: person(state), countryId: A, regionId: regionA, assetTypeId: 'type.road', title: 'Regional road', estimatedCostUsd: 2_000_000 });
    const projectId = state.assets.projectOrder[0];
    state = authorizeConstruction(state, { projectId, authorizerPersonId: person(state) });
    state = fundConstruction(state, { projectId, funderPersonId: person(state) });
    state = startWork(state, { projectId, personId: person(state), workers: 50 });
    expect(constructionReservedPersonnel(state, regionA)).toBe(50);
    state = advanceSimulationDays(state, 31);
    expect(assertSimulationInvariants(state, context, 'save')).toBe(true);
    // construction spent treasury money and reserved labour (the causal source)
    expect(state.fiscal.countries[A].account!.construction?.executed ?? 0).toBeGreaterThan(0);
    expect(constructionReservedPersonnel(state, regionA)).toBe(50);
    // reserved workers are never simultaneously civilian employees
    const economy = state.socioeconomy.regions[regionA].economy!;
    expect(economy.employed).toBeLessThan(economy.labourForce);
    // income -> consumption -> fiscal: the monthly pass tracked the income and
    // consumption flows as tax bases (synth Country has unavailable rules, so
    // liability stays zero — unavailable != zero, never a fabricated rate)
    expect(state.fiscal.regions[regionA].taxes.personal.base).toBeGreaterThan(0);
    expect(state.fiscal.regions[regionA].taxes.consumption.base).toBeGreaterThan(0);
    expect(state.fiscal.regions[regionA].taxes.personal.status).toBe('unavailable');
    expect(state.fiscal.regions[regionA].disposable.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  }, 120000);

  it('loop 2: shortage -> price pressure -> opinion through material variables', () => {
    let state = fixture();
    const scheduler = createCoreScheduler();
    state = requestEconomicShock(state, scheduler, regionA, { capacityBps: 5000, productivityBps: 10000, labourBps: 10000 });
    const baselineOpinion = structuredClone(state.politics.regionalOpinion[regionA].cohorts);
    state = advanceSimulationDays(state, 62, scheduler);
    expect(assertSimulationInvariants(state, context, 'save')).toBe(true);
    // halving capacity produced a material shortage (never a magic penalty)
    const economy = state.socioeconomy.regions[regionA].economy!;
    expect(economy.shortage).toBeGreaterThan(0);
    // shortage -> price: the 0.25.7 domestic price view reports upward pressure causally
    expect(domesticMarketPrice(state, regionA)!.pressure).toBe('up');
    // shortage -> crisis: household distress monitors shortage/needs coverage
    const household = state.crisis.countries[A].currentByType['household_distress'];
    expect(household.currentTripwires.some(t => t.indicator === 'persistent_shortage' || t.indicator === 'basic_needs_coverage')).toBe(true);
    // shortage -> opinion: opinion is material-only (needs gap), never a price-to-opinion modifier
    expect(state.politics.regionalOpinion[regionA].cohorts).not.toEqual(baselineOpinion);
  }, 120000);

  it('loop 3: sanction -> blocked logistics -> stock -> production -> military capacity', () => {
    let state = fixture();
    state = admitTradeMarket(state, A, syntheticTradeMarket('industrial_goods', {
      use: 'industrial', militaryInputPerFactoryUnit: 1,
      stock: { opening: 10, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 10, target: 10, capacity: 100 },
    }));
    state = admitTradeMarket(state, B, syntheticTradeMarket('industrial_goods', { productionPerMonth: 100, domesticNeedPerMonth: 10, use: 'industrial' }));
    state = admitTradeRoute(state, { id: 'route.synth-loops:industrial_goods:B:A', exporterId: B, importerId: A, category: 'industrial_goods', source: { ...SYNTHETIC_TRADE_SOURCE }, capacityPerMonth: 100, establishedCapacity: 100, expansionPerMonth: 0, logisticsBps: 100, tariffBps: 0 });
    state = imposeImportRestriction(state, A, B, person(state), ['industrial_goods']);
    state = advanceSimulationDays(state, 1); // the restriction becomes effective the next day
    expect(sanctionBlocksRoute(state, { exporterId: B, importerId: A, category: 'industrial_goods' }, state.date)).toBe(true);
    state = advanceSimulationDays(state, 61);
    expect(assertSimulationInvariants(state, context, 'save')).toBe(true);
    // blocked logistics: no fresh industrial stock arrived into A
    const market = state.trade.countries[A].markets.industrial_goods!;
    expect(market.stock!.quantity).toBeLessThanOrEqual(10);
    // the depleted stock bounds (never expands) military factory capacity
    expect(tradeFactoryCapacity(state, A) ?? 0).toBeLessThanOrEqual(10);
  }, 120000);

  it('loop 4: fiscal reform -> disposable income -> behavior -> material consequence', () => {
    // isolate the reform's causal effect against a no-reform control (the
    // synthetic economy drifts over months, so a before/after delta would
    // confound the reform with baseline growth)
    let control = fixture();
    let reform = fixture();
    const annualBudget = { ...reform.fiscal.countries[A].annualBudget, incomeSupport: 0 };
    reform = scheduleFiscalReform(reform, { countryId: A, effectiveDate: reform.date, annualBudget });
    control = advanceSimulationDays(control, 62);
    reform = advanceSimulationDays(reform, 62);
    expect(assertSimulationInvariants(reform, context, 'save')).toBe(true);
    const reformDisposable = reform.fiscal.regions[regionA].disposable.reduce((a, b) => a + b, 0);
    const controlDisposable = control.fiscal.regions[regionA].disposable.reduce((a, b) => a + b, 0);
    // lower transfers lower disposable income, which lowers realized consumption
    expect(reform.fiscal.countries[A].account!.executed.incomeSupport).toBeLessThan(control.fiscal.countries[A].account!.executed.incomeSupport);
    expect(reformDisposable).toBeLessThan(controlDisposable);
    expect(reform.socioeconomy.regions[regionA].economy!.consumption).toBeLessThan(control.socioeconomy.regions[regionA].economy!.consumption);
    // demand shortfall is a material consequence, never a phantom penalty
    expect(reform.socioeconomy.regions[regionA].economy!.output).toBeLessThanOrEqual(reform.socioeconomy.regions[regionA].economy!.productionCapacity);
  }, 120000);
});
