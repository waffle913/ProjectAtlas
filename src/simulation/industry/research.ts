/**
 * 0.28.5 — Industry V1: research projects.
 *
 * Pure research-project contract (docs/industry-0.28.md). A research project
 * advances only with schedule, funding and researchers; there is no instant
 * discovery caused by a budget, and risk is a documented/modelled bps figure,
 * never a hidden random roll. No new canonical state, no scheduler, no RNG, no
 * migration.
 */

import { isWholeUsd } from '../finance/settlement';

export type ResearchStatus = 'planned' | 'active' | 'paused' | 'completed';

export interface ResearchProject {
  readonly id: string;
  readonly subject: string;
  readonly durationMonths: number;
  /** Whole-USD required spending per month. */
  readonly monthlySpending: number;
  /** Researchers required (persons). */
  readonly researchersRequired: number;
  /** Documented/modelled failure risk in bps (0–10,000). */
  readonly riskBps: number;
  readonly status: ResearchStatus;
  readonly monthsElapsed: number;
}

export function validateResearchProject(p: ResearchProject): void {
  if (!p || typeof p.id !== 'string' || !p.id.trim()) throw new Error('Research project needs a non-empty id.');
  if (typeof p.subject !== 'string' || !p.subject.trim()) throw new Error('Research project needs a non-empty subject.');
  if (!Number.isInteger(p.durationMonths) || p.durationMonths <= 0) throw new Error('durationMonths must be a positive integer.');
  if (!isWholeUsd(p.monthlySpending)) throw new Error('monthlySpending must be a non-negative whole-USD amount.');
  if (!isWholeUsd(p.researchersRequired)) throw new Error('researchersRequired must be a non-negative whole number.');
  if (!Number.isInteger(p.riskBps) || p.riskBps < 0 || p.riskBps > 10000) throw new Error('riskBps must be an integer in [0, 10000].');
  if (!['planned', 'active', 'paused', 'completed'].includes(p.status)) throw new Error(`Unknown status: ${String(p.status)}.`);
  if (!isWholeUsd(p.monthsElapsed)) throw new Error('monthsElapsed must be a non-negative whole number.');
  if (p.monthsElapsed > p.durationMonths) throw new Error('monthsElapsed cannot exceed durationMonths.');
}

/** Completion is schedule-only: a project completes when its full duration has elapsed. */
export const isComplete = (p: ResearchProject): boolean => p.monthsElapsed >= p.durationMonths;

export interface ResearchProgress {
  readonly project: ResearchProject;
  readonly monthsAdvanced: number;
}

/**
 * Advance a project by up to `months`, bounded by funding and researchers. No
 * funding or no researchers -> no progress (no instant discovery from a budget).
 */
export function advanceResearch(p: ResearchProject, months: number, fundedMonthlySpending: number, availableResearchers: number): ResearchProgress {
  validateResearchProject(p);
  if (!isWholeUsd(months) || months <= 0) throw new Error('Months must be a positive whole number.');
  if (!isWholeUsd(fundedMonthlySpending) || !isWholeUsd(availableResearchers)) throw new Error('Funding and researchers must be non-negative whole numbers.');
  if (p.status !== 'active') return { project: p, monthsAdvanced: 0 };
  const fundingOk = fundedMonthlySpending >= p.monthlySpending;
  const researchersOk = availableResearchers >= p.researchersRequired;
  if (!fundingOk || !researchersOk) return { project: p, monthsAdvanced: 0 };
  const advanced = Math.min(months, p.durationMonths - p.monthsElapsed);
  const monthsElapsed = p.monthsElapsed + advanced;
  return {
    project: { ...p, monthsElapsed, status: monthsElapsed >= p.durationMonths ? 'completed' : 'active' },
    monthsAdvanced: advanced,
  };
}
