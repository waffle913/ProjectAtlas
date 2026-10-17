import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { newUrgentBriefingCount, visibleUrgentBriefingIds } from '../urgency';

type Briefing = { id: string; severity: 'info' | 'advisory' | 'important' | 'urgent'; access: 'public' | 'government' };

function stateWith(personId: string, countryId: string, briefings: Briefing[], withAccess: boolean): SimulationState {
  return {
    governance: {
      persons: {
        [personId]: {
          id: personId,
          status: 'active',
          office: {
            countryId,
            role: 'head_of_government',
            authorityProfile: { capabilities: withAccess ? ['access_government_information'] : [] },
          },
        },
      },
    },
    information: {
      briefings: briefings.map(briefing => ({ ...briefing, countryId })),
    },
  } as unknown as SimulationState;
}

describe('urgency / interruption policy', () => {
  it('exposes only urgent briefings the office can see', () => {
    const state = stateWith('p1', 'c1', [
      { id: 'b1', severity: 'urgent', access: 'government' },
      { id: 'b2', severity: 'important', access: 'government' },
    ], true);
    expect(visibleUrgentBriefingIds(state, 'c1', 'p1')).toEqual(['b1']);
  });

  it('hides government-only urgent briefings from an office without access', () => {
    const state = stateWith('p2', 'c1', [{ id: 'b1', severity: 'urgent', access: 'government' }], false);
    expect(visibleUrgentBriefingIds(state, 'c1', 'p2')).toEqual([]);
  });

  it('detects a newly-appeared urgent briefing', () => {
    const before = stateWith('p1', 'c1', [], true);
    const after = stateWith('p1', 'c1', [{ id: 'b1', severity: 'urgent', access: 'government' }], true);
    expect(newUrgentBriefingCount(before, after, 'c1', 'p1')).toBe(1);
  });

  it('does not re-flag an urgent briefing that was already visible', () => {
    const briefings = [{ id: 'b1', severity: 'urgent' as const, access: 'government' as const }];
    const before = stateWith('p1', 'c1', briefings, true);
    const after = stateWith('p1', 'c1', briefings, true);
    expect(newUrgentBriefingCount(before, after, 'c1', 'p1')).toBe(0);
  });

  it('ignores non-urgent briefings', () => {
    const before = stateWith('p1', 'c1', [], true);
    const after = stateWith('p1', 'c1', [{ id: 'b1', severity: 'important', access: 'government' }], true);
    expect(newUrgentBriefingCount(before, after, 'c1', 'p1')).toBe(0);
  });
});
