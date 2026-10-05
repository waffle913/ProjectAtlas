import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { MULTILATERAL_VERSION, type Treaty } from '../multilateral/model';
import { activateTreaty, hasTreatyAuthority, proposeTreaty, ratifyTreaty, signTreaty, terminateTreaty, withdrawTreaty } from '../multilateral/runtime';
import { assignPoliticalOffice, createPoliticalPerson, setControlledPerson } from '../governance/runtime';

const baseState = () => initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
const countryA = worldCountryIds[0], countryB = worldCountryIds[1];

function withTreaty(state: ReturnType<typeof baseState>, treaty: Treaty) {
  return { ...state, multilateral: { ...state.multilateral, treaties: { ...state.multilateral.treaties, [treaty.id]: treaty }, treatyOrder: [...state.multilateral.treatyOrder, treaty.id], nextTreatySequence: Math.max(state.multilateral.nextTreatySequence, Number(treaty.id.split('.')[1]) + 1) } };
}

function validTreaty(overrides: Partial<Treaty> = {}): Treaty {
  return {
    id: 'treaty.00000000',
    title: 'Synthetic bilateral test treaty',
    parties: [countryA, countryB].sort(),
    proposalDate: '2026-01-01',
    signatories: {},
    ratifications: {},
    entryIntoForce: { kind: 'ratification', requiredRatifications: 2 },
    withdrawal: { noticeDays: 30 },
    withdrawals: {},
    status: 'proposed',
    clauses: [{ kind: 'non_aggression', partyAId: countryA, partyBId: countryB }],
    provenance: { status: 'synthetic', limitation: 'Synthetic fixture; not an observed real-world agreement.' },
    history: [{ date: '2026-01-01', kind: 'proposed', detail: 'Proposed synthetic treaty.' }],
    ...overrides,
  };
}

describe('0.20 multilateral canonical model and schema-18 migration', () => {
  it('initializes an empty multilateral domain with no fabricated treaties, organizations or memberships', () => {
    const state = baseState();
    expect(state.schemaVersion).toBe(18);
    expect(state.multilateral.version).toBe(MULTILATERAL_VERSION);
    expect(state.multilateral.initializedOn).toBe(state.date);
    expect(state.multilateral.treaties).toEqual({});
    expect(state.multilateral.organizations).toEqual({});
    expect(state.multilateral.decisions).toEqual({});
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
  });

  it('migrates a schema-17 save to schema 18 without replay, fabrication or domain loss', () => {
    const state = baseState();
    const saved = JSON.parse(serializeSimulationState(state, worldContext)) as Record<string, unknown>;
    saved.schemaVersion = 17;
    delete saved.multilateral;
    const restored = restoreSimulationState(JSON.stringify(saved), worldRegions, {}, {}, worldContext);
    expect(restored.schemaVersion).toBe(18);
    expect(restored.multilateral.initializedOn).toBe(state.date);
    expect(restored.multilateral.treaties).toEqual({});
    expect(restored.multilateral.organizations).toEqual({});
    expect(restored.multilateral.decisions).toEqual({});
    expect(restored.engine).toEqual(state.engine);
    expect(restored.regionOwnership).toEqual(state.regionOwnership);
    expect(restored.wars).toEqual(state.wars);
    expect(assertSimulationInvariants(restored, worldContext, 'save')).toBe(true);
  });

  it('accepts a valid proposed treaty with typed clauses', () => {
    const state = withTreaty(baseState(), validTreaty());
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
  });

  it.each([
    ['duplicate parties', { parties: [countryA, countryA] }],
    ['impossible future proposal date', { proposalDate: '2030-01-01' }],
    ['active without entry into force', { status: 'active' as const }],
    ['unknown party reference', { parties: [countryA, 'country.ghost'] }],
    ['clause referencing a non-party', { clauses: [{ kind: 'defensive_guarantee' as const, protectedCountryId: countryA, obligatedCountryId: 'country.ghost' }] }],
  ])('rejects malformed treaty: %s', (_name, overrides) => {
    const state = withTreaty(baseState(), validTreaty(overrides));
    expect(() => assertSimulationInvariants(state, worldContext, 'save')).toThrow();
  });

  it('rejects material treaty state in an uninitialized multilateral domain', () => {
    const state = baseState();
    const treaty = validTreaty();
    const uninitialized = { ...state, multilateral: { ...state.multilateral, initializedOn: undefined, treaties: { [treaty.id]: treaty }, treatyOrder: [treaty.id] } };
    expect(() => assertSimulationInvariants(uninitialized, worldContext, 'save')).toThrow(/Uninitialized multilateral/);
  });
});

