/// <reference types="node" />
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { politicalRegistry } from '../politics/registry';
import { createSimulationSnapshotCache } from '../state';
import { serializeSimulationState } from '../save';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import { assignPoliticalOffice, createFiscalProposal, createPoliticalPerson, inspectProposalSupport, setControlledPerson } from '../governance/runtime';

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
    expect(snapshot.governance).toBe(cache(state).governance); expect(Object.keys(state.governance.persons)).toHaveLength(parties.length); expect(Object.keys(state.governance.proposals)).toHaveLength(0); expect(resolvableCountryIds.length).toBeGreaterThan(0);
    console.info(`GOVERNANCE_WORLD_BENCHMARK ${JSON.stringify({ benchmark: 'projectatlas-governance-information-0.15', countries: worldCountryIds.length, chambers: chambers.length, resolvableCountries: resolvableCountryIds.length, ideologicalEvidenceCountries: ideologicalCountryIds.length, evidenceBackedVoteOverlapCountries: overlapCountries, unavailableCountries: worldCountryIds.length - resolvableCountryIds.length, ideologyParties: ideology, persons: Object.keys(state.governance.persons).length, proposals: 0, saveBytes: Buffer.byteLength(serialized), snapshotMs: Number(snapshotMs.toFixed(4)), serializeMs: Number(serializeMs.toFixed(2)), analysisCalls, analysisMeanMs: Number(analysisMeanMs.toFixed(3)) })}`);
  }, 30_000);
});
