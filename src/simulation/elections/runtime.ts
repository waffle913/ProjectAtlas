import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import type { ProposalKind, ProposalPayloadByKind } from '../governance/model';
import { politicalRegistry } from '../politics/registry';
import { COHORT, IDEOLOGY_DIMENSIONS, POLITICAL_ISSUES, type IssuePosition, type PoliticalIssue, type PoliticalParty } from '../politics/model';
import { supportFor } from '../politics/initialization';
import { allocate, ratio } from '../socioeconomy/model';
import { transferPoliticalOffice, revokePoliticalOffice } from '../governance/runtime';
import { allocatePartySeats, partyVoteDistributionFromAgreement } from '../governance/internalPartyDistribution';
import { governmentRecordPartyEvaluation } from '../governance/runtime';
import { analyzeProposal, evaluateProfileForPublic } from '../governance/analysis';
import type { PoliticalProposal } from '../governance/model';
import type { TaxKind } from '../fiscal/model';
import { addYearsToDate } from '../constitution/runtime';
import { ELECTIONS_VERSION, proportionalSeats, type CampaignPromise, type ElectionChamberState, type ElectionCountryState, type GovernmentConfidence, type HeadOfStateElectionRecord, type PartyElectionState, type PromiseStatus } from './model';
import type { ElectionConstitution } from '../constitution/model';

const isExecutive = (state: SimulationState, personId: string, countryId: string): boolean => {
  const person = state.governance.persons[personId];
  return Boolean(person?.status === 'active' && person.office?.countryId === countryId && ['head_of_government', 'head_of_state'].includes(person.office.role));
};

const countryEntry = (state: SimulationState, countryId: string): ElectionCountryState => {
  const entry = state.elections.countries[countryId];
  if (!entry) throw new Error('No election state for this Country.');
  return entry;
};

const partyIdsFor = (countryId: string): string[] => politicalRegistry.countries[countryId]?.partyIds ?? [];

const organizationStatusFor = (state: SimulationState, partyId: string): string | undefined =>
  state.politics.organizations[partyId]?.status;

/** Registered parties that may receive seats: a banned or dissolved party organization is excluded
 *  from the electoral contest (it never keeps receiving seats as if active). The registry order is
 *  preserved, so support indexes never shift when a party is excluded — B's support stays B's. */
const activeRegistryPartyIds = (state: SimulationState, countryId: string): string[] => {
  const statuses = new Map(partyIdsFor(countryId).map(partyId => [partyId, organizationStatusFor(state, partyId)]));
  return partyIdsFor(countryId).filter(partyId => statuses.get(partyId) !== 'banned' && statuses.get(partyId) !== 'dissolved');
};

/** Dynamic parties (created/split at runtime) enter the ballot through the canonical registration
 *  rule: a registered, active party organization of the Country. They are never eternally off the
 *  ballot, and a banned/dissolved dynamic party leaves it. */
const activeDynamicPartyIds = (state: SimulationState, countryId: string): string[] =>
  Object.entries(state.politics.organizations)
    .filter(([, organization]) => organization.type === 'party' && organization.source === 'dynamic' && organization.countryId === countryId && organization.status === 'active')
    .map(([organizationId]) => organizationId)
    .sort();

/** All contesting parties in ballot order: registry parties first (registry order), then dynamic
 *  parties (stable id order). */
const contestingPartyIds = (state: SimulationState, countryId: string): string[] =>
  [...activeRegistryPartyIds(state, countryId), ...activeDynamicPartyIds(state, countryId)];

const registryIndexFor = (countryId: string, partyId: string): number => partyIdsFor(countryId).indexOf(partyId);

/** A dynamic party's modelled ballot profile: its mutable organizational party line (moved by its
 *  internal currents), never a fabricated sourced ideology. */
const dynamicPartyProfile = (state: SimulationState, partyId: string): PoliticalParty | undefined => {
  const organization = state.politics.organizations[partyId];
  if (!organization?.currentPositions) return undefined;
  const issuePositions = {} as Record<PoliticalIssue, IssuePosition>;
  for (const issue of POLITICAL_ISSUES) {
    issuePositions[issue] = {
      preferenceBps: organization.currentPositions[issue],
      intensityBps: 5_000,
      confidenceBps: 5_000,
      materialInterests: [],
      ideologicalPrior: 'modelled_dynamic_party_line',
    };
  }
  return {
    id: partyId,
    countryId: organization.countryId ?? '',
    displayName: organization.displayName ?? partyId,
    fictional: true,
    provenance: { status: 'modelled', referenceDate: state.date, retrievedAt: state.date, source: 'dynamic_organization', limitation: 'Modelled ballot profile of a dynamically registered party.' },
    sourceBasis: { sourcePartyId: partyId, sourcePartyName: organization.displayName ?? partyId },
    ideology: Object.fromEntries(IDEOLOGY_DIMENSIONS.map(dimension => [dimension, 5_000])) as Record<typeof IDEOLOGY_DIMENSIONS[number], number>,
    issuePositions,
    constituencies: [],
    politicalFamily: { status: 'modelled' as const },
    ideologicalBasis: {
      status: 'modelled_fallback',
      method: 'dynamic_organization_line_v1',
      confidenceBps: 500,
      temporalStatus: 'unavailable',
      limitation: 'The dynamic party\'s ballot profile is its modelled organizational line; no sourced ideology is asserted.',
    },
    currentSeats: null,
    governmentStatus: 'unavailable',
  };
};

/** The constitution's election rules are usable only when both the parliamentary system and the
 *  number of rounds are known; unavailable must never be reinterpreted as proportional/one-round. */
const electionAvailable = (state: SimulationState, countryId: string): boolean => {
  const election = state.constitution.countries[countryId]?.election;
  return Boolean(election && election.parliamentarySystem !== 'unavailable' && election.rounds !== 'unavailable');
};

/** Real participation effect of the suffrage rules in force: mandatory voting turns every cohort
 *  out (participation 100%); otherwise the modelled engagement turnout applies. */
const turnoutBpsFor = (engagementBps: number, election: ElectionConstitution | undefined): number =>
  election?.mandatoryVoting === true ? 10_000 : engagementBps;

/** Eligibility coverage of the electorate under the suffrage rules in force. `votingAge` and
 *  `restricted` suffrage change the electorate really: the under-age/ineligible share of the
 *  population is not available in the socioeconomy (no age structure, no sourced eligibility), so
 *  the eligibility coverage is recorded as partial/unavailable instead of silently assuming a
 *  universal electorate. */
const eligibilityCoverageFor = (election: ElectionConstitution | undefined): { coverage: 'complete' | 'partial' | 'unavailable'; limitation: string } => {
  if (!election) return { coverage: 'unavailable', limitation: 'No constitutional election rules are available; the electorate coverage is unknown.' };
  if (election.suffrage === 'restricted') return { coverage: 'partial', limitation: 'Suffrage is constitutionally restricted, but the sourced eligibility structure is unavailable; the ineligible share of the population is not counted as voters and remains unknown.' };
  if (election.votingAge !== undefined) return { coverage: 'partial', limitation: `A voting age (${election.votingAge}) is in force, but no sourced age structure exists; the under-age share of the population is not counted as voters and remains unknown.` };
  if (election.suffrage === 'universal') return { coverage: 'complete', limitation: 'Universal suffrage with no voting age in force; every represented cohort is eligible.' };
  return { coverage: 'unavailable', limitation: 'The suffrage rule is unavailable; the electorate coverage is unknown.' };
};

/** Modelled voter response to a party's promise credibility: 0 bps halves the party's vote weight,
 *  10000 bps leaves it unchanged. Credibility is derived from fulfilled/broken promises, never invented. */
const credibilityFactorBps = (party: PartyElectionState | undefined): number =>
  party?.credibilityBps === undefined ? 10_000 : 5_000 + Math.floor(party.credibilityBps / 2);

const clampFactor = (value: number) => Math.max(7_500, Math.min(12_500, Math.round(value)));

