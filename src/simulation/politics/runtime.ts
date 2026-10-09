import type { SimulationState } from '../../types';
import { clearDirty } from '../dirty';
import type { SimulationScheduler } from '../scheduler';
import { allocate, ratio } from '../socioeconomy/model';
import { aggregateNationalSupport } from './aggregation';
import { cohortTraits, effectivePartyProfile, evolvePositionsWithCurrents, initialPreferences, organizationStateFor, partyOrganizationStateFor, politicalExperienceFor, supportFor } from './initialization';
import { POLITICAL_ISSUES, POLITICS_MODEL as M, type CohortPoliticalOpinion, type OrganizationFundingEvent, type OrganizationPoliticalState, type PoliticalIssue, type PoliticalParty, type RegionalPoliticalOpinion } from './model';
import type { ElectionCountryState } from '../elections/model';
import { politicalRegistry } from './registry';
import { deterministicFingerprint } from '../fingerprint';
import { rightsBasisFor } from '../constitution/runtime';
import { createFiscalProposal } from '../governance/runtime';
import type { FiscalProposalPayload } from '../governance/model';

const clamp = (value: number) => Math.max(0, Math.min(10_000, Math.round(value)));
const blend = (prior: number, target: number, inertia: number) => clamp((prior * inertia + target * (10_000 - inertia)) / 10_000);
const ratioBps = (value: number, denominator: number) => denominator > 0 ? clamp(ratio(value, 10_000, denominator)) : 0;

/** A dynamic non-party organization's weekly positions: the weighted preferences of the cohorts it
 *  really represents, blended with the existing line. Its issuePriorities select the issues that
 *  produce recorded drivers — the fields are used, never decoration. */
const dynamicOrganizationPositionsFor = (state: SimulationState, organization: OrganizationPoliticalState, regionalOpinion: Record<string, RegionalPoliticalOpinion>): Record<PoliticalIssue, number> => {
  const represented = new Set(organization.representedCohorts ?? []);
  const weighted = POLITICAL_ISSUES.map(() => 0);
  let persons = 0;
  for (const [regionId, regional] of Object.entries(regionalOpinion)) {
    if (regional.countryId !== organization.countryId) continue;
    const socio = state.socioeconomy.regions[regionId];
    if (!socio) continue;
    for (const cohort of socio.cohorts) {
      if (!represented.has(cohort.income) || cohort.persons <= 0) continue;
      const opinion = regional.cohorts[`${cohort.income}:${cohort.orientation}`];
      if (!opinion) continue;
      persons += cohort.persons;
      opinion[0].forEach((value, index) => { weighted[index] += value * cohort.persons; });
    }
  }
  return Object.fromEntries(POLITICAL_ISSUES.map((issue, index) => {
    const target = persons ? Math.round(weighted[index] / persons) : 5_000;
    const prior = organization.currentPositions[issue];
    return [issue, blend(prior, target, M.organizationInertiaBps)];
  })) as Record<PoliticalIssue, number>;
};
const serviceCoverage = (state: SimulationState, countryId: string, infrastructure = false) => {
  const services = state.fiscal.countries[countryId]?.services; if (!services) return null;
  const selected = infrastructure ? [services.infrastructure] : [services.health, services.education], values = selected.map(item => item.coverageBps).filter((value): value is number => value !== null);
  return values.length ? Math.floor(values.reduce((a, b) => a + b, 0) / values.length) : null;
};
const basePreference = (cohortId: string, issue: PoliticalIssue) => initialPreferences(cohortTraits(cohortId).income, cohortTraits(cohortId).orientation)[POLITICAL_ISSUES.indexOf(issue)];
function updateOpinion(cohortId: string, opinion: CohortPoliticalOpinion, current: ReturnType<typeof politicalExperienceFor>, infrastructureCoverage: number | null, parties: PoliticalParty[], emergencyDiscontentMonths = 0): CohortPoliticalOpinion {
  const { income } = cohortTraits(cohortId), baseline = opinion[5];
  const incomeDecline = baseline ? ratioBps(Math.max(0, baseline - current.disposableIncomePerPerson), baseline) : 0;
  const needsGap = current.basicNeedsCoverageBps === null ? 0 : 10_000 - current.basicNeedsCoverageBps, serviceGap = current.serviceCoverageBps === null ? 0 : 10_000 - current.serviceCoverageBps, infrastructureGap = infrastructureCoverage === null ? 0 : 10_000 - infrastructureCoverage;
  const distress = clamp((current.unemploymentBps + incomeDecline + needsGap + serviceGap) * M.incomeSensitivityBps[income] / 40_000), sentimentMagnitude = blend(Math.abs(opinion[4]), distress, M.sentimentInertiaBps);
  // An unjustified state of emergency really reaches the population's opinion state: every month
  // the restrictions are maintained without justification adds progressive discontent to the
  // material sentiment and raises the salience of public order — never just a history entry.
  const emergencyDiscontent = Number.isSafeInteger(emergencyDiscontentMonths) ? emergencyDiscontentMonths : 0;
  const sentimentWithDiscontent = clamp(sentimentMagnitude + Math.min(10_000, emergencyDiscontent * 800));
  const tax = current.taxBurdenBps ?? 0, taxEffect = income === 'low' ? tax : income === 'high' ? -Math.round(tax / 2) : Math.round(tax / 4);
  const material = [incomeDecline + taxEffect, serviceGap, current.unemploymentBps, incomeDecline + needsGap, infrastructureGap, Math.floor(distress / 4)];
  const preferences = [...opinion[0]], salience = [...opinion[1]], drivers: number[] = [];
  POLITICAL_ISSUES.forEach((issue, index) => { const directional = issue === 'public_order' ? material[index] : material[index] * (income === 'high' && issue === 'fiscal_distribution' ? -1 : 1); preferences[index] = blend(preferences[index], clamp(basePreference(cohortId, issue) + directional / 2), M.preferenceInertiaBps); salience[index] = blend(salience[index], clamp(4_000 + Math.abs(material[index])), M.salienceInertiaBps); if (Math.abs(material[index]) >= 500) drivers.push(index); });
  if (emergencyDiscontent > 0) {
    const publicOrder = POLITICAL_ISSUES.indexOf('public_order');
    salience[publicOrder] = clamp(salience[publicOrder] + Math.min(2_500, emergencyDiscontent * 500));
    if (!drivers.includes(publicOrder)) drivers.push(publicOrder);
  }
  const target = supportFor(preferences, salience, opinion[3], parties), prior = opinion[2].length === target.length ? opinion[2] : supportFor(preferences, salience, opinion[3], parties);
  const support = allocate(10_000, target.map((value, index) => prior[index] * M.opinionInertiaBps + value * (10_000 - M.opinionInertiaBps)));
  return [preferences, salience, support, opinion[3], sentimentWithDiscontent ? -sentimentWithDiscontent : 0, baseline, drivers];
}

