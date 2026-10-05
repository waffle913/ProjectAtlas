import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMilitary } from '../military/model';
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { advanceSimulationDays } from '../engine';
import { requestFidelityTransition, applyPendingFidelityTransitions } from '../fidelity';
import { assertSimulationInvariants, validateFidelityConservation } from '../invariants';
import { governanceInvariant } from '../governance/invariants';
import { politicalRegistry } from '../politics/registry';
import type { PoliticalRegistry } from '../politics/model';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { assignPoliticalOffice, capabilitiesForReconciledAuthority, createFiscalProposal, createPoliticalPerson, estimateParliamentarySupport, estimatePublicSupport, initializePartyLeaders, inspectGovernance, inspectPlayer, inspectProposalSupport, replaceDraftProposal, replacePartyLeader, resolvePlayerHandoff, resolveProposalVote, revokePoliticalOffice, setControlledPerson, setPartyLeadership, setPartyMembership, submitProposal, withdrawProposal } from '../governance/runtime';
import { initializeNewGame } from '../initialization';
import { emptyInformation } from '../information/model';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { simulationDelta } from '../world';
import { createSimulationSnapshotCache } from '../state';
import { analyzeProposal, derivePartyGoalProfile, evaluatePartyProposal, evaluateProfileForPublic, GOVERNANCE_GOALS, GOVERNANCE_VOTE_THRESHOLDS } from '../governance/analysis';
import type { GovernanceGoal, InstitutionalPowerTransfer, PartyChamberEvaluation, PartyGoalProfile, PoliticalPersonState, PoliticalProposal, ProposalAnalysis } from '../governance/model';
import type { FiscalProposalPayload } from '../governance/model';
import type { FiscalReform, TaxKind, TaxRule } from '../fiscal/model';
import { evaluateImmediateFiscalPolicyCounterfactual, scheduleFiscalReform } from '../fiscal/runtime';
import { COHORT } from '../politics/model';
import politicalOffices from '../../data/political-offices.json';
import { StartGame } from '../../components/StartGame';
import { assertInitialOfficeReconciliation } from '../governance/initialOfficeEvidence';
import { selectableStartingCountryIds, startingPersonCandidates } from '../governance/selection';
import { allocatePartySeats, evaluatePartyInternalVoteDistribution, INTERNAL_PARTY_DISTRIBUTION_MODEL } from '../governance/internalPartyDistribution';
import { applyInstitutionalAgreement, applyPartyInstitutionalInterest, derivePartyInstitutionalStake, evaluatePartyInstitutionalInterest, institutionalSensitivityBps, INSTITUTIONAL_INTEREST_MODEL } from '../governance/institutionalInterest';
import { buildLeadershipSuccessionEvidence, deriveLeadershipSelectionMetrics, leadershipProfileFromEvidence, LEADERSHIP_SUCCESSION_MODEL, selectLeadershipTendency } from '../governance/leadershipSuccession';
import { governanceFingerprint, type LeadershipSuccession, type LeadershipSuccessionEvidence } from '../governance/model';
import { POLITICAL_ISSUES, type CohortPoliticalOpinion } from '../politics/model';
import { informationInvariant } from '../information/invariants';
import { aggregateNationalSupport } from '../politics/aggregation';
import { allocate, ratio } from '../socioeconomy/model';

import historicalFixture from './fixtures/governance-situational-0.14-v2.json';
import historicalPluralityFixture from './fixtures/governance-plurality-0.15-v1.json';
import historicalFallbackFixture from './fixtures/leadership-fallback-0.15-v2.json';
const historicalSituational = historicalFixture as {
  referenceCommit: string; person: PoliticalPersonState; proposal: PoliticalProposal; reform: FiscalReform;
};
const historicalPlurality = historicalPluralityFixture as {
  referenceCommit: string; person: PoliticalPersonState; proposal: PoliticalProposal;
};

const fullWorld = () => initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
let initial: SimulationState;
beforeAll(() => { initial = fullWorld(); }, 30_000);

function leadershipContextFixture(mandateBps = 7_000, supportBps = 3_000) {
  const partyId = historicalFallbackFixture.succession.partyId, countryId = politicalRegistry.parties[partyId].countryId;
  const party = structuredClone(politicalRegistry.parties[partyId]);
  for (const position of Object.values(party.issuePositions)) Object.assign(position, { preferenceBps: 7_000, intensityBps: 6_000, confidenceBps: 10_000 });
  const country = politicalRegistry.countries[countryId], institution = structuredClone(politicalRegistry.institutions[country.institutionId]);
  const chamber = institution.chambers[0];
  Object.assign(chamber, { totalSeats: 100, seatsByParty: { [partyId]: 30 }, independentOtherSeats: 70, seatAllocationStatus: 'sourced' });
  institution.chambers = [chamber];
  const registry: PoliticalRegistry = {
    ...politicalRegistry, parties: { ...politicalRegistry.parties, [partyId]: party },
    institutions: { ...politicalRegistry.institutions, [institution.id]: institution },
  };
  const partyIndex = country.partyIds.indexOf(partyId);
  const support = country.partyIds.map(id => id === partyId ? supportBps : 0).concat(10_000 - supportBps);
  const opinion = (): CohortPoliticalOpinion => [POLITICAL_ISSUES.map(() => mandateBps), POLITICAL_ISSUES.map(() => 1_000), [...support], 6_000, 0, 1_000, []];
  const regionIds = ['region.leadership-a', 'region.leadership-b'];
  const socio = Object.values(initial.socioeconomy.regions).find(region => region.cohorts.length)!;
  const regions = Object.fromEntries(regionIds.map(id => [id, {
    ...socio, cohorts: [{ income: 'low' as const, orientation: 'left' as const, persons: 100 }, { income: 'middle' as const, orientation: 'right' as const, persons: 200 }],
  }]));
  const regionalOpinion = Object.fromEntries(regionIds.map(regionId => [regionId, {
    regionId, countryId, cohorts: { 'low:left': opinion(), 'middle:right': opinion() },
  }]));
  const state: SimulationState = {
    ...initial, socioeconomy: { ...initial.socioeconomy, regions },
    politics: { ...initial.politics, regionalOpinion, countries: {
      ...initial.politics.countries, [countryId]: { ...initial.politics.countries[countryId], regionIds, nationalSupportBps: support },
    } },
  };
  return { state, registry, party, partyId, partyIndex, countryId, regionIds, institution };
}