/** The content of a party's pending substantive promises is evaluated against the voters' own
 *  preferences: an appreciated promise raises the party's vote weight, a rejected promise lowers it
 *  — opposite effects, never a flat bonus for merely carrying a payload. */
const promiseContentFactorBps = (state: SimulationState, countryId: string, party: PartyElectionState | undefined): number => {
  const substantive = party?.promises.filter(p => p.status === 'pending' && p.promisedPayload && Object.keys(p.promisedPayload).length) ?? [];
  if (!substantive.length) return 10_000;
  const nets = substantive.map(promise => promiseEvaluationNetBps(state, countryId, promise));
  const average = nets.reduce((sum, value) => sum + value, 0) / nets.length;
  return clampFactor(10_000 + average / 2);
};

/** Net preference of the represented cohorts for one promise's content: positive when the cohorts
 *  appreciate the promised content, negative when they reject it. */
const promiseEvaluationNetBps = (state: SimulationState, countryId: string, promise: CampaignPromise): number => {
  const proposal = promiseProposalFor(state, countryId, promise);
  const analysis = analyzeProposal(state, proposal);
  const country = state.politics.countries[countryId];
  let net = 0, persons = 0;
  for (const regionId of [...(country?.regionIds ?? [])].sort()) {
    const socio = state.socioeconomy.regions[regionId];
    const opinion = state.politics.regionalOpinion[regionId];
    if (!socio || !opinion) continue;
    for (const [cohortId, cohortOpinion] of Object.entries(opinion.cohorts).sort(([a], [b]) => a.localeCompare(b))) {
      const cohort = socio.cohorts.find(item => `${item.income}:${item.orientation}` === cohortId);
      if (!cohort || cohort.persons <= 0) continue;
      const goals = {} as Record<string, { idealPointBps: number; importanceBps: number; compromiseToleranceBps: number; confidenceBps: number; status: 'modelled_fallback' }>;
      POLITICAL_ISSUES.forEach((issue, index) => {
        goals[issue] = {
          idealPointBps: cohortOpinion[COHORT.preferences][index],
          importanceBps: cohortOpinion[COHORT.salience][index],
          compromiseToleranceBps: Math.max(1_500, Math.min(9_000, Math.round(8_000 - cohortOpinion[COHORT.salience][index] * 0.4 - Math.abs(cohortOpinion[COHORT.preferences][index] - 5_000) * 0.2))),
          confidenceBps: Math.min(7_000, cohortOpinion[COHORT.engagement]),
          status: 'modelled_fallback',
        };
      });
      goals.fiscal_sustainability = { idealPointBps: 8_500, importanceBps: 2_000, compromiseToleranceBps: 7_500, confidenceBps: 1_000, status: 'modelled_fallback' };
      const evaluation = evaluateProfileForPublic(analysis, { partyId: `cohort:${cohortId}`, goals: goals as never });
      if (evaluation.coverage !== 'unavailable') net += (evaluation.agreementBps - 5_000) * cohort.persons;
      persons += cohort.persons;
    }
  }
  return persons > 0 ? Math.round(net / persons) : 0;
};

/** A synthetic proposal for the promise content evaluation: the promised payload, never applied.
 *  The kind discriminates the branch, so each branch builds the exactly-typed payload. */
const promiseProposalFor = (state: SimulationState, countryId: string, promise: CampaignPromise): PoliticalProposal => {
  const base = {
    id: `promise.evaluation.${promise.id}`,
    countryId,
    proposerPersonId: '',
    createdOn: state.date,
    status: 'draft' as const,
    effectiveDate: state.date,
    effects: [],
  };
  if (promise.promisedKind === 'fiscal_reform') {
    return {
      ...base,
      kind: 'fiscal_reform',
      instrumentClass: 'law',
      payload: structuredClone(promise.promisedPayload ?? {}) as ProposalPayloadByKind['fiscal_reform'],
    };
  }
  return {
    ...base,
    kind: 'constitutional_amendment',
    instrumentClass: 'constitutional_amendment',
    payload: structuredClone(promise.promisedPayload ?? {}) as ProposalPayloadByKind['constitutional_amendment'],
  };
};

const adjustForCredibility = (state: SimulationState, countryId: string, votes: Record<string, number>, entry: ElectionCountryState): Record<string, number> => {
  const adjusted: Record<string, number> = {};
  for (const [partyId, value] of Object.entries(votes)) {
    const party = entry.parties[partyId];
    const combined = ratio(credibilityFactorBps(party), promiseContentFactorBps(state, countryId, party), 10_000);
    adjusted[partyId] = ratio(value, combined, 10_000);
  }
  return adjusted;
};

/** National vote shares from current national support (undecided is dropped — it is not a party),
 *  adjusted by the party's derived promise credibility. Registry-index alignment: when a party is
 *  excluded (banned/dissolved), the remaining parties keep their own support — B's support stays
 *  B's, never shifted. The seat-based fallback also excludes banned/dissolved parties. Dynamic
 *  parties contest through the canonical registration rule, drawing from the undecided pool. */
const nationalShares = (state: SimulationState, countryId: string): Record<string, number> => {
  const politicsCountry = state.politics.countries[countryId];
  const entry = countryEntry(state, countryId);
  const registryIds = partyIdsFor(countryId);
  const activeSet = new Set(activeRegistryPartyIds(state, countryId));
  const shares: Record<string, number> = {};
  if (politicsCountry?.nationalSupportBps?.length) {
    registryIds.forEach((partyId, index) => { if (activeSet.has(partyId)) shares[partyId] = politicsCountry.nationalSupportBps[index] ?? 0; });
  } else {
    for (const chamber of Object.values(entry.chambers)) {
      for (const [partyId, seats] of Object.entries(chamber.seatsByParty)) {
        if (activeSet.has(partyId)) shares[partyId] = (shares[partyId] ?? 0) + seats;
      }
    }
  }
  for (const [partyId, value] of Object.entries(dynamicNationalShares(state, countryId))) shares[partyId] = value;
  return adjustForCredibility(state, countryId, shares, entry);
};

/** Dynamic parties' national shares: cohort preference affinity over the undecided pool, weighted
 *  by population. Drawn only from the undecided share, so the registry parties' support is
 *  conserved and the total never exceeds the electorate. */
const dynamicNationalShares = (state: SimulationState, countryId: string): Record<string, number> => {
  const dynamicIds = activeDynamicPartyIds(state, countryId);
  if (!dynamicIds.length) return {};
  const registryIds = partyIdsFor(countryId);
  const registryParties = registryIds.map(id => politicalRegistry.parties[id]);
  const dynamicParties = dynamicIds.map(id => dynamicPartyProfile(state, id)).filter((party): party is PoliticalParty => party !== undefined);
  if (!dynamicParties.length) return {};
  const country = state.politics.countries[countryId];
  const votes: Record<string, number> = {};
  for (const regionId of [...(country?.regionIds ?? [])].sort()) {
    const socio = state.socioeconomy.regions[regionId];
    const opinion = state.politics.regionalOpinion[regionId];
    if (!socio || !opinion) continue;
    for (const cohort of socio.cohorts) {
      if (cohort.persons <= 0) continue;
      const cohortOpinion = opinion.cohorts[`${cohort.income}:${cohort.orientation}`];
      if (!cohortOpinion) continue;
      const affinity = supportFor(cohortOpinion[COHORT.preferences], cohortOpinion[COHORT.salience], cohortOpinion[COHORT.engagement], [...registryParties, ...dynamicParties]);
      const undecided = affinity[affinity.length - 1] ?? 0;
      const dynamicTotal = dynamicParties.reduce((sum, _, index) => sum + (affinity[registryIds.length + index] ?? 0), 0);
      const denominator = Math.max(1, dynamicTotal + undecided);
      dynamicParties.forEach((party, index) => {
        const dynamicShare = affinity[registryIds.length + index] ?? 0;
        votes[party.id] = (votes[party.id] ?? 0) + cohort.persons * (undecided * dynamicShare / denominator) / 10_000;
      });
    }
  }
  return Object.fromEntries(Object.entries(votes).map(([partyId, value]) => [partyId, Math.round(value)]));
};

