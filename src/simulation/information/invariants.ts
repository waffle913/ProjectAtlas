import type { SimulationInvariant } from '../invariants';
import { GOVERNANCE_VERSION } from '../governance/model';
import { politicalRegistry } from '../politics/registry';
import { CRISIS_TYPES } from '../crisis/model';
import type { SimulationState } from '../../types';
import type { BriefingInterpretation, ChamberBriefingResult, GovernmentProposalEstimate, GovernmentReport } from './model';
import { INFORMATION_MODEL, INFORMATION_VERSION, PORTFOLIOS } from './model';

const validDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};
const statusValues = new Set(['sourced', 'observed', 'derived', 'modelled', 'partial', 'unavailable', 'not_applicable']);
const severityValues = new Set(['info', 'advisory', 'important', 'urgent']);
const eventTypeValues = new Set(['proposal_result', 'labour_report', 'crisis_activation', 'urgent_event']);
const portfolioValues = new Set<string>(PORTFOLIOS);
const coverageValues = new Set(['complete', 'partial', 'unavailable']);
const bounded = (value: unknown, maximum = 10_000) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;

function validateInterpretation(interpretation: BriefingInterpretation): boolean {
  return ['derived', 'modelled', 'unavailable'].includes(interpretation.basis)
    && Boolean(interpretation.summary)
    && (interpretation.relevantGoals === undefined || Array.isArray(interpretation.relevantGoals))
    && Array.isArray(interpretation.tradeoffs) && interpretation.tradeoffs.every(item => typeof item === 'string')
    && Array.isArray(interpretation.limitations) && interpretation.limitations.every(item => typeof item === 'string')
    && (interpretation.policyLevers === undefined || interpretation.policyLevers.every(item => ['corporate_tax', 'annual_budget'].includes(item.mechanism) && Boolean(item.limitation)));
}

function validateChamberFact(result: ChamberBriefingResult): boolean {
  const seats = [result.yesSeats, result.noSeats, result.abstainSeats, result.unavailableSeats];
  const allocated = seats.reduce((sum, value) => sum + value, 0);
  return Boolean(result.chamberId && result.displayName)
    && seats.every(value => Number.isSafeInteger(value) && value >= 0)
    && coverageValues.has(result.coverage)
    && (result.totalSeats === undefined || Number.isSafeInteger(result.totalSeats) && result.totalSeats >= 0 && result.totalSeats === allocated)
    && (result.coverage !== 'complete' || result.unavailableSeats === 0)
    && (result.coverage === 'complete'
      ? result.outcome === (result.yesSeats > result.noSeats ? 'adopted' : 'rejected')
      : result.outcome === 'unavailable');
}

