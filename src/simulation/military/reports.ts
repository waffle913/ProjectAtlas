import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { deterministicFingerprint } from '../fingerprint';
import { integer, ratio } from '../socioeconomy/model';
import { dateValid, sum } from '../fiscal/math';
import { hasGovernmentInformationAccess } from '../information/runtime';
import { briefingId, controlledBriefingCountry, retainCountryBriefings } from '../information/model';
import { EQUIPMENT_REGISTRY, equipmentTotal, militaryReadiness, militarySupportStaff, presentPersonnel, trainingPersonnel, type MilitaryItem, type MilitarySource } from './model';
import militaryObservations from '../../data/military-observations.json';
import { validateMilitarySource } from './validation';
import { militaryDeliveryDate } from './dates';

export interface MilitaryReportData {
  authorized: number; present: number; trainees: number; available: number; vacancies: number;
  monthlySalaryUsd: number; payrollDue: number; payrollPaid: number; payrollArrears: number;
  expenditureUsd: number; maintenanceBacklog: number; exercisePersonMonths: number;
  logisticsCapacity: number;
  supportStaff: ReturnType<typeof militarySupportStaff>; logisticsPersonsPerStaff: number;
  industrialMaterials: number; factoryUnitsPerMonth: number;
  deliveredThisMonth: number;
  equipment: { item: MilitaryItem; total: number; operational: number; unavailable: number; maintenance: number; reserve: number; required: number | null }[];
  stocks: { item: MilitaryItem; quantity: number; capacity: number; consumed: number; required: number | null }[];
  orders: { id: string; item: MilitaryItem; quantity: number; funded: number; delivered: number; orderedOn: string; earliestDeliveryOn: string; paidUsd: number }[];
  readiness: ReturnType<typeof militaryReadiness>;
}
export interface GovernmentMilitaryReport {
  historicalReference?: typeof militaryObservations.records[number];
  id: string; countryId: string; asOfDate: string; producedOn: string;
  access: 'government'; source: 'military.administrative-report';
  status: 'modelled' | 'unavailable'; coverage: 'complete' | 'unavailable';
  confidenceBps: number; uncertainty: string; limitation: string;
  data?: MilitaryReportData; provenance?: MilitarySource;
  alertCodes: string[]; fingerprint: string;
}
export function inspectMilitaryReports(state: SimulationState, countryId: string, personId: string) {
  if (!hasGovernmentInformationAccess(state, personId, countryId)) return undefined;
  const report = state.information.militaryReports?.latest[countryId];
  return report ? structuredClone({ ...report, stale: report.asOfDate < state.date }) : undefined;
}
export function validateMilitaryReport(report: GovernmentMilitaryReport, initializedOn: string, date: string) {
  if (report.id !== `military-report:${report.countryId}:${report.producedOn}` || !dateValid(report.asOfDate) || !dateValid(report.producedOn)
    || report.asOfDate < initializedOn || report.asOfDate > report.producedOn || report.producedOn > date
    || report.source !== 'military.administrative-report' || report.access !== 'government'
    || typeof report.uncertainty !== 'string' || !report.uncertainty.trim() || typeof report.limitation !== 'string' || !report.limitation.trim()
    || !Array.isArray(report.alertCodes) || report.confidenceBps !== (report.data ? 7000 : 0)
    || report.status !== (report.data ? 'modelled' : 'unavailable') || report.coverage !== (report.data ? 'complete' : 'unavailable')
    || report.fingerprint !== deterministicFingerprint({ ...report, fingerprint: undefined })) throw new Error('Invalid military government report metadata/evidence.');
  const d = report.data;
  const reference = report.historicalReference;
  if (reference) {
    validateMilitarySource(reference.source);
    const admitted = militaryObservations.records.find(r => r.id === reference.id && r.countryId === report.countryId);
    if (!admitted || deterministicFingerprint(reference) !== deterministicFingerprint(admitted)) throw new Error('Historical military reference differs from its admitted immutable source record.');
  }
  if (reference && (reference.countryId !== report.countryId || reference.status !== 'partial' || reference.source.referenceDate !== '2026-01-01'
    || !dateValid(reference.source.retrievedAt) || !reference.source.licence || !reference.source.limitation || reference.roundingPersons !== 10
    || !Number.isSafeInteger(reference.regularPersonnelReported) || reference.regularPersonnelReported < 0
    || !Number.isSafeInteger(reference.untrainedPersonnelReported) || reference.untrainedPersonnelReported < 0)) throw new Error('Invalid historical military reference; rounded observations are not current stocks.');
  if (!d) { if (report.alertCodes.length || report.provenance) throw new Error('Unavailable military report contains evidence.'); return; }
  if (!report.provenance || !Array.isArray(d.equipment) || !Array.isArray(d.stocks) || !Array.isArray(d.orders)) throw new Error('Military government report lacks provenance/shape.');
  validateMilitarySource(report.provenance);
  for (const role of ['instructors', 'technicians', 'logistics'] as const) integer(d.supportStaff[role]);
  integer(d.logisticsPersonsPerStaff); integer(d.industrialMaterials); integer(d.factoryUnitsPerMonth); integer(d.deliveredThisMonth);
  if (sum(Object.values(d.supportStaff)) > d.available) throw new Error('Military report creates or double-counts qualified support staff.');
  for (const k of ['authorized', 'present', 'trainees', 'available', 'vacancies', 'monthlySalaryUsd', 'payrollDue', 'payrollPaid', 'payrollArrears', 'expenditureUsd', 'maintenanceBacklog', 'exercisePersonMonths', 'logisticsCapacity'] as const) integer(d[k]);
  if (d.payrollPaid > d.expenditureUsd || typeof d.readiness.limitation !== 'string' || !d.readiness.limitation.trim()) throw new Error('Military report payroll expenditure/readiness limitation is invalid.');
  if (d.available + d.trainees !== d.present || d.vacancies !== Math.max(0, d.authorized - d.present) || d.payrollDue !== integer(d.present * d.monthlySalaryUsd) || d.exercisePersonMonths > d.available) throw new Error('Military report personnel/payroll does not reconcile.');
  for (const e of d.equipment) {
    [e.total, e.operational, e.unavailable, e.maintenance, e.reserve].forEach(integer);
    if (e.required !== null) integer(e.required);
    if (!EQUIPMENT_REGISTRY[e.item] || EQUIPMENT_REGISTRY[e.item].consumable || e.total !== sum([e.operational, e.unavailable, e.maintenance, e.reserve])) throw new Error('Military report equipment conservation failed.');
  }
  for (const s of d.stocks) {
    [s.quantity, s.capacity, s.consumed].forEach(integer); if (s.required !== null) integer(s.required);
    if (!EQUIPMENT_REGISTRY[s.item]?.consumable || s.quantity > s.capacity) throw new Error('Military report consumables invalid.');
  }
  const proportion = (n: number, target: number) => !target || n >= target ? 10000 : ratio(n, 10000, target);
  const transport = sum(d.equipment.map(e => integer(e.operational * EQUIPMENT_REGISTRY[e.item].logisticsPersons)));
  if (d.logisticsCapacity !== Math.min(transport, integer(d.supportStaff.logistics * d.logisticsPersonsPerStaff))) throw new Error('Military report logistics has no conserved material means.');
  const equipment = d.equipment.filter(e => e.required !== null).map(e => proportion(e.operational, e.required!));
  const stocks = d.stocks.filter(s => s.required !== null).map(s => proportion(s.quantity, s.required!));
  const components = { personnel: proportion(d.available, d.authorized), equipment: equipment.length ? Math.min(...equipment) : null,
    training: proportion(d.exercisePersonMonths, d.available), stocks: stocks.length ? Math.min(...stocks) : null, logistics: proportion(d.logisticsCapacity, d.available) };
  if (deterministicFingerprint(components) !== deterministicFingerprint(d.readiness.components)
    || d.readiness.limitingBps !== Math.min(...Object.values(components).filter((v): v is number => v !== null)) || d.readiness.logisticsCapacity !== d.logisticsCapacity) throw new Error('Military report readiness is not derived from reported evidence.');
  if (new Set(d.equipment.map(e => e.item)).size !== d.equipment.length || new Set(d.stocks.map(s => s.item)).size !== d.stocks.length || new Set(d.orders.map(o => o.id)).size !== d.orders.length) throw new Error('Duplicate military report inventory/order.');
  for (const o of d.orders) {
    [o.quantity, o.funded, o.delivered, o.paidUsd].forEach(integer);
    if (!EQUIPMENT_REGISTRY[o.item] || o.funded > o.quantity || o.delivered > o.funded || !dateValid(o.orderedOn) || o.orderedOn > report.asOfDate
      || o.earliestDeliveryOn !== militaryDeliveryDate(o.orderedOn, EQUIPMENT_REGISTRY[o.item].productionMonths + 1)
      || o.paidUsd !== integer(o.funded * EQUIPMENT_REGISTRY[o.item].unitCostUsd) || o.delivered && report.asOfDate < o.earliestDeliveryOn) throw new Error('Invalid reported military order.');
  }
  if (deterministicFingerprint(report.alertCodes) !== deterministicFingerprint(militaryAlertCodes(d))) throw new Error('Military alert does not follow report evidence.');
}
export function militaryAlertCodes(d: MilitaryReportData): string[] {
  const codes: string[] = [];
  if (d.payrollArrears) codes.push('unpaid_personnel');
  if (d.authorized && d.present < Math.ceil(d.authorized / 2)) codes.push('personnel_shortfall');
  if (d.equipment.some(e => e.total > 0 && e.operational < Math.ceil(e.total / 2))) codes.push('equipment_unavailable');
  if (d.stocks.some(s => s.required !== null && s.required > 0 && s.quantity < Math.ceil(s.required / 4))) codes.push('consumable_shortfall');
  if (d.maintenanceBacklog > sum(d.equipment.map(e => e.total))) codes.push('maintenance_backlog');
  return codes;
}
export const militaryReportHeadline = (report: GovernmentMilitaryReport) => `Defense administrative report: ${report.alertCodes.length ? report.alertCodes.join(', ') : 'delivery completed'}${report.data?.deliveredThisMonth ? `; ${report.data.deliveredThisMonth} units delivered` : ''}.`;
export const militaryReportInterpretation = (report: GovernmentMilitaryReport) => ({
  basis: 'modelled' as const, summary: 'Capability limits follow the reported personnel, physical equipment, supplies and funded work.',
  tradeoffs: ['Restoration requires time, existing workforce, stock and actual fiscal financing.'], limitations: [report.uncertainty, report.limitation],
});
export function runMilitaryReports(state: SimulationState): SimulationState {
  if (!state.military.initializedOn) return state;
  if (!state.date.endsWith('-01')) throw new Error('Military administrative reports require a monthly boundary.');
  const latest = { ...state.information.militaryReports?.latest }, byId = { ...state.information.militaryReports?.byId };
  const briefings = [...state.information.briefings];
  for (const [id, country] of Object.entries(state.military.countries).sort(([a], [b]) => a.localeCompare(b))) {
    if (latest[id]?.producedOn === state.date) continue;
    const c = country.capability, readiness = c ? militaryReadiness(c) : undefined;
    if (c?.lastLedger && c.lastLedger.date !== state.date) throw new Error('Military administrative report requires current-boundary executed-work evidence.');
    const present = c ? presentPersonnel(c) : 0, trainees = c ? trainingPersonnel(c) : 0;
    const data: MilitaryReportData | undefined = c ? {
      authorized: c.authorized, present, trainees, available: present - trainees, vacancies: Math.max(0, c.authorized - present),
      monthlySalaryUsd: c.parameters.monthlySalaryUsd, payrollDue: integer(present * c.parameters.monthlySalaryUsd),
      payrollPaid: c.lastLedger?.grossPayrollPaid ?? 0, payrollArrears: c.payrollArrears,
      expenditureUsd: c.lastLedger ? sum(Object.values(c.lastLedger.executed)) : 0,
      maintenanceBacklog: sum(Object.values(c.equipment).map(e => e!.backlogUnitMonths)),
      exercisePersonMonths: c.exercisePersonMonths, logisticsCapacity: readiness!.logisticsCapacity, readiness: readiness!,
      supportStaff: militarySupportStaff(c), logisticsPersonsPerStaff: c.parameters.logisticsPersonsPerStaff,
      industrialMaterials: c.industrialMaterials.quantity, factoryUnitsPerMonth: c.parameters.factoryUnitsPerMonth,
      deliveredThisMonth: c.lastLedger?.deliveredUnits ?? 0,
      equipment: Object.entries(c.equipment).sort(([a], [b]) => a.localeCompare(b)).map(([item, e]) => ({ item: item as MilitaryItem, total: equipmentTotal(e!), operational: e!.operational, unavailable: e!.unavailable, maintenance: e!.maintenance, reserve: e!.reserve, required: c.parameters.desiredEquipment[item as MilitaryItem] ?? null })),
      stocks: Object.entries(c.consumables).sort(([a], [b]) => a.localeCompare(b)).map(([item, s]) => ({ item: item as MilitaryItem, quantity: s!.quantity, capacity: s!.capacity, consumed: s!.consumed, required: c.parameters.desiredConsumables[item as MilitaryItem] ?? null })),
      orders: c.orders.map(({ id, item, quantity, funded, delivered, orderedOn, earliestDeliveryOn, paidUsd }) => ({ id, item, quantity, funded, delivered, orderedOn, earliestDeliveryOn, paidUsd })),
    } : undefined;
    const report: GovernmentMilitaryReport = {
      id: `military-report:${id}:${state.date}`, countryId: id, asOfDate: c?.lastLedger?.date ?? state.date, producedOn: state.date,
      access: 'government', source: 'military.administrative-report', status: data ? 'modelled' : 'unavailable', coverage: data ? 'complete' : 'unavailable',
      confidenceBps: data ? 7000 : 0, uncertainty: data ? 'Modelled administrative census of the configured simulated capability, not observed real readiness or combat effectiveness.' : 'No admitted military capacity data.',
      limitation: country.limitation, provenance: c ? structuredClone(c.source) : undefined, data,
      alertCodes: data ? militaryAlertCodes(data) : [], fingerprint: '',
      historicalReference: country.observationId ? structuredClone(militaryObservations.records.find(r => r.id === country.observationId)) : undefined,
    };
    report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
    validateMilitaryReport(report, state.information.initializedOn!, state.date);
    const previous = latest[id];
    latest[id] = report; byId[report.id] = report;
    const changedAlerts = report.alertCodes.length && deterministicFingerprint(previous?.alertCodes ?? []) !== deterministicFingerprint(report.alertCodes);
    const delivered = c?.lastLedger?.deliveredUnits ?? 0;
    if (changedAlerts || delivered) briefings.push({
      id: briefingId('military_report', id, report.id), countryId: id, portfolio: 'defense', access: 'government',
      eventType: 'military_report', severity: 'advisory', createdOn: state.date, sourceId: report.id,
      headline: militaryReportHeadline(report),
      fact: { kind: 'military_report', reportId: report.id, evidenceStatus: 'modelled' },
      interpretation: militaryReportInterpretation(report),
      pauseRequested: false,
    });
  }
  const retained = retainCountryBriefings(briefings, controlledBriefingCountry(state));
  const referenced = new Set([...Object.values(latest).map(r => r.id), ...retained.filter(b => b.eventType === 'military_report').map(b => b.sourceId)]);
  return { ...state, information: { ...state.information, briefings: retained, militaryReports: { latest, byId: Object.fromEntries([...referenced].sort().map(id => [id, byId[id]])) } } };
}
export const registerMilitaryReportTasks = (scheduler: SimulationScheduler) => scheduler.register({
  id: 'military.administrative-reports', cadence: 'monthly', priority: 250, run: runMilitaryReports,
});
