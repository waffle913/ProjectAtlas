import type { PoliticalOfficesData } from '../../data/countryData';
import type { RegionEntity, SimulationState } from '../../types';
import { allocate, INCOMES, ratio, type SocioRegion } from '../socioeconomy/model';
import { aggregateNationalSupport } from './aggregation';
import type { RegionFiscal } from '../fiscal/model';
import { emptyPolitics, POLITICAL_ISSUES, POLITICS_MODEL, type CohortPoliticalOpinion, type OrganizationPoliticalState, type PoliticalIssue, type PoliticalOrganization, type PoliticalParty, type RegionalPoliticalOpinion } from './model';
import { politicalRegistry } from './registry';

// Retained for call-site compatibility. Static politics now comes from the pinned registry.
export interface PoliticalInitializationData { countries?: readonly { id: string; entityType: string }[]; offices?: PoliticalOfficesData }
export interface CurrentPoliticalExperience { disposableIncomePerPerson: number; unemploymentBps: number; basicNeedsCoverageBps: number | null; taxBurdenBps: number | null; serviceCoverageBps: number | null }
const safeRatioBps = (value: number, denominator: number) => denominator > 0 ? Math.min(10_000, ratio(value, 10_000, denominator)) : null;
export function politicalExperienceFor(region: SocioRegion, income: typeof INCOMES[number], countryServices: number | null, fiscal?: RegionFiscal): CurrentPoliticalExperience {
  const index = INCOMES.indexOf(income), persons = region.cohorts.filter(item => item.income === income).reduce((n, item) => n + item.persons, 0);
  const disposable = fiscal?.disposable[index] ?? region.economy?.incomeByGroup[index] ?? 0, gross = fiscal?.grossIncome[index] ?? region.economy?.incomeByGroup[index] ?? 0;
  const taxes = (fiscal?.personal[index] ?? 0) + (fiscal?.employee[index] ?? 0);
  return { disposableIncomePerPerson: persons ? Math.floor(disposable / persons) : 0, unemploymentBps: region.economy ? safeRatioBps(region.economy.unemployed, region.economy.labourForce) ?? 0 : 0, basicNeedsCoverageBps: region.economy?.basicNeedsCoverageBps ?? null, taxBurdenBps: safeRatioBps(taxes, gross), serviceCoverageBps: countryServices };
}
const clamp = (value: number) => Math.max(0, Math.min(10_000, Math.round(value)));
const blend = (prior: number, target: number, inertia: number) => clamp((prior * inertia + target * (10_000 - inertia)) / 10_000);
export const cohortTraits = (cohortId: string) => { const [income, orientation] = cohortId.split(':') as ['low' | 'middle' | 'high', 'left' | 'centre' | 'right']; return { income, orientation }; };
export function initialPreferences(income: 'low' | 'middle' | 'high', orientation: 'left' | 'centre' | 'right') {
  const lean = orientation === 'left' ? 7_500 : orientation === 'right' ? 3_000 : 5_000, need = income === 'low' ? 1_000 : income === 'high' ? -750 : 0;
  return POLITICAL_ISSUES.map(issue => issue === 'infrastructure' ? (orientation === 'centre' ? 7_000 : 6_500) : issue === 'public_order' ? (orientation === 'right' ? 8_000 : orientation === 'left' ? 4_000 : 6_000) : clamp(lean + need));
}
export function supportFor(preferences: number[], salience: number[], engagement: number, parties: PoliticalParty[]) {
  if (!parties.length) return [10_000];
  const weights = parties.map(party => { let affinity = 0; for (let index = 0; index < POLITICAL_ISSUES.length; index++) affinity += (10_000 - Math.abs(preferences[index] - party.issuePositions[POLITICAL_ISSUES[index]].preferenceBps)) * Math.max(1, salience[index]); return Math.max(1, Math.floor(affinity / 10_000)); });
  const undecided = Math.max(1, Math.floor(weights.reduce((a, b) => a + b, 0) * (10_000 - engagement) / 20_000));
  return allocate(10_000, [...weights, undecided]);
}
const publicServiceCoverage = (state: SimulationState, countryId: string) => {
  const services = state.fiscal.countries[countryId]?.services; if (!services) return null;
  const values = [services.health.coverageBps, services.education.coverageBps].filter((value): value is number => value !== null);
  return values.length ? Math.floor(values.reduce((a, b) => a + b, 0) / values.length) : null;
};

