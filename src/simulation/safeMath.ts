/**
 * Checked whole-quantity / whole-USD arithmetic for pure contract primitives.
 *
 * Inputs are validated with `isWholeUsd` (non-negative safe integers) at the
 * boundary; sums and products must be re-checked at the exit because a product
 * of two safe integers can exceed `Number.MAX_SAFE_INTEGER`. Every helper fails
 * closed on overflow instead of silently losing integer precision.
 */

import { isWholeUsd } from './finance/settlement';

/** Non-negative addition; fails closed if the sum is not a safe whole number. */
export function checkedAdd(a: number, b: number): number {
  const r = a + b;
  if (!isWholeUsd(r)) throw new Error('Arithmetic overflow: sum is not a safe non-negative whole number.');
  return r;
}

/** Non-negative multiplication; fails closed if the product is not a safe whole number. */
export function checkedMul(a: number, b: number): number {
  const r = a * b;
  if (!isWholeUsd(r)) throw new Error('Arithmetic overflow: product is not a safe non-negative whole number.');
  return r;
}

/** Subtraction that may be negative; fails closed if the result is not a safe integer. */
export function checkedSub(a: number, b: number): number {
  const r = a - b;
  if (!Number.isSafeInteger(r)) throw new Error('Arithmetic underflow: difference is not a safe integer.');
  return r;
}
