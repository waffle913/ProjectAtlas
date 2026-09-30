import type { SimulationInvariant } from '../invariants';
import { IDEOLOGY_DIMENSIONS, POLITICAL_ISSUES, POLITICS_MODEL, type PoliticalProvenance } from './model';

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const bounded = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 10_000;
const finiteTree = (value: unknown): boolean => typeof value === 'number' ? Number.isFinite(value) : value === null || typeof value !== 'object' ? true : Object.values(value).every(finiteTree);
const provenanceErrors = (item: PoliticalProvenance, initializedOn: string, label: string) => {
  const errors: string[] = [];
  if (!['sourced', 'partial', 'modelled', 'unavailable'].includes(item.status) || !item.source || !item.limitation || !validDate(item.referenceDate) || !validDate(item.retrievedAt)) errors.push(`Malformed political provenance for ${label}.`);
  if (item.referenceDate > initializedOn || item.effectiveDate && item.effectiveDate > initializedOn) errors.push(`Future-dated political evidence for ${label}.`);
  return errors;
};

export const politicsInvariant: SimulationInvariant = {
  id: 'national-politics',
  check: (state, context) => {
    const politics = state.politics, errors: string[] = [], globalIds = new Set<string>();
    if (!politics || politics.version !== POLITICS_MODEL.version || !Number.isSafeInteger(politics.weeklyEvaluations) || politics.weeklyEvaluations < 0) return ['Malformed politics state.'];
    if (!politics.initializedOn) return Object.keys(politics.countries).length ? ['Politics state lacks initialization date.'] : [];
    if (!validDate(politics.initializedOn) || politics.initializedOn > state.date || politics.lastOpinionUpdate && (!validDate(politics.lastOpinionUpdate) || politics.lastOpinionUpdate > state.date)) errors.push('Invalid politics state dates.');
    for (const countryId of context.countryIds) if (!politics.countries[countryId]) errors.push(`Missing politics state for Country ${countryId}.`);
    for (const [countryId, country] of Object.entries(politics.countries)) {
      if (!context.countryIds.has(countryId) || country.countryId !== countryId) errors.push(`Politics references unknown Country ${countryId}.`);
      const institution = politics.institutions[country.institutionId];
      if (!institution || institution.countryId !== countryId) errors.push(`Invalid institution reference for ${countryId}.`);
      else {
        if (globalIds.has(institution.id)) errors.push(`Duplicate political ID ${institution.id}.`); globalIds.add(institution.id);
        errors.push(...provenanceErrors(institution.provenance, politics.initializedOn, institution.id));
        const chamberIds = new Set<string>();
        for (const chamber of institution.chambers) {
          if (chamber.countryId !== countryId || chamberIds.has(chamber.id) || globalIds.has(chamber.id)) errors.push(`Invalid chamber identity ${chamber.id}.`);
          chamberIds.add(chamber.id); globalIds.add(chamber.id);
          errors.push(...provenanceErrors(chamber.provenance, politics.initializedOn, chamber.id), ...provenanceErrors(chamber.electoralRule.provenance, politics.initializedOn, `${chamber.id}:electoral-rule`));
          if (chamber.totalSeats === undefined) {
            if (Object.keys(chamber.seatsByParty).length || chamber.independentOtherSeats !== undefined) errors.push(`Unavailable seat total must not contain an allocation for ${chamber.id}.`);
          } else {
            const allocated = Object.values(chamber.seatsByParty).reduce((sum, seats) => sum + seats, 0) + (chamber.independentOtherSeats ?? 0);
            if (!Number.isSafeInteger(chamber.totalSeats) || chamber.totalSeats < 0 || Object.values(chamber.seatsByParty).some(seats => !Number.isSafeInteger(seats) || seats < 0) || allocated !== chamber.totalSeats) errors.push(`Seat allocation does not reconcile for ${chamber.id}.`);
          }
          for (const partyId of Object.keys(chamber.seatsByParty)) if (!country.partyIds.includes(partyId)) errors.push(`Chamber ${chamber.id} references an unknown Country party ${partyId}.`);
        }
        if (institution.governingPartyIds.some(id => !country.partyIds.includes(id))) errors.push(`Coalition references an unknown party for ${countryId}.`);
      }
      const supportKeys = [...country.partyIds, 'undecided'].sort();
      if (Object.keys(country.nationalSupportBps).sort().join('|') !== supportKeys.join('|') || Object.values(country.nationalSupportBps).reduce((sum, value) => sum + value, 0) !== 10_000 || Object.values(country.nationalSupportBps).some(value => !bounded(value))) errors.push(`National support does not sum to 10000 for ${countryId}.`);
      for (const partyId of country.partyIds) {
        const party = politics.partyRegistry[partyId];
        if (!party || party.countryId !== countryId || party.fictional !== true || globalIds.has(partyId)) { errors.push(`Invalid fictional party ${partyId}.`); continue; }
        globalIds.add(partyId); errors.push(...provenanceErrors(party.provenance, politics.initializedOn, partyId));
        if (party.currentSeats !== null && (!Number.isSafeInteger(party.currentSeats) || party.currentSeats < 0)) errors.push(`Invalid seat count for ${partyId}.`);
        if (IDEOLOGY_DIMENSIONS.some(key => !bounded(party.ideology[key])) || POLITICAL_ISSUES.some(issue => !bounded(party.issuePositions[issue]?.preferenceBps) || !bounded(party.issuePositions[issue]?.intensityBps) || !bounded(party.issuePositions[issue]?.confidenceBps))) errors.push(`Invalid ideological values for ${partyId}.`);
        for (const issue of POLITICAL_ISSUES) if (party.issuePositions[issue]) errors.push(...provenanceErrors(party.issuePositions[issue].provenance, politics.initializedOn, `${partyId}:${issue}`));
      }
      for (const organizationId of country.organizationIds) {
        const organization = politics.organizationRegistry[organizationId];
        if (!organization || organization.countryId !== countryId || organization.fictional !== true || globalIds.has(organizationId)) { errors.push(`Invalid political organization ${organizationId}.`); continue; }
        globalIds.add(organizationId); errors.push(...provenanceErrors(organization.provenance, politics.initializedOn, organizationId));
        if (Object.values(organization.currentPositions).some(value => value !== undefined && !bounded(value))) errors.push(`Invalid organization position for ${organizationId}.`);
      }
      for (const regionId of country.regionIds) {
        const regional = politics.regionalOpinion[regionId];
        if (!context.regionIds.has(regionId) || !regional || regional.countryId !== countryId) { errors.push(`Invalid political Region ${regionId}.`); continue; }
        if (Object.keys(regional.aggregateSupportBps).sort().join('|') !== supportKeys.join('|') || Object.values(regional.aggregateSupportBps).reduce((sum, value) => sum + value, 0) !== 10_000) errors.push(`Regional support does not sum to 10000 for ${regionId}.`);
        for (const opinion of Object.values(regional.cohorts)) {
          if (!Number.isSafeInteger(opinion.persons) || opinion.persons <= 0 || Object.keys(opinion.partySupportBps).sort().join('|') !== supportKeys.join('|') || Object.values(opinion.partySupportBps).reduce((sum, value) => sum + value, 0) !== 10_000 || Object.values(opinion.partySupportBps).some(value => !bounded(value))) errors.push(`Invalid cohort support for ${regionId}:${opinion.cohortId}.`);
          if (POLITICAL_ISSUES.some(issue => !bounded(opinion.issuePreferencesBps[issue]) || !bounded(opinion.issueSalienceBps[issue])) || !bounded(opinion.engagementBps) || !Number.isSafeInteger(opinion.materialSentimentBps) || Math.abs(opinion.materialSentimentBps) > 10_000) errors.push(`Invalid cohort opinion values for ${regionId}:${opinion.cohortId}.`);
        }
      }
    }
    for (const [id, institution] of Object.entries(politics.institutions)) if (!politics.countries[institution.countryId]?.institutionId || politics.countries[institution.countryId].institutionId !== id) errors.push(`Unreferenced institution ${id}.`);
    for (const [id, party] of Object.entries(politics.partyRegistry)) if (!politics.countries[party.countryId]?.partyIds.includes(id)) errors.push(`Unreferenced party ${id}.`);
    for (const [id, organization] of Object.entries(politics.organizationRegistry)) if (!politics.countries[organization.countryId]?.organizationIds.includes(id)) errors.push(`Unreferenced organization ${id}.`);
    for (const regionId of Object.keys(politics.regionalOpinion)) if (!context.regionIds.has(regionId)) errors.push(`Political opinion references unknown Region ${regionId}.`);
    if (!finiteTree(politics)) errors.push('Politics state contains a non-finite numeric value.');
    return errors;
  },
};
