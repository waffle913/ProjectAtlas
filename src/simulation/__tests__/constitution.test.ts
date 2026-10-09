import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { assertSimulationInvariants } from '../invariants';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson, createConstitutionalAmendmentProposal, submitProposalForActor, decideExecutiveProposal } from '../governance/runtime';
import { declareEmergency, endEmergency, runEmergencyMonth, rejectProtectedModification, scheduleConstitutionalAmendment, applyDueAmendments, referAmendmentForJudicialReview, decideAmendmentJudicialReview } from '../constitution/runtime';
import { initializeConstitution } from '../constitution/model';
import type { PoliticalProposal } from '../governance/model';
import type { SimulationState } from '../../types';

let initial: ReturnType<typeof initializeNewGame>;
beforeAll(() => { initial = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs); }, 30_000);

function executive(state = initial) {
  let next = createPoliticalPerson(state, { displayName: 'Emergency executive', countryId: worldCountryIds[0] });
  const id = Object.keys(next.governance.persons).at(-1)!;
  return setControlledPerson(assignPoliticalOffice(next, id, { role: 'head_of_government', countryId: worldCountryIds[0] }), id);
}

describe('0.23 constitution procedures', () => {
  it('declares an emergency only with an active crisis and the executive office, then ends it', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    expect(() => declareEmergency(state, countryId, personId)).toThrow(/active crisis/);
    state = { ...state, crisis: { ...state.crisis, countries: { ...state.crisis.countries, [countryId]: { ...state.crisis.countries[countryId], currentByType: { ...state.crisis.countries[countryId].currentByType, fiscal_stress: { ...state.crisis.countries[countryId].currentByType.fiscal_stress, state: 'ACTIVE' as const } } } } } };
    state = declareEmergency(state, countryId, personId);
    expect(state.constitution.countries[countryId].emergency.status).toBe('active');
    expect(state.constitution.countries[countryId].emergency.restrictions.assembliesBanned).toBe(true);
    state = endEmergency(state, countryId, personId);
    expect(state.constitution.countries[countryId].emergency.status).toBe('none');
    expect(state.constitution.countries[countryId].emergency.restrictions.strikesBanned).toBe(false);
  });

  it('expires the emergency justification once its crises are no longer active', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    state = { ...state, crisis: { ...state.crisis, countries: { ...state.crisis.countries, [countryId]: { ...state.crisis.countries[countryId], currentByType: { ...state.crisis.countries[countryId].currentByType, fiscal_stress: { ...state.crisis.countries[countryId].currentByType.fiscal_stress, state: 'ACTIVE' as const } } } } } };
    state = declareEmergency(state, countryId, personId);
    state = { ...state, crisis: { ...state.crisis, countries: { ...state.crisis.countries, [countryId]: { ...state.crisis.countries[countryId], currentByType: { ...state.crisis.countries[countryId].currentByType, fiscal_stress: { ...state.crisis.countries[countryId].currentByType.fiscal_stress, state: 'NORMAL' as const } } } } } };
    state = runEmergencyMonth(state);
    expect(state.constitution.countries[countryId].emergency.status).toBe('expired');
  });

  it('registers protected material keys and rejects ordinary-law modification of them', () => {
    const countryId = worldCountryIds[0];
    let state = initializeConstitution(initial, [countryId]);
    state = { ...state, date: '2026-02-01' };
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'] }, '2026-01-15');
    state = applyDueAmendments(state);
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
    expect(rejectProtectedModification(state, countryId, 'law', { policy: { corporate: { rateBps: 2000 } as never }, annualBudget: undefined })).toMatch(/constitutionally protected material keys/);
    expect(rejectProtectedModification(state, countryId, 'constitutional_amendment', { policy: { corporate: { rateBps: 2000 } as never }, annualBudget: undefined })).toBeUndefined();
    expect(rejectProtectedModification(state, countryId, 'law', { policy: { personal: { rateBps: 2000 } as never }, annualBudget: undefined })).toBeUndefined();
  });

  it('bootstraps a usable modelled amendment procedure and keeps institution-less Countries unavailable', () => {
    const countryId = worldCountryIds[0];
    const state = initializeConstitution(initial, [countryId]);
    expect(state.constitution.countries[countryId].amendment).toMatchObject({ parliamentaryThresholdBps: 6_667, referendum: 'never', procedureStatus: 'modelled' });
    const unavailable = Object.values(state.constitution.countries).find(c => c.coverage === 'unavailable');
    if (unavailable) expect(unavailable.amendment.referendum).toBe('unavailable');
  });

  function enactedAmendment(state: SimulationState, countryId: string, payload: Parameters<typeof scheduleConstitutionalAmendment>[1]['payload'], effectiveDate = '2026-01-01'): SimulationState {
    const id = `proposal.test-amendment-${effectiveDate.replace(/-/g, '')}-${JSON.stringify(payload).length}`;
    const proposal = { id, countryId, proposerPersonId: 'person.test', createdOn: '2026-01-01', kind: 'constitutional_amendment' as const, instrumentClass: 'constitutional_amendment' as const, constitutionalDisposition: 'secondary' as const, payload, status: 'enacted' as const, effectiveDate, effects: [] };
    const withProposal = { ...state, governance: { ...state.governance, proposals: { ...state.governance.proposals, [id]: proposal as unknown as PoliticalProposal } } };
    return scheduleConstitutionalAmendment(withProposal, { id, countryId, effectiveDate, payload });
  }

  it('applies due amendments exactly once and reaches terminal states without monthly reprocessing', () => {
    const countryId = worldCountryIds[0];
    let state = initializeConstitution(initial, [countryId]);
    state = { ...state, date: '2026-02-01' };
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'] }, '2026-01-15');
    state = applyDueAmendments(state);
    const pending = state.constitution.pendingAmendments;
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('promulgated');
    expect(pending[0].appliedOn).toBe('2026-02-01');
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
    const keys = state.constitution.countries[countryId].protectedMaterialKeys;
    // A second monthly pass must not re-apply or duplicate the binding trace.
    state = applyDueAmendments(state);
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(keys);
    expect(state.constitution.countries[countryId].bindingEvents).toHaveLength(1);
  });

  it('never auto-seizes an a priori amendment: without a saisine it applies at its date', () => {
    const countryId = worldCountryIds[0];
    let state = initializeConstitution(initial, [countryId]);
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'before_promulgation', effect: 'annul' } } } } };
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'] }, '2026-01-15');
    state = applyDueAmendments(state);
    const pending = state.constitution.pendingAmendments[0];
    // No saisine was made: no actor is invented, no fake referral is recorded, and the amendment
    // applies at its effective date instead of waiting forever on a court that was never seized.
    expect(pending.status).toBe('promulgated');
    expect(pending.referral).toBeUndefined();
    expect(pending.appliedOn).toBe('2026-02-01');
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
  });

  it('a real a priori saisine waits for the verdict, and a clear verdict resumes the procedure', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'before_promulgation', effect: 'annul', accessors: ['executive'] } } } } };
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'] }, '2026-02-10');
    const instrumentId = state.constitution.pendingAmendments[0].instrumentId;
    state = referAmendmentForJudicialReview(state, instrumentId, personId);
    expect(state.constitution.pendingAmendments[0].status).toBe('referred');
    expect(state.constitution.pendingAmendments[0].referral?.byPersonId).toBe(personId);
    // The due date arrives while the real saisine is pending: the application waits.
    state = { ...state, date: '2026-02-11' };
    state = applyDueAmendments(state);
    expect(state.constitution.pendingAmendments[0].status).toBe('referred');
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual([]);
    // The court's power to annul is not the verdict; a clear verdict resumes the procedure.
    state = decideAmendmentJudicialReview(state, instrumentId);
    expect(state.constitution.pendingAmendments[0].status).toBe('scheduled');
    state = applyDueAmendments(state);
    expect(state.constitution.pendingAmendments[0].status).toBe('promulgated');
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
  });

  it('records a saisine and an annulling verdict that reverses an applied amendment a posteriori', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    // Real institutional conditions: the constitution guarantees strike, and the amendment weakens
    // it — the court's verdict is derived from that finding, never injected by the caller.
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], rights: { ...state.constitution.countries[countryId].rights, strike: 'guaranteed' }, judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'after_promulgation', effect: 'annul', accessors: ['executive'] } } } } };
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'], rightsChanges: { strike: 'not_guaranteed' } }, '2026-01-15');
    state = applyDueAmendments(state);
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
    expect(state.constitution.countries[countryId].rights.strike).toBe('not_guaranteed');
    const instrumentId = state.constitution.pendingAmendments[0].instrumentId;
    state = referAmendmentForJudicialReview(state, instrumentId, personId);
    expect(state.constitution.pendingAmendments[0].status).toBe('referred');
    expect(state.constitution.pendingAmendments[0].referral?.byPersonId).toBe(personId);
    state = decideAmendmentJudicialReview(state, instrumentId);
    expect(state.constitution.pendingAmendments[0].status).toBe('annulled');
    expect(state.constitution.pendingAmendments[0].decision?.outcome).toBe('annulled');
    expect(state.constitution.pendingAmendments[0].decision?.grounds.some(ground => /weakens the constitutional right strike/.test(ground))).toBe(true);
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual([]);
    expect(state.constitution.countries[countryId].rights.strike).toBe('guaranteed');
    expect(state.constitution.countries[countryId].bindingEvents).toHaveLength(0);
  });

  it('keeps an already-applied amendment promulgated exactly once after a posteriori clear/advisory', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'after_promulgation', effect: 'annul', accessors: ['executive'] } } } } };
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'] }, '2026-01-15');
    state = applyDueAmendments(state);
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
    const instrumentId = state.constitution.pendingAmendments[0].instrumentId;
    state = referAmendmentForJudicialReview(state, instrumentId, personId);
    state = decideAmendmentJudicialReview(state, instrumentId);
    expect(state.constitution.pendingAmendments[0].status).toBe('promulgated');
    expect(state.constitution.pendingAmendments[0].appliedOn).toBe('2026-02-01');
    // A second monthly pass must not re-apply.
    const keys = state.constitution.countries[countryId].protectedMaterialKeys;
    state = applyDueAmendments(state);
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(keys);
    expect(state.constitution.countries[countryId].bindingEvents).toHaveLength(1);
  });

  it('annuls amendment A without erasing a later amendment B (limited inverse)', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    // Real institutional conditions: the constitution guarantees strike and A weakens it, so the
    // annulment verdict is genuinely derived by the court — never injected by the caller.
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], rights: { ...state.constitution.countries[countryId].rights, strike: 'guaranteed', union: 'not_guaranteed' }, judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'after_promulgation', effect: 'annul', accessors: ['executive'] } } } } };
    // A protects fiscal.corporate and weakens strike (guaranteed -> not_guaranteed).
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'], rightsChanges: { strike: 'not_guaranteed' } }, '2026-01-15');
    state = applyDueAmendments(state);
    const aId = state.constitution.pendingAmendments[0].instrumentId;
    expect(state.constitution.countries[countryId].rights.strike).toBe('not_guaranteed');
    // B (later) protects fiscal.consumption and sets union=guaranteed.
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.consumption'], rightsChanges: { union: 'guaranteed' } }, '2026-01-20');
    state = applyDueAmendments(state);
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.consumption', 'fiscal.corporate']);
    // Annul A a posteriori: the verdict is the court's own, derived from the weakening finding.
    state = referAmendmentForJudicialReview(state, aId, personId);
    state = decideAmendmentJudicialReview(state, aId);
    expect(state.constitution.pendingAmendments.find(pending => pending.instrumentId === aId)?.decision?.outcome).toBe('annulled');
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.consumption']);
    expect(state.constitution.countries[countryId].rights.strike).toBe('guaranteed');
    expect(state.constitution.countries[countryId].rights.union).toBe('guaranteed'); // B preserved
  });

  it('annulling A never removes a key that a later amendment B also protected', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    // Real institutional conditions: A weakens the guaranteed strike right, justifying the court's
    // derived annulment verdict (never a caller-injected outcome).
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], rights: { ...state.constitution.countries[countryId].rights, strike: 'guaranteed' }, judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'after_promulgation', effect: 'annul', accessors: ['executive'] } } } } };
    // A protects fiscal.corporate (and weakens strike); a later B protects the same key again.
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'], rightsChanges: { strike: 'not_guaranteed' } }, '2026-01-15');
    state = applyDueAmendments(state);
    const aId = state.constitution.pendingAmendments[0].instrumentId;
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'] }, '2026-01-20');
    state = applyDueAmendments(state);
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
    state = referAmendmentForJudicialReview(state, aId, personId);
    state = decideAmendmentJudicialReview(state, aId);
    expect(state.constitution.pendingAmendments.find(pending => pending.instrumentId === aId)?.decision?.outcome).toBe('annulled');
    // B's independent protection of the same key survives the annulment of A.
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
    expect(state.constitution.countries[countryId].bindingEvents.map(event => event.instrumentId)).toEqual([state.constitution.pendingAmendments[1].instrumentId]);
  });

  it('keeps a priori cleared amendments in a scheduled state that satisfies the invariants', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], parliament: { ...state.constitution.countries[countryId].parliament, power: 'none' }, judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'before_promulgation', effect: 'annul', accessors: ['executive'] } } } } };
    // Canonical procedure: a real enacted instrument, not a hand-made fixture. Parliament power
    // `none` means there is no parliamentary vote: the adoption is the explicit executive decision.
    state = createConstitutionalAmendmentProposal(state, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-15', payload: { materialKeysToProtect: ['fiscal.corporate'] } });
    const proposalId = state.governance.proposalOrder.at(-1)!;
    state = submitProposalForActor(state, proposalId, personId);
    state = decideExecutiveProposal(state, proposalId, personId, 'enact');
    expect(state.governance.proposals[proposalId].status).toBe('enacted');
    const instrumentId = state.constitution.pendingAmendments[0].instrumentId;
    // A real saisine before promulgation holds the application (no auto-referral, no invented actor).
    state = referAmendmentForJudicialReview(state, instrumentId, personId);
    state = { ...state, date: '2026-03-01' };
    state = applyDueAmendments(state);
    expect(state.constitution.pendingAmendments[0].status).toBe('referred');
    state = decideAmendmentJudicialReview(state, instrumentId);
    expect(state.constitution.pendingAmendments[0].status).toBe('scheduled');
    expect(state.constitution.pendingAmendments[0].decision?.outcome).toBe('clear');
    // The a-priori-cleared intermediate state is legitimate and must pass the invariants.
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
    state = applyDueAmendments(state);
    expect(state.constitution.pendingAmendments[0].status).toBe('promulgated');
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
  });

  it('records declare_incompatibility without reversing the applied effects', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    // Real institutional conditions: the amendment weakens the guaranteed strike right, so the
    // court derives the incompatibility verdict itself — never from a caller-injected outcome.
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], rights: { ...state.constitution.countries[countryId].rights, strike: 'guaranteed' }, judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'after_promulgation', effect: 'declare_incompatibility', accessors: ['executive'] } } } } };
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'], rightsChanges: { strike: 'not_guaranteed' } }, '2026-01-15');
    state = applyDueAmendments(state);
    const instrumentId = state.constitution.pendingAmendments[0].instrumentId;
    state = referAmendmentForJudicialReview(state, instrumentId, personId);
    state = decideAmendmentJudicialReview(state, instrumentId);
    expect(state.constitution.pendingAmendments[0].status).toBe('incompatible');
    expect(state.constitution.pendingAmendments[0].decision?.outcome).toBe('incompatible');
    // Incompatibility is distinct from annulment: the applied effects are never reversed.
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
    expect(state.constitution.countries[countryId].rights.strike).toBe('not_guaranteed');
  });

  it('enforces judicial accessors and refuses saisine when timing is none or unavailable', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'none', effect: 'annul', accessors: ['executive'] } } } } };
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'] }, '2026-01-15');
    state = applyDueAmendments(state);
    const instrumentId = state.constitution.pendingAmendments[0].instrumentId;
    expect(() => referAmendmentForJudicialReview(state, instrumentId, personId)).toThrow(/no judicial review/);
    // A non-accessor (an executive) cannot seize the court when accessors only allow parliamentary parties.
    let state2 = executive();
    state2 = { ...state2, date: '2026-02-01', constitution: { ...state2.constitution, countries: { ...state2.constitution.countries, [countryId]: { ...state2.constitution.countries[countryId], judicialReview: { ...state2.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'after_promulgation', effect: 'annul', accessors: ['parliamentary_parties'] } } } } };
    state2 = enactedAmendment(state2, countryId, { materialKeysToProtect: ['fiscal.corporate'] }, '2026-01-15');
    state2 = applyDueAmendments(state2);
    const instrumentId2 = state2.constitution.pendingAmendments[0].instrumentId;
    expect(() => referAmendmentForJudicialReview(state2, instrumentId2, personId)).toThrow(/accessors/);
  });

  it('uses justifying episode identity and applies progressive discontent while unjustified', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    const episode = state.crisis.countries[countryId].currentByType.fiscal_stress;
    state = { ...state, crisis: { ...state.crisis, countries: { ...state.crisis.countries, [countryId]: { ...state.crisis.countries[countryId], currentByType: { ...state.crisis.countries[countryId].currentByType, fiscal_stress: { ...episode, state: 'ACTIVE' as const } } } } } };
    state = declareEmergency(state, countryId, personId);
    expect(state.constitution.countries[countryId].emergency.justificationEpisodeIds).toEqual([episode.id]);
    // A new episode of the same type ends the justification: identity, not type.
    const nextEpisode = { ...episode, id: `${episode.id}:next`, episodeOrdinal: episode.episodeOrdinal + 1, state: 'ACTIVE' as const };
    state = { ...state, date: '2026-02-01', crisis: { ...state.crisis, countries: { ...state.crisis.countries, [countryId]: { ...state.crisis.countries[countryId], currentByType: { ...state.crisis.countries[countryId].currentByType, fiscal_stress: nextEpisode } } } } };
    state = runEmergencyMonth(state);
    expect(state.constitution.countries[countryId].emergency.status).toBe('expired');
    expect(state.constitution.countries[countryId].emergency.discontentDriversApplied).toBe(1);
    const drivers = state.politics.countries[countryId].recentOpinionDrivers.filter(d => d.drivers.includes(5)).length;
    state = runEmergencyMonth(state);
    expect(state.constitution.countries[countryId].emergency.discontentDriversApplied).toBe(2);
    expect(state.politics.countries[countryId].recentOpinionDrivers.filter(d => d.drivers.includes(5)).length).toBe(drivers + 1);
  });
});