export function organizationStateFor(state: SimulationState, organization: PoliticalOrganization, regionalOpinion: Record<string, RegionalPoliticalOpinion>, date: string, prior?: OrganizationPoliticalState): OrganizationPoliticalState {
  const weighted = POLITICAL_ISSUES.map(() => 0), represented = new Set(organization.representedCohorts); let persons = 0, unemploymentWeight = 0, distressWeight = 0, taxWeight = 0;
  for (const [regionId, regional] of Object.entries(regionalOpinion)) {
    if (regional.countryId !== organization.countryId) continue;
    const socio = state.socioeconomy.regions[regionId]; if (!socio) continue;
    for (const cohort of socio.cohorts) {
      if (!represented.has(cohort.income) || cohort.persons <= 0) continue;
      const opinion = regional.cohorts[`${cohort.income}:${cohort.orientation}`]; if (!opinion) continue;
      persons += cohort.persons; opinion[0].forEach((value, index) => { weighted[index] += value * cohort.persons; }); distressWeight += Math.abs(opinion[4]) * cohort.persons;
      const experience = politicalExperienceFor(socio, cohort.income, publicServiceCoverage(state, organization.countryId), state.fiscal.regions[regionId]); taxWeight += (experience.taxBurdenBps ?? 0) * cohort.persons; unemploymentWeight += experience.unemploymentBps * cohort.persons;
    }
  }
  const base = POLITICAL_ISSUES.map((_, index) => persons ? Math.round(weighted[index] / persons) : 5_000), unemployment = persons ? Math.round(unemploymentWeight / persons) : 0, distress = persons ? Math.round(distressWeight / persons) : 0, tax = persons ? Math.round(taxWeight / persons) : 0;
  const infrastructure = state.fiscal.countries[organization.countryId]?.services.infrastructure.coverageBps, infrastructureGap = infrastructure === null || infrastructure === undefined ? 0 : 10_000 - infrastructure;
  const target = [...base];
  if (organization.type === 'union') { target[POLITICAL_ISSUES.indexOf('labour_protection')] = clamp(target[2] + (unemployment + distress) / 3); target[POLITICAL_ISSUES.indexOf('income_security')] = clamp(target[3] + distress / 2); target[POLITICAL_ISSUES.indexOf('public_services')] = clamp(target[1] + distress / 4); }
  else { target[POLITICAL_ISSUES.indexOf('fiscal_distribution')] = clamp(target[0] - tax / 4 - distress / 5); target[POLITICAL_ISSUES.indexOf('infrastructure')] = clamp(target[4] + infrastructureGap / 3); target[POLITICAL_ISSUES.indexOf('public_order')] = clamp(target[5] + unemployment / 5); }
  const currentPositions = Object.fromEntries(POLITICAL_ISSUES.map((issue, index) => [issue, prior ? blend(prior.currentPositions[issue], target[index], POLITICS_MODEL.organizationInertiaBps) : target[index]])) as Record<PoliticalIssue, number>;
  const issues = organization.issuePriorities.filter(issue => Math.abs(target[POLITICAL_ISSUES.indexOf(issue)] - base[POLITICAL_ISSUES.indexOf(issue)]) >= 250);
  return { organizationId: organization.id, currentPositions, lastUpdatedOn: date, recentDrivers: [...(prior?.recentDrivers ?? []), { date, issues }].slice(-POLITICS_MODEL.historyLimit) };
}

