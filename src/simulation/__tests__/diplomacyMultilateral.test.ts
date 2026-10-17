import { describe, it, expect } from 'vitest';
import {
  validateDeescalationMeasure, validateMediationOffer, DEESCALATION_OWNERS,
  type DeescalationMeasure, type MediationOffer,
} from '../diplomacy/multilateralDiplomacy';

const measure = (over: Partial<DeescalationMeasure> = {}): DeescalationMeasure => ({
  id: 'm1', actorCountryId: 'country-a', mandate: { basis: 'head_of_government' }, targetCountryId: 'country-b',
  kind: 'lift_restriction', date: '2026-02-01', note: 'lift energy restrictions',
  ...over,
});
const offer = (over: Partial<MediationOffer> = {}): MediationOffer => ({
  id: 'o1', mediatorId: 'country-c', mediatorKind: 'country', mediatorMandate: { basis: 'head_of_government' },
  partyAId: 'country-a', partyBId: 'country-b', informationBasis: 'modelled', date: '2026-02-01', note: 'offer mediation',
  ...over,
});

describe('multilateral diplomacy and de-escalation (0.31.4)', () => {
  it('maps each measure onto an existing system, never a second store', () => {
    expect(DEESCALATION_OWNERS.lift_restriction).toBe('international.actions');
    expect(DEESCALATION_OWNERS.withdraw_condemnation).toBe('international.actions');
    expect(DEESCALATION_OWNERS.mediation_offer).toBe('multilateral.decisions');
  });

  it('validates a de-escalation measure with a real mandate', () => {
    expect(() => validateDeescalationMeasure(measure())).not.toThrow();
    expect(() => validateDeescalationMeasure(measure({ kind: 'withdraw_condemnation' }))).not.toThrow();
    expect(() => validateDeescalationMeasure(measure({ mandate: { basis: 'unresolved' } }))).toThrow(/fails closed/);
    expect(() => validateDeescalationMeasure(measure({ targetCountryId: 'country-a' }))).toThrow(/distinct/);
    expect(() => validateDeescalationMeasure(measure({ kind: 'magic' as never }))).toThrow(/Unknown de-escalation measure kind/);
  });

  it('validates a country or organization mediation offer, non-omniscient', () => {
    expect(() => validateMediationOffer(offer())).not.toThrow();
    expect(() => validateMediationOffer(offer({ mediatorKind: 'organization', mediatorMandate: null }))).not.toThrow();
    expect(() => validateMediationOffer(offer({ informationBasis: 'unavailable' }))).not.toThrow();
    expect(() => validateMediationOffer(offer({ mediatorMandate: { basis: 'unresolved' } }))).toThrow(/fails closed/);
    expect(() => validateMediationOffer(offer({ mediatorKind: 'organization' }))).toThrow(/must not carry an office mandate/);
  });

  it('rejects a mediator that is a party, identical parties, or an unknown basis', () => {
    expect(() => validateMediationOffer(offer({ mediatorId: 'country-a' }))).toThrow(/distinct from both parties/);
    expect(() => validateMediationOffer(offer({ partyBId: 'country-a' }))).toThrow(/distinct parties/);
    expect(() => validateMediationOffer(offer({ informationBasis: 'omniscient' as never }))).toThrow(/Unknown information basis/);
  });
});
