import { beforeAll, describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { declareEmergency, endEmergency, runEmergencyMonth, rejectProtectedModification, applyConstitutionalAmendment } from '../constitution/runtime';
import { initializeConstitution } from '../constitution/model';

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
});
