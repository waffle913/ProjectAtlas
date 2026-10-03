import type { SimulationState } from '../../types';
import { ratio } from '../socioeconomy/model';
import { governanceFingerprint, type PoliticalProposal } from '../governance/model';
import { derivePartyGoalProfile } from '../governance/analysis';
import { politicalRegistry } from '../politics/registry';
import type { SchedulerTask, SimulationScheduler } from '../scheduler';
import type { AdvisorAssistance, BriefingInterpretation, BriefingPresentation, ChamberBriefingResult, GovernmentProposalEstimate, GovernmentProposalEstimateInspection, GovernmentReport, InformationState, MinisterialBriefing, Portfolio } from './model';
import { INFORMATION_MODEL, INFORMATION_VERSION, briefingId, controlledBriefingCountry, emptyInformation, policyComparisonText, referencedGovernmentReportIds, retainCountryBriefings, retainedMilitaryReports } from './model';

const reportId = (countryId: string, asOfDate: string) => `government-report:${countryId}:unemployment:${asOfDate}`;
const portfolioForProposal = (_proposal: PoliticalProposal): Portfolio => 'finance';

function addBriefing(information: InformationState, briefing: MinisterialBriefing, controlledCountryId?: string): InformationState {
  if (information.briefings.some(item => item.id === briefing.id)) return information;
  const briefings = retainCountryBriefings([...information.briefings, briefing], controlledCountryId);
  return { ...information, briefings, militaryReports: retainedMilitaryReports(information, briefings), governmentReportsById: retainBriefingReports(information.governmentReportsById, information.latestGovernmentReports, briefings) };
}

function retainBriefingReports(
  reportsById: Record<string, GovernmentReport>,
  latestReports: Record<string, GovernmentReport>,
  briefings: readonly MinisterialBriefing[],
): Record<string, GovernmentReport> {
  const retainedIds = referencedGovernmentReportIds({ latestGovernmentReports: latestReports, briefings });
  return Object.fromEntries([...retainedIds].sort().flatMap(id => reportsById[id] ? [[id, reportsById[id]] as const] : []));
}

export function hasGovernmentInformationAccess(state: SimulationState, personId: string, countryId: string): boolean {
  const person = state.governance.persons[personId];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && person.office.authorityProfile.capabilities.includes('access_government_information'));
}

export function inspectGovernmentReports(state: SimulationState, countryId: string, personId: string): GovernmentReport[] {
  if (!hasGovernmentInformationAccess(state, personId, countryId)) return [];
  return Object.values(state.information.latestGovernmentReports)
    .filter(report => report.countryId === countryId)
    .sort((a, b) => a.asOfDate.localeCompare(b.asOfDate))
    .map(report => structuredClone(report));
}

export function inspectBriefings(state: SimulationState, countryId: string, personId: string): MinisterialBriefing[] {
  const governmentAccess = hasGovernmentInformationAccess(state, personId, countryId);
  return state.information.briefings
    .filter(briefing => briefing.countryId === countryId && (briefing.access === 'public' || governmentAccess))
    .map(briefing => structuredClone(briefing));
}

export function inspectPublicBriefings(state: SimulationState, countryId: string): MinisterialBriefing[] {
  return state.information.briefings.filter(item => item.countryId === countryId && item.access === 'public').map(item => structuredClone(item));
}

const chamberDisplayName = (countryId: string, chamberId: string) => {
  const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId]?.institutionId];
  return institution?.chambers.find(chamber => chamber.id === chamberId)?.displayName ?? chamberId;
};

function chamberBriefingResult(countryId: string, chamber: {
  chamberId: string;
  yesSeats: number;
  noSeats: number;
  abstainSeats: number;
  unavailableSeats: number;
  totalSeats?: number;
  coverage: 'complete' | 'partial' | 'unavailable';
  adopted?: boolean;
}): ChamberBriefingResult {
  return {
    chamberId: chamber.chamberId,
    displayName: chamberDisplayName(countryId, chamber.chamberId),
    outcome: chamber.coverage === 'complete' && chamber.adopted !== undefined ? chamber.adopted ? 'adopted' : 'rejected' : 'unavailable',
    yesSeats: chamber.yesSeats,
    noSeats: chamber.noSeats,
    abstainSeats: chamber.abstainSeats,
    unavailableSeats: chamber.unavailableSeats,
    totalSeats: chamber.totalSeats,
    coverage: chamber.coverage,
  };
}