describe('governance 0.15 contextual leadership succession', () => {
  let start: SimulationState, generated: SimulationState, record: LeadershipSuccession;
  beforeAll(() => {
    const partyId = 'party:country.1aj872z:6870f25598ba', countryId = politicalRegistry.parties[partyId].countryId;
    const definition = politicalRegistry.countries[countryId], dynamic = initial.politics.countries[countryId];
    const regionalOpinion = { ...initial.politics.regionalOpinion };
    // Synthetic current opinion exercises context sensitivity without changing pinned party data.
    for (const regionId of dynamic.regionIds) {
      const regional = regionalOpinion[regionId];
      regionalOpinion[regionId] = { ...regional, cohorts: Object.fromEntries(Object.entries(regional.cohorts).map(([id, opinion]) => {
        const changed = structuredClone(opinion);
        changed[0] = POLITICAL_ISSUES.map(() => 6_500);
        changed[2] = definition.partyIds.map<number>(id => id === partyId ? 1_000 : 0).concat(9_000);
        return [id, changed];
      })) };
    }
    const political = { ...initial, politics: { ...initial.politics, regionalOpinion, countries: { ...initial.politics.countries } } };
    political.politics.countries[countryId] = { ...dynamic, nationalSupportBps: aggregateNationalSupport(political, dynamic.regionIds, regionalOpinion, definition.partyIds.length) };
    const leader = Object.values(political.governance.persons).find(person => person.partyId === partyId && person.isPartyLeader)!;
    start = setControlledPerson(assignPoliticalOffice(political, leader.id, { role: 'head_of_state', countryId }), leader.id);
    generated = replacePartyLeader(start, partyId);
    record = generated.governance.successions[generated.governance.successionOrder.at(-1)!];
    expect(informationInvariant.check(generated, worldContext, 'save')).toEqual([]);
    assertSimulationInvariants(generated, worldContext, 'save');
  }, 30_000);

  it('resolves the same one-time tendency, identity, evidence and profile deterministically without persistent faction or scheduler state', () => {
    const repeated = replacePartyLeader(start, record.partyId);
    expect(repeated.governance).toEqual(generated.governance);
    expect(record.selection).toBe('modelled_internal_balance');
    expect(record.contextEvidence?.method).toBe('internal_party_balance_succession_v1');
    const successor = generated.governance.persons[record.newPersonId];
    expect(successor.leaderProvenance).toMatchObject({
      basis: 'modelled_fallback', method: 'internal_party_balance_succession_v3', referenceDate: generated.date, sourceLeaderStatus: 'unavailable',
    });
    expect(successor.leaderProvenance?.sourceLeader).toBeUndefined();
    expect(record.contextEvidence!.profileFingerprint).toBe(governanceFingerprint(successor.leaderProfile));
    expect(Object.keys(generated)).toEqual(Object.keys(start));
    expect(Object.keys(generated.governance)).toEqual(Object.keys(start.governance));
    for (const key of Object.keys(start) as Array<keyof SimulationState>) if (key !== 'governance') expect(generated[key]).toBe(start[key]);
    expect(Object.keys(generated.governance.persons)).toHaveLength(Object.keys(start.governance.persons).length + 1);
    expect(generated.governance.proposals).toBe(start.governance.proposals);
    expect(generated.governance.successionOrder).toEqual([record.id]);
  });

  it.each([['radical', 8_000], ['moderate', 6_000]] as const)('moves internal weights toward %s current supporters, not a forced random winner', (direction, mandate) => {
    const fixture = leadershipContextFixture(mandate);
    const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry);
    const metrics = deriveLeadershipSelectionMetrics(fixture.party, evidence), weights = metrics.tendencyWeightsBps;
    expect(direction === 'radical' ? metrics.mandateTendencyBps > 0 : metrics.mandateTendencyBps < 0).toBe(true);
    expect(direction === 'radical' ? weights.radical + weights.firm : weights.pragmatic + weights.moderate).toBeGreaterThan(3_000);
    expect(Object.values(weights).reduce((sum, value) => sum + value, 0)).toBe(10_000);
    expect(Object.values(weights).every(value => Number.isSafeInteger(value) && value >= 0)).toBe(true);
  });

  it('uses a real representation gap for adaptation or strong-support mainstream stability', () => {
    const fixture = leadershipContextFixture();
    const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry);
    const baseline = deriveLeadershipSelectionMetrics(fixture.party, evidence);
    expect(baseline).toMatchObject({ mandateTendencyBps: 0, adaptationPressureBps: 0, stabilityPressureBps: 0 });
    expect(baseline.tendencyWeightsBps).toEqual({ radical: 1_000, firm: 2_000, mainstream: 4_000, pragmatic: 2_000, moderate: 1_000 });
    const under = deriveLeadershipSelectionMetrics(fixture.party, { ...evidence, legislativeSeatShare: { ...evidence.legislativeSeatShare, valueBps: 6_000 } });
    expect(under.adaptationPressureBps).toBe(5_000);
    expect(under.stabilityPressureBps).toBe(0);
    expect(under.tendencyWeightsBps.pragmatic + under.tendencyWeightsBps.moderate).toBeGreaterThan(3_000);
    const strong = deriveLeadershipSelectionMetrics(fixture.party, { ...evidence, partySupport: { ...evidence.partySupport, valueBps: 8_000 } });
    expect(strong.stabilityPressureBps).toBe(3_000);
    expect(strong.adaptationPressureBps).toBe(0);
    expect(strong.tendencyWeightsBps.mainstream).toBeGreaterThan(4_000);
  });

  describe('succession integrity micro-corrective', () => {
    it('mirrors exact factors and weights for odd positive and negative mandate signals', () => {
      const expectedFactors = [[10_005, 10_003, 10_000, 9_997, 9_995], [9_995, 9_997, 10_000, 10_003, 10_005]];
      const weights = [5, -5].map((signal, index) => {
        const fixture = leadershipContextFixture(7_000 + signal);
        const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, record.id, fixture.registry);
        const metrics = deriveLeadershipSelectionMetrics(fixture.party, evidence);
        expect(metrics).toMatchObject({ mandateTendencyBps: signal, adaptationPressureBps: 0, stabilityPressureBps: 0 });
        const actual = LEADERSHIP_SUCCESSION_MODEL.tendencies.map(item => metrics.tendencyWeightsBps[item.id]);
        const raw = LEADERSHIP_SUCCESSION_MODEL.tendencies.map((item, i) => ratio(item.baselineWeightBps, expectedFactors[index][i], 10_000));
        expect(actual).toEqual(allocate(10_000, raw));
        return actual;
      });
      expect(expectedFactors[1]).toEqual([...expectedFactors[0]].reverse());
      expect(weights[0]).toEqual([1_001, 2_001, 3_999, 1_999, 1_000]);
      expect(weights[1]).toEqual([...weights[0]].reverse());
    });

    it.each([8_000, 6_000])('ignores zero intensity at mandate %i and responds when only intensity becomes positive', mandate => {
      const fixture = leadershipContextFixture(mandate);
      const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, record.id, fixture.registry);
      for (const position of Object.values(fixture.party.issuePositions)) position.intensityBps = 0;
      const zero = deriveLeadershipSelectionMetrics(fixture.party, evidence);
      expect(zero.mandateTendencyBps).toBe(0);
      expect(zero.tendencyWeightsBps).toEqual({ radical: 1_000, firm: 2_000, mainstream: 4_000, pragmatic: 2_000, moderate: 1_000 });
      expect(evidence.supporterMandate.fiscal_distribution).toMatchObject({ valueBps: mandate, coverage: 'modelled' });
      expect(zero.mandateBlendBps).toBe(2_000);
      fixture.party.issuePositions.fiscal_distribution.intensityBps = 3;
      const positive = deriveLeadershipSelectionMetrics(fixture.party, evidence);
      expect(positive.mandateTendencyBps).toBe(mandate - 7_000);
      expect(positive.tendencyWeightsBps).not.toEqual(zero.tendencyWeightsBps);
    });

    it('uses exact positive intensities without adding zero-intensity issues to either signal sum', () => {
      const fixture = leadershipContextFixture(9_000);
      const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, record.id, fixture.registry);
      for (const position of Object.values(fixture.party.issuePositions)) position.intensityBps = 0;
      fixture.party.issuePositions.fiscal_distribution.intensityBps = 3;
      evidence.supporterMandate.fiscal_distribution.valueBps = 7_005;
      expect(deriveLeadershipSelectionMetrics(fixture.party, evidence).mandateTendencyBps).toBe(5);
      fixture.party.issuePositions.public_services.intensityBps = 2;
      expect(deriveLeadershipSelectionMetrics(fixture.party, evidence).mandateTendencyBps).toBe(803);
    });

    it('retains available representation context when all directional intensities are zero', () => {
      const fixture = leadershipContextFixture(8_000);
      const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, record.id, fixture.registry);
      for (const position of Object.values(fixture.party.issuePositions)) position.intensityBps = 0;
      evidence.legislativeSeatShare.valueBps = 6_000;
      const metrics = deriveLeadershipSelectionMetrics(fixture.party, evidence);
      expect(metrics).toMatchObject({ mandateTendencyBps: 0, adaptationPressureBps: 5_000, stabilityPressureBps: 0, mandateBlendBps: 4_500 });
      expect(metrics.tendencyWeightsBps.pragmatic + metrics.tendencyWeightsBps.moderate).toBeGreaterThan(3_000);
    });

    function rejectsHistory(state: SimulationState, error: RegExp) {
      expect(informationInvariant.check(state, worldContext, 'save').join(' ')).toMatch(error);
      expect(() => serializeSimulationState(state, worldContext)).toThrow(error);
      expect(() => restoreSimulationState(JSON.stringify(state), worldRegions, {}, {}, worldContext)).toThrow(error);
    }

    it('rejects a contextual person created before its generation event at invariant/save/reload', () => {
      const later = replacePartyLeader(advanceSimulationDays(start, 1), record.partyId);
      assertSimulationInvariants(later, worldContext, 'save');
      const malformed = { ...later, governance: structuredClone(later.governance) };
      const succession = malformed.governance.successions[record.id];
      malformed.governance.persons[succession.newPersonId].createdOn = start.date;
      rejectsHistory(malformed, /Invalid contextual leadership succession/);
    }, 30_000);

    it('rejects duplicate contextual generation with otherwise valid keyed proofs at invariant/save/reload', () => {
      let state = replacePartyLeader(setControlledPerson(start), record.partyId);
      const first = state.governance.successions[record.id], evidence = first.contextEvidence!;
      const weights = deriveLeadershipSelectionMetrics(politicalRegistry.parties[first.partyId], evidence).tendencyWeightsBps;
      let repeated: LeadershipSuccession | undefined;
      // Keep both keyed proofs valid so only the duplicate generation is corrupt.
      for (let attempt = 0; attempt < 50; attempt++) {
        state = replacePartyLeader(state, first.partyId, first.previousPersonId);
        state = replacePartyLeader(state, first.partyId, first.newPersonId);
        const candidate = state.governance.successions[state.governance.successionOrder.at(-1)!];
        if (selectLeadershipTendency(state.engine.seed, first.partyId, candidate.effectiveDate, candidate.id, weights) === evidence.selectedTendency) {
          repeated = candidate; break;
        }
      }
      expect(repeated).toBeDefined();
      assertSimulationInvariants(state, worldContext, 'save');
      const malformed = { ...state, governance: structuredClone(state.governance) };
      const duplicate = malformed.governance.successions[repeated!.id];
      duplicate.selection = 'modelled_internal_balance';
      duplicate.contextEvidence = structuredClone(evidence);
      expect(leadershipProfileFromEvidence(politicalRegistry.parties[first.partyId], duplicate.contextEvidence)).toEqual(malformed.governance.persons[duplicate.newPersonId].leaderProfile);
      rejectsHistory(malformed, /Duplicate contextual leadership generation/);
    }, 30_000);

    it('rejects a broken same-party chain with intact profiles and references at invariant/save/reload', () => {
      const next = replacePartyLeader(resolvePlayerHandoff(generated, record.id, 'continue'), record.partyId);
      assertSimulationInvariants(next, worldContext, 'save');
      const malformed = { ...next, governance: structuredClone(next.governance) };
      const second = malformed.governance.successions[malformed.governance.successionOrder.at(-1)!];
      expect(second.previousPersonId).toBe(record.newPersonId);
      second.previousPersonId = record.previousPersonId;
      rejectsHistory(malformed, /Discontinuous party leadership succession/);
    }, 30_000);

    it('accepts former-leader returns and independent interleaved party chains through save/reload', () => {
      let state = replacePartyLeader(setControlledPerson(start), record.partyId);
      const first = state.governance.successions[record.id], otherPartyId = historicalFallbackFixture.succession.partyId;
      expect(otherPartyId).not.toBe(first.partyId);
      state = replacePartyLeader(state, otherPartyId);
      const other = state.governance.successions[state.governance.successionOrder.at(-1)!];
      state = replacePartyLeader(state, first.partyId, first.previousPersonId);
      state = replacePartyLeader(state, first.partyId);
      const third = state.governance.successions[state.governance.successionOrder.at(-1)!];
      state = replacePartyLeader(state, otherPartyId, other.previousPersonId);
      state = replacePartyLeader(state, first.partyId, first.newPersonId);
      const chain = state.governance.successionOrder.map(id => state.governance.successions[id]).filter(item => item.partyId === first.partyId);
      expect(chain.map(item => [item.previousPersonId, item.newPersonId])).toEqual([
        [first.previousPersonId, first.newPersonId], [first.newPersonId, first.previousPersonId],
        [first.previousPersonId, third.newPersonId], [third.newPersonId, first.newPersonId],
      ]);
      expect(chain.at(-1)!.selection).toBe('existing_party_member');
      expect(chain.at(-1)!.contextEvidence).toBeUndefined();
      expect(chain.filter(item => item.selection === 'modelled_internal_balance').map(item => item.newPersonId)).toEqual([first.newPersonId, third.newPersonId]);
      expect(state.governance.persons[first.newPersonId]).toEqual({ ...generated.governance.persons[record.newPersonId], isPartyLeader: true });
      assertSimulationInvariants(state, worldContext, 'save');
      const serialized = serializeSimulationState(state, worldContext);
      const restored = restoreSimulationState(serialized, worldRegions, {}, {}, worldContext);
      expect(restored).toEqual(state);
      expect(serializeSimulationState(restored, worldContext)).toBe(serialized);
    }, 30_000);
  });

  describe('consolidated closure leadership integrity', () => {
    it('rejects historical party switches before mutation, permits same-party no-ops and unrelated membership changes', () => {
      const state = resolvePlayerHandoff(generated, record.id, 'continue');
      const otherParty = politicalRegistry.countries[record.countryId].partyIds.find(id => id !== record.partyId)!;
      const before = serializeSimulationState(state, worldContext);
      expect(() => setPartyMembership(state, record.previousPersonId, otherParty)).toThrow(/succession history/);
      expect(() => setPartyMembership(state, record.previousPersonId)).toThrow(/succession history/);
      expect(serializeSimulationState(state, worldContext)).toBe(before);
      expect(setPartyMembership(state, record.previousPersonId, record.partyId).governance.persons).toEqual(state.governance.persons);
      let unrelated = createPoliticalPerson(state, { displayName: 'Unrelated closure member', countryId: record.countryId });
      const id = `person.${String(state.governance.nextPersonSequence).padStart(8, '0')}`;
      unrelated = setPartyMembership(setPartyMembership(unrelated, id, record.partyId), id, otherParty);
      expect(unrelated.governance.persons[id].partyId).toBe(otherParty);
      assertSimulationInvariants(unrelated, worldContext, 'save');
    }, 30_000);

    it('accepts two sequential Switch handoffs and later unrelated control changes through save/reload', () => {
      let state = resolvePlayerHandoff(generated, record.id, 'switch');
      state = replacePartyLeader(state, record.partyId);
      const second = state.governance.successions[state.governance.successionOrder.at(-1)!];
      expect(second.playerHandoff?.status).toBe('pending');
      state = resolvePlayerHandoff(state, second.id, 'switch');
      expect(state.governance.player.controlledPersonId).toBe(second.newPersonId);
      expect(state.governance.successions[record.id].playerHandoff?.status).toBe('switched');
      expect(restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext)).toEqual(state);
      state = setControlledPerson(state, record.previousPersonId);
      expect(restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext)).toEqual(state);
    }, 30_000);

    it('accepts Continue followed by later player control changes without rewriting the historical decision', () => {
      const continued = resolvePlayerHandoff(generated, record.id, 'continue');
      const next = setControlledPerson(continued, record.newPersonId);
      expect(next.governance.successions[record.id]).toEqual(continued.governance.successions[record.id]);
      expect(restoreSimulationState(serializeSimulationState(next, worldContext), worldRegions, {}, {}, worldContext)).toEqual(next);
    }, 30_000);

    it('rejects pending control bypass and a second same-party succession without mutating state', () => {
      const before = serializeSimulationState(generated, worldContext);
      expect(() => setControlledPerson(generated, record.newPersonId)).toThrow(/pending leadership handoff/);
      expect(() => setControlledPerson(generated)).toThrow(/pending leadership handoff/);
      expect(() => replacePartyLeader(generated, record.partyId)).toThrow(/pending player handoff/);
      expect(() => replacePartyLeader(generated, record.partyId, record.previousPersonId)).toThrow(/pending player handoff/);
      expect(setControlledPerson(generated, record.previousPersonId).governance).toEqual(generated.governance);
      expect(serializeSimulationState(generated, worldContext)).toBe(before);
      const otherPartyId = historicalFallbackFixture.succession.partyId;
      expect(replacePartyLeader(generated, otherPartyId).governance.successionOrder).toHaveLength(2);
    }, 30_000);

    const corruptions: Array<[string, (state: SimulationState) => void, RegExp]> = [
      ['pending decision date', state => { state.governance.successions[record.id].playerHandoff!.decidedOn = state.date; }, /Malformed player handoff/],
      ['pending control mismatch', state => { state.governance.player.controlledPersonId = record.newPersonId; }, /Malformed player handoff/],
      ['resolved missing decision date', state => { state.governance.successions[record.id].playerHandoff!.status = 'continued'; }, /Malformed player handoff/],
      ['resolved future decision date', state => { Object.assign(state.governance.successions[record.id].playerHandoff!, { status: 'continued', decidedOn: '2026-01-02' }); }, /Malformed player handoff/],
      ['resolved decision predating event', state => { Object.assign(state.governance.successions[record.id].playerHandoff!, { status: 'continued', decidedOn: '2025-12-31' }); }, /Malformed player handoff/],
      ['unknown provenance method', state => { Object.assign(state.governance.persons[record.previousPersonId].leaderProvenance!, { method: 'invented_method' }); }, /Invalid party leader provenance/],
      ['future provenance date', state => { state.governance.persons[record.previousPersonId].leaderProvenance!.referenceDate = '2026-01-02'; }, /Invalid party leader provenance/],
      ['missing profile issue', state => { delete state.governance.persons[record.previousPersonId].leaderProfile!.public_services; }, /Invalid political leader profile/],
      ['extra profile issue', state => { Object.assign(state.governance.persons[record.previousPersonId].leaderProfile!, { impossible: state.governance.persons[record.previousPersonId].leaderProfile!.public_services }); }, /Invalid political leader profile/],
      ['array profile structure', state => { Object.assign(state.governance.persons[record.previousPersonId], { leaderProfile: [] }); }, /Invalid political leader profile/],
      ['null profile dimension', state => { Object.assign(state.governance.persons[record.previousPersonId].leaderProfile!, { public_services: null }); }, /Invalid political leader profile/],
      ['profile malformed status', state => { Object.assign(state.governance.persons[record.previousPersonId].leaderProfile!.public_services, { status: 'sourced' }); }, /Invalid political leader profile/],
      ['profile unsafe confidence', state => { state.governance.persons[record.previousPersonId].leaderProfile!.public_services.confidenceBps = 10_001; }, /Invalid political leader profile/],
    ];
    it.each(corruptions)('rejects %s at invariant/save/reload', (_name, mutate, error) => {
      const malformed = { ...generated, governance: structuredClone(generated.governance) };
      mutate(malformed);
      expect(informationInvariant.check(malformed, worldContext, 'save').join(' ')).toMatch(error);
      expect(() => serializeSimulationState(malformed, worldContext)).toThrow(error);
      expect(() => restoreSimulationState(JSON.stringify(malformed), worldRegions, {}, {}, worldContext)).toThrow(error);
    }, 30_000);

    it('rejects an arbitrary existing member as the first succession root', () => {
      let state = createPoliticalPerson(resolvePlayerHandoff(generated, record.id, 'continue'), { displayName: 'Invented initial predecessor', countryId: record.countryId });
      const id = `person.${String(generated.governance.nextPersonSequence).padStart(8, '0')}`;
      state = setPartyMembership(state, id, record.partyId);
      const malformed = { ...state, governance: structuredClone(state.governance) };
      malformed.governance.successions[record.id].previousPersonId = id;
      delete malformed.governance.successions[record.id].playerHandoff;
      expect(informationInvariant.check(malformed, worldContext, 'save').join(' ')).toMatch(/Invalid initial party leadership root/);
      expect(() => serializeSimulationState(malformed, worldContext)).toThrow(/Invalid initial party leadership root/);
      expect(() => restoreSimulationState(JSON.stringify(malformed), worldRegions, {}, {}, worldContext)).toThrow(/Invalid initial party leadership root/);
    }, 30_000);
    it('rejects persisted history bypassing an earlier pending handoff', () => {
      const state = replacePartyLeader(resolvePlayerHandoff(generated, record.id, 'continue'), record.partyId);
      const malformed = { ...state, governance: structuredClone(state.governance) };
      malformed.governance.successions[record.id].playerHandoff!.status = 'pending';
      delete malformed.governance.successions[record.id].playerHandoff!.decidedOn;
      expect(informationInvariant.check(malformed, worldContext, 'save').join(' ')).toMatch(/bypasses a pending handoff/);
      expect(() => serializeSimulationState(malformed, worldContext)).toThrow(/bypasses a pending handoff/);
      expect(() => restoreSimulationState(JSON.stringify(malformed), worldRegions, {}, {}, worldContext)).toThrow(/bypasses a pending handoff/);
    }, 30_000);
  });

  it.each(['support', 'seats', 'both'] as const)('keeps missing %s evidence unavailable without inventing a representation gap', missing => {
    const fixture = leadershipContextFixture();
    if (missing !== 'seats') delete fixture.state.politics.countries[fixture.countryId];
    if (missing !== 'support') fixture.institution.chambers = [];
    const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry);
    const metrics = deriveLeadershipSelectionMetrics(fixture.party, evidence);
    expect(metrics).toMatchObject({ adaptationPressureBps: 0, stabilityPressureBps: 0 });
    for (const metric of [evidence.partySupport, evidence.legislativeSeatShare, ...Object.values(evidence.supporterMandate)]) {
      if (metric.coverage === 'unavailable') expect(metric).not.toHaveProperty('valueBps');
    }
    expect(evidence).not.toHaveProperty('representationGapBps');
    expect(buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry)).toEqual(evidence);
    if (missing === 'both') expect(metrics.tendencyWeightsBps).toEqual({ radical: 1_000, firm: 2_000, mainstream: 4_000, pragmatic: 2_000, moderate: 1_000 });
  });

  it('uses equal-chamber shares, retaining known zero only for complete sourced absence', () => {
    const fixture = leadershipContextFixture(), first = fixture.institution.chambers[0];
    const second = { ...first, id: 'chamber.leadership-second', totalSeats: 200, seatsByParty: { [fixture.partyId]: 100 }, independentOtherSeats: 100 };
    fixture.institution.chambers.push(second, { ...first, id: 'chamber.leadership-unavailable', seatAllocationStatus: 'unavailable', seatsByParty: {} });
    expect(buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry).legislativeSeatShare).toMatchObject({ coverage: 'sourced', valueBps: 4_000 });
    fixture.institution.chambers = [{ ...first, seatsByParty: {}, independentOtherSeats: 100 }];
    expect(buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry).legislativeSeatShare).toMatchObject({ coverage: 'sourced', valueBps: 0 });
  });

  it('keeps absent represented supporters unavailable while preserving evidenced zero party support', () => {
    const fixture = leadershipContextFixture(7_000, 0);
    const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry);
    expect(evidence.partySupport).toMatchObject({ coverage: 'modelled', valueBps: 0 });
    for (const metric of Object.values(evidence.supporterMandate)) {
      expect(metric.coverage).toBe('unavailable'); expect(metric).not.toHaveProperty('valueBps');
    }
    expect(deriveLeadershipSelectionMetrics(fixture.party, evidence).mandateBlendBps).toBe(0);
  });

  it('keeps an unreconciled national-support vector unavailable rather than clamping it to zero', () => {
    const fixture = leadershipContextFixture();
    fixture.state.politics.countries[fixture.countryId].nationalSupportBps[fixture.partyIndex] = -1;
    const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry);
    expect(evidence.partySupport.coverage).toBe('unavailable'); expect(evidence.partySupport).not.toHaveProperty('valueBps');
    expect(evidence.partySupport.limitation).toContain('does not reconcile');
    expect(deriveLeadershipSelectionMetrics(fixture.party, evidence)).toMatchObject({ adaptationPressureBps: 0, stabilityPressureBps: 0 });
  });

  it('computes exact BigInt supporter means independent of Region, cohort and party insertion order without scanning other Countries', () => {
    const fixture = leadershipContextFixture();
    const [a, b] = fixture.regionIds;
    const people = [4_000_000_000_001, 2_000_000_000_007], supports = [1_234, 9_876], preferences = [8_001, 2_003];
    for (const regionId of fixture.regionIds) {
      fixture.state.socioeconomy.regions[regionId].cohorts.forEach((cohort, index) => { cohort.persons = people[index]; });
      Object.values(fixture.state.politics.regionalOpinion[regionId].cohorts).forEach((opinion, index) => {
        opinion[0] = POLITICAL_ISSUES.map(() => preferences[index]);
        opinion[2][fixture.partyIndex] = supports[index]; opinion[2][opinion[2].length - 1] = 10_000 - supports[index];
      });
    }
    const numerator = BigInt(people[0]) * BigInt(supports[0]) * BigInt(preferences[0]) + BigInt(people[1]) * BigInt(supports[1]) * BigInt(preferences[1]);
    const denominator = BigInt(people[0]) * BigInt(supports[0]) + BigInt(people[1]) * BigInt(supports[1]);
    expect(numerator).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    const expected = Number((numerator + denominator / 2n) / denominator);
    const before = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry);
    expect(POLITICAL_ISSUES.every(issue => before.supporterMandate[issue].valueBps === expected)).toBe(true);
    fixture.state.politics.countries[fixture.countryId].regionIds = [b, a];
    for (const regionId of fixture.regionIds) {
      fixture.state.politics.regionalOpinion[regionId].cohorts = Object.fromEntries(Object.entries(fixture.state.politics.regionalOpinion[regionId].cohorts).reverse());
      fixture.state.socioeconomy.regions[regionId].cohorts.reverse();
    }
    fixture.registry.parties = Object.fromEntries(Object.entries(fixture.registry.parties).reverse());
    fixture.state.politics.regionalOpinion = new Proxy(fixture.state.politics.regionalOpinion, { ownKeys() { throw new Error('Unexpected world scan.'); } });
    fixture.state.socioeconomy.regions = new Proxy(fixture.state.socioeconomy.regions, { ownKeys() { throw new Error('Unexpected world scan.'); } });
    expect(buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry)).toEqual(before);
  });

  it('rejects malformed opinion instead of turning an unknown preference into a numeric zero', () => {
    const fixture = leadershipContextFixture();
    fixture.state.politics.regionalOpinion[fixture.regionIds[0]].cohorts['low:left'][0][0] = NaN;
    expect(() => buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry)).toThrow(/Invalid leadership supporter opinion/);
  });

  it('bounds every modelled profile and prevents tendency-only moderation crossing neutral', () => {
    const fixture = leadershipContextFixture();
    delete fixture.state.politics.countries[fixture.countryId];
    const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, 'succession.00000000', fixture.registry);
    for (const preference of [0, 4_000, 5_000, 6_000, 10_000]) {
      for (const position of Object.values(fixture.party.issuePositions)) position.preferenceBps = preference;
      for (const tendency of LEADERSHIP_SUCCESSION_MODEL.tendencies) {
        const profile = leadershipProfileFromEvidence(fixture.party, { ...evidence, selectedTendency: tendency.id });
        for (const dimension of Object.values(profile)) {
          expect(dimension.status).toBe('modelled'); expect(dimension.confidenceBps).toBe(7_000);
          expect(dimension.valueBps).toBeGreaterThanOrEqual(0); expect(dimension.valueBps).toBeLessThanOrEqual(10_000);
          expect(Math.abs(dimension.valueBps - preference)).toBeLessThanOrEqual(2_500);
          if (tendency.stanceBps < 0) expect(Math.sign(dimension.valueBps - 5_000) * Math.sign(preference - 5_000)).toBeGreaterThanOrEqual(0);
          if (preference === 5_000) expect(dimension.valueBps).toBe(5_000);
        }
      }
    }
    const extreme = leadershipContextFixture(10_000);
    for (const position of Object.values(extreme.party.issuePositions)) position.preferenceBps = 6_000;
    const context = buildLeadershipSuccessionEvidence(extreme.state, extreme.partyId, 'succession.00000000', extreme.registry);
    context.legislativeSeatShare.valueBps = 10_000;
    expect(leadershipProfileFromEvidence(extreme.party, { ...context, selectedTendency: 'radical' }).public_services.valueBps).toBe(8_500);
  });

  it('rejects unsafe or nonconserving tendency weights and unsupported profile models', () => {
    const fixture = leadershipContextFixture();
    const evidence = buildLeadershipSuccessionEvidence(fixture.state, fixture.partyId, record.id, fixture.registry);
    const weights = deriveLeadershipSelectionMetrics(fixture.party, evidence).tendencyWeightsBps;
    for (const value of [-1, 0.5, NaN, 9_999]) expect(() => selectLeadershipTendency(fixture.state.engine.seed, fixture.partyId, fixture.state.date, record.id, { ...weights, radical: value })).toThrow(/Invalid leadership tendency weights/);
    expect(() => leadershipProfileFromEvidence(fixture.party, Object.assign(structuredClone(evidence), { method: 'unsupported' }))).toThrow(/Unsupported leadership succession evidence model/);
  });

  it('preserves generated player handoff, prior office and exact schema-13 reload without rereading current opinion', () => {
    expect(generated.governance.player.controlledPersonId).toBe(record.previousPersonId);
    expect(generated.governance.persons[record.previousPersonId].office).toEqual(start.governance.persons[record.previousPersonId].office);
    expect(generated.governance.persons[record.previousPersonId].isPartyLeader).toBe(false);
    expect(record.playerHandoff?.status).toBe('pending');
    const continued = resolvePlayerHandoff(generated, record.id, 'continue'), switched = resolvePlayerHandoff(generated, record.id, 'switch');
    expect(continued.governance.player.controlledPersonId).toBe(record.previousPersonId);
    expect(switched.governance.player.controlledPersonId).toBe(record.newPersonId);
    expect(() => resolvePlayerHandoff(switched, record.id, 'continue')).toThrow(/no pending/);
    const serialized = serializeSimulationState(switched, worldContext);
    const restored = restoreSimulationState(serialized, worldRegions, {}, {}, worldContext);
    expect(restored).toEqual(switched); expect(serializeSimulationState(restored, worldContext)).toBe(serialized);
    expect([restored.engine.seed, restored.engine.tick, restored.date]).toEqual([switched.engine.seed, switched.engine.tick, switched.date]);
    const later = { ...switched, politics: initial.politics };
    expect(informationInvariant.check(later, worldContext, 'save')).toEqual([]);
    expect(later.governance.successions[record.id].contextEvidence).toEqual(record.contextEvidence);
    expect(restoreSimulationState(serializeSimulationState(later, worldContext), worldRegions, {}, {}, worldContext)).toEqual(later);
  }, 30_000);

  it('preserves an explicitly supplied member profile and provenance without claiming model selection', () => {
    let state = createPoliticalPerson(start, { displayName: 'Explicit contextual test member', countryId: record.countryId });
    const id = `person.${String(start.governance.nextPersonSequence).padStart(8, '0')}`;
    state = setPartyMembership(state, id, record.partyId);
    const member = {
      ...state.governance.persons[id], leaderProfile: structuredClone(start.governance.persons[record.previousPersonId].leaderProfile),
      leaderProvenance: {
        basis: 'modelled_fallback' as const, method: 'bounded_party_platform_succession_v2' as const,
        sourcePartyId: politicalRegistry.parties[record.partyId].sourceBasis.sourcePartyId, referenceDate: start.date,
        sourceLeaderStatus: 'unavailable' as const, limitation: 'Explicit existing-person test provenance, not a generated selection.',
      },
    };
    state = { ...state, governance: { ...state.governance, persons: { ...state.governance.persons, [id]: member } } };
    const chosen = replacePartyLeader(state, record.partyId, id), succession = chosen.governance.successions[record.id];
    expect(succession.selection).toBe('existing_party_member'); expect(succession).not.toHaveProperty('contextEvidence');
    expect(chosen.governance.persons[id]).toEqual({ ...member, isPartyLeader: true });
    const loaded = restoreSimulationState(serializeSimulationState(chosen, worldContext), worldRegions, {}, {}, worldContext);
    expect(loaded).toEqual(chosen);
    succession.contextEvidence = structuredClone(record.contextEvidence);
    expect(informationInvariant.check(chosen, worldContext, 'save').join(' ')).toContain('Invalid contextual leadership succession');
    expect(() => serializeSimulationState(chosen, worldContext)).toThrow(/Invalid contextual leadership succession/);
    expect(() => restoreSimulationState(JSON.stringify(chosen), worldRegions, {}, {}, worldContext)).toThrow(/Invalid contextual leadership succession/);
  }, 30_000);

  it('reloads the genuine reviewed-parent bounded fallback byte/structure-equivalently without new evidence', () => {
    const fixture = historicalFallbackFixture as {
      referenceCommit: string; date: string; tick: number; seed: string; previous: PoliticalPersonState; successor: PoliticalPersonState;
      succession: LeadershipSuccession; nextPersonSequence: number; nextSuccessionSequence: number; player: { controlledPersonId: string };
    };
    expect(fixture.referenceCommit).toBe('323d702a49ed15eef388841d12b3f54a8acbd466');
    const state = { ...initial, date: fixture.date, engine: { ...initial.engine, seed: fixture.seed, tick: fixture.tick }, governance: {
      ...initial.governance, persons: { ...initial.governance.persons, [fixture.previous.id]: fixture.previous, [fixture.successor.id]: fixture.successor },
      successions: { [fixture.succession.id]: fixture.succession }, successionOrder: [fixture.succession.id],
      nextPersonSequence: fixture.nextPersonSequence, nextSuccessionSequence: fixture.nextSuccessionSequence, player: fixture.player,
    } };
    const serialized = serializeSimulationState(state, worldContext), loaded = restoreSimulationState(serialized, worldRegions, {}, {}, worldContext);
    expect(loaded).toEqual(state); expect(serializeSimulationState(loaded, worldContext)).toBe(serialized);
    expect(JSON.stringify(loaded.governance.persons[fixture.successor.id])).toBe(JSON.stringify(fixture.successor));
    expect(JSON.stringify(loaded.governance.successions[fixture.succession.id])).toBe(JSON.stringify(fixture.succession));
    expect(loaded.governance.successions[fixture.succession.id]).not.toHaveProperty('contextEvidence');
  }, 30_000);

  const tamperCases: Array<[string, (state: SimulationState, succession: LeadershipSuccession, evidence: LeadershipSuccessionEvidence) => void]> = [
    ['party-support value', (_state, _succession, evidence) => { evidence.partySupport.valueBps = 10_000; }],
    ['unavailable with value', (_state, _succession, evidence) => { evidence.partySupport.coverage = 'unavailable'; }],
    ['available without value', (_state, _succession, evidence) => { delete evidence.partySupport.valueBps; }],
    ['negative bps', (_state, _succession, evidence) => { evidence.partySupport.valueBps = -1; }],
    ['seat-share value', (_state, _succession, evidence) => { evidence.legislativeSeatShare.valueBps = 10_000; }],
    ['seat-share coverage', (_state, _succession, evidence) => { evidence.legislativeSeatShare.coverage = 'modelled'; }],
    ['supporter-mandate value', (_state, _succession, evidence) => { evidence.supporterMandate.public_services.valueBps = 10_000; }],
    ['missing mandate issue', (_state, _succession, evidence) => { delete (evidence.supporterMandate as Partial<typeof evidence.supporterMandate>).public_services; }],
    ['extra mandate issue', (_state, _succession, evidence) => { Object.assign(evidence.supporterMandate, { unexpected: evidence.supporterMandate.public_services }); }],
    ['mandate coverage', (_state, _succession, evidence) => { evidence.supporterMandate.public_services.coverage = 'sourced'; }],
    ['empty metric source', (_state, _succession, evidence) => { evidence.partySupport.source = ' '; }],
    ['empty metric limitation', (_state, _succession, evidence) => { evidence.legislativeSeatShare.limitation = ''; }],
    ['selected tendency', (_state, _succession, evidence) => { evidence.selectedTendency = evidence.selectedTendency === 'radical' ? 'moderate' : 'radical'; }],
    ['successor profile', (state, succession) => { state.governance.persons[succession.newPersonId].leaderProfile!.public_services.valueBps++; }],
    ['profile fingerprint', (_state, _succession, evidence) => { evidence.profileFingerprint = 'incorrect'; }],
    ['succession party', (_state, succession) => { succession.partyId = historicalFallbackFixture.succession.partyId; }],
    ['provenance method', (state, succession) => { state.governance.persons[succession.newPersonId].leaderProvenance!.method = 'bounded_party_platform_succession_v2'; }],
    ['provenance source party', (state, succession) => { state.governance.persons[succession.newPersonId].leaderProvenance!.sourcePartyId = 'unknown'; }],
    ['provenance reference date', (state, succession) => { state.governance.persons[succession.newPersonId].leaderProvenance!.referenceDate = '2025-12-31'; }],
    ['generated source identity', (state, succession) => { state.governance.persons[succession.newPersonId].leaderProvenance!.sourceLeader = { id: 'wikidata:Q1', name: 'Invented real reference', sourceRecordIds: ['test'] }; }],
    ['evidence method', (_state, _succession, evidence) => { Object.assign(evidence, { method: 'unsupported' }); }],
    ['missing context evidence', (_state, succession) => { delete succession.contextEvidence; }],
    ['historical selection downgrade', (_state, succession) => { succession.selection = 'modelled_fallback'; delete succession.contextEvidence; }],
    ['orphan generated provenance', (state, succession) => { delete state.governance.successions[succession.id]; state.governance.successionOrder = []; }],
  ];
  it.each(tamperCases)('rejects independent contextual %s corruption at invariant/save/reload', (_name, mutate) => {
    const malformed = { ...generated, governance: structuredClone(generated.governance) };
    const succession = malformed.governance.successions[record.id];
    mutate(malformed, succession, succession.contextEvidence!);
    expect(informationInvariant.check(malformed, worldContext, 'save').join(' ')).toContain('Invalid contextual leadership succession');
    expect(() => serializeSimulationState(malformed, worldContext)).toThrow(/Invalid contextual leadership succession/);
    expect(() => restoreSimulationState(JSON.stringify(malformed), worldRegions, {}, {}, worldContext)).toThrow(/Invalid contextual leadership succession/);
  }, 30_000);
});

const completeCountryIds = () => Object.values(politicalRegistry.countries).filter(country => {
  const institution = politicalRegistry.institutions[country.institutionId];
  return institution?.chambers.length && institution.chambers.every(chamber => chamber.seatAllocationStatus === 'sourced' && chamber.totalSeats !== undefined && (chamber.independentOtherSeats ?? 0) === 0 && Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0) === chamber.totalSeats);
}).map(country => country.countryId).sort();

function playerFor(state: SimulationState, countryId: string, name = 'Player Person') {
  let next = createPoliticalPerson(state, { displayName: name, countryId });
  const id = Object.keys(next.governance.persons).at(-1)!;
  next = setControlledPerson(next, id);
  next = assignPoliticalOffice(next, id, { role: 'head_of_government', countryId });
  return { state: next, id };
}

function budgetProposal(state: SimulationState, personId: string, countryId: string, factor: 2 | 0) {
  const current = state.fiscal.countries[countryId].annualBudget;
  return createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate: '2026-02-01', payload: { annualBudget: { ...current, infrastructure: factor ? current.infrastructure * factor : 0 } } });
}

const resolvableCountry = () => completeCountryIds().find(id => politicalRegistry.countries[id].partyIds.length && initial.fiscal.countries[id].annualBudget.incomeSupport > 0 && initial.fiscal.countries[id].annualBudget.infrastructure > 0)!;
function draft(state: SimulationState, personId: string, countryId: string, payload: FiscalProposalPayload, effectiveDate = '2026-02-01') {
  const next = createFiscalProposal(state, { proposerPersonId: personId, countryId, effectiveDate, payload });
  return { state: next, proposal: next.governance.proposals[next.governance.proposalOrder.at(-1)!] };
}
function modelled(rule: TaxRule): TaxRule { return { ...structuredClone(rule), status: 'modelled', source: 'explicit governance test evidence', document: 'synthetic fixture', limitations: 'Test-only causal fixture.' }; }
function countryWithRule(kind: TaxKind, present: boolean) { return worldCountryIds.find(id => Boolean(initial.fiscal.countries[id].policy[kind]) === present)!; }
function taxDraft(kind: TaxKind, mutate: (rule: TaxRule) => void, present = true) {
  const countryId = countryWithRule(kind, present), player = playerFor(initial, countryId), policy = structuredClone(player.state.fiscal.countries[countryId].policy);
  if (present) { const rule = modelled(policy[kind]!); mutate(rule); policy[kind] = rule; }
  else { const rule: TaxRule = { id: `test.${countryId}.${kind}`, countryId, kind, status: 'modelled', scope: 'national', currency: 'USD', unit: 'annual USD and basis points', effectiveDate: '2026-02-01', referenceDate: '2026-02-01', retrievedAt: '2026-01-01', source: 'explicit governance test evidence', document: 'synthetic fixture', limitations: 'Unknown production baseline retained as unavailable.', ...(kind === 'payroll' ? { employee: [{ rateBps: 2_000 }], employer: [{ rateBps: 2_000 }] } : kind === 'personal' ? { allowance: 1_000, bands: [{ lower: 0, rateBps: 2_000 }] } : { rateBps: 2_000 }) }; policy[kind] = rule; }
  const made = draft(player.state, player.id, countryId, { policy }); return { ...made, countryId, personId: player.id };
}
function profile(partyId: string, overrides: Partial<Record<GovernanceGoal, Partial<PartyGoalProfile['goals'][GovernanceGoal]>>>): PartyGoalProfile {
  return derivePartyGoalProfile(politicalRegistry.parties[partyId], overrides);
}

