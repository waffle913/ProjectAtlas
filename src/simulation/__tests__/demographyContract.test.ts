import { describe, it, expect } from 'vitest';
import {
  DEMOGRAPHY_VERSION, POPULATION_COVERAGE, COHORT_STATUSES, POPULATION_OWNER,
  validateCohortContract, isObserved, type CohortContract,
} from '../demography/contract';

const c = (over: Partial<CohortContract> = {}): CohortContract => ({
  populationOwner: 'socioeconomy', cohortKey: 'low-left', status: 'resident', coverage: 'observed', note: 'n',
  ...over,
});

describe('demography cohort/transition contract (0.30.1)', () => {
  it('declares the version, owner, statuses and coverage', () => {
    expect(DEMOGRAPHY_VERSION).toBe('demography-0.30-v1');
    expect(POPULATION_OWNER).toBe('socioeconomy');
    expect(COHORT_STATUSES).toEqual(['resident', 'migrant_in', 'migrant_out', 'deceased', 'born']);
    expect(POPULATION_COVERAGE).toEqual(['observed', 'modelled', 'unavailable']);
  });

  it('validates a cohort contract and rejects malformed ones', () => {
    expect(() => validateCohortContract(c())).not.toThrow();
    expect(() => validateCohortContract(c({ cohortKey: '' }))).toThrow(/non-empty cohort key/);
    expect(() => validateCohortContract(c({ populationOwner: 'trade' as never }))).toThrow(/socioeconomy/);
    expect(() => validateCohortContract(c({ status: 'zombie' as never }))).toThrow(/Unknown cohort status/);
  });

  it('distinguishes observed from modelled (never conflated)', () => {
    expect(isObserved(c())).toBe(true);
    expect(isObserved(c({ coverage: 'modelled' }))).toBe(false);
  });
});
