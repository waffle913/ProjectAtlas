import type { SimulationInvariant } from '../invariants';
import { GOVERNANCE_VERSION, INITIAL_LEADER_PROVENANCE_METHODS, LEADER_PROVENANCE_METHODS, governanceFingerprint, type LeadershipContextMetric, type LeadershipSuccession, type PoliticalPersonState } from '../governance/model';
import { deriveLeadershipSelectionMetrics, leadershipProfileFromEvidence, LEADERSHIP_SUCCESSION_MODEL, selectLeadershipTendency } from '../governance/leadershipSuccession';
import { canonicalJson, deterministicFingerprint } from '../fingerprint';
import { POLITICAL_ISSUES } from '../politics/model';
import { politicalRegistry } from '../politics/registry';
import type { SimulationState } from '../../types';
import type { BriefingInterpretation, ChamberBriefingResult, GovernmentProposalEstimate, GovernmentReport } from './model';
import { INFORMATION_MODEL, INFORMATION_VERSION, PORTFOLIOS, briefingId, compareBriefings, referencedGovernmentReportIds } from './model';
import { isSimulationDate as validDate } from '../date';

const statusValues = new Set(['sourced', 'observed', 'derived', 'modelled', 'partial', 'unavailable', 'not_applicable']);
const severityValues = new Set(['info', 'advisory', 'important', 'urgent']);
const eventTypeValues = new Set(['proposal_result', 'labour_report', 'military_report', 'trade_report']);
const portfolioValues = new Set<string>(PORTFOLIOS);
const coverageValues = new Set(['complete', 'partial', 'unavailable']);
const bounded = (value: unknown, maximum = 10_000) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
const leaderMethods = new Set<string>(LEADER_PROVENANCE_METHODS);
const initialLeaderMethods = new Set<string>(INITIAL_LEADER_PROVENANCE_METHODS);
const validInformationDate = (value: unknown, initializedOn: string) => typeof value === 'string' && validDate(value) && value >= initializedOn;

function validLeadershipMetric(metric: LeadershipContextMetric | undefined, coverages: readonly string[]): boolean {
  return Boolean(metric && typeof metric === 'object' && coverages.includes(metric.coverage)
    && (metric.coverage === 'unavailable' ? metric.valueBps === undefined : bounded(metric.valueBps))
    && typeof metric.source === 'string' && metric.source.trim()
    && typeof metric.limitation === 'string' && metric.limitation.trim());
}

