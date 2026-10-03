import type { SimulationInvariant } from '../invariants';
import { dateValid, sum } from '../fiscal/math';
import { MILITARY_VERSION, presentPersonnel } from './model';
import { validateCapability } from './validation';
import { validateMilitaryReport, militaryReportHeadline, militaryReportInterpretation } from './reports';
import { deterministicFingerprint } from '../fingerprint';
import militaryObservations from '../../data/military-observations.json';
export const militaryInvariant: SimulationInvariant = {
  id: 'military-capability-conservation',
  check: (state, context) => {
    const m = state.military, errors: string[] = [];
    if (!m || m.version !== MILITARY_VERSION || !m.countries) return ['Malformed military state.'];
    if (!m.initializedOn) return Object.keys(m.countries).length || state.information.militaryReports
      || state.information.briefings.some(b => b.eventType === 'military_report' || b.fact.kind === 'military_report')
      ? ['Military state/reporting channel lacks initialization date.'] : [];
    if (!dateValid(m.initializedOn) || m.initializedOn > state.date || m.lastMonthlyDate && (!dateValid(m.lastMonthlyDate) || !m.lastMonthlyDate.endsWith('-01') || m.lastMonthlyDate < m.initializedOn || m.lastMonthlyDate > state.date)) errors.push('Invalid military dates.');
    for (const id of context.countryIds) if (!m.countries[id]) errors.push(`Missing military coverage for ${id}.`);
    const reservations = new Map<string, number>();
    for (const [id, country] of Object.entries(m.countries)) {
      if (!context.countryIds.has(id) || typeof country.limitation !== 'string' || !country.limitation.trim() || !['available', 'unavailable'].includes(country.status) || (country.status === 'available') !== Boolean(country.capability)) errors.push(`Invalid military coverage ${id}.`);
      if (country.observationId && !militaryObservations.records.some(r => r.id === country.observationId && r.countryId === id)) errors.push(`Invalid military source reference ${id}.`);
      const c = country.capability; if (!c) continue;
      try { validateCapability(c, state.date, m.initializedOn); } catch (error) { errors.push(`${id}: ${String(error)}`); continue; }
      for (const [region, persons] of Object.entries(c.assignments)) {
        if (!context.regionIds.has(region) || !state.socioeconomy.regions[region]?.economy) errors.push(`${id}: Invalid military personnel Region ${region}.`);
        reservations.set(region, (reservations.get(region) ?? 0) + persons);
      }
      if (c.lastLedger) {
        if (m.lastMonthlyDate !== c.lastLedger.date || c.lastPreparedOn !== c.lastLedger.date) errors.push(`${id}: Military work does not reconcile with its monthly preparation/execution boundary.`);
        const a = state.fiscal.countries[id]?.account;
        if (!a || a.date !== c.lastLedger.date || a.defense?.executed !== sum(Object.values(c.lastLedger.executed))
          || a.defense.requested !== sum(Object.values(c.lastLedger.requested))
          || a.defense.payroll !== c.lastLedger.executed.payroll
          || a.militaryPayroll?.gross !== c.lastLedger.grossPayrollPaid
          || a.militaryPayroll?.employerCost !== c.lastLedger.employerPayrollCost) errors.push(`${id}: Military ledger has no matching fiscal execution.`);
        const expectedDemand = c.lastLedger.executed.maintenance + c.lastLedger.executed.training + c.productionSupplyPendingUsd;
        if (sum(a?.defensePublicOrders?.map(o => o.amount) ?? []) !== expectedDemand) errors.push(`${id}: Funded defense demand does not reconcile with outstanding resources and executed work.`);
        if (c.lastLedger.payrollDue !== presentPersonnel(c) * c.parameters.monthlySalaryUsd) errors.push(`${id}: Payroll is not based on present personnel.`);
      }
    }
    for (const [id, r] of Object.entries(state.socioeconomy.regions)) {
      if (r.economy && r.economy.employed + r.economy.unemployed + (reservations.get(id) ?? 0) !== r.economy.labourForce) errors.push(`${id}: Civilian jobs/unemployment/military labour conservation failed.`);
    }
    const reports = state.information.militaryReports;
    if (reports) {
      const latest = Object.values(reports.latest);
      if ((latest.length || m.lastMonthlyDate) && ([...context.countryIds].some(id => !reports.latest[id]) || new Set(latest.map(r => r.producedOn)).size !== 1
        || m.lastMonthlyDate && latest.some(r => r.producedOn !== m.lastMonthlyDate))) errors.push('Military reporting cadence/registered-Country coverage is incomplete.');
      const retained = new Set(Object.values(reports.latest).map(r => r.id));
      for (const [id, report] of Object.entries(reports.byId)) {
        const earliest = m.initializedOn > state.information.initializedOn! ? m.initializedOn : state.information.initializedOn!;
        try { validateMilitaryReport(report, earliest, state.date); } catch (error) { errors.push(`${id}: ${String(error)}`); }
        if (report.id !== id || !context.countryIds.has(report.countryId)) errors.push(`Invalid military report identity ${id}.`);
      }
      for (const [countryId, report] of Object.entries(reports.latest)) if (report.countryId !== countryId || JSON.stringify(report) !== JSON.stringify(reports.byId[report.id])) errors.push('Latest military report is not retained.');
      for (const b of state.information.briefings.filter(b => b.eventType === 'military_report' || b.fact.kind === 'military_report')) {
        const r = reports.byId[b.sourceId]; retained.add(b.sourceId);
        if (!r || b.eventType !== 'military_report' || b.fact.kind !== 'military_report' || b.fact.reportId !== r.id || b.countryId !== r.countryId
          || b.createdOn !== r.producedOn || b.portfolio !== 'defense' || b.access !== 'government' || b.severity !== 'advisory' || b.pauseRequested || b.fact.evidenceStatus !== 'modelled' || !r.data
          || b.headline !== militaryReportHeadline(r)
          || deterministicFingerprint(b.interpretation) !== deterministicFingerprint(militaryReportInterpretation(r))) errors.push('Military briefing changes its government report evidence/metadata.');
      }
      if (Object.keys(reports.byId).some(id => !retained.has(id)) || [...retained].some(id => !reports.byId[id])) errors.push('Military report retention does not reconcile.');
    } else if (m.lastMonthlyDate || state.information.briefings.some(b => b.eventType === 'military_report' || b.fact.kind === 'military_report')) errors.push('Military work/briefing lacks reporting channel.');
    return errors;
  },
};
