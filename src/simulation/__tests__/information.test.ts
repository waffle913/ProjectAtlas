import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { SimulationState } from '../../types';
import type { GovernmentReport, MinisterialBriefing } from '../information/model';
import type { GovernanceGoal, PartyGoalProfile, PoliticalProposal } from '../governance/model';
import { assignPoliticalOffice, createFiscalProposal, createPoliticalPerson, estimateParliamentarySupport, inspectProposalSupport, resolveProposalVote, setControlledPerson, submitProposal } from '../governance/runtime';
import { derivePartyGoalProfile } from '../governance/analysis';
import type { PoliticalRegistry } from '../politics/model';
import { advanceSimulationDays } from '../engine';
import { emptyGovernance } from '../governance/model';
import { assertSimulationInvariants } from '../invariants';
import { informationInvariant } from '../information/invariants';
import { emptyInformation, referencedGovernmentReportIds } from '../information/model';
import { addProposalResultBriefing, explainBriefing, hasGovernmentInformationAccess, inspectBriefings, inspectGovernmentProposalEstimates, inspectGovernmentReports, presentBriefing, produceGovernmentProposalEstimate, runInformationMonth } from '../information/runtime';
import { initializeNewGame } from '../initialization';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { politicalRegistry } from '../politics/registry';
import { socioeconomicWorld, worldContext, worldCountryIds, worldPoliticalInputs, worldRegions } from './worldScenario';

let initial: SimulationState;
beforeAll(() => {
  const socioeconomic = socioeconomicWorld();
  initial = initializeNewGame(socioeconomic, worldRegions, worldCountryIds, undefined, worldPoliticalInputs);
}, 30_000);

