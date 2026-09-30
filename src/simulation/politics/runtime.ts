import type { SimulationState } from '../../types';
import { clearDirty } from '../dirty';
import type { SimulationScheduler } from '../scheduler';
import { allocate } from '../socioeconomy/model';
import { cohortTraits, initialPreferences, organizationStateFor, politicalExperienceFor, supportFor } from './initialization';
import { POLITICAL_ISSUES, POLITICS_MODEL as M, type CohortPoliticalOpinion, type PoliticalIssue, type PoliticalParty, type RegionalPoliticalOpinion } from './model';
import { politicalRegistry } from './registry';

const clamp = (value: number) => Math.max(0, Math.min(10_000, Math.round(value)));
const blend = (prior: number, target: number, inertia: number) => clamp((prior * inertia + target * (10_000 - inertia)) / 10_000);
const ratioBps = (value: number, denominator: number) => denominator > 0 ? clamp(value * 10_000 / denominator) : 0;
const serviceCoverage = (state: SimulationState, countryId: string, infrastructure = false) => {
  const services = state.fiscal.countries[countryId]?.services; if (!services) return null;
  const selected = infrastructure ? [services.infrastructure] : [services.health, services.education], values = selected.map(item => item.coverageBps).filter((value): value is number => value !== null);
  return values.length ? Math.floor(values.reduce((a, b) => a + b, 0) / values.length) : null;
};
const basePreference = (cohortId: string, issue: PoliticalIssue) => initialPreferences(cohortTraits(cohortId).income, cohortTraits(cohortId).orientation)[POLITICAL_ISSUES.indexOf(issue)];
function updateOpinion(cohortId: string, opinion: CohortPoliticalOpinion, current: ReturnType<typeof politicalExperienceFor>, infrastructureCoverage: number | null, parties: PoliticalParty[]): CohortPoliticalOpinion {
  const { income } = cohortTraits(cohortId), baseline = opinion[5];
  const incomeDecline = baseline ? ratioBps(Math.max(0, baseline - current.disposableIncomePerPerson), baseline) : 0;
  const needsGap = current.basicNeedsCoverageBps === null ? 0 : 10_000 - current.basicNeedsCoverageBps, serviceGap = current.serviceCoverageBps === null ? 0 : 10_000 - current.serviceCoverageBps, infrastructureGap = infrastructureCoverage === null ? 0 : 10_000 - infrastructureCoverage;
  const distress = clamp((current.unemploymentBps + incomeDecline + needsGap + serviceGap) * M.incomeSensitivityBps[income] / 40_000), sentimentMagnitude = blend(Math.abs(opinion[4]), distress, M.sentimentInertiaBps);
  const material = [incomeDecline + Math.floor((current.taxBurdenBps ?? 0) * (income === 'low' ? 1 : income === 'high' ? -0.5 : 0.25)), serviceGap, current.unemploymentBps, incomeDecline + needsGap, infrastructureGap, Math.floor(distress / 4)];
  const preferences = [...opinion[0]], salience = [...opinion[1]], drivers: number[] = [];
  POLITICAL_ISSUES.forEach((issue, index) => { const directional = issue === 'public_order' ? material[index] : material[index] * (income === 'high' && issue === 'fiscal_distribution' ? -1 : 1); preferences[index] = blend(preferences[index], clamp(basePreference(cohortId, issue) + directional / 2), M.preferenceInertiaBps); salience[index] = blend(salience[index], clamp(4_000 + Math.abs(material[index])), M.salienceInertiaBps); if (Math.abs(material[index]) >= 500) drivers.push(index); });
  const target = supportFor(preferences, salience, opinion[3], parties), prior = opinion[2].length === target.length ? opinion[2] : supportFor(preferences, salience, opinion[3], parties);
  const support = allocate(10_000, target.map((value, index) => prior[index] * M.opinionInertiaBps + value * (10_000 - M.opinionInertiaBps)));
  return [preferences, salience, support, opinion[3], sentimentMagnitude ? -sentimentMagnitude : 0, baseline, drivers];
}
function aggregate(state: SimulationState, regionIds: string[], regional: Record<string, RegionalPoliticalOpinion>, partyCount: number) {
  const weights = Array(partyCount + 1).fill(0); let persons = 0;
  for (const regionId of regionIds) for (const [cohortId, opinion] of Object.entries(regional[regionId]?.cohorts ?? {})) { const count = state.socioeconomy.regions[regionId]?.cohorts.find(item => `${item.income}:${item.orientation}` === cohortId)?.persons ?? 0; persons += count; opinion[2].forEach((value, index) => { weights[index] += value * count; }); }
  return allocate(10_000, persons ? weights : weights.map((_, index) => index === partyCount ? 1 : 0));
}

