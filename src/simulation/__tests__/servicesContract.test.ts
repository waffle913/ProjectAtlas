import { describe, it, expect } from 'vitest';
import {
  SERVICES_VERSION, SERVICE_FAMILIES, ACCESS_BASES, SERVICE_OWNERS, REQUIRED_SERVICE_FAMILIES,
  SERVICE_DECISIONS, isRentRulesInScope,
} from '../services/contract';

describe('public services V2 contract (0.29.1)', () => {
  it('declares the version, families and access bases', () => {
    expect(SERVICES_VERSION).toBe('services-0.29-v1');
    expect(SERVICE_FAMILIES).toEqual(['health', 'education', 'pensions', 'incomeSupport', 'infrastructure', 'administration']);
    expect(ACCESS_BASES).toEqual(['right', 'office_authorized', 'universal']);
  });

  it('maps every service family to its canonical owners exactly once (no second budget/population)', () => {
    const families = SERVICE_OWNERS.map(e => e.family);
    expect(new Set(families).size).toBe(families.length);
    expect(families.slice().sort()).toEqual([...REQUIRED_SERVICE_FAMILIES].sort());
    for (const entry of SERVICE_OWNERS) {
      expect(entry.budgetOwner).toBe('fiscal');
      expect(entry.personnelOwner).toBe('socioeconomy');
      expect(entry.cohortOwner).toBe('socioeconomy');
      expect(entry.assetOwner).toBe('assets');
      expect(ACCESS_BASES).toContain(entry.accessBasis);
    }
  });

  it('keeps rent rules undecided (BLOCKED_DESIGN)', () => {
    expect(SERVICE_DECISIONS.map(d => d.id)).toEqual(['rent_rules']);
    expect(SERVICE_DECISIONS[0].status).toBe('undecided');
    expect(isRentRulesInScope()).toBe(false);
  });
});