function schema12Base() {
  const legacy = structuredClone(initial) as unknown as Record<string, unknown>;
  legacy.schemaVersion = 12;
  delete legacy.information;
  legacy.information = emptyInformation('2026-01-01');
  legacy.governance = { version: 'governance-0.14-v1', initializedOn: '2026-01-01', player: {}, persons: {}, proposals: {}, proposalOrder: [], nextPersonSequence: 0, nextProposalSequence: 0 };
  return legacy as unknown as SimulationState;
}

/** Exact aggregate-only persistence boundary used by d2f3ce; never calls the current vote resolver. */
function d2LegacyResolved(mode: 'enacted' | 'rejected' | 'all_abstain') {
  const countryId = resolvableCountry(), player = playerFor(schema12Base(), countryId); let state = budgetProposal(player.state, player.id, countryId, 2), proposalId = state.governance.proposalOrder[0]; state = submitProposal(state, proposalId);
  state = { ...state, fiscal: { ...state.fiscal, reforms: state.fiscal.reforms.map(reform => ({ ...reform })), reformReceipts: [...state.fiscal.reformReceipts] } };
  const proposal = state.governance.proposals[proposalId], institution = politicalRegistry.institutions[politicalRegistry.countries[countryId].institutionId];
  const chambers = institution.chambers.map(chamber => {
    const totalSeats = chamber.totalSeats!;
    return { chamberId: chamber.id, yesSeats: mode === 'enacted' ? totalSeats : 0, noSeats: mode === 'rejected' ? totalSeats : 0, abstainSeats: mode === 'all_abstain' ? totalSeats : 0, unavailableSeats: 0, totalSeats, coverage: 'complete' as const, adopted: mode === 'enacted' };
  });
  const sum = (field: 'yesSeats' | 'noSeats' | 'abstainSeats' | 'unavailableSeats') => chambers.reduce((total, chamber) => total + chamber[field], 0), totalSeats = chambers.reduce((total, chamber) => total + chamber.totalSeats, 0);
  const parliamentaryEstimate = { yesSeats: sum('yesSeats'), noSeats: sum('noSeats'), abstainSeats: sum('abstainSeats'), unavailableSeats: 0, totalSeats, chambers, coverage: 'complete' as const, confidenceBps: mode === 'all_abstain' ? 500 : 8_000, procedure: 'modelled_procedure_v1' as const };
  const publicEstimate = { supportBps: mode === 'enacted' ? 7_000 : 2_000, opposeBps: mode === 'enacted' ? 2_000 : 7_000, neutralBps: 1_000, coverage: 'complete' as const, representedPersons: 1_000_000, drivers: [] };
  const enacted = mode === 'enacted', outcome = enacted ? 'adopted' as const : 'rejected' as const, sequence = enacted ? state.fiscal.nextSequence : undefined;
  if (enacted) state = scheduleFiscalReform(state, { countryId, effectiveDate: proposal.effectiveDate, ...structuredClone(proposal.payload) });
  state.governance.proposals[proposalId] = { ...proposal, status: enacted ? 'enacted' : 'rejected', resolvedOn: state.date, publicEstimate, parliamentaryEstimate, voteResult: { ...parliamentaryEstimate, outcome, resolvedOn: state.date }, scheduledFiscalReformSequence: sequence } as unknown as typeof proposal;
  expect(state.governance.proposals[proposalId].analysis).toBeUndefined(); expect(state.governance.proposals[proposalId].evaluationVersion).toBeUndefined(); expect(state.governance.proposals[proposalId].enactmentReference).toBeUndefined();
  expect(state.fiscal.reforms.every(reform => reform.origin === undefined)).toBe(true); expect(state.fiscal.reformReceipts).toEqual([]); delete (state.fiscal as Partial<typeof state.fiscal>).reformReceipts;
  const legacy = structuredClone(state) as unknown as Record<string, unknown>;
  legacy.schemaVersion = 12;
  delete legacy.information;
  const oldGovernance = legacy.governance as Record<string, unknown>;
  delete oldGovernance.leadersInitializedOn;
  delete oldGovernance.successions;
  delete oldGovernance.successionOrder;
  delete oldGovernance.nextSuccessionSequence;
  return { state: legacy as unknown as SimulationState, proposalId, countryId, sequence };
}

function findResolvable(adopted: boolean) {
  for (const countryId of completeCountryIds()) {
    const player = playerFor(initial, countryId), candidates = [budgetProposal(player.state, player.id, countryId, 2)];
    for (const state of candidates) {
      const proposal = state.governance.proposals[state.governance.proposalOrder.at(-1)!], registry = structuredClone(politicalRegistry) as PoliticalRegistry;
      const analysis = inspectProposalSupport(state, proposal.id).analysis, profiles: Record<string, PartyGoalProfile> = {};
      for (const partyId of registry.countries[countryId].partyIds) {
        const overrides: Partial<Record<GovernanceGoal, Partial<PartyGoalProfile['goals'][GovernanceGoal]>>> = {};
        for (const [goal, direction] of Object.entries(analysis.issueEffects) as Array<[GovernanceGoal, number]>) if (direction) overrides[goal] = { idealPointBps: direction > 0 === adopted ? 10_000 : 0, importanceBps: 10_000, compromiseToleranceBps: adopted ? 10_000 : 0, confidenceBps: 10_000, status: 'sourced_or_partial_prior' };
        profiles[partyId] = derivePartyGoalProfile(registry.parties[partyId], overrides);
      }
      const estimate = estimateParliamentarySupport(state, proposal, registry, profiles);
      if (estimate.coverage === 'complete' && estimate.chambers.every(chamber => Boolean(chamber.adopted) === adopted)) return { state, personId: player.id, proposalId: proposal.id, countryId, registry, profiles };
    }
  }
  throw new Error(`No ${adopted ? 'adopted' : 'rejected'} deterministic fixture in current registry.`);
}

function historicalSituationalState(): SimulationState {
  const { person, proposal, reform } = structuredClone(historicalSituational);
  return {
    ...initial,
    governance: {
      ...initial.governance, player: { controlledPersonId: person.id },
      persons: { ...initial.governance.persons, [person.id]: person },
      nextPersonSequence: Number(person.id.slice(7)) + 1,
      proposals: { [proposal.id]: proposal }, proposalOrder: [proposal.id], nextProposalSequence: 1,
    },
    fiscal: { ...initial.fiscal, reforms: [reform], nextSequence: reform.sequence + 1 },
  };
}

function distributionAnalysis(directions: Partial<Record<GovernanceGoal, number>>): ProposalAnalysis {
  const analysis = structuredClone(historicalSituational.proposal.analysis!);
  for (const metric of Object.values(analysis.materialContext)) {
    metric.valueBps = 5_000; metric.coverage = 'complete'; metric.source = 'Synthetic internal-distribution test context, not an observation.';
  }
  analysis.expectedConsequences = Object.entries(directions).map(([goal, directionBps]) => ({
    goal: goal as GovernanceGoal, directionBps, magnitudeBps: Math.abs(directionBps), confidenceBps: 10_000,
    coverage: 'complete', source: 'Synthetic issue-consequence test fixture', explanation: 'Explicit test-only goal movement.',
  }));
  analysis.issueEffects = Object.fromEntries(GOVERNANCE_GOALS.map(goal => [goal, directions[goal] ?? 0])) as ProposalAnalysis['issueEffects'];
  analysis.coverage = 'complete';
  return analysis;
}

function distributionProfile(partyId = historicalSituational.proposal.parliamentaryEstimate!.chambers[0].partyEvaluations![0].partyId): PartyGoalProfile {
  return profile(partyId, {
    fiscal_distribution: { idealPointBps: 6_500, importanceBps: 10_000, compromiseToleranceBps: 3_000, confidenceBps: 10_000 },
    income_security: { idealPointBps: 6_500, importanceBps: 10_000, compromiseToleranceBps: 3_000, confidenceBps: 10_000 },
    infrastructure: { idealPointBps: 10_000, importanceBps: 10_000, compromiseToleranceBps: 10_000, confidenceBps: 10_000 },
  });
}

function historicalPluralityState(): SimulationState {
  const { person, proposal } = structuredClone(historicalPlurality);
  return {
    ...initial,
    governance: {
      ...initial.governance, player: { controlledPersonId: person.id },
      persons: { ...initial.governance.persons, [person.id]: person }, nextPersonSequence: Number(person.id.slice(7)) + 1,
      proposals: { [proposal.id]: proposal }, proposalOrder: [proposal.id], nextProposalSequence: 1,
    },
  };
}

function parentPluralityProfiles(): Record<string, PartyGoalProfile> {
  return Object.fromEntries(politicalRegistry.countries[historicalPlurality.person.countryId].partyIds.map(partyId => {
    const goals = derivePartyGoalProfile(politicalRegistry.parties[partyId]);
    for (const preference of Object.values(goals.goals)) {
      preference.importanceBps = 0; preference.confidenceBps = 10_000; preference.status = 'modelled_fallback';
    }
    goals.goals.fiscal_sustainability = { idealPointBps: 8_000, importanceBps: 10_000, compromiseToleranceBps: 3_000, confidenceBps: 10_000, status: 'modelled_fallback' };
    return [partyId, goals];
  }));
}

function institutionalFixture(oppositionSeats = 80) {
  const registry = structuredClone(politicalRegistry), countryId = historicalPlurality.person.countryId;
  const country = registry.countries[countryId], institution = registry.institutions[country.institutionId];
  const [oppositionId, governmentId] = country.partyIds;
  country.partyIds = [oppositionId, governmentId]; country.coverage.coalition = 'sourced';
  institution.governingPartyIds = [governmentId]; institution.chambers = [institution.chambers[0]];
  institution.governingBlocDerivations = [{ sourceText: 'Explicit synthetic test-only governing bloc, not observed.', method: 'normalized_source_party_name_substring_v1', matchedPartyIds: [governmentId], ambiguous: false }];
  const chamber = institution.chambers[0];
  chamber.totalSeats = 100; chamber.seatAllocationStatus = 'sourced'; chamber.independentOtherSeats = 0;
  chamber.seatsByParty = { [oppositionId]: oppositionSeats, [governmentId]: 100 - oppositionSeats };
  chamber.provenance = { ...chamber.provenance, source: 'Synthetic institutional test allocation, not an observation.', limitation: 'Test-only complete seat evidence.' };
  registry.parties[oppositionId].governmentStatus = 'opposition'; registry.parties[governmentId].governmentStatus = 'government';
  const effect: InstitutionalPowerTransfer = {
    id: 'synthetic.budget-initiative-transfer', lever: 'budget_initiative', from: `chamber:${chamber.id}`, to: 'executive',
    confidenceBps: 10_000, coverage: 'complete', source: 'Synthetic explicit legal power transfer, not a playable reform or observation.',
    explanation: 'Test-only movement of budget initiative from this chamber to the executive.',
  };
  return { registry, countryId, oppositionId, governmentId, institution, chamber, effect };
}

function institutionalProfile(partyId: string, uniform = false): PartyGoalProfile {
  return profile(partyId, {
    infrastructure: { idealPointBps: uniform ? 5_000 : 10_000, importanceBps: 10_000, compromiseToleranceBps: 10_000, confidenceBps: 10_000, status: 'modelled_fallback' },
  });
}

function institutionalEvidenceState(transferOverrides: Partial<InstitutionalPowerTransfer> = {}, materialDirectionBps = 0): SimulationState {
  const state = historicalPluralityState(), proposal = state.governance.proposals[historicalPlurality.proposal.id];
  const chamber = politicalRegistry.institutions[politicalRegistry.countries[proposal.countryId].institutionId].chambers[0];
  const analysis = distributionAnalysis({ infrastructure: materialDirectionBps });
  analysis.institutionalEffects = [{
    id: 'synthetic.saved-power-transfer', lever: 'budget_initiative', from: `chamber:${chamber.id}`, to: 'none',
    confidenceBps: 10_000, coverage: 'complete', source: 'Synthetic saved-evidence test only; not an actual fiscal effect or playable constitutional reform.',
    explanation: 'Synthetic removal of chamber leverage to exercise the versioned institutional evidence invariant.',
    ...transferOverrides,
  }];
  const profiles = Object.fromEntries(politicalRegistry.countries[proposal.countryId].partyIds.map(id => [id, institutionalProfile(id, true)]));
  const parliamentaryEstimate = estimateParliamentarySupport(state, proposal, politicalRegistry, profiles, analysis);
  expect(parliamentaryEstimate.coverage).toBe('complete');
  expect(parliamentaryEstimate.chambers.every(item => item.adopted === false)).toBe(true);
  state.governance.proposals[proposal.id] = {
    ...proposal, analysis, evaluationVersion: 'situational-plurality-0.15-v2',
    publicEstimate: estimatePublicSupport(state, proposal, analysis), parliamentaryEstimate,
    voteResult: { ...structuredClone(parliamentaryEstimate), outcome: 'rejected', resolvedOn: state.date },
  };
  return state;
}

function institutionalTamperTarget(proposal: PoliticalProposal): PartyChamberEvaluation {
  return proposal.parliamentaryEstimate!.chambers[0].partyEvaluations!.find(item =>
    item.agreementBps > 0 && item.agreementBps < 9_999 && item.agreementBps !== 4_000 && item.institutionalInterest!.effects[0].rawInterestBps !== 0)!;
}

