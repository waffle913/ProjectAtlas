/// <reference types="node" />
import { performance } from 'node:perf_hooks';
import historical from './fixtures/governance-situational-0.14-v2.json';
import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { politicalRegistry } from '../politics/registry';
import { createSimulationSnapshotCache } from '../state';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { assignPoliticalOffice, createFiscalProposal, createPoliticalPerson, inspectProposalSupport, replacePartyLeader, resolveProposalVote, setControlledPerson, submitProposal } from '../governance/runtime';
import { analyzeProposal, derivePartyGoalProfile } from '../governance/analysis';
import { estimateParliamentarySupport } from '../governance/estimates';
import type { PartyGoalProfile } from '../governance/model';

describe('full-world governance and leadership 0.15 benchmark', () => {
  it('measures initialized leaders, save size, snapshots and legislative coverage', () => {
    const state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs), cache = createSimulationSnapshotCache(); cache(state);
    let t = performance.now(); const snapshot = cache({ ...state, date: '2026-01-02' }); const snapshotMs = performance.now() - t;
    t = performance.now(); const serialized = serializeSimulationState(state, worldContext), serializeMs = performance.now() - t;
    const institutions = Object.values(politicalRegistry.institutions), chambers = institutions.flatMap(item => item.chambers);
    const resolvableCountryIds = Object.values(politicalRegistry.countries).filter(country => { const institution = politicalRegistry.institutions[country.institutionId]; return Boolean(institution?.chambers.length) && institution.chambers.every(chamber => chamber.seatAllocationStatus === 'sourced' && chamber.totalSeats !== undefined && (chamber.independentOtherSeats ?? 0) === 0 && Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0) === chamber.totalSeats); }).map(item => item.countryId);
    const ideologicalCountryIds = Object.values(politicalRegistry.countries).filter(country => country.partyIds.some(id => ['sourced', 'partial'].includes(politicalRegistry.parties[id].ideologicalBasis.status))).map(item => item.countryId), overlapCountries = resolvableCountryIds.filter(id => ideologicalCountryIds.includes(id)).length;
    const parties = Object.values(politicalRegistry.parties), ideology = { sourced: parties.filter(item => item.ideologicalBasis.status === 'sourced').length, partial: parties.filter(item => item.ideologicalBasis.status === 'partial').length, fallback: parties.filter(item => item.ideologicalBasis.status === 'modelled_fallback').length };
    const analysisCountry = Object.values(politicalRegistry.countries).find(country => country.partyIds.length)!.countryId; let evaluated = createPoliticalPerson(state, { displayName: 'Benchmark actor', countryId: analysisCountry }); const actorId = `person.${String(evaluated.governance.nextPersonSequence - 1).padStart(8, '0')}`; evaluated = setControlledPerson(evaluated, actorId); evaluated = assignPoliticalOffice(evaluated, actorId, { role: 'head_of_government', countryId: analysisCountry }); const budget = evaluated.fiscal.countries[analysisCountry].annualBudget; evaluated = createFiscalProposal(evaluated, { proposerPersonId: actorId, countryId: analysisCountry, effectiveDate: '2026-02-01', payload: { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } } });
    const proposalId = evaluated.governance.proposalOrder[0], analysisCalls = 20; t = performance.now(); for (let index = 0; index < analysisCalls; index++) inspectProposalSupport(evaluated, proposalId); const analysisMeanMs = (performance.now() - t) / analysisCalls;
    const representativeCountry = historical.person.countryId;
    let representative = createPoliticalPerson(state, { displayName: 'Synthetic plurality benchmark actor', countryId: representativeCountry });
    const representativeActor = `person.${String(representative.governance.nextPersonSequence - 1).padStart(8, '0')}`;
    representative = assignPoliticalOffice(setControlledPerson(representative, representativeActor), representativeActor, { role: 'head_of_government', countryId: representativeCountry });
    const representativeBudget = representative.fiscal.countries[representativeCountry].annualBudget;
    representative = createFiscalProposal(representative, { proposerPersonId: representativeActor, countryId: representativeCountry, effectiveDate: '2026-02-01', payload: { annualBudget: { ...representativeBudget, infrastructure: representativeBudget.infrastructure * 2 } } });
    const representativeProposalId = representative.governance.proposalOrder[0];
    const syntheticProfiles: Record<string, PartyGoalProfile> = Object.fromEntries(politicalRegistry.countries[representativeCountry].partyIds.map(partyId => {
      const profile = derivePartyGoalProfile(politicalRegistry.parties[partyId]);
      for (const preference of Object.values(profile.goals)) {
        preference.importanceBps = 0; preference.confidenceBps = 10_000; preference.status = 'modelled_fallback';
      }
      profile.goals.fiscal_sustainability = { idealPointBps: 8_000, importanceBps: 10_000, compromiseToleranceBps: 3_000, confidenceBps: 10_000, status: 'modelled_fallback' };
      return [partyId, profile];
    }));
    t = performance.now();
    for (let index = 0; index < analysisCalls; index++) inspectProposalSupport(representative, representativeProposalId, politicalRegistry, syntheticProfiles);
    const syntheticAnalysisMeanMs = (performance.now() - t) / analysisCalls;
    const submitted = submitProposal(representative, representativeProposalId), submittedSaveBytes = Buffer.byteLength(serializeSimulationState(submitted, worldContext));
    const resolved = resolveProposalVote(submitted, representativeProposalId, politicalRegistry, syntheticProfiles), resolvedProposal = resolved.governance.proposals[representativeProposalId];
    const resolvedSave = serializeSimulationState(resolved, worldContext), resolvedSaveBytes = Buffer.byteLength(resolvedSave);
    const undecoratedRecord = structuredClone(resolvedProposal);
    for (const estimate of [undecoratedRecord.parliamentaryEstimate!, undecoratedRecord.voteResult!]) for (const chamber of estimate.chambers) for (const item of chamber.partyEvaluations ?? []) {
      delete item.decisionModel; delete item.internalDistribution; delete item.seatAllocation;
    }
    const resolvedProposalBytes = Buffer.byteLength(JSON.stringify(resolvedProposal));
    const distributionMetadataBytes = resolvedProposalBytes - Buffer.byteLength(JSON.stringify(undecoratedRecord));
    expect(resolvedProposal.evaluationVersion).toBe('situational-plurality-0.15-v2');
    expect(resolvedProposal.voteResult!.coverage).toBe('complete');
    expect(resolvedProposal.voteResult!.chambers.flatMap(chamber => chamber.partyEvaluations ?? []).some(item => Object.values(item.seatAllocation!).filter(seats => seats > 0).length > 1)).toBe(true);
    const evaluations = resolvedProposal.voteResult!.chambers.flatMap(chamber => chamber.partyEvaluations ?? []);
    expect(evaluations.every(item => item.institutionalInterest?.status === 'not_applicable' && item.institutionalInterest.adjustmentBps === 0)).toBe(true);
    const withoutInstitutionalEvidence = structuredClone(resolvedProposal);
    delete withoutInstitutionalEvidence.analysis!.institutionalEffects;
    for (const estimate of [withoutInstitutionalEvidence.parliamentaryEstimate!, withoutInstitutionalEvidence.voteResult!]) for (const chamber of estimate.chambers) for (const item of chamber.partyEvaluations ?? []) delete item.institutionalInterest;
    const institutionalMetadataBytes = resolvedProposalBytes - Buffer.byteLength(JSON.stringify(withoutInstitutionalEvidence));
    expect(institutionalMetadataBytes).toBeGreaterThan(0);
    const representativeChamber = politicalRegistry.institutions[politicalRegistry.countries[representativeCountry].institutionId].chambers[0];
    const institutionalAnalysis = analyzeProposal(representative, representative.governance.proposals[representativeProposalId]);
    institutionalAnalysis.institutionalEffects = [{
      id: 'benchmark.synthetic-transfer', lever: 'budget_initiative', from: `chamber:${representativeChamber.id}`, to: 'none',
      confidenceBps: 10_000, coverage: 'complete', source: 'Synthetic benchmark-only power transfer, not an observed fiscal effect.',
      explanation: 'Exercises on-demand institutional adjustment and strategic plurality; no constitutional gameplay is implemented.',
    }];
    t = performance.now();
    for (let index = 0; index < analysisCalls; index++) estimateParliamentarySupport(representative, representative.governance.proposals[representativeProposalId], politicalRegistry, syntheticProfiles, institutionalAnalysis);
    const syntheticInstitutionalAnalysisMeanMs = (performance.now() - t) / analysisCalls;
    const institutionalEstimate = estimateParliamentarySupport(representative, representative.governance.proposals[representativeProposalId], politicalRegistry, syntheticProfiles, institutionalAnalysis);
    const institutionalEvaluations = institutionalEstimate.chambers.flatMap(chamber => chamber.partyEvaluations ?? []);
    expect(institutionalEvaluations.every(item => item.institutionalInterest?.status === 'modelled')).toBe(true);
    expect(institutionalEvaluations.some(item => item.internalDistribution!.agreementHalfSpreadBps > 0)).toBe(true);
    expect(distributionMetadataBytes).toBeGreaterThan(0);
    expect(restoreSimulationState(resolvedSave, worldRegions, {}, {}, worldContext)).toEqual(resolved);
    const persons = Object.values(state.governance.persons);
    const leaders = persons.filter(person => person.isPartyLeader);
    const standaloneExecutives = persons.filter(person => person.office?.evidence && !person.isPartyLeader);
    const successionPartyId = politicalRegistry.countries[representativeCountry].partyIds[0];
    t = performance.now();
    const contextual = replacePartyLeader(state, successionPartyId);
    const contextualSuccessionMs = performance.now() - t;
    const succession = contextual.governance.successions[contextual.governance.successionOrder.at(-1)!];
    expect(succession.selection).toBe('modelled_internal_balance');
    expect(succession.contextEvidence?.profileFingerprint).toBeDefined();
    expect(contextual.politics).toBe(state.politics); expect(contextual.engine).toBe(state.engine);
    const contextualSuccessionSaveDeltaBytes = Buffer.byteLength(serializeSimulationState(contextual, worldContext)) - Buffer.byteLength(serialized);
    const contextualSuccessionEvidenceBytes = Buffer.byteLength(JSON.stringify(succession.contextEvidence));
    expect(snapshot.governance).toBe(cache(state).governance); expect(leaders).toHaveLength(parties.length);
    expect(persons).toHaveLength(parties.length + standaloneExecutives.length);
    expect(Object.keys(state.governance.proposals)).toHaveLength(0); expect(resolvableCountryIds.length).toBeGreaterThan(0);
    console.info(`GOVERNANCE_WORLD_BENCHMARK ${JSON.stringify({ benchmark: 'projectatlas-governance-information-0.15', countries: worldCountryIds.length, chambers: chambers.length, resolvableCountries: resolvableCountryIds.length, ideologicalEvidenceCountries: ideologicalCountryIds.length, evidenceBackedVoteOverlapCountries: overlapCountries, unavailableCountries: worldCountryIds.length - resolvableCountryIds.length, ideologyParties: ideology, persons: Object.keys(state.governance.persons).length, proposals: 0, saveBytes: Buffer.byteLength(serialized), snapshotMs: Number(snapshotMs.toFixed(4)), serializeMs: Number(serializeMs.toFixed(2)), analysisCalls, analysisMeanMs: Number(analysisMeanMs.toFixed(3)), syntheticAnalysisMeanMs: Number(syntheticAnalysisMeanMs.toFixed(3)), syntheticInstitutionalAnalysisMeanMs: Number(syntheticInstitutionalAnalysisMeanMs.toFixed(3)), syntheticInstitutionalEvaluatedParties: institutionalEvaluations.length, representativeProfileStatus: 'synthetic_test_only_not_observed', resolvedProposalBytes, distributionMetadataBytes, institutionalMetadataBytes, submittedSaveBytes, resolvedSaveBytes, resolutionSaveDeltaBytes: resolvedSaveBytes - submittedSaveBytes, fullWorldSaveDeltaBytes: resolvedSaveBytes - Buffer.byteLength(serialized), contextualSuccessionMs: Number(contextualSuccessionMs.toFixed(3)), contextualSuccessionCountryRegions: state.politics.countries[representativeCountry].regionIds.length, contextualSuccessionEvidenceBytes, contextualSuccessionSaveDeltaBytes })}`);
  }, 30_000);
});
