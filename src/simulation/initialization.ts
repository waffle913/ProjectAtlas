import type { RegionEntity, SimulationState } from '../types';
import { initializeCrisisState } from './crisis/model';
import { initializeFiscal } from './fiscal/runtime';
import { initializeSocioeconomy, type InitializationData } from './socioeconomy/initialization';
import { initializePolitics, type PoliticalInitializationData } from './politics/initialization';
import { emptyGovernance } from './governance/model';

/** Composes the existing domain initializers for a new game without running a simulation evaluation. */
export function initializeNewGame(
  state: SimulationState,
  regions: readonly RegionEntity[],
  countryIds: Iterable<string>,
  socioeconomicData?: InitializationData,
  politicalData?: PoliticalInitializationData,
): SimulationState {
  const ids = [...countryIds].sort();
  const fiscal = initializeFiscal(initializeSocioeconomy(state, regions, socioeconomicData));
  const crisis = { ...fiscal, crisis: initializeCrisisState(fiscal.crisis, ids, fiscal.date) };
  return { ...crisis, politics: initializePolitics(crisis, ids, regions, politicalData), governance: crisis.governance?.initializedOn ? crisis.governance : emptyGovernance(crisis.date) };
}
