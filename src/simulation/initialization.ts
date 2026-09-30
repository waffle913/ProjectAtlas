import type { RegionEntity, SimulationState } from '../types';
import { initializeCrisisState } from './crisis/model';
import { initializeFiscal } from './fiscal/runtime';
import { initializeSocioeconomy, type InitializationData } from './socioeconomy/initialization';

/** Composes the existing domain initializers for a new game without running a simulation evaluation. */
export function initializeNewGame(
  state: SimulationState,
  regions: readonly RegionEntity[],
  countryIds: Iterable<string>,
  socioeconomicData?: InitializationData,
): SimulationState {
  const ids = [...countryIds].sort();
  const fiscal = initializeFiscal(initializeSocioeconomy(state, regions, socioeconomicData));
  return { ...fiscal, crisis: initializeCrisisState(fiscal.crisis, ids, fiscal.date) };
}
