/**
 * 0.30.3 — Demography/migration V2: international migration.
 *
 * Pure migration contract (docs/demography-0.30.md). A migration flow moves
 * people from an origin to a destination with conservation; migration never
 * changes sovereignty. No new canonical state, no scheduler, no RNG, no
 * migration.
 */

import { isWholeUsd } from '../finance/settlement';
import { isSimulationDate } from '../date';

export interface MigrationFlow {
  readonly id: string;
  readonly originId: string;
  readonly destinationId: string;
  readonly count: number;
  readonly date: string;
}

export function validateMigrationFlow(m: MigrationFlow): void {
  if (!m || typeof m.id !== 'string' || !m.id.trim()) throw new Error('Migration flow needs a non-empty id.');
  if (typeof m.originId !== 'string' || !m.originId.trim()) throw new Error('Migration flow needs a non-empty origin id.');
  if (typeof m.destinationId !== 'string' || !m.destinationId.trim()) throw new Error('Migration flow needs a non-empty destination id.');
  if (m.originId === m.destinationId) throw new Error('Migration flow needs distinct origin and destination.');
  if (!isWholeUsd(m.count) || m.count <= 0) throw new Error('count must be a positive whole number.');
  if (!isSimulationDate(m.date)) throw new Error('Migration date must be a valid simulation date.');
}

/** Net migration for a country: entries (destination) minus exits (origin). Never double-counts. */
export function netMigration(flows: readonly MigrationFlow[], countryId: string): number {
  let net = 0;
  for (const f of flows) {
    validateMigrationFlow(f);
    if (f.destinationId === countryId) net += f.count;
    if (f.originId === countryId) net -= f.count;
  }
  return net;
}

/** Apply one flow to origin/destination populations with conservation; origin never goes negative. */
export function applyMigration(originPopulation: number, destinationPopulation: number, m: MigrationFlow): { origin: number; destination: number } {
  validateMigrationFlow(m);
  if (!isWholeUsd(originPopulation) || !isWholeUsd(destinationPopulation)) throw new Error('Populations must be non-negative whole numbers.');
  const origin = originPopulation - m.count;
  if (origin < 0) throw new Error('Migration would make the origin population negative.');
  return { origin, destination: destinationPopulation + m.count };
}
