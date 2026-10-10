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

/**
 * Canonical effective control of a Region, derived from the operations system
 * (regionControl + decisive strategic components). Sovereignty, occupation and
 * effective control stay distinct: `contested` means no single controller.
 */
export const effectiveRegionControl = (state: SimulationState, regionId: string): { controller?: string; contested: boolean } => {
  const control = state.operations?.regionControl?.[regionId];
  if (control === undefined) {
    // Operations not yet initialized for this Region: occupation-over-sovereignty proxy.
    return { controller: state.occupationByRegion[regionId]?.occupierCountryId ?? state.regionOwnership[regionId], contested: false };
  }
  if (control === 'contested') return { controller: undefined, contested: true };
  if (control === 'sovereign_controlled') return { controller: state.regionOwnership[regionId], contested: false };
  const controllers = [...new Set(
    Object.values(state.operations.components)
      .filter(component => component.regionId === regionId && component.kind === 'decisive')
      .map(component => component.controllingCountryId)
      .filter((value): value is string => Boolean(value)),
  )];
  if (controllers.length === 1) return { controller: controllers[0], contested: false };
  return { controller: state.occupationByRegion[regionId]?.occupierCountryId ?? state.regionOwnership[regionId], contested: true };
};
