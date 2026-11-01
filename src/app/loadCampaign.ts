import type { SimulationState } from '../types';
import { simulatedPopulationByCountry, simulatedMonthlyOutputByCountry } from '../simulation/region';
import { readCampaignSummary } from './campaignSummary';
import { hasGovernmentInformationAccess, inspectGovernmentReports } from '../simulation/information/runtime';
import { inspectOperationsReports } from '../simulation/operations/reports';
import { inspectInternationalAssessments } from '../simulation/international/runtime';
import { isSimulationDate } from '../simulation/date';

/** Consumes a detached, validated saved snapshot; never an active clock or command. */
export function campaignPresentation(state: SimulationState) {
  const personId = state.governance.player.controlledPersonId;
  const person = personId ? state.governance.persons[personId] : undefined;
  const countryId = person?.countryId;
  const access = Boolean(personId && countryId && hasGovernmentInformationAccess(state, personId, countryId));
  const dated = (date: unknown): date is string => isSimulationDate(date) && date <= state.date;
  const report = personId && countryId ? inspectOperationsReports(state, countryId, personId) : undefined;
  const operations = report && dated(report.asOfDate) && dated(report.producedOn) ? report : undefined;
  const economicReports = access && personId && countryId ? inspectGovernmentReports(state,countryId,personId).filter(r=>dated(r.asOfDate)) : [];
  const internationalReport = access && countryId ? state.information.internationalReports?.latest[countryId] : undefined;
  const international = personId && countryId && internationalReport && dated(internationalReport.asOfDate) && dated(internationalReport.producedOn)
    ? inspectInternationalAssessments(state,countryId,personId)??[] : [];
  // Existing canonical aggregates, gated like EconomyPanel; never use initial country facts or annual GDP priors.
  const population = access && countryId ? simulatedPopulationByCountry(state,countryId) : undefined;
  const outputDate = state.socioeconomy.lastMonthlyDate;
  const monthlyOutput = access && countryId && dated(outputDate) ? simulatedMonthlyOutputByCountry(state,countryId) : undefined;
  // Briefings already enforce person access, evidence status and all proposal dates.
  const summary = readCampaignSummary(JSON.stringify(state));
  return { person, countryId, access, operations, economicReports, international, population, monthlyOutput, outputDate, summary };
}
