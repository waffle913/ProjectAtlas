import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { deterministicFingerprint } from '../fingerprint';
import { isSimulationDate as validDate } from '../date';
import { hasGovernmentInformationAccess } from '../information/runtime';
import { MULTILATERAL_MODEL, type MembershipRole, type OrganizationDecisionPayload, type TreatyClause, type VotingRuleKind } from './model';

export interface GovernmentMultilateralReport {
  id: string;
  countryId: string;
  asOfDate: string;
  producedOn: string;
  access: 'government';
  source: 'multilateral.reports';
  status: 'modelled' | 'unavailable';
  confidenceBps: number;
  uncertainty: string;
  limitation: string;
  treaties: { id: string; title: string; parties: string[]; status: string; clauses: TreatyClause[] }[];
  organizations: { id: string; title: string; role: MembershipRole; votingRule: { kind: VotingRuleKind; thresholdBps?: number; quorumBps?: number } }[];
  adoptedDecisions: { id: string; organizationId: string; payload: OrganizationDecisionPayload; result: 'adopted'; adoptedOn: string }[];
  openProposals: { id: string; organizationId: string; payload: OrganizationDecisionPayload; votingClosesOn: string }[];
  fingerprint: string;
}

export interface GovernmentMultilateralReportInspection extends GovernmentMultilateralReport {
  stale: boolean;
}

export function inspectMultilateralReports(state: SimulationState, countryId: string, personId: string): GovernmentMultilateralReportInspection | undefined {
  if (!hasGovernmentInformationAccess(state, personId, countryId)) return undefined;
  const report = state.information.multilateralReports?.latest[countryId];
  return report ? structuredClone({ ...report, stale: report.asOfDate < state.date }) : undefined;
}

export function validateMultilateralReport(report: GovernmentMultilateralReport, initializedOn: string, date: string) {
  if (report.id !== `multilateral-report:${report.countryId}:${report.producedOn}` || !validDate(report.asOfDate) || !validDate(report.producedOn)
    || report.asOfDate < initializedOn || report.asOfDate > report.producedOn || report.producedOn > date
    || report.source !== 'multilateral.reports' || report.access !== 'government' || !['modelled', 'unavailable'].includes(report.status)
    || !Number.isSafeInteger(report.confidenceBps) || report.confidenceBps < 0 || report.confidenceBps > 10000
    || !report.uncertainty?.trim() || !report.limitation?.trim() || !Array.isArray(report.treaties) || !Array.isArray(report.organizations) || !Array.isArray(report.adoptedDecisions) || !Array.isArray(report.openProposals)
    || report.fingerprint !== deterministicFingerprint({ ...report, fingerprint: undefined })) throw new Error(`Invalid multilateral government report ${report.id}.`);
}

/** Sparse monthly public/treaty report for participating Countries: exact public texts and adopted resolutions, never foreign votes or intentions. */
export function runMultilateralReports(state: SimulationState): SimulationState {
  if (!state.multilateral?.initializedOn) return state;
  const participants = new Set<string>();
  for (const treaty of Object.values(state.multilateral.treaties)) for (const party of treaty.parties) participants.add(party);
  for (const organization of Object.values(state.multilateral.organizations)) for (const member of Object.keys(organization.members)) participants.add(member);
  const latest = { ...state.information.multilateralReports?.latest };
  for (const countryId of [...participants].sort()) {
    if (latest[countryId]?.producedOn === state.date) continue;
    const treaties = Object.values(state.multilateral.treaties).filter(t => t.parties.includes(countryId)).map(t => ({ id: t.id, title: t.title, parties: t.parties, status: t.status, clauses: t.clauses }));
    const organizations = Object.entries(state.multilateral.organizations).filter(([, o]) => o.members[countryId]).map(([, o]) => ({ id: o.id, title: o.title, role: o.members[countryId].role, votingRule: o.votingRule }));
    const adoptedDecisions = Object.values(state.multilateral.decisions).filter(d => d.result === 'adopted' && state.multilateral.organizations[d.organizationId]?.members[countryId]).map(d => ({ id: d.id, organizationId: d.organizationId, payload: d.payload, result: 'adopted' as const, adoptedOn: d.adoptedOn! }));
    const openProposals = Object.values(state.multilateral.decisions).filter(d => d.status === 'open' && state.multilateral.organizations[d.organizationId]?.members[countryId]).map(d => ({ id: d.id, organizationId: d.organizationId, payload: d.payload, votingClosesOn: d.votingClosesOn }));
    const report: GovernmentMultilateralReport = {
      id: `multilateral-report:${countryId}:${state.date}`,
      countryId, asOfDate: state.date, producedOn: state.date, access: 'government', source: 'multilateral.reports',
      status: treaties.length || organizations.length || adoptedDecisions.length ? 'modelled' : 'unavailable',
      confidenceBps: treaties.length || adoptedDecisions.length ? 8000 : 0,
      uncertainty: 'Treaty texts and adopted resolutions are public and exact; foreign votes, intentions and hidden decision logic are not reported.',
      limitation: 'Modelled public multilateral information; never live foreign voting or secret canonical state.',
      treaties, organizations, adoptedDecisions, openProposals, fingerprint: '',
    };
    report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
    latest[countryId] = report;
  }
  const byId = Object.fromEntries(Object.values(latest).map(report => [report.id, report]));
  return { ...state, information: { ...state.information, multilateralReports: { latest, byId } } };
}

export const registerMultilateralReportTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'multilateral.reports', cadence: 'monthly', priority: MULTILATERAL_MODEL.schedulerPriority + 5, run: runMultilateralReports });
