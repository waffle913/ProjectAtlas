import { describe, it, expect } from 'vitest';
import {
  validateEconomicDecision, canAffordDecision, ECONOMIC_DECISION_OWNERS, type EconomicDecision,
} from '../media/economicDecisions';
import {
  validateGraduatedResponse, selectResponse, type GraduatedResponse,
} from '../media/diplomacyAI';

const decision = (over: Partial<EconomicDecision> = {}): EconomicDecision => ({
  id: 'd1', countryId: 'country-a', requiredFundsUsd: 1000, availableFundsUsd: 1500,
  informationBasis: 'modelled', date: '2026-02-01', note: 'service expansion',
  ...over,
});
const response = (over: Partial<GraduatedResponse> = {}): GraduatedResponse => ({
  id: 'r1', severity: 'moderate', responseKind: 'condemn', informationBasis: 'modelled', note: 'graduated',
  ...over,
});

describe('economic decisions and graduated responses (0.32.8/0.32.9)', () => {
  it('names canonical owners and funds a decision only from real committed funds', () => {
    expect(ECONOMIC_DECISION_OWNERS.finances).toBe('fiscal');
    expect(canAffordDecision(decision())).toBe(true);
    expect(canAffordDecision(decision({ availableFundsUsd: 500 }))).toBe(false);
    expect(canAffordDecision(decision({ availableFundsUsd: null }))).toBeNull();
    expect(canAffordDecision(decision({ requiredFundsUsd: null }))).toBeNull();
    expect(() => validateEconomicDecision(decision({ requiredFundsUsd: 0 }))).toThrow(/positive whole number/);
    expect(() => selectResponse('apocalyptic' as never, false)).toThrow(/Unknown severity/);
    expect(() => selectResponse('critical', 'false' as never)).toThrow(/must be a boolean/);
  });

  it('selects a graduated deterministic response; force only on explicit decision', () => {
    expect(selectResponse('low', false)).toBe('negotiate');
    expect(selectResponse('moderate', false)).toBe('condemn');
    expect(selectResponse('severe', false)).toBe('sanction');
    expect(selectResponse('critical', false)).toBe('mobilize');
    expect(selectResponse('critical', true)).toBe('use_force');
    expect(selectResponse('unavailable', true)).toBe('none');
  });

  it('validates a graduated response', () => {
    expect(() => validateGraduatedResponse(response())).not.toThrow();
    expect(() => validateGraduatedResponse(response({ severity: 'apocalyptic' as never }))).toThrow(/Unknown severity/);
    expect(() => validateGraduatedResponse(response({ responseKind: 'appease' as never }))).toThrow(/Unknown response kind/);
  });
});