export function runPoliticalOpinionWeek(state: SimulationState): SimulationState {
  const politics = state.politics; if (!politics.initializedOn || politics.lastOpinionUpdate === state.date) return state;
  const regionalOpinion = { ...politics.regionalOpinion }, regionIdsByCountry = new Map<string, string[]>();
  for (const countryId of Object.keys(politics.countries)) regionIdsByCountry.set(countryId, []);
  for (const regionId of Object.keys(regionalOpinion).sort()) {
    const socio = state.socioeconomy.regions[regionId], owner = state.regionOwnership[regionId]; if (!socio || !owner || !politics.countries[owner]) continue;
    regionIdsByCountry.get(owner)!.push(regionId);
    const prior = regionalOpinion[regionId], partyIds = politicalRegistry.countries[owner]?.partyIds ?? [], parties = partyIds.map(id => effectivePartyProfile(state, politicalRegistry.parties[id]));
    const publicServices = serviceCoverage(state, owner), infrastructure = serviceCoverage(state, owner, true), cohorts: Record<string, CohortPoliticalOpinion> = {};
    // An unjustified state of emergency feeds the population's opinion state causally: the number of
    // months the restrictions have been maintained without justification drives real sentiment and
    // salience shifts, not only a recorded driver history.
    const emergencyEntry = state.constitution.countries[owner]?.emergency;
    const emergencyDiscontentMonths = emergencyEntry && emergencyEntry.status === 'expired' ? (emergencyEntry.discontentDriversApplied ?? 0) : 0;
    for (const [id, opinion] of Object.entries(prior.cohorts).sort(([a], [b]) => a.localeCompare(b))) {
      const traits = cohortTraits(id), remapped: CohortPoliticalOpinion = prior.countryId === owner ? opinion : [opinion[0], opinion[1], supportFor(opinion[0], opinion[1], opinion[3], parties), opinion[3], opinion[4], opinion[5], opinion[6]];
      cohorts[id] = updateOpinion(id, remapped, politicalExperienceFor(socio, traits.income, publicServices, state.fiscal.regions[regionId]), infrastructure, parties, emergencyDiscontentMonths);
    }
    regionalOpinion[regionId] = { regionId, countryId: owner, cohorts };
  }
  const countries = { ...politics.countries };
  for (const countryId of Object.keys(countries).sort()) {
    const regionIds = (regionIdsByCountry.get(countryId) ?? []).sort(), partyCount = politicalRegistry.countries[countryId]?.partyIds.length ?? 0, opinions = regionIds.flatMap(id => Object.values(regionalOpinion[id]?.cohorts ?? {}));
    const drivers = [...new Set(opinions.flatMap(item => item[6]))].sort((a, b) => a - b);
    countries[countryId] = { ...countries[countryId], regionIds, nationalSupportBps: aggregateNationalSupport(state, regionIds, regionalOpinion, partyCount), recentOpinionDrivers: [...countries[countryId].recentOpinionDrivers, { date: state.date, drivers }].slice(-M.historyLimit) };
  }
  const organizations: Record<string, OrganizationPoliticalState> = {};
  for (const item of Object.values(politicalRegistry.organizations)) {
    if (countries[item.countryId]) organizations[item.id] = organizationStateFor(state, item, regionalOpinion, state.date, politics.organizations[item.id]);
  }
  for (const party of Object.values(politicalRegistry.parties)) {
    if (countries[party.countryId]) organizations[party.id] = partyOrganizationStateFor(party, state.date, politics.organizations[party.id]);
  }
  // Dynamically registered organizations are preserved: a weekly opinion pass never wipes mutable
  // state. Their represented cohorts, interests and priorities really drive their weekly position
  // evolution — never stored decoration.
  for (const [id, organization] of Object.entries(politics.organizations)) {
    if (organization.source === 'dynamic') {
      // Ongoing strikes older than 28 days end: the withdrawal of labour does not last forever.
      const activeStrikes = (organization.activeStrikes ?? []).map(strike => {
        if (strike.status !== 'ongoing') return strike;
        const started = new Date(`${strike.on}T00:00:00.000Z`).valueOf();
        const now = new Date(`${state.date}T00:00:00.000Z`).valueOf();
        return now - started >= 28 * 24 * 3600 * 1_000 ? { ...strike, status: 'ended' as const } : strike;
      });
      if (organization.type === 'party') {
        // Dynamic parties evolve progressively: their internal currents move the mutable line.
        organizations[id] = { ...organization, currentPositions: evolvePositionsWithCurrents(organization.currentPositions, Object.values(organization.internalCurrents ?? {})), activeStrikes, lastUpdatedOn: state.date };
      } else {
        organizations[id] = { ...organization, currentPositions: dynamicOrganizationPositionsFor(state, organization, regionalOpinion), activeStrikes, lastUpdatedOn: state.date };
      }
    }
  }
  return clearDirty({ ...state, politics: { ...politics, countries, regionalOpinion, organizations, lastOpinionUpdate: state.date, weeklyEvaluations: politics.weeklyEvaluations + Object.keys(regionalOpinion).length } }, 'politics');
}
export const registerPoliticalTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'politics.opinion-weekly', cadence: 'weekly', priority: M.schedulerPriority, run: runPoliticalOpinionWeek });
export function inspectPolitics(state: SimulationState, countryId: string) {
  const country = state.politics.countries[countryId], definition = politicalRegistry.countries[countryId]; if (!country) return undefined;
  const parties = definition?.partyIds ?? [], decode = (region: RegionalPoliticalOpinion | undefined) => region && ({ ...region, cohorts: Object.fromEntries(Object.entries(region.cohorts).map(([id, value]) => [id, { issuePreferencesBps: Object.fromEntries(POLITICAL_ISSUES.map((issue, index) => [issue, value[0][index]])), issueSalienceBps: Object.fromEntries(POLITICAL_ISSUES.map((issue, index) => [issue, value[1][index]])), partySupportBps: Object.fromEntries([...parties.map((partyId, index) => [partyId, value[2][index]]), ['undecided', value[2][parties.length]]]), engagementBps: value[3], materialSentimentBps: value[4], baselineDisposableIncomePerPerson: value[5], recentMaterialDrivers: value[6].map(index => POLITICAL_ISSUES[index]) }])) });
  return structuredClone({ date: state.date, country: { ...country, coverage: definition?.coverage }, institutions: definition ? politicalRegistry.institutions[definition.institutionId] : undefined, parties: parties.map((id, index) => ({ ...politicalRegistry.parties[id], nationalSupportBps: country.nationalSupportBps[index] })), organizations: definition?.organizationIds.map(id => ({ ...politicalRegistry.organizations[id], dynamic: state.politics.organizations[id] })) ?? [], regionalOpinion: Object.fromEntries(country.regionIds.map(id => [id, decode(state.politics.regionalOpinion[id])])) });
}

const activeOrganization = (state: SimulationState, organizationId: string) => {
  const organization = state.politics.organizations[organizationId];
  if (!organization) throw new Error(`Unknown organization: ${organizationId}`);
  return organization;
};

/** Join an organization (reuses the registry organizationId; never a second registry). A real,
 *  active person of the organization's Country is required. Joining a party sets the person's
 *  canonical party membership too: PoliticalPersonState.partyId and the organization's members
 *  never tell two different memberships. */