/** Average absolute ideology distance between two parties across the validated ideology dimensions. */
const ideologyDistance = (a: string, b: string): number => {
  const pa = politicalRegistry.parties[a]?.ideology, pb = politicalRegistry.parties[b]?.ideology;
  if (!pa || !pb) return 10_000;
  const dims = IDEOLOGY_DIMENSIONS;
  let sum = 0;
  for (const dim of dims) sum += Math.abs((pa[dim] ?? 5_000) - (pb[dim] ?? 5_000));
  return Math.round(sum / dims.length);
};

/** Regional, cohort-level votes weighted by engagement. Turnout and abstention are preserved:
 *  undecided and unengaged voters never become party votes, and the transfer pool of a runoff is
 *  reduced by ideological distance (far voters abstain rather than transfer). */
const regionalVotes = (state: SimulationState, countryId: string): { votes: Record<string, Record<string, number>>; turnout: Record<string, number> } => {
  const country = state.politics.countries[countryId];
  const registryIds = partyIdsFor(countryId);
  const activeSet = new Set(activeRegistryPartyIds(state, countryId));
  const entry = countryEntry(state, countryId);
  const electionRules = state.constitution.countries[countryId]?.election;
  const registryParties = registryIds.map(id => politicalRegistry.parties[id]);
  const dynamicParties = activeDynamicPartyIds(state, countryId).map(id => dynamicPartyProfile(state, id)).filter((party): party is PoliticalParty => party !== undefined);
  const votes: Record<string, Record<string, number>> = {};
  const turnout: Record<string, number> = {};
  for (const regionId of [...(country?.regionIds ?? [])].sort()) {
    const socio = state.socioeconomy.regions[regionId];
    const opinion = state.politics.regionalOpinion[regionId];
    if (!socio || !opinion) continue;
    const regionPartyVotes: Record<string, number> = {};
    let regionTurnout = 0;
    for (const cohort of socio.cohorts) {
      if (cohort.persons <= 0) continue;
      const cohortOpinion = opinion.cohorts[`${cohort.income}:${cohort.orientation}`];
      if (!cohortOpinion) continue;
      const support = cohortOpinion[COHORT.support];
      const engagement = cohortOpinion[COHORT.engagement];
      const turnedOut = ratio(cohort.persons, turnoutBpsFor(engagement, electionRules), 10_000);
      regionTurnout += turnedOut;
      // Registry-index alignment: when a party is excluded, the others keep their own support.
      registryIds.forEach((partyId, index) => { if (activeSet.has(partyId)) regionPartyVotes[partyId] = (regionPartyVotes[partyId] ?? 0) + ratio(turnedOut, support[index], 10_000); });
      // Dynamic parties draw from the undecided pool, conserving the registry parties' votes.
      if (dynamicParties.length) {
        const affinity = supportFor(cohortOpinion[COHORT.preferences], cohortOpinion[COHORT.salience], engagement, [...registryParties, ...dynamicParties]);
        const undecided = affinity[affinity.length - 1] ?? 0;
        const dynamicTotal = dynamicParties.reduce((sum, _, index) => sum + (affinity[registryIds.length + index] ?? 0), 0);
        const denominator = Math.max(1, dynamicTotal + undecided);
        dynamicParties.forEach((party, index) => {
          const dynamicShare = affinity[registryIds.length + index] ?? 0;
          const poolVotes = Math.round(turnedOut * undecided / 10_000 * dynamicShare / denominator);
          regionPartyVotes[party.id] = (regionPartyVotes[party.id] ?? 0) + poolVotes;
        });
      }
    }
    votes[regionId] = adjustForCredibility(state, countryId, regionPartyVotes, entry);
    turnout[regionId] = regionTurnout;
  }
  return { votes, turnout };
};

/** Two-round runoff preserving abstention: eliminated voters transfer to the top two in proportion
 *  to ideological proximity, and a distance-based share abstains instead of transferring. */
