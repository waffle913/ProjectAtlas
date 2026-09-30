import type { PoliticalOfficesData } from '../../data/countryData';
import type { RegionEntity, SimulationState } from '../../types';
import { allocate, INCOMES, type SocioRegion } from '../socioeconomy/model';
import type { RegionFiscal } from '../fiscal/model';
import { emptyPolitics, IDEOLOGY_DIMENSIONS, POLITICAL_ISSUES, POLITICS_MODEL, type CohortPoliticalOpinion, type IdeologyDimension, type IssuePosition, type MaterialExperience, type PoliticalCoverage, type PoliticalIssue, type PoliticalParty, type PoliticalProvenance, type RegionalPoliticalOpinion } from './model';

export interface PoliticalInitializationData { countries?: readonly { id: string; entityType: string }[]; offices?: PoliticalOfficesData }
const modelled = (date: string, limitation: string): PoliticalProvenance => ({ status: 'modelled', referenceDate: date, retrievedAt: date, source: POLITICS_MODEL.version, limitation });
const unavailable = (date: string, limitation: string): PoliticalProvenance => ({ status: 'unavailable', referenceDate: date, retrievedAt: date, source: 'ProjectAtlas coverage audit', limitation });
const partyKeys = ['social_compact', 'civic_centre', 'national_stewardship'] as const;
const partyNames = ['Social Compact', 'Civic Centre', 'National Stewardship'] as const;
const issueProfiles: Array<Record<PoliticalIssue, number>> = [
  { fiscal_distribution: 8_000, public_services: 8_500, labour_protection: 8_500, income_security: 8_500, infrastructure: 6_500, public_order: 4_000 },
  { fiscal_distribution: 5_000, public_services: 6_000, labour_protection: 5_000, income_security: 5_500, infrastructure: 7_000, public_order: 6_000 },
  { fiscal_distribution: 2_500, public_services: 4_000, labour_protection: 3_000, income_security: 3_500, infrastructure: 7_500, public_order: 8_500 },
];
const ideologyProfiles: Array<Record<IdeologyDimension, number>> = [
  { fiscal_redistribution: 8_000, market_intervention: 7_500, public_services: 8_500, labour_protection: 8_500, social_progressivism: 7_500, migration_openness: 6_500, national_integration: 5_500, decentralization: 5_500, civil_liberties: 7_000 },
  { fiscal_redistribution: 5_000, market_intervention: 5_000, public_services: 6_000, labour_protection: 5_000, social_progressivism: 5_500, migration_openness: 5_500, national_integration: 5_500, decentralization: 5_000, civil_liberties: 6_000 },
  { fiscal_redistribution: 2_500, market_intervention: 3_500, public_services: 4_000, labour_protection: 3_000, social_progressivism: 3_000, migration_openness: 2_500, national_integration: 8_000, decentralization: 4_000, civil_liberties: 3_500 },
];

const partyId = (countryId: string, key: typeof partyKeys[number]) => `party:${countryId}:${key}`;
const organizationId = (countryId: string, type: 'union' | 'association') => `organization:${countryId}:${type === 'union' ? 'workers_federation' : 'civic_services_association'}`;
const safeRatioBps = (value: number, denominator: number) => denominator > 0 ? Math.min(10_000, Math.round(value * 10_000 / denominator)) : null;

export function politicalExperienceFor(region: SocioRegion, income: typeof INCOMES[number], countryServices: number | null, fiscal?: RegionFiscal): MaterialExperience {
  const index = INCOMES.indexOf(income), persons = region.cohorts.filter(item => item.income === income).reduce((n, item) => n + item.persons, 0);
  const disposable = fiscal?.disposable[index] ?? region.economy?.incomeByGroup[index] ?? 0;
  const gross = fiscal?.grossIncome[index] ?? region.economy?.incomeByGroup[index] ?? 0;
  const taxes = (fiscal?.personal[index] ?? 0) + (fiscal?.employee[index] ?? 0);
  return {
    disposableIncomePerPerson: persons ? Math.floor(disposable / persons) : 0,
    baselineDisposableIncomePerPerson: persons ? Math.floor(disposable / persons) : 0,
    unemploymentBps: region.economy ? safeRatioBps(region.economy.unemployed, region.economy.labourForce) ?? 0 : 0,
    basicNeedsCoverageBps: region.economy ? region.economy.basicNeedsCoverageBps : null,
    taxBurdenBps: safeRatioBps(taxes, gross), transferIncomePerPerson: persons ? Math.floor((fiscal?.transfers[index] ?? 0) / persons) : 0, serviceCoverageBps: countryServices,
  };
}