describe('governance 0.15 situational institutional interest', () => {
  it('A: applies no government/opposition penalty without explicit power transfers', () => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 1_000 });
    analysis.institutionalEffects = [];
    const government = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.governmentId, fixture.registry, institutionalProfile(fixture.governmentId), analysis);
    const opposition = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, institutionalProfile(fixture.oppositionId), analysis);
    expect(government.agreementBps).toBe(opposition.agreementBps);
    expect(government.confidenceBps).toBe(opposition.confidenceBps); expect(government.vote).toBe(opposition.vote);
    for (const result of [government, opposition]) expect(result.institutionalInterest).toMatchObject({ status: 'not_applicable', adjustmentBps: 0, materialAgreementBps: result.agreementBps });
    expect(government.institutionalInterest!.governmentStatus).toBe('government');
    expect(opposition.institutionalInterest!.governmentStatus).toBe('opposition');
  });

  it('B: an opposition party loses chamber leverage to an adversary executive despite material agreement', () => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 1_000 });
    analysis.institutionalEffects = [fixture.effect];
    const goals = institutionalProfile(fixture.oppositionId), material = evaluateProfileForPublic(analysis, goals);
    const opposition = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    const government = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.governmentId, fixture.registry, institutionalProfile(fixture.governmentId), analysis);
    expect(material.agreementBps).toBe(6_000);
    expect(opposition.institutionalInterest!.effects[0]).toMatchObject({ fromStakeBps: 8_000, toStakeBps: 0, rawInterestBps: -8_000, effectiveInterestBps: -8_000 });
    expect(opposition.institutionalInterest!.adjustmentBps).toBe(-4_800);
    expect(opposition).toMatchObject({ agreementBps: 1_200, vote: 'no' });
    expect(opposition.tradeoffs).toContain('Material/ideological preference conflicts with current institutional leverage.');
    expect(government.institutionalInterest!.effects[0]).toMatchObject({ fromStakeBps: 2_000, toStakeBps: 10_000 });
    expect(government.institutionalInterest!.adjustmentBps).toBe(4_800); expect(government.vote).toBe('yes');
    fixture.registry.parties[fixture.oppositionId].governmentStatus = 'government';
    fixture.registry.parties[fixture.governmentId].governmentStatus = 'opposition';
    expect(evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis)).toEqual(opposition);
  });

  it('C: reverses the adjustment when branch leverage reverses, with identical material preferences', () => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 1_000 }), goals = institutionalProfile(fixture.oppositionId);
    analysis.institutionalEffects = [fixture.effect];
    const before = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    fixture.institution.governingPartyIds = [fixture.oppositionId];
    const after = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    expect(before.institutionalInterest!.materialAgreementBps).toBe(after.institutionalInterest!.materialAgreementBps);
    expect(before.institutionalInterest!.adjustmentBps).toBe(-4_800);
    expect(after.institutionalInterest!.adjustmentBps).toBe(1_200); expect(after).toMatchObject({ agreementBps: 7_200, vote: 'yes' });
    expect(evaluateProfileForPublic(analysis, goals)).toEqual(evaluateProfileForPublic({ ...analysis, institutionalEffects: [] }, goals));
  });

  it('D: equal branch stakes give zero adjustment, rather than a status-based bonus', () => {
    const fixture = institutionalFixture(0);
    const material = { agreementBps: 6_000, confidenceBps: 10_000, coverage: 'complete' as const };
    for (const partyId of [fixture.oppositionId, fixture.governmentId]) {
      const result = evaluatePartyInstitutionalInterest(fixture.countryId, partyId, fixture.registry, [fixture.effect], material);
      expect(result).toMatchObject({ status: 'modelled', adjustmentBps: 0, confidenceBps: 10_000 });
      expect(result.effects[0].fromStakeBps).toBe(result.effects[0].toStakeBps);
    }
    delete fixture.chamber.seatsByParty[fixture.oppositionId];
    expect(derivePartyInstitutionalStake(fixture.registry, fixture.countryId, fixture.oppositionId, fixture.effect.from).stakeBps).toBe(0);
  });

  it('E: an unsourced branch makes every party seat UNKNOWN, never ABSTAIN', () => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 1_000 }), goals = institutionalProfile(fixture.oppositionId);
    fixture.chamber.seatAllocationStatus = 'unavailable'; analysis.institutionalEffects = [fixture.effect];
    const evaluation = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    expect(evaluation.institutionalInterest).toMatchObject({ status: 'unavailable', coverage: 'unavailable', confidenceBps: 0, adjustmentBps: 0 });
    expect(evaluation.institutionalInterest!.effects[0].fromStakeBps).toBeUndefined();
    expect(evaluation).toMatchObject({ agreementBps: 6_000, confidenceBps: 0, vote: 'unknown' });
    const distribution = evaluatePartyInternalVoteDistribution(analysis, goals, evaluation);
    expect(distribution).toMatchObject({ yesBps: 0, noBps: 0, abstainBps: 0, unknownBps: 10_000 });
    expect(allocatePartySeats(80, distribution)).toEqual({ yesSeats: 0, noSeats: 0, abstainSeats: 0, unknownSeats: 80 });
  });

  it('F: coalition executive stakes follow sourced intra-bloc seat balance, not a 50/50 fallback', () => {
    const fixture = institutionalFixture(30);
    fixture.institution.governingPartyIds = [fixture.oppositionId, fixture.governmentId];
    fixture.chamber.seatsByParty[fixture.governmentId] = 50; fixture.chamber.independentOtherSeats = 20;
    const first = derivePartyInstitutionalStake(fixture.registry, fixture.countryId, fixture.oppositionId, 'executive');
    const second = derivePartyInstitutionalStake(fixture.registry, fixture.countryId, fixture.governmentId, 'executive');
    expect(first).toMatchObject({ stakeBps: 3_750, coverage: 'complete' });
    expect(second).toMatchObject({ stakeBps: 6_250, coverage: 'complete' });
    expect(first.limitation).toContain('modelled proxy');
    fixture.chamber.seatsByParty = { [fixture.oppositionId]: 50, [fixture.governmentId]: 30 };
    expect(derivePartyInstitutionalStake(fixture.registry, fixture.countryId, fixture.oppositionId, 'executive').stakeBps).toBe(6_250);
    fixture.chamber.seatAllocationStatus = 'unavailable';
    expect(derivePartyInstitutionalStake(fixture.registry, fixture.countryId, fixture.oppositionId, 'executive')).toMatchObject({ coverage: 'unavailable' });
    expect(derivePartyInstitutionalStake(fixture.registry, fixture.countryId, fixture.oppositionId, 'executive').stakeBps).toBeUndefined();
  });

  it('averages coalition shares equally across sourced chambers and caps partial evidence confidence', () => {
    const fixture = institutionalFixture(30);
    fixture.institution.governingPartyIds = [fixture.oppositionId, fixture.governmentId];
    const second = structuredClone(fixture.chamber); second.id = 'chamber.synthetic-second'; second.totalSeats = 200;
    second.seatsByParty = { [fixture.oppositionId]: 150, [fixture.governmentId]: 50 };
    fixture.institution.chambers.push(second);
    expect(derivePartyInstitutionalStake(fixture.registry, fixture.countryId, fixture.oppositionId, 'executive').stakeBps).toBe(5_250);
    fixture.registry.countries[fixture.countryId].coverage.coalition = 'partial';
    const material = { agreementBps: 6_000, confidenceBps: 10_000, coverage: 'complete' as const };
    const partial = evaluatePartyInstitutionalInterest(fixture.countryId, fixture.oppositionId, fixture.registry, [fixture.effect], material);
    expect(partial).toMatchObject({ coverage: 'partial', confidenceBps: 7_000 });
  });

  it.each(['outside', 'sole', 'coalition'] as const)('keeps ambiguous governing-bloc composition unavailable for %s executive leverage', position => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 1_000 });
    if (position === 'coalition') fixture.institution.governingPartyIds = [fixture.oppositionId, fixture.governmentId];
    fixture.institution.governingBlocDerivations.push({
      sourceText: 'Unresolved additional governing-party match, test only.', method: 'normalized_source_party_name_substring_v1',
      matchedPartyIds: [], ambiguous: true,
    });
    analysis.institutionalEffects = [fixture.effect];
    const partyIds = position === 'coalition' ? [fixture.oppositionId, fixture.governmentId]
      : [position === 'sole' ? fixture.governmentId : fixture.oppositionId];
    for (const coalitionCoverage of ['sourced', 'partial'] as const) {
      fixture.registry.countries[fixture.countryId].coverage.coalition = coalitionCoverage;
      for (const partyId of partyIds) {
        const stake = derivePartyInstitutionalStake(fixture.registry, fixture.countryId, partyId, 'executive');
        expect(stake.coverage).toBe('unavailable'); expect(stake.stakeBps).toBeUndefined();
        const goals = institutionalProfile(partyId);
        const evaluation = evaluatePartyProposal(initial, historicalPlurality.proposal, partyId, fixture.registry, goals, analysis);
        expect(evaluation.institutionalInterest).toMatchObject({
          status: 'unavailable', coverage: 'unavailable', confidenceBps: 0, adjustmentBps: 0,
          governmentStatus: fixture.institution.governingPartyIds.includes(partyId) ? 'government' : 'opposition',
        });
        expect(evaluation.institutionalInterest!.effects[0].toStakeBps).toBeUndefined();
        expect(evaluation).toMatchObject({ agreementBps: 6_000, confidenceBps: 0, vote: 'unknown' });
        const distribution = evaluatePartyInternalVoteDistribution(analysis, goals, evaluation);
        expect(distribution).toMatchObject({ yesBps: 0, noBps: 0, abstainBps: 0, unknownBps: 10_000 });
        expect(allocatePartySeats(fixture.chamber.seatsByParty[partyId], distribution)).toEqual({
          yesSeats: 0, noSeats: 0, abstainSeats: 0, unknownSeats: fixture.chamber.seatsByParty[partyId],
        });
      }
    }
  });

  it('restores partial calculable behavior after clearing governing-bloc ambiguity without changing its evidence', () => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 1_000 }), goals = institutionalProfile(fixture.oppositionId);
    fixture.registry.countries[fixture.countryId].coverage.coalition = 'partial'; analysis.institutionalEffects = [fixture.effect];
    const before = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    expect(before.institutionalInterest).toMatchObject({ status: 'modelled', coverage: 'partial', confidenceBps: 7_000, adjustmentBps: -3_360 });
    fixture.institution.governingBlocDerivations[0].ambiguous = true;
    expect(evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis)).toMatchObject({
      confidenceBps: 0, vote: 'unknown', institutionalInterest: { status: 'unavailable', adjustmentBps: 0 },
    });
    fixture.institution.governingBlocDerivations[0].ambiguous = false;
    expect(derivePartyInstitutionalStake(fixture.registry, fixture.countryId, fixture.oppositionId, 'executive')).toMatchObject({ coverage: 'partial', stakeBps: 0 });
    expect(evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis)).toEqual(before);
  });

  it('does not infer opposition or executive stake from a missing governing bloc', () => {
    const fixture = institutionalFixture(), material = { agreementBps: 6_000, confidenceBps: 10_000, coverage: 'complete' as const };
    fixture.institution.governingPartyIds = [];
    const stake = derivePartyInstitutionalStake(fixture.registry, fixture.countryId, fixture.oppositionId, 'executive');
    expect(stake.coverage).toBe('unavailable'); expect(stake.stakeBps).toBeUndefined();
    expect(evaluatePartyInstitutionalInterest(fixture.countryId, fixture.oppositionId, fixture.registry, [fixture.effect], material).status).toBe('unavailable');
  });

  it.each(['outside', 'sole', 'coalition'] as const)('preserves unavailable coalition evidence for %s executive stakes despite listed governing parties', position => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 1_000 });
    const partyId = position === 'sole' ? fixture.governmentId : fixture.oppositionId, goals = institutionalProfile(partyId);
    if (position === 'coalition') fixture.institution.governingPartyIds = [fixture.oppositionId, fixture.governmentId];
    fixture.registry.countries[fixture.countryId].coverage.coalition = 'unavailable';
    analysis.institutionalEffects = [fixture.effect];
    for (const ambiguous of [false, true]) {
      fixture.institution.governingBlocDerivations[0].ambiguous = ambiguous;
      const stake = derivePartyInstitutionalStake(fixture.registry, fixture.countryId, partyId, 'executive');
      expect(stake.coverage).toBe('unavailable'); expect(stake.stakeBps).toBeUndefined();
      const evaluation = evaluatePartyProposal(initial, historicalPlurality.proposal, partyId, fixture.registry, goals, analysis);
      expect(evaluation.institutionalInterest).toMatchObject({ status: 'unavailable', coverage: 'unavailable', confidenceBps: 0, adjustmentBps: 0 });
      expect(evaluation.institutionalInterest!.effects[0].toStakeBps).toBeUndefined();
      expect(evaluation).toMatchObject({ agreementBps: 6_000, confidenceBps: 0, vote: 'unknown' });
      const distribution = evaluatePartyInternalVoteDistribution(analysis, goals, evaluation);
      expect(distribution).toMatchObject({ yesBps: 0, noBps: 0, abstainBps: 0, unknownBps: 10_000 });
      expect(allocatePartySeats(fixture.chamber.seatsByParty[partyId], distribution)).toEqual({
        yesSeats: 0, noSeats: 0, abstainSeats: 0, unknownSeats: fixture.chamber.seatsByParty[partyId],
      });
    }
  });

  it('G: adds independent strategic variance without cancelling the central adjustment in material samples', () => {
    const fixture = institutionalFixture(20), analysis = distributionAnalysis({ infrastructure: 0 }), goals = institutionalProfile(fixture.oppositionId, true);
    analysis.institutionalEffects = [fixture.effect];
    const material = evaluateProfileForPublic(analysis, goals), evaluation = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    expect(evaluatePartyInternalVoteDistribution(analysis, goals, material).agreementHalfSpreadBps).toBe(0);
    const sensitivities = INTERNAL_PARTY_DISTRIBUTION_MODEL.quadrature.map(sample => institutionalSensitivityBps(sample.stanceBps));
    expect(sensitivities).toEqual([5_000, 7_500, 10_000, 12_500, 15_000]);
    expect(sensitivities.reduce((sum, value, index) => sum + value * INTERNAL_PARTY_DISTRIBUTION_MODEL.quadrature[index].weightBps, 0) / 10_000).toBe(10_000);
    expect(evaluation).toMatchObject({ agreementBps: 3_800, vote: 'no' });
    expect(evaluation.agreementBps).toBe(applyInstitutionalAgreement(material.agreementBps, evaluation.institutionalInterest!.adjustmentBps));
    const distribution = evaluatePartyInternalVoteDistribution(analysis, goals, evaluation);
    expect(distribution).toMatchObject({ agreementMeanBps: 3_800, agreementHalfSpreadBps: 804, unknownBps: 0 });
    expect(distribution.noBps).toBeGreaterThan(0); expect(distribution.abstainBps).toBeGreaterThan(0);
    expect(distribution.limitation).toContain('institutional-pragmatism');
    expect(allocatePartySeats(53, distribution, { proposalId: historicalPlurality.proposal.id, chamberId: fixture.chamber.id, partyId: fixture.oppositionId }).noSeats).toBeLessThan(53);
  });

  it('preserves the mainstream central agreement even when clamping shifts the aggregate mean', () => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 0 }), goals = institutionalProfile(fixture.oppositionId, true);
    analysis.institutionalEffects = [fixture.effect];
    const evaluation = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    const distribution = evaluatePartyInternalVoteDistribution(analysis, goals, evaluation);
    expect(evaluation.agreementBps).toBe(200); expect(distribution.agreementMeanBps).toBe(620);
    expect(distribution.agreementHalfSpreadBps).toBe(2_048);
  });

  it('H: current fiscal analyses and every numeric distribution reproduce the actual parent exactly', () => {
    const proposal = historicalPlurality.proposal, analysis = analyzeProposal(initial, proposal), profiles = parentPluralityProfiles();
    expect(analysis.institutionalEffects).toEqual([]);
    const { institutionalEffects: _effects, ...materialAnalysis } = analysis;
    expect(materialAnalysis).toEqual(proposal.analysis);
    const estimate = estimateParliamentarySupport(initial, proposal, politicalRegistry, profiles, analysis);
    for (const chamber of estimate.chambers) for (const evaluation of chamber.partyEvaluations!) {
      const material = evaluateProfileForPublic(analysis, profiles[evaluation.partyId]);
      expect(evaluation.institutionalInterest).toMatchObject({ status: 'not_applicable', adjustmentBps: 0, materialAgreementBps: material.agreementBps });
      expect(evaluation.agreementBps).toBe(material.agreementBps);
      delete evaluation.institutionalInterest;
    }
    expect(estimate).toEqual(proposal.parliamentaryEstimate);
    expect(estimatePublicSupport(initial, proposal, { ...analysis, institutionalEffects: [institutionalFixture().effect] })).toEqual(proposal.publicEstimate);
    expect(INSTITUTIONAL_INTEREST_MODEL.method).toBe('situational_institutional_interest_v1'); expect(Object.isFrozen(INSTITUTIONAL_INTEREST_MODEL)).toBe(true);
  });

  it('I: new fiscal resolutions round-trip v2 exactly without changing schema, date, tick, seed or material state', () => {
    const countryId = historicalPlurality.person.countryId, player = playerFor(initial, countryId);
    const draftState = budgetProposal(player.state, player.id, countryId, 2), proposalId = draftState.governance.proposalOrder[0];
    const submitted = submitProposal(draftState, proposalId), resolved = resolveProposalVote(submitted, proposalId, politicalRegistry, parentPluralityProfiles());
    const saved = serializeSimulationState(resolved, worldContext), restored = restoreSimulationState(saved, worldRegions, {}, {}, worldContext);
    expect(restored).toEqual(resolved); expect(serializeSimulationState(restored, worldContext)).toBe(saved);
    expect(restored.governance.proposals[proposalId].evaluationVersion).toBe('situational-plurality-0.15-v2');
    expect(restored.schemaVersion).toBe(18); expect(restored.date).toBe(submitted.date); expect(restored.engine).toEqual(submitted.engine);
    for (const branch of ['fiscal', 'socioeconomy', 'politics', 'crisis', 'regionOwnership', 'populationByRegion', 'economicOutputByRegion'] as const) expect(resolved[branch]).toBe(submitted[branch]);
    expect(restored.governance.proposals[proposalId].voteResult!.chambers.flatMap(chamber => chamber.partyEvaluations ?? []).every(item => item.institutionalInterest?.status === 'not_applicable')).toBe(true);
  }, 30_000);

  it('J: reloads genuine reviewed-parent plurality-v1 bytes without institutional backfill', () => {
    const state = historicalPluralityState(), before = JSON.stringify(state.governance.proposals[historicalPlurality.proposal.id]);
    expect(historicalPlurality.referenceCommit).toBe('61e415d76ae3ff16cf61961df70d93857d7a87e7');
    const saved = serializeSimulationState(state, worldContext), loaded = restoreSimulationState(saved, worldRegions, {}, {}, worldContext);
    const proposal = loaded.governance.proposals[historicalPlurality.proposal.id];
    expect(JSON.stringify(proposal)).toBe(before); expect(serializeSimulationState(loaded, worldContext)).toBe(saved);
    expect(proposal.evaluationVersion).toBe('plurality-0.15-v1'); expect(proposal.analysis!.institutionalEffects).toBeUndefined();
    expect(proposal.voteResult!.chambers.flatMap(chamber => chamber.partyEvaluations ?? []).every(item => item.institutionalInterest === undefined)).toBe(true);
    const inspected = inspectProposalSupport(loaded, proposal.id, politicalRegistry, parentPluralityProfiles());
    expect(inspected.analysis.institutionalEffects).toEqual([]); expect(JSON.stringify(loaded.governance.proposals[proposal.id])).toBe(before);
  }, 30_000);

  it('validates and reloads explicit synthetic institutional proof without implementing constitutional gameplay', () => {
    const state = institutionalEvidenceState();
    expect(governanceInvariant.check(state, worldContext, 'save')).toEqual([]);
    const saved = serializeSimulationState(state, worldContext), loaded = restoreSimulationState(saved, worldRegions, {}, {}, worldContext);
    expect(loaded).toEqual(state); expect(serializeSimulationState(loaded, worldContext)).toBe(saved);
  }, 30_000);

  it.each(['invariant', 'serialize', 'reload'] as const)('rejects a self-consistent saved v2 semantic transfer duplicate at %s', boundary => {
    const state = institutionalEvidenceState(), proposal = state.governance.proposals[historicalPlurality.proposal.id];
    expect(governanceInvariant.check(state, worldContext, 'save')).toEqual([]);
    proposal.analysis!.institutionalEffects!.push({
      ...proposal.analysis!.institutionalEffects![0], id: 'synthetic.saved-semantic-duplicate',
      source: 'Different test source for the same causal transfer.', explanation: 'Different wording does not create another transfer.',
    });
    const profiles = Object.fromEntries(politicalRegistry.countries[proposal.countryId].partyIds.map(id => [id, institutionalProfile(id, true)]));
    // Rebuild both copies so rejection cannot rely on stale or mismatched evidence.
    const estimate = estimateParliamentarySupport(state, proposal, politicalRegistry, profiles, proposal.analysis);
    proposal.parliamentaryEstimate = estimate;
    proposal.status = estimate.coverage === 'complete' ? 'rejected' : 'unavailable';
    proposal.voteResult = estimate.coverage === 'complete'
      ? { ...structuredClone(estimate), outcome: 'rejected', resolvedOn: state.date }
      : { ...structuredClone(estimate), outcome: 'unavailable', reason: 'institutional_data_unavailable', resolvedOn: state.date };
    if (boundary === 'invariant') expect(governanceInvariant.check(state, worldContext, 'save').join(' ')).toContain('Invalid institutional evidence');
    else if (boundary === 'serialize') expect(() => serializeSimulationState(state, worldContext)).toThrow(/Invalid institutional evidence/);
    else expect(() => restoreSimulationState(JSON.stringify(state), worldRegions, {}, {}, worldContext)).toThrow(/Invalid institutional evidence/);
  }, 30_000);

  it.each(['different IDs', 'different provenance'] as const)('rejects repeated semantic transfer keys despite %s', difference => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 1_000 }), goals = institutionalProfile(fixture.oppositionId);
    const duplicate = {
      ...fixture.effect, id: 'synthetic.semantic-duplicate',
      ...(difference === 'different provenance' ? { source: 'Another test source.', explanation: 'Another explanation of the same transfer.' } : {}),
    };
    analysis.institutionalEffects = [fixture.effect, duplicate];
    const evaluation = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    expect(evaluation.institutionalInterest).toMatchObject({ status: 'unavailable', coverage: 'unavailable', confidenceBps: 0, adjustmentBps: 0, effects: [] });
    expect(evaluation.negativeDrivers).toContain('Institutional evidence is malformed or duplicated.');
    expect(evaluation).toMatchObject({ agreementBps: 6_000, confidenceBps: 0, vote: 'unknown' });
    expect(evaluatePartyInternalVoteDistribution(analysis, goals, evaluation)).toMatchObject({ yesBps: 0, noBps: 0, abstainBps: 0, unknownBps: 10_000 });
    expect(analysis.institutionalEffects).toEqual([fixture.effect, duplicate]);
  });

  it.each(['lever', 'source chamber', 'reverse direction'] as const)('keeps distinct institutional transfers valid when changing %s', distinction => {
    const fixture = institutionalFixture(), material = { agreementBps: 6_000, confidenceBps: 10_000, coverage: 'complete' as const };
    const distinct: InstitutionalPowerTransfer = { ...fixture.effect, id: 'synthetic.distinct-transfer' };
    if (distinction === 'lever') distinct.lever = 'amendment_power';
    else if (distinction === 'source chamber') {
      const chamber = structuredClone(fixture.chamber); chamber.id = 'chamber.synthetic-other-source';
      chamber.seatsByParty = { [fixture.oppositionId]: 40, [fixture.governmentId]: 60 };
      fixture.institution.chambers.push(chamber); distinct.from = `chamber:${chamber.id}`;
    } else { distinct.from = fixture.effect.to; distinct.to = fixture.effect.from; }
    const result = evaluatePartyInstitutionalInterest(fixture.countryId, fixture.oppositionId, fixture.registry, [fixture.effect, distinct], material);
    expect(result).toMatchObject({
      status: 'modelled', coverage: 'complete', confidenceBps: 10_000,
      adjustmentBps: distinction === 'lever' ? -4_800 : distinction === 'source chamber' ? -3_600 : 0,
    });
    expect(result.effects.map(effect => effect.id)).toEqual([fixture.effect.id, distinct.id]);
  });

  it('prevents a duplicate causal transfer from weighting one side of a balanced mean twice', () => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 0 }), goals = institutionalProfile(fixture.oppositionId, true);
    const reverse: InstitutionalPowerTransfer = { ...fixture.effect, id: 'synthetic.balancing-transfer', from: fixture.effect.to, to: fixture.effect.from };
    analysis.institutionalEffects = [fixture.effect, reverse];
    const balanced = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    expect(balanced).toMatchObject({ agreementBps: 5_000, vote: 'abstain', institutionalInterest: { adjustmentBps: 0 } });
    analysis.institutionalEffects.push({ ...fixture.effect, id: 'synthetic.reweighted-duplicate' });
    expect(new Set(analysis.institutionalEffects.map(effect => effect.id)).size).toBe(3);
    const duplicated = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    expect(duplicated).toMatchObject({
      agreementBps: 5_000, confidenceBps: 0, vote: 'unknown',
      institutionalInterest: { status: 'unavailable', coverage: 'unavailable', adjustmentBps: 0 },
    });
  });

  const tamperCases: Array<[string, (proposal: PoliticalProposal) => void]> = [
    ['government status', proposal => { const interest = institutionalTamperTarget(proposal).institutionalInterest!; interest.governmentStatus = interest.governmentStatus === 'government' ? 'opposition' : 'government'; }],
    ['holder', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.effects[0].from = 'executive'; }],
    ['branch stake', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.effects[0].fromStakeBps! += 1; }],
    ['effect interest', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.effects[0].rawInterestBps += 1; }],
    ['effective interest', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.effects[0].effectiveInterestBps += 1; }],
    ['confidence', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.confidenceBps -= 1; }],
    ['adjustment', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.adjustmentBps += 1; }],
    ['material agreement baseline', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.materialAgreementBps += 1; }],
    ['material confidence baseline', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.materialConfidenceBps -= 1; }],
    ['material coverage baseline', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.materialCoverage = 'partial'; }],
    ['baseline fingerprint', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.materialBaselineFingerprint = 'corrupted-baseline-fingerprint'; }],
    ['final agreement', proposal => { institutionalTamperTarget(proposal).agreementBps += 1; }],
    ['source', proposal => { institutionalTamperTarget(proposal).institutionalInterest!.effects[0].source = 'Different source, independently corrupted.'; }],
    ['duplicate effect ID', proposal => { proposal.analysis!.institutionalEffects!.push(structuredClone(proposal.analysis!.institutionalEffects![0])); }],
    ['missing effect array', proposal => { delete proposal.analysis!.institutionalEffects; }],
    ['missing party evidence', proposal => { delete institutionalTamperTarget(proposal).institutionalInterest; }],
    ['invalid lever', proposal => { Reflect.set(proposal.analysis!.institutionalEffects![0], 'lever', 'unsupported_power'); }],
    ['equal holders', proposal => { proposal.analysis!.institutionalEffects![0].to = proposal.analysis!.institutionalEffects![0].from; }],
    ['cross-Country chamber', proposal => { const foreign = Object.values(politicalRegistry.institutions).find(item => item.countryId !== proposal.countryId && item.chambers.length)!; proposal.analysis!.institutionalEffects![0].from = `chamber:${foreign.chambers[0].id}`; }],
    ['empty source', proposal => { proposal.analysis!.institutionalEffects![0].source = ' '; }],
    ['invalid confidence', proposal => { proposal.analysis!.institutionalEffects![0].confidenceBps = 10_001; }],
    ['version downgrade', proposal => { proposal.evaluationVersion = 'plurality-0.15-v1'; }],
  ];
  it.each(tamperCases)('K: rejects independently corrupted %s even when estimate/result copies still match', (_name, mutate) => {
    const state = institutionalEvidenceState(), proposal = structuredClone(state.governance.proposals[historicalPlurality.proposal.id]);
    mutate(proposal);
    proposal.voteResult = { ...structuredClone(proposal.parliamentaryEstimate!), outcome: 'rejected', resolvedOn: state.date };
    const corrupted = { ...state, governance: { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: proposal } } };
    expect(governanceInvariant.check(corrupted, worldContext, 'save').join(' ')).toContain('Invalid institutional evidence');
    expect(() => serializeSimulationState(corrupted, worldContext)).toThrow(/Invalid institutional evidence/);
    expect(() => restoreSimulationState(JSON.stringify(corrupted), worldRegions, {}, {}, worldContext)).toThrow(/Invalid institutional evidence/);
  }, 30_000);

  it('rejects material-baseline corruption masked by a clamped final agreement', () => {
    const state = institutionalEvidenceState({}, -5_000), proposal = structuredClone(state.governance.proposals[historicalPlurality.proposal.id]);
    const evaluation = proposal.parliamentaryEstimate!.chambers[0].partyEvaluations![0], interest = evaluation.institutionalInterest!;
    expect(evaluation.agreementBps).toBe(0);
    interest.materialAgreementBps += 1;
    expect(applyInstitutionalAgreement(interest.materialAgreementBps, interest.adjustmentBps)).toBe(evaluation.agreementBps);
    proposal.voteResult = { ...structuredClone(proposal.parliamentaryEstimate!), outcome: 'rejected', resolvedOn: state.date };
    const corrupted = { ...state, governance: { ...state.governance, proposals: { [proposal.id]: proposal } } };
    expect(governanceInvariant.check(corrupted, worldContext, 'save').join(' ')).toContain('Invalid institutional evidence');
  });

  it.each(['confidence', 'coverage'] as const)('rejects material %s corruption masked by partial institutional evidence', field => {
    const state = institutionalEvidenceState({ coverage: 'partial' }), proposal = structuredClone(state.governance.proposals[historicalPlurality.proposal.id]);
    const evaluation = proposal.parliamentaryEstimate!.chambers[0].partyEvaluations![0], interest = evaluation.institutionalInterest!;
    expect(evaluation.confidenceBps).toBe(7_000); expect(evaluation.coverage).toBe('partial');
    if (field === 'confidence') interest.materialConfidenceBps -= 1;
    else interest.materialCoverage = 'partial';
    const applied = applyPartyInstitutionalInterest({
      agreementBps: interest.materialAgreementBps, confidenceBps: interest.materialConfidenceBps, coverage: interest.materialCoverage,
      positiveDrivers: [], negativeDrivers: [], tradeoffs: [],
    }, interest);
    expect(applied.agreementBps).toBe(evaluation.agreementBps); expect(applied.confidenceBps).toBe(evaluation.confidenceBps); expect(applied.coverage).toBe(evaluation.coverage);
    proposal.voteResult = { ...structuredClone(proposal.parliamentaryEstimate!), outcome: 'rejected', resolvedOn: state.date };
    const corrupted = { ...state, governance: { ...state.governance, proposals: { [proposal.id]: proposal } } };
    expect(governanceInvariant.check(corrupted, worldContext, 'save').join(' ')).toContain('Invalid institutional evidence');
  });

  it('L: ignores seat-map and governing-set insertion order and preserves display order only for effects', () => {
    const fixture = institutionalFixture(30), material = { agreementBps: 6_000, confidenceBps: 10_000, coverage: 'complete' as const };
    fixture.institution.governingPartyIds = [fixture.oppositionId, fixture.governmentId];
    const effects: InstitutionalPowerTransfer[] = [
      fixture.effect,
      { ...fixture.effect, id: 'synthetic.reverse', from: 'executive', to: fixture.effect.from, confidenceBps: 7_000 },
      { ...fixture.effect, id: 'synthetic.null', from: 'none', to: fixture.effect.from, confidenceBps: 5_000 },
    ];
    const original = evaluatePartyInstitutionalInterest(fixture.countryId, fixture.oppositionId, fixture.registry, effects, material);
    const reordered = structuredClone(fixture.registry), institution = reordered.institutions[reordered.countries[fixture.countryId].institutionId];
    institution.governingPartyIds.reverse();
    for (const chamber of institution.chambers) chamber.seatsByParty = Object.fromEntries(Object.entries(chamber.seatsByParty).reverse());
    reordered.parties = Object.fromEntries(Object.entries(reordered.parties).reverse());
    expect(evaluatePartyInstitutionalInterest(fixture.countryId, fixture.oppositionId, reordered, effects, material)).toEqual(original);
    const reversed = evaluatePartyInstitutionalInterest(fixture.countryId, fixture.oppositionId, reordered, [...effects].reverse(), material);
    for (const field of ['adjustmentBps', 'confidenceBps', 'coverage', 'status', 'governmentStatus', 'materialAgreementBps'] as const) expect(reversed[field]).toBe(original[field]);
    expect(reversed.effects.map(item => item.id)).toEqual([...effects].reverse().map(item => item.id));
    const second = structuredClone(institution.chambers[0]); second.id = 'chamber.synthetic-other'; institution.chambers.push(second);
    const stake = derivePartyInstitutionalStake(reordered, fixture.countryId, fixture.oppositionId, 'executive');
    institution.chambers.reverse();
    expect(derivePartyInstitutionalStake(reordered, fixture.countryId, fixture.oppositionId, 'executive')).toEqual(stake);
  });

  it.each(['negative', 'positive'] as const)('keeps a %s known effect plus an unavailable potential reverse transfer UNKNOWN, never implicitly zero', direction => {
    const fixture = institutionalFixture(), analysis = distributionAnalysis({ infrastructure: 1_000 });
    const partyId = direction === 'negative' ? fixture.oppositionId : fixture.governmentId, goals = institutionalProfile(partyId);
    const material = evaluateProfileForPublic(analysis, goals);
    const unknown: InstitutionalPowerTransfer = {
      ...fixture.effect, id: 'synthetic.unavailable-reverse', from: 'executive', to: fixture.effect.from, coverage: 'unavailable',
      explanation: 'Unavailable potential reverse transfer; no offsetting effect is assumed.',
    };
    for (const coverage of ['complete', 'partial'] as const) {
      const known = { ...fixture.effect, coverage };
      const knownResult = evaluatePartyInstitutionalInterest(fixture.countryId, partyId, fixture.registry, [known], material);
      expect(Math.sign(knownResult.adjustmentBps)).toBe(direction === 'negative' ? -1 : 1);
      for (const effects of [[known, unknown], [unknown, known]]) {
        analysis.institutionalEffects = effects;
        const evaluation = evaluatePartyProposal(initial, historicalPlurality.proposal, partyId, fixture.registry, goals, analysis);
        const interest = evaluation.institutionalInterest!;
        expect(interest).toMatchObject({ status: 'unavailable', coverage: 'unavailable', confidenceBps: 0, adjustmentBps: 0 });
        expect(interest.effects).toHaveLength(2);
        expect(interest.effects.find(item => item.id === known.id)).toEqual(knownResult.effects[0]);
        expect(interest.effects.find(item => item.id === unknown.id)).toMatchObject({ coverage: 'unavailable', confidenceBps: 0 });
        expect(interest.effects.map(item => ({ id: item.id, source: item.source, explanation: item.explanation }))).toEqual(
          effects.map(item => ({ id: item.id, source: item.source, explanation: item.explanation })),
        );
        expect(interest.materialAgreementBps).toBe(material.agreementBps);
        expect(evaluation).toMatchObject({ agreementBps: material.agreementBps, confidenceBps: 0, vote: 'unknown' });
        const distribution = evaluatePartyInternalVoteDistribution(analysis, goals, evaluation);
        expect(distribution).toMatchObject({ yesBps: 0, noBps: 0, abstainBps: 0, unknownBps: 10_000 });
        expect(allocatePartySeats(fixture.chamber.seatsByParty[partyId], distribution)).toEqual({
          yesSeats: 0, noSeats: 0, abstainSeats: 0, unknownSeats: fixture.chamber.seatsByParty[partyId],
        });
      }
    }
    const profiles = Object.fromEntries(fixture.registry.countries[fixture.countryId].partyIds.map(id => [id, institutionalProfile(id)]));
    expect(estimateParliamentarySupport(initial, historicalPlurality.proposal, fixture.registry, profiles, analysis)).toMatchObject({
      yesSeats: 0, noSeats: 0, abstainSeats: 0, unavailableSeats: 100, totalSeats: 100, coverage: 'unavailable',
    });
  });

  it('keeps complete/partial transfers calculable, attenuates confidence, and surfaces malformed evidence explicitly', () => {
    const fixture = institutionalFixture(), material = { agreementBps: 6_000, confidenceBps: 10_000, coverage: 'complete' as const };
    const partial: InstitutionalPowerTransfer = {
      ...fixture.effect, id: 'synthetic.partial-reverse', from: 'executive', to: fixture.effect.from, coverage: 'partial', confidenceBps: 9_000,
    };
    const result = evaluatePartyInstitutionalInterest(fixture.countryId, fixture.oppositionId, fixture.registry, [fixture.effect, partial], material);
    expect(result).toMatchObject({ status: 'modelled', coverage: 'partial', confidenceBps: 8_500, adjustmentBps: -720 });
    expect(result.effects[0]).toMatchObject({ rawInterestBps: -8_000, effectiveInterestBps: -8_000, confidenceBps: 10_000 });
    expect(result.effects[1]).toMatchObject({ rawInterestBps: 8_000, effectiveInterestBps: 5_600, coverage: 'partial', confidenceBps: 7_000 });
    const applied = applyPartyInstitutionalInterest({ ...material, positiveDrivers: [], negativeDrivers: [], tradeoffs: [] }, result);
    expect(applied).toMatchObject({ agreementBps: 5_280, confidenceBps: 8_500, coverage: 'partial' });
    const analysis = distributionAnalysis({ infrastructure: 1_000 }), goals = institutionalProfile(fixture.oppositionId);
    analysis.institutionalEffects = [fixture.effect, partial];
    const evaluation = evaluatePartyProposal(initial, historicalPlurality.proposal, fixture.oppositionId, fixture.registry, goals, analysis);
    expect(evaluation).toMatchObject({ agreementBps: 5_280, confidenceBps: 8_500, coverage: 'partial', vote: 'abstain' });
    expect(evaluatePartyInternalVoteDistribution(analysis, goals, evaluation).unknownBps).toBe(0);
    for (const effects of [[fixture.effect, fixture.effect], [{ ...fixture.effect, source: '' }], [{ ...fixture.effect, confidenceBps: -1 }]]) {
      const rejected = evaluatePartyInstitutionalInterest(fixture.countryId, fixture.oppositionId, fixture.registry, effects, material);
      expect(rejected).toMatchObject({ status: 'unavailable', adjustmentBps: 0, confidenceBps: 0 });
      expect(rejected.negativeDrivers).toContain('Institutional evidence is malformed or duplicated.');
    }
  });

  it('defensively copies institutional effects, saved records and nested drivers through existing snapshots and inspections', () => {
    const state = institutionalEvidenceState(), proposalId = historicalPlurality.proposal.id, before = JSON.stringify(state.governance.proposals[proposalId]);
    const inspection = inspectGovernance(state);
    inspection.proposals[proposalId].analysis!.institutionalEffects![0].source = 'Inspection-only mutation.';
    const interest = institutionalTamperTarget(inspection.proposals[proposalId]).institutionalInterest!;
    interest.effects[0].rawInterestBps += 1; interest.negativeDrivers.push('Inspection-only driver.');
    expect(JSON.stringify(state.governance.proposals[proposalId])).toBe(before);
    const snapshot = createSimulationSnapshotCache()(state), evidence = institutionalTamperTarget(snapshot.governance.proposals[proposalId]).institutionalInterest!;
    expect(Object.isFrozen(evidence)).toBe(true); expect(Object.isFrozen(evidence.effects[0])).toBe(true); expect(Object.isFrozen(evidence.negativeDrivers)).toBe(true);
    expect(() => { evidence.effects[0].rawInterestBps = 0; }).toThrow();
    expect(JSON.stringify(state.governance.proposals[proposalId])).toBe(before);
  });
});