export function joinOrganization(state: SimulationState, personId: string, organizationId: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization admits members.');
  const person = state.governance.persons[personId];
  if (!person || person.status !== 'active') throw new Error('Only an active political person may join an organization.');
  const countryId = politicalRegistry.organizations[organizationId]?.countryId ?? organization.countryId;
  if (countryId && person.countryId !== countryId) throw new Error('A person may only join an organization of their own Country.');
  if (organization.type === 'party' && person.partyId && person.partyId !== organizationId) throw new Error('The person already belongs to another party; a person has exactly one canonical party membership.');
  const members = { ...organization.members, [personId]: { personId, role: 'member' as const, joinedOn: state.date } };
  let governance = state.governance;
  if (organization.type === 'party') {
    governance = { ...governance, persons: { ...governance.persons, [personId]: { ...person, partyId: organizationId, isPartyLeader: false } } };
  }
  return { ...state, governance, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, members } } } };
}

export function leaveOrganization(state: SimulationState, personId: string, organizationId: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  const person = state.governance.persons[personId];
  const membership = organization.members[personId];
  if (person && membership?.role === 'leader' && organization.type === 'party') throw new Error('A party leader cannot simply leave the party; run a leadership succession first.');
  const members = { ...organization.members }; delete members[personId];
  let governance = state.governance;
  if (person && organization.type === 'party' && person.partyId === organizationId) {
    governance = { ...governance, persons: { ...governance.persons, [personId]: { ...person, partyId: undefined, isPartyLeader: false } } };
  }
  return { ...state, governance, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, members } } } };
}

/** Reconcile the party's institutional functions after a status change (ban/dissolution): the
 *  party leaves the ballot and any governing coalition it was not heading, its recorded
 *  members/leaders keep their persons (never deleted), and the canonical membership records stay
 *  consistent. A governing coalition headed by this party's leader stays: the office is personal,
 *  the person-first model never deletes anyone. */
const reconcilePartyInstitutions = (state: SimulationState, organizationId: string): SimulationState => {
  const organization = state.politics.organizations[organizationId];
  if (!organization || organization.type !== 'party') return state;
  const countryId = organization.countryId;
  let next = state;
  if (countryId) {
    const entry = next.elections.countries[countryId];
    if (entry) {
      const head = Object.values(next.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
      const coalitionHeadedByParty = head !== undefined && head.partyId === organizationId && entry.government.coalitionPartyIds.includes(organizationId);
      const coalitionPartyIds = coalitionHeadedByParty ? entry.government.coalitionPartyIds : entry.government.coalitionPartyIds.filter(partyId => partyId !== organizationId);
      const parties: Record<string, ElectionCountryState['parties'][string]> = {};
      for (const [partyId, party] of Object.entries(entry.parties)) {
        parties[partyId] = partyId === organizationId && !coalitionHeadedByParty
          ? { ...party, governmentStatus: 'opposition' as const }
          : party;
      }
      next = { ...next, elections: { ...next.elections, countries: { ...next.elections.countries, [countryId]: { ...entry, government: { coalitionPartyIds, confidence: entry.government.confidence }, parties } } } };
    }
  }
  return next;
};

/** The constitutional rights basis a ban or dissolution must rest on: a guarantee requires
 *  respecting it, `not_guaranteed` means ordinary law governs (never automatically forbidden), and
 *  an unavailable basis makes the procedure legally ungrounded. */
const rightsBasisRecord = (state: SimulationState, countryId: string | undefined): { basis: 'constitutional_guarantee' | 'ordinary_law' | 'unavailable'; limitation: string } => {
  const entry = countryId ? state.constitution.countries[countryId] : undefined;
  const level = entry?.rights?.association;
  if (level === undefined) return { basis: 'unavailable', limitation: 'No constitutional basis is available; the ban/dissolution cannot be legally grounded.' };
  return rightsBasisFor(level);
};

/** Dissolve an organization procedurally: only an executive of the organization's own Country may,
 *  with an explicit, recorded motive and a real constitutional rights basis. A dissolved party
 *  leaves the ballot and any governing coalition, while its persons are never deleted. */
export function dissolveOrganization(state: SimulationState, organizationId: string, actorPersonId: string, motive: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  const actor = state.governance.persons[actorPersonId];
  if (!actor || !['head_of_government', 'head_of_state'].includes(actor.office?.role ?? '')) throw new Error('Only the executive head may dissolve an organization.');
  const countryId = politicalRegistry.organizations[organizationId]?.countryId ?? organization.countryId;
  if (!countryId || actor.office!.countryId !== countryId) throw new Error('An executive may only dissolve an organization in their own Country.');
  if (!motive?.trim()) throw new Error('A dissolution requires an explicit motive.');
  if (organization.status !== 'active') throw new Error('Only an active organization can be dissolved; repeated dissolution is incoherent.');
  const legalBasis = rightsBasisRecord(state, countryId);
  if (legalBasis.basis === 'unavailable') throw new Error('A dissolution requires a known constitutional rights basis; an unavailable basis cannot ground it.');
  const dissolutionEvents = [...(organization.dissolutionEvents ?? []), { date: state.date, actorPersonId, motive: motive.trim(), legalBasis }];
  const dissolvedOrganization: OrganizationPoliticalState = { ...organization, status: 'dissolved', dissolutionEvents };
  const dissolved: SimulationState = { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: dissolvedOrganization } } };
  return reconcilePartyInstitutions(dissolved, organizationId);
}

/** Procedurally ban an organization with an accountable, authorized actor, motive, evidence and a
 *  real constitutional rights basis. An executive may only ban an organization in their own
 *  Country. A banned party leaves the ballot and any governing coalition, while its persons are
 *  never deleted. */
export function banOrganization(state: SimulationState, organizationId: string, actorPersonId: string, motive: string, evidence: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  const actor = state.governance.persons[actorPersonId];
  if (!actor || !['head_of_government', 'head_of_state'].includes(actor.office?.role ?? '')) throw new Error('Only the executive head may ban an organization.');
  const countryId = politicalRegistry.organizations[organizationId]?.countryId ?? organization.countryId;
  if (!countryId || actor.office!.countryId !== countryId) throw new Error('An executive may only ban an organization in their own Country.');
  if (!motive?.trim() || !evidence?.trim()) throw new Error('A ban requires an explicit motive and evidence.');
  if (organization.status !== 'active') throw new Error('Only an active organization can be banned; a banned organization cannot be re-banned.');
  const legalBasis = rightsBasisRecord(state, countryId);
  if (legalBasis.basis === 'unavailable') throw new Error('A ban requires a known constitutional rights basis; an unavailable basis cannot ground it.');
  const banEvents = [...organization.banEvents, { date: state.date, actorPersonId, motive: motive.trim(), evidence: evidence.trim(), legalBasis }];
  const bannedOrganization: OrganizationPoliticalState = { ...organization, status: 'banned', banEvents };
  const banned: SimulationState = { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: bannedOrganization } } };
  return reconcilePartyInstitutions(banned, organizationId);
}

/** Appeal a ban: an identifiable appellant (an active member of the organization) records the
 *  appeal; it never automatically restores the organization. */
export function appealBan(state: SimulationState, organizationId: string, appellantPersonId: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'banned') throw new Error('Only a banned organization may appeal.');
  const appellant = state.governance.persons[appellantPersonId];
  if (!appellant || appellant.status !== 'active' || !organization.members[appellantPersonId]) throw new Error('Only an active member of the banned organization may appeal its ban.');
  const banEvents = [...organization.banEvents]; const last = banEvents.at(-1);
  if (!last || last.appealedOn) throw new Error('This ban has no pending appeal.');
  banEvents[banEvents.length - 1] = { ...last, appealedOn: state.date, appealByPersonId: appellantPersonId };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, banEvents } } } };
}