function initialPreferences(income: CohortPoliticalOpinion['income'], orientation: CohortPoliticalOpinion['orientation']) {
  const lean = orientation === 'left' ? 7_500 : orientation === 'right' ? 3_000 : 5_000;
  const need = income === 'low' ? 1_000 : income === 'high' ? -750 : 0;
  return {
    fiscal_distribution: Math.max(0, Math.min(10_000, lean + need)), public_services: Math.max(0, Math.min(10_000, lean + need)),
    labour_protection: Math.max(0, Math.min(10_000, lean + need)), income_security: Math.max(0, Math.min(10_000, lean + need)),
    infrastructure: orientation === 'centre' ? 7_000 : 6_500, public_order: orientation === 'right' ? 8_000 : orientation === 'left' ? 4_000 : 6_000,
  } satisfies Record<PoliticalIssue, number>;
}
function initialSupport(countryId: string, income: CohortPoliticalOpinion['income'], orientation: CohortPoliticalOpinion['orientation']) {
  const weights = orientation === 'left' ? [6_500, 2_500, 500] : orientation === 'right' ? [500, 2_500, 6_500] : [1_800, 5_400, 1_800];
  if (income === 'low') { weights[0] += 400; weights[1] = Math.max(0, weights[1] - 400); }
  if (income === 'high') { weights[2] += 400; weights[1] = Math.max(0, weights[1] - 400); }
  const distributed = allocate(10_000, [...weights, POLITICS_MODEL.baseUndecidedBps[orientation]]);
  return Object.fromEntries([...partyKeys.map((key, index) => [partyId(countryId, key), distributed[index]]), ['undecided', distributed[3]]]);
}
function aggregateSupport(opinions: Iterable<CohortPoliticalOpinion>, keys: string[]) {
  const values = Object.fromEntries(keys.map(key => [key, 0])); let persons = 0;
  for (const opinion of opinions) { persons += opinion.persons; for (const key of keys) values[key] += opinion.partySupportBps[key] * opinion.persons; }
  const exact = allocate(10_000, persons ? keys.map(key => values[key]) : keys.map(key => key === 'undecided' ? 1 : 0));
  return Object.fromEntries(keys.map((key, index) => [key, exact[index]]));
}

