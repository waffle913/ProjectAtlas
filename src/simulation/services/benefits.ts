/**
 * 0.29.6 — Public services V2: pensions and benefits.
 *
 * Pure benefit contract (docs/services-0.29.md). Benefits are paid per legal
 * eligibility to a documented eligible population, bounded by budget — neither
 * infinite automatic benefits nor invented exclusions. No new canonical state,
 * no scheduler, no RNG, no migration.
 *
 * A rule references an enacted legal basis (a proposal/law id); an eligibility
 * note alone is not a legal entitlement. This is a *planning* computation: it
 * reports what would be paid within the available budget and the remaining
 * budget, so the fiscal/cohort mutation (0.11 fiscal, 0.10 income) is committed
 * atomically by the engine orchestrator, never double-paid here.
 */

import { isWholeUsd } from '../finance/settlement';
import { checkedMul, checkedSub } from '../safeMath';

export type BenefitKind = 'pension' | 'incomeSupport';

export interface BenefitRule {
  readonly id: string;
  readonly kind: BenefitKind;
  /** Enacted law/proposal that confers the entitlement (0.14/0.22 governance). */
  readonly legalBasisId: string;
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
  if (typeof r.legalBasisId !== 'string' || !r.legalBasisId.trim()) throw new Error('Benefit rule needs a non-empty legal basis id (an enacted law/proposal).');
  if (typeof r.eligibilityNote !== 'string' || !r.eligibilityNote.trim()) throw new Error('Benefit rule needs a documented eligibility note.');
  if (!isWholeUsd(r.monthlyAmountPerRecipient) || r.monthlyAmountPerRecipient <= 0) throw new Error('monthlyAmountPerRecipient must be a positive whole-USD amount.');
  if (!isWholeUsd(r.eligiblePopulation)) throw new Error('eligiblePopulation must be a non-negative whole number.');
  if (!isWholeUsd(r.budgetAvailable)) throw new Error('budgetAvailable must be a non-negative whole-USD amount.');
}

export interface BenefitPayment {
  readonly recipients: number;
  readonly totalPaid: number;
  /** Budget remaining after the payment plan (for the orchestrator to commit atomically). */
  readonly remainingBudget: number;
  /** Whole-USD value of the unserved eligible population. */
  readonly shortfall: number;
}

/** Plan benefit payments bounded by budget; the unserved eligible population is a shortfall, never an invented exclusion. */
export function benefitPayments(r: BenefitRule): BenefitPayment {
  validateBenefitRule(r);
  const affordable = Math.floor(r.budgetAvailable / r.monthlyAmountPerRecipient);
  const recipients = Math.min(r.eligiblePopulation, affordable);
  const totalPaid = checkedMul(recipients, r.monthlyAmountPerRecipient);
  return {
    recipients,
    totalPaid,
    remainingBudget: checkedSub(r.budgetAvailable, totalPaid),
    shortfall: checkedMul(r.eligiblePopulation - recipients, r.monthlyAmountPerRecipient),
  };
}
