import { describe, it, expect } from 'vitest';
import {
  validateResearchProject, isComplete, advanceResearch, type ResearchProject,
} from '../industry/research';

const project = (over: Partial<ResearchProject> = {}): ResearchProject => ({
  id: 'r1', subject: 'battery chemistry', durationMonths: 24, monthlySpending: 1000,
  researchersRequired: 5, riskBps: 1500, status: 'active', monthsElapsed: 0,
  ...over,
});

describe('industry research projects (0.28.5)', () => {
  it('validates a research project and rejects malformed ones', () => {
    expect(() => validateResearchProject(project())).not.toThrow();
    expect(() => validateResearchProject(project({ durationMonths: 0 }))).toThrow(/positive integer/);
    expect(() => validateResearchProject(project({ riskBps: 20000 }))).toThrow(/riskBps/);
    expect(() => validateResearchProject(project({ monthsElapsed: 30 }))).toThrow(/cannot exceed durationMonths/);
  });

  it('advances only with funding and researchers (no instant discovery from a budget)', () => {
    const r = advanceResearch(project(), 6, 1000, 5);
    expect(r.monthsAdvanced).toBe(6);
    expect(r.project.monthsElapsed).toBe(6);
    // No researchers -> no progress.
    expect(advanceResearch(project(), 6, 1000, 4).monthsAdvanced).toBe(0);
    // No funding -> no progress.
    expect(advanceResearch(project(), 6, 999, 5).monthsAdvanced).toBe(0);
  });

  it('completes only after the full schedule', () => {
    const r = advanceResearch(project(), 30, 1000, 5);
    expect(r.monthsAdvanced).toBe(24);
    expect(r.project.status).toBe('completed');
    expect(isComplete(r.project)).toBe(true);
  });

  it('does not advance a paused or planned project', () => {
    expect(advanceResearch(project({ status: 'paused' }), 6, 1000, 5).monthsAdvanced).toBe(0);
    expect(advanceResearch(project({ status: 'planned' }), 6, 1000, 5).monthsAdvanced).toBe(0);
  });

  it('rejects fractional funding or researchers', () => {
    expect(() => advanceResearch(project(), 6, 1.5, 5)).toThrow(/non-negative whole numbers/);
  });
});
