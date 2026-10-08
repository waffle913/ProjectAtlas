import type { SimulationState } from '../../types';
import { clearDirty } from '../dirty';
import type { SimulationScheduler } from '../scheduler';
import { allocate, ratio } from '../socioeconomy/model';
import { aggregateNationalSupport } from './aggregation';
import { cohortTraits, evolvePositionsWithCurrents, initialPreferences, organizationStateFor, partyOrganizationStateFor, politicalExperienceFor, supportFor } from './initialization';
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
    if (organization.source === 'dynamic') {
      // Dynamic parties also evolve progressively: their internal currents move the mutable line.
      organizations[id] = organization.type === 'party'
        ? { ...organization, currentPositions: evolvePositionsWithCurrents(organization.currentPositions, Object.values(organization.internalCurrents ?? {})), lastUpdatedOn: state.date }
        : organization;
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
 *  active person of the organization's Country is required. */
export function joinOrganization(state: SimulationState, personId: string, organizationId: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization admits members.');
  const person = state.governance.persons[personId];
  if (!person || person.status !== 'active') throw new Error('Only an active political person may join an organization.');
  const countryId = politicalRegistry.organizations[organizationId]?.countryId ?? organization.countryId;
  if (countryId && person.countryId !== countryId) throw new Error('A person may only join an organization of their own Country.');
  const members = { ...organization.members, [personId]: { personId, role: 'member' as const, joinedOn: state.date } };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, members } } } };
}

export function leaveOrganization(state: SimulationState, personId: string, organizationId: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  const members = { ...organization.members }; delete members[personId];
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, members } } } };
}

/** Dissolve an organization procedurally: only an executive of the organization's own Country may,
 *  with an explicit, recorded motive. */
export function dissolveOrganization(state: SimulationState, organizationId: string, actorPersonId: string, motive: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  const actor = state.governance.persons[actorPersonId];
  if (!actor || !['head_of_government', 'head_of_state'].includes(actor.office?.role ?? '')) throw new Error('Only the executive head may dissolve an organization.');
  const countryId = politicalRegistry.organizations[organizationId]?.countryId ?? organization.countryId;
  if (!countryId || actor.office!.countryId !== countryId) throw new Error('An executive may only dissolve an organization in their own Country.');
  if (!motive?.trim()) throw new Error('A dissolution requires an explicit motive.');
  const dissolutionEvents = [...(organization.dissolutionEvents ?? []), { date: state.date, actorPersonId, motive: motive.trim() }];
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, status: 'dissolved', dissolutionEvents } } } };
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
 *  treasury, never created ex nihilo, and unavailable funds are never treated as zero. Every inflow
 *  is recorded in the organization's dated funding ledger. */
export function donateToOrganization(state: SimulationState, organizationId: string, donorPersonId: string, amountUsd: number): SimulationState {
  const organization = activeOrganization(state, organizationId);
  const donor = state.governance.persons[donorPersonId];
  if (!donor) throw new Error('Unknown donor person.');
  if (!Number.isSafeInteger(amountUsd) || amountUsd <= 0) throw new Error('Donation must be a positive integer.');
  if (organization.fundsUsd === undefined) throw new Error('This organization has no tracked treasury; a donation cannot be added to unavailable funds.');
  if (donor.personalFundsUsd === undefined) throw new Error('The donor has no personal treasury; unavailable funds are not zero.');
  if (donor.personalFundsUsd < amountUsd) throw new Error('The donor has insufficient personal funds.');
  const fundingEvents = [...(organization.fundingEvents ?? []), { on: state.date, amountUsd, kind: 'donation' as const, actorPersonId: donorPersonId }];
  return {
    ...state,
    governance: { ...state.governance, persons: { ...state.governance.persons, [donor.id]: { ...donor, personalFundsUsd: donor.personalFundsUsd - amountUsd } } },
    politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, fundsUsd: organization.fundsUsd + amountUsd, fundingEvents } } },
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
 *  religious family is representable with unavailable coverage (no sourced religious organization). */
export function registerOrganization(state: SimulationState, input: { countryId: string; type: 'union' | 'association' | 'party' | 'religious'; displayName: string; representedInterests?: string[]; representedCohorts?: Array<'low' | 'middle' | 'high'>; issuePriorities?: PoliticalIssue[] }): SimulationState {
  if (!state.politics.countries[input.countryId]) throw new Error('Unknown Country for organization registration.');
  if (!input.displayName.trim()) throw new Error('An organization requires a display name.');
  const id = `organization.dynamic.${deterministicFingerprint({ countryId: input.countryId, type: input.type, displayName: input.displayName.trim(), registeredOn: state.date })}`;
  if (state.politics.organizations[id]) throw new Error('This organization is already registered.');
  const currentPositions = Object.fromEntries(POLITICAL_ISSUES.map(issue => [issue, 5_000])) as Record<PoliticalIssue, number>;
  const entry: OrganizationPoliticalState = { organizationId: id, currentPositions, lastUpdatedOn: state.date, recentDrivers: [], status: 'active', members: {}, fundsUsd: 0, internalCurrents: {}, banEvents: [], fundingEvents: [{ on: state.date, amountUsd: 0, kind: 'seed' }], strikeFundUsd: 0, claims: [], dissolutionEvents: [], countryId: input.countryId, type: input.type, displayName: input.displayName.trim(), source: 'dynamic' };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [id]: entry } } };
}