function runoff(votes: Record<string, number>, partyIds: string[]): Record<string, number> {
  const sorted = partyIds.map(id => [id, votes[id] ?? 0] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const leader = sorted[0], runnerUp = sorted[1];
  if (!leader) return votes;
  const valid = sorted.reduce((sum, [, v]) => sum + v, 0);
  if (!runnerUp || leader[1] * 2 > valid) return { [leader[0]]: leader[1], ...(runnerUp ? { [runnerUp[0]]: runnerUp[1] } : {}) };
  let leaderVotes = leader[1], runnerUpVotes = runnerUp[1];
  for (const [id, value] of sorted.slice(2)) {
    if (value <= 0) continue;
    const dLeader = ideologyDistance(id, leader[0]);
    const dRunner = ideologyDistance(id, runnerUp[0]);
    const abstainBps = Math.min(dLeader, dRunner);
    const abstain = ratio(value, abstainBps, 10_000);
    const pool = value - abstain;
    const closenessLeader = Math.max(0, 10_000 - dLeader);
    const closenessRunner = Math.max(0, 10_000 - dRunner);
    const closenessTotal = closenessLeader + closenessRunner;
    if (closenessTotal <= 0) continue;
    const toLeader = ratio(pool, closenessLeader, closenessTotal);
    leaderVotes += toLeader;
    runnerUpVotes += pool - toLeader;
  }
  return { [leader[0]]: leaderVotes, [runnerUp[0]]: runnerUpVotes };
}

/** Distribute chamber seats across regions by population (largest remainder), each inhabited region
 *  receiving at least one seat when there are enough seats. */
function distributeSeatsByPopulation(populations: number[], totalSeats: number): number[] {
  const positive = populations.map((p, i) => ({ p, i })).filter(item => item.p > 0);
  if (!positive.length) return populations.map(() => 0);
  const result = populations.map(() => 0);
  if (positive.length <= totalSeats) {
    for (const { i } of positive) result[i] = 1;
    const remaining = totalSeats - positive.length;
    if (remaining > 0) {
      const extra = allocate(remaining, positive.map(item => item.p));
      positive.forEach((item, index) => { result[item.i] += extra[index]; });
    }
    return result;
  }
  return allocate(totalSeats, populations);
}

/** Simulated regional majoritarian allocation: seats are distributed across regions by population,
 *  then each region is partitioned into stable spatial districts (population slices of the Region —
 *  the only sourced spatial structure), each electing one winner (after a two-round runoff when
 *  applicable). Districts that cannot elect (no regional data, no eligible candidate) stay
 *  explicitly unallocated — seats are never silently dropped. */
function regionalMajoritarianSeats(state: SimulationState, countryId: string, partySeats: number, rounds: 1 | 2): { seatsByParty: Record<string, number>; unallocatedSeats: number } {
  const country = state.politics.countries[countryId];
  const regionIds = [...(country?.regionIds ?? [])].sort();
  const partyIds = contestingPartyIds(state, countryId);
  if (!regionIds.length || partySeats <= 0) return { seatsByParty: {}, unallocatedSeats: partySeats };
  const populations = regionIds.map(id => state.socioeconomy.regions[id]?.population ?? 0);
  const regionSeats = distributeSeatsByPopulation(populations, partySeats);
  const result: Record<string, number> = {};
  let unallocatedSeats = 0;
  regionIds.forEach((regionId, index) => {
    const seats = regionSeats[index];
    if (seats <= 0) return;
    for (const winner of stableDistrictWinners(state, countryId, regionId, seats, rounds, partyIds)) {
      if (winner === null) { unallocatedSeats += 1; continue; }
      result[winner] = (result[winner] ?? 0) + 1;
    }
  });
  return { seatsByParty: result, unallocatedSeats };
}

/** Partition a region into `seats` stable spatial districts and return the plurality winner of each
 *  (`null` = explicit unknown: missing regional data or no eligible candidate). The partition is
 *  spatial, not socioeconomic: the Region is the only sourced spatial structure, so each district
 *  is a deterministic population slice of the Region and votes with the Region's aggregate ballot —
 *  stable (depends only on the Region and its seat count) and consistent with regions and
 *  population. Explicit modelled limit: no intra-Region spatial data exists, so the districts of
 *  one Region are identical slices and elect the same winner; real differentiation exists only
 *  ACROSS Regions (sourced spatial structure). Intra-region geographic preferences are never
 *  invented. */
function stableDistrictWinners(state: SimulationState, countryId: string, regionId: string, seats: number, rounds: 1 | 2, partyIds: string[]): Array<string | null> {
  const socio = state.socioeconomy.regions[regionId];
  const opinion = state.politics.regionalOpinion[regionId];
  const unknown = Array(seats).fill(null);
  if (!socio || !opinion) return unknown;
  const entry = countryEntry(state, countryId);
  const electionRules = state.constitution.countries[countryId]?.election;
  const registryIds = partyIdsFor(countryId);
  const activeSet = new Set(activeRegistryPartyIds(state, countryId));
  const registryParties = registryIds.map(id => politicalRegistry.parties[id]);
  const dynamicParties = activeDynamicPartyIds(state, countryId).map(id => dynamicPartyProfile(state, id)).filter((party): party is PoliticalParty => party !== undefined);
  const votes: Record<string, number> = {};
  for (const cohort of socio.cohorts) {
    if (cohort.persons <= 0) continue;
    const cohortOpinion = opinion.cohorts[`${cohort.income}:${cohort.orientation}`];
    if (!cohortOpinion) continue;
    const turnedOut = ratio(cohort.persons, turnoutBpsFor(cohortOpinion[COHORT.engagement], electionRules), 10_000);
    registryIds.forEach((partyId, index) => { if (activeSet.has(partyId)) votes[partyId] = (votes[partyId] ?? 0) + ratio(turnedOut, cohortOpinion[COHORT.support][index], 10_000); });
    if (dynamicParties.length) {
      const affinity = supportFor(cohortOpinion[COHORT.preferences], cohortOpinion[COHORT.salience], cohortOpinion[COHORT.engagement], [...registryParties, ...dynamicParties]);
      const undecided = affinity[affinity.length - 1] ?? 0;
      const dynamicTotal = dynamicParties.reduce((sum, _, index) => sum + (affinity[registryIds.length + index] ?? 0), 0);
      const denominator = Math.max(1, dynamicTotal + undecided);
      dynamicParties.forEach((party, index) => {
        const dynamicShare = affinity[registryIds.length + index] ?? 0;
        votes[party.id] = (votes[party.id] ?? 0) + Math.round(turnedOut * undecided / 10_000 * dynamicShare / denominator);
      });
    }
  }
  const adjusted = adjustForCredibility(state, countryId, votes, entry);
  const finalVotes = rounds === 2 ? runoff(adjusted, partyIds) : adjusted;
  const sorted = Object.entries(finalVotes).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return unknown;
  return Array(seats).fill(sorted[0][0]);
}

/** Real participation of the electorate on election day: turned-out persons over represented
 *  persons, under the suffrage rules in force (mandatory voting forces full turnout). */
const countryParticipation = (state: SimulationState, countryId: string): { participationBps: number } => {
  const country = state.politics.countries[countryId];
  const electionRules = state.constitution.countries[countryId]?.election;
  let turnedOut = 0, persons = 0;
  for (const regionId of [...(country?.regionIds ?? [])].sort()) {
    const socio = state.socioeconomy.regions[regionId];
    const opinion = state.politics.regionalOpinion[regionId];
    if (!socio || !opinion) continue;
    for (const cohort of socio.cohorts) {
      if (cohort.persons <= 0) continue;
      const cohortOpinion = opinion.cohorts[`${cohort.income}:${cohort.orientation}`];
      if (!cohortOpinion) continue;
      persons += cohort.persons;
      turnedOut += ratio(cohort.persons, turnoutBpsFor(cohortOpinion[COHORT.engagement], electionRules), 10_000);
    }
  }
  return { participationBps: persons > 0 ? Math.min(10_000, Math.round(turnedOut * 10_000 / persons)) : 0 };
};

/** Popular votes across regions/cohorts weighted by real turnout (the suffrage rules in force
 *  decide participation, so mandatory voting really changes the electorate that votes). */
const countryPopularVotes = (state: SimulationState, countryId: string): { votes: Record<string, number>; participationBps: number } => {
  const { votes: regional, turnout } = regionalVotes(state, countryId);
  const votes: Record<string, number> = {};
  for (const regionVotes of Object.values(regional)) for (const [partyId, value] of Object.entries(regionVotes)) votes[partyId] = (votes[partyId] ?? 0) + value;
  const totalTurnout = Object.values(turnout).reduce((sum, value) => sum + value, 0);
  let persons = 0;
  const country = state.politics.countries[countryId];
  for (const regionId of [...(country?.regionIds ?? [])].sort()) {
    const socio = state.socioeconomy.regions[regionId];
    if (!socio) continue;
    persons += socio.cohorts.reduce((sum, cohort) => sum + cohort.persons, 0);
  }
  return { votes, participationBps: persons > 0 ? Math.min(10_000, Math.round(totalTurnout * 10_000 / persons)) : 0 };
};

/** Seat conversion dispatched by the constitution's parliamentary system and rounds. Returns null
 *  when the rules are unavailable, so the caller preserves the current parliament instead of zeroing
 *  it. Seats that the conversion cannot allocate (threshold exclusions, missing regional data, no
 *  eligible candidate) are reported explicitly as unallocated — never silently dropped. */
function seatsForSystem(state: SimulationState, countryId: string, seats: number, thresholdBps?: number): { seatsByParty: Record<string, number>; unallocatedSeats: number } | null {
  const election = state.constitution.countries[countryId]?.election;
  const system = election?.parliamentarySystem ?? 'unavailable';
  const rounds = election?.rounds ?? 'unavailable';
  if (system === 'unavailable' || rounds === 'unavailable') return null;
  const partyIds = contestingPartyIds(state, countryId);
  const national = nationalShares(state, countryId);
  const effective = rounds === 2 ? runoff(national, partyIds) : national;
  if (system === 'majoritarian') {
    return regionalMajoritarianSeats(state, countryId, seats, rounds as 1 | 2);
  }
  if (system === 'mixed') {
    // The mixed system uses the same spatial constituencies for its majoritarian component.
    const proportional = proportionalSeats(effective, Math.ceil(seats / 2), thresholdBps);
    const majoritarian = regionalMajoritarianSeats(state, countryId, Math.floor(seats / 2), rounds as 1 | 2);
    const result: Record<string, number> = { ...proportional };
    for (const [partyId, count] of Object.entries(majoritarian.seatsByParty)) result[partyId] = (result[partyId] ?? 0) + count;
    return { seatsByParty: result, unallocatedSeats: majoritarian.unallocatedSeats };
  }
  const seatsByParty = proportionalSeats(effective, seats, thresholdBps);
  const allocatedSum = Object.values(seatsByParty).reduce((sum, value) => sum + value, 0);
  return { seatsByParty, unallocatedSeats: Math.max(0, seats - allocatedSum) };
}

/** Minimal deterministic coalition from aggregate seats, preferring politically compatible partners
 *  (smaller ideological distance to the leading party) before seat size. A coalition that cannot
 *  reach a majority is reported as minority, never falsely as government. Exported for the
 *  coalition-compatibility tests. */
export const formCoalition = (seats: Record<string, number>, totalSeats: number, proximity: (a: string, b: string) => number): { coalitionPartyIds: string[]; confidence: GovernmentConfidence } => {
  const sorted = Object.entries(seats).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return { coalitionPartyIds: [], confidence: 'unavailable' };
  const winner = sorted[0][0];
  if (sorted[0][1] * 2 > totalSeats) return { coalitionPartyIds: [winner], confidence: 'majority' };
  const partners = sorted.slice(1).sort((a, b) => proximity(winner, a[0]) - proximity(winner, b[0]) || b[1] - a[1]);
  const coalition = [winner]; let total = sorted[0][1];
  for (const [partyId, count] of partners) { if (total * 2 > totalSeats) break; coalition.push(partyId); total += count; }
  if (total * 2 <= totalSeats) return { coalitionPartyIds: coalition, confidence: 'minority' };
  return { coalitionPartyIds: coalition, confidence: 'coalition' };
};

/** Recompute a chamber's term deadline from the constitution's parliament term (recurring elections).
 *  Leap dates stay valid: a Feb-29 deadline falls on Feb-28 in non-leap target years. */
const nextDeadlineFor = (state: SimulationState, countryId: string, date: string): string | undefined => {
  const termYears = state.constitution.countries[countryId]?.parliament.termYears;
  if (!termYears || termYears <= 0) return undefined;
  const year = Number(date.slice(0, 4)) + termYears;
  const monthDay = date.slice(5, 10);
  if (monthDay === '02-29') {
    const leap = (target: number) => (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0;
    return `${year}-${leap(year) ? '02-29' : '02-28'}`;
  }
  return `${year}-${monthDay}`;
};

/** The chamber responsible for confidence (and the one a dissolution targets): the first sourced
 *  chamber — typically the lower house — falling back to the first dynamic chamber. */
const confidenceChamberIdFor = (state: SimulationState, countryId: string): string | undefined => {
  const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId]?.institutionId];
  const first = institution?.chambers[0]?.id;
  const entry = state.elections.countries[countryId];
  if (first && entry?.chambers[first]) return first;
  return entry ? Object.keys(entry.chambers)[0] : undefined;
};

