import type { SimulationState } from '../../types';

/**
 * Sum of construction workers reserved from a Region's labour force across all
 * projects sited in that Region. A reserved worker is never simultaneously a
 * civilian employee or a military reservist (no worker employed twice): the
 * workforce reconciliation subtracts this total alongside the military
 * reservation from the regional labour force.
 *
 * Pure and side-effect-free so that both the assets runtime and the military
 * runtime/invariant can use it without an import cycle.
 */
export const constructionReservedPersonnel = (state: SimulationState, regionId: string): number => {
  let total = 0;
  for (const project of Object.values(state.assets?.projects ?? {})) {
    if (project.regionId === regionId && project.reservedWorkers !== undefined && (project.status === 'active' || project.status === 'paused')) {
      total += project.reservedWorkers;
    }
  }
  return total;
};