function parliamentaryHeadline(outcome: 'adopted' | 'rejected' | 'unavailable', chambers: ChamberBriefingResult[]): string {
  if (chambers.length === 1 && chambers[0].coverage === 'complete') {
    const chamber = chambers[0];
    const abstentions = chamber.abstainSeats ? ` with ${chamber.abstainSeats} abstentions` : '';
    if (outcome === 'unavailable') return `The overall decision is unavailable. ${chamber.displayName} recorded ${chamber.yesSeats} votes in favour and ${chamber.noSeats} against${abstentions}.`;
    return `${chamber.displayName} ${outcome} the proposal by ${chamber.yesSeats} votes to ${chamber.noSeats}${abstentions}.`;
  }
  if (chambers.length > 1) {
    const results = chambers.map(chamber => chamber.outcome === 'unavailable'
      ? `${chamber.displayName}: result unavailable (${chamber.coverage} coverage)`
      : `${chamber.displayName}: ${chamber.outcome}`);
    const decision = outcome === 'adopted' ? 'The legislature adopted the proposal.'
      : outcome === 'rejected' ? 'The legislature rejected the proposal.'
        : 'The overall parliamentary decision is unavailable.';
    return `${decision} Chamber results: ${results.join('; ')}.`;
  }
  return `Parliamentary result ${outcome}; no chamber-level vote record is available. Aggregate seat totals are not presented as a single vote.`;
}

export function addProposalResultBriefing(state: SimulationState, proposal: PoliticalProposal): SimulationState {
  if (!['enacted', 'rejected', 'unavailable'].includes(proposal.status) || !proposal.voteResult) return state;
  const outcome = proposal.voteResult.outcome;
  const yes = proposal.voteResult.yesSeats, no = proposal.voteResult.noSeats;
  const chamberResults = proposal.voteResult.chambers.map(chamber => chamberBriefingResult(proposal.countryId, chamber));
  const unicameralComplete = chamberResults.length === 1 && chamberResults[0].coverage === 'complete';
  const baseline = state.information.latestGovernmentReports[proposal.countryId];
  const hasComparableBaseline = baseline?.valueBps !== undefined && baseline.asOfDate <= proposal.effectiveDate;
  const policyFollowUp = outcome === 'adopted' ? {
    proposalId: proposal.id,
    effectiveDate: proposal.effectiveDate,
    baselineReportId: hasComparableBaseline ? baseline.id : undefined,
    baselineDate: hasComparableBaseline ? baseline.asOfDate : undefined,
    baselineValueBps: hasComparableBaseline ? baseline.valueBps : undefined,
    attributionStatus: hasComparableBaseline ? 'temporal_only' as const : 'unavailable' as const,
  } : undefined;
  const id = briefingId('proposal_result', proposal.countryId, proposal.id);
  const briefing: MinisterialBriefing = {
    id,
    countryId: proposal.countryId,
    portfolio: portfolioForProposal(proposal),
    access: 'public',
    eventType: 'proposal_result',
    severity: 'advisory',
    createdOn: proposal.voteResult.resolvedOn,
    sourceId: proposal.id,
    headline: `${executiveBriefingPrefix(state, proposal.countryId, 'Parliamentary briefing')} ${parliamentaryHeadline(outcome, chamberResults)}`,
    interpretation: {
      basis: 'derived',
      summary: outcome === 'unavailable'
        ? 'The legislative record does not establish a complete chamber-level decision.'
        : `The recorded chamber result is ${outcome}; it does not establish the wider causal effects of the proposal.`,
      tradeoffs: [],
      limitations: ['Only the recorded chamber-level vote result is summarized; this briefing does not recalculate or combine chamber votes.'],
    },
    fact: {
      kind: 'parliamentary_result',
      proposalId: proposal.id,
      outcome,
      yesSeats: unicameralComplete ? yes : undefined,
      noSeats: unicameralComplete ? no : undefined,
      effectiveDate: outcome === 'adopted' ? proposal.effectiveDate : undefined,
      chamberResults,
      policyFollowUp,
      evidenceStatus: proposal.voteResult.coverage === 'complete' ? 'modelled' : 'partial',
    },
    pauseRequested: false,
  };
  return { ...state, information: addBriefing(state.information, briefing, controlledBriefingCountry(state)) };
}

