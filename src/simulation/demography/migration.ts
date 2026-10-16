/**
 * 0.30.3 — Demography/migration V2: international migration.
 *
 * Pure migration contract (docs/demography-0.30.md). A migration flow moves
 * people from an origin to a destination with conservation; migration never
 * changes sovereignty. No new canonical state, no scheduler, no RNG, no
 * migration.
 *
 * Flows are identified and must not be double-counted: a duplicate flow id in a
 * net-migration aggregate fails closed. Applying a flow requires the endpoints
 * (origin/destination ids) to match the flow, so a flow can never be applied to
 * the wrong populations.
 */

import { isWholeUsd } from '../finance/settlement';
import { isSimulationDate } from '../date';
import { checkedAdd, checkedSub } from '../safeMath';

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

/** Net migration for a country: entries (destination) minus exits (origin). Duplicate flow ids fail closed. */
export function netMigration(flows: readonly MigrationFlow[], countryId: string): number {
  if (typeof countryId !== 'string' || !countryId.trim()) throw new Error('netMigration needs a non-empty country id.');
  const seen = new Set<string>();
  let net = 0;
  for (const f of flows) {
    validateMigrationFlow(f);
    if (seen.has(f.id)) throw new Error(`Duplicate migration flow id ${f.id}; a flow id must be counted at most once.`);
    seen.add(f.id);
    if (f.destinationId === countryId) {
      net += f.count;
      if (!Number.isSafeInteger(net)) throw new Error('Net migration overflowed the safe-integer range.');
    }
    if (f.originId === countryId) {
      net -= f.count;
      if (!Number.isSafeInteger(net)) throw new Error('Net migration overflowed the safe-integer range.');
    }
  }
  return net;
}

/** A population endpoint matched against a flow's origin or destination. */
export interface MigrationEndpoint {
  readonly id: string;
  readonly population: number;
}

/** Apply one flow to origin/destination endpoints with conservation; origin never goes negative. */
export function applyMigration(origin: MigrationEndpoint, destination: MigrationEndpoint, m: MigrationFlow): { origin: number; destination: number } {
  validateMigrationFlow(m);
  if (!origin || typeof origin.id !== 'string' || !origin.id.trim()) throw new Error('Origin endpoint needs a non-empty id.');
  if (!destination || typeof destination.id !== 'string' || !destination.id.trim()) throw new Error('Destination endpoint needs a non-empty id.');
  if (origin.id !== m.originId) throw new Error('Origin endpoint id does not match the flow origin.');
  if (destination.id !== m.destinationId) throw new Error('Destination endpoint id does not match the flow destination.');
  if (!isWholeUsd(origin.population) || !isWholeUsd(destination.population)) throw new Error('Populations must be non-negative whole numbers.');
  const newOrigin = checkedSub(origin.population, m.count);
  if (newOrigin < 0) throw new Error('Migration would make the origin population negative.');
  return { origin: newOrigin, destination: checkedAdd(destination.population, m.count) };
}
