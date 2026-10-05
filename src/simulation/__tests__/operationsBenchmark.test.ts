import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants } from '../invariants';
import { admitMilitaryBaseline } from '../military/runtime';
import { createClaim } from '../diplomacy';
import { declareLimitedWar } from '../war';
import type { MilitaryParameters } from '../military/model';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import registry from '../../data/entity-registry.json';
import type { Deployment } from '../operations/model';
import type { SimulationState } from '../../types';

const idFor = (iso: string) => registry.countries.find(country => country.externalIds.isoAlpha3 === iso)!.id;

const militaryParameters: MilitaryParameters = {
  monthlySalaryUsd: 1000, recruitmentPerMonth: 10, reductionPerMonth: 5, trainingMonths: 3,
  instructors: 20, trainingCostPerPersonUsd: 100, technicians: 10, factoryUnitsPerMonth: 10, factoryMaterialPerUnit: 1,
  logisticsStaff: 5, logisticsPersonsPerStaff: 20, exerciseAmmunitionPerPerson: 1, exerciseFuelPerPerson: 1,
  desiredEquipment: { personal: 100, truck: 5 }, desiredConsumables: { ammunition: 500, fuel: 500 },
};

const benchmarkSource = {
  status: 'modelled' as const,
  publisher: 'ProjectAtlas synthetic operations benchmark',
  url: 'scenario:synthetic-operations-benchmark',
  referenceDate: '2026-01-01', retrievedAt: '2026-10-03',
  licence: 'ProjectAtlas test fixture (ISC)', attribution: 'ProjectAtlas',
  limitation: 'Entirely synthetic; not a real national army observation.', scenarioFixture: true,
};

function admit(state: SimulationState, countryId: string): SimulationState {
  return admitMilitaryBaseline(state, {
    countryId,
    source: benchmarkSource,
    parameters: militaryParameters,
    authorized: 100, present: 50, trainees: 0,
    equipment: { personal: { operational: 100, unavailable: 0, maintenance: 0, reserve: 0 }, truck: { operational: 10, unavailable: 0, maintenance: 0, reserve: 0 } },
    consumables: { ammunition: { quantity: 1000, capacity: 10000 }, fuel: { quantity: 1000, capacity: 10000 } },
    industrialMaterials: 1000,
  });
}

function deployment(id: string, countryId: string, warId: string, sourceRegionId: string, currentRegionId: string, personnel: number): Deployment {
  return {
    id, countryId, warId, sourceRegionId, currentRegionId, personnel, equipment: { personal: 20, truck: 5 },
    supply: { ammunition: 40, fuel: 20 }, status: 'deployed', losses: { personnel: 0, equipment: {} },
    allocated: { personnel, equipment: { personal: 20, truck: 5 } }, provenance: 'modelled',
    limitation: 'Synthetic operations benchmark deployment.',
  };
}

describe('operations 0.19 synthetic sparse world benchmark', () => {
  it('measures a single two-country war workload at real registry scale without scanning every Region', () => {
    let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    const attacker = idFor('USA');
    const defender = idFor('CAN');
    state = admit(state, attacker);
    state = admit(state, defender);
    const targetRegionId = worldRegions.find(region => region.initialOwnerCountryId === defender)!.id;
    state = createClaim(state, { id: 'claim.bench', claimantCountryId: attacker, regionId: targetRegionId, type: 'territorial', creationDate: state.date, reason: 'Synthetic operations benchmark claim.' }, worldContext);
    state = declareLimitedWar(state, { warId: 'war.bench', attackerCountryId: attacker, defenderCountryId: defender, targetRegionId, casusBelliId: `claim-derived:claim.bench:${defender}` }, worldContext);
    const attackerSource = Object.keys(state.military.countries[attacker].capability!.assignments)[0];
    const defenderSource = Object.keys(state.military.countries[defender].capability!.assignments)[0];
    const deployments = {
      'deployment.00000000': deployment('deployment.00000000', attacker, 'war.bench', attackerSource, targetRegionId, 40),
      'deployment.00000001': deployment('deployment.00000001', defender, 'war.bench', defenderSource, targetRegionId, 40),
    };
    state = { ...state, operations: { ...state.operations, deployments, deploymentOrder: ['deployment.00000000', 'deployment.00000001'], nextDeploymentSequence: 2 } };
    const started = performance.now();
    const next = advanceSimulationDays(state, 31);
    const elapsed = performance.now() - started;
    expect(next.wars).toHaveLength(1);
    expect(Object.keys(next.operations.engagements).length).toBeGreaterThan(0);
    expect(Object.keys(next.operations.deployments).length).toBe(2);
    expect(assertSimulationInvariants(next, worldContext, 'save')).toBe(true);
    console.info(`OPERATIONS_WORLD_BENCHMARK ${JSON.stringify({ countries: 252, regions: worldRegions.length, activeWars: 1, deployments: 2, engagements: Object.keys(next.operations.engagements).length, days: 31, elapsedMs: elapsed })}`);
  }, 120000);
});