function validateProposalEstimate(report: GovernmentProposalEstimate, state: SimulationState, countryIds: ReadonlySet<string>): string[] {
  const proposal = state.governance.proposals[report.proposalId];
  const publicTotal = report.publicEstimate.supportBps + report.publicEstimate.opposeBps + report.publicEstimate.neutralBps + report.publicEstimate.unknownBps;
  const chambers = report.parliamentaryEstimate.chambers;
  const chamberSum = (field: 'yesSeats' | 'noSeats' | 'abstainSeats' | 'unavailableSeats') => chambers.reduce((sum, item) => sum + item[field], 0);
  const checks: Record<string, boolean> = {
    proposalReference: Boolean(proposal && proposal.countryId === report.countryId && proposal.createdOn <= report.requestedOn),
    countryAndDate: countryIds.has(report.countryId) && report.id === `government-proposal-estimate:${report.countryId}:${report.proposalId}:${report.requestedOn}` && validDate(report.requestedOn) && report.requestedOn <= state.date,
    authorizedRequesterReference: state.governance.persons[report.requestedByPersonId]?.countryId === report.countryId,
    coverageAndConfidence: coverageValues.has(report.coverage) && bounded(report.confidenceBps),
    publicEstimate: [report.publicEstimate.supportBps, report.publicEstimate.opposeBps, report.publicEstimate.neutralBps, report.publicEstimate.unknownBps, report.publicEstimate.confidenceBps].every(value => bounded(value)) && publicTotal === 10_000 && coverageValues.has(report.publicEstimate.coverage),
    parliamentarySeats: [report.parliamentaryEstimate.yesSeats, report.parliamentaryEstimate.noSeats, report.parliamentaryEstimate.abstainSeats, report.parliamentaryEstimate.unavailableSeats, report.parliamentaryEstimate.totalSeats].every(value => Number.isSafeInteger(value) && value >= 0) && bounded(report.parliamentaryEstimate.confidenceBps) && coverageValues.has(report.parliamentaryEstimate.coverage),
    chamberFacts: chambers.every(validateChamberFact),
    chamberSums: report.parliamentaryEstimate.yesSeats === chamberSum('yesSeats')
      && report.parliamentaryEstimate.noSeats === chamberSum('noSeats')
      && report.parliamentaryEstimate.abstainSeats === chamberSum('abstainSeats')
      && report.parliamentaryEstimate.unavailableSeats === chamberSum('unavailableSeats')
      && report.parliamentaryEstimate.totalSeats === chambers.reduce((sum, item) => sum + (item.totalSeats ?? 0), 0),
    directPolicyChanges: report.directPolicyChanges.every(change => Boolean(change.path && change.explanation) && coverageValues.has(change.coverage) && (change.delta === undefined || typeof change.delta === 'number' && Number.isFinite(change.delta))),
    expectedConsequences: report.expectedConsequences.every(item => Boolean(item.goal && item.explanation) && Number.isSafeInteger(item.directionBps) && Math.abs(item.directionBps) <= 10_000 && bounded(item.magnitudeBps) && bounded(item.confidenceBps) && coverageValues.has(item.coverage)),
    unsupportedChanges: report.unsupportedChanges.every(item => Boolean(item.path && item.reason) && ['partial', 'unavailable'].includes(item.coverage)),
    limitations: report.limitations.every(item => typeof item === 'string'),
    provenance: report.provenance.status === 'derived' && report.provenance.engine === 'situational-0.14-v2' && report.provenance.source === 'governance.proposal-analysis' && Boolean(report.provenance.limitation),
  };
  return Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => name);
}

