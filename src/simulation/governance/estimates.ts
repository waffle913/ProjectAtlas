import type { SimulationState } from '../../types';
import { allocate } from '../socioeconomy/model';
import { COHORT, POLITICAL_ISSUES, type PoliticalRegistry } from '../politics/model';
import { politicalRegistry } from '../politics/registry';
import { analyzeProposal, derivePartyGoalProfile, evaluatePartyProposal, evaluateProfileForPublic, GOVERNANCE_VOTE_THRESHOLDS } from './analysis';
import { allocatePartySeats, evaluatePartyInternalVoteDistribution } from './internalPartyDistribution';
import type {
  ChamberSupportEstimate,
  PartyGoalProfile,
  ParliamentarySupportEstimate,
  PoliticalProposal,
  ProposalAnalysis,
  ProposalImpact,
  PublicSupportEstimate,
} from './model';

export function classifyProposalImpact(state: SimulationState, proposal: PoliticalProposal, analysisOverride?: ProposalAnalysis): ProposalImpact {
  const analysis = analysisOverride ?? analyzeProposal(state, proposal);
  const issueDirectionsBps = Object.fromEntries(POLITICAL_ISSUES.map(issue => [issue, analysis.issueEffects[issue]])) as ProposalImpact['issueDirectionsBps'];
  const drivers = analysis.expectedConsequences
    .filter(item => POLITICAL_ISSUES.includes(item.goal as never))
    .map(item => ({ issue: item.goal as typeof POLITICAL_ISSUES[number], directionBps: item.directionBps, source: item.source, explanation: item.explanation }));
  return { issueDirectionsBps, drivers, method: 'fiscal_delta_v1', limitation: analysis.limitations.join(' ') };
}

export function estimatePublicSupport(state: SimulationState, proposal: PoliticalProposal, analysisOverride?: ProposalAnalysis): PublicSupportEstimate {
  const analysis = analysisOverride ?? analyzeProposal(state, proposal);
  const impact = classifyProposalImpact(state, proposal, analysis);
  let yes = 0, no = 0, neutral = 0, unknown = 0, representedPersons = 0, knownPersons = 0, unknownPersons = 0, confidenceWeighted = 0;
  for (const [regionId, regional] of Object.entries(state.politics.regionalOpinion).sort(([a], [b]) => a.localeCompare(b))) {
    if (regional.countryId !== proposal.countryId) continue;
    const cohorts = state.socioeconomy.regions[regionId]?.cohorts ?? [];
    for (const [cohortId, opinion] of Object.entries(regional.cohorts).sort(([a], [b]) => a.localeCompare(b))) {
      const persons = cohorts.find(item => `${item.income}:${item.orientation}` === cohortId)?.persons ?? 0;
      if (!persons) continue;
      const goals = {} as PartyGoalProfile['goals'];
      POLITICAL_ISSUES.forEach((issue, index) => {
        const ideal = opinion[COHORT.preferences][index];
        const importance = opinion[COHORT.salience][index];
        const confidence = Math.min(7_000, opinion[COHORT.engagement]);
        goals[issue] = {
          idealPointBps: ideal,
          importanceBps: importance,
          compromiseToleranceBps: Math.max(1_500, Math.min(9_000, Math.round(8_000 - importance * 0.4 - Math.abs(ideal - 5_000) * 0.2))),
          confidenceBps: confidence,
          status: 'modelled_fallback',
        };
      });
      goals.fiscal_sustainability = {
        idealPointBps: 8_500,
        importanceBps: 2_000,
        compromiseToleranceBps: 7_500,
        confidenceBps: 1_000,
        status: 'modelled_common_constraint',
      };
      const evaluation = evaluateProfileForPublic(analysis, { partyId: `cohort:${cohortId}`, goals });
      const engaged = Math.max(1, opinion[COHORT.engagement]), weight = persons * engaged;
      representedPersons += persons;
      confidenceWeighted += evaluation.confidenceBps * persons;
      const eligible = evaluation.confidenceBps >= GOVERNANCE_VOTE_THRESHOLDS.minimumConfidenceBps && evaluation.coverage !== 'unavailable';
      if (!eligible) {
        unknown += weight;
        unknownPersons += persons;
      } else {
        knownPersons += persons;
        if (evaluation.agreementBps >= GOVERNANCE_VOTE_THRESHOLDS.yesAgreementBps) yes += weight;
        else if (evaluation.agreementBps <= GOVERNANCE_VOTE_THRESHOLDS.noAgreementBps) no += weight;
        else neutral += weight;
      }
    }
  }
  const totals = allocate(10_000, [yes, no, neutral, unknown || (!yes && !no && !neutral ? 1 : 0)]);
  const coverage = !representedPersons || !knownPersons ? 'unavailable' : unknownPersons || analysis.coverage !== 'complete' ? 'partial' : 'complete';
  return {
    supportBps: totals[0],
    opposeBps: totals[1],
    neutralBps: totals[2],
    unknownBps: totals[3],
    confidenceBps: representedPersons ? Math.round(confidenceWeighted / representedPersons) : 0,
    coverage,
    representedPersons,
    knownPersons,
    unknownPersons,
    drivers: impact.drivers,
  };
}

