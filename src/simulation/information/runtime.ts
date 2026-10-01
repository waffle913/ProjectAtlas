import type { SimulationState } from '../../types';
import type { PoliticalProposal } from '../governance/model';
import type { SchedulerTask, SimulationScheduler } from '../scheduler';
import type { AdvisorAssistance, BriefingPresentation, GovernmentReport, InformationState, MinisterialBriefing, Portfolio } from './model';
import { INFORMATION_MODEL, INFORMATION_VERSION, emptyInformation } from './model';
import { CRISIS_TYPES } from '../crisis/model';

const reportId = (countryId: string, asOfDate: string) => `government-report:${countryId}:unemployment:${asOfDate}`;
const briefingId = (eventType: MinisterialBriefing['eventType'], countryId: string, sourceId: string) => `briefing:${eventType}:${countryId}:${sourceId}`;
const portfolioForProposal = (_proposal: PoliticalProposal): Portfolio => 'finance';

function addBriefing(information: InformationState, briefing: MinisterialBriefing): InformationState {
  if (information.briefings.some(item => item.id === briefing.id)) return information;
  const briefings = [...information.briefings, briefing].slice(-INFORMATION_MODEL.briefingHistoryLimit);
  return { ...information, briefings, governmentReportsById: retainBriefingReports(information.governmentReportsById, information.latestGovernmentReports, briefings) };
}

function retainBriefingReports(
  reportsById: Record<string, GovernmentReport>,
  latestReports: Record<string, GovernmentReport>,
  briefings: readonly MinisterialBriefing[],
): Record<string, GovernmentReport> {
  const retainedIds = new Set(Object.values(latestReports).map(report => report.id));
  for (const briefing of briefings) if (briefing.fact.reportId) retainedIds.add(briefing.fact.reportId);
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

export function addProposalResultBriefing(state: SimulationState, proposal: PoliticalProposal): SimulationState {
  if (!['enacted', 'rejected', 'unavailable'].includes(proposal.status) || !proposal.voteResult) return state;
  const outcome = proposal.voteResult.outcome;
  const yes = proposal.voteResult.yesSeats, no = proposal.voteResult.noSeats;
  const resultText = outcome === 'adopted'
    ? `Parliament adopted the fiscal reform by ${yes} votes to ${no}.`
    : outcome === 'rejected'
      ? `Parliament rejected the fiscal reform by ${yes} votes to ${no}.`
      : `Parliamentary evaluation is unavailable (${yes} recorded yes votes and ${no} recorded no votes).`;
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
    headline: resultText,
    interpretation: undefined,
    fact: {
      kind: 'parliamentary_result',
      proposalId: proposal.id,
      outcome,
      yesSeats: yes,
      noSeats: no,
      effectiveDate: outcome === 'adopted' ? proposal.effectiveDate : undefined,
      evidenceStatus: proposal.voteResult.coverage === 'complete' ? 'modelled' : 'partial',
    },
    pauseRequested: false,
  };
  return { ...state, information: addBriefing(state.information, briefing) };
}

export function explainProposal(state: SimulationState, proposalId: string, personId?: string): string[] {
  const proposal = state.governance.proposals[proposalId];
  if (!proposal) throw new Error(`Unknown political proposal: ${proposalId}`);
  if (!personId || !hasGovernmentInformationAccess(state, personId, proposal.countryId)) {
    if (!proposal.voteResult) return ['No public parliamentary result is available for this proposal.'];
    return [`Public record: ${proposal.voteResult.outcome} (${proposal.voteResult.yesSeats} yes seats, ${proposal.voteResult.noSeats} no seats). The public record does not establish an isolated policy cause.`];
  }

  const analysis = proposal.analysis;
  if (!analysis) return ['No saved proposal analysis is available; the proposal has not been evaluated with material evidence.'];
  const lines = [
    ...analysis.directPolicyChanges.map(change => `${change.explanation} Evidence coverage: ${change.coverage}.`),
    ...analysis.expectedConsequences.map(item => `${item.explanation} Evidence coverage: ${item.coverage}; confidence ${item.confidenceBps} basis points.`),
    ...analysis.unsupportedChanges.map(change => `${change.path}: the model cannot currently estimate this effect reliably (${change.coverage}). ${change.reason}`),
    ...analysis.limitations.map(limitation => `Limitation: ${limitation}`),
  ];
  return lines.length ? lines : ['The current evaluation identifies no supported material effect for this proposal.'];
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
      `Coverage: ${report.coverage}. This change is temporal evidence, not isolated policy causation.`,
      report.limitation,
    ];
  }
  if (briefing.fact.kind === 'crisis_activation') {
    const type = briefing.fact.crisisType;
    const episode = type ? state.crisis.countries[briefing.countryId]?.currentByType[type] : undefined;
    const summary = state.crisis.countries[briefing.countryId]?.history.find(item => item.id === briefing.sourceId);
    const drivers = episode?.id === briefing.sourceId ? episode.explanation : summary?.dominantDrivers;
    return [
      `The ${type?.replaceAll('_', ' ')} monitor recorded a ${briefing.fact.crisisSeverity} activation on ${briefing.createdOn}.`,
      ...(drivers ?? []).map(driver => `Recorded monitor evidence: ${driver}.`),
      'The monitor records material conditions; it does not create the underlying causes or estimate consequences outside represented mechanisms.',
    ];
  }
  return ['No deeper causal explanation is available for this briefing.'];
}

