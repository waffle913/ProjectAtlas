import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants } from '../invariants';
import { assignPoliticalOffice, createPoliticalPerson, setControlledPerson } from '../governance/runtime';
import { establishOrganization, joinOrganization, proposeDecision, proposeTreaty, signTreaty, voteOnDecision } from '../multilateral/runtime';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';

describe('multilateral 0.20 synthetic sparse world benchmark', () => {
  it('measures a small organization/treaty workload at real registry scale without a worldwide scan', () => {
    let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    const executive = (countryId: string) => {
      state = createPoliticalPerson(state, { countryId, displayName: `Benchmark executive ${countryId}` });
      const personId = Object.keys(state.governance.persons).find(id => state.governance.persons[id].countryId === countryId && !state.governance.persons[id].office)!;
      state = setControlledPerson(assignPoliticalOffice(state, personId, { countryId, role: 'head_of_government' }), personId);
      return personId;
    };
    const founder = worldCountryIds[0], member = worldCountryIds[1], member2 = worldCountryIds[2];
    const founderPerson = executive(founder);
    state = establishOrganization(state, founderPerson, { title: 'Benchmark Organization', votingRule: { kind: 'majority', quorumBps: 5000 } });
    const orgId = state.multilateral.organizationOrder[0];
    const memberPerson = executive(member);
    state = joinOrganization(state, orgId, memberPerson);
    const member2Person = executive(member2);
    state = joinOrganization(state, orgId, member2Person);
    state = setControlledPerson(state, founderPerson);
    state = proposeDecision(state, orgId, founderPerson, { kind: 'condemnation', targetCountryId: worldCountryIds[3], reason: 'Benchmark.' }, 30);
    const decisionId = state.multilateral.decisionOrder[0];
    state = setControlledPerson(state, memberPerson);
    state = voteOnDecision(state, decisionId, memberPerson, 'yes');
    state = setControlledPerson(state, member2Person);
    state = voteOnDecision(state, decisionId, member2Person, 'no');
    state = setControlledPerson(state, founderPerson);
    state = proposeTreaty(state, founderPerson, { title: 'Benchmark Treaty', parties: [founder, member], clauses: [{ kind: 'non_aggression', partyAId: founder, partyBId: member }], entryIntoForce: { kind: 'signature', requiredRatifications: 2 }, withdrawal: { noticeDays: 30 } });
    const started = performance.now();
    const next = advanceSimulationDays(state, 31);
    const elapsed = performance.now() - started;
    expect(Object.keys(next.multilateral.treaties)).toHaveLength(1);
    expect(Object.keys(next.multilateral.decisions)).toHaveLength(1);
    expect(assertSimulationInvariants(next, worldContext, 'save')).toBe(true);
    console.info(`MULTILATERAL_WORLD_BENCHMARK ${JSON.stringify({ countries: 252, regions: worldRegions.length, organizations: 1, treaties: 1, decisions: 1, members: 3, days: 31, elapsedMs: elapsed })}`);
  }, 120000);
});
