import type { SimulationState } from '../../types';
import { scheduleFiscalReform } from '../fiscal/runtime';
import { admitMilitaryBaseline } from './runtime';

/** Explicit opt-in new-game demonstration; never a factual national baseline or gameplay grant. */
export function configureSyntheticMilitaryScenario(state: SimulationState, countryId: string) {
  if (state.date !== '2026-01-01' || state.engine.tick !== 0 || state.governance.player.controlledPersonId) throw new Error('Synthetic military scenario can only be selected before starting a new game.');
  const fiscal = state.fiscal.countries[countryId];
  if (!fiscal) throw new Error('Synthetic scenario requires an existing registered fiscal Country.');
  const admitted = admitMilitaryBaseline(state, {
    countryId, source: { status: 'modelled', publisher: 'ProjectAtlas synthetic demonstration scenario', url: 'scenario:military-peacetime-demonstration-v1',
      referenceDate: '2026-01-01', retrievedAt: '2026-10-03', licence: 'ISC (ProjectAtlas original modelled scenario)',
      attribution: 'ProjectAtlas', limitation: 'Explicit opt-in synthetic50-person military and12millionUSD annual defense ceiling, not national observations or empirical calibration. Only this selected Country is configured; its existing workforce, output, taxes and financing remain authoritative.', scenarioFixture: true },
    authorized: 100, present: 50, trainees: 10,
    parameters: { monthlySalaryUsd: 1000, recruitmentPerMonth: 10, reductionPerMonth: 5, trainingMonths: 3, instructors: 20,
      trainingCostPerPersonUsd: 100, technicians: 10, factoryUnitsPerMonth: 10, factoryMaterialPerUnit: 1, logisticsStaff: 5,
      logisticsPersonsPerStaff: 20, exerciseAmmunitionPerPerson: 1, exerciseFuelPerPerson: 1,
      desiredEquipment: { personal: 100, truck: 5 }, desiredConsumables: { ammunition: 500, fuel: 500 } },
    equipment: { personal: { operational: 100, unavailable: 0, maintenance: 0, reserve: 0 }, truck: { operational: 5, unavailable: 0, maintenance: 0, reserve: 0 } },
    consumables: { ammunition: { quantity: 1000, capacity: 10000 }, fuel: { quantity: 1000, capacity: 10000 } }, industrialMaterials: 1000,
  });
  return scheduleFiscalReform(admitted, { countryId, effectiveDate: state.date, annualBudget: { ...fiscal.annualBudget, defense: 12000000 } });
}
