/**
 * 0.28.6 — Industry V1: diffusion and adoption.
 *
 * Pure technology-adoption contract (docs/industry-0.28.md). Adoption advances
 * through training, investment, equipment replacement and time; it affects
 * material processes, never a global GDP bonus. No new canonical state, no
 * scheduler, no RNG, no migration.
 */

import { isWholeUsd } from '../finance/settlement';

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

/** Advance adoption bounded by investment, equipment and the 10,000 bps ceiling. */
export function advanceAdoption(a: TechnologyAdoption): { adoptionBps: number; steps: number; investmentSpent: number } {
  validateAdoption(a);
  const steps = Math.min(investmentSteps(a), equipmentSteps(a));
  const room = Math.max(0, 10000 - a.adoptionBps);
  const applicable = Math.min(steps, Math.ceil(room / a.diffusionBpsPerStep));
  return {
    adoptionBps: Math.min(10000, a.adoptionBps + applicable * a.diffusionBpsPerStep),
    steps: applicable,
    investmentSpent: applicable * a.investmentPerStep,
  };
}