function validContextualSuccession(state: SimulationState, succession: LeadershipSuccession, successor?: PoliticalPersonState): boolean {
  if (succession.selection !== 'modelled_internal_balance') return succession.contextEvidence === undefined;
  const evidence = succession.contextEvidence, party = politicalRegistry.parties[succession.partyId];
  if (!evidence || evidence.method !== LEADERSHIP_SUCCESSION_MODEL.method || !party || party.countryId !== succession.countryId
    || !successor || successor.partyId !== party.id || successor.countryId !== party.countryId || successor.createdOn !== succession.effectiveDate
    || !validLeadershipMetric(evidence.partySupport, ['modelled', 'unavailable'])
    || !validLeadershipMetric(evidence.legislativeSeatShare, ['sourced', 'unavailable'])
    || !evidence.supporterMandate || Object.keys(evidence.supporterMandate).length !== POLITICAL_ISSUES.length
    || !POLITICAL_ISSUES.every(issue => validLeadershipMetric(evidence.supporterMandate[issue], ['modelled', 'unavailable']))
    || !LEADERSHIP_SUCCESSION_MODEL.tendencies.some(item => item.id === evidence.selectedTendency)
    || typeof evidence.limitation !== 'string' || !evidence.limitation.trim()) return false;
  const provenance = successor.leaderProvenance;
  if (!provenance || provenance.basis !== 'modelled_fallback' || provenance.method !== 'internal_party_balance_succession_v3'
    || provenance.sourceLeaderStatus !== 'unavailable' || provenance.sourceLeader !== undefined
    || provenance.referenceDate !== succession.effectiveDate || provenance.sourcePartyId !== party.sourceBasis.sourcePartyId
    || typeof provenance.limitation !== 'string' || !provenance.limitation.trim()) return false;
  const metrics = deriveLeadershipSelectionMetrics(party, evidence);
  const weights = LEADERSHIP_SUCCESSION_MODEL.tendencies.map(item => metrics.tendencyWeightsBps[item.id]);
  if (!weights.every(value => Number.isSafeInteger(value) && value >= 0) || weights.reduce((sum, value) => sum + value, 0) !== 10_000
    || selectLeadershipTendency(state.engine.seed, succession.partyId, succession.effectiveDate, succession.id, metrics.tendencyWeightsBps) !== evidence.selectedTendency) return false;
  const expectedProfile = leadershipProfileFromEvidence(party, evidence);
  return governanceFingerprint(expectedProfile) === evidence.profileFingerprint
    && canonicalJson(expectedProfile) === canonicalJson(successor.leaderProfile);
}

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
  if (!report.analyzedContent || !validDate(report.analyzedContent.effectiveDate) || !report.analyzedContent.payload) return ['analyzedContent'];
  const proposal = state.governance.proposals[report.proposalId];
  const publicTotal = report.publicEstimate.supportBps + report.publicEstimate.opposeBps + report.publicEstimate.neutralBps + report.publicEstimate.unknownBps;
  const chambers = report.parliamentaryEstimate.chambers;
  const institution = politicalRegistry.institutions[politicalRegistry.countries[report.countryId]?.institutionId];
  const expectedChambers = institution?.chambers ?? [];
  const requester = state.governance.persons[report.requestedByPersonId];
  const payloadKeys = Object.keys(report.analyzedContent.payload);
  const unsupportedPaths = new Set(report.unsupportedChanges.map(item => item.path));
  const chamberSum = (field: 'yesSeats' | 'noSeats' | 'abstainSeats' | 'unavailableSeats') => chambers.reduce((sum, item) => sum + item[field], 0);
  const checks: Record<string, boolean> = {
    proposalReference: Boolean(proposal && proposal.countryId === report.countryId && proposal.createdOn <= report.requestedOn),
    countryAndDate: countryIds.has(report.countryId) && report.id === `government-proposal-estimate:${report.countryId}:${report.proposalId}:${report.requestedOn}:${report.proposalContentFingerprint}` && validDate(report.requestedOn) && report.requestedOn <= state.date,
    contentFingerprint: report.proposalContentFingerprint === governanceFingerprint(report.analyzedContent) && report.analyzedContent.effectiveDate >= proposal?.createdOn,
    informationInitializationDates: validInformationDate(report.requestedOn, state.information.initializedOn!)
      && validInformationDate(report.analyzedContent.effectiveDate, state.information.initializedOn!),
    authorizedRequesterReference: requester?.countryId === report.countryId && requester.createdOn <= report.requestedOn
      && state.information.initializedOn !== undefined && state.information.initializedOn <= report.requestedOn,
    coverageAndConfidence: coverageValues.has(report.coverage) && bounded(report.confidenceBps),
    publicEstimate: [report.publicEstimate.supportBps, report.publicEstimate.opposeBps, report.publicEstimate.neutralBps, report.publicEstimate.unknownBps, report.publicEstimate.confidenceBps].every(value => bounded(value)) && publicTotal === 10_000 && coverageValues.has(report.publicEstimate.coverage),
    parliamentarySeats: [report.parliamentaryEstimate.yesSeats, report.parliamentaryEstimate.noSeats, report.parliamentaryEstimate.abstainSeats, report.parliamentaryEstimate.unavailableSeats, report.parliamentaryEstimate.totalSeats].every(value => Number.isSafeInteger(value) && value >= 0) && bounded(report.parliamentaryEstimate.confidenceBps) && coverageValues.has(report.parliamentaryEstimate.coverage),
    chamberFacts: chambers.every(validateChamberFact),
    chamberRegistry: (!institution || institution.countryId === report.countryId)
      && chambers.length === expectedChambers.length && new Set(chambers.map(item => item.chamberId)).size === chambers.length
      && chambers.every(chamber => expectedChambers.some(expected => expected.id === chamber.chamberId
        && expected.countryId === report.countryId && expected.displayName === chamber.displayName && expected.totalSeats === chamber.totalSeats)),
    chamberSums: report.parliamentaryEstimate.yesSeats === chamberSum('yesSeats')
      && report.parliamentaryEstimate.noSeats === chamberSum('noSeats')
      && report.parliamentaryEstimate.abstainSeats === chamberSum('abstainSeats')
      && report.parliamentaryEstimate.unavailableSeats === chamberSum('unavailableSeats')
      && report.parliamentaryEstimate.totalSeats === chambers.reduce((sum, item) => sum + (item.totalSeats ?? 0), 0),
    directPolicyChanges: report.directPolicyChanges.every(change => Boolean(change.path && change.explanation) && coverageValues.has(change.coverage) && (change.delta === undefined || typeof change.delta === 'number' && Number.isFinite(change.delta))),
    expectedConsequences: report.expectedConsequences.every(item => Boolean(item.goal && item.explanation) && Number.isSafeInteger(item.directionBps) && Math.abs(item.directionBps) <= 10_000 && bounded(item.magnitudeBps) && bounded(item.confidenceBps) && coverageValues.has(item.coverage)),
    unsupportedChanges: report.unsupportedChanges.length === payloadKeys.length && unsupportedPaths.size === payloadKeys.length
      && payloadKeys.every(path => unsupportedPaths.has(path))
      && report.unsupportedChanges.every(item => Boolean(item.path && item.reason) && item.coverage === 'unavailable'),
    limitations: report.limitations.every(item => typeof item === 'string'),
    unavailableEvidence: report.coverage === 'unavailable' && report.confidenceBps === 0
      && report.publicEstimate.coverage === 'unavailable' && report.publicEstimate.confidenceBps === 0
      && report.publicEstimate.unknownBps === 10_000
      && report.parliamentaryEstimate.coverage === 'unavailable' && report.parliamentaryEstimate.confidenceBps === 0
      && chambers.every(item => item.coverage === 'unavailable' && item.yesSeats === 0 && item.noSeats === 0 && item.abstainSeats === 0)
      && report.directPolicyChanges.length === 0 && report.expectedConsequences.length === 0,
    provenance: report.provenance.status === 'unavailable' && report.provenance.engine === 'government-information-0.15-v2' && report.provenance.source === 'government-information.available-evidence' && Boolean(report.provenance.limitation),
  };
  return Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => name);
}

