import { describe, it, expect } from 'vitest';
import {
  validateGovernmentObjective, OBJECTIVE_OWNERS, type GovernmentObjective,
} from '../media/governmentObjective';
import {
  validateActionChoice, selectAction, type ActionChoice,
} from '../media/actionSelection';

const objective = (over: Partial<GovernmentObjective> = {}): GovernmentObjective => ({
  id: 'g1', countryId: 'country-a', issueId: 'income_security', priorityBps: 7000,
  ideologicalBasis: 'modelled', limitation: 'modelled from party platform',
  ...over,
});
const choice = (over: Partial<ActionChoice> = {}): ActionChoice => ({
  id: 'c1', optionId: 'opt-a', expectedNetBps: 500, confidenceBps: 8000, ...over,
});

describe('government objective and action selection (0.32.6/0.32.7)', () => {
  it('names canonical owners and validates an objective', () => {
    expect(OBJECTIVE_OWNERS.ideology).toBe('politics');
    expect(OBJECTIVE_OWNERS.mandate).toBe('governance');
    expect(() => validateGovernmentObjective(objective())).not.toThrow();
    expect(() => validateGovernmentObjective(objective({ priorityBps: 20000 }))).toThrow(/between 0 and 10000/);
    expect(() => validateGovernmentObjective(objective({ ideologicalBasis: 'omniscient' as never }))).toThrow(/Unknown ideological basis/);
  });

  it('selects deterministically by expected value x confidence, ties by id', () => {
    expect(selectAction([choice(), choice({ id: 'c2', optionId: 'opt-b', expectedNetBps: 300, confidenceBps: 9000 })])).toBe('c1');
    expect(selectAction([choice({ id: 'b', expectedNetBps: 500, confidenceBps: 8000 }), choice({ id: 'a', expectedNetBps: 500, confidenceBps: 8000 })])).toBe('a'); // tie → lower id
  });

  it('excludes unavailable choices and chooses not to act when nothing is positive', () => {
    expect(selectAction([choice({ expectedNetBps: null })])).toBeNull();
    expect(selectAction([choice({ expectedNetBps: -500 })])).toBeNull();
    expect(selectAction([])).toBeNull();
    expect(() => selectAction([choice(), choice()])).toThrow(/Duplicate action choice id/);
  });
});
