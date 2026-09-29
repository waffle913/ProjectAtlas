import { cloneSocioeconomy } from './socioeconomy/model';
import type { FidelityLevel, SimulationEngineState, SimulationState } from '../types';

export const DEFAULT_SIMULATION_SEED = 'project-atlas-2026';

export function createEngineState(countryIds: Iterable<string> = [], seed = DEFAULT_SIMULATION_SEED): SimulationEngineState {
  return {
    seed,
    tick: 0,
    fidelityByCountry: Object.fromEntries([...countryIds].sort().map(id => [id, 'Standard' satisfies FidelityLevel])),
    pendingFidelityTransitions: [],
    recentFidelityTransitions: [],
    pendingImmediateUpdates: [],
    nextSequence: 0,
    dirtyDomains: [],
  };
}

export function cloneSimulationState(state: SimulationState): SimulationState {
  return {
    ...state,
    socioeconomy: cloneSocioeconomy(state.socioeconomy),
    territoryOwnership: { ...state.territoryOwnership },
    regionOwnership: { ...state.regionOwnership },
    populationByRegion: { ...state.populationByRegion },
    economicOutputByRegion: { ...state.economicOutputByRegion },
    bilateralRelations: Object.fromEntries(Object.entries(state.bilateralRelations).map(([key, relation]) => [key, { ...relation }])),
    claims: state.claims.map(claim => ({ ...claim })),
    explicitCasusBelli: state.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })),
    wars: state.wars.map(war => ({ ...war, declarationCasusBelli: { ...war.declarationCasusBelli, targetRegionIds: war.declarationCasusBelli.targetRegionIds ? [...war.declarationCasusBelli.targetRegionIds] : undefined } })),
    occupationByRegion: Object.fromEntries(Object.entries(state.occupationByRegion).map(([regionId, occupation]) => [regionId, { ...occupation }])),
    engine: {
      ...state.engine,
      fidelityByCountry: { ...state.engine.fidelityByCountry },
      pendingFidelityTransitions: state.engine.pendingFidelityTransitions.map(item => ({ ...item })),
      recentFidelityTransitions: state.engine.recentFidelityTransitions.map(item => ({ ...item })),
      pendingImmediateUpdates: state.engine.pendingImmediateUpdates.map(item => ({ ...item })),
      dirtyDomains: state.engine.dirtyDomains.map(item => ({ ...item, entityIds: [...item.entityIds], reasons: [...item.reasons] })),
    },
  };
}
