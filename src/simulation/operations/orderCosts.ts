/**
 * 0.31.10 — Military V2: information, authorities and costs.
 *
 * Pure order-cost / information-access contract (docs/diplomacy-0.31.md). An
 * order has a real whole-USD cost and is funded only when committed funds cover
 * it (`unavailable != 0` — unknown funding is never assumed funded). Leaders
 * know only what their services and office can actually access: public
 * information is always accessible, office-level information requires the 0.15
 * government-information access, and intelligence (secret facts) additionally
 * requires that the services have provided it. Domestic/international
 * consequences are engine-level and deferred. No `SimulationState` integration,
 * no schema/migration, no scheduler, no RNG.
 */

import { isWholeUsd } from '../finance/settlement';
import { isSimulationDate } from '../date';

export const ORDER_COST_VERSION = 'order-cost-info-0.31-v1' as const;

export const ORDER_COST_OWNERS = Object.freeze({
  costs: 'military.ledger',      // 0.16 DefenseCosts
  information: 'information',    // 0.15 government information gating
  consequences: 'politics',      // 0.13 opinion (engine-level, deferred)
} as const);

export interface OrderCost {
  readonly id: string;
  /** Whole USD cost of the order. */
  readonly costUsd: number;
  /** Committed funds; null = unknown (never assumed funded). */
  readonly fundedUsd: number | null;
  readonly date: string;
  readonly note: string;
}

export function validateOrderCost(o: OrderCost): void {
  if (!o || typeof o.id !== 'string' || !o.id.trim()) throw new Error('Order cost needs a non-empty id.');
  if (!isWholeUsd(o.costUsd) || o.costUsd <= 0) throw new Error('costUsd must be a positive whole number.');
  if (o.fundedUsd !== null && !isWholeUsd(o.fundedUsd)) throw new Error('fundedUsd must be a non-negative whole number or null.');
  if (!isSimulationDate(o.date)) throw new Error('Order cost date must be a valid simulation date.');
  if (typeof o.note !== 'string' || !o.note.trim()) throw new Error('Order cost needs a note.');
}

/** Whether the order is funded; null = unknown funding (unavailable != 0). */
export function orderFunded(o: OrderCost): boolean | null {
  validateOrderCost(o);
  if (o.fundedUsd === null) return null;
  return o.fundedUsd >= o.costUsd;
}

export const INFO_ACCESS_LEVELS = Object.freeze(['public', 'office', 'intelligence'] as const);
export type InfoAccessLevel = typeof INFO_ACCESS_LEVELS[number];

export interface InformationAccess {
  readonly level: InfoAccessLevel;
  /** Whether the actor's office holds 0.15 government-information access. */
  readonly hasOfficeAccess: boolean;
  /** Whether the actor's services have actually provided this intelligence (secret facts ≠ public). */
  readonly intelligenceAvailable: boolean;
}

/** Leaders know what their services and office can access; intelligence is never auto-visible. */
export function canAccessMilitaryInformation(a: InformationAccess): boolean {
  if (!a || !INFO_ACCESS_LEVELS.includes(a.level)) throw new Error(`Unknown information access level: ${String(a?.level)}.`);
  if (typeof a.hasOfficeAccess !== 'boolean' || typeof a.intelligenceAvailable !== 'boolean') throw new Error('Access booleans must be provided.');
  switch (a.level) {
    case 'public': return true;
    case 'office': return a.hasOfficeAccess;
    case 'intelligence': return a.hasOfficeAccess && a.intelligenceAvailable;
    default: return false; // unreachable
  }
}
