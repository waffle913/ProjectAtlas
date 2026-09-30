import type { SimulationState } from '../../types';
import { clearDirty } from '../dirty';
import type { SimulationScheduler } from '../scheduler';
import { allocate } from '../socioeconomy/model';
import { politicalExperienceFor } from './initialization';
import { POLITICAL_ISSUES, POLITICS_MODEL as M, type CohortPoliticalOpinion, type PoliticalIssue, type PoliticalParty } from './model';

const clamp = (value: number) => Math.max(0, Math.min(10_000, Math.round(value)));
const blend = (prior: number, target: number, inertia: number) => clamp((prior * inertia + target * (10_000 - inertia)) / 10_000);
const ratioBps = (value: number, denominator: number) => denominator > 0 ? clamp(value * 10_000 / denominator) : 0;
const serviceCoverage = (state: SimulationState, countryId: string, infrastructure = false) => {
  const services = state.fiscal.countries[countryId]?.services;
  if (!services) return null;
  const selected = infrastructure ? [services.infrastructure] : [services.health, services.education];
  const values = selected.map(item => item.coverageBps).filter((value): value is number => value !== null);
  return values.length ? Math.floor(values.reduce((a, b) => a + b, 0) / values.length) : null;
};
const basePreference = (opinion: CohortPoliticalOpinion, issue: PoliticalIssue) => {
  const lean = opinion.orientation === 'left' ? 7_500 : opinion.orientation === 'right' ? 3_000 : 5_000;
  const need = opinion.income === 'low' ? 1_000 : opinion.income === 'high' ? -750 : 0;
  if (issue === 'infrastructure') return opinion.orientation === 'centre' ? 7_000 : 6_500;
  if (issue === 'public_order') return opinion.orientation === 'right' ? 8_000 : opinion.orientation === 'left' ? 4_000 : 6_000;
  return clamp(lean + need);
};
function supportTarget(opinion: CohortPoliticalOpinion, parties: PoliticalParty[]) {
  const weights = parties.map(party => {
    let affinity = 0;
    for (const issue of POLITICAL_ISSUES) affinity += (10_000 - Math.abs(opinion.issuePreferencesBps[issue] - party.issuePositions[issue].preferenceBps)) * Math.max(1, opinion.issueSalienceBps[issue]);
    return Math.max(1, Math.floor(affinity / 10_000));
  });
  const undecided = Math.max(1, Math.floor(weights.reduce((a, b) => a + b, 0) * (10_000 - opinion.engagementBps) / 20_000));
  const values = allocate(10_000, [...weights, undecided]);
  return Object.fromEntries([...parties.map((party, index) => [party.id, values[index]]), ['undecided', values[parties.length]]]);
}
function updateOpinion(opinion: CohortPoliticalOpinion, current: CohortPoliticalOpinion['experience'], infrastructureCoverage: number | null, parties: PoliticalParty[]) {
  const incomeDecline = opinion.experience.baselineDisposableIncomePerPerson ? ratioBps(Math.max(0, opinion.experience.baselineDisposableIncomePerPerson - current.disposableIncomePerPerson), opinion.experience.baselineDisposableIncomePerPerson) : 0;
  const needsGap = current.basicNeedsCoverageBps === null ? 0 : 10_000 - current.basicNeedsCoverageBps;
  const serviceGap = current.serviceCoverageBps === null ? 0 : 10_000 - current.serviceCoverageBps;
  const infrastructureGap = infrastructureCoverage === null ? 0 : 10_000 - infrastructureCoverage;
  const sensitivity = M.incomeSensitivityBps[opinion.income];
  const distress = clamp((current.unemploymentBps + incomeDecline + needsGap + serviceGap) * sensitivity / 40_000);
  const sentimentMagnitude = blend(Math.abs(opinion.materialSentimentBps), distress, M.sentimentInertiaBps);
  const sentiment = sentimentMagnitude ? -sentimentMagnitude : 0;
  const materialByIssue: Record<PoliticalIssue, number> = {
    fiscal_distribution: incomeDecline + Math.floor((current.taxBurdenBps ?? 0) * (opinion.income === 'low' ? 1 : opinion.income === 'high' ? -0.5 : 0.25)),
    public_services: serviceGap, labour_protection: current.unemploymentBps, income_security: incomeDecline + needsGap,
    infrastructure: infrastructureGap, public_order: Math.floor(distress / 4),
  };
  const issuePreferencesBps = { ...opinion.issuePreferencesBps }, issueSalienceBps = { ...opinion.issueSalienceBps };
  const drivers: string[] = [];
  for (const issue of POLITICAL_ISSUES) {
    const material = materialByIssue[issue];
    const directional = issue === 'public_order' ? material : material * (opinion.income === 'high' && issue === 'fiscal_distribution' ? -1 : 1);
    issuePreferencesBps[issue] = blend(opinion.issuePreferencesBps[issue], clamp(basePreference(opinion, issue) + directional / 2), M.preferenceInertiaBps);
    issueSalienceBps[issue] = blend(opinion.issueSalienceBps[issue], clamp(4_000 + Math.abs(material)), M.salienceInertiaBps);
    if (Math.abs(material) >= 500) drivers.push(`${issue}:${Math.round(material)}`);
  }
  const provisional = { ...opinion, issuePreferencesBps, issueSalienceBps, materialSentimentBps: sentiment };
  const target = supportTarget(provisional, parties), keys = [...parties.map(party => party.id), 'undecided'];
  const partySupportBps = Object.fromEntries(keys.map(key => [key, 0]));
  const blendedWeights = keys.map(key => opinion.partySupportBps[key] * M.opinionInertiaBps + target[key] * (10_000 - M.opinionInertiaBps));
  const normalized = allocate(10_000, blendedWeights);
  keys.forEach((key, index) => { partySupportBps[key] = normalized[index]; });
  return { ...provisional, partySupportBps, experience: { ...current, baselineDisposableIncomePerPerson: opinion.experience.baselineDisposableIncomePerPerson }, recentMaterialDrivers: drivers.sort() };
}
function aggregate(opinions: CohortPoliticalOpinion[], keys: string[]) {
  const weights = keys.map(key => opinions.reduce((total, opinion) => total + opinion.partySupportBps[key] * opinion.persons, 0));
  const allocated = allocate(10_000, weights.length && weights.some(Boolean) ? weights : keys.map(item => item === 'undecided' ? 1 : 0));
  return Object.fromEntries(keys.map((key, index) => [key, allocated[index]]));
}

