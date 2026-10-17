/**
 * 0.30 — Demography V2 runtime integration over the single canonical population
 * owner (`state.socioeconomy`). Births/deaths and international migration are
 * applied as dated, deterministic, conserved population transitions; the nine
 * income×orientation cohorts are re-derived with `cohortsFor` (the sole 0.10
 * split) and the region economy is re-calibrated from its annual output
 * reference, so the socioeconomic invariants stay satisfied exactly.
 *
 * Modelling limitations (honest, not hidden):
 * - The 0.10 model fixes the cohort split from total population and couples
 *   population to the economy. A transition therefore re-derives the economy
 *   from the region's annual output reference; it does not incrementally age or
 *   redistribute the existing cohorts.
 * - A transition fails closed when the region carries reserved military/
 *   construction labour (the fixed-split re-calibration cannot preserve that
 *   reservation) or when its annual output reference is unavailable.
 * - No automatic birth/death/migration rates are invented here: the count and
 *   date of every transition are explicit inputs, never a fabricated rate.
 */

import type { SimulationState } from '../../types';
import { calibrate, cohortsFor, integer } from '../socioeconomy/model';
import { reservedPersonnel } from '../military/runtime';
import { constructionReservedPersonnel } from '../assets/workforce';
import { applyTransition, validateTransition, type DemographicTransition } from './transition';
import { applyMigration, validateMigrationFlow, type MigrationFlow } from './migration';

function repopulate(state: SimulationState, regionId: string, population: number): SimulationState {
  integer(population);
  const region = state.socioeconomy.regions[regionId];
  if (!region) throw new Error('Unknown socioeconomic Region.');
  if (region.annualOutputReference === undefined) throw new Error('Region annual output reference unavailable; a population transition cannot re-derive the economy.');
  if (reservedPersonnel(state, regionId) + constructionReservedPersonnel(state, regionId) > 0) {
    throw new Error('A population transition requires a Region with no reserved military/construction labour (the fixed-split economy re-derivation cannot preserve reservations).');
  }
  const cohorts = cohortsFor(population);
  const economy = calibrate(population, region.annualOutputReference, cohorts);
  return {
    ...state,
    populationByRegion: { ...state.populationByRegion, [regionId]: population },
    socioeconomy: { ...state.socioeconomy, regions: { ...state.socioeconomy.regions, [regionId]: {
      ...region, population, cohorts, economy,
    } } },
  };
}

/** Apply a dated birth/death to the canonical population. Population never goes
 *  negative; total population changes by exactly the transition count. */
export function applyDemographicTransition(state: SimulationState, regionId: string, t: DemographicTransition): SimulationState {
  validateTransition(t);
  const region = state.socioeconomy.regions[regionId];
  if (!region) throw new Error('Unknown socioeconomic Region.');
  if (region.population === undefined) throw new Error('Region population unavailable; a transition cannot fabricate a population.');
  return repopulate(state, regionId, applyTransition(region.population, t));
}

/** Apply a dated, conserved international migration flow between two Regions.
 *  Origin never goes negative; total population across the two Regions is
 *  conserved exactly. Sovereignty is never changed. */
export function applyInternationalMigration(state: SimulationState, originRegionId: string, destinationRegionId: string, flow: MigrationFlow): SimulationState {
  validateMigrationFlow(flow);
  const origin = state.socioeconomy.regions[originRegionId];
  const destination = state.socioeconomy.regions[destinationRegionId];
  if (!origin || !destination) throw new Error('Unknown migration Region endpoint.');
  if (origin.population === undefined || destination.population === undefined) throw new Error('Migration endpoint population unavailable.');
  const result = applyMigration(
    { id: originRegionId, population: origin.population },
    { id: destinationRegionId, population: destination.population },
    flow,
  );
  return repopulate(repopulate(state, originRegionId, result.origin), destinationRegionId, result.destination);
}