export const informationInvariant: SimulationInvariant = {
  id: 'government-information-and-briefings',
  check: (state, context) => {
    const errors: string[] = [];
    const information = state.information;
    if (!information || information.version !== INFORMATION_VERSION || !validDate(information.initializedOn) || information.initializedOn! > state.date || !information.latestGovernmentReports || !information.governmentReportsById || !Array.isArray(information.briefings) || !Array.isArray(information.proposalEstimates)) return ['Malformed government information state.'];
    if (information.briefings.length > INFORMATION_MODEL.briefingHistoryLimit) errors.push('Briefing history exceeds its configured bound.');
    if (information.proposalEstimates.length > INFORMATION_MODEL.proposalEstimateHistoryLimit) errors.push('Government proposal estimate history exceeds its configured bound.');
    const estimateIds = new Set<string>();
    for (const estimate of information.proposalEstimates) {
      const failures = validateProposalEstimate(estimate, state, context.countryIds);
      if (estimateIds.has(estimate.id) || failures.length) errors.push(`Malformed or duplicate Government Information estimate ${estimate.id}: ${failures.join(', ')}.`);
      estimateIds.add(estimate.id);
    }
    const reportIds = new Set<string>();
    const validateReport = (id: string, report: GovernmentReport) => {
      if (report.id !== id || report.id !== `government-report:${report.countryId}:unemployment:${report.asOfDate}` || !context.countryIds.has(report.countryId) || !validDate(report.asOfDate) || report.asOfDate > state.date) errors.push(`Malformed or future government report ${id}.`);
      if (report.indicator !== 'unemployment_rate' || report.unit !== 'basis_points' || report.source !== 'socioeconomy.monthly' || !statusValues.has(report.status) || !['complete', 'partial', 'unavailable'].includes(report.coverage)) errors.push(`Invalid government report semantics for ${id}.`);
      if (report.status === 'unavailable' && (report.valueBps !== undefined || report.coverage !== 'unavailable')) errors.push(`Unavailable government report ${id} encodes a value.`);
      if (report.status !== 'unavailable' && (!Number.isSafeInteger(report.valueBps) || report.valueBps! < 0 || report.valueBps! > 10_000)) errors.push(`Government report ${id} has an invalid value.`);
      if (report.status === 'modelled' && !report.limitation) errors.push(`Government report ${id} lacks a model limitation.`);
      reportIds.add(id);
    };
    for (const [id, report] of Object.entries(information.governmentReportsById)) validateReport(id, report);
    for (const [countryId, report] of Object.entries(information.latestGovernmentReports)) {
      if (report.countryId !== countryId || JSON.stringify(information.governmentReportsById[report.id]) !== JSON.stringify(report)) errors.push(`Latest government report for ${countryId} is not retained in report history.`);
      validateReport(report.id, report);
    }
    const briefingIds = new Set<string>();
    for (const briefing of information.briefings) {
      if (!briefing.id || briefingIds.has(briefing.id)) errors.push(`Briefing has a missing or duplicate ID: ${briefing.id}.`);
      briefingIds.add(briefing.id);
      if (!context.countryIds.has(briefing.countryId) || !validDate(briefing.createdOn) || briefing.createdOn > state.date || !portfolioValues.has(briefing.portfolio) || !severityValues.has(briefing.severity) || !eventTypeValues.has(briefing.eventType) || !['public', 'government'].includes(briefing.access) || !briefing.sourceId || !briefing.headline || typeof briefing.pauseRequested !== 'boolean') errors.push(`Malformed briefing ${briefing.id}.`);
      if (briefing.interpretation && !validateInterpretation(briefing.interpretation)) errors.push(`Malformed bounded interpretation for briefing ${briefing.id}.`);
      if (briefing.severity !== 'urgent' && briefing.pauseRequested) errors.push(`Non-urgent briefing ${briefing.id} requests a pause.`);
      if (briefing.fact.kind === 'labour_report' && (briefing.eventType !== 'labour_report' || !briefing.fact.reportId || !reportIds.has(briefing.fact.reportId) || briefing.sourceId !== briefing.fact.reportId || briefing.access !== 'government')) errors.push(`Labour briefing ${briefing.id} has no corresponding internal report.`);
      if (briefing.fact.kind === 'parliamentary_result') {
        const proposal = briefing.fact.proposalId ? state.governance.proposals[briefing.fact.proposalId] : undefined;
        if (briefing.eventType !== 'proposal_result' || !proposal || proposal.countryId !== briefing.countryId || proposal.voteResult?.outcome !== briefing.fact.outcome || briefing.sourceId !== proposal.id) errors.push(`Parliamentary briefing ${briefing.id} has an invalid proposal reference.`);
        if (briefing.access !== 'public' || !['adopted', 'rejected', 'unavailable'].includes(briefing.fact.outcome ?? '')) errors.push(`Parliamentary briefing ${briefing.id} has invalid public result metadata.`);
        const sourceChambers = proposal?.voteResult?.chambers ?? [];
        const briefingChambers = briefing.fact.chamberResults;
        if (!Array.isArray(briefingChambers) || !briefingChambers.every(validateChamberFact) || briefingChambers.length !== sourceChambers.length) errors.push(`Parliamentary briefing ${briefing.id} has invalid chamber-level facts.`);
        else for (let index = 0; index < sourceChambers.length; index += 1) {
          const source = sourceChambers[index], result = briefingChambers[index];
          const expectedOutcome = source.coverage === 'complete' && source.adopted !== undefined ? source.adopted ? 'adopted' : 'rejected' : 'unavailable';
          const displayName = politicalRegistry.institutions[politicalRegistry.countries[briefing.countryId]?.institutionId]?.chambers.find(chamber => chamber.id === source.chamberId)?.displayName ?? source.chamberId;
          if (result.chamberId !== source.chamberId || result.displayName !== displayName || result.outcome !== expectedOutcome || result.coverage !== source.coverage || result.yesSeats !== source.yesSeats || result.noSeats !== source.noSeats || result.abstainSeats !== source.abstainSeats || result.unavailableSeats !== source.unavailableSeats || result.totalSeats !== source.totalSeats) errors.push(`Parliamentary briefing ${briefing.id} changes its source chamber result.`);
        }
        if (briefing.fact.outcome === 'adopted' || briefing.fact.outcome === 'rejected') {
          if (sourceChambers.length === 1 && sourceChambers[0].coverage === 'complete') {
            if (briefing.fact.yesSeats !== sourceChambers[0].yesSeats || briefing.fact.noSeats !== sourceChambers[0].noSeats) errors.push(`Unicameral briefing ${briefing.id} does not match its complete chamber result.`);
          } else if (briefing.fact.yesSeats !== undefined || briefing.fact.noSeats !== undefined) errors.push(`Multichamber briefing ${briefing.id} presents aggregate seats as a single vote.`);
        }
        const anchor = briefing.fact.policyFollowUp;
        if (briefing.fact.outcome === 'adopted' && (!anchor || anchor.proposalId !== proposal?.id || anchor.effectiveDate !== proposal?.effectiveDate)) errors.push(`Adopted proposal briefing ${briefing.id} has no matching policy follow-up anchor.`);
        if (anchor) {
          const baselineReport = anchor.baselineReportId ? information.governmentReportsById[anchor.baselineReportId] : undefined;
          if (anchor.proposalId !== proposal?.id || anchor.effectiveDate !== proposal?.effectiveDate || !validDate(anchor.effectiveDate)
            || !['temporal_only', 'supported_counterfactual', 'unavailable'].includes(anchor.attributionStatus)
            || anchor.attributionStatus === 'temporal_only' && (!baselineReport || anchor.baselineDate !== baselineReport.asOfDate || anchor.baselineValueBps !== baselineReport.valueBps || anchor.baselineValueBps === undefined || anchor.baselineDate! > anchor.effectiveDate)
            || anchor.attributionStatus === 'unavailable' && (anchor.baselineReportId !== undefined || anchor.baselineDate !== undefined || anchor.baselineValueBps !== undefined)) errors.push(`Proposal briefing ${briefing.id} has an invalid temporal follow-up anchor.`);
        }
      }
      if (briefing.fact.kind === 'labour_report') {
        if (briefing.fact.policyComparisons?.some(comparison => {
          const proposalBriefing = information.briefings.find(item => item.fact.kind === 'parliamentary_result' && item.fact.proposalId === comparison.proposalId);
          const anchor = proposalBriefing?.fact.policyFollowUp;
          const baseline = anchor?.baselineReportId ? information.governmentReportsById[anchor.baselineReportId] : undefined;
          return comparison.attributionStatus !== 'temporal_only'
            || !proposalBriefing || proposalBriefing.countryId !== briefing.countryId || !anchor || anchor.attributionStatus !== 'temporal_only'
            || comparison.effectiveDate !== anchor.effectiveDate || comparison.baselineDate !== anchor.baselineDate
            || comparison.baselineValueBps !== anchor.baselineValueBps || !baseline || baseline.valueBps !== comparison.baselineValueBps
            || comparison.currentValueBps !== briefing.fact.valueBps || comparison.effectiveDate > briefing.createdOn;
        })) errors.push(`Labour briefing ${briefing.id} contains an unsupported policy attribution.`);
      }
      if (briefing.fact.kind === 'crisis_activation') {
        const sourceExists = state.crisis.countries[briefing.countryId]?.history.some(item => item.id === briefing.sourceId && item.type === briefing.fact.crisisType)
          || Object.values(state.crisis.countries[briefing.countryId]?.currentByType ?? {}).some(item => item.id === briefing.sourceId && item.type === briefing.fact.crisisType);
        if (briefing.eventType !== 'crisis_activation' || !sourceExists || briefing.access !== 'government' || !CRISIS_TYPES.includes(briefing.fact.crisisType as typeof CRISIS_TYPES[number]) || !['low', 'moderate', 'severe', 'critical'].includes(briefing.fact.crisisSeverity ?? '')) errors.push(`Crisis briefing ${briefing.id} has an invalid monitor reference.`);
      }
      if (!statusValues.has(briefing.fact.evidenceStatus)) errors.push(`Briefing ${briefing.id} has invalid evidence status.`);
    }
    const referencedReportIds = new Set(Object.values(information.latestGovernmentReports).map(report => report.id));
    for (const briefing of information.briefings) if (briefing.fact.reportId) referencedReportIds.add(briefing.fact.reportId);
    if (Object.keys(information.governmentReportsById).some(id => !referencedReportIds.has(id)) || [...referencedReportIds].some(id => !information.governmentReportsById[id])) errors.push('Government report history does not match current and briefing references.');
    const governance = state.governance;
    if (governance.version !== GOVERNANCE_VERSION || !governance.successions || !Array.isArray(governance.successionOrder) || !Number.isSafeInteger(governance.nextSuccessionSequence) || governance.nextSuccessionSequence < 0 || new Set(governance.successionOrder).size !== governance.successionOrder.length || governance.successionOrder.some(id => !governance.successions[id]) || Object.keys(governance.successions).some(id => !governance.successionOrder.includes(id))) errors.push('Leadership succession order does not reconcile.');
    const activePartyLeaders = new Map<string, string>();
    for (const person of Object.values(governance.persons)) {
      if (person.isPartyLeader && person.status === 'active' && person.partyId) {
        if (activePartyLeaders.has(person.partyId)) errors.push(`Party ${person.partyId} has more than one active leader.`);
        activePartyLeaders.set(person.partyId, person.id);
      }
      if (person.leaderProfile) for (const [issue, dimension] of Object.entries(person.leaderProfile)) {
        if (!issue || !Number.isSafeInteger(dimension.valueBps) || dimension.valueBps < 0 || dimension.valueBps > 10_000 || !Number.isSafeInteger(dimension.confidenceBps) || dimension.confidenceBps < 0 || dimension.confidenceBps > 10_000 || !['derived', 'modelled'].includes(dimension.status) || !dimension.limitation) errors.push(`Invalid political leader profile for ${person.id}.`);
      }
      if (person.leaderProvenance && (!['sourced_analogue', 'derived_analogue', 'modelled_fallback'].includes(person.leaderProvenance.basis) || !context.countryIds.has(person.countryId) || !person.partyId || !person.leaderProvenance.sourcePartyId || !validDate(person.leaderProvenance.referenceDate) || !['sourced', 'derived', 'unavailable', 'ambiguous'].includes(person.leaderProvenance.sourceLeaderStatus) || !person.leaderProvenance.limitation)) errors.push(`Invalid party leader provenance for ${person.id}.`);
    }
    let previousSuccessionDate: string | undefined;
    for (const successionId of governance.successionOrder) {
      const succession = governance.successions[successionId];
      const previous = governance.persons[succession.previousPersonId], successor = governance.persons[succession.newPersonId];
      if (succession.id !== successionId || !/^succession\.\d{8}$/.test(successionId) || Number(successionId.slice(11)) >= governance.nextSuccessionSequence || !previous || !successor || previous.id === successor.id || previous.partyId !== succession.partyId || successor.partyId !== succession.partyId || previous.countryId !== succession.countryId || successor.countryId !== succession.countryId || !context.countryIds.has(succession.countryId) || !validDate(succession.effectiveDate) || succession.effectiveDate > state.date || previous.createdOn > succession.effectiveDate || successor.createdOn > succession.effectiveDate || !['existing_party_member', 'modelled_fallback'].includes(succession.selection)) errors.push(`Malformed party leadership succession ${successionId}.`);
      if (validDate(succession.effectiveDate)) {
        if (previousSuccessionDate && succession.effectiveDate < previousSuccessionDate) errors.push(`Party leadership succession dates are not monotonic at ${successionId}.`);
        previousSuccessionDate = succession.effectiveDate;
      }
      const handoff = succession.playerHandoff;
      if (handoff && (!['pending', 'continued', 'switched'].includes(handoff.status) || handoff.previousPersonId !== succession.previousPersonId || handoff.successorPersonId !== succession.newPersonId || handoff.decidedOn && (!validDate(handoff.decidedOn) || handoff.decidedOn < succession.effectiveDate || handoff.decidedOn > state.date) || handoff.status === 'switched' && governance.player.controlledPersonId !== handoff.successorPersonId || handoff.status === 'continued' && governance.player.controlledPersonId !== handoff.previousPersonId)) errors.push(`Malformed player handoff for succession ${successionId}.`);
    }
    if (governance.leadersInitializedOn !== undefined) {
      if (!validDate(governance.leadersInitializedOn) || governance.leadersInitializedOn > state.date) errors.push('Party leaders were initialized on an invalid date.');
      for (const party of Object.values(politicalRegistry.parties)) {
        if (!context.countryIds.has(party.countryId)) continue;
        if (activePartyLeaders.get(party.id) === undefined) errors.push(`Party ${party.id} has no active gameplay leader.`);
      }
    }
    return errors;
  },
};
