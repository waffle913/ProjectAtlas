import type { SimulationInvariant } from '../invariants';
import { GOVERNANCE_VERSION } from '../governance/model';
import { politicalRegistry } from '../politics/registry';
import { CRISIS_TYPES } from '../crisis/model';
import type { GovernmentReport } from './model';
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

export const informationInvariant: SimulationInvariant = {
  id: 'government-information-and-briefings',
  check: (state, context) => {
    const errors: string[] = [];
    const information = state.information;
    if (!information || information.version !== INFORMATION_VERSION || !validDate(information.initializedOn) || information.initializedOn! > state.date || !information.latestGovernmentReports || !information.governmentReportsById || !Array.isArray(information.briefings)) return ['Malformed government information state.'];
    if (information.briefings.length > INFORMATION_MODEL.briefingHistoryLimit) errors.push('Briefing history exceeds its configured bound.');
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
      if (briefing.severity !== 'urgent' && briefing.pauseRequested) errors.push(`Non-urgent briefing ${briefing.id} requests a pause.`);
      if (briefing.fact.kind === 'labour_report' && (briefing.eventType !== 'labour_report' || !briefing.fact.reportId || !reportIds.has(briefing.fact.reportId) || briefing.sourceId !== briefing.fact.reportId || briefing.access !== 'government')) errors.push(`Labour briefing ${briefing.id} has no corresponding internal report.`);
      if (briefing.fact.kind === 'parliamentary_result') {
        const proposal = briefing.fact.proposalId ? state.governance.proposals[briefing.fact.proposalId] : undefined;
        if (briefing.eventType !== 'proposal_result' || !proposal || proposal.countryId !== briefing.countryId || proposal.voteResult?.outcome !== briefing.fact.outcome || briefing.sourceId !== proposal.id) errors.push(`Parliamentary briefing ${briefing.id} has an invalid proposal reference.`);
        if (briefing.access !== 'public' || !['adopted', 'rejected', 'unavailable'].includes(briefing.fact.outcome ?? '')) errors.push(`Parliamentary briefing ${briefing.id} has invalid public result metadata.`);
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
      if (person.leaderProvenance && (person.leaderProvenance.status !== 'modelled_fallback' || !context.countryIds.has(person.countryId) || !person.partyId || !person.leaderProvenance.sourcePartyId || !validDate(person.leaderProvenance.referenceDate) || person.leaderProvenance.sourceLeaderStatus !== 'unavailable' || !person.leaderProvenance.limitation)) errors.push(`Invalid fictional leader provenance for ${person.id}.`);
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
