import { describe, it, expect } from 'vitest';
import { applyTransition, applyMove, type DemographicTransition, type PopulationMove } from '../demography/transition';
import { netMigration, applyMigration, type MigrationFlow } from '../demography/migration';
import { validateLegalStatusRule, assessIntegration, type LegalStatusRule } from '../demography/legalStatus';
import { canDirectPolice, validatePoliceOrder, deployPolice, type PoliceOrder } from '../security/police';

describe('0.30.9 — demography/security interconnections (contract level)', () => {
  it('conserves population across births, deaths, internal moves and migration', () => {
    const birth: DemographicTransition = { id: 'b1', cohortKey: 'cohort-a', kind: 'birth', count: 10, date: '2026-02-01' };
    const death: DemographicTransition = { id: 'd1', cohortKey: 'cohort-a', kind: 'death', count: 5, date: '2026-02-01' };
    const afterBirth = applyTransition(100, birth);
    const afterDeath = applyTransition(afterBirth, death);
    expect(afterDeath).toBe(105);

    const move: PopulationMove = { id: 'mv1', originCohortKey: 'cohort-a', destinationCohortKey: 'cohort-b', count: 20, date: '2026-02-01' };
    const moved = applyMove(afterDeath, 50, move);
    expect(moved.origin + moved.destination).toBe(afterDeath + 50); // an internal move never creates/destroys population

    const flow: MigrationFlow = { id: 'f1', originId: 'country-a', destinationId: 'country-b', count: 15, date: '2026-02-01' };
    const migrated = applyMigration({ id: 'country-a', population: moved.origin }, { id: 'country-b', population: 40 }, flow);
    expect(migrated.origin + migrated.destination).toBe(moved.origin + 40); // migration conserves population across endpoints
    expect(netMigration([flow], 'country-a')).toBe(-15);
    expect(netMigration([flow], 'country-b')).toBe(15);
  });

  it('ties a documented legal status to service access and contextual integration', () => {
    const rule: LegalStatusRule = {
      id: 'r1', countryId: 'country-a', kind: 'residence', basis: 'documented_law',
      legalInstrumentRef: 'law:residence', serviceAccess: ['health', 'education'], note: 'documented residence law',
    };
    expect(() => validateLegalStatusRule(rule)).not.toThrow();
    // 4000 (60 months residence) + 3000 (employed) + 1000 (2 of 6 service families) = 8000 bps.
    expect(assessIntegration({ residenceMonths: 60, employed: true, serviceAccessCount: 2 }).indexBps).toBe(8000);
  });

  it('gates police orders on the office and never fabricates a shortage for unavailable stations', () => {
    expect(canDirectPolice({ basis: 'head_of_government' })).toBe(true);
    expect(canDirectPolice({ basis: 'unresolved' })).toBe(false);
    const order: PoliceOrder = {
      id: 'o1', countryId: 'country-a', regionId: 'region-1', kind: 'public_order',
      authority: { basis: 'head_of_government' }, emergencyPowersActive: false, date: '2026-02-01', note: 'maintain public order',
    };
    expect(() => validatePoliceOrder(order)).not.toThrow();
    expect(deployPolice({ id: 's1', regionId: 'region-1', personnel: null, status: 'operating' }, 10, 50)).toEqual({ status: 'unavailable', deployed: 0, backlog: null });
    expect(deployPolice({ id: 's2', regionId: 'region-1', personnel: 20, status: 'operating' }, 30, 50)).toEqual({ status: 'computed', deployed: 20, backlog: 10 });
  });
});