/** Merge two active organizations of the same Country: members, funds, strike funds, claims and the
 *  full funding ledgers transfer to the target; the absorbed organization is dissolved. Unavailable
 *  funds stay unavailable. */
export function mergeOrganizations(state: SimulationState, targetId: string, absorbedId: string): SimulationState {
  const target = activeOrganization(state, targetId);
  const absorbed = activeOrganization(state, absorbedId);
  if (target.organizationId === absorbed.organizationId) throw new Error('An organization cannot merge into itself.');
  if (target.status !== 'active' || absorbed.status !== 'active') throw new Error('Only active organizations may merge.');
  if (target.countryId && absorbed.countryId && target.countryId !== absorbed.countryId) throw new Error('Merging organizations must belong to the same Country.');
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
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [targetId]: { ...target, fundsUsd, strikeFundUsd, fundingEvents, members, internalCurrents, claims, cyberSecurityBps: cyberSecurityBpsFor(fundsUsd, cyberSpentUsd) }, [absorbedId]: { ...absorbed, status: 'dissolved' } } } };
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
  const newEntry: OrganizationPoliticalState = { ...organization, organizationId: newId, displayName: newDisplayName.trim(), members: newMembers, fundsUsd: half, fundingEvents: newEvents, strikeFundUsd: 0, claims: [], recentDrivers: [], lastUpdatedOn: state.date, source: 'dynamic' };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, members, fundsUsd: remaining, fundingEvents: originalEvents }, [newId]: newEntry } } };
}

const STRIKE_COST_USD = 1_000;
const CYBER_ATTACK_COST_USD = 1_000;

const organizationCountryId = (state: SimulationState, organization: OrganizationPoliticalState): string | undefined =>
  politicalRegistry.organizations[organization.organizationId]?.countryId ?? organization.countryId;

const organizationType = (state: SimulationState, organization: OrganizationPoliticalState): NonNullable<OrganizationPoliticalState['type']> =>
  politicalRegistry.organizations[organization.organizationId]?.type ?? organization.type ?? 'association';

/** The modelled cybersecurity posture: the share of the tracked financial base (remaining funds plus
 *  what was already spent) devoted to cybersecurity. Spending nothing yields 0; spending the whole
 *  base yields 10_000. `undefined` when the treasury is untracked (unavailable ≠ 0). */
const cyberSecurityBpsFor = (fundsUsd: number | undefined, cyberSpentUsd: number): number | undefined => {
  if (fundsUsd === undefined) return undefined;
  const base = fundsUsd + cyberSpentUsd;
  return base <= 0 ? 0 : clamp(ratio(cyberSpentUsd, 10_000, base));
};

/** A public action is gated by the organization family (strike=union, petition=association,
 *  rally=party), the constitution's rights and the state of emergency; it adds a causal opinion
 *  driver, never a bonus. A strike requires a pending union claim (a purpose) and, when the union
 *  tracks a treasury, a sufficient strike fund. */
