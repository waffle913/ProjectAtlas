import type { SimulationInvariant } from '../invariants';
import { IDEOLOGY_DIMENSIONS, POLITICAL_ISSUES, POLITICS_MODEL, type PoliticalProvenance, type PoliticalRegistry } from './model';
import { politicalRegistry } from './registry';
import { isSimulationDate as validDate } from '../date';
import { aggregateNationalSupport } from './aggregation';
const bounded = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 10_000;
const provenanceErrors = (item: PoliticalProvenance, label: string, registry: PoliticalRegistry) => !['sourced', 'partial', 'modelled', 'modelled_fallback', 'unavailable', 'not_applicable'].includes(item.status) || !item.source || !item.limitation || !validDate(item.referenceDate) || !validDate(item.retrievedAt) || (item.effectiveDate !== undefined && !validDate(item.effectiveDate)) ? [`Malformed political provenance for ${label}.`] : item.referenceDate > registry.referenceDate || (item.effectiveDate !== undefined && item.effectiveDate > registry.referenceDate) ? [`Future-dated political evidence for ${label}.`] : [];

export const validatePoliticalRegistry = (registry: PoliticalRegistry = politicalRegistry) => {
  const errors: string[] = [], ids = new Set<string>();
  const expectedIdeologySources: Record<typeof IDEOLOGY_DIMENSIONS[number], string[]> = { fiscal_redistribution: ['v2pariglef'], market_intervention: ['v2pariglef'], public_services: [], labour_protection: [], social_progressivism: ['v2palgbt', 'v2paminor', 'v2pawomlab'], migration_openness: ['v2paimmig'], national_integration: [], decentralization: [], civil_liberties: ['v2paplur'] };
  if (registry.version !== POLITICS_MODEL.registryVersion || registry.referenceDate !== '2026-01-01') errors.push('Malformed political registry header.');
  for (const [countryId, country] of Object.entries(registry.countries)) {
    const institution = registry.institutions[country.institutionId]; if (!institution || institution.countryId !== countryId) { errors.push(`Invalid institution reference for ${countryId}.`); continue; }
    errors.push(...provenanceErrors(institution.provenance, institution.id, registry), ...provenanceErrors(institution.executiveSystemProvenance, `${institution.id}:executive`, registry));
    for (const chamber of institution.chambers) {
      if (ids.has(chamber.id) || chamber.countryId !== countryId) errors.push(`Invalid chamber identity ${chamber.id}.`); ids.add(chamber.id);
      errors.push(...provenanceErrors(chamber.provenance, chamber.id, registry), ...provenanceErrors(chamber.electoralRule.provenance, `${chamber.id}:rule`, registry));
      if (chamber.seatAllocationStatus === 'sourced') { const allocated = Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0) + (chamber.independentOtherSeats ?? 0); if (chamber.totalSeats === undefined || allocated !== chamber.totalSeats) errors.push(`Seat allocation does not reconcile for ${chamber.id}.`); }
      else if (Object.keys(chamber.seatsByParty).length || chamber.independentOtherSeats !== undefined) errors.push(`Unavailable allocation contains seats for ${chamber.id}.`);
      for (const partyId of Object.keys(chamber.seatsByParty)) if (!country.partyIds.includes(partyId)) errors.push(`Unknown party ${partyId} in ${chamber.id}.`);
    }
    for (const partyId of country.partyIds) { const party = registry.parties[partyId]; if (!party || party.countryId !== countryId || !party.fictional || ids.has(partyId)) { errors.push(`Invalid fictional party ${partyId}.`); continue; } ids.add(partyId); errors.push(...provenanceErrors(party.provenance, partyId, registry)); const basis = party.ideologicalBasis, sourced = ['sourced', 'partial'].includes(basis.status), sourcedBasisMalformed = sourced && (!basis.source || !basis.sourceUrl || !basis.referenceDate || !basis.effectiveDate || !basis.sourcePartyIdentity || !basis.sourceIdeologicalLabels || !validDate(basis.referenceDate) || !validDate(basis.effectiveDate) || basis.referenceDate > registry.referenceDate || basis.effectiveDate > registry.referenceDate || basis.temporalStatus !== 'historical_prior' || !bounded(basis.measurementConfidenceBps ?? -1) || !bounded(basis.temporalApplicabilityConfidenceBps ?? -1) || basis.confidenceBps !== basis.temporalApplicabilityConfidenceBps); const fallbackMalformed = !sourced && (basis.status !== 'modelled_fallback' || basis.temporalStatus !== 'unavailable' || basis.confidenceBps !== 500 || !basis.limitation); const mappingsMalformed = sourced && IDEOLOGY_DIMENSIONS.some(key => { const mapping = basis.dimensionMappings?.[key], expected = expectedIdeologySources[key]; return !mapping || !bounded(mapping.confidenceBps) || !mapping.limitation || mapping.status !== (expected.length ? 'historical_prior' : 'modelled_neutral') || JSON.stringify(mapping.sourceVariables) !== JSON.stringify(expected) || !expected.length && party.ideology[key] !== 5_000; }); if (IDEOLOGY_DIMENSIONS.some(key => !bounded(party.ideology[key]) || !sourced && party.ideology[key] !== 5_000) || POLITICAL_ISSUES.some(issue => !bounded(party.issuePositions[issue]?.preferenceBps) || !bounded(party.issuePositions[issue]?.intensityBps) || !bounded(party.issuePositions[issue]?.confidenceBps)) || !bounded(basis.confidenceBps) || !['historical_prior', 'unavailable'].includes(basis.temporalStatus) || sourcedBasisMalformed || fallbackMalformed || mappingsMalformed || party.currentSeats !== null && (!Number.isSafeInteger(party.currentSeats) || party.currentSeats < 0)) errors.push(`Invalid party profile ${partyId}.`); }
    for (const organizationId of country.organizationIds) { const organization = registry.organizations[organizationId]; if (!organization || organization.countryId !== countryId || !organization.fictional || ids.has(organizationId)) errors.push(`Invalid fictional organization ${organizationId}.`); else { ids.add(organizationId); errors.push(...provenanceErrors(organization.provenance, organizationId, registry)); } }
  }
  return errors;
};
const registryInvariantErrors = validatePoliticalRegistry();

