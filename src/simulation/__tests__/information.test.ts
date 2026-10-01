import { beforeAll, describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import type { GovernmentReport, MinisterialBriefing } from '../information/model';
import type { PoliticalProposal } from '../governance/model';
import { assignPoliticalOffice, createFiscalProposal, createPoliticalPerson, setControlledPerson } from '../governance/runtime';
import { emptyGovernance } from '../governance/model';
import { assertSimulationInvariants } from '../invariants';
import { informationInvariant } from '../information/invariants';
import { emptyInformation } from '../information/model';
import { addProposalResultBriefing, explainBriefing, hasGovernmentInformationAccess, inspectBriefings, inspectGovernmentReports, presentBriefing, runInformationMonth } from '../information/runtime';
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
))!;
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

describe('government information and player briefings 0.15', () => {
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
      fact: { kind: 'parliamentary_result', outcome, yesSeats: proposal.voteResult!.yesSeats, noSeats: proposal.voteResult!.noSeats },
    });
    expect(inspectBriefings(briefed, proposal.countryId, 'uncontrolled-person')).toEqual([briefing]);
    expect(briefed.paused).toBe(base.paused);
  });

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

  it('changes only presentation depth across Guided, Standard and Expert assistance', () => {
    const proposal = parliamentaryProposal(initial, 'rejected');
    const briefing: MinisterialBriefing = {
      id: 'briefing:test',
      countryId: proposal.countryId,
      portfolio: 'finance',
      access: 'public',
      eventType: 'proposal_result',
      severity: 'advisory',
      createdOn: initial.date,
      sourceId: proposal.id,
      headline: 'Parliament rejected the reform by 152 votes to 161.',
      interpretation: 'The recorded result is not an isolated causal estimate.',
      fact: { kind: 'parliamentary_result', proposalId: proposal.id, outcome: 'rejected', yesSeats: 152, noSeats: 161, evidenceStatus: 'modelled' },
      pauseRequested: false,
    };
    const before = JSON.stringify(initial);
    const guided = presentBriefing(briefing, 'guided');
    const standard = presentBriefing(briefing, 'standard');
    const expert = presentBriefing(briefing, 'expert');
    expect(guided.guidedActions).toEqual(['Open proposal']);
    expect(standard.guidedActions).toBeUndefined();
    expect(expert.context).toBeUndefined();
    expect([guided, standard, expert].every(result => result.tellMeMoreAvailable)).toBe(true);
    expect(JSON.stringify(initial)).toBe(before);
    expect(Object.keys(politicalRegistry.parties).length).toBeGreaterThan(0);
  });

  it('does not expose detailed proposal analysis to an opposition leader through Tell Me More', () => {
    const proposal = parliamentaryProposal(initial, 'rejected');
    const state = { ...initial, governance: { ...initial.governance, proposals: { ...initial.governance.proposals, [proposal.id]: proposal } } };
    const briefing = addProposalResultBriefing(state, proposal).information.briefings[0];
    expect(explainBriefing(state, briefing, leaderFor(proposal.countryId).id).join(' ')).toContain('Public record');
    const officeHolder = assignPoliticalOffice(setControlledPerson(state, leaderFor(proposal.countryId).id), leaderFor(proposal.countryId).id, { role: 'head_of_government', countryId: proposal.countryId });
    expect(explainBriefing(officeHolder, briefing, leaderFor(proposal.countryId).id).join(' ')).toContain('No saved proposal analysis');
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
      information: { initializedOn: date, latestGovernmentReports: {}, governmentReportsById: {}, briefings: [] },
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

  it('starts information state empty on an arbitrary migration date without fabricating past reports', () => {
    expect(emptyInformation('2034-05-06')).toMatchObject({
      initializedOn: '2034-05-06',
      latestGovernmentReports: {},
      governmentReportsById: {},
      briefings: [],
    });
  });
});