describe('final foundation stored governance evidence', () => {
  it.each(['swap-seats', 'foreign-party', 'omit-party', 'foreign-chamber', 'duplicate-chamber', 'missing-chamber', 'independent-residual'] as const)('rejects internally reconciled parliamentary registry corruption: %s', corruption => {
    const state = structuredClone(historicalSituationalState()), proposal = state.governance.proposals[historicalSituational.proposal.id];
    expect(governanceInvariant.check(state, worldContext, 'reload')).toEqual([]);
    const estimate = proposal.parliamentaryEstimate!, chamber = estimate.chambers.find(item => item.partyEvaluations!.length > 1)!;
    const parties = chamber.partyEvaluations!, first = parties[0];
    if (corruption === 'swap-seats' || corruption === 'omit-party') {
      const second = parties.find(item => item.vote === first.vote && item.seats !== first.seats && item.partyId !== first.partyId)!;
      expect(second).toBeDefined();
      if (corruption === 'swap-seats') [first.seats, second.seats] = [second.seats, first.seats];
      else { second.seats += first.seats; chamber.partyEvaluations = parties.filter(item => item !== first); }
    }
    if (corruption === 'foreign-party') first.partyId = Object.values(politicalRegistry.parties).find(item => item.countryId !== proposal.countryId)!.id;
    if (corruption === 'foreign-chamber') chamber.chamberId = Object.values(politicalRegistry.institutions).find(item => item.countryId !== proposal.countryId && item.chambers.length)!.chambers[0].id;
    if (corruption === 'duplicate-chamber') {
      estimate.chambers.push(structuredClone(chamber));
      estimate.totalSeats += chamber.totalSeats!;
      estimate.yesSeats += chamber.yesSeats; estimate.noSeats += chamber.noSeats; estimate.abstainSeats += chamber.abstainSeats; estimate.unavailableSeats += chamber.unavailableSeats;
    }
    if (corruption === 'missing-chamber') {
      estimate.chambers = []; estimate.totalSeats = 0; estimate.yesSeats = 0; estimate.noSeats = 0; estimate.abstainSeats = 0; estimate.unavailableSeats = 0; estimate.coverage = 'unavailable';
      proposal.status = 'unavailable'; proposal.voteResult!.outcome = 'unavailable'; proposal.voteResult!.reason = 'institutional_data_unavailable';
      delete proposal.scheduledFiscalReformSequence; delete proposal.enactmentReference;
    }
    if (corruption === 'independent-residual') {
      chamber.totalSeats!++; chamber.unavailableSeats++; delete chamber.adopted; chamber.coverage = 'partial';
      estimate.totalSeats++; estimate.unavailableSeats++; estimate.coverage = 'partial';
      proposal.status = 'unavailable'; proposal.voteResult!.outcome = 'unavailable'; proposal.voteResult!.reason = 'institutional_data_unavailable';
      delete proposal.scheduledFiscalReformSequence; delete proposal.enactmentReference;
    }
    const { outcome, resolvedOn, reason } = proposal.voteResult!;
    proposal.voteResult = { ...structuredClone(estimate), outcome, resolvedOn, ...(reason ? { reason } : {}) };
    if (corruption === 'swap-seats' || corruption === 'omit-party') {
      for (const bucket of ['yes', 'no', 'abstain'] as const) expect(chamber.partyEvaluations!.filter(item => item.vote === bucket).reduce((sum, item) => sum + item.seats, 0)).toBe(chamber[`${bucket}Seats`]);
    }
    expect(governanceInvariant.check(state, worldContext, 'reload').join(' ')).toMatch(/Invalid parliamentary estimate|Invalid vote result/);
  });
  it.each(['magnitude', 'delta', 'aggregate', 'missing-goal', 'neutral'] as const)('rejects range-valid internally contradictory saved analysis: %s', corruption => {
    const state = structuredClone(historicalSituationalState()), proposal = state.governance.proposals[historicalSituational.proposal.id], analysis = proposal.analysis!;
    expect(governanceInvariant.check(state, worldContext, 'reload')).toEqual([]);
    if (corruption === 'magnitude') { const item = analysis.expectedConsequences[0]; item.magnitudeBps = item.magnitudeBps === 0 ? 1 : item.magnitudeBps - 1; }
    if (corruption === 'delta') analysis.directPolicyChanges[0].delta!++;
    if (corruption === 'aggregate') { const goal = analysis.expectedConsequences[0].goal; analysis.issueEffects[goal] += analysis.issueEffects[goal] === 10000 ? -1 : 1; }
    if (corruption === 'missing-goal') Reflect.deleteProperty(analysis.issueEffects, 'public_order');
    if (corruption === 'neutral') { analysis.directPolicyChanges = []; analysis.unsupportedChanges = []; analysis.genuinelyNeutral = true; }
    expect(governanceInvariant.check(state, worldContext, 'reload').join(' ')).toContain('Invalid proposal analysis');
  });
  it('continues to admit genuine historical structured and aggregate-only records without rewriting them', () => {
    const historical = historicalSituationalState();
    const restored = restoreSimulationState(serializeSimulationState(historical, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.governance.proposals[historicalSituational.proposal.id]).toEqual(historicalSituational.proposal);
    const legacy = d2LegacyResolved('enacted');
    const migrated = restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext);
    expect(migrated.governance.proposals[legacy.proposalId].evaluationVersion).toBe('legacy-0.14-v1');
    expect(migrated.governance.proposals[legacy.proposalId].voteResult!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true);
  }, 30_000);
});

