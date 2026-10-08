import type { SimulationState } from '../../types';
import { clearDirty } from '../dirty';
import type { SimulationScheduler } from '../scheduler';
import { allocate, ratio } from '../socioeconomy/model';
import { aggregateNationalSupport } from './aggregation';
import { cohortTraits, initialPreferences, organizationStateFor, partyOrganizationStateFor, politicalExperienceFor, supportFor } from './initialization';
import { POLITICAL_ISSUES, POLITICS_MODEL as M, type CohortPoliticalOpinion, type OrganizationPoliticalState, type PoliticalIssue, type PoliticalParty, type RegionalPoliticalOpinion } from './model';
import { politicalRegistry } from './registry';
import { deterministicFingerprint } from '../fingerprint';

const clamp = (value: number) => Math.max(0, Math.min(10_000, Math.round(value)));
const blend = (prior: number, target: number, inertia: number) => clamp((prior * inertia + target * (10_000 - inertia)) / 10_000);
const ratioBps = (value: number, denominator: number) => denominator > 0 ? clamp(ratio(value, 10_000, denominator)) : 0;
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
  const tax = current.taxBurdenBps ?? 0, taxEffect = income === 'low' ? tax : income === 'high' ? -Math.round(tax / 2) : Math.round(tax / 4);
  const material = [incomeDecline + taxEffect, serviceGap, current.unemploymentBps, incomeDecline + needsGap, infrastructureGap, Math.floor(distress / 4)];
  const preferences = [...opinion[0]], salience = [...opinion[1]], drivers: number[] = [];
  POLITICAL_ISSUES.forEach((issue, index) => { const directional = issue === 'public_order' ? material[index] : material[index] * (income === 'high' && issue === 'fiscal_distribution' ? -1 : 1); preferences[index] = blend(preferences[index], clamp(basePreference(cohortId, issue) + directional / 2), M.preferenceInertiaBps); salience[index] = blend(salience[index], clamp(4_000 + Math.abs(material[index])), M.salienceInertiaBps); if (Math.abs(material[index]) >= 500) drivers.push(index); });
  const target = supportFor(preferences, salience, opinion[3], parties), prior = opinion[2].length === target.length ? opinion[2] : supportFor(preferences, salience, opinion[3], parties);
  const support = allocate(10_000, target.map((value, index) => prior[index] * M.opinionInertiaBps + value * (10_000 - M.opinionInertiaBps)));
  return [preferences, salience, support, opinion[3], sentimentMagnitude ? -sentimentMagnitude : 0, baseline, drivers];
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
    countries[countryId] = { ...countries[countryId], regionIds, nationalSupportBps: aggregateNationalSupport(state, regionIds, regionalOpinion, partyCount), recentOpinionDrivers: [...countries[countryId].recentOpinionDrivers, { date: state.date, drivers }].slice(-M.historyLimit) };
  }
  const organizations: Record<string, OrganizationPoliticalState> = {};
  for (const item of Object.values(politicalRegistry.organizations)) {
    if (countries[item.countryId]) organizations[item.id] = organizationStateFor(state, item, regionalOpinion, state.date, politics.organizations[item.id]);
  }
  for (const party of Object.values(politicalRegistry.parties)) {
    if (countries[party.countryId]) organizations[party.id] = partyOrganizationStateFor(party, state.date, politics.organizations[party.id]);
  }
  // Dynamically registered organizations are preserved: a weekly opinion pass never wipes mutable state.
  for (const [id, organization] of Object.entries(politics.organizations)) {
    if (organization.source === 'dynamic') organizations[id] = organization;
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

/** Join an organization (reuses the registry organizationId; never a second registry). */
export function joinOrganization(state: SimulationState, personId: string, organizationId: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization admits members.');
  const members = { ...organization.members, [personId]: { personId, role: 'member' as const, joinedOn: state.date } };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, members } } } };
}

export function leaveOrganization(state: SimulationState, personId: string, organizationId: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  const members = { ...organization.members }; delete members[personId];
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, members } } } };
}

/** Dissolve an organization (no longer active). */
export function dissolveOrganization(state: SimulationState, organizationId: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, status: 'dissolved' } } } };
}

/** Procedurally ban an organization with an accountable, authorized actor, motive and evidence. An
 *  executive may only ban an organization in their own Country. */
