import type { SimulationState } from '../types';
import type { SimulationScheduler } from './scheduler';
import type { InvariantViolation } from './invariants';

export function simulationDiagnostics(state: SimulationState, scheduler: SimulationScheduler, violations: readonly InvariantViolation[] = []) {
  const fidelityCounts = Object.values(state.engine.fidelityByCountry).reduce<Record<string, number>>((counts, level) => ({ ...counts, [level]: (counts[level] ?? 0) + 1 }), {});
  return {
    date: state.date,
    tick: state.engine.tick,
    seed: state.engine.seed,
    scheduler: scheduler.describe(),
    fidelityCounts,
    pendingFidelityTransitions: state.engine.pendingFidelityTransitions.map(item => ({ ...item })),
    recentFidelityTransitions: state.engine.recentFidelityTransitions.map(item => ({ ...item })),
    dirtyDomains: state.engine.dirtyDomains.map(item => ({ ...item, entityIds: [...item.entityIds], reasons: [...item.reasons] })),
    invariantViolations: violations.map(item => ({ ...item })),
  };
}