describe('governance 0.14 player and political decisions', () => {
  it('initializes party leaders and materializes sourced executives independently of party-leadership coverage', () => {
    expect(initial).toMatchObject({ schemaVersion: 18, governance: { version: 'governance-0.14-v1', initializedOn: '2026-01-01', player: {}, proposals: {}, proposalOrder: [], nextProposalSequence: 0, leadersInitializedOn: '2026-01-01' } });
    expect(Object.values(initial.governance.persons).filter(person => person.isPartyLeader && person.status === 'active')).toHaveLength(Object.keys(politicalRegistry.parties).length);
    const offices = new Map(politicalOffices.offices.map(office => [office.id, office]));
    const eligible = politicalOffices.officeholders.filter(record => {
      const definition = offices.get(record.officeId);
      return record.status === 'available' && record.referenceDate === initial.date && record.person?.id
        && (!record.startDate || record.startDate <= initial.date) && definition && ['head_of_government', 'head_of_state'].includes(definition.kind);
    });
    const keys = new Set(eligible.map(record => `${offices.get(record.officeId)!.countryId}:${record.person!.id}`));
    const materialized = Object.values(initial.governance.persons).filter(person => person.office?.evidence);
    expect(materialized).toHaveLength(keys.size);
    expect(materialized.length).toBeGreaterThan(300);
    expect(materialized.filter(person => person.isPartyLeader)).toHaveLength(3);
    for (const person of materialized) {
      const evidence = person.office!.evidence!;
      expect(keys.has(`${person.countryId}:${evidence.sourcePersonId}`)).toBe(true);
      expect(person.displayName).not.toBe(eligible.find(record => record.person!.id === evidence.sourcePersonId)!.person!.name);
      if (!person.isPartyLeader) expect(person.partyId).toBeUndefined();
      if (evidence.authorityBasis === 'institutional_authority_unresolved') expect(person.office!.authorityProfile.capabilities).toEqual([]);
    }
    console.info(`EXECUTIVE_OFFICEHOLDER_AUDIT ${JSON.stringify({
      availableRecords: eligible.length, materializedPersons: materialized.length,
      reusedPartyLeaders: materialized.filter(person => person.isPartyLeader).length,
      standalonePersons: materialized.filter(person => !person.isPartyLeader).length,
      authorityResolved: materialized.filter(person => person.office!.authorityProfile.capabilities.length > 0).length,
      authorityUnresolved: materialized.filter(person => person.office!.authorityProfile.capabilities.length === 0).length,
    })}`);
    expect(assertSimulationInvariants(initial, worldContext, 'save')).toBe(true);
  });

  it('creates stable sequence IDs independent of display names', () => {
    const countryId = worldCountryIds[0], a = createPoliticalPerson(initial, { displayName: 'Alpha', countryId }), b = createPoliticalPerson(initial, { displayName: 'Beta', countryId });
    const newId = `person.${String(initial.governance.nextPersonSequence).padStart(8, '0')}`;
    expect(a.governance.persons[newId]).toMatchObject({ displayName: 'Alpha', countryId, isPartyLeader: false });
    expect(b.governance.persons[newId]).toMatchObject({ displayName: 'Beta', countryId, isPartyLeader: false });
  });

  it('generates identical party leaders regardless of registry insertion order', () => {
    const reordered = structuredClone(politicalRegistry);
    reordered.parties = Object.fromEntries(Object.entries(reordered.parties).reverse());
    const first = initializePartyLeaders(worldBase(), politicalRegistry), second = initializePartyLeaders(worldBase(), reordered);
    expect(second.governance.persons).toEqual(first.governance.persons);
    const leaders = Object.values(first.governance.persons).filter(person => person.isPartyLeader);
    expect(leaders).toHaveLength(Object.keys(politicalRegistry.parties).length);
    const sourceDerivedLeaders = leaders.filter(person => person.leaderProvenance?.basis === 'derived_analogue');
    expect(sourceDerivedLeaders).toHaveLength(7);
    expect(leaders.filter(person => person.leaderProvenance?.sourceLeaderStatus === 'ambiguous')).toHaveLength(1);
    expect(leaders.filter(person => person.leaderProvenance?.basis === 'modelled_fallback')).toHaveLength(leaders.length - 7);
    expect(new Set(leaders.map(person => person.displayName)).size).toBe(leaders.length);
    expect(sourceDerivedLeaders.every(person => person.displayName !== person.leaderProvenance?.sourceLeader?.name && person.leaderProvenance?.sourceLeader?.sourceRole)).toBe(true);
    const canadianAliases = new Map(sourceDerivedLeaders.filter(person => person.countryId === 'country.1aj872z').map(person => [person.leaderProvenance!.sourceLeader!.name, person.displayName]));
    expect(canadianAliases).toEqual(new Map([
      ['Yves-François Blanchet', 'Yves-François Blancheval'],
      ['Don Davies', 'Don Davison'],
      ['Pierre Poilievre', 'Pierre Poilapin'],
    ]));
    const reconciledOffices = leaders.filter(person => person.office?.evidence);
    expect(reconciledOffices).toHaveLength(3);
    expect(reconciledOffices.some(person => person.office?.title === 'Federal Chancellor')).toBe(true);
    expect(reconciledOffices.some(person => person.office?.title === 'Prime Minister')).toBe(true);
  });

  it('renders fictional Canadian party leaders and never exposes their source names in the start flow', () => {
    const state = initializePartyLeaders(worldBase());
    const canadianLeaders = Object.values(state.governance.persons).filter(person => person.countryId === 'country.1aj872z' && person.isPartyLeader);
    const markup = renderToStaticMarkup(createElement(StartGame, {
      countries: [{ id: 'country.1aj872z', commonName: 'Canada' }],
      persons: canadianLeaders,
      onPlay: () => undefined,
    }));
    expect(markup).toContain('Fictional gameplay analogue based on reviewed party-leadership evidence');
    expect(canadianLeaders.some(person => markup.includes(person.displayName))).toBe(true);
    expect(markup).not.toContain('Yves-François Blanchet');
    expect(markup).not.toContain('Pierre Poilievre');
    expect(markup).not.toContain('Don Davies');
  });

  it('offers both canonical starting routes without duplicate people or inferred offices/membership', () => {
    const persons = Object.values(initial.governance.persons);
    const leader = persons.find(person => person.isPartyLeader && !person.office)!;
    const executive = persons.find(person => person.office?.evidence && !person.partyId)!;
    const combined = persons.find(person => person.isPartyLeader && person.office?.evidence)!;
    const leaderCandidates = startingPersonCandidates(persons, leader.countryId, 'party_leader', leader.partyId);
    expect(leaderCandidates.find(person => person.id === leader.id)).toBe(leader);
    expect(startingPersonCandidates(persons, leader.countryId, 'officeholder').some(person => person.id === leader.id)).toBe(false);
    expect(startingPersonCandidates(persons, executive.countryId, 'officeholder').find(person => person.id === executive.id)).toBe(executive);
    expect(startingPersonCandidates(persons, executive.countryId, 'party_leader').some(person => person.id === executive.id)).toBe(false);
    expect(startingPersonCandidates(persons, combined.countryId, 'party_leader', combined.partyId).find(person => person.id === combined.id)).toBe(combined);
    expect(startingPersonCandidates([...persons, combined], combined.countryId, 'officeholder').filter(person => person.id === combined.id)).toEqual([combined]);
    expect(startingPersonCandidates([...persons].reverse(), combined.countryId, 'officeholder')).toEqual(startingPersonCandidates(persons, combined.countryId, 'officeholder'));
    const inactive = { ...executive, status: 'inactive' as const };
    expect(startingPersonCandidates([inactive], executive.countryId, 'officeholder')).toEqual([]);
    expect(executive.partyId).toBeUndefined();
    expect(leader.office).toBeUndefined();
  });

  it('renders reconciled officeholders even without Country party coverage and states unresolved authority explicitly', () => {
    const persons = Object.values(initial.governance.persons);
    const noPartyCountry = persons.find(person => person.office?.evidence && !politicalRegistry.countries[person.countryId]?.partyIds.length)!;
    expect(noPartyCountry).toBeDefined();
    expect(selectableStartingCountryIds(persons).has(noPartyCountry.countryId)).toBe(true);
    const unresolved = persons.find(person => person.office?.evidence?.authorityBasis === 'institutional_authority_unresolved' && !person.partyId)!;
    for (const executive of [noPartyCountry, unresolved]) {
      const markup = renderToStaticMarkup(createElement(StartGame, {
        countries: [{ id: executive.countryId, commonName: 'Officeholder route fixture' }],
        persons: [executive], onPlay: () => undefined, initialPath: 'officeholder',
      }));
      expect(markup).toContain(executive.displayName);
      expect(markup).toContain(executive.office!.title);
      expect(markup).toContain('Current public officeholder');
      expect(markup).not.toContain('3. Fictional party leader');
      expect(markup.split(`value="${executive.id}"`)).toHaveLength(2);
      expect(markup).toContain('Party membership unavailable');
      expect(markup).not.toContain('disabled=""');
      expect(markup).not.toContain(politicalOffices.officeholders.find(record => record.person?.id === executive.office!.evidence!.sourcePersonId)!.person!.name);
    }
    const unresolvedMarkup = renderToStaticMarkup(createElement(StartGame, {
      countries: [{ id: unresolved.countryId, commonName: 'Unresolved authority fixture' }],
      persons: [unresolved], onPlay: () => undefined, initialPath: 'officeholder',
    }));
    expect(unresolvedMarkup).toContain('no gameplay executive capabilities are assigned');
    const resolved = persons.find(person => person.office?.evidence && person.office.authorityProfile.capabilities.length)!;
    const resolvedMarkup = renderToStaticMarkup(createElement(StartGame, {
      countries: [{ id: resolved.countryId, commonName: 'Resolved authority fixture' }],
      persons: [resolved], onPlay: () => undefined, initialPath: 'officeholder',
    }));
    expect(resolvedMarkup).toContain('modelled capabilities');
    for (const capability of resolved.office!.authorityProfile.capabilities) expect(resolvedMarkup).toContain(capability);
  });

  it('selects the same person through either route by changing only canonical player control', () => {
    const persons = Object.values(initial.governance.persons);
    const samples = [
      persons.find(person => person.isPartyLeader && !person.office)!,
      persons.find(person => person.office?.evidence && !person.partyId)!,
      persons.find(person => person.isPartyLeader && person.office?.evidence)!,
    ];
    for (const person of samples) {
      for (const path of ['party_leader', 'officeholder'] as const) {
        const candidate = startingPersonCandidates(persons, person.countryId, path, person.partyId).find(item => item.id === person.id);
        if (!candidate) continue;
        const selected = setControlledPerson(initial, candidate.id);
        expect(selected.governance.player.controlledPersonId).toBe(person.id);
        expect({ ...selected, governance: { ...selected.governance, player: { ...selected.governance.player, controlledPersonId: initial.governance.player.controlledPersonId } } }).toEqual(initial);
        expect(selected.governance.persons[person.id]).toBe(person);
      }
    }
    const markup = renderToStaticMarkup(createElement(StartGame, {
      countries: [{ id: samples[0].countryId, commonName: 'Leader without office fixture' }],
      persons: [samples[0]], onPlay: () => undefined,
    }));
    expect(markup).toContain('No public office is reconciled to this leader; no executive powers are inferred');
    for (const path of ['party_leader', 'officeholder'] as const) {
      const combinedMarkup = renderToStaticMarkup(createElement(StartGame, {
        countries: [{ id: samples[2].countryId, commonName: 'Combined canonical identity fixture' }],
        persons: [samples[2], samples[2]], onPlay: () => undefined, initialPath: path,
      }));
      expect(combinedMarkup.split(`value="${samples[2].id}"`)).toHaveLength(2);
      expect(combinedMarkup).toContain(samples[2].displayName);
    }
  });

  it('preserves schema-13 persisted identity/provenance even when it differs from current mappings', () => {
    const started = advanceSimulationDays(initial, 5);
    const legacy = structuredClone(started) as SimulationState;
    const republican = Object.values(legacy.governance.persons).find(person => person.partyId === 'party:country.u6myyj:90c6a09fd8f4' && person.isPartyLeader)!;
    legacy.governance.persons[republican.id] = {
      ...republican,
      displayName: 'Reviewed historical fictional chair',
      leaderProvenance: {
        ...republican.leaderProvenance!,
        method: 'reviewed_party_leadership_evidence_v1',
        sourceLeader: { id: 'wikidata:Q124450754', name: 'Historical fixture source chair', sourceRole: 'party_chairperson', sourceRecordIds: ['archived-test-mapping-v1'] },
      },
    };
    const unsupported = Object.values(legacy.governance.persons).find(person => person.partyId === 'party:country.zwicjl:0fb2b6a211ca' && person.isPartyLeader)!;
    legacy.governance.persons[unsupported.id] = {
      ...unsupported,
      displayName: 'Reviewed historical fictional leader',
      leaderProvenance: {
        ...unsupported.leaderProvenance!,
        basis: 'derived_analogue',
        method: 'reviewed_global_party_chair_snapshot_v1',
        sourceLeaderStatus: 'derived',
        sourceLeader: { id: 'wikidata:Q21592171', name: 'Historical fixture source leader', sourceRecordIds: ['archived-test-mapping-v1'] },
      },
    };
    const restored = restoreSimulationState(JSON.stringify(legacy), worldRegions, {}, {}, worldContext);
    expect(restored.schemaVersion).toBe(18);
    expect(restored.date).toBe(started.date);
    expect(restored.engine.tick).toBe(started.engine.tick);
    expect(restored.engine.seed).toBe(started.engine.seed);
    expect(restored.fiscal).toEqual(started.fiscal);
    expect(restored).toEqual(legacy);
    expect(restored.governance.persons[republican.id]).toEqual(legacy.governance.persons[republican.id]);
    expect(restored.governance.persons[unsupported.id]).toEqual(legacy.governance.persons[unsupported.id]);
  }, 30_000);

  it('does not rematerialize or rename scenario-date schema-13 persons on reload', () => {
    const archived = structuredClone(initial);
    const executive = Object.values(archived.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
    executive.displayName = 'Archived reviewed fictional chancellor';
    archived.governance.player.controlledPersonId = executive.id;
    const restored = restoreSimulationState(serializeSimulationState(archived, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored).toEqual(archived);
    const invalid = structuredClone(archived);
    invalid.governance.persons[executive.id].displayName = executive.leaderProvenance!.sourceLeader!.name;
    expect(() => restoreSimulationState(JSON.stringify(invalid), worldRegions, {}, {}, worldContext)).toThrow(/Invalid party leader provenance/);
  }, 30_000);

  it('rejects incompatible schema-13 static registries instead of rebuilding political history', () => {
    const archived = structuredClone(initial);
    Object.assign(archived.politics, { registryVersion: 'future-or-incompatible-registry' });
    expect(() => restoreSimulationState(JSON.stringify(archived), worldRegions, {}, {}, worldContext)).toThrow(/explicit versioned migration/);
  });

  it('preserves historical office evidence absent from the installed source snapshot without mutating saved history', () => {
    const archived = structuredClone(advanceSimulationDays(initial, 5));
    const executive = Object.values(archived.governance.persons).find(person => person.office?.evidence?.authorityBasis === 'institutional_authority_unresolved' && !person.partyId)!;
    const evidence = executive.office!.evidence!;
    evidence.sourcePersonId = 'wikidata:Q999999999999';
    evidence.sourceOfficeId = 'archived-office-fixture';
    evidence.sourceOfficeIds = [evidence.sourceOfficeId, 'archived-secondary-office-fixture'];
    evidence.sourceRecordIds = ['archived-office-source-v0'];
    evidence.referenceDate = '2025-12-01';
    evidence.effectiveFrom = '2024-02-01';
    evidence.authorityBasis = 'sourced_parliamentary_head_of_government';
    executive.office!.role = 'head_of_government';
    executive.office!.authorityProfile.capabilities = capabilitiesForReconciledAuthority(evidence.authorityBasis);
    executive.office!.authorityProfile.limitation = 'Historical test authority classification; fictional archived evidence, not an observed constitutional fact.';
    executive.office!.title = 'Historical fictional executive';
    archived.governance.player.controlledPersonId = executive.id;
    expect(politicalOffices.officeholders.some(record => record.person?.id === evidence.sourcePersonId)).toBe(false);
    for (const referenceDate of ['2025-12-01', '2026-01-05']) {
      evidence.referenceDate = referenceDate;
      const restored = restoreSimulationState(serializeSimulationState(archived, worldContext), worldRegions, {}, {}, worldContext);
      expect(restored).toEqual(archived);
      expect(restored.governance.persons[executive.id]).toEqual(executive);
      expect(restored.governance).toEqual(archived.governance);
      expect(restored.engine).toEqual(archived.engine);
      expect(restored.date).toBe(archived.date);
    }
  }, 30_000);

  it('keeps strict current-source reconciliation in new-game initialization', () => {
    const malformed = structuredClone(initial);
    const executive = Object.values(malformed.governance.persons).find(person => person.office?.evidence && !person.partyId)!;
    executive.office!.evidence!.sourcePersonId = 'wikidata:Q999999999999';
    expect(() => initializeNewGame(malformed, worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs))
      .toThrow(/current initialization sources/);
    const realName = structuredClone(initial);
    const holder = Object.values(realName.governance.persons).find(person => person.office?.evidence && !person.partyId)!;
    holder.displayName = politicalOffices.officeholders.find(record => record.person?.id === holder.office!.evidence!.sourcePersonId)!.person!.name;
    expect(() => initializeNewGame(realName, worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs))
      .toThrow(/source person's name/);
  }, 30_000);

  it('rejects internally inconsistent persisted office identity, dates and authority without source lookups', () => {
    const source = Object.values(initial.governance.persons).find(person => person.office?.evidence && !person.partyId)!;
    const cases = [
      (person: typeof source) => { person.office!.countryId = 'country.invalid'; },
      (person: typeof source) => { person.office!.evidence!.sourcePersonId = 'wikidata:not-a-QID'; },
      (person: typeof source) => { person.office!.evidence!.sourceRecordIds = ['']; },
      (person: typeof source) => { person.office!.evidence!.sourceOfficeIds = []; },
      (person: typeof source) => { person.office!.evidence!.referenceDate = '2027-01-01'; },
      (person: typeof source) => { person.office!.evidence!.effectiveFrom = '2027-01-01'; },
      (person: typeof source) => { person.office!.evidence!.authorityBasis = 'sourced_parliamentary_head_of_government'; person.office!.role = 'head_of_state'; },
    ];
    for (const corrupt of cases) {
      const person = structuredClone(source);
      corrupt(person);
      const invalid = { ...initial, governance: { ...initial.governance, persons: { ...initial.governance.persons, [person.id]: person } } };
      expect(governanceInvariant.check(invalid, worldContext, 'save').length).toBeGreaterThan(0);
    }
    const mixed = structuredClone(Object.values(initial.governance.persons).find(person => person.office?.evidence && person.leaderProvenance?.sourceLeader)!);
    mixed.office!.evidence!.sourcePersonId = 'wikidata:Q999999999999';
    expect(governanceInvariant.check({ ...initial, governance: { ...initial.governance, persons: { ...initial.governance.persons, [mixed.id]: mixed } } }, worldContext, 'save').join(' ')).toContain('persisted source');
  });

  it('retains exact reviewed leader provenance, fictional names, and one-person office reconciliation through save reload', () => {
    const state = initializePartyLeaders(worldBase());
    const chancellor = Object.values(state.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
    expect(chancellor).toMatchObject({
      displayName: 'Friedrich Merzen',
      isPartyLeader: true,
      leaderProvenance: {
        basis: 'derived_analogue',
        sourceLeaderStatus: 'derived',
        sourceLeader: { id: 'wikidata:Q566257', name: 'Friedrich Merz' },
      },
      office: {
        role: 'head_of_government',
        title: 'Federal Chancellor',
        evidence: { status: 'source_reconciled', sourcePersonId: 'wikidata:Q566257', effectiveFrom: '2025-05-06' },
      },
    });
    expect(Object.values(state.governance.persons).filter(person =>
      person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257'
      || person.office?.evidence?.sourcePersonId === 'wikidata:Q566257',
    )).toHaveLength(1);
    const restored = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.governance.persons[chancellor.id]).toEqual(chancellor);
  });

  it('starts a verified government leader with executive authority but leaves opposition leaders without it', () => {
    const state = initializePartyLeaders(worldBase());
    const governmentParty = politicalRegistry.parties['party:country.sxojze:08a93106ca5f'];
    const oppositionParty = politicalRegistry.parties['party:country.sxojze:6244f2d93a49'];
    const governmentLeader = Object.values(state.governance.persons).find(person => person.partyId === governmentParty.id && person.isPartyLeader)!;
    const oppositionLeader = Object.values(state.governance.persons).find(person => person.partyId === oppositionParty.id && person.isPartyLeader)!;
    expect(governmentParty.governmentStatus).toBe('government');
    expect(governmentLeader.office?.evidence?.authorityBasis).toBe('sourced_parliamentary_head_of_government');
    expect(governmentLeader.office?.authorityProfile.capabilities).toContain('access_government_information');
    expect(governmentLeader.office?.authorityProfile.capabilities).toContain('sponsor_fiscal_reform');
    expect(oppositionParty.governmentStatus).toBe('opposition');
    expect(oppositionLeader.office).toBeUndefined();
    expect(oppositionLeader.leaderProvenance?.basis).toBe('modelled_fallback');
    expect(oppositionLeader.leaderProvenance?.sourceLeaderStatus).toBe('unavailable');
  });

  it('derives presidential executive authority only from resolved institutional evidence', () => {
    const makeReconciledHeadOfState = (requirePresidential: boolean) => {
      const offices = new Map(politicalOffices.offices.map(office => [office.id, office]));
      const record = politicalOffices.officeholders.find(item => {
        const office = offices.get(item.officeId);
        const institution = office && politicalRegistry.institutions[politicalRegistry.countries[office.countryId]?.institutionId];
        return item.status === 'available'
          && item.referenceDate === politicalOffices.referenceDate
          && item.person?.id.startsWith('wikidata:')
          && office?.kind === 'head_of_state'
          && (requirePresidential
            ? institution?.executiveSystemStatus === 'sourced' && institution.executiveSystem === 'presidential'
            : institution?.executiveSystemStatus !== 'sourced' || institution.executiveSystem !== 'presidential');
      });
      expect(record).toBeDefined();
      const sourceOffice = offices.get(record!.officeId)!;
      const authorityBasis = requirePresidential
        ? 'sourced_presidential_head_of_state' as const
        : 'institutional_authority_unresolved' as const;
      const withoutSourcePerson = { ...initial, governance: { ...initial.governance, persons: Object.fromEntries(Object.entries(initial.governance.persons).filter(([, person]) => person.office?.evidence?.sourcePersonId !== record!.person!.id || person.countryId !== sourceOffice.countryId)) } };
      const created = createPoliticalPerson(withoutSourcePerson, { displayName: `Test ${record!.person!.name}`, countryId: sourceOffice.countryId });
      const id = `person.${String(initial.governance.nextPersonSequence).padStart(8, '0')}`;
      const capabilities = capabilitiesForReconciledAuthority(authorityBasis);
      const state = {
        ...created,
        governance: {
          ...created.governance,
          persons: {
            ...created.governance.persons,
            [id]: {
              ...created.governance.persons[id],
              office: {
                role: 'head_of_state' as const,
                countryId: sourceOffice.countryId,
                title: sourceOffice.title,
                appointedOn: initial.date,
                evidence: {
                  status: 'source_reconciled' as const,
                  sourceOfficeId: sourceOffice.id,
                  sourceOfficeIds: [sourceOffice.id],
                  sourcePersonId: record!.person!.id,
                  referenceDate: politicalOffices.referenceDate,
                  effectiveFrom: record!.startDate,
                  sourceRecordIds: [record!.source.datasetId],
                  authorityBasis,
                },
                authorityProfile: {
                  status: 'modelled_constitutional_abstraction' as const,
                  capabilities,
                  limitation: 'Tested source-reconciled authority basis.',
                },
              },
            },
          },
        },
      };
      return { state, id, capabilities };
    };
    const presidential = makeReconciledHeadOfState(true);
    expect(presidential.capabilities).toEqual([
      'sponsor_legislation',
      'sponsor_fiscal_reform',
      'sponsor_budget_reform',
      'vote_legislation',
      'access_government_information',
      'command_military_operations',
    ]);
    expect(governanceInvariant.check(presidential.state, worldContext, 'save')).toEqual([]);

    const unresolved = makeReconciledHeadOfState(false);
    expect(unresolved.capabilities).toEqual([]);
    expect(governanceInvariant.check(unresolved.state, worldContext, 'save')).toEqual([]);
    const invalid = structuredClone(unresolved.state);
    invalid.governance.persons[unresolved.id].office!.evidence!.authorityBasis = 'sourced_presidential_head_of_state';
    invalid.governance.persons[unresolved.id].office!.authorityProfile.capabilities = capabilitiesForReconciledAuthority('sourced_presidential_head_of_state');
    expect(() => assertInitialOfficeReconciliation(invalid)).toThrow(/capabilities inconsistent with its institutional evidence/);
    invalid.governance.persons[unresolved.id].office!.evidence!.authorityBasis = 'institutional_authority_unresolved';
    expect(governanceInvariant.check(invalid, worldContext, 'save').join(' ')).toContain('persisted authority basis');
  });

  it('preserves the former leader, office and player control until an explicit handoff choice', () => {
    const leader = Object.values(initial.governance.persons).find(person => person.isPartyLeader)!;
    let state = createPoliticalPerson(initial, { displayName: 'Eligible party member', countryId: leader.countryId });
    const memberId = `person.${String(initial.governance.nextPersonSequence).padStart(8, '0')}`;
    state = setPartyMembership(state, memberId, leader.partyId);
    state = assignPoliticalOffice(state, leader.id, { role: 'head_of_state', countryId: leader.countryId });
    state = setControlledPerson(state, leader.id);
    const replaced = replacePartyLeader(state, leader.partyId!, memberId);
    const successionId = replaced.governance.successionOrder.at(-1)!;
    expect(replaced.governance.successions[successionId].playerHandoff?.status).toBe('pending');
    expect(replaced.governance.persons[leader.id]).toMatchObject({ isPartyLeader: false, office: expect.any(Object) });
    expect(replaced.governance.player.controlledPersonId).toBe(leader.id);
    const continued = resolvePlayerHandoff(replaced, successionId, 'continue');
    expect(continued.governance.player.controlledPersonId).toBe(leader.id);
    expect(() => resolvePlayerHandoff(continued, successionId, 'switch')).toThrow(/no pending/);
    const switched = resolvePlayerHandoff(replaced, successionId, 'switch');
    expect(switched.governance.player.controlledPersonId).toBe(memberId);
    expect(switched.governance.persons[leader.id]).toBeDefined();
  });

  it('creates a deterministic contextual-profile successor and persists explicit player transfer', () => {
    const leader = Object.values(initial.governance.persons).find(person => person.isPartyLeader)!;
    const start = setControlledPerson(initial, leader.id);
    const first = replacePartyLeader(start, leader.partyId!);
    const second = replacePartyLeader(start, leader.partyId!);
    const successionId = first.governance.successionOrder.at(-1)!;
    const successor = first.governance.persons[first.governance.successions[successionId].newPersonId];
    expect(successor).toEqual(second.governance.persons[second.governance.successions[successionId].newPersonId]);
    expect(successor).toMatchObject({ isPartyLeader: true, partyId: leader.partyId, leaderProvenance: { method: 'internal_party_balance_succession_v3', basis: 'modelled_fallback', sourceLeaderStatus: 'unavailable' } });
    expect(first.governance.successions[successionId]).toMatchObject({ selection: 'modelled_internal_balance', contextEvidence: { method: 'internal_party_balance_succession_v1' } });
    expect(Object.values(successor.leaderProfile!).every(item => item.valueBps >= 0 && item.valueBps <= 10_000)).toBe(true);
    const switched = resolvePlayerHandoff(first, successionId, 'switch');
    const restored = restoreSimulationState(serializeSimulationState(switched, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored).toEqual(switched);
    expect(restored.governance.player.controlledPersonId).toBe(successor.id);
  });

  it('rejects leadership succession dates that run backwards', () => {
    const leader = Object.values(initial.governance.persons).find(person => person.isPartyLeader)!;
    const firstMemberState = createPoliticalPerson(initial, { displayName: 'First succession member', countryId: leader.countryId });
    const firstMemberId = `person.${String(initial.governance.nextPersonSequence).padStart(8, '0')}`;
    const secondMemberState = createPoliticalPerson(firstMemberState, { displayName: 'Second succession member', countryId: leader.countryId });
    const secondMemberId = `person.${String(firstMemberState.governance.nextPersonSequence).padStart(8, '0')}`;
    let state = setPartyMembership(secondMemberState, firstMemberId, leader.partyId);
    state = setPartyMembership(state, secondMemberId, leader.partyId);
    state = replacePartyLeader({ ...state, date: '2026-01-02' }, leader.partyId!, firstMemberId);
    state = replacePartyLeader({ ...state, date: '2026-01-03' }, leader.partyId!, secondMemberId);
    const [firstSuccessionId, secondSuccessionId] = state.governance.successionOrder;
    const malformed = structuredClone(state);
    malformed.governance.successions[firstSuccessionId].effectiveDate = '2026-01-03';
    malformed.governance.successions[secondSuccessionId].effectiveDate = '2026-01-02';
    expect(() => assertSimulationInvariants(malformed, worldContext, 'tick')).toThrow(/dates are not monotonic/);
  });

  it('reports governance-only command changes to UI/worker deltas', () => {
    const changed = createPoliticalPerson(initial, { displayName: 'Delta Person', countryId: worldCountryIds[0] });
    expect(simulationDelta(initial, changed).changedDomains).toEqual(['governance']);
  });

  it('validates party membership and keeps leadership separate from state authority', () => {
    const countryId = Object.values(politicalRegistry.countries).find(item => item.partyIds.length)!.countryId, other = worldCountryIds.find(id => id !== countryId)!;
    let { state, id } = playerFor(initial, countryId); state = revokePoliticalOffice(state, id);
    const partyId = politicalRegistry.countries[countryId].partyIds[0], otherParty = politicalRegistry.countries[other]?.partyIds[0];
    state = setPartyLeadership(setPartyMembership(state, id, partyId), id, true);
    expect(state.governance.persons[id]).toMatchObject({ partyId, isPartyLeader: true }); expect(state.governance.persons[id].office).toBeUndefined();
    const draft = budgetProposal(state, id, countryId, 2); expect(() => submitProposal(draft, draft.governance.proposalOrder.at(-1)!)).toThrow(/lacks authority/);
    if (otherParty) expect(() => setPartyMembership(state, id, otherParty)).toThrow(/leadership succession/);
  });

  it('revoking office preserves player identity and control while removing capabilities', () => {
    const countryId = worldCountryIds[0], player = playerFor(initial, countryId), next = revokePoliticalOffice(player.state, player.id);
    expect(next.governance.player.controlledPersonId).toBe(player.id); expect(next.governance.persons[player.id]).toBeDefined(); expect(next.governance.persons[player.id].office).toBeUndefined();
  });

  it('creates editable drafts and freezes logical content after submission', () => {
    const fixture = findResolvable(true), id = fixture.proposalId;
    const edited = replaceDraftProposal(fixture.state, id, { effectiveDate: '2026-03-01' });
    const submitted = submitProposal(edited, id); expect(submitted.governance.proposals[id]).toMatchObject({ status: 'submitted', submittedOn: submitted.date });
    expect(() => replaceDraftProposal(submitted, id, { effectiveDate: '2026-03-01' })).toThrow(/immutable/);
    expect(edited.governance.proposals[id].effectiveDate).toBe('2026-03-01');
    const corrupted = structuredClone(submitted); corrupted.governance.proposals[id].effectiveDate = '2026-04-01'; expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/payload was modified/);
  });

  it('requires edited sourced tax rules to become explicitly modelled', () => {
    const countryId = worldCountryIds.find(id => Object.values(initial.fiscal.countries[id].policy).some(Boolean))!, player = playerFor(initial, countryId), policy = structuredClone(player.state.fiscal.countries[countryId].policy);
    const rule = Object.values(policy).find(value => value !== null)!;
    if (rule.kind === 'personal') rule.bands![0].rateBps += rule.bands![0].rateBps < 10_000 ? 1 : -1; else if (rule.kind === 'payroll') rule.employee![0].rateBps += rule.employee![0].rateBps < 10_000 ? 1 : -1; else rule.rateBps! += rule.rateBps! < 10_000 ? 1 : -1;
    expect(() => createFiscalProposal(player.state, { proposerPersonId: player.id, countryId, effectiveDate: '2026-02-01', payload: { policy } })).toThrow(/explicitly modelled/);
    rule.status = 'modelled'; expect(createFiscalProposal(player.state, { proposerPersonId: player.id, countryId, effectiveDate: '2026-02-01', payload: { policy } }).governance.proposalOrder).toHaveLength(1);
  });

  it('requires the controlled proposer and the correct office scope', () => {
    const countryId = worldCountryIds[0]; let first = createPoliticalPerson(initial, { displayName: 'One', countryId }); const one = `person.${String(first.governance.nextPersonSequence - 1).padStart(8, '0')}`;
    first = assignPoliticalOffice(first, one, { role: 'head_of_government', countryId }); first = createPoliticalPerson(first, { displayName: 'Two', countryId }); const two = `person.${String(first.governance.nextPersonSequence - 1).padStart(8, '0')}`; first = setControlledPerson(first, two);
    const draft = budgetProposal(first, one, countryId, 2); expect(() => submitProposal(draft, draft.governance.proposalOrder[0])).toThrow(/not the controlled person/);
  });

  it('requires vote authority to remain present at resolution time', () => {
    const fixture = findResolvable(true); let state = submitProposal(fixture.state, fixture.proposalId); state = revokePoliticalOffice(state, fixture.personId);
    expect(() => resolveProposalVote(state, fixture.proposalId, fixture.registry, fixture.profiles)).toThrow(/lacks authority/);
  });

  it('produces normalized public estimates and deterministic reconciled parliamentary estimates', () => {
    const fixture = findResolvable(true), proposal = fixture.state.governance.proposals[fixture.proposalId], publicEstimate = estimatePublicSupport(fixture.state, proposal), parliament = estimateParliamentarySupport(fixture.state, proposal, fixture.registry, fixture.profiles);
    expect(publicEstimate.supportBps + publicEstimate.opposeBps + publicEstimate.neutralBps + publicEstimate.unknownBps).toBe(10_000); expect(publicEstimate.representedPersons).toBeGreaterThan(0);
    expect(parliament.yesSeats + parliament.noSeats + parliament.abstainSeats + parliament.unavailableSeats).toBe(parliament.totalSeats);
    expect(estimatePublicSupport(fixture.state, proposal)).toEqual(publicEstimate); expect(estimateParliamentarySupport(fixture.state, proposal, fixture.registry, fixture.profiles)).toEqual(parliament);
    const inspected = inspectProposalSupport(fixture.state, fixture.proposalId, fixture.registry, fixture.profiles); expect(inspected.informationStatus).toBe('engine_debug_reality'); expect(inspected.impact.drivers[0]?.source).toMatch(/^(policy|annualBudget)\./);
  });

  it('is independent of dynamic Country and Region insertion order', () => {
    const fixture = findResolvable(true), reordered = structuredClone(fixture.state);
    reordered.politics.countries = Object.fromEntries(Object.entries(reordered.politics.countries).reverse()); reordered.politics.regionalOpinion = Object.fromEntries(Object.entries(reordered.politics.regionalOpinion).reverse()); reordered.socioeconomy.regions = Object.fromEntries(Object.entries(reordered.socioeconomy.regions).reverse());
    expect(inspectProposalSupport(reordered, fixture.proposalId, fixture.registry, fixture.profiles)).toEqual(inspectProposalSupport(fixture.state, fixture.proposalId, fixture.registry, fixture.profiles));
  });

  it('keeps unavailable seats distinct and prevents bicameral/incomplete enactment', () => {
    const unavailableCountry = Object.values(politicalRegistry.countries).map(item => item.countryId).find(countryId => {
      const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId].institutionId]; return institution?.chambers.some(chamber => chamber.seatAllocationStatus !== 'sourced' || (chamber.independentOtherSeats ?? 0) > 0);
    })!;
    const player = playerFor(initial, unavailableCountry); let state = budgetProposal(player.state, player.id, unavailableCountry, 2), id = state.governance.proposalOrder.at(-1)!; state = submitProposal(state, id); const estimate = estimateParliamentarySupport(state, state.governance.proposals[id]);
    expect(estimate.coverage).not.toBe('complete'); expect(estimate.unavailableSeats).toBeGreaterThanOrEqual(0);
    const fiscalBefore = state.fiscal; state = resolveProposalVote(state, id); expect(state.governance.proposals[id].status).toBe('unavailable'); expect(state.fiscal).toBe(fiscalBefore);
  });

  it('adopts through exactly one queued FiscalReform without direct material effects', () => {
    const fixture = findResolvable(true); let state = submitProposal({ ...fixture.state, paused: true }, fixture.proposalId), fiscalBefore = state.fiscal, socioBefore = state.socioeconomy, politicsBefore = state.politics, crisisBefore = state.crisis;
    state = resolveProposalVote(state, fixture.proposalId, fixture.registry, fixture.profiles); const proposal = state.governance.proposals[fixture.proposalId];
    expect(proposal.status).toBe('enacted'); expect(proposal.voteResult?.outcome).toBe('adopted'); expect(state.paused).toBe(true); expect(state.fiscal.reforms.filter(reform => reform.sequence === proposal.scheduledFiscalReformSequence)).toHaveLength(1);
    expect(state.fiscal.countries).toBe(fiscalBefore.countries); expect(state.socioeconomy).toBe(socioBefore); expect(state.politics).toBe(politicsBefore); expect(state.crisis).toBe(crisisBefore);
    const applied = advanceSimulationDays(state, 31); expect(applied.fiscal.reforms.some(reform => reform.sequence === proposal.scheduledFiscalReformSequence)).toBe(false);
    if (proposal.payload.policy) expect(applied.fiscal.countries[fixture.countryId].policy).toEqual(proposal.payload.policy); else expect(applied.fiscal.countries[fixture.countryId].annualBudget).toEqual(proposal.payload.annualBudget);
  }, 30_000);

  it('allows later material fiscal consequences to reach opinion through the existing scheduler', () => {
    const countryId = completeCountryIds().find(id => initial.fiscal.countries[id].annualBudget.infrastructure > 0)!, player = playerFor(initial, countryId);
    let changed = budgetProposal(player.state, player.id, countryId, 0), proposalId = changed.governance.proposalOrder.at(-1)!, registry = structuredClone(politicalRegistry) as PoliticalRegistry;
    for (const partyId of registry.countries[countryId].partyIds) registry.parties[partyId].issuePositions.infrastructure = { ...registry.parties[partyId].issuePositions.infrastructure, preferenceBps: 1_000, intensityBps: 10_000, confidenceBps: 10_000, ideologicalPrior: 'explicit governance causal-path test evidence' };
    changed = resolveProposalVote(submitProposal(changed, proposalId), proposalId, registry); expect(changed.governance.proposals[proposalId].status).toBe('enacted');
    const baseline = advanceSimulationDays(player.state, 70), consequence = advanceSimulationDays(changed, 70);
    expect(consequence.fiscal.countries[countryId].services.infrastructure.coverageBps).not.toBe(baseline.fiscal.countries[countryId].services.infrastructure.coverageBps);
    expect(consequence.politics.countries[countryId]).not.toEqual(baseline.politics.countries[countryId]);
  }, 60_000);

  it('rejects deterministically without scheduling or changing fiscal state', () => {
    const fixture = findResolvable(false); let state = submitProposal(fixture.state, fixture.proposalId), fiscal = state.fiscal; state = resolveProposalVote(state, fixture.proposalId, fixture.registry, fixture.profiles);
    expect(state.governance.proposals[fixture.proposalId].status).toBe('rejected'); expect(state.fiscal).toBe(fiscal); expect(state.governance.proposals[fixture.proposalId].scheduledFiscalReformSequence).toBeUndefined();
    expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true);
    expect(() => resolveProposalVote(state, fixture.proposalId)).toThrow(/Only an unresolved/);
  });

  it('withdraws without enacting and persists loss of office, drafts and resolutions', () => {
    const fixture = findResolvable(true), withdrawn = withdrawProposal(fixture.state, fixture.proposalId); expect(withdrawn.governance.proposals[fixture.proposalId].status).toBe('withdrawn');
    let enacted = submitProposal(fixture.state, fixture.proposalId); enacted = resolveProposalVote(enacted, fixture.proposalId, fixture.registry, fixture.profiles); enacted = revokePoliticalOffice(enacted, fixture.personId);
    const restored = restoreSimulationState(serializeSimulationState(enacted, worldContext), worldRegions, {}, {}, worldContext); expect(restored).toEqual(enacted); expect(restored.governance.persons[fixture.personId].office).toBeUndefined();
  }, 30_000);

  it('migrates schema 11 on the saved date without fake governance history or changing other branches', () => {
    const legacy = structuredClone(initial) as unknown as Record<string, unknown>; legacy.schemaVersion = 11; legacy.date = '2034-05-06'; delete legacy.governance;
    const politics = legacy.politics, fiscal = legacy.fiscal, socioeconomy = legacy.socioeconomy, crisis = legacy.crisis;
    const migrated = restoreSimulationState(JSON.stringify(legacy), worldRegions, {}, {}, worldContext);
    expect(migrated.governance.initializedOn).toBe('2034-05-06'); expect(migrated.governance.proposalOrder).toEqual([]); expect(migrated.schemaVersion).toBe(18);
    expect(migrated.information).toMatchObject({ initializedOn: '2034-05-06', briefings: [], latestGovernmentReports: {} });
    expect(migrated.politics).toEqual(JSON.parse(JSON.stringify(politics))); expect(migrated.fiscal).toEqual(JSON.parse(JSON.stringify(fiscal))); expect(migrated.socioeconomy).toEqual(JSON.parse(JSON.stringify(socioeconomy))); expect(migrated.crisis).toEqual(JSON.parse(JSON.stringify(crisis)));
  }, 30_000);

  it('conserves governance across fidelity transitions and returns defensive inspections', () => {
    const fixture = findResolvable(true), queued = requestFidelityTransition(fixture.state, fixture.countryId, 'Detailed', worldContext.countryIds), applied = applyPendingFidelityTransitions(queued);
    expect(applied.governance).toBe(queued.governance); expect(validateFidelityConservation(queued, applied)).toEqual([]);
    const inspected = inspectGovernance(fixture.state); inspected.proposalOrder.length = 0; expect(fixture.state.governance.proposalOrder).toHaveLength(1); expect(inspectPlayer(fixture.state)?.id).toBe(fixture.personId);
  });

  it('validates governance invariants and prevents unimplemented political systems or non-deterministic RNG', () => {
    const fixture = findResolvable(true); expect(assertSimulationInvariants(fixture.state, worldContext, 'tick')).toBe(true);
    const malformed = structuredClone(fixture.state); malformed.governance.player.controlledPersonId = 'person.unknown'; expect(() => assertSimulationInvariants(malformed, worldContext, 'tick')).toThrow(/Controlled person/);
    const source = readFileSync('src/simulation/governance/runtime.ts', 'utf8'); expect(source).not.toContain('Math.random'); expect(source).not.toMatch(/\belection\b|\bcampaign\b|\bmedia\b|\bprotest\b|\bstrike\b|\bcoup\b|\blobby\b|\bcoalition negotiation\b|\bparty AI\b|\bgovernment AI\b/i);
  });
});

