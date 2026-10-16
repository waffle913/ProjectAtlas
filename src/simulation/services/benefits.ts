/**
 * 0.29.6 — Public services V2: pensions and benefits.
 *
 * Pure benefit contract (docs/services-0.29.md). Benefits are paid per legal
 * eligibility to a documented eligible population, bounded by budget — neither
 * infinite automatic benefits nor invented exclusions. No new canonical state,
 * no scheduler, no RNG, no migration.
 */

import { isWholeUsd } from '../finance/settlement';

export type BenefitKind = 'pension' | 'incomeSupport';

export interface BenefitRule {
  readonly id: string;
  readonly kind: BenefitKind;
  /** Documented legal eligibility (never an invented exclusion). */
  readonly eligibilityNote: string;
  /** Whole-USD amount per recipient per month. */
  readonly monthlyAmountPerRecipient: number;
  /** Documented eligible population. */
  readonly eligiblePopulation: number;
  /** Whole-USD budget available this month. */
  readonly budgetAvailable: number;
}

export function validateBenefitRule(r: BenefitRule): void {
  if (!r || typeof r.id !== 'string' || !r.id.trim()) throw new Error('Benefit rule needs a non-empty id.');
  if (!['pension', 'incomeSupport'].includes(r.kind)) throw new Error(`Unknown benefit kind: ${String(r.kind)}.`);
  if (typeof r.eligibilityNote !== 'string' || !r.eligibilityNote.trim()) throw new Error('Benefit rule needs a documented eligibility note.');
  if (!isWholeUsd(r.monthlyAmountPerRecipient) || r.monthlyAmountPerRecipient <= 0) throw new Error('monthlyAmountPerRecipient must be a positive whole-USD amount.');
  if (!isWholeUsd(r.eligiblePopulation)) throw new Error('eligiblePopulation must be a non-negative whole number.');
  if (!isWholeUsd(r.budgetAvailable)) throw new Error('budgetAvailable must be a non-negative whole-USD amount.');
}

export interface BenefitPayment {
  readonly recipients: number;
  readonly totalPaid: number;
  readonly shortfall: number;
}

/** Pay benefits bounded by budget; the unserved eligible population is a shortfall, never an invented exclusion. */
export function benefitPayments(r: BenefitRule): BenefitPayment {
  validateBenefitRule(r);
  const affordable = Math.floor(r.budgetAvailable / r.monthlyAmountPerRecipient);
  const recipients = Math.min(r.eligiblePopulation, affordable);
  return {
    recipients,
    totalPaid: recipients * r.monthlyAmountPerRecipient,
    shortfall: (r.eligiblePopulation - recipients) * r.monthlyAmountPerRecipient,
  };
}
