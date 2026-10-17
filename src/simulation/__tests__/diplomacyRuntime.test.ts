import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyAssets } from '../assets/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { initializeFiscal } from '../fiscal/runtime';
import { initializeMilitary, admitMilitaryBaseline } from '../military/runtime';
import type { MilitaryParameters } from '../military/model';
import { initializeTrade, admitTradeRoute } from '../trade/runtime';
import { SYNTHETIC_TRADE_SOURCE } from '../trade/scenario';
import { initializeInternational, sanctionBlocksRoute } from '../international/runtime';
import { initializeInformationState } from '../information/runtime';
import { initializePolitics } from '../politics/initialization';
import { assignPoliticalOffice, createPoliticalPerson, setControlledPerson } from '../governance/runtime';
import { createEngineState } from '../state';
import { getRelation } from '../diplomacy';
import { applyCoercionMeasure, applyConcession, militarySupportChain, militarySupportLinks } from '../diplomacy/integration';
import type { DiplomaticMandate } from '../diplomacy/contract';

const A = 'country.dip-a', B = 'country.dip-b';
const regionA = 'region.dip-a', regionB = 'region.dip-b';
const mandate: DiplomaticMandate = { basis: 'head_of_government' };
const parameters: MilitaryParameters = { monthlySalaryUsd: 1000, recruitmentPerMonth: 10, reductionPerMonth: 5, trainingMonths: 3, instructors: 20, trainingCostPerPersonUsd: 100, technicians: 10, factoryUnitsPerMonth: 10, factoryMaterialPerUnit: 1, logisticsStaff: 5, logisticsPersonsPerStaff: 20, exerciseAmmunitionPerPerson: 1, exerciseFuelPerPerson: 1, desiredEquipment: { personal: 100, truck: 5 }, desiredConsumables: { ammunition: 500, fuel: 500 } };
const source = { status: 'modelled' as const, publisher: 'Synthetic diplomacy scenario', url: 'scenario:synthetic-diplomacy', referenceDate: '2026-01-01', retrievedAt: '2026-10-03', licence: 'ProjectAtlas test fixture (ISC)', attribution: 'ProjectAtlas', limitation: 'Entirely synthetic diplomacy fixture.', scenarioFixture: true };

function fixture(): SimulationState {
  const regions: RegionEntity[] = [A, B].map((id, i) => ({ id: i === 0 ? regionA : regionB, parentCountryId: id, initialOwnerCountryId: id, commonName: `Synthetic diplomacy Region ${i}`, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'synthetic-diplomacy-fixture', sourceFeatureIds: [String(i)] } }));
  let state: SimulationState = {
    schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
    territoryOwnership: {}, regionOwnership: { [regionA]: A, [regionB]: B },
    populationByRegion: { [regionA]: 10000, [regionB]: 10000 }, economicOutputByRegion: { [regionA]: 1200000000, [regionB]: 1200000000 },
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState([A, B], 'diplomacy-seed'),
  };
  state = initializeInformationState(initializeFiscal(initializeSocioeconomy(state, regions)));
  state = { ...state, politics: initializePolitics(state, [A, B], regions) };
  state = initializeMilitary(state);
  state = initializeTrade(state);
  state = initializeInternational(state);
  state = admitMilitaryBaseline(state, { countryId: A, source, parameters, authorized: 100, present: 50, trainees: 0, equipment: { personal: { operational: 100, unavailable: 0, maintenance: 0, reserve: 0 }, truck: { operational: 10, unavailable: 0, maintenance: 0, reserve: 0 } }, consumables: { ammunition: { quantity: 400, capacity: 10000 }, fuel: { quantity: 300, capacity: 10000 } }, industrialMaterials: 1000 });
  state = admitTradeRoute(state, { id: 'route.dip:food', exporterId: A, importerId: B, category: 'food', source: { ...SYNTHETIC_TRADE_SOURCE }, capacityPerMonth: 100, establishedCapacity: 60, expansionPerMonth: 10, logisticsBps: 250, tariffBps: 500 });
  state = createPoliticalPerson(state, { countryId: A, displayName: 'Synthetic diplomacy executive' });
  const person = Object.keys(state.governance.persons)[0];
  state = setControlledPerson(assignPoliticalOffice(state, person, { countryId: A, role: 'head_of_government' }), person);
  return state;
}
const person = (state: SimulationState) => state.governance.player.controlledPersonId!;

describe('diplomacy/military 0.31 runtime integration', () => {
  it('applies a sanction with an explicit import direction and blocks the route', () => {
    const state = fixture();
    const next = applyCoercionMeasure(state, { id: 'coercion.1', actorCountryId: B, mandate, targetCountryId: A, kind: 'sanction', direction: 'import', categories: ['food'], date: state.date, note: 'Synthetic import sanction' }, person(state));
    const action = Object.values(next.international.actions).find(a => a.kind === 'import_restriction')!;
    expect(action).toBeTruthy();
    expect(action.categories).toEqual(['food']);
    expect(sanctionBlocksRoute(next, { exporterId: A, importerId: B, category: 'food' })).toBe(true);
  });

  it('applies an export-direction sanction without misclassifying it', () => {
    const state = fixture();
    const next = applyCoercionMeasure(state, { id: 'coercion.2', actorCountryId: A, mandate, targetCountryId: B, kind: 'embargo', direction: 'export', categories: ['food'], date: state.date, note: 'Synthetic export embargo' }, person(state));
    expect(Object.values(next.international.actions).some(a => a.kind === 'export_restriction')).toBe(true);
    expect(Object.values(next.international.actions).some(a => a.kind === 'import_restriction')).toBe(false);
  });

  it('applies a relation-adjustment concession to the canonical relation score', () => {
    const state = fixture();
    const before = getRelation(state, A, B).score;
    const next = applyConcession(state, { id: 'conc.1', fromCountryId: A, mandate, toCountryId: B, kind: 'relation_adjustment', value: 10, date: state.date, note: 'Synthetic concession' });
    expect(getRelation(next, A, B).score).toBe(before + 10);
  });

  it('reduces the ordinary customs rate via a tariff concession on admitted routes', () => {
    const state = fixture();
    const next = applyConcession(state, { id: 'conc.2', fromCountryId: B, mandate, toCountryId: A, kind: 'tariff_reduction', value: 200, date: state.date, note: 'Synthetic tariff concession' });
    const route = next.trade.routes.find(r => r.id === 'route.dip:food')!;
    expect(route.tariffBps).toBe(300); // 500 - 200
  });

  it('derives the support chain from canonical military stocks (unavailable != 0)', () => {
    const state = fixture();
    const links = militarySupportLinks(state, A);
    expect(links.find(l => l.kind === 'fuel')!.requiredPerMonth).toBe(500);
    expect(links.find(l => l.kind === 'fuel')!.available).toBe(300);
    expect(links.find(l => l.kind === 'ammunition')!.available).toBe(400);
    expect(links.find(l => l.kind === 'personnel')!.available).toBe(50);
    // parts/maintenance/transport are unmapped -> the whole chain is unavailable,
    // never a fabricated rupture.
    expect(militarySupportChain(state, A).status).toBe('unavailable');
  });
});
