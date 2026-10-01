import type { RegionEntity, SimulationState } from '../types';
import { initializeCrisisState } from './crisis/model';
import { initializeFiscal } from './fiscal/runtime';
import { initializeSocioeconomy, type InitializationData } from './socioeconomy/initialization';
import { initializePolitics, type PoliticalInitializationData } from './politics/initialization';
import { emptyGovernance } from './governance/model';
import { initializePartyLeaders } from './governance/runtime';
import { initializeInformationState } from './information/runtime';

/** Composes the existing domain initializers for a new game without running a simulation evaluation. */
export function initializeNewGame(
  state: SimulationState,
  regions: readonly RegionEntity[],
  countryIds: Iterable<string>,
  socioeconomicData?: InitializationData,
  politicalData?: PoliticalInitializationData,
): SimulationState {
  const ids = [...countryIds].sort();
  const fiscal = initializeFiscal(initializeSocioeconomy(initializeInformationState(state), regions, socioeconomicData));
  const crisis = { ...fiscal, crisis: initializeCrisisState(fiscal.crisis, ids, fiscal.date) };
  const withPolitics = { ...crisis, politics: initializePolitics(crisis, ids, regions, politicalData), governance: crisis.governance?.initializedOn ? crisis.governance : emptyGovernance(crisis.date) };
  return initializePartyLeaders(withPolitics);
}
