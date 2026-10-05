import type { SimulationState } from '../../types';
import { emptyMultilateral } from './model';

/** Initializes the empty multilateral domain; migration never fabricates treaties, organizations or memberships. */
export function initializeMultilateral(state: SimulationState): SimulationState {
  if (state.multilateral?.initializedOn) return state;
  return { ...state, multilateral: emptyMultilateral(state.date) };
}
