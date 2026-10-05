import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { MULTILATERAL_VERSION, type Treaty } from '../multilateral/model';

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