/** Run a deterministic election for the given chambers (default: all). When the election rules are
 *  unavailable, or no targeted chamber could be converted, the state is returned unchanged: the
 *  government, party government status and offices are never altered by a pseudo-election.
 *
 *  A real election resolves the initial independents (they are never kept forever) and reports
 *  seats it cannot allocate explicitly as unallocated. Government formation uses only the chamber
 *  responsible for confidence — never a blind sum of all chambers — and only when that chamber was
 *  actually elected; a minority result is never auto-nominated (the explicit formGovernment
 *  procedure is required), and if no valid leader can receive the office the government record is
 *  left unchanged so elections.government and governance.persons never contradict each other. */
export function runElection(state: SimulationState, countryId: string, chamberIds?: readonly string[]): SimulationState {
  const entry = countryEntry(state, countryId);
  if (!electionAvailable(state, countryId)) return state;
  const thresholdBps = state.constitution.countries[countryId]?.election.thresholdBps;
  const chambers: Record<string, ElectionChamberState> = {};
  const convertedChamberIds: string[] = [];
  let convertedAny = false;
  for (const [chamberId, chamber] of Object.entries(entry.chambers)) {
    if (chamberIds && !chamberIds.includes(chamberId)) { chambers[chamberId] = chamber; continue; }
    const contestable = Math.max(0, chamber.totalSeats - chamber.independentOtherSeats);
    if (contestable <= 0) { chambers[chamberId] = { ...chamber }; continue; }
    const converted = seatsForSystem(state, countryId, contestable, thresholdBps);
    if (converted === null) { chambers[chamberId] = chamber; continue; }
    convertedAny = true;
    convertedChamberIds.push(chamberId);
    const seatsByParty: Record<string, number> = {};
    for (const [partyId, count] of Object.entries(converted.seatsByParty)) seatsByParty[partyId] = count;
    for (const partyId of Object.keys(entry.parties)) if (seatsByParty[partyId] === undefined) seatsByParty[partyId] = 0;
    chambers[chamberId] = {
      ...chamber,
      seatsByParty,
      // A real election resolves the initial independents and reports unknown seats explicitly.
      independentOtherSeats: 0,
      unallocatedSeats: converted.unallocatedSeats,
      lastElectionDate: state.date,
      nextElectionDate: nextDeadlineFor(state, countryId, state.date),
    };
  }
  if (!convertedAny) return state;
  const turnout = countryParticipation(state, countryId);
  const eligibility = eligibilityCoverageFor(state.constitution.countries[countryId]?.election);
  for (const [chamberId, chamber] of Object.entries(chambers)) {
    if (chamber.lastElectionDate === state.date) {
      chambers[chamberId] = { ...chamber, lastElectionTurnout: { participationBps: turnout.participationBps, eligibilityCoverage: eligibility.coverage, limitation: eligibility.limitation } };
    }
  }
  // Government formation: only the chamber responsible for confidence decides the government, and
  // only when that chamber was actually (re-)elected. Other modes (direct election, head-of-state
  // appointment) are separate procedures, never inferred from parliamentary seats.
  const appointmentMode = state.constitution.countries[countryId]?.government.appointmentMode ?? 'unavailable';
  const confidenceChamberId = confidenceChamberIdFor(state, countryId);
  const confidenceChamber = confidenceChamberId ? chambers[confidenceChamberId] : undefined;
  let government = entry.government;
  let next = state;
  if (appointmentMode === 'chosen_by_parliament' && confidenceChamber && convertedChamberIds.includes(confidenceChamber.chamberId)) {
    const formed = formCoalition(confidenceChamber.seatsByParty, confidenceChamber.totalSeats, ideologyDistance);
    if (formed.confidence !== 'minority') {
      const leader = Object.values(next.governance.persons).find(p => p.status === 'active' && p.countryId === countryId && p.partyId === formed.coalitionPartyIds[0] && p.isPartyLeader);
      if (leader) {
        government = formed;
        const currentHead = Object.values(next.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
        if (currentHead && currentHead.id !== leader.id) next = revokePoliticalOffice(next, currentHead.id);
        if (currentHead?.id !== leader.id) next = transferPoliticalOffice(next, leader.id, { role: 'head_of_government', countryId });
      }
      // A minority result (or no valid leader) is never auto-nominated: the explicit formation
      // procedure (formGovernment) or the existing government stays.
    }
  }
  const parties: ElectionCountryState['parties'] = {};
  const currentSeatsFor = (partyId: string): number => Object.values(chambers).reduce((sum, chamber) => sum + (chamber.seatsByParty[partyId] ?? 0), 0);
  for (const [partyId, previous] of Object.entries(entry.parties)) {
    parties[partyId] = { ...previous, currentSeats: currentSeatsFor(partyId), governmentStatus: government.coalitionPartyIds.includes(partyId) ? 'government' : 'opposition', promises: previous.promises };
  }
  // Dynamic parties that won seats enter the party records through the same election.
  for (const partyId of activeDynamicPartyIds(state, countryId)) {
    if (parties[partyId]) continue;
    parties[partyId] = { partyId, currentSeats: currentSeatsFor(partyId), governmentStatus: government.coalitionPartyIds.includes(partyId) ? 'government' : 'opposition', promises: [] };
  }
  next = {
    ...next,
    elections: {
      ...next.elections,
      countries: { ...next.elections.countries, [countryId]: { ...entry, chambers, government, parties } },
    },
  };
  return next;
}

/** The explicit minority-government formation/nomination procedure: an executive office holder
 *  nominates a person of the Country, the office is transferred through the canonical path, and the
 *  government record reflects the nominee's real parliamentary support (majority only when the
 *  seats actually show one). A minority government is never auto-nominated by the election. */
export function formGovernment(state: SimulationState, countryId: string, actorPersonId: string, personId: string): SimulationState {
  const actor = state.governance.persons[actorPersonId];
  if (!(actor?.status === 'active' && actor.office?.countryId === countryId && ['head_of_state', 'head_of_government'].includes(actor.office.role))) throw new Error('Only the head of state or the head of government may nominate a government.');
  const person = state.governance.persons[personId];
  if (!person || person.status !== 'active' || person.countryId !== countryId) throw new Error('The nominee must be an active person of the Country.');
  const entry = countryEntry(state, countryId);
  const confidenceChamberId = confidenceChamberIdFor(state, countryId);
  const chamber = confidenceChamberId ? entry.chambers[confidenceChamberId] : undefined;
  let next = state;
  const currentHead = Object.values(next.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
  if (currentHead && currentHead.id !== personId) next = revokePoliticalOffice(next, currentHead.id);
  if (currentHead?.id !== personId) next = transferPoliticalOffice(next, personId, { role: 'head_of_government', countryId });
  const nomineeSeats = chamber ? (chamber.seatsByParty[person.partyId ?? ''] ?? 0) : 0;
  const confidence: GovernmentConfidence = chamber && chamber.totalSeats > 0 ? (nomineeSeats * 2 > chamber.totalSeats ? 'majority' : 'minority') : 'unavailable';
  const government = { coalitionPartyIds: person.partyId ? [person.partyId] : [], confidence };
  const parties: ElectionCountryState['parties'] = {};
  for (const [partyId, previous] of Object.entries(entry.parties)) {
    parties[partyId] = { ...previous, governmentStatus: confidence === 'unavailable' ? previous.governmentStatus : government.coalitionPartyIds.includes(partyId) ? 'government' : 'opposition', promises: previous.promises };
  }
  next = { ...next, elections: { ...next.elections, countries: { ...next.elections.countries, [countryId]: { ...entry, government, parties } } } };
  return next;
}

/** Dissolve parliament and call a fresh election. Requires the executive office and the
 *  constitutional right to dissolve. Only the chamber that is constitutionally dissoluble (the
 *  chamber responsible for confidence) is dissolved — never all chambers at once. */
export function dissolveParliament(state: SimulationState, countryId: string, personId: string): SimulationState {
  if (!isExecutive(state, personId, countryId)) throw new Error('Only the executive head may dissolve parliament.');
  const dissolutionHolder = state.constitution.countries[countryId]?.parliament.dissolutionHolder ?? 'unavailable';
  if (dissolutionHolder !== 'executive') throw new Error('This Country does not grant the executive the power to dissolve parliament.');
  if (!electionAvailable(state, countryId)) throw new Error('This Country has no available election rules to schedule a fresh election.');
  const entry = countryEntry(state, countryId);
  const confidenceChamberId = confidenceChamberIdFor(state, countryId);
  if (!confidenceChamberId) throw new Error('No chamber is constitutionally dissoluble.');
  const chambers = { ...entry.chambers };
  chambers[confidenceChamberId] = { ...chambers[confidenceChamberId], nextElectionDate: state.date };
  return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, chambers } } } };
}