export function presentBriefing(briefing: MinisterialBriefing, assistance: AdvisorAssistance): BriefingPresentation {
  return {
    headline: briefing.headline,
    context: assistance === 'expert' ? undefined : briefing.interpretation,
    guidedActions: assistance === 'guided' && briefing.eventType === 'proposal_result' && briefing.fact.outcome === 'rejected'
      ? ['Open proposal']
      : undefined,
    tellMeMoreAvailable: true,
  };
}

function monthlyReports(state: SimulationState): SimulationState {
  if (state.socioeconomy.lastMonthlyDate !== state.date) return state;
  const existing = state.information.latestGovernmentReports;
  const latestGovernmentReports = { ...existing };
  let governmentReportsById = { ...state.information.governmentReportsById };
  let briefings = state.information;
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
    const valueBps = coverage === 'unavailable' ? undefined : Math.round(unemployed * 10_000 / labourForce);
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
    const id = briefingId('labour_report', countryId, report.id);
    briefings = addBriefing(briefings, {
      id, countryId, portfolio: 'economy', access: 'government', eventType: 'labour_report',
      severity: 'advisory', createdOn: state.date, sourceId: report.id,
      headline: `The new monthly labour report records unemployment at ${(valueBps! / 100).toFixed(2)}%, compared with ${(previousValueBps! / 100).toFixed(2)}% in the previous report.`,
      interpretation: 'This is a change between modelled monthly reports, not an isolated causal estimate of any one policy.',
      fact: { kind: 'labour_report', reportId: report.id, previousValueBps: previous.valueBps, valueBps, evidenceStatus: coverage === 'complete' ? 'modelled' : 'partial' },
      pauseRequested: false,
    });
  }
  for (const countryId of countryIds) {
    const crisisCountry = state.crisis.countries[countryId];
    if (!crisisCountry) continue;
    for (const type of CRISIS_TYPES) {
      const episode = crisisCountry.currentByType[type];
      if (episode.state !== 'ACTIVE' || episode.severity === 'none' || episode.activatedOn !== state.date || !episode.activationSnapshot) continue;
      const id = briefingId('crisis_activation', countryId, episode.id);
      briefings = addBriefing(briefings, {
        id,
        countryId,
        portfolio: type === 'fiscal_stress' || type === 'transfer_system_stress' ? 'finance' : type === 'public_service_degradation' || type === 'household_distress' ? 'social_health' : 'economy',
        access: 'government',
        eventType: 'crisis_activation',
        severity: episode.severity === 'severe' || episode.severity === 'critical' ? 'important' : 'advisory',
        createdOn: state.date,
        sourceId: episode.id,
        headline: `The ${type.replaceAll('_', ' ')} monitor recorded a ${episode.severity} activation.`,
        interpretation: 'This is a monitor event about recorded material conditions, not a new cause or an isolated forecast.',
        fact: { kind: 'crisis_activation', crisisType: type, crisisSeverity: episode.severity, evidenceStatus: 'modelled' },
        pauseRequested: false,
      });
    }
  }
  return { ...state, information: {
    ...briefings,
    latestGovernmentReports,
    governmentReportsById: retainBriefingReports(governmentReportsById, latestGovernmentReports, briefings.briefings),
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
  if (state.information?.version === INFORMATION_VERSION && state.information.initializedOn) return state;
  return { ...state, information: emptyInformation(state.date) };
}
