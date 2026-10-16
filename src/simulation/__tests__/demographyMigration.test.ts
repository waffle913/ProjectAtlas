import { describe, it, expect } from 'vitest';
import {
  validateMigrationFlow, netMigration, applyMigration, type MigrationFlow,
} from '../demography/migration';

const flow = (over: Partial<MigrationFlow> = {}): MigrationFlow => ({
  id: 'm1', originId: 'country-a', destinationId: 'country-b', count: 100, date: '2026-02-01',
  ...over,
});

describe('international migration (0.30.3)', () => {
  it('validates a flow and rejects malformed ones', () => {
    expect(() => validateMigrationFlow(flow())).not.toThrow();
    expect(() => validateMigrationFlow(flow({ originId: 'country-b' }))).toThrow(/distinct origin and destination/);
    expect(() => validateMigrationFlow(flow({ count: 0 }))).toThrow(/positive whole number/);
  });

  it('computes net migration without double-counting', () => {
    const flows = [flow(), flow({ id: 'm2', originId: 'country-b', destinationId: 'country-a', count: 40 })];
    expect(netMigration(flows, 'country-a')).toBe(-60); // entries 40 - exits 100
    expect(netMigration(flows, 'country-b')).toBe(60);
  });

  it('applies migration with conservation; origin never negative', () => {
    expect(applyMigration(1000, 500, flow())).toEqual({ origin: 900, destination: 600 });
    expect(() => applyMigration(50, 500, flow({ count: 100 }))).toThrow(/negative/);
  });
});
