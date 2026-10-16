/**
 * 0.28.7 — Industry V1: military/civilian technology.
 *
 * Pure technology-link contract (docs/industry-0.28.md). A technology links to
 * the production capacity of equipment/goods (0.16 military, 0.24 assets, 0.25
 * production); it never directly changes military readiness — that stays in
 * 0.31. No new canonical state, no scheduler, no RNG, no migration.
 */

import { isWholeUsd } from '../finance/settlement';

export type TechnologyDomain = 'military' | 'civilian';

export interface TechnologyLink {
  readonly id: string;
  readonly technologyId: string;
  readonly domain: TechnologyDomain;
  /** The equipment/goods whose production capacity the technology affects. */
  readonly targetProductId: string;
  /** Capacity multiplier in bps; 10,000 = no change, <10,000 reduces, >10,000 improves. */
  readonly capacityMultiplierBps: number;
}

export function validateTechnologyLink(l: TechnologyLink): void {
  if (!l || typeof l.id !== 'string' || !l.id.trim()) throw new Error('Technology link needs a non-empty id.');
  if (typeof l.technologyId !== 'string' || !l.technologyId.trim()) throw new Error('Technology link needs a non-empty technology id.');
  if (!['military', 'civilian'].includes(l.domain)) throw new Error(`Unknown domain: ${String(l.domain)}.`);
  if (typeof l.targetProductId !== 'string' || !l.targetProductId.trim()) throw new Error('Technology link needs a non-empty target product id.');
  if (!Number.isInteger(l.capacityMultiplierBps) || l.capacityMultiplierBps < 0) throw new Error('capacityMultiplierBps must be a non-negative integer bps.');
}

/**
 * Apply the technology effect to a production capacity (units/month). This is a
 * material production-capacity effect, never a military-readiness change.
 * `null` capacity stays null (unavailable).
 */
export function applyCapacityEffect(baseCapacityPerMonth: number | null, capacityMultiplierBps: number): number | null {
  if (capacityMultiplierBps < 0 || !Number.isInteger(capacityMultiplierBps)) throw new Error('capacityMultiplierBps must be a non-negative integer bps.');
  if (baseCapacityPerMonth === null) return null;
  if (!isWholeUsd(baseCapacityPerMonth)) throw new Error('Base capacity must be a non-negative whole number or null.');
  return Math.floor((baseCapacityPerMonth * capacityMultiplierBps) / 10000);
}