/** The dissolutionHolder='parliament' power is a real procedure, not a data-only field: a
 *  legislator moves a dissolution motion in the chamber responsible for confidence, each party's
 *  own evaluation of the government's record (with its internal distribution and defections)
 *  decides, and an adopted motion schedules the fresh election at the chamber's own deadline. */
export function dissolveParliamentByParliament(state: SimulationState, countryId: string, actorPersonId: string): SimulationState {
  const dissolutionHolder = state.constitution.countries[countryId]?.parliament.dissolutionHolder ?? 'unavailable';
  if (dissolutionHolder !== 'parliament') throw new Error('This Country does not grant parliament the power to dissolve itself.');
  if (!electionAvailable(state, countryId)) throw new Error('This Country has no available election rules to schedule a fresh election.');
  const actor = state.governance.persons[actorPersonId];
  if (!(actor?.status === 'active' && actor.office?.countryId === countryId && actor.office.role === 'legislator')) throw new Error('Only a legislator may move the dissolution motion.');
  const entry = countryEntry(state, countryId);
  const confidenceChamberId = confidenceChamberIdFor(state, countryId);
  if (!confidenceChamberId) throw new Error('No chamber can be dissolved.');
  const chamber = entry.chambers[confidenceChamberId];
  if (!chamber) throw new Error('No chamber can be dissolved.');
  const votingSeats = Math.max(0, chamber.totalSeats - chamber.independentOtherSeats - (chamber.unallocatedSeats ?? 0));
  let yesSeats = 0;
  for (const partyId of partyIdsFor(countryId)) {
    const partySeats = chamber.seatsByParty[partyId] ?? 0;
    if (partySeats <= 0) continue;
    const material = governmentRecordPartyEvaluation(state, countryId, partyId);
    const distribution = partyVoteDistributionFromAgreement(material.agreementBps, material.confidenceBps, material.coverage,
      'Dissolution-vote internal plurality derived from the party\'s own evaluation of the government\'s material record; modelled, never observed faction data.');
    const allocation = allocatePartySeats(partySeats, distribution, { proposalId: 'dissolution', chamberId: chamber.chamberId, partyId });
    yesSeats += allocation.yesSeats;
  }
  if (votingSeats <= 0 || yesSeats * 2 <= votingSeats) throw new Error('The dissolution motion fails without a majority of the chamber.');
  const chambers = { ...entry.chambers };
  chambers[chamber.chamberId] = { ...chamber, nextElectionDate: state.date };
  return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, chambers } } } };
}

/** Daily pass: run the procedures whose real deadline is due — chamber elections, the direct
 *  executive election (appointmentMode elected_directly), the head-of-state selection and the
 *  derivation of promise outcomes from the decisions actually taken. Each has its own scheduled
 *  date, so none waits for an arbitrary monthly tick. */
export function runElectionCycle(state: SimulationState): SimulationState {
  let next = derivePromiseOutcomes(state);
  for (const [countryId, entry] of Object.entries(state.elections.countries)) {
    let country = entry;
    // Head-of-state selection is its own recurring procedure (term/maxTerms of the mandate). A due
    // deadline whose selection method has no modelled election (appointed/hereditary/other/
    // unavailable) clears the deadline instead of crashing the tick.
    if (entry.nextHeadOfStateElectionDate && entry.nextHeadOfStateElectionDate <= state.date) {
      const method = next.constitution.countries[countryId]?.headOfState.selectionMethod;
      if (['popular_direct', 'popular_indirect', 'parliamentary'].includes(method ?? '')) {
        const selected = runHeadOfStateSelection(next, countryId);
        country = selected.elections.countries[countryId] ?? country;
        next = selected;
      } else {
        next = { ...next, elections: { ...next.elections, countries: { ...next.elections.countries, [countryId]: { ...country, nextHeadOfStateElectionDate: undefined } } } };
        country = next.elections.countries[countryId];
      }
    }
    // Direct executive election is a recurring procedure at its own deadline, never an arbitrary manual call.
    if (country.nextDirectElectionDate && country.nextDirectElectionDate <= state.date) {
      next = runDirectElectionPass(next, countryId);
      country = next.elections.countries[countryId] ?? country;
    }
    if (!electionAvailable(next, countryId)) continue;
    const dueChamberIds = Object.entries(country.chambers).filter(([, chamber]) => chamber.nextElectionDate && chamber.nextElectionDate <= state.date).map(([chamberId]) => chamberId);
    if (dueChamberIds.length) next = runElection(next, countryId, dueChamberIds);
  }
  return next;
}

/** Record a typed campaign promise; the promised payload is bound to its kind and the policy is
 *  never applied by the promise itself. Only the party's active leader is authorized to bind the
 *  party to a promise. */
