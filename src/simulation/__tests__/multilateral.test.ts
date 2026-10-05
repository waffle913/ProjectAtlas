import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { MULTILATERAL_VERSION, type Treaty } from '../multilateral/model';
import { activateTreaty, applyTreatyTradeCommitments, closeDecision, establishOrganization, hasTreatyAuthority, joinOrganization, proposeDecision, proposeTreaty, ratifyTreaty, resolveObligation, runMultilateralMonth, signTreaty, terminateTreaty, voteOnDecision, withdrawFromOrganization, withdrawTreaty } from '../multilateral/runtime';
import { assignPoliticalOffice, createPoliticalPerson, setControlledPerson } from '../governance/runtime';
import { createClaim } from '../diplomacy';
import { declareLimitedWar } from '../war';

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

describe('0.20 treaty obligations, triggers and violations', () => {
  const countryC = worldCountryIds[2];
  const executive = (state: ReturnType<typeof baseState>, countryId: string) => {
    let next = createPoliticalPerson(state, { countryId, displayName: `Synthetic treaty executive ${countryId}` });
    const personId = Object.keys(next.governance.persons).find(id => next.governance.persons[id].countryId === countryId && !next.governance.persons[id].office)!;
    next = setControlledPerson(assignPoliticalOffice(next, personId, { countryId, role: 'head_of_government' }), personId);
    return { state: next, personId };
  };
  const activeTreaty = (clauses: Parameters<typeof proposeTreaty>[2]['clauses']) => {
    const a = executive(baseState(), countryA);
    let state = proposeTreaty(a.state, a.personId, { title: 'Synthetic obligations treaty', parties: [countryA, countryB], clauses, entryIntoForce: { kind: 'signature', requiredRatifications: 2 }, withdrawal: { noticeDays: 30 } });
    const treatyId = state.multilateral.treatyOrder[0];
    state = signTreaty(state, treatyId, a.personId);
    const b = executive(state, countryB);
    state = b.state;
    state = signTreaty(state, treatyId, b.personId);
    expect(state.multilateral.treaties[treatyId].status).toBe('active');
    return { state, treatyId, aPersonId: a.personId };
  };
  const declareWar = (state: ReturnType<typeof baseState>, warId: string, attacker: string, defender: string) => {
    const targetRegion = worldRegions.find(region => region.initialOwnerCountryId === defender)!.id;
    let next = createClaim(state, { id: `claim.${warId}`, claimantCountryId: attacker, regionId: targetRegion, type: 'territorial', creationDate: state.date, reason: 'Synthetic obligation trigger.' }, worldContext);
    return declareLimitedWar(next, { warId, attackerCountryId: attacker, defenderCountryId: defender, targetRegionId: targetRegion, casusBelliId: `claim-derived:claim.${warId}:${defender}` }, worldContext);
  };

  it('triggers a defensive-guarantee obligation exactly once for a qualifying war', () => {
    const { state: armed, aPersonId } = activeTreaty([{ kind: 'defensive_guarantee', protectedCountryId: countryB, obligatedCountryId: countryA }]);
    let state = declareWar(armed, 'war.guarantee', countryC, countryB);
    state = runMultilateralMonth(state);
    expect(Object.values(state.multilateral.obligations)).toHaveLength(1);
    const obligation = Object.values(state.multilateral.obligations)[0];
    expect(obligation).toMatchObject({ kind: 'defensive_guarantee', protectedCountryId: countryB, obligatedCountryId: countryA, warId: 'war.guarantee', status: 'pending' });
    state = runMultilateralMonth(state);
    expect(Object.values(state.multilateral.obligations)).toHaveLength(1);
    state = setControlledPerson(state, aPersonId);
    state = resolveObligation(state, obligation.id, aPersonId, true);
    expect(state.multilateral.obligations[obligation.id].status).toBe('honored');
    expect(state.explicitCasusBelli.some(cb => cb.issuerCountryId === countryA && cb.targetCountryId === countryC && cb.type === 'retaliation')).toBe(true);
  });

  it('does not trigger an unrelated war and inactive treaties have no effect', () => {
    const { state: armed, treatyId } = activeTreaty([{ kind: 'defensive_guarantee', protectedCountryId: countryB, obligatedCountryId: countryA }]);
    // unrelated war (protected country is not the defender)
    let state = declareWar(armed, 'war.unrelated', countryA, countryC);
    state = runMultilateralMonth(state);
    expect(Object.values(state.multilateral.obligations)).toHaveLength(0);
    // terminate the treaty, then a qualifying war still does not trigger
    const a = executive(state, countryA);
    state = setControlledPerson(a.state, a.personId);
    state = terminateTreaty(state, treatyId, a.personId);
    state = declareWar(state, 'war.late', countryC, countryB);
    state = runMultilateralMonth(state);
    expect(Object.values(state.multilateral.obligations)).toHaveLength(0);
  });

  it('records a non-aggression violation exactly once and survives save/reload', () => {
    const { state: armed } = activeTreaty([{ kind: 'non_aggression', partyAId: countryA, partyBId: countryB }]);
    let state = declareWar(armed, 'war.aggression', countryA, countryB);
    state = runMultilateralMonth(state);
    expect(Object.values(state.multilateral.violations)).toHaveLength(1);
    expect(Object.values(state.multilateral.violations)[0]).toMatchObject({ kind: 'non_aggression', violatingCountryId: countryA, violatedAgainstCountryId: countryB, warId: 'war.aggression' });
    state = runMultilateralMonth(state);
    expect(Object.values(state.multilateral.violations)).toHaveLength(1);
    const restored = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.multilateral.violations).toEqual(state.multilateral.violations);
  });

  it('applies a trade commitment tariff through the existing route model without duplicating trade state', () => {
    const { state: armed } = activeTreaty([{ kind: 'trade_commitment', importerId: countryA, exporterId: countryB, categories: ['food'], tariffBps: 800 }]);
    const before = armed.trade.routes.length;
    let state: ReturnType<typeof baseState> = { ...armed, trade: { ...armed.trade, routes: [...armed.trade.routes, { id: 'route.synthetic', exporterId: countryB, importerId: countryA, category: 'food', source: armed.trade.routes[0]?.source ?? { status: 'modelled', publisher: 'synthetic', dataset: 'synthetic', url: 'synthetic', referenceDate: '2026-01-01', publishedOn: null, retrievedAt: '2026-01-01', licence: 'synthetic', attribution: 'synthetic', transformation: 'synthetic', limitation: 'synthetic', synthetic: true }, capacityPerMonth: 1, establishedCapacity: 1, expansionPerMonth: 0, logisticsBps: 0, tariffBps: null }] } };
    state = applyTreatyTradeCommitments(state);
    const route = state.trade.routes.find(r => r.id === 'route.synthetic')!;
    expect(route.tariffBps).toBe(800);
    expect(state.trade.routes.length).toBe(before + 1);
    expect(state.trade.flows).toEqual(armed.trade.flows);
  });
});