export function runOrganizationAction(state: SimulationState, organizationId: string, action: 'sit_in' | 'demonstration' | 'strike' | 'petition' | 'rally'): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('A dissolved or banned organization cannot act.');
  const type = organizationType(state, organization);
  if (action === 'strike' && type !== 'union') throw new Error('Only a union may strike.');
  if (action === 'petition' && type !== 'association') throw new Error('Only an association may petition.');
  if (action === 'rally' && type !== 'party') throw new Error('Only a party may hold a campaign rally.');
  const countryId = organizationCountryId(state, organization);
  const constitution = countryId ? state.constitution.countries[countryId] : undefined;
  if (action === 'strike' && constitution?.emergency.restrictions.strikesBanned) throw new Error('Strikes are banned under the state of emergency.');
  if (action !== 'strike' && constitution?.emergency.restrictions.assembliesBanned) throw new Error('Assemblies are banned under the state of emergency.');
  let fundingEvents = organization.fundingEvents ?? [];
  let strikeFundUsd = organization.strikeFundUsd;
  if (action === 'strike') {
    const pending = (organization.claims ?? []).some(claim => claim.status === 'pending');
    if (!pending) throw new Error('A strike requires a pending union claim; a strike never creates its own cause.');
    if (organization.fundsUsd !== undefined) {
      const available = strikeFundUsd ?? 0;
      if (available < STRIKE_COST_USD) throw new Error('The union strike fund cannot sustain this strike; allocate strike funds first.');
      strikeFundUsd = available - STRIKE_COST_USD;
      fundingEvents = [...fundingEvents, { on: state.date, amountUsd: -STRIKE_COST_USD, kind: 'strike_cost' as const }];
    }
  }
  // A missing constitutional guarantee does NOT mean the action is illegal; ordinary law determines it.
  const issueIndex = action === 'strike' ? POLITICAL_ISSUES.indexOf('labour_protection') : POLITICAL_ISSUES.indexOf('public_order');
  const issues = issueIndex >= 0 ? [POLITICAL_ISSUES[issueIndex]] : [];
  const driver = { date: state.date, issues };
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, lastUpdatedOn: state.date, strikeFundUsd, fundingEvents, recentDrivers: [...organization.recentDrivers, driver].slice(-M.historyLimit) } } } };
}

/** Deterministic financing with provenance: a one-time seed of the organization's tracked treasury.
 *  The seed is a dated ledger event, so funding is always traceable and never ex nihilo. An untouched
 *  known-empty treasury (zero funds, all-zero ledger) may still be seeded; funding history never. */
export function setOrganizationFunds(state: SimulationState, organizationId: string, amountUsd: number, source: string): SimulationState {
  const organization = activeOrganization(state, organizationId);
  if (organization.status !== 'active') throw new Error('Only an active organization can be funded.');
  const untouched = organization.fundsUsd === 0 && (organization.fundingEvents ?? []).every(event => event.amountUsd === 0);
  if (organization.fundsUsd !== undefined && !untouched) throw new Error('This organization already has a tracked treasury; a second seed would rewrite history.');
  if (!Number.isSafeInteger(amountUsd) || amountUsd < 0) throw new Error('Seed funding must be a non-negative integer.');
  if (!source?.trim()) throw new Error('Seed funding requires a provenance source.');
  const fundingEvents = [...(organization.fundingEvents ?? []), { on: state.date, amountUsd, kind: 'seed' as const }];
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, fundsUsd: amountUsd, strikeFundUsd: organization.strikeFundUsd ?? 0, fundingEvents, cyberSecurityBps: cyberSecurityBpsFor(amountUsd, 0) } } } };
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

/** Union negotiation: an executive or minister of the union's own Country settles a pending claim.
 *  The settlement is a real recorded outcome; it never writes fiscal or economy state directly. */
export function negotiateUnionClaim(state: SimulationState, organizationId: string, claimId: string, actorPersonId: string, outcome: 'accepted' | 'rejected', agreedBps?: number): SimulationState {
  const organization = activeOrganization(state, organizationId);
  const claim = (organization.claims ?? []).find(item => item.id === claimId);
  if (!claim || claim.status !== 'pending') throw new Error('Only a pending claim can be negotiated.');
  const actor = state.governance.persons[actorPersonId];
  if (!actor || !['head_of_government', 'minister'].includes(actor.office?.role ?? '')) throw new Error('Only the head of government or a minister may negotiate a union claim.');
  const countryId = organizationCountryId(state, organization);
  if (!countryId || actor.office!.countryId !== countryId) throw new Error('A claim can only be negotiated by the union\'s own Country government.');
  if (outcome === 'accepted' && (agreedBps === undefined || !Number.isSafeInteger(agreedBps) || agreedBps < 0 || agreedBps > 10_000)) throw new Error('An accepted claim requires an agreed value in 0..10000 basis points.');
  const claims = (organization.claims ?? []).map(item => item.id === claimId ? { ...item, status: 'settled' as const, settlement: { on: state.date, byPersonId: actorPersonId, outcome, ...(agreedBps !== undefined ? { agreedBps } : {}) } } : item);
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, claims } } } };
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
  return { ...state, politics: { ...state.politics, organizations: { ...state.politics.organizations, [organizationId]: { ...organization, fundsUsd, fundingEvents, cyberSecurityBps: cyberSecurityBpsFor(fundsUsd, cyberSpentUsd) } } } };
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
  organizations[sourceOrganizationId] = { ...source, fundsUsd: source.fundsUsd - CYBER_ATTACK_COST_USD + stolenUsd, fundingEvents: sourceEvents };
  organizations[targetOrganizationId] = { ...target, fundsUsd: target.fundsUsd === undefined ? undefined : target.fundsUsd - stolenUsd, fundingEvents: targetEvents };
  return { ...state, politics: { ...state.politics, organizations } };
}