export const politicsInvariant: SimulationInvariant = { id: 'national-politics', check: (state, context) => {
  const politics = state.politics, errors: string[] = [...registryInvariantErrors];
  if (!politics || politics.version !== POLITICS_MODEL.version || politics.registryVersion !== politicalRegistry.version || !Number.isSafeInteger(politics.weeklyEvaluations) || politics.weeklyEvaluations < 0) return ['Malformed politics state.'];
  if (!politics.initializedOn) return Object.keys(politics.countries).length ? ['Politics state lacks initialization date.'] : [];
  if (!validDate(politics.initializedOn) || politics.initializedOn > state.date || politics.lastOpinionUpdate && (!validDate(politics.lastOpinionUpdate) || politics.lastOpinionUpdate > state.date)) errors.push('Invalid politics state dates.');
  for (const [regionId, socio] of Object.entries(state.socioeconomy.regions)) {
    const regional = politics.regionalOpinion[regionId];
    if (state.regionOwnership[regionId] !== undefined && !regional) { errors.push(`Missing political Region ${regionId}.`); continue; }
    if (!regional) continue;
    const expected = new Set(socio.cohorts.filter(cohort => cohort.persons > 0).map(cohort => `${cohort.income}:${cohort.orientation}`));
    if (regional.regionId !== regionId || Object.keys(regional.cohorts).length !== expected.size
      || Object.keys(regional.cohorts).some(id => !expected.has(id)) || [...expected].some(id => !Object.hasOwn(regional.cohorts, id))) errors.push(`Political cohort coverage does not reconcile for ${regionId}.`);
  }
  for (const countryId of context.countryIds) if (!politics.countries[countryId]) errors.push(`Missing politics state for Country ${countryId}.`);
  for (const [countryId, country] of Object.entries(politics.countries)) {
    const partyCount = politicalRegistry.countries[countryId]?.partyIds.length ?? 0;
    const before = errors.length;
    if (!context.countryIds.has(countryId) || country.countryId !== countryId) errors.push(`Politics references unknown Country ${countryId}.`);
    if (new Set(country.regionIds).size !== country.regionIds.length) errors.push(`Duplicate political Region assignment for ${countryId}.`);
    if (country.recentOpinionDrivers.length > POLITICS_MODEL.historyLimit || country.recentOpinionDrivers.some(item => !validDate(item.date) || item.date > state.date
      || !Array.isArray(item.drivers) || new Set(item.drivers).size !== item.drivers.length || item.drivers.some(index => !Number.isSafeInteger(index) || index < 0 || index >= POLITICAL_ISSUES.length))) errors.push(`Invalid recent opinion drivers for ${countryId}.`);
    if (country.nationalSupportBps.length !== partyCount + 1 || country.nationalSupportBps.reduce((a, b) => a + b, 0) !== 10_000 || country.nationalSupportBps.some(value => !bounded(value))) errors.push(`National support does not sum to 10000 for ${countryId}.`);
    for (const regionId of country.regionIds) { const region = politics.regionalOpinion[regionId]; if (!context.regionIds.has(regionId) || !region || region.countryId !== countryId) { errors.push(`Invalid political Region ${regionId}.`); continue; } for (const [cohortId, opinion] of Object.entries(region.cohorts)) { if (opinion.length !== 7 || opinion[0].length !== POLITICAL_ISSUES.length || opinion[1].length !== POLITICAL_ISSUES.length || opinion[2].length !== partyCount + 1 || opinion[2].reduce((a, b) => a + b, 0) !== 10_000 || [...opinion[0], ...opinion[1], ...opinion[2], opinion[3]].some(value => !bounded(value)) || !Number.isSafeInteger(opinion[4]) || Math.abs(opinion[4]) > 10_000 || !Number.isSafeInteger(opinion[5]) || opinion[5] < 0 || new Set(opinion[6]).size !== opinion[6].length || opinion[6].some(index => !Number.isSafeInteger(index) || index < 0 || index >= POLITICAL_ISSUES.length)) errors.push(`Invalid cohort opinion values for ${regionId}:${cohortId}.`); } }
    if (errors.length === before && JSON.stringify(country.nationalSupportBps) !== JSON.stringify(aggregateNationalSupport(state, country.regionIds, politics.regionalOpinion, partyCount))) errors.push(`National support disagrees with regional cohorts for ${countryId}.`);
  }
  for (const [regionId, region] of Object.entries(politics.regionalOpinion)) if (!context.regionIds.has(regionId) || !state.socioeconomy.regions[regionId] || !politics.countries[region.countryId]?.regionIds.includes(regionId)) errors.push(`Unlinked political Region ${regionId}.`);
  const expectedOrganizations = Object.values(politicalRegistry.organizations).filter(item => context.countryIds.has(item.countryId));
  for (const organization of expectedOrganizations) { const dynamic = politics.organizations[organization.id]; if (!dynamic || dynamic.organizationId !== organization.id || !validDate(dynamic.lastUpdatedOn) || dynamic.lastUpdatedOn > state.date || POLITICAL_ISSUES.some(issue => !bounded(dynamic.currentPositions[issue])) || dynamic.recentDrivers.length > POLITICS_MODEL.historyLimit || dynamic.recentDrivers.some(item => !validDate(item.date) || item.date > state.date || item.issues.some(issue => !POLITICAL_ISSUES.includes(issue)))) errors.push(`Invalid dynamic organization ${organization.id}.`); }
  for (const [organizationId, organization] of Object.entries(politics.organizations)) {
    if (!['active', 'dissolved', 'banned'].includes(organization.status)) errors.push(`Organization ${organizationId} has an invalid status.`);
    if (organization.fundsUsd !== undefined && (!Number.isSafeInteger(organization.fundsUsd) || organization.fundsUsd < 0)) errors.push(`Organization ${organizationId} has invalid funds.`);
    for (const [personId, membership] of Object.entries(organization.members ?? {})) if (membership.personId !== personId || !['member', 'leader'].includes(membership.role)) errors.push(`Organization ${organizationId} has an invalid membership ${personId}.`);
    for (const banEvent of organization.banEvents ?? []) if (!validDate(banEvent.date) || banEvent.date > state.date || !banEvent.actorPersonId?.trim() || !banEvent.motive?.trim() || !banEvent.evidence?.trim()) errors.push(`Organization ${organizationId} has an invalid ban event.`);
    for (const current of Object.values(organization.internalCurrents ?? {})) if (!current.id?.trim() || !current.name?.trim() || !Number.isSafeInteger(current.salienceBps)) errors.push(`Organization ${organizationId} has an invalid internal current.`);
  }
  return errors;
} };
