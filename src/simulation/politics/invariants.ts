import type { SimulationInvariant } from '../invariants';
import { IDEOLOGY_DIMENSIONS, POLITICAL_ISSUES, POLITICS_MODEL, type PoliticalIssue, type PoliticalProvenance, type PoliticalRegistry } from './model';
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
  if (!politics.religiousOrganizationsCoverage || !['unavailable', 'modelled'].includes(politics.religiousOrganizationsCoverage.status) || !politics.religiousOrganizationsCoverage.limitation?.trim()) errors.push('Religious organization coverage is malformed; religious support is a real system family with unavailable coverage when nothing is sourced.');
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
    // Status transitions reconcile with the recorded events: a dissolution trace implies the
    // organization is dissolved, and a ban trace whose last judgment is not a restore implies it
    // is banned — incoherent transitions are impossible by construction.
    if ((organization.dissolutionEvents ?? []).length > 0 && organization.status !== 'dissolved') errors.push(`Organization ${organizationId} has a dissolution trace while its status is ${organization.status}.`);
    if (organization.status !== 'banned' && (organization.banEvents ?? []).some(event => event.appealDecision === undefined)) errors.push(`Organization ${organizationId} has an unresolved ban event while its status is ${organization.status}.`);
    if (organization.status === 'banned' && !(organization.banEvents ?? []).some(event => event.appealDecision === undefined)) errors.push(`Organization ${organizationId} is banned without a pending ban event.`);
    if (organization.status === 'banned' && (organization.dissolutionEvents ?? []).length > 0) errors.push(`Organization ${organizationId} is banned and dissolved at once; the transitions are incoherent.`);
    if (organization.fundsUsd !== undefined && (!Number.isSafeInteger(organization.fundsUsd) || organization.fundsUsd < 0)) errors.push(`Organization ${organizationId} has invalid funds.`);
    if (organization.countryId !== undefined && !context.countryIds.has(organization.countryId)) errors.push(`Organization ${organizationId} has an invalid Country.`);
    if (organization.type !== undefined && !['union', 'association', 'party', 'religious'].includes(organization.type)) errors.push(`Organization ${organizationId} has an invalid type.`);
    if (organization.source !== undefined && !['registry', 'dynamic'].includes(organization.source)) errors.push(`Organization ${organizationId} has an invalid source.`);
    for (const [personId, membership] of Object.entries(organization.members ?? {})) {
      if (membership.personId !== personId || !['member', 'leader'].includes(membership.role)) errors.push(`Organization ${organizationId} has an invalid membership ${personId}.`);
      const person = state.governance.persons[personId];
      if (!person) errors.push(`Organization ${organizationId} membership ${personId} references an unknown person.`);
      // Party membership is one reality: person.partyId and the party's members never differ, and
      // the leadership role is synchronized with isPartyLeader.
      if (organization.type === 'party' && person) {
        if (person.partyId !== organizationId) errors.push(`Organization ${organizationId} membership ${personId} contradicts the person's canonical party (${person.partyId ?? 'none'}).`);
        if (membership.role === 'leader' && !person.isPartyLeader) errors.push(`Organization ${organizationId} leader ${personId} is not the canonical party leader.`);
        if (membership.role === 'member' && person.isPartyLeader) errors.push(`Organization ${organizationId} member ${personId} is the canonical party leader but not recorded as leader.`);
      }
    }
    if (organization.type === 'party') {
      for (const person of Object.values(state.governance.persons)) {
        if (person.partyId === organizationId && !organization.members?.[person.id]) errors.push(`Organization ${organizationId} misses the membership of canonical member ${person.id}.`);
      }
    }
    for (const banEvent of organization.banEvents ?? []) {
      if (!validDate(banEvent.date) || banEvent.date > state.date || !banEvent.actorPersonId?.trim() || !banEvent.motive?.trim() || !banEvent.evidence?.trim()) errors.push(`Organization ${organizationId} has an invalid ban event.`);
      if (!banEvent.legalBasis || !['constitutional_guarantee', 'ordinary_law', 'unavailable'].includes(banEvent.legalBasis.basis) || !banEvent.legalBasis.limitation?.trim()) errors.push(`Organization ${organizationId} has a ban event without a recorded rights basis.`);
      if (banEvent.appealedOn && !validDate(banEvent.appealedOn)) errors.push(`Organization ${organizationId} has an invalid appeal date.`);
      if (banEvent.appealedOn && !banEvent.appealByPersonId?.trim()) errors.push(`Organization ${organizationId} has an appeal without an identifiable appellant.`);
      if (banEvent.appealDecision !== undefined && !['restore', 'uphold'].includes(banEvent.appealDecision)) errors.push(`Organization ${organizationId} has an invalid appeal decision.`);
      if (banEvent.appealResolvedOn && !validDate(banEvent.appealResolvedOn)) errors.push(`Organization ${organizationId} has an invalid appeal resolution date.`);
    }
    for (const current of Object.values(organization.internalCurrents ?? {})) {
      if (!current.id?.trim() || !current.name?.trim() || !Number.isSafeInteger(current.salienceBps) || current.salienceBps < 0 || current.salienceBps > 10_000) errors.push(`Organization ${organizationId} has an invalid internal current.`);
      if (current.issuePositions !== undefined && (typeof current.issuePositions !== 'object' || Object.entries(current.issuePositions).some(([issue, value]) => !POLITICAL_ISSUES.includes(issue as PoliticalIssue) || !Number.isSafeInteger(value) || value < 0 || value > 10_000))) errors.push(`Organization ${organizationId} has an invalid internal-current issue position.`);
    }
    for (const claim of organization.claims ?? []) {
      if (!claim.id?.trim() || !validDate(claim.madeOn) || claim.madeOn > state.date || !POLITICAL_ISSUES.includes(claim.issue) || !Number.isSafeInteger(claim.targetBps) || claim.targetBps < 0 || claim.targetBps > 10_000 || !claim.rationale?.trim() || !['pending', 'settled'].includes(claim.status)) errors.push(`Organization ${organizationId} has an invalid union claim.`);
      if (claim.settlement !== undefined && (!validDate(claim.settlement.on) || claim.settlement.on > state.date || !claim.settlement.byPersonId?.trim() || !['accepted', 'rejected'].includes(claim.settlement.outcome) || (claim.settlement.outcome === 'accepted' && (claim.settlement.agreedBps === undefined || !Number.isSafeInteger(claim.settlement.agreedBps) || claim.settlement.agreedBps < 0 || claim.settlement.agreedBps > 10_000)))) errors.push(`Organization ${organizationId} has an invalid union claim settlement.`);
    }
    for (const dissolution of organization.dissolutionEvents ?? []) {
      if (!validDate(dissolution.date) || dissolution.date > state.date || !dissolution.actorPersonId?.trim() || !dissolution.motive?.trim()) errors.push(`Organization ${organizationId} has an invalid dissolution event.`);
      if (!dissolution.legalBasis || !['constitutional_guarantee', 'ordinary_law', 'unavailable'].includes(dissolution.legalBasis.basis) || !dissolution.legalBasis.limitation?.trim()) errors.push(`Organization ${organizationId} has a dissolution event without a recorded rights basis.`);
    }
    if (!Array.isArray(organization.activeStrikes)) errors.push(`Organization ${organizationId} has an invalid strike record.`);
    else for (const strike of organization.activeStrikes) {
      if (!validDate(strike.on) || strike.on > state.date || !POLITICAL_ISSUES.includes(strike.issue) || !Number.isSafeInteger(strike.participantPersons) || strike.participantPersons < 0 || !['ongoing', 'ended'].includes(strike.status)) errors.push(`Organization ${organizationId} has an invalid active strike.`);
    }
    if (organization.representedCohorts !== undefined && (!Array.isArray(organization.representedCohorts) || organization.representedCohorts.some(item => !['low', 'middle', 'high'].includes(item)))) errors.push(`Organization ${organizationId} has invalid represented cohorts.`);
    if (organization.issuePriorities !== undefined && (!Array.isArray(organization.issuePriorities) || organization.issuePriorities.some(item => !POLITICAL_ISSUES.includes(item)))) errors.push(`Organization ${organizationId} has invalid issue priorities.`);
    if (organization.fundsUsd !== undefined && (!Number.isSafeInteger(organization.fundsUsd) || organization.fundsUsd < 0)) errors.push(`Organization ${organizationId} has an invalid treasury.`);
    if (organization.strikeFundUsd !== undefined && (!Number.isSafeInteger(organization.strikeFundUsd) || organization.strikeFundUsd < 0)) errors.push(`Organization ${organizationId} has an invalid strike fund.`);
    if (organization.cyberSecurityBps !== undefined && (!Number.isSafeInteger(organization.cyberSecurityBps) || organization.cyberSecurityBps < 0 || organization.cyberSecurityBps > 10_000)) errors.push(`Organization ${organizationId} has an invalid cyber posture.`);
    if (organization.fundingEvents !== undefined) {
      if (!Array.isArray(organization.fundingEvents) || organization.fundingEvents.some(event => !validDate(event.on) || event.on > state.date || !Number.isSafeInteger(event.amountUsd) || !['seed', 'donation', 'strike_cost', 'cybersecurity_spending', 'cyber_attack_cost', 'cyber_theft', 'split_transfer'].includes(event.kind) || (event.source !== undefined && typeof event.source !== 'string'))) errors.push(`Organization ${organizationId} has an invalid funding ledger.`);
      else if (organization.fundsUsd !== undefined) {
        // Conservation: the tracked treasury is exactly the replay of the dated funding ledger.
        const replayed = organization.fundingEvents.reduce((sum, event) => sum + event.amountUsd, 0);
        if (replayed !== organization.fundsUsd + (organization.strikeFundUsd ?? 0)) errors.push(`Organization ${organizationId} funding does not reconcile with its ledger.`);
      }
    }
  }
  return errors;
} };
