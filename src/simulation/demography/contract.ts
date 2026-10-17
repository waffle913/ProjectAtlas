/**
 * 0.30.1 — Demography/migration V2: cohort and transition contracts.
 *
 * Vocabulary/accounting-contract milestone (parallel to 0.25.1/0.26.1/0.27.1/
 * 0.28.1/0.29.1). It reuses the single 0.10 population (nine income×orientation
 * cohorts) — never a second population — and names cohort transition statuses
 * and the observed/modelled distinction. No `SimulationState` integration, no
 * schema/migration, no scheduler, no RNG.
 */

export const DEMOGRAPHY_VERSION = 'demography-0.30-v1' as const;

export const POPULATION_COVERAGE = Object.freeze(['observed', 'modelled', 'unavailable'] as const);
export type PopulationCoverage = typeof POPULATION_COVERAGE[number];

export const COHORT_STATUSES = Object.freeze(['resident', 'migrant_in', 'migrant_out', 'deceased', 'born'] as const);
export type CohortStatus = typeof COHORT_STATUSES[number];

export interface CohortContract {
  readonly populationOwner: 'socioeconomy'; // the single 0.10 population, never a second
  readonly cohortKey: string;              // permanent cohort id (income×orientation)
  readonly status: CohortStatus;
  readonly coverage: PopulationCoverage;
  readonly note: string;
}

/** The one canonical population owner — cohorts are the nine 0.10 cohorts. */
export const POPULATION_OWNER = 'socioeconomy' as const;

export function validateCohortContract(c: CohortContract): void {
  if (!c || typeof c.cohortKey !== 'string' || !c.cohortKey.trim()) throw new Error('Cohort contract needs a non-empty cohort key.');
  if (c.populationOwner !== 'socioeconomy') throw new Error('Population owner must be socioeconomy (the single 0.10 population).');
  if (!COHORT_STATUSES.includes(c.status)) throw new Error(`Unknown cohort status: ${String(c.status)}.`);
  if (!POPULATION_COVERAGE.includes(c.coverage)) throw new Error(`Unknown coverage: ${String(c.coverage)}.`);
  if (typeof c.note !== 'string' || !c.note.trim()) throw new Error('Cohort contract needs a note.');
}

/** observed != modelled != unavailable: a modelled cohort is never presented as observed. */
export const isObserved = (c: CohortContract): boolean => c.coverage === 'observed';