export function runPoliticalOpinionWeek(state: SimulationState): SimulationState {
  const politics = state.politics; if (!politics.initializedOn || politics.lastOpinionUpdate === state.date) return state;
  const regionalOpinion = { ...politics.regionalOpinion }, regionIdsByCountry = new Map<string, string[]>();
  for (const countryId of Object.keys(politics.countries)) regionIdsByCountry.set(countryId, []);
  for (const regionId of Object.keys(regionalOpinion).sort()) {
    const socio = state.socioeconomy.regions[regionId], owner = state.regionOwnership[regionId]; if (!socio || !owner || !politics.countries[owner]) continue;
    regionIdsByCountry.get(owner)!.push(regionId);
    const prior = regionalOpinion[regionId], partyIds = politicalRegistry.countries[owner]?.partyIds ?? [], parties = partyIds.map(id => politicalRegistry.parties[id]);
    const publicServices = serviceCoverage(state, owner), infrastructure = serviceCoverage(state, owner, true), cohorts: Record<string, CohortPoliticalOpinion> = {};
    for (const [id, opinion] of Object.entries(prior.cohorts).sort(([a], [b]) => a.localeCompare(b))) {
      const traits = cohortTraits(id), remapped: CohortPoliticalOpinion = prior.countryId === owner ? opinion : [opinion[0], opinion[1], supportFor(opinion[0], opinion[1], opinion[3], parties), opinion[3], opinion[4], opinion[5], opinion[6]];
      cohorts[id] = updateOpinion(id, remapped, politicalExperienceFor(socio, traits.income, publicServices, state.fiscal.regions[regionId]), infrastructure, parties);
    }
    regionalOpinion[regionId] = { regionId, countryId: owner, cohorts };
  }
  const countries = { ...politics.countries };
  for (const countryId of Object.keys(countries).sort()) {
    const regionIds = (regionIdsByCountry.get(countryId) ?? []).sort(), partyCount = politicalRegistry.countries[countryId]?.partyIds.length ?? 0, opinions = regionIds.flatMap(id => Object.values(regionalOpinion[id]?.cohorts ?? {}));
    const drivers = [...new Set(opinions.flatMap(item => item[6]))].sort((a, b) => a - b);
    countries[countryId] = { ...countries[countryId], regionIds, nationalSupportBps: aggregate(state, regionIds, regionalOpinion, partyCount), recentOpinionDrivers: [...countries[countryId].recentOpinionDrivers, { date: state.date, drivers }].slice(-M.historyLimit) };
  }
  const organizations = Object.fromEntries(Object.values(politicalRegistry.organizations).filter(item => countries[item.countryId]).map(item => [item.id, organizationStateFor(state, item, regionalOpinion, state.date, politics.organizations[item.id])]));
  return clearDirty({ ...state, politics: { ...politics, countries, regionalOpinion, organizations, lastOpinionUpdate: state.date, weeklyEvaluations: politics.weeklyEvaluations + Object.keys(regionalOpinion).length } }, 'politics');
}
export const registerPoliticalTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'politics.opinion-weekly', cadence: 'weekly', priority: M.schedulerPriority, run: runPoliticalOpinionWeek });
export function inspectPolitics(state: SimulationState, countryId: string) {
  const country = state.politics.countries[countryId], definition = politicalRegistry.countries[countryId]; if (!country) return undefined;
  const parties = definition?.partyIds ?? [], decode = (region: RegionalPoliticalOpinion | undefined) => region && ({ ...region, cohorts: Object.fromEntries(Object.entries(region.cohorts).map(([id, value]) => [id, { issuePreferencesBps: Object.fromEntries(POLITICAL_ISSUES.map((issue, index) => [issue, value[0][index]])), issueSalienceBps: Object.fromEntries(POLITICAL_ISSUES.map((issue, index) => [issue, value[1][index]])), partySupportBps: Object.fromEntries([...parties.map((partyId, index) => [partyId, value[2][index]]), ['undecided', value[2][parties.length]]]), engagementBps: value[3], materialSentimentBps: value[4], baselineDisposableIncomePerPerson: value[5], recentMaterialDrivers: value[6].map(index => POLITICAL_ISSUES[index]) }])) });
  return structuredClone({ date: state.date, country: { ...country, coverage: definition?.coverage }, institutions: definition ? politicalRegistry.institutions[definition.institutionId] : undefined, parties: parties.map((id, index) => ({ ...politicalRegistry.parties[id], nationalSupportBps: country.nationalSupportBps[index] })), organizations: definition?.organizationIds.map(id => ({ ...politicalRegistry.organizations[id], dynamic: state.politics.organizations[id] })) ?? [], regionalOpinion: Object.fromEntries(country.regionIds.map(id => [id, decode(state.politics.regionalOpinion[id])])) });
}