const estimateId = (countryId: string, proposalId: string, date: string, fingerprint: string) => `government-proposal-estimate:${countryId}:${proposalId}:${date}:${fingerprint}`;

export function produceGovernmentProposalEstimate(state: SimulationState, proposalId: string, personId: string): SimulationState {
  const proposal = state.governance.proposals[proposalId];
  if (!proposal) throw new Error(`Unknown political proposal: ${proposalId}`);
  if (!hasGovernmentInformationAccess(state, personId, proposal.countryId)) throw new Error('Government office access is required to estimate proposal reactions.');
  if (!['draft', 'submitted'].includes(proposal.status)) throw new Error('Only an unresolved proposal can receive a Government Information estimate.');

  const analyzedContent = structuredClone({ effectiveDate: proposal.effectiveDate, payload: proposal.payload });
  const proposalContentFingerprint = governanceFingerprint(analyzedContent);
  const institution = politicalRegistry.institutions[politicalRegistry.countries[proposal.countryId]?.institutionId];
  const chambers: ChamberBriefingResult[] = (institution?.chambers ?? []).map(chamber => ({
    chamberId: chamber.id,
    displayName: chamber.displayName,
    outcome: 'unavailable',
    yesSeats: 0,
    noSeats: 0,
    abstainSeats: 0,
    unavailableSeats: chamber.totalSeats ?? 0,
    totalSeats: chamber.totalSeats,
    coverage: 'unavailable',
  }));
  const totalSeats = chambers.reduce((sum, chamber) => sum + (chamber.totalSeats ?? 0), 0);
  const limitation = 'No government-visible polling, party-response reports or proposal counterfactual channel is modelled. Canonical cohort opinion, party evaluations and material counterfactuals are Reality, not observations. Unknown responses are not neutral opinion or abstention; Public Perception is not implemented.';
  const report: GovernmentProposalEstimate = {
    id: estimateId(proposal.countryId, proposal.id, state.date, proposalContentFingerprint),
    countryId: proposal.countryId,
    proposalId: proposal.id,
    proposalContentFingerprint,
    analyzedContent,
    requestedOn: state.date,
    requestedByPersonId: personId,
    coverage: 'unavailable',
    confidenceBps: 0,
    publicEstimate: {
      supportBps: 0,
      opposeBps: 0,
      neutralBps: 0,
      unknownBps: 10_000,
      confidenceBps: 0,
      coverage: 'unavailable',
    },
    parliamentaryEstimate: {
      yesSeats: 0,
      noSeats: 0,
      abstainSeats: 0,
      unavailableSeats: totalSeats,
      totalSeats,
      confidenceBps: 0,
      coverage: 'unavailable',
      chambers,
    },
    directPolicyChanges: [],
    expectedConsequences: [],
    unsupportedChanges: Object.keys(proposal.payload).map(path => ({ path, reason: limitation, coverage: 'unavailable' })),
    limitations: [limitation, 'Published chamber sizes describe institutions, not predicted votes. No reaction evidence is available at the request date; confidence cannot be inferred from the freshness of unrelated labour reports.'],
    provenance: {
      status: 'unavailable',
      engine: 'government-information-0.15-v2',
      source: 'government-information.available-evidence',
      limitation,
    },
  };
  const proposalEstimates = [
    ...state.information.proposalEstimates.filter(item => item.id !== report.id),
    report,
  ].slice(-INFORMATION_MODEL.proposalEstimateHistoryLimit);
  return { ...state, information: { ...state.information, proposalEstimates } };
}