describe('0.20 multilateral organizations', () => {
  const executive = (state: ReturnType<typeof baseState>, countryId: string) => {
    let next = createPoliticalPerson(state, { countryId, displayName: `Synthetic org executive ${countryId}` });
    const personId = Object.keys(next.governance.persons).find(id => next.governance.persons[id].countryId === countryId && !next.governance.persons[id].office)!;
    next = setControlledPerson(assignPoliticalOffice(next, personId, { countryId, role: 'head_of_government' }), personId);
    return { state: next, personId };
  };

  it('establishes, joins and withdraws an organization without fabricating memberships', () => {
    const a = executive(baseState(), countryA);
    let state = establishOrganization(a.state, a.personId, { title: 'Synthetic Test Organization', votingRule: { kind: 'majority' } });
    const orgId = state.multilateral.organizationOrder[0];
    expect(state.multilateral.organizations[orgId].members[countryA]).toMatchObject({ role: 'member' });
    const b = executive(state, countryB);
    state = b.state;
    state = joinOrganization(state, orgId, b.personId);
    expect(state.multilateral.organizations[orgId].members[countryB]).toMatchObject({ role: 'member' });
    const c = executive(state, worldCountryIds[2]);
    state = c.state;
    state = joinOrganization(state, orgId, c.personId, 'observer');
    expect(state.multilateral.organizations[orgId].members[worldCountryIds[2]]).toMatchObject({ role: 'observer' });
    expect(() => joinOrganization(state, orgId, c.personId)).toThrow(/already a member or observer/);
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
    state = withdrawFromOrganization(state, orgId, c.personId);
    expect(state.multilateral.organizations[orgId].members[worldCountryIds[2]]).toBeUndefined();
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
    const restored = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored).toEqual(state);
  });

  it('requires authority and rejects invalid membership transitions', () => {
    const a = executive(baseState(), countryA);
    const state = establishOrganization(a.state, a.personId, { title: 'Synthetic Organization', votingRule: { kind: 'unanimity' } });
    const orgId = state.multilateral.organizationOrder[0];
    const noOffice = createPoliticalPerson(state, { countryId: countryB, displayName: 'No office' });
    const noOfficeId = Object.keys(noOffice.governance.persons).find(id => !noOffice.governance.persons[id].office)!;
    expect(() => joinOrganization(noOffice, orgId, noOfficeId)).toThrow(/resolved executive office/);
    expect(() => establishOrganization(noOffice, noOfficeId, { title: 'X', votingRule: { kind: 'majority' } })).toThrow(/resolved executive office/);
  });
});

