import type { PoliticalOfficesData } from '../../data/countryData';
import type { RegionEntity, SimulationState } from '../../types';
import { allocate, INCOMES, type SocioRegion } from '../socioeconomy/model';
import type { RegionFiscal } from '../fiscal/model';
import { emptyPolitics, POLITICAL_ISSUES, POLITICS_MODEL, type CohortPoliticalOpinion, type PoliticalIssue, type PoliticalParty, type RegionalPoliticalOpinion } from './model';
import { politicalRegistry } from './registry';

// Retained for call-site compatibility. Static politics now comes from the pinned registry.
export interface PoliticalInitializationData { countries?: readonly { id: string; entityType: string }[]; offices?: PoliticalOfficesData }
export interface CurrentPoliticalExperience { disposableIncomePerPerson: number; unemploymentBps: number; basicNeedsCoverageBps: number | null; taxBurdenBps: number | null; serviceCoverageBps: number | null }
const safeRatioBps = (value: number, denominator: number) => denominator > 0 ? Math.min(10_000, Math.round(value * 10_000 / denominator)) : null;
export function politicalExperienceFor(region: SocioRegion, income: typeof INCOMES[number], countryServices: number | null, fiscal?: RegionFiscal): CurrentPoliticalExperience {
  const index = INCOMES.indexOf(income), persons = region.cohorts.filter(item => item.income === income).reduce((n, item) => n + item.persons, 0);
  const disposable = fiscal?.disposable[index] ?? region.economy?.incomeByGroup[index] ?? 0, gross = fiscal?.grossIncome[index] ?? region.economy?.incomeByGroup[index] ?? 0;
  const taxes = (fiscal?.personal[index] ?? 0) + (fiscal?.employee[index] ?? 0);
  return { disposableIncomePerPerson: persons ? Math.floor(disposable / persons) : 0, unemploymentBps: region.economy ? safeRatioBps(region.economy.unemployed, region.economy.labourForce) ?? 0 : 0, basicNeedsCoverageBps: region.economy?.basicNeedsCoverageBps ?? null, taxBurdenBps: safeRatioBps(taxes, gross), serviceCoverageBps: countryServices };
}
const clamp = (value: number) => Math.max(0, Math.min(10_000, Math.round(value)));
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
const aggregate = (state: SimulationState, regionIds: string[], regionOpinions: Record<string, RegionalPoliticalOpinion>, partyCount: number) => {
  const weights = Array(partyCount + 1).fill(0); let persons = 0;
  for (const regionId of regionIds) for (const [cohortId, opinion] of Object.entries(regionOpinions[regionId]?.cohorts ?? {})) {
    const cohortPersons = state.socioeconomy.regions[regionId]?.cohorts.find(item => `${item.income}:${item.orientation}` === cohortId)?.persons ?? 0; persons += cohortPersons;
    opinion[2].forEach((value, index) => { weights[index] += value * cohortPersons; });
  }
  return allocate(10_000, persons ? weights : weights.map((_, index) => index === partyCount ? 1 : 0));
};
const publicServiceCoverage = (state: SimulationState, countryId: string) => {
  const services = state.fiscal.countries[countryId]?.services; if (!services) return null;
  const values = [services.health.coverageBps, services.education.coverageBps].filter((value): value is number => value !== null);
  return values.length ? Math.floor(values.reduce((a, b) => a + b, 0) / values.length) : null;
};

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
    countries[countryId] = { countryId, regionIds, nationalSupportBps: aggregate(state, regionIds, regionalOpinion, partyIds.length), recentOpinionDrivers: [] };
  }
  return { ...politics, initializedOn: state.date, opinionProvenance: { status: 'modelled', method: 'cohort_interests_plus_orientation_prior', initializedOn: state.date, limitation: 'No polling anchor: fictional party support is initialized from socioeconomic cohort preferences.' }, countries, regionalOpinion };
}