/** Resolve a pending ban appeal: a real decision by an authorized executive in the organization's
 *  own Country. The executive who pronounced the ban is never its own judge, and a judgment already
 *  issued can never be re-judged to flip the result. */
export function resolveBanAppeal(state: SimulationState, organizationId: string, actorPersonId: string, decision: 'restore' | 'uphold'): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'banned') throw new Error('Only a banned organization has an appeal to resolve.');
  const banEvents = [...organization.banEvents]; const last = banEvents.at(-1);
  if (!last?.appealedOn) throw new Error('This ban has no pending appeal.');
  if (last.appealDecision !== undefined) throw new Error('This appeal has already been decided; a decided judgment cannot be re-judged or reversed.');
  const actor = state.governance.persons[actorPersonId];
  if (!actor || !['head_of_government', 'head_of_state'].includes(actor.office?.role ?? '')) throw new Error('Only the executive head may resolve a ban appeal.');
  const countryId = politicalRegistry.organizations[organizationId]?.countryId ?? organization.countryId;
  if (!countryId || actor.office!.countryId !== countryId) throw new Error('An executive may only resolve an appeal in their own Country.');
  if (last.actorPersonId === actorPersonId) throw new Error('The executive who pronounced the ban cannot be its own judge; a distinct deciding authority is required.');
  banEvents[banEvents.length - 1] = { ...last, appealDecision: decision, appealResolvedOn: state.date };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, status: decision === 'restore' ? 'active' : 'banned', banEvents } } } };
}

/** Donate to an organization from a real donor: the amount is deducted from the donor's personal
 *  treasury, never created ex nihilo, and unavailable funds are never treated as zero. Every inflow
 *  is recorded in the organization's dated funding ledger with its provenance. Only active
 *  organizations admit donations, donors are always domestic (no foreign donation without a
 *  sourced financing rule), and the donation can never exceed the donor's funds (the cap). */
export function donateToOrganization(state: SimulationState, organizationId: string, donorPersonId: string, amountUsd: number): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization may receive donations; a banned or dissolved organization cannot be funded.');
  const donor = state.governance.persons[donorPersonId];
  if (!donor) throw new Error('Unknown donor person.');
  if (!Number.isSafeInteger(amountUsd) || amountUsd <= 0) throw new Error('Donation must be a positive integer.');
  if (organization.fundsUsd === undefined) throw new Error('This organization has no tracked treasury; a donation cannot be added to unavailable funds.');
  if (donor.personalFundsUsd === undefined) throw new Error('The donor has no personal treasury; unavailable funds are not zero.');
  if (donor.personalFundsUsd < amountUsd) throw new Error('The donor has insufficient personal funds; the donation exceeds the donor\'s cap.');
  const countryId = politicalRegistry.organizations[organizationId]?.countryId ?? organization.countryId;
  if (countryId && donor.countryId !== countryId) throw new Error('Foreign donations are not admissible without a sourced financing rule; the donor must belong to the organization\'s Country.');
  const fundingEvents = [...(organization.fundingEvents ?? []), { on: state.date, amountUsd, kind: 'donation' as const, actorPersonId: donorPersonId, source: `donation:${donorPersonId}` }];
  const fundsUsd = organization.fundsUsd + amountUsd;
  const cyberSpentUsd = fundingEvents.filter(event => event.kind === 'cybersecurity_spending').reduce((sum, event) => sum - event.amountUsd, 0);
  return {
    ...state,
    governance: { ...state.governance, persons: { ...state.governance.persons, [donor.id]: { ...donor, personalFundsUsd: donor.personalFundsUsd - amountUsd } } },
    politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, fundsUsd, fundingEvents, cyberSecurityBps: cyberSecurityBpsFor(fundsUsd + (organization.strikeFundUsd ?? 0), cyberSpentUsd) } } },
  };
}

/** Register an internal current (a modelled faction; not an observed faction share). Its modelled
 *  issue positions progressively pull the mutable party line each week, weighted by its salience. */
export function addInternalCurrent(state: SimulationState, organizationId: string, currentId: string, name: string, salienceBps: number, issuePositions?: Partial<Record<PoliticalIssue, number>>): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (!Number.isSafeInteger(salienceBps) || salienceBps < 0 || salienceBps > 10_000) throw new Error('Internal-current salience must be an integer in 0..10000 basis points.');
  if (issuePositions && Object.values(issuePositions).some(value => !Number.isSafeInteger(value) || value < 0 || value > 10_000)) throw new Error('Internal-current issue positions must be integers in 0..10000 basis points.');
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, internalCurrents: { ...organization.internalCurrents, [currentId]: { id: currentId, name, salienceBps, issuePositions: issuePositions ? structuredClone(issuePositions) : undefined } } } } } };
}

/** Register a new mutable organization (pluralism). Its identity is deterministic and it starts with
 *  a known-empty treasury; positions are modelled-neutral, never a fabricated sourced ideology. The
 *  religious family is representable with unavailable coverage (no sourced religious organization),
 *  and the single-party lever is respected: a Country with exactly one registered party admits no
 *  competing party registration. */
export function registerOrganization(state: SimulationState, input: { countryId: string; type: 'union' | 'association' | 'party' | 'religious'; displayName: string; representedInterests?: string[]; representedCohorts?: Array<'low' | 'middle' | 'high'>; issuePriorities?: PoliticalIssue[] }): SimulationState {
  if (!state.politics.countries[input.countryId]) throw new Error('Unknown Country for organization registration.');
  if (!input.displayName.trim()) throw new Error('An organization requires a display name.');
  if (input.type === 'party' && (politicalRegistry.countries[input.countryId]?.partyIds.length ?? 0) === 1) throw new Error('This Country has a single-party system; registering a competing party is not admissible.');
  const id = `organization.dynamic.${deterministicFingerprint({ countryId: input.countryId, type: input.type, displayName: input.displayName.trim(), registeredOn: state.date })}`;
  if (state.politics.organizations[id]) throw new Error('This organization is already registered.');
  const currentPositions = Object.fromEntries(POLITICAL_ISSUES.map(issue => [issue, 5_000])) as Record<PoliticalIssue, number>;
  const entry: OrganizationPoliticalState = {
    organizationId: id, currentPositions, lastUpdatedOn: state.date, recentDrivers: [], status: 'active', members: {}, fundsUsd: 0, internalCurrents: {}, banEvents: [],
    fundingEvents: [{ on: state.date, amountUsd: 0, kind: 'seed', source: 'dynamic_registration' }], strikeFundUsd: 0, claims: [], cyberSecurityBps: 0, dissolutionEvents: [],
    activeStrikes: [], countryId: input.countryId, type: input.type, displayName: input.displayName.trim(), source: 'dynamic',
    ...(input.representedCohorts ? { representedCohorts: [...input.representedCohorts] } : {}),
    ...(input.representedInterests ? { representedInterests: [...input.representedInterests] } : {}),
    ...(input.issuePriorities ? { issuePriorities: [...input.issuePriorities] } : {}),
  };
  const religiousOrganizationsCoverage = input.type === 'religious'
    ? { status: 'modelled' as const, limitation: 'A religious organization was registered dynamically; the sourced 0.13 registry coverage stays unavailable — the registered organization is modelled, never sourced.' }
    : state.politics.religiousOrganizationsCoverage;
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [id]: entry }, religiousOrganizationsCoverage } };
}