describe('0.20 multilateral proposals, voting and decisions', () => {
  const executive = (state: ReturnType<typeof baseState>, countryId: string) => {
    let next = createPoliticalPerson(state, { countryId, displayName: `Synthetic voting executive ${countryId}` });
    const personId = Object.keys(next.governance.persons).find(id => next.governance.persons[id].countryId === countryId && !next.governance.persons[id].office)!;
    next = setControlledPerson(assignPoliticalOffice(next, personId, { countryId, role: 'head_of_government' }), personId);
    return { state: next, personId };
  };
  const orgWithMembers = (votingRule: { kind: 'majority' | 'supermajority' | 'unanimity'; thresholdBps?: number; quorumBps?: number }, members: string[]) => {
    const founder = executive(baseState(), members[0]);
    let state = establishOrganization(founder.state, founder.personId, { title: 'Synthetic voting organization', votingRule });
    const orgId = state.multilateral.organizationOrder[0];
    const persons: Record<string, string> = { [members[0]]: founder.personId };
    for (const member of members.slice(1)) {
      const e = executive(state, member);
      state = e.state;
      state = joinOrganization(state, orgId, e.personId);
      persons[member] = e.personId;
    }
    return { state, orgId, persons };
  };
  const cast = (state: ReturnType<typeof baseState>, decisionId: string, persons: Record<string, string>, votes: Record<string, 'yes' | 'no' | 'abstain'>) => {
    let next = state;
    for (const [country, choice] of Object.entries(votes)) {
      next = setControlledPerson(next, persons[country]);
      next = voteOnDecision(next, decisionId, persons[country], choice);
    }
    return next;
  };

  it('adopts by simple majority with a quorum and applies condemnation exactly once', () => {
    const { state: orgState, orgId, persons } = orgWithMembers({ kind: 'majority', quorumBps: 5000 }, [countryA, countryB, worldCountryIds[2]]);
    let state = setControlledPerson(orgState, persons[countryA]);
    state = proposeDecision(state, orgId, persons[countryA], { kind: 'condemnation', targetCountryId: worldCountryIds[3], reason: 'Synthetic condemnation.' }, 30);
    const decisionId = state.multilateral.decisionOrder[0];
    state = cast(state, decisionId, persons, { [countryA]: 'yes', [countryB]: 'yes' });
    state = closeDecision(state, decisionId);
    expect(state.multilateral.decisions[decisionId].status).toBe('adopted');
    expect(state.multilateral.decisions[decisionId].appliedEffectIds).toHaveLength(3);
    expect(Object.values(state.international.actions).filter(a => a.kind === 'condemnation' && a.targetCountryId === worldCountryIds[3])).toHaveLength(3);
    state = closeDecision(state, decisionId);
    expect(state.multilateral.decisions[decisionId].appliedEffectIds).toHaveLength(3);
  });

  it('distinguishes unknown from abstain and rejects on quorum failure', () => {
    const { state: orgState, orgId, persons } = orgWithMembers({ kind: 'majority', quorumBps: 10000 }, [countryA, countryB, worldCountryIds[2]]);
    let state = setControlledPerson(orgState, persons[countryA]);
    state = proposeDecision(state, orgId, persons[countryA], { kind: 'membership', applicantCountryId: worldCountryIds[3], role: 'observer' }, 30);
    const decisionId = state.multilateral.decisionOrder[0];
    state = voteOnDecision(state, decisionId, persons[countryA], 'yes');
    state = setControlledPerson(state, persons[countryB]);
    state = voteOnDecision(state, decisionId, persons[countryB], 'abstain');
    // countryC stays unknown (not cast); quorum 10000 requires all three to cast -> rejected
    state = closeDecision(state, decisionId);
    expect(state.multilateral.decisions[decisionId].status).toBe('rejected');
    expect(state.multilateral.organizations[orgId].members[worldCountryIds[3]]).toBeUndefined();
  });

  it('requires a supermajority threshold and rejects ineligible voters', () => {
    const { state: orgState, orgId, persons } = orgWithMembers({ kind: 'supermajority', thresholdBps: 6600 }, [countryA, countryB, worldCountryIds[2]]);
    let state = setControlledPerson(orgState, persons[countryA]);
    state = proposeDecision(state, orgId, persons[countryA], { kind: 'membership', applicantCountryId: worldCountryIds[3], role: 'member' }, 30);
    const decisionId = state.multilateral.decisionOrder[0];
    // two yes, one no -> 2/3 exactly meets 6667 bps
    state = cast(state, decisionId, persons, { [countryA]: 'yes', [countryB]: 'yes', [worldCountryIds[2]]: 'no' });
    state = closeDecision(state, decisionId);
    expect(state.multilateral.decisions[decisionId].status).toBe('adopted');
    expect(state.multilateral.organizations[orgId].members[worldCountryIds[3]]).toMatchObject({ role: 'member' });
    // observer cannot vote
    const observer = executive(state, worldCountryIds[4]);
    let observerState = joinOrganization(observer.state, orgId, observer.personId, 'observer');
    observerState = setControlledPerson(observerState, persons[countryA]);
    observerState = proposeDecision(observerState, orgId, persons[countryA], { kind: 'membership', applicantCountryId: worldCountryIds[5], role: 'member' }, 30);
    const secondId = observerState.multilateral.decisionOrder[observerState.multilateral.decisionOrder.length - 1];
    observerState = setControlledPerson(observerState, observer.personId);
    expect(() => voteOnDecision(observerState, secondId, observer.personId, 'yes')).toThrow(/voting members/);
  });

  it('round-trips an open vote and an adopted decision deterministically', () => {
    const { state: orgState, orgId, persons } = orgWithMembers({ kind: 'unanimity' }, [countryA, countryB]);
    let state = setControlledPerson(orgState, persons[countryA]);
    state = proposeDecision(state, orgId, persons[countryA], { kind: 'condemnation', targetCountryId: worldCountryIds[3], reason: 'Synthetic.' }, 30);
    const decisionId = state.multilateral.decisionOrder[0];
    const openRoundTrip = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(openRoundTrip).toEqual(state);
    state = cast(state, decisionId, persons, { [countryA]: 'yes', [countryB]: 'yes' });
    state = closeDecision(state, decisionId);
    expect(state.multilateral.decisions[decisionId].status).toBe('adopted');
    const adoptedRoundTrip = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(adoptedRoundTrip).toEqual(state);
    expect(adoptedRoundTrip.international.actions).toEqual(state.international.actions);
  }, 120000);
});
