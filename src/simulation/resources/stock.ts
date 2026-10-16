/**
 * 0.27.7 — Resources/energy V1: stocks and physical trade.
 *
 * Pure stock-ledger contract (docs/resources-0.27.md) that reconciles to the
 * canonical `TradeStock` (state.trade.countries[countryId].markets[category].stock)
 * — the sole physical stock store. No second store, no new canonical state, no
 * scheduler, no RNG, no migration.
 *
 * Contract:
 * - conservation: opening + produced + received === consumed + exported + closing,
 *   exactly (no net creation or destruction by accounting);
 * - no negative stock: consumption is bounded by the available closing stock;
 *   the shortfall is a shortage, never a negative quantity;
 * - substitution across resources is allowed only when explicitly authorized
 *   (`substitution` gate is undecided → not in scope);
 * - `null` capacity is unavailable, never a fabricated zero.
 */

import { isWholeUsd } from '../finance/settlement';

export interface StockLedger {
  readonly opening: number;
  readonly produced: number;
  readonly received: number;
  readonly consumed: number;
  readonly exported: number;
  readonly closing: number;
  /** Storage capacity; null = unavailable. */
  readonly capacity: number | null;
}

export function validateStock(s: StockLedger): void {
  const values = [s.opening, s.produced, s.received, s.consumed, s.exported, s.closing];
  for (const value of values) {
    if (!isWholeUsd(value)) throw new Error('Stock quantities must be non-negative whole numbers.');
  }
  if (s.capacity !== null && (!isWholeUsd(s.capacity))) throw new Error('Stock capacity must be a non-negative whole number or null.');
  if (s.capacity !== null && s.closing > s.capacity) throw new Error('Closing stock cannot exceed capacity.');
  const inflows = s.opening + s.produced + s.received;
  const outflows = s.consumed + s.exported + s.closing;
  if (inflows !== outflows) throw new Error(`Stock does not conserve: inflows ${inflows} != outflows ${outflows}.`);
}

/** Available stock (whole quantity). */
export const stockAvailable = (s: StockLedger): number => s.closing;

/** Shortage = max(0, need - available); never negative. */
export function shortage(need: number, available: number): number {
  if (!isWholeUsd(need) || !isWholeUsd(available)) throw new Error('Need and available must be non-negative whole quantities.');
  return Math.max(0, need - available);
}

export interface ConsumptionResult {
  readonly ledger: StockLedger;
  readonly consumed: number;
  readonly shortage: number;
}

/** Consume up to `amount` from the closing stock, never below zero; the shortfall is a shortage. */
export function consumeFromStock(s: StockLedger, amount: number): ConsumptionResult {
  validateStock(s);
  if (!isWholeUsd(amount)) throw new Error('Consumption amount must be a non-negative whole quantity.');
  const consumed = Math.min(amount, s.closing);
  const short = amount - consumed;
  return {
    ledger: { ...s, consumed: s.consumed + consumed, closing: s.closing - consumed },
    consumed,
    shortage: short,
  };
}

/** Open design gate: cross-resource substitution is not decided and stays out of scope. */
export const STOCK_SUBSTITUTION = Object.freeze({
  id: 'stock_substitution',
  status: 'undecided' as const,
  question: 'Is cross-resource substitution modelled, with which causal rules and legal powers?',
  note: 'Until decided, substitution is unavailable — a shortage is a shortage, never a silent replacement.',
});

export const isSubstitutionInScope = (): boolean => STOCK_SUBSTITUTION.status === 'decided';