/** Merge two active organizations of the same Country and compatible family: members, funds, strike
 *  funds, claims and the full funding ledgers transfer to the target; the absorbed organization is
 *  dissolved. Unavailable funds stay unavailable. For a party merge, the absorbed members' canonical
 *  party membership follows them to the target party — persons are never deleted and never carry
 *  two memberships. */
export function mergeOrganizations(state: SimulationState, targetId: string, absorbedId: string): SimulationState {
  const target = activeOrganization(state, targetId);
  const absorbed = activeOrganization(state, absorbedId);
  if (target.organizationId === absorbed.organizationId) throw new Error('An organization cannot merge into itself.');
  if (target.status !== 'active' || absorbed.status !== 'active') throw new Error('Only active organizations may merge.');
  if (target.countryId && absorbed.countryId && target.countryId !== absorbed.countryId) throw new Error('Merging organizations must belong to the same Country.');
  const targetType = target.type ?? 'association';
  const absorbedType = absorbed.type ?? 'association';
  if (targetType !== absorbedType) throw new Error('Only organizations of the same family may merge; parties, unions, associations and religions never merge across families.');
  const fundsUsd = target.fundsUsd === undefined || absorbed.fundsUsd === undefined ? undefined : target.fundsUsd + absorbed.fundsUsd;
  const strikeFundUsd = target.strikeFundUsd === undefined || absorbed.strikeFundUsd === undefined
    ? (target.strikeFundUsd ?? absorbed.strikeFundUsd)
    : target.strikeFundUsd + absorbed.strikeFundUsd;
  const fundingEvents = [...(target.fundingEvents ?? []), ...(absorbed.fundingEvents ?? [])];
  const members = { ...absorbed.members };
  for (const [personId, membership] of Object.entries(target.members)) members[personId] = membership;
  const internalCurrents = { ...absorbed.internalCurrents, ...target.internalCurrents };
  const claims = [...(target.claims ?? []), ...(absorbed.claims ?? [])];
  const cyberSpentUsd = fundingEvents.filter(event => event.kind === 'cybersecurity_spending').reduce((sum, event) => sum - event.amountUsd, 0);
  const targetTreasury = fundsUsd === undefined ? undefined : fundsUsd + (strikeFundUsd ?? 0);
  // Party merge: the absorbed members' canonical party membership moves to the target party.
  let persons = state.governance.persons;
  if (targetType === 'party') {
    persons = { ...persons };
    for (const person of Object.values(persons)) {
      if (person.partyId !== absorbedId) continue;
      const role = absorbed.members[person.id]?.role === 'leader' || person.isPartyLeader ? 'leader' : 'member';
      members[person.id] = { personId: person.id, role, joinedOn: absorbed.members[person.id]?.joinedOn ?? person.createdOn };
      persons[person.id] = { ...person, partyId: targetId };
    }
  }
  // The absorbed organization transfers its whole treasury: it keeps no funds, no strike fund and
  // no ledger of its own — nothing remains simultaneously owned by the absorbed organization.
  const absorbedLedger: OrganizationFundingEvent[] = [];
  return { ...state, governance: { ...state.governance, persons }, politics: { ...state.politics, organizations: { ...state.politics.organizations, [targetId]: { ...target, fundsUsd, strikeFundUsd, fundingEvents, members, internalCurrents, claims, cyberSecurityBps: cyberSecurityBpsFor(targetTreasury, cyberSpentUsd) }, [absorbedId]: { ...absorbed, status: 'dissolved', fundsUsd: undefined, strikeFundUsd: undefined, fundingEvents: absorbedLedger, cyberSecurityBps: undefined } } } };
}

/** Split an active organization: a deterministic portion of members and funds forms a new dynamic
 *  organization; the original keeps the remainder. The funding ledger splits with the funds, so both
 *  treasuries still reconcile exactly. Unavailable funds stay unavailable. */
export function splitOrganization(state: SimulationState, organizationId: string, newDisplayName: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization may split.');
  if (!newDisplayName.trim()) throw new Error('A split organization requires a display name.');
  const countryId = organization.countryId;
  if (!countryId) throw new Error('The organization has no Country.');
  const newId = `organization.dynamic.${deterministicFingerprint({ countryId, type: organization.type, displayName: newDisplayName.trim(), splitFrom: organizationId, on: state.date })}`;
  if (state.politics.organizations[newId]) throw new Error('A split organization ID collision: this split already exists.');
  const funds = organization.fundsUsd;
  const half = funds === undefined ? undefined : Math.floor(funds / 2);
  const remaining = funds === undefined ? undefined : funds - Math.floor(funds / 2);
  const fundingEvents = organization.fundingEvents ?? [];
  const originalEvents = half === undefined || half <= 0 ? fundingEvents : [...fundingEvents, { on: state.date, amountUsd: -half, kind: 'split_transfer' as const }];
  const newEvents = half === undefined || half <= 0 ? [] : [{ on: state.date, amountUsd: half, kind: 'split_transfer' as const }];
  const memberIds = Object.keys(organization.members).sort();
  const splitCount = Math.floor(memberIds.length / 2);
  const splitMemberIds = new Set(memberIds.slice(0, splitCount));
  const members = Object.fromEntries(Object.entries(organization.members).filter(([personId]) => !splitMemberIds.has(personId)));
  const newMembers = Object.fromEntries([...splitMemberIds].map(personId => [personId, organization.members[personId]]));
  const newEntry: OrganizationPoliticalState = { ...organization, organizationId: newId, displayName: newDisplayName.trim(), members: newMembers, fundsUsd: half, fundingEvents: newEvents, strikeFundUsd: 0, claims: [], recentDrivers: [], lastUpdatedOn: state.date, source: 'dynamic', cyberSecurityBps: half === undefined ? undefined : cyberSecurityBpsFor(half, 0) };
  // A party split moves the split members' canonical party membership to the new party: persons are
  // never deleted, and PoliticalPersonState.partyId never contradicts the organization members.
  let persons = state.governance.persons;
  if (organization.type === 'party') {
    persons = { ...persons };
    for (const person of Object.values(persons)) {
      if (!splitMemberIds.has(person.id) || person.partyId !== organizationId) continue;
      persons[person.id] = { ...person, partyId: newId, isPartyLeader: false };
      const role = newMembers[person.id]?.role ?? 'member';
      if (role === 'leader') persons[person.id] = { ...persons[person.id], isPartyLeader: true };
    }
  }
  const originalCyberSpent = originalEvents.filter(event => event.kind === 'cybersecurity_spending').reduce((sum, event) => sum - event.amountUsd, 0);
  return { ...state, governance: { ...state.governance, persons }, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, members, fundsUsd: remaining, fundingEvents: originalEvents, cyberSecurityBps: remaining === undefined ? undefined : cyberSecurityBpsFor(remaining + (organization.strikeFundUsd ?? 0), originalCyberSpent) }, [newId]: newEntry } } };
}

const STRIKE_COST_USD = 1_000;
const CYBER_ATTACK_COST_USD = 1_000;