function inspectEstimate(state: SimulationState, report: GovernmentProposalEstimate): GovernmentProposalEstimateInspection {
  const proposal = state.governance.proposals[report.proposalId];
  return { ...structuredClone(report), stale: !proposal || report.proposalContentFingerprint !== governanceFingerprint({ effectiveDate: proposal.effectiveDate, payload: proposal.payload }) };
}

export function inspectGovernmentProposalEstimates(state: SimulationState, countryId: string, personId: string): GovernmentProposalEstimateInspection[] {
  if (!hasGovernmentInformationAccess(state, personId, countryId)) return [];
  return state.information.proposalEstimates
    .filter(report => report.countryId === countryId)
    .map(report => inspectEstimate(state, report));
}

export function inspectGovernmentProposalEstimate(state: SimulationState, reportId: string, personId: string): GovernmentProposalEstimateInspection | undefined {
  const report = state.information.proposalEstimates.find(item => item.id === reportId);
  if (!report || !hasGovernmentInformationAccess(state, personId, report.countryId)) return undefined;
  return inspectEstimate(state, report);
}

export function explainProposal(state: SimulationState, proposalId: string, personId?: string): string[] {
  const proposal = state.governance.proposals[proposalId];
  if (!proposal) throw new Error(`Unknown political proposal: ${proposalId}`);
  if (!personId || !hasGovernmentInformationAccess(state, personId, proposal.countryId)) {
    if (!proposal.voteResult) return ['No public parliamentary result is available for this proposal.'];
    const briefing = state.information.briefings.find(item => item.fact.kind === 'parliamentary_result' && item.fact.proposalId === proposalId);
    return [briefing?.headline ?? `Public record: ${proposal.voteResult.outcome}. The public record does not establish an isolated policy cause.`];
  }

  const reports = inspectGovernmentProposalEstimates(state, proposal.countryId, personId);
  const report = reports.filter(item => item.proposalId === proposalId && !item.stale).at(-1);
  if (!report) return ['No dated Government Information estimate matches the current proposal content; earlier estimates are stale. Request one while the proposal is unresolved.'];
  const lines = [
    `Government estimate dated ${report.requestedOn}: ${report.coverage} coverage; conservative confidence ${report.confidenceBps} basis points.`,
    ...report.directPolicyChanges.map(change => `${change.explanation} Evidence coverage: ${change.coverage}.`),
    ...report.expectedConsequences.map(item => `${item.explanation} Evidence coverage: ${item.coverage}; confidence ${item.confidenceBps} basis points.`),
    ...report.unsupportedChanges.map(change => `${change.path}: the model cannot currently estimate this effect reliably (${change.coverage}). ${change.reason}`),
    ...report.limitations.map(limitation => `Limitation: ${limitation}`),
  ];
  return lines;
}