describe('governance 0.14 situational corrective contracts', () => {
  it('keeps an unavailable tax rule distinct from a legal zero rate', () => {
    const made = taxDraft('corporate', () => {}, false), analysis = analyzeProposal(made.state, made.proposal);
    expect(analysis.directPolicyChanges).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'policy.corporate', before: null, coverage: 'unavailable' })]));
    expect(analysis.unsupportedChanges).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'policy.corporate', coverage: 'unavailable' })]));
    expect(analysis.expectedConsequences.some(item => item.source.includes('corporate'))).toBe(false);
    expect(analysis.genuinelyNeutral).toBe(false); expect(analysis.coverage).toBe('unavailable');
  });

  it('reports consumption-tax changes and their immediate causal evidence', () => {
    const made = taxDraft('consumption', rule => { rule.rateBps = Math.min(10_000, (rule.rateBps ?? 0) + 250); }), analysis = analyzeProposal(made.state, made.proposal);
    expect(analysis.directPolicyChanges.some(item => item.path.includes('policy.consumption.rateBps'))).toBe(true);
    expect(analysis.expectedConsequences.some(item => item.source.includes('consumption'))).toBe(true); expect(analysis.genuinelyNeutral).toBe(false);
  });

  it('reports payroll changes and explicitly limits the future employment response', () => {
    const made = taxDraft('payroll', rule => { rule.employee![0].rateBps = Math.min(10_000, rule.employee![0].rateBps + 100); }), analysis = analyzeProposal(made.state, made.proposal);
    expect(analysis.directPolicyChanges.some(item => item.path.includes('policy.payroll.employee[0].rateBps'))).toBe(true);
    expect(analysis.unsupportedChanges).toContainEqual(expect.objectContaining({ path: 'policy.payroll.employment_response', coverage: 'partial' }));
  });

  it('detects personal allowances and bracket thresholds structurally', () => {
    const made = taxDraft('personal', rule => { rule.allowance = (rule.allowance ?? 0) + 10; if (rule.bands!.length > 1) rule.bands![1].lower += 1; else rule.bands!.push({ lower: 100_000, rateBps: Math.min(10_000, rule.bands![0].rateBps + 100) }); }), paths = analyzeProposal(made.state, made.proposal).directPolicyChanges.map(item => item.path);
    expect(paths).toContain('policy.personal.allowance'); expect(paths.some(path => path.includes('policy.personal.bands[1]'))).toBe(true);
  });

  it('distinguishes a genuinely neutral proposal from unknown consequences', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), neutral = draft(player.state, player.id, countryId, { annualBudget: structuredClone(player.state.fiscal.countries[countryId].annualBudget) });
    const neutralAnalysis = analyzeProposal(neutral.state, neutral.proposal), unknownAnalysis = analyzeProposal(taxDraft('corporate', () => {}, false).state, taxDraft('corporate', () => {}, false).proposal);
    expect(neutralAnalysis).toMatchObject({ genuinelyNeutral: true, coverage: 'complete', directPolicyChanges: [], unsupportedChanges: [] });
    expect(unknownAnalysis).toMatchObject({ genuinelyNeutral: false, coverage: 'unavailable' });
  });

  it('uses current fiscal stress to change agreement for the same party and proposal', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), current = player.state.fiscal.countries[countryId].annualBudget;
    const made = draft(player.state, player.id, countryId, { annualBudget: { ...current, incomeSupport: Math.round(current.incomeSupport * .8) } });
    const partyId = politicalRegistry.countries[countryId].partyIds[0], goals = profile(partyId, { income_security: { idealPointBps: 8_500, importanceBps: 5_000, compromiseToleranceBps: 2_500, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 9_000, importanceBps: 9_000, compromiseToleranceBps: 4_000, confidenceBps: 9_000 } });
    const calm = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, goals), extremeState = structuredClone(made.state), fiscal = extremeState.fiscal.countries[countryId];
    fiscal.debt = fiscal.debtLimit; fiscal.interestArrears = Math.max(1, current.administration * 12); fiscal.arrears.administration = Math.max(1, current.administration * 12);
    const extreme = evaluatePartyProposal(extremeState, made.proposal, partyId, politicalRegistry, goals);
    expect(extreme.agreementBps).toBeGreaterThan(calm.agreementBps); expect(goals.goals.income_security.idealPointBps).toBe(8_500);
    expect(extreme.issueEvaluations.find(item => item.goal === 'income_security')!.compromiseCostBps).toBeLessThanOrEqual(calm.issueEvaluations.find(item => item.goal === 'income_security')!.compromiseCostBps);
  });

  it('lets two parties weigh the same material trade-off differently', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, incomeSupport: Math.round(budget.incomeSupport * .7) } }), partyId = politicalRegistry.countries[countryId].partyIds[0];
    const discipline = profile(partyId, { income_security: { idealPointBps: 7_000, importanceBps: 2_000, compromiseToleranceBps: 6_000, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 10_000, importanceBps: 10_000, compromiseToleranceBps: 5_000, confidenceBps: 9_000 } });
    const security = profile(partyId, { income_security: { idealPointBps: 10_000, importanceBps: 10_000, compromiseToleranceBps: 500, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 8_000, importanceBps: 2_000, compromiseToleranceBps: 8_000, confidenceBps: 9_000 } });
    expect(evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, discipline).agreementBps).toBeGreaterThan(evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, security).agreementBps);
  });

  it('makes proposal magnitude matter and does not reward overshooting an ideal', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, partyId = politicalRegistry.countries[countryId].partyIds[0];
    const small = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: Math.round(budget.infrastructure * 1.1) } }), large = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure * 4 } });
    const goals = profile(partyId, { infrastructure: { idealPointBps: 9_000, importanceBps: 9_000, compromiseToleranceBps: 3_000, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 8_500, importanceBps: 8_000, compromiseToleranceBps: 2_000, confidenceBps: 9_000 } });
    const a = evaluatePartyProposal(small.state, small.proposal, partyId, politicalRegistry, goals), b = evaluatePartyProposal(large.state, large.proposal, partyId, politicalRegistry, goals);
    expect(a.agreementBps).not.toBe(b.agreementBps); expect(b.agreementBps).toBeLessThan(a.agreementBps);
  });

  it('models compromise tolerance per issue and without absolute ideological vetoes', () => {
    const party = Object.values(politicalRegistry.parties)[0], derived = derivePartyGoalProfile(party);
    expect(Object.values(derived.goals).every(goal => goal.compromiseToleranceBps > 0)).toBe(true);
    const custom = derivePartyGoalProfile(party, { fiscal_distribution: { compromiseToleranceBps: 800 }, infrastructure: { compromiseToleranceBps: 8_000 } });
    expect(custom.goals.fiscal_distribution.compromiseToleranceBps).toBe(800); expect(custom.goals.infrastructure.compromiseToleranceBps).toBe(8_000);
  });

  it('gives stricter same-side parties a higher compromise cost', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, incomeSupport: Math.round(budget.incomeSupport * .75) } }), partyId = politicalRegistry.countries[countryId].partyIds[0];
    const moderate = profile(partyId, { income_security: { idealPointBps: 10_000, importanceBps: 8_000, compromiseToleranceBps: 5_000, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 8_500, importanceBps: 2_000, confidenceBps: 9_000 } }), rigid = structuredClone(moderate); rigid.goals.income_security.compromiseToleranceBps = 100;
    const a = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, moderate), b = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, rigid);
    expect(b.compromiseCostBps).toBeGreaterThan(a.compromiseCostBps); expect(b.agreementBps).toBeLessThan(a.agreementBps);
  });

  it('applies symmetric rigidity to a fiscal-discipline core issue', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, incomeSupport: budget.incomeSupport * 2 } }), partyId = politicalRegistry.countries[countryId].partyIds[0];
    const flexible = profile(partyId, { income_security: { idealPointBps: 9_000, importanceBps: 3_000, confidenceBps: 9_000 }, fiscal_sustainability: { idealPointBps: 9_500, importanceBps: 9_000, compromiseToleranceBps: 6_000, confidenceBps: 9_000 } }), rigid = structuredClone(flexible); rigid.goals.fiscal_sustainability.compromiseToleranceBps = 500;
    expect(evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, rigid).agreementBps).toBeLessThan(evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, flexible).agreementBps);
  });

  it('keeps fallback ideology low-confidence and deterministic', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } }), partyId = politicalRegistry.countries[countryId].partyIds[0], fallback = profile(partyId, {});
    for (const goal of Object.values(fallback.goals)) { goal.confidenceBps = 500; goal.status = 'modelled_fallback'; }
    const first = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, fallback), second = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, fallback);
    expect(first).toEqual(second); expect(first.confidenceBps).toBeLessThan(GOVERNANCE_VOTE_THRESHOLDS.minimumConfidenceBps); expect(first.vote).toBe('unknown');
  });

  it('centralizes the deterministic conversion from agreement to a vote', () => {
    expect(GOVERNANCE_VOTE_THRESHOLDS).toEqual({ yesAgreementBps: 6_000, noAgreementBps: 4_000, minimumConfidenceBps: 3_000 });
    expect(Object.isFrozen(GOVERNANCE_VOTE_THRESHOLDS)).toBe(true);
  });

  it('propagates unavailable material context into coverage and confidence', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), unavailable = structuredClone(player.state), country = unavailable.fiscal.countries[countryId]; country.services.infrastructure.coverageBps = null; country.services.infrastructure.required = 0; country.services.infrastructure.backlog = 0;
    const budget = country.annualBudget, made = draft(unavailable, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } }), partyId = politicalRegistry.countries[countryId].partyIds[0], result = evaluatePartyProposal(made.state, made.proposal, partyId, politicalRegistry, profile(partyId, { infrastructure: { confidenceBps: 9_000 } }));
    expect(analyzeProposal(made.state, made.proposal).materialContext.infrastructure.coverage).toBe('unavailable'); expect(result.coverage).toBe('partial');
  });

  it('rejects retroactive people and appointments at the API boundary', () => {
    const countryId = resolvableCountry(); expect(() => createPoliticalPerson(initial, { displayName: 'Past', countryId, createdOn: '2025-12-31' })).toThrow(/creation date/);
    const created = createPoliticalPerson(initial, { displayName: 'Present', countryId }); expect(() => assignPoliticalOffice(created, 'person.00000000', { role: 'head_of_government', countryId, appointedOn: '2025-12-31' })).toThrow(/appointment date/);
  });

  it('terminates an expired submitted proposal without retroactive reform', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } }, '2026-01-02');
    const submitted = submitProposal(made.state, made.proposal.id), late = { ...submitted, date: '2026-01-03' }, before = late.fiscal, resolved = resolveProposalVote(late, made.proposal.id);
    expect(resolved.governance.proposals[made.proposal.id]).toMatchObject({ status: 'unavailable', voteResult: { outcome: 'unavailable', reason: 'effective_date_expired' } }); expect(resolved.fiscal).toBe(before); expect(resolved.fiscal.reforms).toHaveLength(0);
  });

  it('proves enacted ownership through one matching reform and later receipt', () => {
    const fixture = findResolvable(true); let state = resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles), proposal = state.governance.proposals[fixture.proposalId];
    expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true); expect(state.fiscal.reforms.filter(item => item.sequence === proposal.scheduledFiscalReformSequence)).toHaveLength(1);
    state = advanceSimulationDays(state, 31); proposal = state.governance.proposals[fixture.proposalId]; expect(state.fiscal.reformReceipts.filter(item => item.sequence === proposal.scheduledFiscalReformSequence)).toHaveLength(1); expect(assertSimulationInvariants(state, worldContext, 'tick')).toBe(true);
  }, 30_000);

  it('rejects tampered enactment ownership and duplicate resolution', () => {
    const fixture = findResolvable(true); const enacted = resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles), corrupted = structuredClone(enacted);
    corrupted.governance.proposals[fixture.proposalId].enactmentReference!.reformFingerprint = 'tampered'; expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/enactment reference/);
    expect(() => resolveProposalVote(enacted, fixture.proposalId, fixture.registry, fixture.profiles)).toThrow(/Only an unresolved/);
  });

  it('rejects corrupted persisted support outputs', () => {
    const fixture = findResolvable(true); const enacted = resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles), corrupted = structuredClone(enacted), proposal = corrupted.governance.proposals[fixture.proposalId];
    proposal.publicEstimate!.supportBps = 10_001; proposal.voteResult!.yesSeats += 1; expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/Invalid public estimate|Invalid vote result/);
  });

  it('preserves situational outputs across deterministic save and reload', () => {
    const archived = historicalSituationalState(), restored = restoreSimulationState(serializeSimulationState(archived, worldContext), worldRegions, {}, {}, worldContext);
    expect(historicalSituational.referenceCommit).toBe('81109d98a685398c8938eb2b1931634f4c4bcabe');
    expect(restored).toEqual(archived);
    expect(restored.governance.proposals[historicalSituational.proposal.id]).toEqual(historicalSituational.proposal);
    for (const estimate of [restored.governance.proposals[historicalSituational.proposal.id].parliamentaryEstimate!, restored.governance.proposals[historicalSituational.proposal.id].voteResult!]) {
      expect(estimate.procedure).toBe('modelled_procedure_v1');
      for (const evaluation of estimate.chambers.flatMap(chamber => chamber.partyEvaluations ?? [])) {
        expect(evaluation.decisionModel).toBeUndefined(); expect(evaluation.internalDistribution).toBeUndefined(); expect(evaluation.seatAllocation).toBeUndefined();
      }
    }
  }, 30_000);

  it('reloads an actual d2f3ce aggregate-only enacted schema-12 proposal', () => {
    const legacy = d2LegacyResolved('enacted'), restored = restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext), proposal = restored.governance.proposals[legacy.proposalId];
    expect(restored).toMatchObject({ schemaVersion: 18, governance: { version: 'governance-0.14-v1' } }); expect(proposal).toMatchObject({ status: 'enacted', evaluationVersion: 'legacy-0.14-v1', voteResult: { outcome: 'adopted', coverage: 'complete' } });
    expect(proposal.parliamentaryEstimate!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true); expect(proposal.voteResult!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true);
    const evidence = [...restored.fiscal.reforms, ...restored.fiscal.reformReceipts].filter(item => item.sequence === legacy.sequence); expect(evidence).toHaveLength(1); expect(evidence[0].origin?.proposalId).toBe(legacy.proposalId); expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  });

  it('reloads a meaningful d2f3ce aggregate-only rejection without fabricating party evidence', () => {
    const legacy = d2LegacyResolved('rejected'), restored = restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext), proposal = restored.governance.proposals[legacy.proposalId];
    expect(proposal).toMatchObject({ status: 'rejected', evaluationVersion: 'legacy-0.14-v1', voteResult: { outcome: 'rejected', coverage: 'complete' } });
    expect(proposal.parliamentaryEstimate!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true); expect(proposal.voteResult!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true); expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  });

  it('conservatively makes a d2f3ce all-abstain rejection unavailable', () => {
    const legacy = d2LegacyResolved('all_abstain'), restored = restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext), proposal = restored.governance.proposals[legacy.proposalId];
    expect(proposal).toMatchObject({ status: 'unavailable', evaluationVersion: 'legacy-0.14-v1', voteResult: { outcome: 'unavailable', reason: 'institutional_data_unavailable', coverage: 'unavailable', abstainSeats: 0 } });
    expect(proposal.voteResult!.unavailableSeats).toBe(proposal.voteResult!.totalSeats); expect(proposal.voteResult!.chambers.every(chamber => chamber.partyEvaluations === undefined)).toBe(true); expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  });

  it('round-trips the upgraded aggregate-only save deterministically', () => {
    const legacy = d2LegacyResolved('enacted'), first = restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext), serialized = serializeSimulationState(first, worldContext), second = restoreSimulationState(serialized, worldRegions, {}, {}, worldContext);
    expect(second).toEqual(first); expect(serializeSimulationState(second, worldContext)).toBe(serialized);
  }, 30_000);

  it('rejects malformed aggregate-only legacy chamber totals', () => {
    const legacy = d2LegacyResolved('rejected'), proposal = legacy.state.governance.proposals[legacy.proposalId], chamber = proposal.voteResult!.chambers[0]; chamber.totalSeats! += 1;
    expect(() => restoreSimulationState(JSON.stringify(legacy.state), worldRegions, {}, {}, worldContext)).toThrow(/Invalid vote result/);
  });

  it('does not let a situational-v2 proposal use aggregate-only compatibility', () => {
    const state = historicalSituationalState(), proposal = state.governance.proposals[historicalSituational.proposal.id];
    delete proposal.parliamentaryEstimate!.chambers[0].partyEvaluations; delete proposal.voteResult!.chambers[0].partyEvaluations;
    expect(proposal.evaluationVersion).toBe('situational-0.14-v2'); expect(() => assertSimulationInvariants(state, worldContext, 'tick')).toThrow(/Invalid parliamentary estimate|Invalid vote result/);
  });

  describe('governance 0.15 independent issue plurality', () => {
    it('denies inactive officeholders submission, resolution and assignment without transferring player control', () => {
      const fixture = findResolvable(true), draftState = structuredClone(fixture.state), id = fixture.personId;
      draftState.governance.persons[id].status = 'inactive';
      expect(() => submitProposal(draftState, fixture.proposalId)).toThrow();
      expect(() => assignPoliticalOffice(draftState, id, { countryId: fixture.countryId, role: 'head_of_government' })).toThrow(/active/);
      expect(governanceInvariant.check(draftState, worldContext, 'save').join(' ')).toContain('Inactive person');
      const submitted = structuredClone(submitProposal(fixture.state, fixture.proposalId)); submitted.governance.persons[id].status = 'inactive';
      expect(() => resolveProposalVote(submitted, fixture.proposalId, fixture.registry, fixture.profiles)).toThrow();
      const former = revokePoliticalOffice(fixture.state, id);
      expect(setControlledPerson(former, id).governance.player.controlledPersonId).toBe(id);
      expect(former.governance.persons[id].status).toBe('active'); expect(former.governance.persons[id].office).toBeUndefined();
    });

    it('rounds signed central agreement deltas symmetrically before adding the neutral center', () => {
      const goals = distributionProfile();
      for (const preference of Object.values(goals.goals)) { preference.idealPointBps = 10_000; preference.importanceBps = 10_000; preference.compromiseToleranceBps = 10_000; }
      for (const delta of [1, 3]) {
        const up = evaluateProfileForPublic(distributionAnalysis({ fiscal_distribution: delta, infrastructure: 0 }), goals);
        const down = evaluateProfileForPublic(distributionAnalysis({ fiscal_distribution: -delta, infrastructure: 0 }), goals);
        expect(up.agreementBps - 5_000).toBe(5_000 - down.agreementBps);
      }
    });

    it('uses dated fiscal monthly spending rather than rounded annual totals before the first booking', () => {
      const countryId = resolvableCountry(), player = playerFor(structuredClone(initial), countryId), country = player.state.fiscal.countries[countryId], budget = country.annualBudget;
      for (const key of Object.keys(budget) as Array<keyof typeof budget>) budget[key] = 1;
      country.revenueCalibration.monthlyAmount = 1; country.debt = 0;
      for (const region of Object.values(player.state.fiscal.regions).filter(item => item.owner === countryId)) for (const tax of Object.values(region.taxes)) tax.collected = 0;
      const made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: 2 } });
      const first = analyzeProposal(made.state, made.proposal).materialContext.fiscalDistress;
      const last = analyzeProposal({ ...made.state, date: '2026-12-01' }, made.proposal).materialContext.fiscalDistress;
      expect(first.valueBps).toBe(10_000); expect(last.valueBps).toBe(0);
    });

    it('breaks exact odd-seat ties by stable identities, not YES/NO bucket priority', () => {
      const base = evaluatePartyInternalVoteDistribution(distributionAnalysis({ fiscal_distribution: 1_500 }), distributionProfile());
      const tie = { ...base, yesBps: 5_000, noBps: 5_000, abstainBps: 0, unknownBps: 0 };
      const allBuckets = { ...base, yesBps: 2_500, noBps: 2_500, abstainBps: 2_500, unknownBps: 2_500 };
      const winners = new Set<string>(), yesTotals: number[] = [];
      for (let index = 0; index < 128; index++) {
        const identity = { proposalId: `proposal.fixture-${index}`, chamberId: `chamber.fixture-${index % 5}`, partyId: `party.fixture-${index % 7}` };
        const allocation = allocatePartySeats(3, tie, identity);
        yesTotals.push(allocation.yesSeats);
        expect(allocatePartySeats(3, tie, { ...identity })).toEqual(allocation);
        const one = allocatePartySeats(1, allBuckets, identity); winners.add(Object.entries(one).find(([, seats]) => seats === 1)![0]);
        expect(Object.values(allocation).reduce((a, b) => a + b)).toBe(3);
      }
      expect(new Set(yesTotals)).toEqual(new Set([1, 2])); expect(winners.size).toBe(4);
      expect(allocatePartySeats(3, tie)).toEqual({ yesSeats: 2, noSeats: 1, abstainSeats: 0, unknownSeats: 0 });
      expect(() => allocatePartySeats(-1, tie, { proposalId: 'a', chamberId: 'b', partyId: 'c' })).toThrow();
    });

    it('rejects independently valid plurality records that differ between estimate and result', () => {
      const fixture = findResolvable(true), resolved = resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles);
      const corrupted = structuredClone(resolved), proposal = corrupted.governance.proposals[fixture.proposalId];
      proposal.voteResult!.confidenceBps--;
      const errors = governanceInvariant.check(corrupted, worldContext, 'save');
      expect(errors.join(' ')).toContain('Plurality estimate/result mismatch'); expect(errors.join(' ')).not.toContain('Invalid vote result');
      proposal.parliamentaryEstimate!.confidenceBps = proposal.voteResult!.confidenceBps;
      expect(governanceInvariant.check(corrupted, worldContext, 'save')).toEqual([]);
      const saved = restoreSimulationState(serializeSimulationState(resolved, worldContext), worldRegions, {}, {}, worldContext);
      expect(saved.governance.proposals[fixture.proposalId]).toEqual(resolved.governance.proposals[fixture.proposalId]);
    }, 30_000);

    it('preserves unmarked candidate plurality ties across reload using their historical allocator', () => {
      const fixture = findResolvable(true), submitted = submitProposal(fixture.state, fixture.proposalId);
      const resolved = resolveProposalVote({ ...submitted, date: '2026-03-01' }, fixture.proposalId, fixture.registry, fixture.profiles);
      const proposal = structuredClone(resolved.governance.proposals[fixture.proposalId]), estimate = proposal.parliamentaryEstimate!;
      delete estimate.seatApportionment;
      for (const chamber of estimate.chambers) {
        for (const party of chamber.partyEvaluations ?? []) {
          party.internalDistribution = { ...party.internalDistribution!, yesBps: 5_000, noBps: 5_000, abstainBps: 0, unknownBps: 0 };
          party.seatAllocation = allocatePartySeats(party.seats, party.internalDistribution);
        }
        chamber.yesSeats = chamber.partyEvaluations!.reduce((sum, item) => sum + item.seatAllocation!.yesSeats, 0);
        chamber.noSeats = chamber.partyEvaluations!.reduce((sum, item) => sum + item.seatAllocation!.noSeats, 0);
        chamber.abstainSeats = 0; chamber.adopted = chamber.yesSeats > chamber.noSeats;
      }
      estimate.yesSeats = estimate.chambers.reduce((sum, item) => sum + item.yesSeats, 0);
      estimate.noSeats = estimate.chambers.reduce((sum, item) => sum + item.noSeats, 0); estimate.abstainSeats = 0;
      proposal.voteResult = { ...structuredClone(estimate), outcome: 'unavailable', reason: 'effective_date_expired', resolvedOn: resolved.date };
      const saved = { ...resolved, information: { ...resolved.information, briefings: [] }, governance: { ...resolved.governance, proposals: { [proposal.id]: proposal } } };
      expect(governanceInvariant.check(saved, worldContext, 'save')).toEqual([]);
      const loaded = restoreSimulationState(serializeSimulationState(saved, worldContext), worldRegions, {}, {}, worldContext);
      expect(loaded.governance.proposals[proposal.id]).toEqual(proposal); expect(loaded.governance.proposals[proposal.id].voteResult!.seatApportionment).toBeUndefined();
    }, 30_000);

    it('splits a real seat allocation near a threshold while retaining the central vote', () => {
      const analysis = distributionAnalysis({ fiscal_distribution: 1_500 }), goals = distributionProfile();
      const central = evaluateProfileForPublic(analysis, goals), distribution = evaluatePartyInternalVoteDistribution(analysis, goals, central);
      expect(central.agreementBps).toBe(6_500);
      expect(distribution).toMatchObject({ method: 'continuous_issue_distribution_v1', status: 'modelled_common_prior', unknownBps: 0 });
      expect(distribution.yesBps).toBeGreaterThan(0); expect(distribution.noBps).toBeGreaterThan(0); expect(distribution.abstainBps).toBeGreaterThan(0);
      const seats = allocatePartySeats(120, distribution);
      expect(seats.yesSeats).toBeGreaterThan(0); expect(seats.noSeats).toBeGreaterThan(0); expect(seats.abstainSeats).toBeGreaterThan(0);
      expect(Object.values(seats).reduce((sum, value) => sum + value, 0)).toBe(120);
      expect(Object.isFrozen(INTERNAL_PARTY_DISTRIBUTION_MODEL)).toBe(true);
      expect(INTERNAL_PARTY_DISTRIBUTION_MODEL.quadrature.every(Object.isFrozen)).toBe(true);
    });

    it('lets the same party divide on one issue and remain unanimously favorable or unfavorable on another', () => {
      const goals = distributionProfile(), split = evaluatePartyInternalVoteDistribution(distributionAnalysis({ fiscal_distribution: 1_500 }), goals);
      const favorable = evaluatePartyInternalVoteDistribution(distributionAnalysis({ infrastructure: 3_000 }), goals);
      const unfavorable = evaluatePartyInternalVoteDistribution(distributionAnalysis({ infrastructure: -3_000 }), goals);
      expect(split).not.toEqual(favorable);
      expect(favorable).toMatchObject({ yesBps: 10_000, noBps: 0, abstainBps: 0 });
      expect(unfavorable).toMatchObject({ yesBps: 0, noBps: 10_000, abstainBps: 0 });
    });

    it('combines independent goal variances instead of one universally correlated faction axis', () => {
      const goals = distributionProfile(), a = distributionAnalysis({ fiscal_distribution: 1_500 }), b = distributionAnalysis({ income_security: 1_500 });
      const both = distributionAnalysis({ fiscal_distribution: 1_500, income_security: 1_500 });
      const singleA = evaluatePartyInternalVoteDistribution(a, goals), singleB = evaluatePartyInternalVoteDistribution(b, goals);
      const combined = evaluatePartyInternalVoteDistribution(both, goals);
      expect(singleA).toEqual(singleB);
      expect(combined.agreementMeanBps).toBe(singleA.agreementMeanBps);
      expect(combined.agreementHalfSpreadBps).toBeGreaterThan(0);
      expect(combined.agreementHalfSpreadBps).toBeLessThan(singleA.agreementHalfSpreadBps);
      const universal = INTERNAL_PARTY_DISTRIBUTION_MODEL.quadrature.map(sample => {
        const correlated = structuredClone(goals);
        for (const goal of ['fiscal_distribution', 'income_security'] as const) {
          correlated.goals[goal].idealPointBps = Math.max(5_000, Math.min(10_000, 6_500 + 1_800 * sample.stanceBps / 10_000));
          correlated.goals[goal].compromiseToleranceBps = 3_000 - 1_600 * sample.stanceBps / 10_000;
        }
        return { agreement: evaluateProfileForPublic(both, correlated).agreementBps, weight: sample.weightBps };
      });
      const mean = Math.round(universal.reduce((sum, sample) => sum + sample.agreement * sample.weight, 0) / 10_000);
      const variance = Math.round(universal.reduce((sum, sample) => sum + (sample.agreement - mean) ** 2 * sample.weight, 0) / 10_000);
      expect(combined.agreementHalfSpreadBps).not.toBe(Math.floor(Math.sqrt(6 * variance)));
      expect(evaluatePartyInternalVoteDistribution({ ...both, expectedConsequences: [...both.expectedConsequences].reverse() }, goals)).toEqual(combined);
    });

    it('keeps missing or low-confidence evidence entirely UNKNOWN, never abstention', () => {
      const analysis = distributionAnalysis({ fiscal_distribution: 1_500 }), goals = distributionProfile();
      const lowConfidence = structuredClone(goals); lowConfidence.goals.fiscal_distribution.confidenceBps = 2_999;
      const absentContext = structuredClone(analysis); absentContext.materialContext.fiscalDistribution.valueBps = undefined;
      for (const distribution of [
        evaluatePartyInternalVoteDistribution(analysis, undefined),
        evaluatePartyInternalVoteDistribution(analysis, lowConfidence),
        evaluatePartyInternalVoteDistribution(absentContext, goals),
      ]) {
        expect(distribution).toMatchObject({ yesBps: 0, noBps: 0, abstainBps: 0, unknownBps: 10_000, coverage: 'unavailable', status: 'unavailable' });
        expect(allocatePartySeats(53, distribution)).toEqual({ yesSeats: 0, noSeats: 0, abstainSeats: 0, unknownSeats: 53 });
      }
      const eligible = structuredClone(goals); eligible.goals.fiscal_distribution.confidenceBps = 3_000;
      expect(evaluatePartyInternalVoteDistribution(analysis, eligible)).toEqual(evaluatePartyInternalVoteDistribution(analysis, goals));
    });

    it('conserves awkward party seat counts with exact deterministic largest remainders', () => {
      const distribution = evaluatePartyInternalVoteDistribution(distributionAnalysis({ fiscal_distribution: 1_500 }), distributionProfile());
      for (const seats of [1, 2, 3, 7, 53, 120]) {
        const allocation = allocatePartySeats(seats, distribution);
        expect(Object.values(allocation).reduce((sum, value) => sum + value, 0)).toBe(seats);
        expect(allocatePartySeats(seats, distribution)).toEqual(allocation);
      }
      const tie = { ...distribution, yesBps: 5_000, noBps: 5_000, abstainBps: 0 };
      expect(allocatePartySeats(3, tie)).toEqual({ yesSeats: 2, noSeats: 1, abstainSeats: 0, unknownSeats: 0 });
      const fractional = { ...distribution, yesBps: 3_334, noBps: 3_333, abstainBps: 3_333 };
      for (const [seats, yesSeats, noSeats, abstainSeats] of [[1, 1, 0, 0], [2, 1, 1, 0], [3, 1, 1, 1], [7, 3, 2, 2], [53, 18, 18, 17], [120, 40, 40, 40]]) {
        expect(allocatePartySeats(seats, fractional)).toEqual({ yesSeats, noSeats, abstainSeats, unknownSeats: 0 });
      }
      expect(() => allocatePartySeats(3, { ...tie, yesBps: 4_999 })).toThrow(/10,000/);
    });

    it('conserves multiple-party chamber seats and uses allocations rather than the central YES decision', () => {
      const countryId = historicalSituational.person.countryId, proposal = historicalSituational.proposal;
      const profiles = Object.fromEntries(politicalRegistry.countries[countryId].partyIds.map(id => [id, distributionProfile(id)]));
      const analysis = distributionAnalysis({ fiscal_distribution: 1_500 });
      const estimate = estimateParliamentarySupport(initial, proposal, politicalRegistry, profiles, analysis);
      expect(estimate.procedure).toBe('internal_party_distribution_v1');
      expect(estimate.coverage).toBe('complete'); expect(estimate.yesSeats).toBeLessThan(estimate.totalSeats);
      for (const chamber of estimate.chambers) {
        expect(chamber.yesSeats + chamber.noSeats + chamber.abstainSeats + chamber.unavailableSeats).toBe(chamber.totalSeats);
        expect(chamber.partyEvaluations!.every(evaluation => evaluation.vote === 'yes')).toBe(true);
        expect(chamber.abstainSeats).toBeGreaterThan(0);
        expect(chamber.yesSeats).toBe(chamber.partyEvaluations!.reduce((sum, evaluation) => sum + evaluation.seatAllocation!.yesSeats, 0));
      }
      const reordered = structuredClone(politicalRegistry);
      reordered.parties = Object.fromEntries(Object.entries(reordered.parties).reverse());
      for (const institution of Object.values(reordered.institutions)) for (const chamber of institution.chambers) chamber.seatsByParty = Object.fromEntries(Object.entries(chamber.seatsByParty).reverse());
      expect(estimateParliamentarySupport(initial, proposal, reordered, Object.fromEntries(Object.entries(profiles).reverse()), analysis)).toEqual(estimate);
      const withIndependent = structuredClone(politicalRegistry), institution = withIndependent.institutions[withIndependent.countries[countryId].institutionId];
      institution.chambers[0].independentOtherSeats = 1; institution.chambers[0].totalSeats! += 1;
      const partial = estimateParliamentarySupport(initial, proposal, withIndependent, profiles, analysis);
      expect(partial.unavailableSeats).toBe(1); expect(partial.coverage).toBe('partial');
      expect(partial.yesSeats + partial.noSeats + partial.abstainSeats + partial.unavailableSeats).toBe(partial.totalSeats);
    });

    it('preserves new plurality results exactly on reload and resolves only future loaded proposals under the new version', () => {
      const fixture = findResolvable(true), submitted = submitProposal(fixture.state, fixture.proposalId);
      const loaded = restoreSimulationState(serializeSimulationState(submitted, worldContext), worldRegions, {}, {}, worldContext);
      const resolved = resolveProposalVote(loaded, fixture.proposalId, fixture.registry, fixture.profiles);
      const restored = restoreSimulationState(serializeSimulationState(resolved, worldContext), worldRegions, {}, {}, worldContext);
      expect(restored).toEqual(resolved);
      expect(restored.governance.proposals[fixture.proposalId].evaluationVersion).toBe('situational-plurality-0.15-v2');
      expect(restored.governance.proposals[fixture.proposalId].voteResult!.procedure).toBe('internal_party_distribution_v1');
      expect(submitted.governance.proposals[fixture.proposalId].voteResult).toBeUndefined();
      expect(resolved.engine).toEqual(submitted.engine); expect(resolved.date).toBe(submitted.date);
      expect(restored.governance.proposals[fixture.proposalId].voteResult!.chambers.flatMap(chamber => chamber.partyEvaluations ?? []).every(item => item.seatAllocation && item.internalDistribution)).toBe(true);
    }, 30_000);

    it('rejects corrupt distributions, allocations and mixed historical/procedure versions', () => {
      const fixture = findResolvable(true), state = resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles);
      const mutations: ((proposal: PoliticalProposal) => void)[] = [
        proposal => { proposal.parliamentaryEstimate!.chambers[0].partyEvaluations![0].internalDistribution!.yesBps += 1; },
        proposal => { delete proposal.parliamentaryEstimate!.chambers[0].partyEvaluations![0].decisionModel; },
        proposal => { const allocation = proposal.parliamentaryEstimate!.chambers[0].partyEvaluations![0].seatAllocation!; allocation.yesSeats -= 1; allocation.noSeats += 1; },
        proposal => { proposal.parliamentaryEstimate!.yesSeats += 1; },
        proposal => { proposal.parliamentaryEstimate!.procedure = 'modelled_procedure_v1'; },
        proposal => { proposal.evaluationVersion = 'situational-0.14-v2'; },
        proposal => { proposal.evaluationVersion = 'legacy-0.14-v1'; },
        proposal => { Reflect.set(proposal, 'evaluationVersion', 'invalid-version'); },
        proposal => { delete proposal.evaluationVersion; },
        proposal => { delete proposal.voteResult!.chambers[0].partyEvaluations; },
        proposal => { proposal.voteResult!.chambers[0].partyEvaluations![0].internalDistribution!.unknownBps = 10_000; },
      ];
      for (const mutate of mutations) {
        const proposal = structuredClone(state.governance.proposals[fixture.proposalId]); mutate(proposal);
        const corrupted = { ...state, governance: { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: proposal } } };
        expect(governanceInvariant.check(corrupted, worldContext, 'save').join(' ')).toMatch(/Invalid parliamentary estimate|Invalid vote result/);
        expect(() => serializeSimulationState(corrupted, worldContext)).toThrow();
      }
      const historical = historicalSituationalState(), proposal = historical.governance.proposals[historicalSituational.proposal.id];
      proposal.parliamentaryEstimate!.chambers[0].partyEvaluations![0].vote = 'unknown';
      expect(governanceInvariant.check(historical, worldContext, 'save').join(' ')).toContain('Invalid parliamentary estimate');
      const oldBuckets = historicalSituationalState(), oldEstimate = oldBuckets.governance.proposals[historicalSituational.proposal.id].parliamentaryEstimate!;
      oldEstimate.chambers[0].yesSeats -= 1; oldEstimate.chambers[0].noSeats += 1;
      oldEstimate.yesSeats -= 1; oldEstimate.noSeats += 1;
      expect(governanceInvariant.check(oldBuckets, worldContext, 'save').join(' ')).toContain('Invalid parliamentary estimate');
      expect(() => serializeSimulationState(oldBuckets, worldContext)).toThrow();
    }, 30_000);

    it('keeps inspection pure across every canonical branch', () => {
      const state = historicalSituationalState(), before = structuredClone(state);
      inspectProposalSupport(state, historicalSituational.proposal.id);
      expect(state).toEqual(before);
      expect(state.governance.proposals[historicalSituational.proposal.id].evaluationVersion).toBe('situational-0.14-v2');
    });
  });

  it('holds transfers constant in a tax-only counterfactual', () => {
    const made = taxDraft('personal', rule => { rule.bands![0].rateBps = Math.min(10_000, rule.bands![0].rateBps + 500); }), state = structuredClone(made.state), regionId = Object.keys(state.fiscal.regions).find(id => state.regionOwnership[id] === made.countryId)!;
    const region = state.fiscal.regions[regionId]; region.transfers = [101, 202, 303]; region.disposable = region.disposable.map((value, index) => value + region.transfers[index]);
    const result = evaluateImmediateFiscalPolicyCounterfactual(state, made.countryId, made.proposal.payload.policy!, made.proposal.effectiveDate);
    expect(result.proposedTransfersByIncome).toEqual(result.currentTransfersByIncome); expect(result.currentTransfersByIncome.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(606);
  });

  it('attributes disposable-income change only to direct-tax incidence', () => {
    const made = taxDraft('personal', rule => { rule.bands![0].rateBps = Math.min(10_000, rule.bands![0].rateBps + 500); }), state = structuredClone(made.state), regionId = Object.keys(state.fiscal.regions).find(id => state.regionOwnership[id] === made.countryId)!;
    const region = state.fiscal.regions[regionId]; region.transfers = [111, 222, 333]; region.disposable = region.disposable.map((value, index) => value + region.transfers[index]);
    const result = evaluateImmediateFiscalPolicyCounterfactual(state, made.countryId, made.proposal.payload.policy!, made.proposal.effectiveDate);
    for (let index = 0; index < 3; index++) expect(result.proposedDisposableByIncome[index] - result.currentDisposableByIncome[index]).toBe(-(result.proposedDirectTaxByIncome[index] - result.currentDirectTaxByIncome[index]));
  });

  it('records both fiscal benefit and household burden for a VAT increase', () => {
    const made = taxDraft('consumption', rule => { rule.rateBps = Math.min(10_000, (rule.rateBps ?? 0) + 2_000); }), consequences = analyzeProposal(made.state, made.proposal).expectedConsequences;
    expect(consequences).toEqual(expect.arrayContaining([expect.objectContaining({ goal: 'fiscal_sustainability', source: expect.stringContaining('consumption') }), expect.objectContaining({ goal: 'income_security', source: 'fiscal.counterfactual.consumption_tax_burden' })]));
    expect(consequences.find(item => item.source === 'fiscal.counterfactual.consumption_tax_burden')!.directionBps).toBeLessThan(0); expect(consequences.some(item => item.source === 'fiscal.counterfactual.consumption_tax_incidence')).toBe(true);
  });

  it('keeps unknown party evidence distinct from a real abstention', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), made = budgetProposal(player.state, player.id, countryId, 2), proposal = made.governance.proposals[made.governance.proposalOrder[0]], partyId = politicalRegistry.countries[countryId].partyIds[0], fallback = profile(partyId, {});
    for (const goal of Object.values(fallback.goals)) { goal.confidenceBps = 500; goal.status = 'modelled_fallback'; }
    expect(evaluatePartyProposal(made, proposal, partyId, politicalRegistry, fallback).vote).toBe('unknown');
  });

  it('makes an all-unknown chamber unavailable instead of rejected', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId); let state = budgetProposal(player.state, player.id, countryId, 2), proposalId = state.governance.proposalOrder[0], estimate = estimateParliamentarySupport(state, state.governance.proposals[proposalId]);
    expect(estimate.coverage).toBe('unavailable'); expect(estimate.yesSeats + estimate.noSeats + estimate.abstainSeats).toBe(0); expect(estimate.unavailableSeats).toBe(estimate.totalSeats); expect(estimate.chambers.flatMap(item => item.partyEvaluations ?? []).every(item => item.vote === 'unknown')).toBe(true);
    state = resolveProposalVote(submitProposal(state, proposalId), proposalId); expect(state.governance.proposals[proposalId]).toMatchObject({ status: 'unavailable', voteResult: { outcome: 'unavailable', reason: 'institutional_data_unavailable' } });
  });

  it('counts a sufficiently known middle-range position as a real abstention', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure + Math.max(1, Math.round(budget.infrastructure / 100)) } }), analysis = analyzeProposal(made.state, made.proposal), profiles: Record<string, PartyGoalProfile> = {};
    const currentFiscal = Math.min(analysis.materialContext.fiscalSustainability.valueBps!, 10_000 - analysis.materialContext.fiscalDistress.valueBps!);
    for (const partyId of politicalRegistry.countries[countryId].partyIds) profiles[partyId] = profile(partyId, { infrastructure: { idealPointBps: analysis.materialContext.infrastructure.valueBps!, importanceBps: 10_000, compromiseToleranceBps: 10_000, confidenceBps: 10_000 }, fiscal_sustainability: { idealPointBps: currentFiscal, importanceBps: 10_000, compromiseToleranceBps: 10_000, confidenceBps: 10_000 } });
    const estimate = estimateParliamentarySupport(made.state, made.proposal, politicalRegistry, profiles, analysis); expect(estimate.coverage).toBe('complete'); expect(estimate.abstainSeats).toBe(estimate.totalSeats); expect(estimate.unavailableSeats).toBe(0); expect(estimate.chambers.flatMap(item => item.partyEvaluations ?? []).every(item => item.vote === 'abstain')).toBe(true);
  });

  it('keeps unknown public evidence out of the neutral bucket', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), state = structuredClone(budgetProposal(player.state, player.id, countryId, 2)), proposal = state.governance.proposals[state.governance.proposalOrder[0]];
    for (const regional of Object.values(state.politics.regionalOpinion)) if (regional.countryId === countryId) for (const opinion of Object.values(regional.cohorts)) opinion[COHORT.engagement] = 0;
    const estimate = estimatePublicSupport(state, proposal); expect(estimate.coverage).toBe('unavailable'); expect(estimate.knownPersons).toBe(0); expect(estimate.unknownPersons).toBe(estimate.representedPersons); expect(estimate.unknownBps).toBe(10_000); expect(estimate.neutralBps).toBe(0);
  });

  it('rejects party vote decisions that contradict confidence or agreement thresholds', () => {
    const fixture = findResolvable(true), corrupted = structuredClone(resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles)), proposal = corrupted.governance.proposals[fixture.proposalId], evaluation = proposal.parliamentaryEstimate!.chambers[0].partyEvaluations![0]; evaluation.vote = 'unknown';
    expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/Invalid parliamentary estimate/);
  });

  it('rejects chamber seat buckets that disagree with party decisions', () => {
    const fixture = findResolvable(true), corrupted = structuredClone(resolveProposalVote(submitProposal(fixture.state, fixture.proposalId), fixture.proposalId, fixture.registry, fixture.profiles)), proposal = corrupted.governance.proposals[fixture.proposalId], estimate = proposal.parliamentaryEstimate!, chamber = estimate.chambers[0], moved = chamber.partyEvaluations![0].seats;
    chamber.yesSeats -= moved; chamber.abstainSeats += moved; estimate.yesSeats -= moved; estimate.abstainSeats += moved;
    expect(() => assertSimulationInvariants(corrupted, worldContext, 'tick')).toThrow(/Invalid parliamentary estimate/);
  });

  it('keeps governance on-demand and material branches unchanged during evaluation', () => {
    const countryId = resolvableCountry(), player = playerFor(initial, countryId), budget = player.state.fiscal.countries[countryId].annualBudget, made = draft(player.state, player.id, countryId, { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } }), before = { fiscal: made.state.fiscal, socioeconomy: made.state.socioeconomy, politics: made.state.politics, crisis: made.state.crisis };
    inspectProposalSupport(made.state, made.proposal.id); expect(made.state.fiscal).toBe(before.fiscal); expect(made.state.socioeconomy).toBe(before.socioeconomy); expect(made.state.politics).toBe(before.politics); expect(made.state.crisis).toBe(before.crisis);
  });
});
