import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { declareEmergency, endEmergency, runEmergencyMonth, rejectProtectedModification, applyConstitutionalAmendment, scheduleConstitutionalAmendment, applyDueAmendments, referAmendmentForJudicialReview, decideAmendmentJudicialReview } from '../constitution/runtime';
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
    state = applyConstitutionalAmendment(state, { id: 'proposal.amendment', countryId, payload: { materialKeysToProtect: ['fiscal.corporate'] } }).next;
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

  it('keeps a mandatory a priori review pending until a verdict, and never treats the court power as the verdict', () => {
    const countryId = worldCountryIds[0];
    let state = initializeConstitution(initial, [countryId]);
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'before_promulgation', effect: 'annul' } } } } };
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'] }, '2026-01-15');
    state = applyDueAmendments(state);
    let pending = state.constitution.pendingAmendments[0];
    expect(pending.status).toBe('referred');
    expect(pending.appliedOn).toBeUndefined();
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual([]);
    // The court's power to annul is not the verdict; a clear verdict is required to apply.
    state = decideAmendmentJudicialReview(state, pending.instrumentId, { outcome: 'clear', effect: 'annul' });
    state = applyDueAmendments(state);
    pending = state.constitution.pendingAmendments[0];
    expect(pending.status).toBe('promulgated');
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
  });

  it('records a saisine and an annulling verdict that reverses an applied amendment a posteriori', () => {
    const countryId = worldCountryIds[0];
    let state = executive();
    const personId = state.governance.player.controlledPersonId!;
    state = { ...state, date: '2026-02-01', constitution: { ...state.constitution, countries: { ...state.constitution.countries, [countryId]: { ...state.constitution.countries[countryId], judicialReview: { ...state.constitution.countries[countryId].judicialReview, courtExists: 'exists', timing: 'after_promulgation', effect: 'annul' } } } } };
    state = enactedAmendment(state, countryId, { materialKeysToProtect: ['fiscal.corporate'] }, '2026-01-15');
    state = applyDueAmendments(state);
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual(['fiscal.corporate']);
    const instrumentId = state.constitution.pendingAmendments[0].instrumentId;
    state = referAmendmentForJudicialReview(state, instrumentId, personId);
    expect(state.constitution.pendingAmendments[0].status).toBe('referred');
    expect(state.constitution.pendingAmendments[0].referral?.byPersonId).toBe(personId);
    state = decideAmendmentJudicialReview(state, instrumentId, { outcome: 'annulled', effect: 'annul' });
    expect(state.constitution.pendingAmendments[0].status).toBe('annulled');
    expect(state.constitution.countries[countryId].protectedMaterialKeys).toEqual([]);
    expect(state.constitution.countries[countryId].bindingEvents).toHaveLength(0);
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