export function explainBriefing(state: SimulationState, briefing: MinisterialBriefing, personId: string): string[] {
  if (briefing.access === 'government' && !hasGovernmentInformationAccess(state, personId, briefing.countryId)) {
    return ['This internal briefing is not available to the current office.'];
  }
  if (briefing.fact.kind === 'parliamentary_result' && briefing.fact.proposalId) {
    return explainProposal(state, briefing.fact.proposalId, personId);
  }
  if (briefing.fact.kind === 'labour_report' && briefing.fact.reportId) {
    const report = state.information.governmentReportsById[briefing.fact.reportId];
    if (!report) return ['The referenced labour report is no longer retained.'];
    if (report.valueBps === undefined) return [`The ${report.asOfDate} report has unavailable unemployment coverage. Missing coverage is not a zero rate. ${report.limitation}`];
    const prior = briefing.fact.previousValueBps;
    return [
      `The ${report.asOfDate} modelled unemployment report is ${(report.valueBps / 100).toFixed(2)}%${prior === undefined ? '' : `, compared with ${(prior / 100).toFixed(2)}% in the previous report`}.`,
      ...(briefing.fact.policyComparisons ?? []).map(comparison => `Since proposal ${comparison.proposalId} entered into force on ${comparison.effectiveDate}, unemployment moved from ${(comparison.baselineValueBps / 100).toFixed(2)}% on ${comparison.baselineDate} to ${(comparison.currentValueBps / 100).toFixed(2)}%. This is a temporal comparison, not evidence that the measure caused the change.`),
      `Coverage: ${report.coverage}. This change is temporal evidence, not isolated policy causation.`,
      ...(briefing.interpretation?.limitations ?? []).map(limitation => `Limitation: ${limitation}`),
      report.limitation,
    ];
  }
  if (briefing.fact.kind === 'crisis_activation') {
    return ['No government-visible crisis-report channel is modelled; canonical crisis episodes are not government observations.'];
  }
  if (briefing.fact.kind === 'military_report') {
    const report = state.information.militaryReports?.byId[briefing.sourceId];
    return report ? [report.uncertainty, report.limitation, `Administrative report dated ${report.asOfDate}; alerts: ${report.alertCodes.join(', ') || 'none'}. Later Reality is not read.`] : ['The referenced military report is unavailable.'];
  }
  return ['No deeper causal explanation is available for this briefing.'];
}

function availableFiscalLevers(state: SimulationState, personId: string, countryId: string): Array<'corporate_tax' | 'annual_budget'> {
  const person = state.governance.persons[personId];
  const capabilities = person?.office?.countryId === countryId ? person.office.authorityProfile.capabilities : [];
  if (!hasGovernmentInformationAccess(state, personId, countryId) || !capabilities.includes('sponsor_legislation')) return [];
  const levers: Array<'corporate_tax' | 'annual_budget'> = [];
  if (capabilities.includes('sponsor_fiscal_reform') && typeof state.fiscal.countries[countryId]?.policy.corporate?.rateBps === 'number') levers.push('corporate_tax');
  if (capabilities.includes('sponsor_budget_reform') && state.fiscal.countries[countryId]?.annualBudget) levers.push('annual_budget');
  return levers;
}

export function presentBriefing(state: SimulationState, briefing: MinisterialBriefing, assistance: AdvisorAssistance, personId: string): BriefingPresentation {
  const available = new Set(availableFiscalLevers(state, personId, briefing.countryId));
  const policyLevers = (briefing.interpretation?.policyLevers ?? []).filter(lever => available.has(lever.mechanism));
  return {
    headline: briefing.headline,
    context: assistance === 'expert' ? undefined : briefing.interpretation?.summary,
    guidedActions: assistance === 'guided' && policyLevers.length
      ? [...new Set(policyLevers.map(lever => lever.mechanism))].map(mechanism => ({
        label: mechanism === 'corporate_tax' ? 'Review corporate-tax proposal' : 'Review annual budget proposal',
        destination: 'fiscal' as const,
      }))
      : undefined,
    guidedLevers: assistance === 'guided' && policyLevers.length
      ? policyLevers.map(lever => ({
        label: lever.mechanism === 'corporate_tax' ? 'Corporate-tax proposal' : 'Annual budget proposal',
        explanation: lever.limitation,
      }))
      : undefined,
    tradeoffs: assistance === 'guided' ? briefing.interpretation?.tradeoffs : undefined,
    limitations: assistance === 'guided' ? briefing.interpretation?.limitations : undefined,
    tellMeMoreAvailable: true,
  };
}

function currentExecutive(state: SimulationState, countryId: string) {
  const controlledId = state.governance.player.controlledPersonId;
  const controlled = controlledId ? state.governance.persons[controlledId] : undefined;
  if (controlled && controlled.countryId === countryId && hasGovernmentInformationAccess(state, controlled.id, countryId)) return controlled;
  return Object.values(state.governance.persons)
    .filter(person => person.countryId === countryId && hasGovernmentInformationAccess(state, person.id, countryId))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
}

