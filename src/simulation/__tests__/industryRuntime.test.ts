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
import { initializeMilitary, admitMilitaryBaseline, placeMilitaryOrder, executeMilitaryFunding, militaryFactoryCapacity, militaryRequests } from '../military/runtime';
import type { MilitaryParameters } from '../military/model';
import { assignPoliticalOffice, createPoliticalPerson, setControlledPerson } from '../governance/runtime';
import { createEngineState } from '../state';
import { capacityMultiplierFor, MILITARY_FACTORY_TARGET, TECHNOLOGY_LINK_REGISTRY, type TechnologyLink } from '../industry/technology';

const A = 'country.tech-a', regionA = 'region.tech-a';
const source = { status: 'modelled' as const, publisher: 'Synthetic technology scenario', url: 'scenario:synthetic-technology', referenceDate: '2026-01-01', retrievedAt: '2026-10-03', licence: 'ProjectAtlas test fixture (ISC)', attribution: 'ProjectAtlas', limitation: 'Entirely synthetic technology fixture.', scenarioFixture: true };
const parameters: MilitaryParameters = { monthlySalaryUsd: 1000, recruitmentPerMonth: 10, reductionPerMonth: 5, trainingMonths: 3, instructors: 20, trainingCostPerPersonUsd: 100, technicians: 10, factoryUnitsPerMonth: 10, factoryMaterialPerUnit: 1, logisticsStaff: 5, logisticsPersonsPerStaff: 20, exerciseAmmunitionPerPerson: 1, exerciseFuelPerPerson: 1, desiredEquipment: { personal: 100, truck: 5 }, desiredConsumables: { ammunition: 500, fuel: 500 } };

function fixture(): SimulationState {
  const regions: RegionEntity[] = [{ id: regionA, parentCountryId: A, initialOwnerCountryId: A, commonName: 'Synthetic tech Region', administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'synthetic-technology-fixture', sourceFeatureIds: ['0'] } }];
  let state: SimulationState = {
    schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
    territoryOwnership: {}, regionOwnership: { [regionA]: A },
    populationByRegion: { [regionA]: 10000 }, economicOutputByRegion: { [regionA]: 1200000000 },
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState([A], 'technology-seed'),
  };
  state = initializeMilitary(initializeFiscal(initializeSocioeconomy(state, regions)));
  state = admitMilitaryBaseline(state, { countryId: A, source, parameters, authorized: 100, present: 50, trainees: 0, equipment: { personal: { operational: 100, unavailable: 0, maintenance: 0, reserve: 0 }, truck: { operational: 10, unavailable: 0, maintenance: 0, reserve: 0 } }, consumables: { ammunition: { quantity: 1000, capacity: 10000 }, fuel: { quantity: 1000, capacity: 10000 } }, industrialMaterials: 1000 });
  state = createPoliticalPerson(state, { countryId: A, displayName: 'Synthetic tech executive' });
  const person = Object.keys(state.governance.persons)[0];
  state = setControlledPerson(assignPoliticalOffice(state, person, { countryId: A, role: 'head_of_government' }), person);
  return state;
}

describe('industry 0.28 runtime integration (technology capacity -> military production)', () => {
  it('keeps the empty registry a no-op (10,000 bps = unchanged capacity)', () => {
    const state = fixture();
    expect(TECHNOLOGY_LINK_REGISTRY).toEqual({});
    expect(capacityMultiplierFor(TECHNOLOGY_LINK_REGISTRY, MILITARY_FACTORY_TARGET)).toBe(10000);
    const base = militaryFactoryCapacity(state, A, {});
    expect(militaryFactoryCapacity(state, A, TECHNOLOGY_LINK_REGISTRY)).toBe(base);
    expect(militaryFactoryCapacity(state, A)).toBe(base);
  });

  it('composes multiple admitted technology links for one target and applies the effect', () => {
    const links: Record<string, TechnologyLink> = {
      'tech.a': { id: 'tech.a', technologyId: 'tech.a', domain: 'military', targetProductId: MILITARY_FACTORY_TARGET, capacityMultiplierBps: 12000 },
      'tech.b': { id: 'tech.b', technologyId: 'tech.b', domain: 'military', targetProductId: MILITARY_FACTORY_TARGET, capacityMultiplierBps: 11000 },
      'tech.other': { id: 'tech.other', technologyId: 'tech.other', domain: 'civilian', targetProductId: 'civilian_capital', capacityMultiplierBps: 20000 },
    };
    expect(capacityMultiplierFor(links, MILITARY_FACTORY_TARGET)).toBe(13200); // 1.20 * 1.10
    expect(capacityMultiplierFor(links, 'civilian_capital')).toBe(20000);
  });

  it('increases funded military production through a real state transition', () => {
    const person = Object.keys(fixture().governance.persons)[0];
    let ordered = placeMilitaryOrder(fixture(), A, person, 'personal', 100);
    // Orders become eligible on the next boundary (orderedOn < state.date).
    ordered = { ...ordered, date: '2026-02-01', engine: { ...ordered.engine, tick: ordered.engine.tick + 30 } };
    const links: Record<string, TechnologyLink> = { 'tech.a': { id: 'tech.a', technologyId: 'tech.a', domain: 'military', targetProductId: MILITARY_FACTORY_TARGET, capacityMultiplierBps: 20000 } };
    const base = executeMilitaryFunding(ordered, A, 1_000_000);
    const boosted = executeMilitaryFunding(ordered, A, 1_000_000, links);
    const baseUnits = base.state.military.countries[A].capability!.lastLedger!.productionUnits;
    const boostedUnits = boosted.state.military.countries[A].capability!.lastLedger!.productionUnits;
    expect(baseUnits).toBeGreaterThan(0);
    expect(boostedUnits).toBeGreaterThan(baseUnits); // technology raises the factory ceiling -> more units funded
    expect(militaryRequests(boosted.state, A, links).production).toBeGreaterThan(0);
  });
});