export function initializePolitics(state: SimulationState, countryIds: Iterable<string>, regions: readonly RegionEntity[], data?: PoliticalInitializationData): SimulationState['politics'] {
  if (state.politics.initializedOn) return state.politics;
  const ids = [...countryIds].sort(), profiles = new Map(data?.countries?.map(item => [item.id, item]));
  const officesByCountry = new Map<string, Set<string>>();
  if (data?.offices && data.offices.referenceDate <= state.date) for (const office of data.offices.offices) {
    const kinds = officesByCountry.get(office.countryId) ?? new Set<string>(); kinds.add(office.kind); officesByCountry.set(office.countryId, kinds);
  }
  const politics = emptyPolitics(), partyRegistry = { ...politics.partyRegistry }, organizationRegistry = { ...politics.organizationRegistry }, institutions = { ...politics.institutions };
  const countries = { ...politics.countries }, regionalOpinion: Record<string, RegionalPoliticalOpinion> = {};
  for (const countryId of ids) {
    const profile = profiles.get(countryId), officeKinds = officesByCountry.get(countryId), hasOfficeStructure = officeKinds?.has('head_of_state') && officeKinds.has('head_of_government');
    const institutionalStatus: PoliticalCoverage = hasOfficeStructure ? 'partial' : 'unavailable';
    const institutionProvenance: PoliticalProvenance = hasOfficeStructure ? {
      status: 'partial', referenceDate: data!.offices!.referenceDate, retrievedAt: '2026-09-26', source: 'ProjectAtlas political office registry',
      sourceUrl: 'https://query.wikidata.org/', limitation: 'Head-of-state/government office structure is dated 2026-01-01; executive type, legislature, electoral rules, seats and coalition are not established by this source.',
    } : unavailable(state.date, `No admissible national institutional snapshot for ${profile?.entityType ?? 'unknown entity type'} at initialization date.`);
    const institutionId = `institution:${countryId}:national`;
    institutions[institutionId] = { id: institutionId, countryId, executiveSystem: 'unavailable', legislatureKind: 'unavailable', chambers: [], governingPartyIds: [], confidenceArrangement: 'unavailable', electionProcess: 'unavailable', provenance: institutionProvenance };
    const partyIds = partyKeys.map(key => partyId(countryId, key));
    partyIds.forEach((id, index) => {
      const provenance = modelled(state.date, 'Fictional analytical party archetype. It is not a real party, electoral observation, logo, slogan or claim about national party strength.');
      partyRegistry[id] = { id, countryId, displayName: partyNames[index], fictional: true, provenance,
        ideology: Object.fromEntries(IDEOLOGY_DIMENSIONS.map(key => [key, ideologyProfiles[index][key]])) as Record<IdeologyDimension, number>,
        issuePositions: Object.fromEntries(POLITICAL_ISSUES.map(issueId => [issueId, { issueId, preferenceBps: issueProfiles[index][issueId], intensityBps: 7_000, confidenceBps: 5_000, materialInterests: index === 0 ? ['lower_income', 'workers', 'service_users'] : index === 1 ? ['mixed_income', 'institutional_continuity'] : ['higher_income', 'owners', 'public_order'], ideologicalPrior: partyNames[index], provenance } satisfies IssuePosition])) as Record<PoliticalIssue, IssuePosition>,
        constituencies: index === 0 ? ['lower_income', 'workers'] : index === 1 ? ['middle_income', 'mixed_interests'] : ['higher_income', 'owners'], currentSeats: null, nationalSupportBps: 0, regionalSupportBps: {}, governmentStatus: 'unavailable' };
    });
    const organizationIds = [organizationId(countryId, 'union'), organizationId(countryId, 'association')];
    organizationRegistry[organizationIds[0]] = { id: organizationIds[0], countryId, type: 'union', displayName: 'Workers Federation', fictional: true, representedInterests: ['employment', 'wages', 'labour_protection'], representedCohorts: ['low', 'middle'], membership: { status: 'unavailable' }, issuePriorities: ['labour_protection', 'income_security'], currentPositions: { labour_protection: 8_500, income_security: 8_000 }, regionalPresenceBps: {}, provenance: modelled(state.date, 'Fictional organized-interest archetype; membership and real union landscape are unavailable.') };
    organizationRegistry[organizationIds[1]] = { id: organizationIds[1], countryId, type: 'association', displayName: 'Civic Services Association', fictional: true, representedInterests: ['health', 'education', 'infrastructure'], representedCohorts: ['low', 'middle', 'high'], membership: { status: 'unavailable' }, issuePriorities: ['public_services', 'infrastructure'], currentPositions: { public_services: 8_000, infrastructure: 7_500 }, regionalPresenceBps: {}, provenance: modelled(state.date, 'Fictional organized-interest archetype; membership and real association landscape are unavailable.') };
    const localRegions = regions.filter(region => state.regionOwnership[region.id] === countryId).map(region => region.id).sort();
    const supportKeys = [...partyIds, 'undecided'];
    for (const regionId of localRegions) {
      const socio = state.socioeconomy.regions[regionId]; if (!socio) continue;
      const serviceValues = Object.values(state.fiscal.countries[countryId]?.services ?? {}).map(service => service.coverageBps).filter((value): value is number => value !== null);
      const serviceCoverage = serviceValues.length ? Math.floor(serviceValues.reduce((a, b) => a + b, 0) / serviceValues.length) : null;
      const cohorts: Record<string, CohortPoliticalOpinion> = {};
      for (const cohort of socio.cohorts) {
        if (!cohort.persons) continue;
        const cohortId = `${cohort.income}:${cohort.orientation}`;
        cohorts[cohortId] = { cohortId, income: cohort.income, orientation: cohort.orientation, persons: cohort.persons,
          issuePreferencesBps: initialPreferences(cohort.income, cohort.orientation), issueSalienceBps: Object.fromEntries(POLITICAL_ISSUES.map(issue => [issue, 4_000])) as Record<PoliticalIssue, number>,
          partySupportBps: initialSupport(countryId, cohort.income, cohort.orientation), engagementBps: POLITICS_MODEL.baseEngagementBps[cohort.orientation], materialSentimentBps: 0,
          experience: politicalExperienceFor(socio, cohort.income, serviceCoverage, state.fiscal.regions[regionId]), recentMaterialDrivers: [], provenance: { status: 'modelled', method: 'cohort_interests_plus_orientation_prior', initializedOn: state.date, limitation: 'No admissible electoral or polling anchor; support and preferences are fictional model initialization, not observed public opinion.' } };
      }
      regionalOpinion[regionId] = { regionId, countryId, cohorts, aggregateSupportBps: aggregateSupport(Object.values(cohorts), supportKeys) };
    }
    const nationalSupportBps = aggregateSupport(localRegions.flatMap(regionId => Object.values(regionalOpinion[regionId]?.cohorts ?? {})), supportKeys);
    partyIds.forEach(id => { partyRegistry[id].nationalSupportBps = nationalSupportBps[id]; partyRegistry[id].regionalSupportBps = Object.fromEntries(localRegions.map(regionId => [regionId, regionalOpinion[regionId]?.aggregateSupportBps[id] ?? 0])); });
    countries[countryId] = { countryId, institutionId, partyIds, organizationIds, regionIds: localRegions, nationalSupportBps, recentOpinionDrivers: [], coverage: { institutions: institutionalStatus, legislature: 'unavailable', electoralSystem: 'unavailable', partyBasis: 'modelled', seats: 'unavailable', coalition: 'unavailable', organizedInterests: 'modelled', opinionAnchor: 'modelled' } };
  }
  return { ...politics, initializedOn: state.date, countries, institutions, partyRegistry, organizationRegistry, regionalOpinion };
}
