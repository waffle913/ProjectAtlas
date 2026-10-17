/**
 * 0.28.6 — Industry V1: diffusion and adoption.
 *
 * Pure technology-adoption contract (docs/industry-0.28.md). Adoption advances
 * through training, investment, equipment replacement and time; it affects
 * material processes, never a global GDP bonus. No new canonical state, no
 * scheduler, no RNG, no migration.
 *
 * Adoption can never be free or instant: a record must carry at least one real
 * causal constraint (a positive investment per step or a positive equipment
 * requirement per step), and each step actually consumes that investment and
 * equipment. There is no multi-period jump without a verifiable, funded step.
 */

import { isWholeUsd } from '../finance/settlement';
import { checkedAdd, checkedMul } from '../safeMath';

export interface TechnologyAdoption {
  readonly id: string;
  readonly technologyId: string;
  /** Current adoption in bps (0–10,000). */
  readonly adoptionBps: number;
  /** Whole-USD investment required to advance one step. */
  readonly investmentPerStep: number;
  /** Equipment (product id -> quantity) required per step. */
  readonly equipmentPerStep: Readonly<Record<string, number>>;
  /** Adoption gain in bps per funded step. */
  readonly diffusionBpsPerStep: number;
  /** Whole-USD investment available this period. */
  readonly fundedInvestment: number;
  readonly availableEquipment: Readonly<Record<string, number>>;
}

export function validateAdoption(a: TechnologyAdoption): void {
  if (!a || typeof a.id !== 'string' || !a.id.trim()) throw new Error('Adoption needs a non-empty id.');
  if (typeof a.technologyId !== 'string' || !a.technologyId.trim()) throw new Error('Adoption needs a non-empty technology id.');
  if (!Number.isInteger(a.adoptionBps) || a.adoptionBps < 0 || a.adoptionBps > 10000) throw new Error('adoptionBps must be an integer in [0, 10000].');
  if (!isWholeUsd(a.investmentPerStep)) throw new Error('investmentPerStep must be a non-negative whole-USD amount.');
  for (const [id, qty] of Object.entries(a.equipmentPerStep)) {
    if (!id.trim()) throw new Error('Equipment needs non-empty product ids.');
    if (!isWholeUsd(qty)) throw new Error(`Equipment ${id} must be a non-negative whole quantity.`);
  }
  if (!Number.isInteger(a.diffusionBpsPerStep) || a.diffusionBpsPerStep <= 0 || a.diffusionBpsPerStep > 10000) throw new Error('diffusionBpsPerStep must be an integer in (0, 10000].');
  if (!isWholeUsd(a.fundedInvestment)) throw new Error('fundedInvestment must be a non-negative whole-USD amount.');
  for (const [id, qty] of Object.entries(a.availableEquipment)) {
    if (!id.trim()) throw new Error('Available equipment needs non-empty product ids.');
    if (!isWholeUsd(qty)) throw new Error(`Available equipment ${id} must be a non-negative whole quantity.`);
  }
  // A5: at least one causal constraint is required; otherwise adoption is free.
  const hasCost = a.investmentPerStep > 0;
  const hasEquipment = Object.values(a.equipmentPerStep).some((q) => q > 0);
  if (!hasCost && !hasEquipment) throw new Error('Adoption needs at least one causal constraint: a positive investmentPerStep or a positive equipment requirement.');
}

/** Steps feasible from funded investment; Infinity when investment is not a binding constraint. */
export const investmentSteps = (a: TechnologyAdoption): number => (a.investmentPerStep > 0 ? Math.floor(a.fundedInvestment / a.investmentPerStep) : Infinity);

/** Steps feasible from available equipment; Infinity when equipment is not a binding constraint. */
export function equipmentSteps(a: TechnologyAdoption): number {
  let steps = Infinity;
  for (const [id, perStep] of Object.entries(a.equipmentPerStep)) {
    if (perStep === 0) continue;
    steps = Math.min(steps, Math.floor((a.availableEquipment[id] ?? 0) / perStep));
  }
  return steps;
}

export interface AdoptionResult {
  readonly adoptionBps: number;
  readonly steps: number;
  readonly investmentSpent: number;
  /** Equipment actually consumed (product id -> quantity). */
  readonly equipmentSpent: Readonly<Record<string, number>>;
}

/** Advance adoption bounded by investment, equipment and the 10,000 bps ceiling; each step consumes real resources. */
export function advanceAdoption(a: TechnologyAdoption): AdoptionResult {
  validateAdoption(a);
  const steps = Math.min(investmentSteps(a), equipmentSteps(a));
  const room = Math.max(0, 10000 - a.adoptionBps);
  const applicable = Math.min(steps, Math.ceil(room / a.diffusionBpsPerStep));
  const equipmentSpent = Object.fromEntries(
    Object.entries(a.equipmentPerStep).filter(([, qty]) => qty > 0).map(([id, qty]) => [id, checkedMul(applicable, qty)]),
  );
  return {
    adoptionBps: Math.min(10000, checkedAdd(a.adoptionBps, checkedMul(applicable, a.diffusionBpsPerStep))),
    steps: applicable,
    investmentSpent: checkedMul(applicable, a.investmentPerStep),
    equipmentSpent,
  };
}