describe('0.20 treaty authority and lifecycle', () => {
  const executive = (state: ReturnType<typeof baseState>, countryId: string) => {
    let next = createPoliticalPerson(state, { countryId, displayName: `Synthetic treaty executive ${countryId}` });
    const personId = Object.keys(next.governance.persons).find(id => next.governance.persons[id].countryId === countryId && !next.governance.persons[id].office)!;
    next = setControlledPerson(assignPoliticalOffice(next, personId, { countryId, role: 'head_of_government' }), personId);
    return { state: next, personId };
  };
  const input = (overrides: Partial<Parameters<typeof proposeTreaty>[2]> = {}) => ({
    title: 'Synthetic mutual assistance treaty',
    parties: [countryA, countryB],
    clauses: [{ kind: 'non_aggression' as const, partyAId: countryA, partyBId: countryB }],
    entryIntoForce: { kind: 'ratification' as const, requiredRatifications: 2 },
    withdrawal: { noticeDays: 30 },
    ...overrides,
  });

  it('requires a resolved executive office, not Country selection alone', () => {
    const { state } = executive(baseState(), countryA);
    const noOffice = createPoliticalPerson(state, { countryId: countryA, displayName: 'No office' });
    const noOfficeId = Object.keys(noOffice.governance.persons).find(id => !noOffice.governance.persons[id].office)!;
    const uncontrolled = setControlledPerson(noOffice, noOfficeId);
    expect(hasTreatyAuthority(uncontrolled, countryA, noOfficeId)).toBe(false);
    expect(() => proposeTreaty(uncontrolled, noOfficeId, input())).toThrow(/resolved executive office/);
  });

  it('proposes and signs, keeping signature separate from ratification-based entry into force', () => {
    const a = executive(baseState(), countryA);
    let state = a.state;
    state = proposeTreaty(state, a.personId, input());
    const treatyId = state.multilateral.treatyOrder[0];
    expect(state.multilateral.treaties[treatyId].status).toBe('proposed');
    state = signTreaty(state, treatyId, a.personId);
    expect(state.multilateral.treaties[treatyId].status).toBe('signed');
    expect(state.multilateral.treaties[treatyId].activeOn).toBeUndefined();
    state = ratifyTreaty(state, treatyId, a.personId);
    expect(state.multilateral.treaties[treatyId].status).toBe('signed');
    expect(() => activateTreaty(state, treatyId, a.personId)).toThrow(/threshold/);
  });

  it('enters into force only after the required ratification threshold is met', () => {
    const a = executive(baseState(), countryA);
    let state = a.state;
    state = proposeTreaty(state, a.personId, input());
    const treatyId = state.multilateral.treatyOrder[0];
    state = signTreaty(state, treatyId, a.personId);
    const b = executive(state, countryB);
    state = b.state;
    state = signTreaty(state, treatyId, b.personId);
    state = ratifyTreaty(state, treatyId, b.personId);
    state = setControlledPerson(state, a.personId);
    state = ratifyTreaty(state, treatyId, a.personId);
    state = activateTreaty(state, treatyId, a.personId);
    expect(state.multilateral.treaties[treatyId].status).toBe('active');
    expect(state.multilateral.treaties[treatyId].activeOn).toBe(state.date);
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
  });

  it('supports on-signature entry into force without a separate ratification step', () => {
    const a = executive(baseState(), countryA);
    let state = a.state;
    state = proposeTreaty(state, a.personId, input({ entryIntoForce: { kind: 'signature', requiredRatifications: 2 } }));
    const treatyId = state.multilateral.treatyOrder[0];
    state = signTreaty(state, treatyId, a.personId);
    expect(state.multilateral.treaties[treatyId].status).toBe('signed');
    const b = executive(state, countryB);
    state = b.state;
    state = signTreaty(state, treatyId, b.personId);
    expect(state.multilateral.treaties[treatyId].status).toBe('active');
  });

  it('rejects, withdraws and terminates coherently', () => {
    const a = executive(baseState(), countryA);
    let state = proposeTreaty(a.state, a.personId, input());
    const treatyId = state.multilateral.treatyOrder[0];
    state = withdrawTreaty(state, treatyId, a.personId);
    expect(state.multilateral.treaties[treatyId].status).toBe('terminated');
    expect(state.multilateral.treaties[treatyId].withdrawals).toHaveProperty(countryA);
    // Re-propose, activate on signature, then terminate
    const a2 = executive(baseState(), countryA);
    let active = proposeTreaty(a2.state, a2.personId, input({ entryIntoForce: { kind: 'signature', requiredRatifications: 2 } }));
    const activeId = active.multilateral.treatyOrder[0];
    active = signTreaty(active, activeId, a2.personId);
    const b = executive(active, countryB);
    active = b.state;
    active = signTreaty(active, activeId, b.personId);
    expect(active.multilateral.treaties[activeId].status).toBe('active');
    active = setControlledPerson(active, a2.personId);
    active = terminateTreaty(active, activeId, a2.personId);
    expect(active.multilateral.treaties[activeId].status).toBe('terminated');
    expect(active.multilateral.treaties[activeId].terminatedOn).toBe(active.date);
  });

  it('round-trips every lifecycle phase through save/reload', () => {
    const a = executive(baseState(), countryA);
    let state = a.state;
    const roundTrip = (current: ReturnType<typeof baseState>) => restoreSimulationState(serializeSimulationState(current, worldContext), worldRegions, {}, {}, worldContext);
    state = proposeTreaty(state, a.personId, input());
    expect(roundTrip(state)).toEqual(state);
    const treatyId = state.multilateral.treatyOrder[0];
    state = signTreaty(state, treatyId, a.personId);
    const b = executive(state, countryB);
    state = b.state;
    state = signTreaty(state, treatyId, b.personId);
    expect(roundTrip(state)).toEqual(state);
    state = ratifyTreaty(state, treatyId, b.personId);
    state = setControlledPerson(state, a.personId);
    state = ratifyTreaty(state, treatyId, a.personId);
    expect(roundTrip(state)).toEqual(state);
    state = activateTreaty(state, treatyId, a.personId);
    expect(roundTrip(state)).toEqual(state);
    state = setControlledPerson(state, b.personId);
    state = withdrawTreaty(state, treatyId, b.personId);
    expect(roundTrip(state)).toEqual(state);
  }, 120000);
});
