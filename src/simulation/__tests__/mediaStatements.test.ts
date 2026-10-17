import { describe, it, expect } from 'vitest';
import {
  validateStatement, statementReach, STATEMENT_EFFECT, type Statement,
} from '../media/statements';

const statement = (over: Partial<Statement> = {}): Statement => ({
  id: 's1', actorId: 'party-a', actorKind: 'party', content: 'we support the reform',
  date: '2026-02-01', note: 'public statement',
  ...over,
});

describe('statements and political communication (0.32.3)', () => {
  it('is never a law and never mutates state', () => {
    expect(STATEMENT_EFFECT).toBe('none');
  });

  it('validates a statement and rejects malformed ones', () => {
    expect(() => validateStatement(statement())).not.toThrow();
    expect(() => validateStatement(statement({ actorKind: 'government' as never }))).toThrow(/Unknown statement actor kind/);
    expect(() => validateStatement(statement({ content: '' }))).toThrow(/non-empty content/);
    expect(() => validateStatement(statement({ date: 'bad' }))).toThrow(/valid simulation date/);
  });

  it('bounds reach by credibility and audience interest; unknown inputs are never zero', () => {
    expect(statementReach(6000, 8000)).toEqual({ status: 'computed', reachBps: 6000 });
    expect(statementReach(8000, 4000)).toEqual({ status: 'computed', reachBps: 4000 });
    expect(statementReach(null, 8000)).toEqual({ status: 'unavailable', reachBps: null });
    expect(statementReach(6000, null)).toEqual({ status: 'unavailable', reachBps: null });
    expect(() => statementReach(20000, 8000)).toThrow(/between 0 and 10000/);
  });
});
