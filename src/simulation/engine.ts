import { registerFiscalTasks } from './fiscal/runtime';
import { registerCrisisTasks } from './crisis/runtime';
import { registerPoliticalTasks } from './politics/runtime';
import { registerInformationTasks } from './information/runtime';
import { registerMilitaryTasks } from './military/runtime';
import { registerMilitaryReportTasks } from './military/reports';
import { registerSocioeconomicTasks } from './socioeconomy/runtime';
import { registerTradeTasks } from './trade/runtime';
import { registerTradeReportTasks } from './trade/reports';
import { registerInternationalReportTasks, registerInternationalTasks } from './international/runtime';
import { registerOperationsTasks } from './operations/runtime';
import { registerOperationsReportTasks } from './operations/reports';
import { registerMultilateralTasks } from './multilateral/runtime';
import { registerMultilateralReportTasks } from './multilateral/reports';
import { registerConstitutionTasks } from './constitution/runtime';
import type { SimulationState } from '../types';
import { applyPendingFidelityTransitions } from './fidelity';
import { SimulationScheduler } from './scheduler';
import { validateFidelityConservation } from './invariants';

export const CORE_FIDELITY_TASK_ID = 'engine.apply-fidelity-transitions';

export function createCoreScheduler() {
  return registerOperationsTasks(registerOperationsReportTasks(registerInternationalReportTasks(registerInternationalTasks(registerMultilateralReportTasks(registerMultilateralTasks(registerConstitutionTasks(registerTradeReportTasks(registerTradeTasks(registerMilitaryReportTasks(registerMilitaryTasks(registerInformationTasks(registerPoliticalTasks(registerCrisisTasks(registerFiscalTasks(registerSocioeconomicTasks(new SimulationScheduler().register({
    id: CORE_FIDELITY_TASK_ID,
    cadence: 'daily',
    priority: -1_000,
    run: state => {
      if (!state.engine.pendingFidelityTransitions.length) return state;
      const next = applyPendingFidelityTransitions(state);
      const violations = validateFidelityConservation(state, next);
      if (violations.length) throw new Error(violations.map(item => item.message).join('\n'));
      return next;
    },
  })))))))))))))))));
}

export const advanceSimulationDays = (state: SimulationState, days: number, scheduler = createCoreScheduler()) => {
  if (!Number.isSafeInteger(days) || days < 0) throw new Error('Simulation days must be a non-negative safe integer.');
  let current = state;
  for (let day = 0; day < days; day += 1) current = scheduler.advanceOneDay(current).state;
  return current;
};
