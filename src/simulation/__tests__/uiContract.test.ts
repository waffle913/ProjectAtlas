import { describe, it, expect } from 'vitest';
import { canPerformUIAction, isMutatingUIAction, UI_OWNERS } from '../ui/contract';
import { canViewMapLayer, isPrivateTabletSection, UI_DOMAINS, MAP_LAYERS } from '../ui/navigation';
import { canCommand, validateUICommand } from '../ui/commands';
import { validateConsequenceView, mayPause, GAMEPLAY_PATHS } from '../ui/frame';

describe('interface/state/navigation contract (0.33.1-0.33.9)', () => {
  it('names the engine as the sole source of truth and gates UI actions by authority', () => {
    expect(UI_OWNERS.state).toBe('engine');
    expect(canPerformUIAction('public_read', false)).toBe(true);
    expect(canPerformUIAction('authorized_read', false)).toBe(false);
    expect(canPerformUIAction('command', true)).toBe(true);
    expect(isMutatingUIAction('command')).toBe(true);
    expect(isMutatingUIAction('public_read')).toBe(false);
    expect(() => canPerformUIAction('magic' as never, true)).toThrow(/Unknown UI action kind/);
  });

  it('names the navigation shell and only shows available layers', () => {
    expect(UI_DOMAINS).toContain('politics');
    expect(MAP_LAYERS).toContain('economy');
    expect(canViewMapLayer('economy', true)).toBe(true);
    expect(canViewMapLayer('economy', false)).toBe(false);
    expect(isPrivateTabletSection('private_briefings')).toBe(true);
    expect(isPrivateTabletSection('news')).toBe(false);
  });

  it('authorizes commands only from the real office; unresolved fails closed', () => {
    expect(canCommand({ basis: 'head_of_government' })).toBe(true);
    expect(canCommand({ basis: 'unresolved' })).toBe(false);
    expect(() => validateUICommand({ id: 'c', domain: 'politics', mandate: { basis: 'unresolved' }, note: 'x' })).toThrow(/fails closed/);
  });

  it('explains consequences with uncertainty and pauses only on grave/urgent alerts', () => {
    expect(() => validateConsequenceView({ id: 'cv', decisionId: 'd', confidenceBps: 8000, explanation: 'x' })).not.toThrow();
    expect(() => validateConsequenceView({ id: 'cv', decisionId: 'd', confidenceBps: 20000, explanation: 'x' })).toThrow(/between 0 and 10000/);
    expect(mayPause('grave')).toBe(true);
    expect(mayPause('routine')).toBe(false);
    expect(GAMEPLAY_PATHS).toContain('governing');
  });
});