export function makeCampaignPromise<K extends ProposalKind>(state: SimulationState, partyId: string, countryId: string, subject: string, promisedKind: K, promisedPayload?: ProposalPayloadByKind[K], actorPersonId?: string): SimulationState {
  const entry = countryEntry(state, countryId);
  const party = entry.parties[partyId];
  if (!party) throw new Error('Unknown party for this Country.');
  if (!actorPersonId) throw new Error('A campaign promise requires the authorized actor who binds the party to it.');
  const actor = state.governance.persons[actorPersonId];
  if (!actor || actor.status !== 'active' || actor.countryId !== countryId || actor.partyId !== partyId || !actor.isPartyLeader) throw new Error('Only the active leader of the promised party may make its campaign promise.');
  const id = `promise.${Object.values(state.elections.countries).reduce((acc, c) => acc + Object.values(c.parties).reduce((a, p) => a + p.promises.length, 0), 0).toString().padStart(8, '0')}`;
  const base = { id, partyId, countryId, madeOn: state.date, madeByPersonId: actorPersonId, subject, status: 'pending' as const, credibilityBps: 0 };
  const promise: CampaignPromise = promisedKind === 'fiscal_reform'
    ? { ...base, promisedKind, promisedPayload: promisedPayload as ProposalPayloadByKind['fiscal_reform'] }
    : { ...base, promisedKind, promisedPayload: promisedPayload as ProposalPayloadByKind['constitutional_amendment'] };
  return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, parties: { ...entry.parties, [partyId]: { ...party, promises: [...party.promises, promise] } } } } } };
}

/** A promise whose outcome is derivable from the decisions actually taken (it carries a real
 *  payload): its status is never declared freely. */
const promiseDerivationObservable = (promise: CampaignPromise): boolean =>
  Boolean(promise.promisedPayload && Object.keys(promise.promisedPayload).length > 0);

/** Record a promise outcome manually — only for promises whose outcome is NOT derivable from the
 *  decisions actually taken (no payload). The promise must exist, and a resolved promise is
 *  immutable: it can never flip from fulfilled to broken and back. */
export function recordPromiseOutcome(state: SimulationState, countryId: string, partyId: string, promiseId: string, status: 'fulfilled' | 'partially_fulfilled' | 'broken'): SimulationState {
  const entry = countryEntry(state, countryId);
  const party = entry.parties[partyId];
  if (!party) throw new Error('Unknown party for this Country.');
  const promise = party.promises.find(item => item.id === promiseId);
  if (!promise) throw new Error('Unknown campaign promise; an outcome cannot be recorded for a promise that does not exist.');
  if (promise.status !== 'pending') throw new Error('A resolved promise is immutable; it cannot be re-declared from fulfilled to broken or back.');
  if (promiseDerivationObservable(promise)) throw new Error('This promise\'s outcome is derived from the decisions actually taken; it cannot be declared freely.');
  const promises = party.promises.map(p => p.id === promiseId ? { ...p, status, result: status } : p);
  const resolved = promises.filter(p => p.status !== 'pending' && p.status !== 'unavailable');
  const fulfilled = resolved.filter(p => p.status === 'fulfilled' || p.status === 'partially_fulfilled').length;
  const credibilityBps = resolved.length ? Math.round((fulfilled / resolved.length) * 10_000) : undefined;
  return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, parties: { ...entry.parties, [partyId]: { ...party, promises, credibilityBps } } } } } };
}

/** Derive a promise's status from the decisions actually taken since it was made, when that state
 *  is observable: an enacted fiscal reform or constitutional amendment touching the promised
 *  content. No relevant decision yet → still pending (never a premature "broken"). */
const derivePromiseStatus = (state: SimulationState, countryId: string, promise: CampaignPromise): PromiseStatus | undefined => {
  if (promise.promisedKind === 'fiscal_reform') {
    const payload = promise.promisedPayload;
    if (!payload || (!payload.policy && !payload.annualBudget)) return undefined;
    const decisions = [...state.fiscal.reforms, ...state.fiscal.reformReceipts].filter(item => item.countryId === countryId && item.effectiveDate > promise.madeOn);
    if (!decisions.length) return undefined;
    const current = state.fiscal.countries[countryId];
    if (!current) return undefined;
    let matched = 0, total = 0;
    const currentPolicy = current.policy as Record<string, unknown>;
    for (const [kind, rule] of Object.entries(payload.policy ?? {})) {
      total += 1;
      const promised = rule as Record<string, unknown> | null;
      const currentRule = currentPolicy[kind as TaxKind] as Record<string, unknown> | null | undefined;
      const matches = promised === null ? currentRule == null : Boolean(currentRule && Object.entries(promised).every(([key, value]) => JSON.stringify(currentRule[key]) === JSON.stringify(value)));
      if (matches) matched += 1;
    }
    const currentBudget = current.annualBudget as Record<string, number>;
    for (const [category, value] of Object.entries(payload.annualBudget ?? {})) {
      total += 1;
      if (currentBudget[category] === value) matched += 1;
    }
    if (total === 0) return undefined;
    return matched === total ? 'fulfilled' : matched === 0 ? 'broken' : 'partially_fulfilled';
  }
  const payload = promise.promisedPayload;
  if (!payload) return undefined;
  const decisions = Object.values(state.governance.proposals).filter(proposal =>
    proposal.countryId === countryId && proposal.kind === 'constitutional_amendment' && proposal.status === 'enacted' && proposal.resolvedOn !== undefined && proposal.resolvedOn > promise.madeOn);
  if (!decisions.length) return undefined;
  const entry = state.constitution.countries[countryId];
  if (!entry) return undefined;
  let matched = 0, total = 0;
  for (const key of payload.materialKeysToProtect ?? []) { total += 1; if (entry.protectedMaterialKeys.includes(key)) matched += 1; }
  for (const key of payload.materialKeysToUnprotect ?? []) { total += 1; if (!entry.protectedMaterialKeys.includes(key)) matched += 1; }
  const compareDomain = (promised: object | undefined, current: object): void => {
    if (promised === undefined) return;
    for (const [key, value] of Object.entries(promised)) {
      total += 1;
      if (JSON.stringify((current as Record<string, unknown>)[key]) === JSON.stringify(value)) matched += 1;
    }
  };
  compareDomain(payload.rightsChanges, entry.rights);
  compareDomain(payload.parliamentChanges, entry.parliament);
  compareDomain(payload.executiveChanges?.headOfState, entry.headOfState);
  compareDomain(payload.executiveChanges?.government, entry.government);
  compareDomain(payload.electionChanges, entry.election);
  compareDomain(payload.judicialChanges, entry.judicialReview);
  compareDomain(payload.amendmentChanges, entry.amendment);
  if (total === 0) return undefined;
  return matched === total ? 'fulfilled' : matched === 0 ? 'broken' : 'partially_fulfilled';
};

/** Derive every derivable promise outcome from the decisions actually taken and refresh the
 *  parties' credibility. Only derivation writes these statuses; pending promises without a
 *  relevant decision stay pending. */
export function derivePromiseOutcomes(state: SimulationState): SimulationState {
  const countries: Record<string, ElectionCountryState> = {};
  let changed = false;
  for (const [countryId, entry] of Object.entries(state.elections.countries)) {
    let entryChanged = false;
    const parties: ElectionCountryState['parties'] = {};
    for (const [partyId, party] of Object.entries(entry.parties)) {
      const promises = party.promises.map(promise => {
        if (!promiseDerivationObservable(promise) || (promise.status !== 'pending' && promise.status !== 'unavailable')) return promise;
        const derived = derivePromiseStatus(state, countryId, promise);
        if (derived === undefined || derived === promise.status) return promise;
        return { ...promise, status: derived, result: derived };
      });
      if (promises.every((promise, index) => promise === party.promises[index])) { parties[partyId] = party; continue; }
      entryChanged = true;
      const resolved = promises.filter(promise => promise.status !== 'pending' && promise.status !== 'unavailable');
      const fulfilled = resolved.filter(promise => promise.status === 'fulfilled' || promise.status === 'partially_fulfilled').length;
      parties[partyId] = { ...party, promises, credibilityBps: resolved.length ? Math.round((fulfilled / resolved.length) * 10_000) : party.credibilityBps };
    }
    countries[countryId] = entryChanged ? { ...entry, parties } : entry;
    if (entryChanged) changed = true;
  }
  return changed ? { ...state, elections: { ...state.elections, countries } } : state;
}