export function initializePolitics(state: SimulationState, countryIds: Iterable<string>, regions: readonly RegionEntity[], _data?: PoliticalInitializationData): SimulationState['politics'] {
  if (state.politics.initializedOn) return state.politics;
  const politics = emptyPolitics(), countries = { ...politics.countries }, regionalOpinion: Record<string, RegionalPoliticalOpinion> = {};
  for (const countryId of [...countryIds].sort()) {
    const definition = politicalRegistry.countries[countryId], partyIds = definition?.partyIds ?? [], parties = partyIds.map(id => politicalRegistry.parties[id]);
    const regionIds = regions.filter(region => state.regionOwnership[region.id] === countryId).map(region => region.id).sort(), serviceCoverage = publicServiceCoverage(state, countryId), initialByCohort = new Map<string, { preferences: number[]; salience: number[]; engagement: number; support: number[] }>();
    for (const regionId of regionIds) {
      const socio = state.socioeconomy.regions[regionId]; if (!socio) continue;
      const cohorts: Record<string, CohortPoliticalOpinion> = {};
      for (const cohort of socio.cohorts) if (cohort.persons > 0) {
        const cohortId = `${cohort.income}:${cohort.orientation}`; let template = initialByCohort.get(cohortId); if (!template) { const preferences = initialPreferences(cohort.income, cohort.orientation), salience = POLITICAL_ISSUES.map(() => 4_000), engagement = POLITICS_MODEL.baseEngagementBps[cohort.orientation]; template = { preferences, salience, engagement, support: supportFor(preferences, salience, engagement, parties) }; initialByCohort.set(cohortId, template); }
        const experience = politicalExperienceFor(socio, cohort.income, serviceCoverage, state.fiscal.regions[regionId]);
        cohorts[cohortId] = [[...template.preferences], [...template.salience], [...template.support], template.engagement, 0, experience.disposableIncomePerPerson, []];
      }
      regionalOpinion[regionId] = { regionId, countryId, cohorts };
    }
    countries[countryId] = { countryId, regionIds, nationalSupportBps: aggregateNationalSupport(state, regionIds, regionalOpinion, partyIds.length), recentOpinionDrivers: [] };
  }
  const organizations = Object.fromEntries(Object.values(politicalRegistry.organizations).filter(item => countries[item.countryId]).map(item => [item.id, organizationStateFor(state, item, regionalOpinion, state.date)]));
  return { ...politics, initializedOn: state.date, opinionProvenance: { status: 'modelled', method: 'cohort_interests_plus_orientation_prior', initializedOn: state.date, limitation: 'No polling anchor: fictional party support is initialized from socioeconomic cohort preferences.' }, countries, regionalOpinion, organizations };
}

/** Rebase old registry saves without reconstructing history or touching non-political branches. */
export function rebasePoliticsRegistry(state: SimulationState): SimulationState['politics'] {
  const regionalOpinion: Record<string, RegionalPoliticalOpinion> = {};
  for (const [regionId, regional] of Object.entries(state.politics.regionalOpinion).sort(([a], [b]) => a.localeCompare(b))) {
    const countryId = regional.countryId, parties = (politicalRegistry.countries[countryId]?.partyIds ?? []).map(id => politicalRegistry.parties[id]);
    regionalOpinion[regionId] = { ...regional, cohorts: Object.fromEntries(Object.entries(regional.cohorts).sort(([a], [b]) => a.localeCompare(b)).map(([cohortId, opinion]) => [cohortId, [opinion[0], opinion[1], supportFor(opinion[0], opinion[1], opinion[3], parties), opinion[3], opinion[4], opinion[5], opinion[6]] satisfies CohortPoliticalOpinion])) };
  }
  const countries = Object.fromEntries(Object.entries(state.politics.countries).sort(([a], [b]) => a.localeCompare(b)).map(([countryId, country]) => [countryId, { ...country, nationalSupportBps: aggregateNationalSupport(state, country.regionIds, regionalOpinion, politicalRegistry.countries[countryId]?.partyIds.length ?? 0) }]));
  const organizations = Object.fromEntries(Object.values(politicalRegistry.organizations).filter(item => countries[item.countryId]).map(item => [item.id, organizationStateFor(state, item, regionalOpinion, state.date)]));
  return { ...state.politics, registryVersion: POLITICS_MODEL.registryVersion, countries, regionalOpinion, organizations };
}