function executiveBriefingPrefix(state: SimulationState, countryId: string, fallback: string): string {
  const title = currentExecutive(state, countryId)?.office?.title;
  return title && !['Head of Government', 'Head of State', 'Legislator'].includes(title) ? `${title}:` : `${fallback}:`;
}

function labourInterpretation(state: SimulationState, countryId: string, direction: 'increased' | 'decreased'): BriefingInterpretation {
  const executive = currentExecutive(state, countryId);
  const party = executive?.partyId ? politicalRegistry.parties[executive.partyId] : undefined;
  const goals = party ? derivePartyGoalProfile(party).goals : undefined;
  const relevantGoals = ['labour_protection', 'income_security'] as const;
  const leadingGoal = goals && [...relevantGoals]
    .map(goal => ({ goal, importanceBps: goals[goal].importanceBps }))
    .sort((a, b) => b.importanceBps - a.importanceBps || a.goal.localeCompare(b.goal))[0];
  const goalContext = leadingGoal
    ? ' This movement matters to the government’s employment and household-income objectives.'
    : '';
  const limitation = 'No directly supported employment-policy lever or hiring-response mechanism is currently represented; available fiscal proposals can be explored separately but cannot be recommended as an unemployment solution.';
  return {
    basis: goals ? 'derived' : 'modelled',
    summary: `Employment conditions ${direction === 'increased' ? 'worsened' : 'improved'} between the two modelled unemployment reports.${goalContext}`,
    relevantGoals: goals ? [...relevantGoals] : undefined,
    policyLevers: [],
    tradeoffs: [],
    limitations: [limitation],
  };
}

