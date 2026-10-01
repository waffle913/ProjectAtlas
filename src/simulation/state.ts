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
    governance: structuredClone(state.governance),
    crisis: structuredClone(state.crisis),
    politics: structuredClone(state.politics),
    socioeconomy: cloneSocioeconomy(state.socioeconomy),
    fiscal: structuredClone(state.fiscal),
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

/**
 * Per-consumer defensive snapshot cache for the engine's pure, copy-on-write state.
 * Only JSON-like state is supported. Unchanged source objects retain identity in
 * the UI snapshot, including nested cohorts across monthly economic updates.
 * Copies are deeply frozen: neither the engine nor another UI reader can be
 * changed through a snapshot. Use cloneSimulationState for an editable copy.
 */
export function createSimulationSnapshotCache() {
  const copies = new WeakMap<object, object>();
  const copy = <T>(value: T): T => {
    if (value === null || typeof value !== 'object') return value;
    const cached = copies.get(value);
    if (cached) return cached as T;
    const result = Array.isArray(value)
      ? value.map(item => copy(item))
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    Object.freeze(result);
    copies.set(value, result);
    return result as T;
  };
  return (state: SimulationState): SimulationState => copy(state);
}
