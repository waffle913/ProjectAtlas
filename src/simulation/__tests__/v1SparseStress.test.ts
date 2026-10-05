import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants } from '../invariants';
import { establishOrganization, joinOrganization, proposeTreaty, signTreaty, proposeDecision, voteOnDecision, closeDecision, runMultilateralAI, runMultilateralMonth } from '../multilateral/runtime';
import { assignPoliticalOffice, createPoliticalPerson, setControlledPerson } from '../governance/runtime';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';

describe('0.21 sparse active multi-system stress', () => {
  it('runs sparse orgs/treaties/decisions at full registry scale over repeated cadences', () => {
    let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    const [c1, c2, c3] = [...worldCountryIds].slice(0, 3);
    state = createPoliticalPerson(state, { countryId: c1, displayName: 'Synthetic stress executive' });
    const person = Object.keys(state.governance.persons).find(id => state.governance.persons[id].countryId === c1)!;
    state = setControlledPerson(assignPoliticalOffice(state, person, { countryId: c1, role: 'head_of_government' }), person);
    state = establishOrganization(state, person, { title: 'Synthetic coordination body', votingRule: { kind: 'majority', quorumBps: 4000 } });
    const orgId = state.multilateral.organizationOrder[0];
    state = proposeTreaty(state, person, { title: 'Synthetic non-aggression', parties: [c1, c2, c3], clauses: [{ kind: 'non_aggression', partyAId: c1, partyBId: c2 }], entryIntoForce: { kind: 'signature', requiredRatifications: 3 }, withdrawal: { noticeDays: 30 } });
    state = signTreaty(state, state.multilateral.treatyOrder[0], person);
    state = proposeDecision(state, orgId, person, { kind: 'condemnation', targetCountryId: c3, reason: 'Synthetic stress condemnation.' });
    state = voteOnDecision(state, state.multilateral.decisionOrder[0], person, 'yes');
    const started = performance.now();
    let monthly = 0;
    for (let day = 0; day < 90; day++) {
      state = runMultilateralAI(advanceSimulationDays(state, 1));
      if (state.date.endsWith('-01')) {
        state = closeDecision(state, state.multilateral.decisionOrder[0]);
        state = runMultilateralMonth(state);
        expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
        monthly += 1;
      }
    }
    const elapsed = performance.now() - started;
    expect(monthly).toBeGreaterThanOrEqual(3);
    expect(state.information.briefings.length).toBeLessThanOrEqual(2048);
    expect(Object.keys(state.multilateral.treaties)).toHaveLength(1);
    expect(Object.keys(state.multilateral.organizations)).toHaveLength(1);
    console.info(`V1_SPARSE_STRESS ${JSON.stringify({ days: 90, monthly, orgs: 1, treaties: 1, decisions: Object.keys(state.multilateral.decisions).length, briefings: state.information.briefings.length, elapsedMs: Math.round(elapsed) })}`);
  }, 600000);
});