function monthlyReports(state: SimulationState): SimulationState {
  if (state.socioeconomy.lastMonthlyDate !== state.date) return state;
  const existing = state.information.latestGovernmentReports;
  const latestGovernmentReports = { ...existing };
  const governmentReportsById = { ...state.information.governmentReportsById };
  const pendingBriefings = [...state.information.briefings];
  const briefingIds = new Set(pendingBriefings.map(item => item.id));
  const policyAnchors = new Map<string, MinisterialBriefing[]>();
  for (const briefing of pendingBriefings) {
    if (briefing.fact.kind !== 'parliamentary_result' || briefing.fact.outcome !== 'adopted' || briefing.fact.policyFollowUp?.attributionStatus !== 'temporal_only') continue;
    const anchors = policyAnchors.get(briefing.countryId) ?? [];
    anchors.push(briefing);
    policyAnchors.set(briefing.countryId, anchors);
  }
  const countryIds = Object.keys(state.engine.fidelityByCountry).sort();
  const labourByCountry = new Map(countryIds.map(countryId => [countryId, { unemployed: 0, labourForce: 0, coveredRegions: 0, totalRegions: 0 }]));
  for (const [regionId, ownerId] of Object.entries(state.regionOwnership).sort(([a], [b]) => a.localeCompare(b))) {
    const totals = ownerId ? labourByCountry.get(ownerId) : undefined;
    if (!totals) continue;
    totals.totalRegions += 1;
    const economy = state.socioeconomy.regions[regionId]?.economy;
    if (!economy) continue;
    totals.coveredRegions += 1;
    totals.unemployed += economy.unemployed;
    totals.labourForce += economy.labourForce;
  }
  for (const countryId of countryIds) {
    const { unemployed, labourForce, coveredRegions, totalRegions } = labourByCountry.get(countryId)!;
    const coverage = totalRegions === 0 || coveredRegions === 0 || !labourForce
      ? 'unavailable' as const
      : coveredRegions === totalRegions ? 'complete' as const : 'partial' as const;
    const valueBps = coverage === 'unavailable' ? undefined : ratio(unemployed, 10_000, labourForce);
    const previous = existing[countryId];
    const report: GovernmentReport = {
      id: reportId(countryId, state.date),
      countryId,
      indicator: 'unemployment_rate',
      valueBps,
      asOfDate: state.date,
      status: valueBps === undefined ? 'unavailable' : 'modelled',
      coverage,
      unit: 'basis_points',
      source: 'socioeconomy.monthly',
      limitation: valueBps === undefined
        ? 'No simulated labour-force observation is available; unavailable is not a zero unemployment rate.'
        : 'Modelled aggregate of the monthly simulated unemployment and labour-force stocks, not a sourced official statistical publication.',
    };
    latestGovernmentReports[countryId] = report;
    governmentReportsById[report.id] = report;
    const previousValueBps = previous?.valueBps;
    const materiallyChanged = previous?.valueBps !== undefined && valueBps !== undefined
      && Math.abs(valueBps - previousValueBps!) >= INFORMATION_MODEL.materialUnemploymentChangeBps;
    if (!materiallyChanged || previous?.asOfDate === state.date) continue;
    const policyComparisons = (policyAnchors.get(countryId) ?? [])
      .flatMap(item => {
        const anchor = item.fact.policyFollowUp!;
        if (!anchor.baselineReportId || anchor.baselineDate === undefined || anchor.baselineValueBps === undefined || anchor.effectiveDate > state.date || anchor.baselineDate > anchor.effectiveDate) return [];
        const baselineReport = governmentReportsById[anchor.baselineReportId];
        if (!baselineReport || baselineReport.valueBps !== anchor.baselineValueBps) return [];
        return [{
          proposalId: anchor.proposalId,
          effectiveDate: anchor.effectiveDate,
          baselineDate: anchor.baselineDate,
          baselineValueBps: anchor.baselineValueBps,
          currentValueBps: valueBps!,
          attributionStatus: 'temporal_only' as const,
        }];
      })
      .slice(-16);
    const movement = valueBps! > previousValueBps! ? 'increased' : 'decreased';
    const comparisonText = policyComparisons.map(policyComparisonText).join('');
    const id = briefingId('labour_report', countryId, report.id);
    if (briefingIds.has(id)) continue;
    briefingIds.add(id);
    pendingBriefings.push({
      id, countryId, portfolio: 'economy', access: 'government', eventType: 'labour_report',
      severity: 'advisory', createdOn: state.date, sourceId: report.id,
      headline: `${executiveBriefingPrefix(state, countryId, 'Government briefing')} New labour figures are available. Unemployment has ${movement} from ${(previousValueBps! / 100).toFixed(2)}% to ${(valueBps! / 100).toFixed(2)}% since the previous report.${comparisonText}`,
      interpretation: labourInterpretation(state, countryId, movement),
      fact: {
        kind: 'labour_report',
        reportId: report.id,
        previousValueBps: previous.valueBps,
        valueBps,
        policyComparisons,
        evidenceStatus: coverage === 'complete' ? 'modelled' : 'partial',
      },
      pauseRequested: false,
    });
  }
  const briefings = retainCountryBriefings(pendingBriefings, controlledBriefingCountry(state));
  return { ...state, information: {
    ...state.information,
    briefings,
    latestGovernmentReports,
    governmentReportsById: retainBriefingReports(governmentReportsById, latestGovernmentReports, briefings),
    militaryReports: retainedMilitaryReports(state.information, briefings),
  } };
}

export const runInformationMonth = (state: SimulationState) => monthlyReports(state);
export const INFORMATION_TASK_ID = 'information.monthly-reports';
export const informationTask: SchedulerTask = {
  id: INFORMATION_TASK_ID,
  cadence: 'monthly',
  priority: INFORMATION_MODEL.schedulerPriority,
  run: runInformationMonth,
};

export function registerInformationTasks(scheduler: SimulationScheduler) {
  return scheduler.register(informationTask);
}

export function initializeInformationState(state: SimulationState): SimulationState {
  if (state.information?.version === INFORMATION_VERSION && state.information.initializedOn) {
    if (state.information.proposalEstimates !== undefined) return state;
    return { ...state, information: { ...state.information, proposalEstimates: [] } };
  }
  return { ...state, information: emptyInformation(state.date) };
}
