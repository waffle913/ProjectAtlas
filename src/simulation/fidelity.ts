import type { FidelityLevel, SimulationState } from '../types';

export const FIDELITY_LEVELS = ['Detailed', 'Standard', 'Background'] as const satisfies readonly FidelityLevel[];
const isFidelity = (value: unknown): value is FidelityLevel => FIDELITY_LEVELS.includes(value as FidelityLevel);

export function getCountryFidelity(state: SimulationState, countryId: string): FidelityLevel {
  const fidelity = state.engine.fidelityByCountry[countryId];
  if (!fidelity) throw new Error(`Country has no fidelity assignment: ${countryId}`);
  return fidelity;
}

export function requestFidelityTransition(state: SimulationState, countryId: string, to: FidelityLevel, countryIds: ReadonlySet<string>, reason?: string): SimulationState {
  if (!countryIds.has(countryId)) throw new Error(`Unknown Country ID: ${countryId}`);
  if (!isFidelity(to)) throw new Error(`Unknown fidelity level: ${String(to)}`);
  const priorPending = [...state.engine.pendingFidelityTransitions].reverse().find(item => item.countryId === countryId);
  const from = priorPending?.to ?? getCountryFidelity(state, countryId);
  if (from === to) return state;
  const sequence = state.engine.nextSequence;
  return {
    ...state,
    engine: {
      ...state.engine,
      nextSequence: sequence + 1,
      pendingFidelityTransitions: [...state.engine.pendingFidelityTransitions, { countryId, from, to, requestedAtTick: state.engine.tick, sequence, reason }],
    },
  };
}

/** Applies queued transitions at the scheduler's daily boundary. It changes resolution metadata only. */
export function applyPendingFidelityTransitions(state: SimulationState): SimulationState {
  if (!state.engine.pendingFidelityTransitions.length) return state;
  const fidelityByCountry = { ...state.engine.fidelityByCountry };
  const recent = [...state.engine.recentFidelityTransitions];
  for (const transition of [...state.engine.pendingFidelityTransitions].sort((a, b) => a.sequence - b.sequence)) {
    if (fidelityByCountry[transition.countryId] !== transition.from) throw new Error(`Stale fidelity transition for ${transition.countryId}.`);
    fidelityByCountry[transition.countryId] = transition.to;
    recent.push({ ...transition, appliedAtTick: state.engine.tick, appliedOnDate: state.date });
  }
  return { ...state, engine: { ...state.engine, fidelityByCountry, pendingFidelityTransitions: [], recentFidelityTransitions: recent.slice(-100) } };
}