const reportingCountry = () => worldCountryIds.find(countryId => worldRegions.some(region =>
  initial.regionOwnership[region.id] === countryId && initial.socioeconomy.regions[region.id]?.economy,
)
  && !Object.values(initial.governance.persons).some(person => person.countryId === countryId && person.office?.authorityProfile.capabilities.includes('access_government_information')),
)!;
const leaderFor = (countryId: string) => Object.values(initial.governance.persons).find(person => person.countryId === countryId && person.isPartyLeader)!;
function report(countryId: string, asOfDate: string, valueBps?: number): GovernmentReport {
  return {
    id: `government-report:${countryId}:unemployment:${asOfDate}`,
    countryId,
    indicator: 'unemployment_rate',
    valueBps,
    asOfDate,
    status: valueBps === undefined ? 'unavailable' : 'modelled',
    coverage: valueBps === undefined ? 'unavailable' : 'partial',
    unit: 'basis_points',
    source: 'socioeconomy.monthly',
    limitation: 'Synthetic test report; unavailable values remain absent.',
  };
}
function withReports(state: SimulationState, reports: GovernmentReport[]): SimulationState {
  return {
    ...state,
    information: {
      ...state.information,
      latestGovernmentReports: Object.fromEntries(reports.map(item => [item.countryId, item])),
      governmentReportsById: Object.fromEntries(reports.map(item => [item.id, item])),
    },
  };
}
function parliamentaryProposal(state: SimulationState, outcome: 'adopted' | 'rejected'): PoliticalProposal {
  const countryId = reportingCountry();
  const person = leaderFor(countryId);
  const id = `proposal.information-${outcome}`;
  const proposal: PoliticalProposal = {
    id,
    countryId,
    proposerPersonId: person.id,
    createdOn: state.date,
    kind: 'fiscal_reform',
    payload: { annualBudget: state.fiscal.countries[countryId].annualBudget },
    status: outcome === 'adopted' ? 'enacted' : 'rejected',
    effectiveDate: '2026-02-01',
    voteResult: {
      yesSeats: outcome === 'adopted' ? 161 : 152,
      noSeats: outcome === 'adopted' ? 152 : 161,
      abstainSeats: 0,
      unavailableSeats: 0,
      totalSeats: 313,
      chambers: [],
      coverage: 'complete',
      confidenceBps: 10_000,
      procedure: 'modelled_procedure_v1',
      outcome,
      resolvedOn: state.date,
    },
  };
  return proposal;
}
function approvedProposalWithBaseline() {
  const reportState = runInformationMonth({
    ...initial,
    date: '2026-02-01',
    socioeconomy: { ...initial.socioeconomy, lastMonthlyDate: '2026-02-01' },
  });
  for (const countryId of worldCountryIds) {
    const institution = politicalRegistry.institutions[politicalRegistry.countries[countryId]?.institutionId];
    const complete = institution?.chambers.length && institution.chambers.every(chamber =>
      chamber.seatAllocationStatus === 'sourced' && chamber.totalSeats !== undefined
      && (chamber.independentOtherSeats ?? 0) === 0
      && Object.values(chamber.seatsByParty).reduce((sum, seats) => sum + seats, 0) === chamber.totalSeats,
    );
    if (!complete) continue;
    const currentValueBps = reportState.information.latestGovernmentReports[countryId]?.valueBps;
    if (currentValueBps === undefined) continue;
    const baselineValueBps = currentValueBps >= 500 ? currentValueBps - 500 : currentValueBps + 500;
    const baseline = report(countryId, '2026-01-01', baselineValueBps);
    let state = withReports(initial, [baseline]);
    const personState = createPoliticalPerson(state, { displayName: 'Temporal policy test proposer', countryId });
    const proposerPersonId = `person.${String(personState.governance.nextPersonSequence - 1).padStart(8, '0')}`;
    state = assignPoliticalOffice(setControlledPerson(personState, proposerPersonId), proposerPersonId, { role: 'head_of_government', countryId });
    const budget = state.fiscal.countries[countryId].annualBudget;
    state = createFiscalProposal(state, {
      proposerPersonId,
      countryId,
      effectiveDate: '2026-02-01',
      payload: { annualBudget: { ...budget, infrastructure: budget.infrastructure > 0 ? budget.infrastructure * 2 : 1 } },
    });
    const proposalId = state.governance.proposalOrder.at(-1)!;
    const proposal = state.governance.proposals[proposalId];
    const registry = structuredClone(politicalRegistry) as PoliticalRegistry;
    const analysis = inspectProposalSupport(state, proposalId).analysis;
    const profiles: Record<string, PartyGoalProfile> = {};
    for (const partyId of registry.countries[countryId].partyIds) {
      const overrides: Partial<Record<GovernanceGoal, Partial<PartyGoalProfile['goals'][GovernanceGoal]>>> = {};
      for (const [goal, direction] of Object.entries(analysis.issueEffects) as Array<[GovernanceGoal, number]>) {
        if (direction) overrides[goal] = {
          idealPointBps: direction > 0 ? 10_000 : 0,
          importanceBps: 10_000,
          compromiseToleranceBps: 10_000,
          confidenceBps: 10_000,
          status: 'sourced_or_partial_prior',
        };
      }
      profiles[partyId] = derivePartyGoalProfile(registry.parties[partyId], overrides);
    }
    const estimate = estimateParliamentarySupport(state, proposal, registry, profiles);
    if (estimate.coverage !== 'complete' || !estimate.chambers.every(chamber => chamber.adopted)) continue;
    state = resolveProposalVote(submitProposal(state, proposalId), proposalId, registry, profiles);
    return { countryId, baseline, state, proposal: state.governance.proposals[proposalId] };
  }
  throw new Error('No complete chamber fixture could adopt a temporal-follow-up proposal.');
}