/** The direct executive election procedure (appointmentMode elected_directly). It is driven by the
 *  daily cycle at its own deadline — never an arbitrary manual call. The winner is the leading
 *  party in the turnout-weighted popular vote, and that party's leader becomes head of government.
 *  The government's parliamentary confidence is derived from the winner's actual seats — never
 *  fabricated as a majority — and the election is recorded with a dated trace. If no valid leader
 *  can receive the office, the government record is left unchanged so elections.government and
 *  governance.persons can never contradict each other. */
function runDirectElectionPass(state: SimulationState, countryId: string): SimulationState {
  const appointmentMode = state.constitution.countries[countryId]?.government.appointmentMode;
  if (appointmentMode !== 'elected_directly') throw new Error('Only a directly-elected executive may be chosen by direct election.');
  const entry = countryEntry(state, countryId);
  const popular = countryPopularVotes(state, countryId);
  const winner = Object.entries(popular.votes).sort((a, b) => b[1] - a[1])[0];
  if (!winner) {
    // No contest exists (no candidate party): the deadline is cleared so the procedure does not
    // retry forever; the government record is never rewritten by a non-election.
    return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, nextDirectElectionDate: undefined } } } };
  }
  const leader = Object.values(state.governance.persons).find(p => p.status === 'active' && p.countryId === countryId && p.partyId === winner[0] && p.isPartyLeader);
  if (!leader) {
    // The election produced a winning party but no valid leader can receive the office: the
    // government record is not rewritten, so the state never claims a government that no person holds.
    return { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, directElection: { on: state.date, winnerPartyId: winner[0] }, nextDirectElectionDate: nextDirectDeadlineFor(state, countryId, state.date) } } } };
  }
  const winnerSeats = Object.values(entry.chambers).reduce((sum, chamber) => sum + (chamber.seatsByParty[winner[0]] ?? 0), 0);
  const totalSeats = Object.values(entry.chambers).reduce((sum, chamber) => sum + chamber.totalSeats, 0);
  const confidence: GovernmentConfidence = totalSeats > 0 && winnerSeats * 2 > totalSeats ? 'majority' : 'minority';
  const government = { coalitionPartyIds: [winner[0]], confidence };
  const parties: ElectionCountryState['parties'] = {};
  for (const [partyId, previous] of Object.entries(entry.parties)) parties[partyId] = { ...previous, governmentStatus: partyId === winner[0] ? 'government' : 'opposition', promises: previous.promises };
  let next: SimulationState = { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, government, parties, directElection: { on: state.date, winnerPartyId: winner[0] }, nextDirectElectionDate: nextDirectDeadlineFor(state, countryId, state.date) } } } };
  const currentHead = Object.values(next.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
  if (currentHead && currentHead.id !== leader.id) next = revokePoliticalOffice(next, currentHead.id);
  if (currentHead?.id !== leader.id) next = transferPoliticalOffice(next, leader.id, { role: 'head_of_government', countryId });
  return next;
}

/** Recurring deadline of the direct executive mandate (head-of-state term first, else the
 *  parliamentary term; leap dates stay valid). */
const nextDirectDeadlineFor = (state: SimulationState, countryId: string, date: string): string | undefined => {
  const constitution = state.constitution.countries[countryId];
  const termYears = constitution?.headOfState.termYears ?? constitution?.parliament.termYears;
  if (!termYears || termYears <= 0) return undefined;
  return addYearsToDate(date, termYears);
};

/** Compatibility wrapper: the direct election can only be triggered at its scheduled deadline
 *  through the recurring procedure; it can never be called arbitrarily. */
export function runDirectElection(state: SimulationState, countryId: string, _actorPersonId?: string): SimulationState {
  const appointmentMode = state.constitution.countries[countryId]?.government.appointmentMode;
  if (appointmentMode !== 'elected_directly') throw new Error('Only a directly-elected executive may be chosen by direct election.');
  const entry = countryEntry(state, countryId);
  if (!entry.nextDirectElectionDate || entry.nextDirectElectionDate > state.date) throw new Error('No direct executive election is due; the recurring procedure runs at its scheduled deadline.');
  return runDirectElectionPass(state, countryId);
}

/** Implement the constitutional head-of-state selection modes with their real mandate (term,
 *  maxTerms) and suffrage participation. `popular_direct` elects by turnout-weighted popular vote,
 *  `popular_indirect` models the electoral college by parliamentary seat weight, `parliamentary`
 *  elects by parliamentary seats. `appointed`, `hereditary`, `other` and `unavailable` have no
 *  modelled procedure and refuse instead of fabricating one. */
export function runHeadOfStateSelection(state: SimulationState, countryId: string): SimulationState {
  const constitution = state.constitution.countries[countryId];
  const method = constitution?.headOfState.selectionMethod ?? 'unavailable';
  const entry = countryEntry(state, countryId);
  if (!['popular_direct', 'popular_indirect', 'parliamentary'].includes(method)) throw new Error(`The head-of-state selection method (${method}) has no modelled election procedure; no election is fabricated.`);
  let winnerPartyId: string | undefined;
  let participationBps: number | undefined;
  if (method === 'popular_direct') {
    const popular = countryPopularVotes(state, countryId);
    winnerPartyId = Object.entries(popular.votes).sort((a, b) => b[1] - a[1])[0]?.[0];
    participationBps = popular.participationBps;
  } else {
    // popular_indirect (electoral college) and parliamentary selection are seat-weighted procedures.
    const seats: Record<string, number> = {};
    for (const chamber of Object.values(entry.chambers)) for (const [partyId, count] of Object.entries(chamber.seatsByParty)) seats[partyId] = (seats[partyId] ?? 0) + count;
    winnerPartyId = Object.entries(seats).sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  if (!winnerPartyId) throw new Error('No candidate party exists; the head-of-state selection cannot produce a winner.');
  const candidate = Object.values(state.governance.persons).find(p => p.status === 'active' && p.countryId === countryId && p.partyId === winnerPartyId && p.isPartyLeader);
  if (!candidate) throw new Error(`The leading party (${winnerPartyId}) has no active leader who could receive the office; the selection is not applied.`);
  const maxTerms = constitution?.headOfState.maxTerms;
  const termsServed = entry.headOfStateElections.filter(record => record.winnerPersonId === candidate.id).length;
  if (maxTerms !== undefined && termsServed >= maxTerms) throw new Error(`The leading candidate has already served the constitutional maximum of ${maxTerms} terms; a candidate selection procedure beyond the party leader is not modelled.`);
  const termYears = constitution?.headOfState.termYears;
  const termEnd = termYears !== undefined ? addYearsToDate(state.date, termYears) : undefined;
  const eligibility = eligibilityCoverageFor(constitution?.election);
  const record: HeadOfStateElectionRecord = {
    on: state.date, method, winnerPersonId: candidate.id, winnerPartyId, termStart: state.date,
    ...(termEnd ? { termEnd } : {}), ...(participationBps !== undefined ? { participationBps } : {}),
    eligibilityCoverage: eligibility.coverage, limitation: eligibility.limitation,
  };
  const headOfStateElections = [...entry.headOfStateElections, record].slice(-24);
  let next: SimulationState = { ...state, elections: { ...state.elections, countries: { ...state.elections.countries, [countryId]: { ...entry, headOfStateElections, nextHeadOfStateElectionDate: termEnd } } } };
  const currentHead = Object.values(next.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_state');
  if (currentHead && currentHead.id !== candidate.id) next = revokePoliticalOffice(next, currentHead.id);
  if (currentHead?.id !== candidate.id) next = transferPoliticalOffice(next, candidate.id, { role: 'head_of_state', countryId });
  return next;
}

export const registerElectionTasks = (scheduler: SimulationScheduler) => {
  // Daily cadence: elections run on their real scheduled date (including dissolutions), not only
  // on the first day of the next month. Priority 455 keeps the daily constitution task (454,
  // amendment application) ahead, so a constitutional electoral rule effective on election day is
  // in force before the poll.
  scheduler.register({ id: 'elections.daily', cadence: 'daily', priority: 455, run: runElectionCycle });
  return scheduler;
};

export const electionsVersion = () => ELECTIONS_VERSION;
