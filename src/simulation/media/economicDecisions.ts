/**
 * 0.32.8 — Media V2: economic and social decisions.
 *
 * Pure economic-decision contract (docs/media-0.32.md). An AI government's
 * economic/social decision uses the canonical fiscal finances and available
 * information; it is affordable only when committed funds cover the required
 * cost (`unavailable != 0` — unknown funds are never assumed available). No
 * `SimulationState` integration, no schema/migration, no scheduler, no RNG.
 */

import { isWholeUsd } from '../finance/settlement';
import { isSimulationDate } from '../date';

export const ECONOMIC_DECISION_OWNERS = Object.freeze({
  finances: 'fiscal',        // 0.11 budget
  employment: 'socioeconomy', // 0.25 employment
  services: 'services',      // 0.29 public services
  resources: 'resources',    // 0.27 resources
} as const);

export interface EconomicDecision {
  readonly id: string;
  readonly countryId: string;
  /** Whole USD required; null = unavailable. */
  readonly requiredFundsUsd: number | null;
  /** Whole USD available (uncommitted) for the decision; null = unavailable. */
  readonly availableFundsUsd: number | null;
  readonly informationBasis: 'sourced' | 'modelled' | 'unavailable';
  readonly date: string;
  readonly note: string;
}

export function validateEconomicDecision(d: EconomicDecision): void {
  if (!d || typeof d.id !== 'string' || !d.id.trim()) throw new Error('Economic decision needs a non-empty id.');
  if (typeof d.countryId !== 'string' || !d.countryId.trim()) throw new Error('Economic decision needs a non-empty country id.');
  if (d.requiredFundsUsd !== null && (!isWholeUsd(d.requiredFundsUsd) || d.requiredFundsUsd <= 0)) throw new Error('requiredFundsUsd must be a positive whole number or null.');
  if (d.availableFundsUsd !== null && !isWholeUsd(d.availableFundsUsd)) throw new Error('availableFundsUsd must be a non-negative whole number or null.');
  if (!['sourced', 'modelled', 'unavailable'].includes(d.informationBasis)) throw new Error(`Unknown information basis: ${String(d.informationBasis)}.`);
  if (!isSimulationDate(d.date)) throw new Error('Economic decision date must be a valid simulation date.');
  if (typeof d.note !== 'string' || !d.note.trim()) throw new Error('Economic decision needs a note.');
}

/** Whether the decision is affordable; null = unknown funds (unavailable != 0). */
export function canAffordDecision(d: EconomicDecision): boolean | null {
  validateEconomicDecision(d);
  if (d.requiredFundsUsd === null || d.availableFundsUsd === null) return null;
  return d.availableFundsUsd >= d.requiredFundsUsd;
}