describe('government information and player briefings 0.15', () => {
  it('creates dated proposal estimates only for an authorized executive and persists their 0.14 provenance', () => {
    const countryId = 'country.sxojze';
    const executive = Object.values(initial.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
    const opposition = Object.values(initial.governance.persons).find(person => person.partyId === 'party:country.sxojze:6244f2d93a49' && person.isPartyLeader)!;
    const budget = initial.fiscal.countries[countryId].annualBudget;
    const drafted = createFiscalProposal(initial, {
      proposerPersonId: executive.id,
      countryId,
      effectiveDate: '2026-02-01',
      payload: { annualBudget: { ...budget, infrastructure: budget.infrastructure + 1 } },
    });
    const proposalId = drafted.governance.proposalOrder.at(-1)!;
    const estimated = produceGovernmentProposalEstimate(drafted, proposalId, executive.id);
    const [report] = inspectGovernmentProposalEstimates(estimated, countryId, executive.id);
    expect(report).toMatchObject({
      proposalId,
      requestedOn: initial.date,
      requestedByPersonId: executive.id,
      provenance: { status: 'derived', engine: 'situational-0.14-v2', source: 'governance.proposal-analysis' },
    });
    expect(estimated.governance.proposals[proposalId].analysis).toBeUndefined();
    expect(inspectGovernmentProposalEstimates(estimated, countryId, opposition.id)).toEqual([]);
    expect(() => produceGovernmentProposalEstimate(drafted, proposalId, opposition.id)).toThrow(/Government office access/);
    expect(informationInvariant.check(estimated, worldContext, 'save')).toEqual([]);
    const restored = restoreSimulationState(serializeSimulationState(estimated, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.information.proposalEstimates).toEqual(estimated.information.proposalEstimates);
  });

  it('keeps internal reports unavailable to opposition and grants access only through an office capability', () => {
    const countryId = reportingCountry();
    const person = leaderFor(countryId);
    const saved = report(countryId, initial.date, 783);
    const state = withReports(initial, [saved]);
    expect(hasGovernmentInformationAccess(state, person.id, countryId)).toBe(false);
    expect(inspectGovernmentReports(state, countryId, person.id)).toEqual([]);
    const appointed = assignPoliticalOffice(setControlledPerson(state, person.id), person.id, { role: 'head_of_government', countryId });
    expect(hasGovernmentInformationAccess(appointed, person.id, countryId)).toBe(true);
    expect(inspectGovernmentReports(appointed, countryId, person.id)).toEqual([saved]);
  });

  it('rejects a future report and preserves unavailable as a missing value rather than zero', () => {
    const countryId = reportingCountry();
    const person = leaderFor(countryId);
    const future = withReports(initial, [report(countryId, '2026-02-01', 0)]);
    expect(() => assertSimulationInvariants(future, worldContext, 'tick')).toThrow(/future government report/);
    const unavailable = withReports(initial, [report(countryId, initial.date)]);
    expect(unavailable.information.latestGovernmentReports[countryId].valueBps).toBeUndefined();
    expect(assertSimulationInvariants(unavailable, worldContext, 'tick')).toBe(true);
    expect(inspectGovernmentReports(unavailable, countryId, person.id)).toEqual([]);
  });

  it('does not publish changed Reality before the next scheduled report date', () => {
    const countryId = reportingCountry();
    const person = leaderFor(countryId);
    const saved = report(countryId, initial.date, 783);
    const withPrior = withReports(initial, [saved]);
    const later = { ...withPrior, date: '2026-01-20', socioeconomy: { ...withPrior.socioeconomy, lastMonthlyDate: initial.date } };
    const unchanged = runInformationMonth(later);
    expect(unchanged).toBe(later);
    expect(inspectGovernmentReports(unchanged, countryId, person.id)).toEqual([]);
    const executive = assignPoliticalOffice(setControlledPerson(withPrior, person.id), person.id, { role: 'head_of_government', countryId });
    expect(inspectGovernmentReports(executive, countryId, person.id)).toEqual([saved]);
  });

  it.each(['adopted', 'rejected'] as const)('records the exact public parliamentary result for an %s proposal without pausing', outcome => {
    const base = initial;
    const proposal = parliamentaryProposal(base, outcome);
    const state = { ...base, governance: { ...base.governance, proposals: { ...base.governance.proposals, [proposal.id]: proposal } } };
    const briefed = addProposalResultBriefing(state, proposal);
    const briefing = briefed.information.briefings.at(-1)!;
    expect(briefing).toMatchObject({
      access: 'public',
      eventType: 'proposal_result',
      severity: 'advisory',
      pauseRequested: false,
      fact: { kind: 'parliamentary_result', outcome, chamberResults: [], yesSeats: undefined, noSeats: undefined },
    });
    expect(briefing.headline).toContain('Aggregate seat totals are not presented as a single vote.');
    expect(inspectBriefings(briefed, proposal.countryId, 'uncontrolled-person')).toEqual([briefing]);
    expect(briefed.paused).toBe(base.paused);
  });

  it('reports bicameral results chamber by chamber when summed seats would contradict a required chamber', () => {
    const base = initial;
    const countryId = 'country.sxojze';
    const source = parliamentaryProposal(base, 'rejected');
    const proposal: PoliticalProposal = {
      ...source,
      id: 'proposal.bicameral-rejection',
      countryId,
      voteResult: {
        ...source.voteResult!,
        yesSeats: 101,
        noSeats: 52,
        totalSeats: 153,
        chambers: [
          { chamberId: 'chamber:DE-LC01', yesSeats: 100, noSeats: 50, abstainSeats: 0, unavailableSeats: 0, totalSeats: 150, coverage: 'complete', adopted: true },
          { chamberId: 'chamber:DE-UC01', yesSeats: 1, noSeats: 2, abstainSeats: 0, unavailableSeats: 0, totalSeats: 3, coverage: 'complete', adopted: false },
        ],
        outcome: 'rejected',
      },
    };
    const state = { ...base, governance: { ...base.governance, proposals: { ...base.governance.proposals, [proposal.id]: proposal } } };
    const briefing = addProposalResultBriefing(state, proposal).information.briefings.at(-1)!;
    expect(briefing.headline).toContain('The legislature rejected the proposal.');
    expect(briefing.headline).toContain('German Bundestag: adopted');
    expect(briefing.headline).toContain('Federal Council: rejected');
    expect(briefing.headline).not.toContain('101');
    expect(briefing.fact).toMatchObject({ outcome: 'rejected', yesSeats: undefined, noSeats: undefined });
    expect(briefing.fact.chamberResults?.map(chamber => chamber.outcome)).toEqual(['adopted', 'rejected']);
    expect(informationInvariant.check(
      { ...state, information: { ...state.information, briefings: [briefing], governmentReportsById: {}, latestGovernmentReports: {} } },
      worldContext,
      'tick',
    )).toEqual([]);
  });

  it('preserves incomplete chamber coverage and retains temporal policy baseline reports', () => {
    const countryId = 'country.sxojze';
    const baseline = report(countryId, '2026-01-01', 700);
    const source = parliamentaryProposal(initial, 'adopted');
    const proposal: PoliticalProposal = {
      ...source,
      id: 'proposal.temporal-follow-up',
      countryId,
      voteResult: {
        ...source.voteResult!,
        chambers: [
          { chamberId: 'chamber:DE-LC01', yesSeats: 100, noSeats: 50, abstainSeats: 0, unavailableSeats: 0, totalSeats: 150, coverage: 'complete', adopted: true },
          { chamberId: 'chamber:DE-UC01', yesSeats: 0, noSeats: 0, abstainSeats: 0, unavailableSeats: 3, totalSeats: 3, coverage: 'unavailable' },
        ],
        yesSeats: 100,
        noSeats: 50,
        unavailableSeats: 3,
        totalSeats: 153,
        coverage: 'partial',
        outcome: 'unavailable',
      },
      status: 'unavailable',
    };
    const stateWithBaseline = {
      ...initial,
      information: { ...initial.information, latestGovernmentReports: { [countryId]: baseline }, governmentReportsById: { [baseline.id]: baseline } },
    };
    const briefingState = addProposalResultBriefing(stateWithBaseline, proposal);
    const result = briefingState.information.briefings.at(-1)!;
    expect(result.fact.chamberResults?.[1]).toMatchObject({ chamberId: 'chamber:DE-UC01', outcome: 'unavailable', coverage: 'unavailable' });
    expect(result.fact.policyFollowUp).toBeUndefined();

    const adopted = approvedProposalWithBaseline();
    const adoptedBriefing = adopted.state.information.briefings.find(item =>
      item.fact.kind === 'parliamentary_result' && item.fact.proposalId === adopted.proposal.id,
    )!;
    const anchor = adoptedBriefing.fact.policyFollowUp;
    expect(anchor).toMatchObject({ proposalId: adopted.proposal.id, attributionStatus: 'temporal_only', baselineDate: '2026-01-01' });
    const januaryReportId = anchor!.baselineReportId!;
    const retainedBaseline = adopted.state.information.governmentReportsById[januaryReportId];
    expect(retainedBaseline).toMatchObject({ asOfDate: '2026-01-01', valueBps: anchor!.baselineValueBps });
    expect(referencedGovernmentReportIds(adopted.state.information)).toContain(januaryReportId);

    const february = advanceSimulationDays(adopted.state, 31);
    expect(february.date).toBe('2026-02-01');
    const februaryBriefing = february.information.briefings.find(item =>
      item.fact.kind === 'labour_report' && item.createdOn === '2026-02-01',
    )!;
    expect(februaryBriefing.fact.policyComparisons).toMatchObject([{
      proposalId: adopted.proposal.id,
      attributionStatus: 'temporal_only',
      baselineDate: '2026-01-01',
      baselineValueBps: anchor!.baselineValueBps,
      currentValueBps: february.information.latestGovernmentReports[adopted.countryId].valueBps,
    }]);
    expect(assertSimulationInvariants(february, worldContext, 'save')).toBe(true);

    const march = advanceSimulationDays(february, 28);
    expect(march.date).toBe('2026-03-01');
    expect(march.information.latestGovernmentReports[adopted.countryId].asOfDate).toBe('2026-03-01');
    expect(march.information.governmentReportsById[januaryReportId]).toEqual(retainedBaseline);
    expect(Object.keys(march.information.governmentReportsById)).toContain(januaryReportId);
    expect(referencedGovernmentReportIds(march.information)).toContain(januaryReportId);
    expect(assertSimulationInvariants(march, worldContext, 'save')).toBe(true);

    const restored = restoreSimulationState(serializeSimulationState(march, worldContext), worldRegions, {}, {}, worldContext);
    const restoredBriefing = restored.information.briefings.find(item => item.id === februaryBriefing.id)!;
    expect(restored.information.governmentReportsById[januaryReportId]).toEqual(retainedBaseline);
    expect(explainBriefing(restored, restoredBriefing, restored.governance.player.controlledPersonId!).join(' ')).toContain('not evidence that the measure caused the change');
    expect(assertSimulationInvariants(restored, worldContext, 'reload')).toBe(true);
  }, 30_000);

  it('creates one briefing on material report change, retains its report source, and round-trips it', () => {
    const countryId = reportingCountry();
    const executive = leaderFor(countryId);
    const authorized = assignPoliticalOffice(initial, executive.id, { role: 'head_of_government', countryId });
    const date = '2026-03-01';
    const current = runInformationMonth({
      ...authorized,
      date,
      socioeconomy: { ...initial.socioeconomy, lastMonthlyDate: date },
      information: {
        ...initial.information,
        latestGovernmentReports: { [countryId]: report(countryId, '2026-02-01', 10_000) },
        governmentReportsById: { [report(countryId, '2026-02-01', 10_000).id]: report(countryId, '2026-02-01', 10_000) },
      },
    });
    expect(current.information.briefings).toHaveLength(1);
    const briefing = current.information.briefings[0];
    expect(briefing.fact.kind).toBe('labour_report');
    expect(current.information.governmentReportsById[briefing.fact.reportId!]).toEqual(current.information.latestGovernmentReports[countryId]);
    expect(explainBriefing(current, briefing, executive.id).join(' ')).toContain('not isolated policy causation');
    const nextDate = '2026-04-01';
    const nextMonth = runInformationMonth({ ...current, date: nextDate, socioeconomy: { ...current.socioeconomy, lastMonthlyDate: nextDate } });
    expect(nextMonth.information.briefings).toHaveLength(1);
    expect(nextMonth.information.governmentReportsById[briefing.fact.reportId!]).toBeDefined();
    expect(assertSimulationInvariants(nextMonth, worldContext, 'tick')).toBe(true);
    const roundTrip = JSON.parse(JSON.stringify(nextMonth)) as SimulationState;
    expect(assertSimulationInvariants(roundTrip, worldContext, 'reload')).toBe(true);
    expect(roundTrip.information.briefings).toEqual(nextMonth.information.briefings);
  });

  it.each([
      [700, 780, 'increased', '7.00%', '7.80%'],
      [700, 600, 'decreased', '7.00%', '6.00%'],
    ] as const)('briefs on a material unemployment movement from %s to %s basis points', (previous, current, direction, from, to) => {
      const countryId = reportingCountry();
      const leader = leaderFor(countryId);
      const appointed = assignPoliticalOffice(initial, leader.id, { role: 'head_of_government', countryId });
      const date = '2026-02-01';
      const regionEntries = Object.entries(appointed.regionOwnership).filter(([, ownerId]) => ownerId === countryId);
      const firstRegionId = regionEntries.find(([regionId]) => appointed.socioeconomy.regions[regionId]?.economy)?.[0];
      expect(firstRegionId).toBeDefined();
      const regions = { ...appointed.socioeconomy.regions };
      for (const [regionId] of regionEntries) {
        const region = regions[regionId];
        if (region?.economy) regions[regionId] = { ...region, economy: { ...region.economy, labourForce: 0, unemployed: 0 } };
      }
      const first = regions[firstRegionId!]!;
      regions[firstRegionId!] = { ...first, economy: { ...first.economy!, labourForce: 10_000, unemployed: current * 10_000 / 10_000 } };
      const prior = report(countryId, '2026-01-01', previous);
      const result = runInformationMonth({
        ...appointed,
        date,
        socioeconomy: { ...appointed.socioeconomy, lastMonthlyDate: date, regions },
        information: {
          ...appointed.information,
          latestGovernmentReports: { [countryId]: prior },
          governmentReportsById: { [prior.id]: prior },
        },
      });
      const briefing = result.information.briefings[0];
      expect(briefing.headline).toContain(`from ${from} to ${to}`);
      expect(briefing.headline).toContain(direction);
      expect(briefing.interpretation?.summary).toContain(direction === 'increased' ? 'worsened' : 'improved');
      expect(briefing.interpretation?.summary).not.toMatch(/\d+% importance|party profile/i);
      expect(explainBriefing(result, briefing, leader.id).join(' ')).toContain('No directly supported employment-policy lever');
      expect(briefing.fact).toMatchObject({ kind: 'labour_report', previousValueBps: previous, valueBps: current });
    });

    it('does not create attention spam for a two-basis-point unemployment movement', () => {
      const countryId = reportingCountry();
      const leader = leaderFor(countryId);
      const appointed = assignPoliticalOffice(initial, leader.id, { role: 'head_of_government', countryId });
      const date = '2026-02-01';
      const regionEntries = Object.entries(appointed.regionOwnership).filter(([, ownerId]) => ownerId === countryId);
      const firstRegionId = regionEntries.find(([regionId]) => appointed.socioeconomy.regions[regionId]?.economy)?.[0]!;
      const regions = { ...appointed.socioeconomy.regions };
      for (const [regionId] of regionEntries) {
        const region = regions[regionId];
        if (region?.economy) regions[regionId] = { ...region, economy: { ...region.economy, labourForce: 0, unemployed: 0 } };
      }
      const first = regions[firstRegionId]!;
      regions[firstRegionId] = { ...first, economy: { ...first.economy!, labourForce: 10_000, unemployed: 702 } };
      const prior = report(countryId, '2026-01-01', 700);
      const result = runInformationMonth({
        ...appointed,
        date,
        socioeconomy: { ...appointed.socioeconomy, lastMonthlyDate: date, regions },
        information: { ...appointed.information, latestGovernmentReports: { [countryId]: prior }, governmentReportsById: { [prior.id]: prior } },
      });
      expect(result.information.briefings).toEqual([]);
      expect(result.information.latestGovernmentReports[countryId].valueBps).toBe(702);
  });

  it('briefs on a newly active crisis using its canonical monitor record', () => {
    const countryId = reportingCountry();
    const oldCountry = initial.crisis.countries[countryId];
    const episode = oldCountry.currentByType.fiscal_stress;
    const active = {
      ...episode,
      state: 'ACTIVE' as const,
      severity: 'severe' as const,
      activatedOn: '2026-02-01',
      activationSnapshot: { date: '2026-02-01', pressure: 25_000, severity: 'severe' as const, tippingChanceBps: 1_000, tippingRollBps: 500, tripwires: [] },
    };
    const state = runInformationMonth({
      ...initial,
      date: '2026-02-01',
      socioeconomy: { ...initial.socioeconomy, lastMonthlyDate: '2026-02-01' },
      crisis: { ...initial.crisis, countries: { ...initial.crisis.countries, [countryId]: { ...oldCountry, currentByType: { ...oldCountry.currentByType, fiscal_stress: active } } } },
    });
    expect(state.information.briefings).toMatchObject([{
      access: 'government',
      eventType: 'crisis_activation',
      severity: 'important',
      sourceId: active.id,
      fact: { kind: 'crisis_activation', crisisType: 'fiscal_stress', crisisSeverity: 'severe' },
    }]);
    expect(informationInvariant.check(state, worldContext, 'tick')).toEqual([]);
  });

  it('bounds and deterministically deduplicates briefing history', () => {
    let state = initial;
    const proposalIds: string[] = [];
    for (let index = 0; index < 258; index += 1) {
      const proposal = parliamentaryProposal(state, index % 2 ? 'adopted' : 'rejected');
      const unique = { ...proposal, id: `proposal.history-${index}` };
      proposalIds.push(unique.id);
      state = { ...state, governance: { ...state.governance, proposals: { ...state.governance.proposals, [unique.id]: unique } } };
      state = addProposalResultBriefing(state, unique);
    }
    expect(state.information.briefings).toHaveLength(256);
    expect(state.information.briefings[0].sourceId).toBe(proposalIds[2]);
    const repeated = addProposalResultBriefing(state, state.governance.proposals[proposalIds.at(-1)!]);
    expect(repeated.information.briefings).toHaveLength(256);
    expect(repeated.information.briefings.map(item => item.id)).toEqual(state.information.briefings.map(item => item.id));
  });

  it('does not recommend unsupported fiscal levers as employment solutions and preserves fact-only Expert mode', () => {
    const executive = Object.values(initial.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
    const state = setControlledPerson(initial, executive.id);
    const countryId = executive.countryId;
    const briefing: MinisterialBriefing = {
      id: 'briefing:test',
      countryId,
      portfolio: 'economy',
      access: 'government',
      eventType: 'labour_report',
      severity: 'advisory',
      createdOn: initial.date,
      sourceId: 'government-report:test',
      headline: 'Prime Minister: New labour figures are available. Unemployment has increased from 7.00% to 7.80%.',
      interpretation: {
        basis: 'derived',
        summary: 'Employment conditions worsened between the two modelled reports.',
        relevantGoals: ['labour_protection', 'income_security'],
        policyLevers: [],
        tradeoffs: [],
        limitations: ['No directly supported employment-policy lever or hiring-response mechanism is currently represented.'],
      },
      fact: { kind: 'labour_report', reportId: 'government-report:test', previousValueBps: 700, valueBps: 780, evidenceStatus: 'modelled' },
      pauseRequested: false,
    };
    const before = JSON.stringify(initial);
    const guided = presentBriefing(state, briefing, 'guided', executive.id);
    const standard = presentBriefing(state, briefing, 'standard', executive.id);
    const expert = presentBriefing(state, briefing, 'expert', executive.id);
    expect(guided.guidedActions).toBeUndefined();
    expect(guided.guidedLevers).toBeUndefined();
    expect(guided.tradeoffs).toEqual([]);
    expect(guided.limitations).toEqual(briefing.interpretation?.limitations);
    expect(guided.context).not.toContain('party profile');
    expect(guided.context).not.toMatch(/\d+% importance/);
    expect(standard.guidedActions).toBeUndefined();
    expect(standard.guidedLevers).toBeUndefined();
    expect(standard.context).toBe(briefing.interpretation?.summary);
    expect(expert.context).toBeUndefined();
    expect(expert.guidedActions).toBeUndefined();
    expect(guided.headline).toContain('Unemployment has increased');
    expect([guided, standard, expert].every(result => result.headline === briefing.headline)).toBe(true);
    expect([guided, standard, expert].every(result => result.tellMeMoreAvailable)).toBe(true);
    expect(JSON.stringify(initial)).toBe(before);
    expect(Object.keys(politicalRegistry.parties).length).toBeGreaterThan(0);
  });

  it('keeps the normal FiscalPolicy UI off the engine-debug Reality support API', () => {
    const source = readFileSync(new URL('../../components/FiscalPolicy.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/inspectProposalSupport/);
    expect(source).toContain('produceGovernmentProposalEstimate');
    expect(source).toContain('inspectGovernmentProposalEstimates');
  });

  it('does not expose detailed proposal analysis to an opposition leader through Tell Me More', () => {
    const proposal = parliamentaryProposal(initial, 'rejected');
    const state = { ...initial, governance: { ...initial.governance, proposals: { ...initial.governance.proposals, [proposal.id]: proposal } } };
    const briefing = addProposalResultBriefing(state, proposal).information.briefings[0];
    expect(explainBriefing(state, briefing, leaderFor(proposal.countryId).id).join(' ')).toContain('Public record');
    const officeHolder = assignPoliticalOffice(setControlledPerson(state, leaderFor(proposal.countryId).id), leaderFor(proposal.countryId).id, { role: 'head_of_government', countryId: proposal.countryId });
    expect(explainBriefing(officeHolder, briefing, leaderFor(proposal.countryId).id).join(' ')).toContain('No dated Government Information estimate');
  });

  it('migrates a schema-12 governance save on its saved date without fabricating past reports', () => {
    const countryId = worldCountryIds.find(id => initial.fiscal.countries[id].annualBudget.infrastructure > 0)!;
    const date = '2034-05-06';
    let legacy: SimulationState = {
      ...initial,
      date,
      engine: { ...initial.engine, tick: 4321, seed: 'schema-12-information-migration' },
      governance: emptyGovernance(initial.date),
    };
    legacy = createPoliticalPerson(legacy, { displayName: 'Legacy officeholder', countryId });
    const personId = Object.keys(legacy.governance.persons).at(-1)!;
    legacy = assignPoliticalOffice(legacy, personId, { role: 'head_of_government', countryId });
    legacy = setControlledPerson(legacy, personId);
    const budget = legacy.fiscal.countries[countryId].annualBudget;
    legacy = createFiscalProposal(legacy, {
      proposerPersonId: personId,
      countryId,
      effectiveDate: '2034-05-07',
      payload: { annualBudget: { ...budget, infrastructure: budget.infrastructure * 2 } },
    });
    const expectedFiscal = structuredClone(legacy.fiscal);
    const expectedPerson = structuredClone(legacy.governance.persons[personId]);
    const expectedProposal = structuredClone(legacy.governance.proposals[legacy.governance.proposalOrder[0]]);
    const persistedSchema12 = JSON.stringify(legacy, (key, value) => {
      if (key === 'schemaVersion') return 12;
      return ['information', 'leadersInitializedOn', 'successions', 'successionOrder', 'nextSuccessionSequence'].includes(key) ? undefined : value;
    });
    const migrated = restoreSimulationState(persistedSchema12, worldRegions, {}, {}, worldContext);
    expect(migrated).toMatchObject({
      schemaVersion: 13,
      date,
      engine: { tick: 4321, seed: 'schema-12-information-migration' },
      information: { initializedOn: date, latestGovernmentReports: {}, governmentReportsById: {}, briefings: [], proposalEstimates: [] },
    });
    expect(migrated.fiscal).toEqual(expectedFiscal);
    expect(migrated.governance.persons[personId]).toMatchObject(expectedPerson);
    expect(migrated.governance.proposals[migrated.governance.proposalOrder[0]]).toEqual(expectedProposal);
    expect(Object.values(migrated.governance.persons).filter(person => person.isPartyLeader && person.status === 'active')).toHaveLength(Object.keys(politicalRegistry.parties).length);
    expect(restoreSimulationState(serializeSimulationState(migrated, worldContext), worldRegions, {}, {}, worldContext)).toEqual(migrated);
  });

  it('rejects incomplete schema-13 information instead of silently discarding it', () => {
    const malformed = structuredClone(initial);
    malformed.information.initializedOn = undefined;
    expect(() => restoreSimulationState(serializeSimulationState(malformed), worldRegions, {}, {}, worldContext))
      .toThrow(/Malformed government information state/);
  });

  it('adds an empty estimate collection to a prior schema-13 save without inventing reports or evaluations', () => {
    const previousSave = structuredClone(initial);
    delete (previousSave.information as Partial<typeof previousSave.information>).proposalEstimates;
    const restored = restoreSimulationState(JSON.stringify(previousSave), worldRegions, {}, {}, worldContext);
    expect(restored.information.proposalEstimates).toEqual([]);
    expect(restored.information.latestGovernmentReports).toEqual({});
    expect(restored.information.briefings).toEqual([]);
    expect(restored.date).toBe(initial.date);
    expect(restored.engine.tick).toBe(initial.engine.tick);
    expect(restored.engine.seed).toBe(initial.engine.seed);
  });

  it('starts information state empty on an arbitrary migration date without fabricating past reports', () => {
    expect(emptyInformation('2034-05-06')).toMatchObject({
      initializedOn: '2034-05-06',
      latestGovernmentReports: {},
      governmentReportsById: {},
      briefings: [],
    });
  });
});