export function banOrganization(state: SimulationState, organizationId: string, actorPersonId: string, motive: string, evidence: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  const actor = state.governance.persons[actorPersonId];
  if (!actor || !['head_of_government', 'head_of_state'].includes(actor.office?.role ?? '')) throw new Error('Only the executive head may ban an organization.');
  const countryId = politicalRegistry.organizations[organizationId]?.countryId ?? organization.countryId;
  if (!countryId || actor.office!.countryId !== countryId) throw new Error('An executive may only ban an organization in their own Country.');
  if (!motive?.trim() || !evidence?.trim()) throw new Error('A ban requires an explicit motive and evidence.');
  const banEvents = [...organization.banEvents, { date: state.date, actorPersonId, motive, evidence }];
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, status: 'banned', banEvents } } } };
}

/** Appeal a ban: records the appeal but never automatically restores the organization. */
export function appealBan(state: SimulationState, organizationId: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'banned') throw new Error('Only a banned organization may appeal.');
  const banEvents = [...organization.banEvents]; const last = banEvents.at(-1);
  if (!last || last.appealedOn) throw new Error('This ban has no pending appeal.');
  banEvents[banEvents.length - 1] = { ...last, appealedOn: state.date };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, banEvents } } } };
}

/** Resolve a pending ban appeal: a real decision by an authorized executive in the organization's
 *  own Country. The appeal restores the organization only when the decision says so. */
export function resolveBanAppeal(state: SimulationState, organizationId: string, actorPersonId: string, decision: 'restore' | 'uphold'): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'banned') throw new Error('Only a banned organization has an appeal to resolve.');
  const banEvents = [...organization.banEvents]; const last = banEvents.at(-1);
  if (!last?.appealedOn) throw new Error('This ban has no pending appeal.');
  const actor = state.governance.persons[actorPersonId];
  if (!actor || !['head_of_government', 'head_of_state'].includes(actor.office?.role ?? '')) throw new Error('Only the executive head may resolve a ban appeal.');
  const countryId = politicalRegistry.organizations[organizationId]?.countryId ?? organization.countryId;
  if (!countryId || actor.office!.countryId !== countryId) throw new Error('An executive may only resolve an appeal in their own Country.');
  banEvents[banEvents.length - 1] = { ...last, appealByPersonId: actorPersonId, appealDecision: decision, appealResolvedOn: state.date };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, status: decision === 'restore' ? 'active' : 'banned', banEvents } } } };
}

/** Donate to an organization from a real donor: the amount is deducted from the donor's personal
 *  treasury, never created ex nihilo, and unavailable funds are never treated as zero. */
export function donateToOrganization(state: SimulationState, organizationId: string, donorPersonId: string, amountUsd: number): SimulationState {
  const organization = activeOrganization(state, organizationId);
  const donor = state.governance.persons[donorPersonId];
  if (!donor) throw new Error('Unknown donor person.');
  if (!Number.isSafeInteger(amountUsd) || amountUsd <= 0) throw new Error('Donation must be a positive integer.');
  if (organization.fundsUsd === undefined) throw new Error('This organization has no tracked treasury; a donation cannot be added to unavailable funds.');
  if (donor.personalFundsUsd === undefined) throw new Error('The donor has no personal treasury; unavailable funds are not zero.');
  if (donor.personalFundsUsd < amountUsd) throw new Error('The donor has insufficient personal funds.');
  return {
    ...state,
    governance: { ...state.governance, persons: { ...state.governance.persons, [donor.id]: { ...donor, personalFundsUsd: donor.personalFundsUsd - amountUsd } } },
    politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, fundsUsd: organization.fundsUsd + amountUsd } } },
  };
}

/** Register an internal current (a modelled faction; not an observed faction share). */
export function addInternalCurrent(state: SimulationState, organizationId: string, currentId: string, name: string, salienceBps: number): SimulationState {
  const organization = activeOrganization(state, organizationId);
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, internalCurrents: { ...organization.internalCurrents, [currentId]: { id: currentId, name, salienceBps } } } } } };
}

/** Register a new mutable organization (pluralism). Its identity is deterministic and it starts with
 *  a known-empty treasury; positions are modelled-neutral, never a fabricated sourced ideology. */
export function registerOrganization(state: SimulationState, input: { countryId: string; type: 'union' | 'association' | 'party'; displayName: string; representedInterests?: string[]; representedCohorts?: Array<'low' | 'middle' | 'high'>; issuePriorities?: PoliticalIssue[] }): SimulationState {
  if (!state.politics.countries[input.countryId]) throw new Error('Unknown Country for organization registration.');
  if (!input.displayName.trim()) throw new Error('An organization requires a display name.');
  const id = `organization.dynamic.${deterministicFingerprint({ countryId: input.countryId, type: input.type, displayName: input.displayName.trim(), registeredOn: state.date })}`;
  if (state.politics.organizations[id]) throw new Error('This organization is already registered.');
  const currentPositions = Object.fromEntries(POLITICAL_ISSUES.map(issue => [issue, 5_000])) as Record<PoliticalIssue, number>;
  const entry: OrganizationPoliticalState = { organizationId: id, currentPositions, lastUpdatedOn: state.date, recentDrivers: [], status: 'active', members: {}, fundsUsd: 0, internalCurrents: {}, banEvents: [], countryId: input.countryId, type: input.type, displayName: input.displayName.trim(), source: 'dynamic' };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [id]: entry } } };
}