export function estimateParliamentarySupport(
  state: SimulationState,
  proposal: PoliticalProposal,
  registry: PoliticalRegistry = politicalRegistry,
  profiles: Record<string, PartyGoalProfile | undefined> = {},
  analysisOverride?: ProposalAnalysis,
): ParliamentarySupportEstimate {
  const institution = registry.institutions[registry.countries[proposal.countryId]?.institutionId];
  if (!institution || institution.legislatureKind === 'none' || institution.legislatureKind === 'unavailable' || !institution.chambers.length) {
    return { yesSeats: 0, noSeats: 0, abstainSeats: 0, unavailableSeats: 0, totalSeats: 0, chambers: [], coverage: 'unavailable', confidenceBps: 0, procedure: 'internal_party_distribution_v1', seatApportionment: 'identity_hash_v1' };
  }
  const analysis = analysisOverride ?? analyzeProposal(state, proposal);
  const dynamicSeats = state.elections?.countries[proposal.countryId]?.seatsByParty;
  const dynamicAllocated = dynamicSeats && Object.values(dynamicSeats).some(seats => seats > 0) ? Object.values(dynamicSeats).reduce((a, b) => a + b, 0) : 0;
  const chambers: ChamberSupportEstimate[] = institution.chambers.map(chamber => {
    if (chamber.seatAllocationStatus !== 'sourced' || chamber.totalSeats === undefined) {
      return { chamberId: chamber.id, yesSeats: 0, noSeats: 0, abstainSeats: 0, unavailableSeats: chamber.totalSeats ?? 0, totalSeats: chamber.totalSeats, coverage: 'unavailable', partyEvaluations: [] };
    }
    let yesSeats = 0, noSeats = 0, abstainSeats = 0, unknownSeats = 0;
    const partyEvaluations: NonNullable<ChamberSupportEstimate['partyEvaluations']> = [];
    const seatSource = dynamicSeats && dynamicAllocated > 0 ? dynamicSeats : chamber.seatsByParty;
    for (const [partyId, seats] of Object.entries(seatSource).sort(([a], [b]) => a.localeCompare(b))) {
      const party = registry.parties[partyId], profile = profiles[partyId] ?? (party ? derivePartyGoalProfile(party) : undefined);
      const evaluation = evaluatePartyProposal(state, proposal, partyId, registry, profile, analysis);
      const internalDistribution = evaluatePartyInternalVoteDistribution(analysis, profile, evaluation);
      const seatAllocation = allocatePartySeats(seats, internalDistribution, { proposalId: proposal.id, chamberId: chamber.id, partyId });
      partyEvaluations.push({ ...evaluation, decisionModel: 'internal_distribution_v1', internalDistribution, seats, seatAllocation });
      yesSeats += seatAllocation.yesSeats;
      noSeats += seatAllocation.noSeats;
      abstainSeats += seatAllocation.abstainSeats;
      unknownSeats += seatAllocation.unknownSeats;
    }
    let unavailableSeats = unknownSeats + (chamber.independentOtherSeats ?? 0);
    const allocated = yesSeats + noSeats + abstainSeats + unavailableSeats;
    if (allocated !== chamber.totalSeats) unavailableSeats = Math.max(unavailableSeats, chamber.totalSeats - yesSeats - noSeats - abstainSeats);
    const knownSeats = yesSeats + noSeats + abstainSeats;
    const coverage = allocated !== chamber.totalSeats ? 'unavailable' : unavailableSeats === 0 ? 'complete' : knownSeats ? 'partial' : 'unavailable';
    return {
      chamberId: chamber.id,
      yesSeats,
      noSeats,
      abstainSeats,
      unavailableSeats,
      totalSeats: chamber.totalSeats,
      coverage,
      adopted: coverage === 'complete' ? yesSeats > noSeats : undefined,
      partyEvaluations,
    };
  });
  const totalSeats = chambers.reduce((total, item) => total + (item.totalSeats ?? 0), 0);
  const yesSeats = chambers.reduce((total, item) => total + item.yesSeats, 0);
  const noSeats = chambers.reduce((total, item) => total + item.noSeats, 0);
  const abstainSeats = chambers.reduce((total, item) => total + item.abstainSeats, 0);
  const unavailableSeats = chambers.reduce((total, item) => total + item.unavailableSeats, 0);
  const coverage = chambers.every(item => item.coverage === 'complete') ? 'complete' : chambers.some(item => item.coverage !== 'unavailable') ? 'partial' : 'unavailable';
  const confidenceWeight = chambers.reduce((sum, chamber) => sum + (chamber.partyEvaluations ?? []).reduce((partySum, evaluation) => partySum + evaluation.confidenceBps * evaluation.seats, 0), 0);
  return {
    yesSeats,
    noSeats,
    abstainSeats,
    unavailableSeats,
    totalSeats,
    chambers,
    coverage,
    confidenceBps: totalSeats ? Math.round(confidenceWeight / totalSeats) : 0,
    procedure: 'internal_party_distribution_v1',
    seatApportionment: 'identity_hash_v1',
  };
}