export const informationInvariant: SimulationInvariant = {
  id: 'government-information-and-briefings',
  check: (state, context) => {
    const errors: string[] = [];
    const information = state.information;
    if (!information || information.version !== INFORMATION_VERSION || !validDate(information.initializedOn) || information.initializedOn! > state.date || !information.latestGovernmentReports || !information.governmentReportsById || !Array.isArray(information.briefings) || !Array.isArray(information.proposalEstimates)) return ['Malformed government information state.'];
    const countryBriefingCounts = new Map<string, number>();
    for (const briefing of information.briefings) countryBriefingCounts.set(briefing.countryId, (countryBriefingCounts.get(briefing.countryId) ?? 0) + 1);
    if ([...countryBriefingCounts.values()].some(count => count > INFORMATION_MODEL.briefingHistoryLimitPerCountry)) errors.push('Country briefing history exceeds its configured bound.');
    if (information.briefings.length > INFORMATION_MODEL.briefingHistoryLimitGlobal) errors.push('Global briefing history exceeds its configured bound.');
    if (information.briefings.some((briefing, index) => index > 0 && compareBriefings(information.briefings[index - 1], briefing) >= 0)) errors.push('Briefing history is not in deterministic date-and-ID order.');
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
      if (!validInformationDate(report.asOfDate, information.initializedOn!)) errors.push(`Government report ${id} has an invalid date before Information initialization.`);
      if (report.indicator !== 'unemployment_rate' || report.unit !== 'basis_points' || report.source !== 'socioeconomy.monthly'
        || (report.valueBps === undefined ? report.status !== 'unavailable' || report.coverage !== 'unavailable'
          : report.status !== 'modelled' || !bounded(report.valueBps) || !['complete', 'partial'].includes(report.coverage))) errors.push(`Invalid government report semantics for ${id}.`);
      if (report.status === 'unavailable' && (report.valueBps !== undefined || report.coverage !== 'unavailable')) errors.push(`Unavailable government report ${id} encodes a value.`);
      if (report.status !== 'unavailable' && (!Number.isSafeInteger(report.valueBps) || report.valueBps! < 0 || report.valueBps! > 10_000)) errors.push(`Government report ${id} has an invalid value.`);
      if (typeof report.limitation !== 'string' || !report.limitation.trim()) errors.push(`Government report ${id} lacks a nonempty limitation.`);
      reportIds.add(id);
    };
    for (const [id, report] of Object.entries(information.governmentReportsById)) validateReport(id, report);
    const retainedReportDates = new Map<string, string[]>();
    for (const report of Object.values(information.governmentReportsById)) {
      const dates = retainedReportDates.get(report.countryId) ?? [];
      dates.push(report.asOfDate);
      retainedReportDates.set(report.countryId, dates);
    }
    for (const [countryId, report] of Object.entries(information.latestGovernmentReports)) {
      if (report.countryId !== countryId || JSON.stringify(information.governmentReportsById[report.id]) !== JSON.stringify(report)) errors.push(`Latest government report for ${countryId} is not retained in report history.`);
      validateReport(report.id, report);
    }
    const briefingIds = new Set<string>();
    for (const briefing of information.briefings) {
      if (briefing.id !== briefingId(briefing.eventType, briefing.countryId, briefing.sourceId) || briefingIds.has(briefing.id)) errors.push(`Briefing has a noncanonical or duplicate ID: ${briefing.id}.`);
      briefingIds.add(briefing.id);
      if (!context.countryIds.has(briefing.countryId) || !validDate(briefing.createdOn) || briefing.createdOn > state.date || !portfolioValues.has(briefing.portfolio) || !severityValues.has(briefing.severity) || !eventTypeValues.has(briefing.eventType) || !['public', 'government'].includes(briefing.access) || !briefing.sourceId || !briefing.headline || typeof briefing.pauseRequested !== 'boolean') errors.push(`Malformed briefing ${briefing.id}.`);
      const factDates = [briefing.fact.effectiveDate, briefing.fact.policyFollowUp?.effectiveDate, briefing.fact.policyFollowUp?.baselineDate,
        ...(briefing.fact.policyComparisons ?? []).flatMap(comparison => [comparison.effectiveDate, comparison.baselineDate])];
      if (!validInformationDate(briefing.createdOn, information.initializedOn!)
        || factDates.some(date => date !== undefined && !validInformationDate(date, information.initializedOn!))) errors.push(`Briefing ${briefing.id} has an invalid date before Information initialization.`);
      if (briefing.eventType !== 'military_report' && briefing.eventType !== 'trade_report' && eventTypeValues.has(briefing.eventType) && (briefing.portfolio !== (briefing.eventType === 'labour_report' ? 'economy' : 'finance')
        || briefing.severity !== 'advisory' || briefing.pauseRequested !== false)) errors.push(`Briefing ${briefing.id} changes supported event runtime metadata.`);
      if (briefing.fact.policyFollowUp && !['temporal_only', 'unavailable'].includes(briefing.fact.policyFollowUp.attributionStatus)) errors.push(`Briefing ${briefing.id} has an invalid temporal follow-up anchor.`);
      if (briefing.interpretation && !validateInterpretation(briefing.interpretation)) errors.push(`Malformed bounded interpretation for briefing ${briefing.id}.`);
      if (briefing.severity !== 'urgent' && briefing.pauseRequested) errors.push(`Non-urgent briefing ${briefing.id} requests a pause.`);
      if (briefing.fact.kind === 'labour_report' && (briefing.eventType !== 'labour_report' || !briefing.fact.reportId || !reportIds.has(briefing.fact.reportId) || briefing.sourceId !== briefing.fact.reportId || briefing.access !== 'government')) errors.push(`Labour briefing ${briefing.id} has no corresponding internal report.`);
      if (briefing.fact.kind === 'labour_report') {
        const report = briefing.fact.reportId ? information.governmentReportsById[briefing.fact.reportId] : undefined;
        const expectedStatus = report?.coverage === 'complete' ? 'modelled' : report?.coverage === 'partial' ? 'partial' : 'unavailable';
        if (!report || report.countryId !== briefing.countryId || report.valueBps !== briefing.fact.valueBps
          || report.asOfDate !== briefing.createdOn || briefing.fact.evidenceStatus !== expectedStatus) errors.push(`Labour briefing ${briefing.id} changes its source report.`);
        const previousDate = new Date(`${briefing.createdOn}T00:00:00.000Z`);
        previousDate.setUTCMonth(previousDate.getUTCMonth() - 1, 1);
        const comparisonDate = Number.isFinite(previousDate.getTime()) ? previousDate.toISOString().slice(0, 10) : undefined;
        const previous = comparisonDate && briefing.createdOn.endsWith('-01')
          ? information.governmentReportsById[`government-report:${briefing.countryId}:unemployment:${comparisonDate}`] : undefined;
        const hasInterveningRetainedReport = previous && retainedReportDates.get(briefing.countryId)?.some(date => date > previous.asOfDate && date < briefing.createdOn);
        if (!bounded(briefing.fact.previousValueBps) || !bounded(report?.valueBps)
          || Math.abs(briefing.fact.previousValueBps! - report!.valueBps!) < INFORMATION_MODEL.materialUnemploymentChangeBps
          || previous && !hasInterveningRetainedReport && previous.valueBps !== briefing.fact.previousValueBps) errors.push(`Labour briefing ${briefing.id} has an invalid retained comparison basis.`);
      }
      if (briefing.fact.kind === 'parliamentary_result') {
        const proposal = briefing.fact.proposalId ? state.governance.proposals[briefing.fact.proposalId] : undefined;
        if (briefing.eventType !== 'proposal_result' || !proposal || proposal.countryId !== briefing.countryId || proposal.voteResult?.outcome !== briefing.fact.outcome || briefing.sourceId !== proposal.id) errors.push(`Parliamentary briefing ${briefing.id} has an invalid proposal reference.`);
        if (briefing.access !== 'public' || !['adopted', 'rejected', 'unavailable'].includes(briefing.fact.outcome ?? '')) errors.push(`Parliamentary briefing ${briefing.id} has invalid public result metadata.`);
        if (briefing.createdOn !== proposal?.voteResult?.resolvedOn
          || briefing.fact.evidenceStatus !== (proposal?.voteResult?.coverage === 'complete' ? 'modelled' : 'partial')
          || (briefing.fact.outcome === 'adopted' ? briefing.fact.effectiveDate !== proposal?.effectiveDate
            : briefing.fact.effectiveDate !== undefined || briefing.fact.policyFollowUp !== undefined)) errors.push(`Parliamentary briefing ${briefing.id} changes its historical vote metadata.`);
        const sourceChambers = proposal?.voteResult?.chambers ?? [];
        const briefingChambers = briefing.fact.chamberResults;
        if (!Array.isArray(briefingChambers) || !briefingChambers.every(validateChamberFact) || briefingChambers.length !== sourceChambers.length) errors.push(`Parliamentary briefing ${briefing.id} has invalid chamber-level facts.`);
        else for (let index = 0; index < sourceChambers.length; index += 1) {
          const source = sourceChambers[index], result = briefingChambers[index];
          const expectedOutcome = source.coverage === 'complete' && source.adopted !== undefined ? source.adopted ? 'adopted' : 'rejected' : 'unavailable';
          const displayName = politicalRegistry.institutions[politicalRegistry.countries[briefing.countryId]?.institutionId]?.chambers.find(chamber => chamber.id === source.chamberId)?.displayName ?? source.chamberId;
          if (result.chamberId !== source.chamberId || result.displayName !== displayName || result.outcome !== expectedOutcome || result.coverage !== source.coverage || result.yesSeats !== source.yesSeats || result.noSeats !== source.noSeats || result.abstainSeats !== source.abstainSeats || result.unavailableSeats !== source.unavailableSeats || result.totalSeats !== source.totalSeats) errors.push(`Parliamentary briefing ${briefing.id} changes its source chamber result.`);
        }
        if (sourceChambers.length === 1 && sourceChambers[0].coverage === 'complete') {
          if (briefing.fact.yesSeats !== proposal?.voteResult?.yesSeats || briefing.fact.noSeats !== proposal?.voteResult?.noSeats) errors.push(`Unicameral briefing ${briefing.id} does not match its complete chamber result.`);
        } else if (briefing.fact.yesSeats !== undefined || briefing.fact.noSeats !== undefined) errors.push(`Multichamber briefing ${briefing.id} presents aggregate seats as a single vote.`);
        const anchor = briefing.fact.policyFollowUp;
        if (briefing.fact.outcome === 'adopted' && (!anchor || anchor.proposalId !== proposal?.id || anchor.effectiveDate !== proposal?.effectiveDate)) errors.push(`Adopted proposal briefing ${briefing.id} has no matching policy follow-up anchor.`);
        if (anchor) {
          const baselineReport = anchor.baselineReportId ? information.governmentReportsById[anchor.baselineReportId] : undefined;
          if (anchor.proposalId !== proposal?.id || anchor.effectiveDate !== proposal?.effectiveDate || !validDate(anchor.effectiveDate)
            || anchor.attributionStatus === 'temporal_only' && (!baselineReport || baselineReport.countryId !== briefing.countryId || anchor.baselineDate !== baselineReport.asOfDate || anchor.baselineValueBps !== baselineReport.valueBps || anchor.baselineValueBps === undefined || anchor.baselineDate! > anchor.effectiveDate)
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
        errors.push(`Crisis briefing ${briefing.id} has no government-visible report channel.`);
      }
      if (!statusValues.has(briefing.fact.evidenceStatus)) errors.push(`Briefing ${briefing.id} has invalid evidence status.`);
    }
    const referencedReportIds = referencedGovernmentReportIds(information);
    if (Object.keys(information.governmentReportsById).some(id => !referencedReportIds.has(id)) || [...referencedReportIds].some(id => !information.governmentReportsById[id])) errors.push('Government report history does not match current and briefing references.');
    const internationalReports = information.internationalReports;
    if (internationalReports) {
      for (const [id, report] of Object.entries(internationalReports.byId)) {
        if (id !== report.id || report.countryId !== (internationalReports.latest[report.countryId]?.countryId) || report.id !== `international-report:${report.countryId}:${report.producedOn}` || !context.countryIds.has(report.countryId) || !validDate(report.asOfDate) || !validDate(report.producedOn) || report.asOfDate > report.producedOn || report.producedOn > state.date || report.source !== 'international.administrative-report' || report.access !== 'government' || !['partial', 'unavailable'].includes(report.coverage) || !['modelled', 'unavailable'].includes(report.status) || !bounded(report.confidenceBps) || !report.limitation?.trim() || !report.uncertainty?.trim() || !Array.isArray(report.assessments) || !Array.isArray(report.restrictions) || report.fingerprint !== deterministicFingerprint({ ...report, fingerprint: undefined })) errors.push(`Malformed international report ${id}.`);
        for (const assessment of report.assessments) {
          if (!assessment.pairKey || !context.countryIds.has(assessment.countryAId) || !context.countryIds.has(assessment.countryBId) || !['NORMAL', 'PRESSURE', 'ACTIVE', 'RECOVERING'].includes(assessment.phase) || !['none', 'low', 'moderate', 'severe', 'critical'].includes(assessment.severity) || !bounded(assessment.pressure, 100_000) || !Array.isArray(assessment.drivers)) errors.push(`Malformed international assessment in ${id}.`);
        }
      }
      for (const [countryId, report] of Object.entries(internationalReports.latest)) {
        if (report.countryId !== countryId || canonicalJson(internationalReports.byId[report.id]) !== canonicalJson(report)) errors.push(`Latest international report for ${countryId} is not retained.`);
      }
    }
    const governance = state.governance;
    if (governance.version !== GOVERNANCE_VERSION || !governance.successions || !Array.isArray(governance.successionOrder) || !Number.isSafeInteger(governance.nextSuccessionSequence) || governance.nextSuccessionSequence < 0 || new Set(governance.successionOrder).size !== governance.successionOrder.length || governance.successionOrder.some(id => !governance.successions[id]) || Object.keys(governance.successions).some(id => !governance.successionOrder.includes(id))) errors.push('Leadership succession order does not reconcile.');
    const contextualSuccessorIds = new Set<string>();
    for (const successionId of governance.successionOrder) {
      const succession = governance.successions[successionId];
      if (succession?.selection !== 'modelled_internal_balance') continue;
      if (contextualSuccessorIds.has(succession.newPersonId)) errors.push(`Duplicate contextual leadership generation for ${succession.newPersonId} at ${successionId}.`);
      contextualSuccessorIds.add(succession.newPersonId);
    }
    const activePartyLeaders = new Map<string, string>();
    for (const person of Object.values(governance.persons)) {
      if (person.isPartyLeader && person.status === 'active' && person.partyId) {
        if (activePartyLeaders.has(person.partyId)) errors.push(`Party ${person.partyId} has more than one active leader.`);
        activePartyLeaders.set(person.partyId, person.id);
      }
      if (person.leaderProfile !== undefined) {
        const profile = person.leaderProfile;
        if (!profile || typeof profile !== 'object' || Array.isArray(profile) || Object.keys(profile).length !== POLITICAL_ISSUES.length
          || !POLITICAL_ISSUES.every(issue => {
            const dimension = profile[issue];
            return Object.hasOwn(profile, issue) && dimension && typeof dimension === 'object' && !Array.isArray(dimension) && bounded(dimension.valueBps) && bounded(dimension.confidenceBps)
              && ['derived', 'modelled'].includes(dimension.status) && typeof dimension.limitation === 'string' && dimension.limitation.trim();
          })) errors.push(`Invalid political leader profile for ${person.id}.`);
      }
      if (person.leaderProvenance && (!leaderMethods.has(person.leaderProvenance.method) || !['sourced_analogue', 'derived_analogue', 'modelled_fallback'].includes(person.leaderProvenance.basis) || !context.countryIds.has(person.countryId) || !person.partyId || !person.leaderProvenance.sourcePartyId || !validDate(person.leaderProvenance.referenceDate) || person.leaderProvenance.referenceDate > state.date || !['sourced', 'derived', 'unavailable', 'ambiguous'].includes(person.leaderProvenance.sourceLeaderStatus) || !person.leaderProvenance.limitation)) errors.push(`Invalid party leader provenance for ${person.id}.`);
      if (person.leaderProvenance?.method === 'internal_party_balance_succession_v3' && !contextualSuccessorIds.has(person.id)) errors.push(`Invalid contextual leadership succession provenance for ${person.id}.`);
    }
    let previousSuccessionDate: string | undefined;
    const latestSuccessorByParty = new Map<string, string>();
    const pendingParties = new Set<string>();
    for (const successionId of governance.successionOrder) {
      const succession = governance.successions[successionId];
      const previous = governance.persons[succession.previousPersonId], successor = governance.persons[succession.newPersonId];
      if (succession.id !== successionId || !/^succession\.\d{8}$/.test(successionId) || Number(successionId.slice(11)) >= governance.nextSuccessionSequence || !previous || !successor || previous.id === successor.id || previous.partyId !== succession.partyId || successor.partyId !== succession.partyId || previous.countryId !== succession.countryId || successor.countryId !== succession.countryId || !context.countryIds.has(succession.countryId) || !validDate(succession.effectiveDate) || succession.effectiveDate > state.date || previous.createdOn > succession.effectiveDate || successor.createdOn > succession.effectiveDate || !['existing_party_member', 'modelled_fallback', 'modelled_internal_balance'].includes(succession.selection)) errors.push(`Malformed party leadership succession ${successionId}.`);
      if (!validContextualSuccession(state, succession, successor)) errors.push(`Invalid contextual leadership succession ${successionId}.`);
      const previousSuccessorId = latestSuccessorByParty.get(succession.partyId);
      if (previousSuccessorId !== undefined && succession.previousPersonId !== previousSuccessorId) errors.push(`Discontinuous party leadership succession ${successionId}.`);
      if (previousSuccessorId === undefined && (!previous?.leaderProvenance || !initialLeaderMethods.has(previous.leaderProvenance.method)
        || previous.leaderProvenance.referenceDate > succession.effectiveDate
        || previous.leaderProvenance.sourcePartyId !== politicalRegistry.parties[succession.partyId]?.sourceBasis.sourcePartyId)) errors.push(`Invalid initial party leadership root for ${successionId}.`);
      if (pendingParties.has(succession.partyId)) errors.push(`Party leadership succession ${successionId} bypasses a pending handoff.`);
      latestSuccessorByParty.set(succession.partyId, succession.newPersonId);
      if (validDate(succession.effectiveDate)) {
        if (previousSuccessionDate && succession.effectiveDate < previousSuccessionDate) errors.push(`Party leadership succession dates are not monotonic at ${successionId}.`);
        previousSuccessionDate = succession.effectiveDate;
      }
      const handoff = succession.playerHandoff;
      if (handoff && (!['pending', 'continued', 'switched'].includes(handoff.status) || handoff.previousPersonId !== succession.previousPersonId || handoff.successorPersonId !== succession.newPersonId
        || (handoff.status === 'pending'
          ? handoff.decidedOn !== undefined || governance.player.controlledPersonId !== handoff.previousPersonId
          : !validDate(handoff.decidedOn) || handoff.decidedOn! < succession.effectiveDate || handoff.decidedOn! > state.date))) errors.push(`Malformed player handoff for succession ${successionId}.`);
      if (handoff?.status === 'pending') pendingParties.add(succession.partyId);
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