const organizationCountryId = (state: SimulationState, organization: OrganizationPoliticalState): string | undefined =>
  politicalRegistry.organizations[organization.organizationId]?.countryId ?? organization.countryId;

const organizationType = (state: SimulationState, organization: OrganizationPoliticalState): NonNullable<OrganizationPoliticalState['type']> =>
  politicalRegistry.organizations[organization.organizationId]?.type ?? organization.type ?? 'association';

/** The modelled cybersecurity posture: the share of the tracked financial base (remaining total
 *  treasury — funds plus strike fund — plus what was already spent) devoted to cybersecurity.
 *  Spending nothing yields 0; spending the whole base yields 10_000. `undefined` when the treasury
 *  is untracked (unavailable ≠ 0). */
const cyberSecurityBpsFor = (totalTreasuryUsd: number | undefined, cyberSpentUsd: number): number | undefined => {
  if (totalTreasuryUsd === undefined) return undefined;
  const base = totalTreasuryUsd + cyberSpentUsd;
  return base <= 0 ? 0 : clamp(ratio(cyberSpentUsd, 10_000, base));
};
/** Recompute the cyber posture after any treasury change: total treasury is funds + strike fund. */
const totalTreasuryFor = (organization: OrganizationPoliticalState): number | undefined =>
  organization.fundsUsd === undefined ? undefined : organization.fundsUsd + (organization.strikeFundUsd ?? 0);

/** The family-locked public actions. Parties: sit-in, general/capital demonstrations, rallies.
 *  Unions: strikes and boycotts (claims and negotiations are their own commands). Associations:
 *  petitions, campaigns, lobbying, boycotts. Religions: declarations, reform support, government
 *  meetings, social works and boycotts — the authorized public actions of each family, no more. */
export const ORGANIZATION_ACTION_FAMILIES: Record<string, readonly string[]> = {
  sit_in: ['party'],
  demonstration: ['party'],
  general_demonstration: ['party'],
  capital_demonstration: ['party'],
  rally: ['party'],
  strike: ['union'],
  boycott: ['union', 'association', 'religious'],
  petition: ['association'],
  campaign: ['association'],
  lobby: ['association'],
  declaration: ['religious'],
  reform_support: ['religious'],
  government_meeting: ['religious'],
  social_works: ['religious'],
};
export type OrganizationAction = keyof typeof ORGANIZATION_ACTION_FAMILIES;

const ACTION_ISSUES: Record<OrganizationAction, PoliticalIssue> = {
  strike: 'labour_protection', sit_in: 'public_order', demonstration: 'public_order', general_demonstration: 'public_order', capital_demonstration: 'public_order', rally: 'public_order',
  petition: 'public_services', campaign: 'public_services', lobby: 'fiscal_distribution', boycott: 'fiscal_distribution',
  declaration: 'public_services', reform_support: 'public_services', government_meeting: 'public_services', social_works: 'public_services',
};

/** The union's represented cohorts decide the real strike participants: a bounded modelled share of
 *  the represented workers, never a fabricated headcount. */
const STRIKE_PARTICIPATION_BPS = 1_000;
const strikeParticipantsPersons = (state: SimulationState, organization: OrganizationPoliticalState, countryId: string): number => {
  const registryOrganization = politicalRegistry.organizations[organization.organizationId];
  const representedCohorts = organization.representedCohorts ?? registryOrganization?.representedCohorts ?? [];
  const represented = new Set(representedCohorts);
  let persons = 0;
  for (const regionId of state.politics.countries[countryId]?.regionIds ?? []) {
    const socio = state.socioeconomy.regions[regionId];
    if (!socio) continue;
    for (const cohort of socio.cohorts) if (represented.has(cohort.income)) persons += cohort.persons;
  }
  return Math.round(persons * STRIKE_PARTICIPATION_BPS / 10_000);
};

/** A public action is gated by the organization family, the constitution's rights and the state of
 *  emergency; it adds a causal opinion driver that really reaches the population's opinion state,
 *  never a bonus. A strike requires a pending union claim (a purpose), a sufficient strike fund,
 *  and produces the real economic consequence of the represented workers withdrawing labour. */
export function runOrganizationAction(state: SimulationState, organizationId: string, action: OrganizationAction): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('A dissolved or banned organization cannot act.');
  const type = organizationType(state, organization);
  const allowed = ORGANIZATION_ACTION_FAMILIES[action];
  if (!allowed || !allowed.includes(type)) throw new Error(`The ${action} action is reserved for the ${allowed?.join('/') ?? 'unknown'} family; a ${type} organization cannot perform it.`);
  const countryId = organizationCountryId(state, organization);
  const constitution = countryId ? state.constitution.countries[countryId] : undefined;
  if (action === 'strike' && constitution?.emergency.restrictions.strikesBanned) throw new Error('Strikes are banned under the state of emergency.');
  if (action !== 'strike' && constitution?.emergency.restrictions.assembliesBanned) throw new Error('Assemblies are banned under the state of emergency.');
  // The constitutional right is the legal basis of the action (rightsBasisFor); a missing guarantee
  // means ordinary law governs — never automatically forbidden, never automatically guaranteed.
  let fundingEvents = organization.fundingEvents ?? [];
  let strikeFundUsd = organization.strikeFundUsd;
  let activeStrikes = organization.activeStrikes ?? [];
  let strikeParticipants = 0;
  if (action === 'strike') {
    const pending = (organization.claims ?? []).some(claim => claim.status === 'pending');
    if (!pending) throw new Error('A strike requires a pending union claim; a strike never creates its own cause.');
    if (organization.fundsUsd !== undefined) {
      const available = strikeFundUsd ?? 0;
      if (available < STRIKE_COST_USD) throw new Error('The union strike fund cannot sustain this strike; allocate strike funds first.');
      strikeFundUsd = available - STRIKE_COST_USD;
      fundingEvents = [...fundingEvents, { on: state.date, amountUsd: -STRIKE_COST_USD, kind: 'strike_cost' as const }];
    }
    strikeParticipants = strikeParticipantsPersons(state, organization, countryId ?? '');
    activeStrikes = [...activeStrikes, { on: state.date, issue: 'labour_protection', participantPersons: strikeParticipants, status: 'ongoing' as const }];
  }
  const issue = ACTION_ISSUES[action];
  const issueIndex = POLITICAL_ISSUES.indexOf(issue);
  const driver = { date: state.date, issues: issueIndex >= 0 ? [issue] : [] };
  let next = { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, lastUpdatedOn: state.date, strikeFundUsd, fundingEvents, activeStrikes, recentDrivers: [...organization.recentDrivers, driver].slice(-M.historyLimit) } } } };
  // The public action really influences the opinion engine: cohort sentiment and issue salience
  // shift, and the Country's opinion drivers record it — never just a history entry.
  if (countryId && issueIndex >= 0) {
    const politics = { ...next.politics, countries: { ...next.politics.countries }, regionalOpinion: { ...next.politics.regionalOpinion } };
    const country = politics.countries[countryId];
    if (country) {
      politics.countries[countryId] = { ...country, recentOpinionDrivers: [...country.recentOpinionDrivers, { date: state.date, drivers: [issueIndex] }].slice(-M.historyLimit) };
    }
    for (const regionId of state.politics.countries[countryId]?.regionIds ?? []) {
      const regional = politics.regionalOpinion[regionId];
      if (!regional) continue;
      const cohorts: Record<string, CohortPoliticalOpinion> = {};
      for (const [cohortId, opinion] of Object.entries(regional.cohorts)) {
        const salience = [...opinion[1]];
        salience[issueIndex] = Math.max(0, Math.min(10_000, salience[issueIndex] + 300));
        const sentiment = Math.max(-10_000, Math.min(10_000, opinion[4] - 200));
        cohorts[cohortId] = [opinion[0], salience, opinion[2], opinion[3], sentiment, opinion[5], opinion[6]];
      }
      politics.regionalOpinion[regionId] = { ...regional, cohorts };
    }
    next = { ...next, politics };
  }
  // A strike produces the real economic consequence of the represented workers withdrawing labour:
  // employment moves to unemployment (labour stock conserved) and output scales down accordingly.
  if (strikeParticipants > 0 && countryId) {
    const socioeconomy = { ...next.socioeconomy, regions: { ...next.socioeconomy.regions } };
    const regionIds = next.politics.countries[countryId]?.regionIds ?? [];
    const employedByRegion = regionIds.map(regionId => next.socioeconomy.regions[regionId]?.economy?.employed ?? 0);
    const totalEmployed = employedByRegion.reduce((sum, value) => sum + value, 0);
    if (totalEmployed > 0) {
      let remainingWithdrawal = strikeParticipants;
      regionIds.forEach((regionId, index) => {
        if (remainingWithdrawal <= 0) return;
        const region = socioeconomy.regions[regionId];
        const economy = region?.economy;
        if (!economy || economy.employed <= 0) return;
        const withdrawn = Math.min(economy.employed, Math.round(strikeParticipants * employedByRegion[index] / totalEmployed));
        if (withdrawn <= 0) return;
        remainingWithdrawal -= withdrawn;
        const employed = economy.employed - withdrawn;
        const scale = employed / economy.employed;
        socioeconomy.regions[regionId] = { ...region, economy: { ...economy, employed, unemployed: economy.unemployed + withdrawn, output: Math.round(economy.output * scale), productionCapacity: Math.round(economy.productionCapacity * scale), householdIncome: Math.round(economy.householdIncome * scale), incomeByGroup: economy.incomeByGroup.map(value => Math.round(value * scale)) } };
      });
    }
    next = { ...next, socioeconomy };
  }
  return next;
}