/** Merge two active organizations of the same Country: members, funds and internal currents transfer
 *  to the target; the absorbed organization is dissolved. Unavailable funds stay unavailable. */
export function mergeOrganizations(state: SimulationState, targetId: string, absorbedId: string): SimulationState {
  const target = activeOrganization(state, targetId);
  const absorbed = activeOrganization(state, absorbedId);
  if (target.organizationId === absorbed.organizationId) throw new Error('An organization cannot merge into itself.');
  if (target.status !== 'active' || absorbed.status !== 'active') throw new Error('Only active organizations may merge.');
  if (target.countryId && absorbed.countryId && target.countryId !== absorbed.countryId) throw new Error('Merging organizations must belong to the same Country.');
  const fundsUsd = target.fundsUsd === undefined || absorbed.fundsUsd === undefined ? undefined : target.fundsUsd + absorbed.fundsUsd;
  const members = { ...absorbed.members };
  for (const [personId, membership] of Object.entries(target.members)) members[personId] = membership;
  const internalCurrents = { ...absorbed.internalCurrents, ...target.internalCurrents };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [targetId]: { ...target, fundsUsd, members, internalCurrents }, [absorbedId]: { ...absorbed, status: 'dissolved' } } } };
}

/** Split an active organization: a deterministic portion of members and funds forms a new dynamic
 *  organization; the original keeps the remainder. Unavailable funds stay unavailable. */
export function splitOrganization(state: SimulationState, organizationId: string, newDisplayName: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization may split.');
  if (!newDisplayName.trim()) throw new Error('A split organization requires a display name.');
  const countryId = organization.countryId;
  if (!countryId) throw new Error('The organization has no Country.');
  const newId = `organization.dynamic.${deterministicFingerprint({ countryId, type: organization.type, displayName: newDisplayName.trim(), splitFrom: organizationId, on: state.date })}`;
  const funds = organization.fundsUsd;
  const half = funds === undefined ? undefined : Math.floor(funds / 2);
  const remaining = funds === undefined ? undefined : funds - Math.floor(funds / 2);
  const memberIds = Object.keys(organization.members).sort();
  const splitCount = Math.floor(memberIds.length / 2);
  const splitMemberIds = new Set(memberIds.slice(0, splitCount));
  const members = Object.fromEntries(Object.entries(organization.members).filter(([personId]) => !splitMemberIds.has(personId)));
  const newMembers = Object.fromEntries([...splitMemberIds].map(personId => [personId, organization.members[personId]]));
  const newEntry: OrganizationPoliticalState = { ...organization, organizationId: newId, displayName: newDisplayName.trim(), members: newMembers, fundsUsd: half, recentDrivers: [], lastUpdatedOn: state.date, source: 'dynamic' };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, members, fundsUsd: remaining }, [newId]: newEntry } } };
}

/** A public action (sit-in / demonstration / strike) is gated by the organization type, the
 *  constitution's rights and the state of emergency; it adds a causal opinion driver, never a bonus. */
export function runOrganizationAction(state: SimulationState, organizationId: string, action: 'sit_in' | 'demonstration' | 'strike'): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('A dissolved or banned organization cannot act.');
  const registryOrg = politicalRegistry.organizations[organizationId];
  const type = registryOrg?.type ?? 'association';
  if (action === 'strike' && type !== 'union') throw new Error('Only a union may strike.');
  const countryId = registryOrg?.countryId;
  const constitution = countryId ? state.constitution.countries[countryId] : undefined;
  if (action === 'strike' && constitution?.emergency.restrictions.strikesBanned) throw new Error('Strikes are banned under the state of emergency.');
  if (action !== 'strike' && constitution?.emergency.restrictions.assembliesBanned) throw new Error('Assemblies are banned under the state of emergency.');
  // A missing constitutional guarantee does NOT mean the action is illegal; ordinary law determines it.
  const issueIndex = action === 'strike' ? POLITICAL_ISSUES.indexOf('labour_protection') : POLITICAL_ISSUES.indexOf('public_order');
  const issues = issueIndex >= 0 ? [POLITICAL_ISSUES[issueIndex]] : [];
  const driver = { date: state.date, issues };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, lastUpdatedOn: state.date, recentDrivers: [...organization.recentDrivers, driver].slice(-M.historyLimit) } } } };
}
