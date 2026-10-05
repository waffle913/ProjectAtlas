import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { deterministicFingerprint } from '../fingerprint';
import { isSimulationDate as validDate } from '../date';
import { hasGovernmentInformationAccess } from '../information/runtime';
import type { RegionControl } from './model';

export const OPERATIONS_REPORT_PRIORITY = 265;

/** Government-visible combat contact derived only from the observer's own engagement records, never enemy canonical state. */
export interface GovernmentEnemyContact {
  regionId: string;
  lastEngagementOn: string;
  recordedEnemyPersonnelLosses: number;
  confidenceBps: number;
}

export interface GovernmentWarAssessment {
  warId: string;
  enemyCountryId: string;
  targetRegionId: string;
  control: RegionControl;
  enemyStrength: 'unavailable';
  contact: GovernmentEnemyContact[];
}

export interface GovernmentOperationsReport {
  id: string;
  countryId: string;
  asOfDate: string;
  producedOn: string;
  access: 'government';
  source: 'operations.reports';
  status: 'modelled' | 'unavailable';
  confidenceBps: number;
  uncertainty: string;
  limitation: string;
  wars: GovernmentWarAssessment[];
  fingerprint: string;
}

export interface GovernmentOperationsReportInspection extends GovernmentOperationsReport {
  stale: boolean;
}

export function inspectOperationsReports(state: SimulationState, countryId: string, personId: string): GovernmentOperationsReportInspection | undefined {
  if (!hasGovernmentInformationAccess(state, personId, countryId)) return undefined;
  const report = state.information.operationsReports?.latest[countryId];
  return report ? structuredClone({ ...report, stale: report.asOfDate < state.date }) : undefined;
}

export function validateOperationsReport(report: GovernmentOperationsReport, initializedOn: string, date: string) {
  if (report.id !== `operations-report:${report.countryId}:${report.producedOn}` || !validDate(report.asOfDate) || !validDate(report.producedOn)
    || report.asOfDate < initializedOn || report.asOfDate > report.producedOn || report.producedOn > date
    || report.source !== 'operations.reports' || report.access !== 'government'
    || !['modelled', 'unavailable'].includes(report.status) || !Number.isSafeInteger(report.confidenceBps) || report.confidenceBps < 0 || report.confidenceBps > 10000
    || !report.uncertainty?.trim() || !report.limitation?.trim() || !Array.isArray(report.wars)
    || report.fingerprint !== deterministicFingerprint({ ...report, fingerprint: undefined })) throw new Error(`Invalid operations government report ${report.id}.`);
  const warIds = new Set<string>();
  for (const war of report.wars) {
    if (!war.warId || warIds.has(war.warId) || !war.enemyCountryId || !war.targetRegionId
      || !['sovereign_controlled', 'contested', 'foreign_controlled'].includes(war.control) || war.enemyStrength !== 'unavailable' || !Array.isArray(war.contact)) throw new Error(`Malformed operations war assessment in ${report.id}.`);
    warIds.add(war.warId);
    for (const contact of war.contact) {
      if (!contact.regionId || !validDate(contact.lastEngagementOn) || contact.lastEngagementOn > report.asOfDate || !Number.isSafeInteger(contact.recordedEnemyPersonnelLosses) || contact.recordedEnemyPersonnelLosses < 0 || !Number.isSafeInteger(contact.confidenceBps) || contact.confidenceBps < 0 || contact.confidenceBps > 10000) throw new Error(`Malformed operations contact evidence in ${report.id}.`);
    }
  }
}

/** Sparse monthly fog-of-war report for belligerent Countries only, derived from public war facts and the observer's own engagement records. */
export function runOperationsReports(state: SimulationState): SimulationState {
  if (!state.operations.initializedOn) return state;
  const belligerents = new Set<string>();
  for (const war of state.wars) {
    if (war.status !== 'active') continue;
    belligerents.add(war.attackerCountryId);
    belligerents.add(war.defenderCountryId);
  }
  const latest = { ...state.information.operationsReports?.latest };
  for (const countryId of [...belligerents].sort()) {
    if (latest[countryId]?.producedOn === state.date) continue;
    const wars = state.wars.filter(war => war.status === 'active' && (war.attackerCountryId === countryId || war.defenderCountryId === countryId))
      .map(war => {
        const enemyCountryId = war.attackerCountryId === countryId ? war.defenderCountryId : war.attackerCountryId;
        const contact: GovernmentEnemyContact[] = Object.values(state.operations.engagements)
          .filter(engagement => engagement.warId === war.id && (engagement.attackerCountryId === countryId || engagement.defenderCountryId === countryId))
          .map(engagement => ({
            regionId: engagement.regionId,
            lastEngagementOn: engagement.startDate,
            recordedEnemyPersonnelLosses: engagement.attackerCountryId === countryId ? engagement.defenderLosses.personnel : engagement.attackerLosses.personnel,
            confidenceBps: engagement.status === 'active' ? 8000 : 4000,
          }))
          .sort((a, b) => a.regionId.localeCompare(b.regionId) || a.lastEngagementOn.localeCompare(b.lastEngagementOn));
        return {
          warId: war.id,
          enemyCountryId,
          targetRegionId: war.targetRegionId,
          control: state.operations.regionControl[war.targetRegionId] ?? 'sovereign_controlled',
          enemyStrength: 'unavailable' as const,
          contact,
        };
      })
      .sort((a, b) => a.warId.localeCompare(b.warId));
    const report: GovernmentOperationsReport = {
      id: `operations-report:${countryId}:${state.date}`,
      countryId,
      asOfDate: state.date,
      producedOn: state.date,
      access: 'government',
      source: 'operations.reports',
      status: wars.length ? 'modelled' : 'unavailable',
      confidenceBps: wars.length ? 7000 : 0,
      uncertainty: 'Enemy strength, equipment, supply, movement and hidden engagement state are not observed; only own-force combat contact and observable Region control are reported.',
      limitation: 'Modelled fog-of-war report. It never exposes live enemy canonical force state.',
      wars,
      fingerprint: '',
    };
    report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
    latest[countryId] = report;
  }
  const byId = Object.fromEntries(Object.values(latest).map(report => [report.id, report]));
  return { ...state, information: { ...state.information, operationsReports: { latest, byId } } };
}

export const registerOperationsReportTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'operations.reports', cadence: 'monthly', priority: OPERATIONS_REPORT_PRIORITY, run: runOperationsReports });