/** Deterministic financing with provenance: a one-time seed of the organization's tracked treasury.
 *  The seed is a dated ledger event carrying its provenance source, so funding is always traceable
 *  and never ex nihilo. Initial treasury creation belongs explicitly to initialization/migration
 *  (or the organization's own registration day): during the simulation, funds only move with a real
 *  counterparty, never through this command. */
export function setOrganizationFunds(state: SimulationState, organizationId: string, amountUsd: number, source: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization can be funded.');
  const untouched = organization.fundsUsd === 0 && (organization.fundingEvents ?? []).every(event => event.amountUsd === 0);
  if (organization.fundsUsd !== undefined && !untouched) throw new Error('This organization already has a tracked treasury; a second seed would rewrite history.');
  if (!Number.isSafeInteger(amountUsd) || amountUsd < 0) throw new Error('Seed funding must be a non-negative integer.');
  if (!source?.trim()) throw new Error('Seed funding requires a provenance source.');
  const initializationDay = state.politics.initializedOn === state.date;
  const registrationDay = organization.source === 'dynamic' && organization.lastUpdatedOn === state.date;
  if (!initializationDay && !registrationDay) throw new Error('Initial treasury creation belongs to initialization/migration or the organization\'s registration day; in-simulation funding must have a real counterparty.');
  const fundingEvents = [...(organization.fundingEvents ?? []), { on: state.date, amountUsd, kind: 'seed' as const, source: source.trim() }];
  const strikeFundUsd = organization.strikeFundUsd ?? 0;
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, fundsUsd: amountUsd, strikeFundUsd, fundingEvents, cyberSecurityBps: cyberSecurityBpsFor(amountUsd + strikeFundUsd, 0) } } } };
}

/** Reserve treasury funds for strikes: the amount moves from the liquid treasury to the strike fund
 *  (a signed ledger event), so the total tracked funding is conserved. */
export function allocateStrikeFund(state: SimulationState, organizationId: string, amountUsd: number): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization can allocate a strike fund.');
  if (organizationType(state, organization) !== 'union') throw new Error('Only a union can allocate a strike fund.');
  if (organization.fundsUsd === undefined) throw new Error('This union has no tracked treasury; unavailable funds are not zero.');
  if (!Number.isSafeInteger(amountUsd) || amountUsd <= 0) throw new Error('Strike-fund allocation must be a positive integer.');
  if (organization.fundsUsd < amountUsd) throw new Error('Insufficient treasury funds.');
  const strikeFundUsd = (organization.strikeFundUsd ?? 0) + amountUsd;
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, fundsUsd: organization.fundsUsd - amountUsd, strikeFundUsd } } } };
}

/** A union records a dated labour claim (revendication). The claim is the causal purpose of a strike
 *  and the subject of a negotiation; it never writes fiscal or economy state directly. */
export function addUnionClaim(state: SimulationState, organizationId: string, issue: PoliticalIssue, targetBps: number, rationale: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization can record a claim.');
  if (organizationType(state, organization) !== 'union') throw new Error('Only a union records labour claims.');
  if (!Number.isSafeInteger(targetBps) || targetBps < 0 || targetBps > 10_000) throw new Error('Claim targets must be integers in 0..10000 basis points.');
  if (!rationale?.trim()) throw new Error('A claim requires a rationale.');
  const id = `claim.${(organization.claims ?? []).length.toString().padStart(4, '0')}.${deterministicFingerprint({ organizationId, issue, targetBps, madeOn: state.date })}`;
  const claims = [...(organization.claims ?? []), { id, madeOn: state.date, issue, targetBps, rationale: rationale.trim(), status: 'pending' as const }];
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, claims } } } };
}

/** Union negotiation: an executive or minister of the union's own Country settles a pending claim
 *  of a really active union. The settlement is a real recorded outcome: an accepted claim reaches
 *  the real lever — the head of government turns it into a corresponding government proposal; a
 *  minister's acceptance records the pending government response (ministers never hold the
 *  legislative initiative). */