export function runPoliticalOpinionWeek(state: SimulationState): SimulationState {
  const politics = state.politics;
  if (!politics.initializedOn || politics.lastOpinionUpdate === state.date) return state;
  const dirty = state.engine.dirtyDomains.find(item => item.domain === 'politics');
  const regionIds = dirty?.entityIds.length ? dirty.entityIds : Object.keys(politics.regionalOpinion);
  const regionalOpinion = { ...politics.regionalOpinion }, affectedCountries = new Set<string>();
  for (const regionId of regionIds.sort()) {
    const regional = regionalOpinion[regionId], socio = state.socioeconomy.regions[regionId];
    if (!regional || !socio) continue;
    const parties = politics.countries[regional.countryId].partyIds.map(id => politics.partyRegistry[id]);
    const service = serviceCoverage(state, regional.countryId), infrastructure = serviceCoverage(state, regional.countryId, true);
    const cohorts = Object.fromEntries(Object.entries(regional.cohorts).sort(([a], [b]) => a.localeCompare(b)).map(([id, opinion]) => [id, updateOpinion(opinion, politicalExperienceFor(socio, opinion.income, service, state.fiscal.regions[regionId]), infrastructure, parties)]));
    const keys = [...parties.map(party => party.id), 'undecided'];
    regionalOpinion[regionId] = { ...regional, cohorts, aggregateSupportBps: aggregate(Object.values(cohorts), keys) };
    affectedCountries.add(regional.countryId);
  }
  const countries = { ...politics.countries }, partyRegistry = { ...politics.partyRegistry }, organizationRegistry = { ...politics.organizationRegistry };
  for (const countryId of [...affectedCountries].sort()) {
    const country = countries[countryId], keys = [...country.partyIds, 'undecided'];
    const opinions = country.regionIds.flatMap(regionId => Object.values(regionalOpinion[regionId]?.cohorts ?? {}));
    const nationalSupportBps = aggregate(opinions, keys);
    country.partyIds.forEach(id => { partyRegistry[id] = { ...partyRegistry[id], nationalSupportBps: nationalSupportBps[id], regionalSupportBps: Object.fromEntries(country.regionIds.map(regionId => [regionId, regionalOpinion[regionId]?.aggregateSupportBps[id] ?? 0])) }; });
    for (const id of country.organizationIds) {
      const organization = organizationRegistry[id], represented = opinions.filter(opinion => organization.representedCohorts.includes(opinion.income));
      const currentPositions = { ...organization.currentPositions };
      for (const issue of organization.issuePriorities) {
        const persons = represented.reduce((n, item) => n + item.persons, 0);
        currentPositions[issue] = persons ? Math.floor(represented.reduce((n, item) => n + item.issuePreferencesBps[issue] * item.persons, 0) / persons) : currentPositions[issue];
      }
      organizationRegistry[id] = { ...organization, currentPositions };
    }
    const drivers = [...new Set(opinions.flatMap(item => item.recentMaterialDrivers))].sort();
    countries[countryId] = { ...country, nationalSupportBps, recentOpinionDrivers: [...country.recentOpinionDrivers, { date: state.date, drivers }].slice(-M.historyLimit) };
  }
  return clearDirty({ ...state, politics: { ...politics, countries, partyRegistry, organizationRegistry, regionalOpinion, lastOpinionUpdate: state.date, weeklyEvaluations: politics.weeklyEvaluations + regionIds.length } }, 'politics');
}

export const registerPoliticalTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'politics.opinion-weekly', cadence: 'weekly', priority: M.schedulerPriority, run: runPoliticalOpinionWeek });

export function inspectPolitics(state: SimulationState, countryId: string) {
  const country = state.politics.countries[countryId]; if (!country) return undefined;
  return structuredClone({ date: state.date, country, institutions: state.politics.institutions[country.institutionId], parties: country.partyIds.map(id => state.politics.partyRegistry[id]), organizations: country.organizationIds.map(id => state.politics.organizationRegistry[id]), regionalOpinion: Object.fromEntries(country.regionIds.map(id => [id, state.politics.regionalOpinion[id]])) });
}