export function negotiateUnionClaim(state: SimulationState, organizationId: string, claimId: string, actorPersonId: string, outcome: 'accepted' | 'rejected', agreedBps?: number): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active union can negotiate.');
  if (organizationType(state, organization) !== 'union') throw new Error('Only a union records and negotiates labour claims.');
  const claim = (organization.claims ?? []).find(item => item.id === claimId);
  if (!claim || claim.status !== 'pending') throw new Error('Only a pending claim can be negotiated.');
  const actor = state.governance.persons[actorPersonId];
  if (!actor || !['head_of_government', 'minister'].includes(actor.office?.role ?? '')) throw new Error('Only the head of government or a minister may negotiate a union claim.');
  const countryId = organizationCountryId(state, organization);
  if (!countryId || actor.office!.countryId !== countryId) throw new Error('A claim can only be negotiated by the union\'s own Country government.');
  if (outcome === 'accepted' && (agreedBps === undefined || !Number.isSafeInteger(agreedBps) || agreedBps < 0 || agreedBps > 10_000)) throw new Error('An accepted claim requires an agreed value in 0..10000 basis points.');
  let next = state;
  let acceptedIntoProposalId: string | undefined;
  let pendingGovernmentResponse = false;
  if (outcome === 'accepted' && agreedBps !== undefined) {
    // labour_protection claims map onto the real payroll lever: the current legal rule's employee
    // component moves to the agreed rate. Only the head of government holds the initiative; a
    // minister's acceptance is recorded as a pending government response.
    if (actor.office!.role === 'head_of_government' && claim.issue === 'labour_protection') {
      const currentPolicy = next.fiscal.countries[countryId]?.policy;
      if (currentPolicy?.payroll) {
        try {
          // The real payroll lever: the current legal policy (all tax kinds) with the payroll
          // rule's employee component moved to the agreed rate — never a fabricated partial Policy.
          const payroll = { ...structuredClone(currentPolicy.payroll), rateBps: undefined, bands: undefined, employee: [{ rateBps: agreedBps }] };
          const payload: FiscalProposalPayload = { policy: { ...currentPolicy, payroll } };
          next = createFiscalProposal(next, { proposerPersonId: actorPersonId, countryId, effectiveDate: state.date, payload });
          acceptedIntoProposalId = next.governance.proposalOrder[next.governance.proposalOrder.length - 1];
        } catch {
          pendingGovernmentResponse = true;
        }
      } else {
        pendingGovernmentResponse = true;
      }
    } else {
      pendingGovernmentResponse = true;
    }
  }
  const claims = (organization.claims ?? []).map(item => item.id === claimId ? {
    ...item, status: 'settled' as const,
    settlement: {
      on: state.date, byPersonId: actorPersonId, outcome,
      ...(agreedBps !== undefined ? { agreedBps } : {}),
      ...(acceptedIntoProposalId ? { acceptedIntoProposalId } : {}),
      ...(outcome === 'accepted' && pendingGovernmentResponse ? { pendingGovernmentResponse: true } : {}),
    },
  } : item);
  // A settled claim ends the ongoing strikes it caused.
  const activeStrikes = (organization.activeStrikes ?? []).map(strike => strike.status === 'ongoing' && strike.issue === claim.issue ? { ...strike, status: 'ended' as const } : strike);
  return { ...next, politics: { ...next.politics, organizations: { ...next.politics.organizations, [organizationId]: { ...organization, claims, activeStrikes } } } };
}

/** Fund an organization's cybersecurity program from its own treasury: the spending is a signed
 *  ledger event and the modelled defence rises with the share of the financial base devoted to it. */
export function fundCybersecurity(state: SimulationState, organizationId: string, amountUsd: number): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization can fund cybersecurity.');
  if (organization.fundsUsd === undefined) throw new Error('This organization has no tracked treasury; unavailable funds are not zero.');
  if (!Number.isSafeInteger(amountUsd) || amountUsd <= 0) throw new Error('Cybersecurity funding must be a positive integer.');
  if (organization.fundsUsd < amountUsd) throw new Error('Insufficient treasury funds.');
  const fundingEvents = [...(organization.fundingEvents ?? []), { on: state.date, amountUsd: -amountUsd, kind: 'cybersecurity_spending' as const }];
  const fundsUsd = organization.fundsUsd - amountUsd;
  const cyberSpentUsd = fundingEvents.filter(event => event.kind === 'cybersecurity_spending').reduce((sum, event) => sum - event.amountUsd, 0);
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, fundsUsd, fundingEvents, cyberSecurityBps: cyberSecurityBpsFor(fundsUsd + (organization.strikeFundUsd ?? 0), cyberSpentUsd) } } } };
}

/** An organization-to-organization cyber attack inside one Country: the attacker pays a real cost
 *  from its tracked treasury, and the theft it extracts is proportional to the target's unprotected
 *  share (10_000 - cyberSecurityBps). Stolen funds are transferred, never created; an untracked
 *  treasury cannot be stolen from (unavailable ≠ 0). */
export function runCyberAttack(state: SimulationState, sourceOrganizationId: string, targetOrganizationId: string): SimulationState {
  const source = activeOrganization(state, sourceOrganizationId);
  const target = activeOrganization(state, targetOrganizationId);
  if (source.status !== 'active' || target.status !== 'active') throw new Error('Only active organizations may conduct or suffer a cyber attack.');
  if (source.organizationId === target.organizationId) throw new Error('An organization cannot attack itself.');
  const sourceCountry = organizationCountryId(state, source), targetCountry = organizationCountryId(state, target);
  if (!sourceCountry || !targetCountry || sourceCountry !== targetCountry) throw new Error('A cyber attack only exists between organizations of the same Country.');
  if (source.fundsUsd === undefined) throw new Error('The attacker has no tracked treasury; a cyber attack cannot be financed from unavailable funds.');
  if (source.fundsUsd < CYBER_ATTACK_COST_USD) throw new Error('The attacker lacks the funds to finance a cyber attack.');
  const targetDefence = target.cyberSecurityBps ?? 0;
  const reachBps = 10_000 - targetDefence;
  const stolenUsd = target.fundsUsd === undefined ? 0 : Math.floor(target.fundsUsd * reachBps / 10_000);
  const sourceEvents = [...(source.fundingEvents ?? []), { on: state.date, amountUsd: -CYBER_ATTACK_COST_USD, kind: 'cyber_attack_cost' as const, counterpartOrganizationId: targetOrganizationId },
    ...(stolenUsd > 0 ? [{ on: state.date, amountUsd: stolenUsd, kind: 'cyber_theft' as const, counterpartOrganizationId: targetOrganizationId }] : [])];
  const targetEvents = stolenUsd > 0 ? [...(target.fundingEvents ?? []), { on: state.date, amountUsd: -stolenUsd, kind: 'cyber_theft' as const, counterpartOrganizationId: sourceOrganizationId }] : target.fundingEvents ?? [];
  const organizations = { ...state.politics.organizations };
  const sourceFunds = source.fundsUsd - CYBER_ATTACK_COST_USD + stolenUsd;
  const sourceCyberSpent = sourceEvents.filter(event => event.kind === 'cybersecurity_spending').reduce((sum, event) => sum - event.amountUsd, 0);
  const targetFunds = target.fundsUsd === undefined ? undefined : target.fundsUsd - stolenUsd;
  const targetCyberSpent = targetEvents.filter(event => event.kind === 'cybersecurity_spending').reduce((sum, event) => sum - event.amountUsd, 0);
  organizations[sourceOrganizationId] = { ...source, fundsUsd: sourceFunds, fundingEvents: sourceEvents, cyberSecurityBps: cyberSecurityBpsFor(sourceFunds + (source.strikeFundUsd ?? 0), sourceCyberSpent) };
  organizations[targetOrganizationId] = { ...target, fundsUsd: targetFunds, fundingEvents: targetEvents, cyberSecurityBps: cyberSecurityBpsFor(targetFunds === undefined ? undefined : targetFunds + (target.strikeFundUsd ?? 0), targetCyberSpent) };
  return { ...state, politics: { ...state.politics, organizations } };
}
