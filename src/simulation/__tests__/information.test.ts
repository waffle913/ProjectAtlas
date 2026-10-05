import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMilitary } from '../military/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FiscalPolicy } from '../../components/FiscalPolicy';
import { CountryPanel } from '../../components/CountryPanel';
import entityRegistry from '../../data/entity-registry.json';
import type { EntityRegistry } from '../../data/registry';
import type { Country, SimulationState } from '../../types';
import type { GovernmentReport, MinisterialBriefing } from '../information/model';
import type { GovernanceGoal, PartyGoalProfile, PoliticalProposal } from '../governance/model';
import { assignPoliticalOffice, createFiscalProposal, createPoliticalPerson, estimateParliamentarySupport, inspectProposalSupport, replaceDraftProposal, resolveProposalVote, setControlledPerson, submitProposal, withdrawProposal } from '../governance/runtime';
import { derivePartyGoalProfile } from '../governance/analysis';
import type { PoliticalRegistry } from '../politics/model';
import { advanceSimulationDays } from '../engine';
import { emptyGovernance, governanceFingerprint } from '../governance/model';
import { selectUnresolvedFiscalProposal } from '../governance/selection';
import { assertSimulationInvariants } from '../invariants';
import { informationInvariant } from '../information/invariants';
import { INFORMATION_MODEL, INFORMATION_VERSION, emptyInformation, policyComparisonText, referencedGovernmentReportIds, retainCountryBriefings } from '../information/model';
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
function retentionHistory(counts: (countryId: string) => number, offsets: (countryId: string) => number = () => 0) {
  const briefings: MinisterialBriefing[] = [];
  const governmentReportsById: Record<string, GovernmentReport> = {};
  const latestGovernmentReports: Record<string, GovernmentReport> = {};
  for (const countryId of worldCountryIds) for (let index = 0; index < counts(countryId); index += 1) {
    const date = new Date(Date.UTC(2026, 0, 2 + offsets(countryId) + index)).toISOString().slice(0, 10);
    const source = report(countryId, date, 600 + index % 2 * 50);
    governmentReportsById[source.id] = source;
    latestGovernmentReports[countryId] = source;
    briefings.push({
      id: `briefing:labour_report:${countryId}:${source.id}`, countryId, createdOn: date,
      sourceId: source.id, portfolio: 'economy', access: 'government', eventType: 'labour_report',
      severity: 'advisory', headline: 'Synthetic bounded-retention stress fixture, not a historical observation.',
      fact: { kind: 'labour_report', reportId: source.id, valueBps: source.valueBps, previousValueBps: 650 - index % 2 * 50, evidenceStatus: 'partial' },
      pauseRequested: false,
    });
  }
  return { briefings, governmentReportsById, latestGovernmentReports };
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
function approvedProposalWithBaseline(adopted = true) {
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
          idealPointBps: (direction > 0) === adopted ? 10_000 : 0,
          importanceBps: 10_000,
          compromiseToleranceBps: 10_000,
          confidenceBps: 10_000,
          status: 'sourced_or_partial_prior',
        };
      }
      profiles[partyId] = derivePartyGoalProfile(registry.parties[partyId], overrides);
    }
    const estimate = estimateParliamentarySupport(state, proposal, registry, profiles);
    if (estimate.coverage !== 'complete' || (adopted ? !estimate.chambers.every(chamber => chamber.adopted) : estimate.chambers.every(chamber => chamber.adopted))) continue;
    state = resolveProposalVote(submitProposal(state, proposalId), proposalId, registry, profiles);
    return { countryId, baseline, state, proposal: state.governance.proposals[proposalId] };
  }
  throw new Error('No complete chamber fixture could adopt a temporal-follow-up proposal.');
}

describe('government information and player briefings 0.15', () => {
  describe('consolidated closure information and UI integrity', () => {
    let labour: SimulationState, adopted: SimulationState, rejected: SimulationState, unavailable: SimulationState, estimated: SimulationState;
    let countryId: string, personId: string, proposalId: string;
    beforeAll(() => {
      countryId = 'country.sxojze';
      const executive = Object.values(initial.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
      personId = executive.id;
      const previous = report(countryId, '2026-01-01', 600), current = report(countryId, '2026-02-01', 800);
      labour = withReports({ ...initial, date: '2026-02-01' }, [previous, current]);
      labour.information = { ...labour.information, briefings: [previous, current].map(source => ({
        id: `briefing:labour_report:${countryId}:${source.id}`, countryId, createdOn: source.asOfDate, sourceId: source.id,
        portfolio: 'economy', access: 'government', eventType: 'labour_report', severity: 'advisory',
        headline: 'Synthetic retained comparison evidence', pauseRequested: false,
        fact: { kind: 'labour_report', reportId: source.id, valueBps: source.valueBps, previousValueBps: source === current ? previous.valueBps : 650, evidenceStatus: 'partial' },
      })) };
      let drafted = createFiscalProposal(initial, { countryId, proposerPersonId: personId, effectiveDate: '2026-02-01', payload: { annualBudget: initial.fiscal.countries[countryId].annualBudget } });
      proposalId = drafted.governance.proposalOrder.at(-1)!;
      estimated = produceGovernmentProposalEstimate(drafted, proposalId, personId);
      drafted = setControlledPerson(drafted, personId);
      unavailable = resolveProposalVote(submitProposal(drafted, proposalId), proposalId);
      expect(unavailable.governance.proposals[proposalId].voteResult?.outcome).toBe('unavailable');
      adopted = approvedProposalWithBaseline().state;
      rejected = approvedProposalWithBaseline(false).state;
      for (const fixture of [labour, estimated, adopted, rejected, unavailable]) assertSimulationInvariants(fixture, worldContext, 'save');
    }, 30_000);

    const rejectCorruption = (fixture: SimulationState, mutate: (state: SimulationState) => void, error: RegExp) => {
      const state = { ...fixture, information: structuredClone(fixture.information), governance: structuredClone(fixture.governance) };
      mutate(state);
      expect(informationInvariant.check(state, worldContext, 'save').join(' ')).toMatch(error);
      expect(() => serializeSimulationState(state, worldContext)).toThrow(error);
      expect(() => restoreSimulationState(JSON.stringify(state), worldRegions, {}, {}, worldContext)).toThrow(error);
    };
    describe('six Government Information integrity gaps', () => {
      it.each(['absent', 'null', 'negative', 'fractional', 'over-bound', 'equal', 'subthreshold'] as const)('rejects %s labour previous value through invariant/save/reload', kind => {
        rejectCorruption(labour, state => {
          const fact = state.information.briefings[1].fact;
          if (kind === 'absent') delete fact.previousValueBps;
          if (kind === 'null') Object.assign(fact, { previousValueBps: null });
          if (kind === 'negative') fact.previousValueBps = -1;
          if (kind === 'fractional') fact.previousValueBps = 600.5;
          if (kind === 'over-bound') fact.previousValueBps = 10_001;
          if (kind === 'equal') fact.previousValueBps = fact.valueBps;
          if (kind === 'subthreshold') fact.previousValueBps = fact.valueBps! - 49;
        }, /invalid retained comparison basis/);
      }, 30_000);
      it.each([[0, 50], [50, 0], [10_000, 9_950], [9_950, 10_000]])('accepts an exact material boundary from %i to %i, including genuine zero', (previousValueBps, valueBps) => {
        const source = report(countryId, '2026-02-01', valueBps);
        const state = withReports({ ...initial, date: source.asOfDate }, [source]);
        state.information.briefings = [{ ...structuredClone(labour.information.briefings[1]),
          fact: { kind: 'labour_report', reportId: source.id, valueBps, previousValueBps, evidenceStatus: 'partial' },
        }];
        expect(restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext)).toEqual(state);
      }, 30_000);

      it.each(['modelled', 'unavailable'] as const)('rejects absent/empty/blank limitations on %s reports through invariant/save/reload', status => {
        for (const limitation of [undefined, '', ' \t\n']) {
          const fixture = withReports(initial, [report(countryId, initial.date, status === 'modelled' ? 600 : undefined)]);
          rejectCorruption(fixture, state => {
            const source = Object.values(state.information.governmentReportsById)[0];
            Object.assign(source, { limitation });
            state.information.latestGovernmentReports[countryId] = source;
          }, /lacks a.*limitation/);
        }
      }, 30_000);

      it.each(['report', 'briefing', 'request', 'analyzed-effective', 'fact-effective', 'anchor-effective', 'anchor-baseline'] as const)('rejects a %s date before Information initialization through invariant/save/reload', field => {
        rejectCorruption(field === 'report' || field === 'briefing' ? labour : field === 'request' || field === 'analyzed-effective' ? estimated : adopted, state => {
          const before = '2025-12-31';
          if (field === 'report') Object.values(state.information.governmentReportsById)[0].asOfDate = before;
          if (field === 'briefing') state.information.briefings[0].createdOn = before;
          if (field === 'request') state.information.proposalEstimates[0].requestedOn = before;
          if (field === 'analyzed-effective') state.information.proposalEstimates[0].analyzedContent.effectiveDate = before;
          const fact = state.information.briefings.find(item => item.fact.kind === 'parliamentary_result')?.fact;
          if (field === 'fact-effective') fact!.effectiveDate = before;
          if (field === 'anchor-effective') fact!.policyFollowUp!.effectiveDate = before;
          if (field === 'anchor-baseline') fact!.policyFollowUp!.baselineDate = before;
        }, /information.*initialization/i);
      }, 30_000);

      it.each(['effectiveDate', 'baselineDate'] as const)('rejects policy comparison %s predating Information initialization through invariant/save/reload', field => {
        const fixture = advanceSimulationDays(adopted, 31);
        expect(fixture.information.briefings.some(item => item.fact.policyComparisons?.length)).toBe(true);
        rejectCorruption(fixture, state => {
          state.information.briefings.find(item => item.fact.policyComparisons?.length)!.fact.policyComparisons![0][field] = '2025-12-31';
        }, /information.*initialization/i);
      }, 30_000);
      it('uses the actual Information initialization floor, not a hardcoded scenario date', () => {
        rejectCorruption(labour, state => { state.information.initializedOn = '2026-02-01'; }, /before Information initialization/);
      }, 30_000);

      it.each(['labour_report', 'proposal_result'] as const)('locks %s runtime portfolio, severity and pause metadata through invariant/save/reload', eventType => {
        for (const patch of [{ portfolio: 'defense' }, { severity: 'important' }, { severity: 'urgent' }, { pauseRequested: true }, { severity: 'urgent', pauseRequested: true }]) {
          rejectCorruption(eventType === 'labour_report' ? labour : adopted, state => {
            Object.assign(state.information.briefings.find(item => item.eventType === eventType)!, patch);
          }, /runtime metadata/);
        }
      }, 30_000);

      it('rejects reserved urgent events without a supported observation channel through invariant/save/reload', () => {
        rejectCorruption(labour, state => {
          const item = state.information.briefings[0];
          item.eventType = 'urgent_event'; item.severity = 'urgent'; item.pauseRequested = true;
          item.id = `briefing:urgent_event:${item.countryId}:${item.sourceId}`;
        }, /Malformed briefing/);
      }, 30_000);

      it.each(['proposal_result', 'labour_report'] as const)('rejects unsupported counterfactual attribution on %s through invariant/save/reload', eventType => {
        rejectCorruption(eventType === 'labour_report' ? labour : adopted, state => {
          const anchor = structuredClone(adopted.information.briefings.find(item => item.fact.kind === 'parliamentary_result')!.fact.policyFollowUp!);
          anchor.attributionStatus = 'supported_counterfactual';
          if (eventType === 'labour_report') {
            delete anchor.baselineReportId; delete anchor.baselineDate; delete anchor.baselineValueBps;
          }
          state.information.briefings.find(item => item.eventType === eventType)!.fact.policyFollowUp = anchor;
        }, /invalid temporal follow-up anchor/);
      }, 30_000);

      it.each(['partial', 'duplicate', 'missing', 'extra', 'wrong-key'] as const)('rejects %s unsupportedChanges through invariant/save/reload', kind => {
        rejectCorruption(estimated, state => {
          const changes = state.information.proposalEstimates[0].unsupportedChanges;
          if (kind === 'partial') changes[0].coverage = 'partial';
          if (kind === 'duplicate') changes.push(structuredClone(changes[0]));
          if (kind === 'missing') changes.pop();
          if (kind === 'extra') changes.push({ ...changes[0], path: 'unmodelled-extra' });
          if (kind === 'wrong-key') changes[0].path = 'policy';
        }, /unsupportedChanges/);
      }, 30_000);

      it('accepts exact payload-key coverage independently of entry order and dates equal to initialization', () => {
        const payload = { policy: initial.fiscal.countries[countryId].policy, annualBudget: initial.fiscal.countries[countryId].annualBudget };
        let state = createFiscalProposal(initial, { countryId, proposerPersonId: personId, effectiveDate: initial.date, payload });
        state = produceGovernmentProposalEstimate(state, state.governance.proposalOrder.at(-1)!, personId);
        const estimate = state.information.proposalEstimates[0];
        expect(estimate.requestedOn).toBe(state.information.initializedOn);
        expect(estimate.analyzedContent.effectiveDate).toBe(state.information.initializedOn);
        expect(estimate.unsupportedChanges.map(item => item.path).sort()).toEqual(['annualBudget', 'policy']);
        estimate.unsupportedChanges.reverse();
        expect(restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext)).toEqual(state);
      }, 30_000);
    });
    it.each(['sourced', 'observed', 'derived'] as const)('rejects unemployment relabelled %s at invariant/save/reload', status => {
      rejectCorruption(labour, state => {
        const source = Object.values(state.information.governmentReportsById)[0];
        Object.assign(source, { status });
      }, /Invalid government report semantics/);
    }, 30_000);
    it.each(['unavailable-with-value', 'numeric-unavailable-coverage', 'absent-modelled', 'absent-partial'] as const)('rejects inconsistent %s report', kind => {
      rejectCorruption(labour, state => {
        const source = Object.values(state.information.governmentReportsById)[0];
        if (kind === 'unavailable-with-value') source.status = 'unavailable';
        if (kind === 'numeric-unavailable-coverage') source.coverage = 'unavailable';
        if (kind === 'absent-modelled' || kind === 'absent-partial') source.valueBps = undefined;
        if (kind === 'absent-partial') source.status = 'unavailable';
      }, /Invalid government report semantics/);
    }, 30_000);
    it.each(['value', 'country', 'report-id', 'date', 'evidence', 'previous', 'subthreshold-previous'] as const)('rejects labour %s corruption at invariant/save/reload', kind => {
      rejectCorruption(labour, state => {
        const briefing = state.information.briefings[1];
        if (kind === 'value') briefing.fact.valueBps! += 1;
        if (kind === 'country') briefing.countryId = worldCountryIds.find(id => id !== countryId)!;
        if (kind === 'report-id') briefing.fact.reportId = state.information.briefings[0].fact.reportId;
        if (kind === 'date') briefing.createdOn = '2026-01-31';
        if (kind === 'evidence') briefing.fact.evidenceStatus = 'modelled';
        if (kind === 'previous') briefing.fact.previousValueBps = 500;
        if (kind === 'subthreshold-previous') briefing.fact.previousValueBps = 799;
      }, /Labour briefing/);
    }, 30_000);
    it('preserves a legitimate historical labour comparison whose exact prior report is no longer retained', () => {
      const state = { ...labour, information: structuredClone(labour.information) };
      const previousId = state.information.briefings.shift()!.fact.reportId!;
      delete state.information.governmentReportsById[previousId];
      expect(restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext)).toEqual(state);
    }, 30_000);
    it.each(['labour', 'parliamentary'] as const)('rejects edited %s briefing identity', kind => {
      rejectCorruption(kind === 'labour' ? labour : adopted, state => { state.information.briefings[0].id += ':edited'; }, /noncanonical/);
    }, 30_000);
    it.each(['country', 'outcome', 'date', 'evidence', 'chamber-id', 'chamber-name', 'chamber-total', 'chamber-coverage', 'chamber-outcome', 'effective-date'] as const)('rejects parliamentary %s corruption at invariant/save/reload', kind => {
      rejectCorruption(adopted, state => {
        const briefing = state.information.briefings.find(item => item.fact.kind === 'parliamentary_result')!;
        const chamber = briefing.fact.chamberResults![0];
        if (kind === 'country') briefing.countryId = worldCountryIds.find(id => id !== briefing.countryId)!;
        if (kind === 'outcome') briefing.fact.outcome = 'rejected';
        if (kind === 'date') briefing.createdOn = '2025-12-31';
        if (kind === 'evidence') briefing.fact.evidenceStatus = 'partial';
        if (kind === 'chamber-id') chamber.chamberId = 'invented';
        if (kind === 'chamber-name') chamber.displayName = 'Invented chamber';
        if (kind === 'chamber-total') chamber.totalSeats! += 1;
        if (kind === 'chamber-coverage') chamber.coverage = 'partial';
        if (kind === 'chamber-outcome') chamber.outcome = 'rejected';
        if (kind === 'effective-date') briefing.fact.effectiveDate = '2026-03-01';
      }, /Parliamentary briefing/);
    }, 30_000);
    it.each(['rejected', 'unavailable'] as const)('rejects fabricated adopted-only follow-up and date for %s', outcome => {
      const fixture = outcome === 'rejected' ? rejected : unavailable;
      for (const field of ['effectiveDate', 'policyFollowUp'] as const) rejectCorruption(fixture, state => {
        const fact = state.information.briefings.find(item => item.fact.kind === 'parliamentary_result')!.fact;
        const source = adopted.information.briefings.find(item => item.fact.kind === 'parliamentary_result')!.fact;
        if (field === 'effectiveDate') fact.effectiveDate = source.effectiveDate;
        else fact.policyFollowUp = structuredClone(source.policyFollowUp);
      }, /Parliamentary briefing/);
    }, 30_000);
    it.each(['invented-id', 'name', '900-seats', 'missing', 'duplicate', 'extra'] as const)('rejects structurally %s estimate chamber at invariant/save/reload', kind => {
      rejectCorruption(estimated, state => {
        const estimate = state.information.proposalEstimates[0], chambers = estimate.parliamentaryEstimate.chambers;
        if (kind === 'invented-id') chambers[0].chamberId = 'chamber.fake';
        if (kind === 'name') chambers[0].displayName = 'Invented legislature';
        if (kind === '900-seats') { chambers[0].totalSeats = 900; chambers[0].unavailableSeats = 900; }
        if (kind === 'missing') chambers.pop();
        if (kind === 'duplicate') chambers.push(structuredClone(chambers[0]));
        if (kind === 'extra') chambers.push({ ...chambers[0], chamberId: 'chamber.fake' });
        estimate.parliamentaryEstimate.totalSeats = chambers.reduce((sum, item) => sum + (item.totalSeats ?? 0), 0);
        estimate.parliamentaryEstimate.unavailableSeats = chambers.reduce((sum, item) => sum + item.unavailableSeats, 0);
      }, /chamberRegistry/);
    }, 30_000);
    it('rejects an estimate requested before the person existed without reconstructing tenure', () => {
      rejectCorruption(estimated, state => {
        state.date = '2026-02-01';
        state.governance.persons[personId].createdOn = '2026-01-02';
      }, /authorizedRequesterReference/);
    }, 30_000);
    it('rejects an estimate predating Information initialization', () => {
      rejectCorruption(estimated, state => { state.date = '2026-02-01'; state.information.initializedOn = '2026-01-02'; }, /authorizedRequesterReference/);
    }, 30_000);
    it('recovers an expired fiscal draft through explicit withdrawal and permits a new dated draft', () => {
      let state = setControlledPerson(initial, personId);
      state = createFiscalProposal(state, { countryId, proposerPersonId: personId, effectiveDate: '2026-01-02', payload: { annualBudget: state.fiscal.countries[countryId].annualBudget } });
      const id = state.governance.proposalOrder.at(-1)!;
      state = advanceSimulationDays(state, 2);
      expect(() => submitProposal(state, id)).toThrow(/retroactive/);
      const markup = renderToStaticMarkup(createElement(FiscalPolicy, { state, countryId, personId, onStateChange: () => undefined }));
      expect(markup).toContain('Withdraw proposal');
      expect(markup).toContain('effective date has passed');
      expect(state.governance.proposals[id].effectiveDate).toBe('2026-01-02');
      state = withdrawProposal(state, id);
      expect(selectUnresolvedFiscalProposal(state.governance, countryId, personId)).toBeUndefined();
      state = createFiscalProposal(state, { countryId, proposerPersonId: personId, effectiveDate: '2026-02-01', payload: { annualBudget: state.fiscal.countries[countryId].annualBudget } });
      const replacementId = state.governance.proposalOrder.at(-1)!;
      expect(submitProposal(state, replacementId).governance.proposals[replacementId].status).toBe('submitted');
      expect(state.governance.proposals[id].status).toBe('withdrawn');
      expect(restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext)).toEqual(state);
    }, 30_000);
    it('renders and exercises sponsorship independently of confidential information without granting new capabilities', () => {
      let state = setControlledPerson(initial, personId);
      const person = state.governance.persons[personId];
      expect(person.office!.authorityProfile.capabilities).toContain('sponsor_budget_reform');
      state = { ...state, governance: { ...state.governance, persons: { ...state.governance.persons, [personId]: {
        ...person, office: { ...person.office!, authorityProfile: { ...person.office!.authorityProfile,
          capabilities: person.office!.authorityProfile.capabilities.filter(capability => capability !== 'access_government_information'),
        } },
      } } } };
      expect(hasGovernmentInformationAccess(state, personId, countryId)).toBe(false);
      const markup = renderToStaticMarkup(createElement(FiscalPolicy, { state, countryId, personId, onStateChange: () => undefined }));
      expect(markup).toContain('Create annual-budget proposal');
      expect(markup).toContain('Proposed infrastructure allocation');
      state = createFiscalProposal(state, { countryId, proposerPersonId: personId, effectiveDate: '2026-02-01', payload: { annualBudget: state.fiscal.countries[countryId].annualBudget } });
      const id = state.governance.proposalOrder.at(-1)!;
      expect(submitProposal(state, id).governance.proposals[id].status).toBe('submitted');
      expect(() => produceGovernmentProposalEstimate(state, id, personId)).toThrow(/Government office access/i);
      const draftMarkup = renderToStaticMarkup(createElement(FiscalPolicy, { state, countryId, personId, onStateChange: () => undefined }));
      expect(draftMarkup).toContain('Submit immutable proposal');
      expect(draftMarkup).not.toContain('Estimate proposal reactions');
      expect(draftMarkup).not.toContain('Last Government Information estimate');
      const noOffice = createPoliticalPerson(state, { displayName: 'No-office closure person', countryId });
      const noOfficeId = `person.${String(noOffice.governance.nextPersonSequence - 1).padStart(8, '0')}`;
      const restricted = renderToStaticMarkup(createElement(FiscalPolicy, { state: noOffice, countryId, personId: noOfficeId, onStateChange: () => undefined }));
      expect(restricted).not.toContain('Submit immutable proposal');
      expect(restricted).not.toContain('Create annual-budget proposal');
      expect(restricted).not.toContain('Existing modelled annual allocation');
      expect(restricted).not.toContain('Current model rule');
    });
    it('renders public offices without raw real officeholder identities and retains their source records', () => {
      const offices = worldPoliticalInputs.offices!;
      const available = offices.officeholders.find(holder => holder.status === 'available')!;
      const firstOffice = offices.offices.find(office => office.id === available.officeId)!;
      const officeholders = offices.offices.filter(office => office.countryId === firstOffice.countryId).map(office => ({
        office, holder: offices.officeholders.find(holder => holder.officeId === office.id)!,
      }));
      const definition = (entityRegistry as EntityRegistry).countries.find(item => item.id === firstOffice.countryId)!;
      const country: Country = { ...definition, kind: 'sovereign' };
      const markup = renderToStaticMarkup(createElement(CountryPanel, { country, officeholders }));
      for (const { holder } of officeholders) if (holder.status === 'available') expect(markup).not.toContain(holder.person.name);
      expect(markup).toContain('Source record available');
      expect(officeholders.some(({ holder }) => holder.status === 'available' && holder.person.name)).toBe(true);
    });
  });

  it('reports split unicameral plurality abstentions with version-neutral limitations', () => {
    const source = parliamentaryProposal(initial, 'adopted'), proposal = structuredClone(source);
    proposal.evaluationVersion = 'plurality-0.15-v1';
    proposal.voteResult = { ...source.voteResult!, yesSeats: 161, noSeats: 100, abstainSeats: 52, procedure: 'internal_party_distribution_v1',
      chambers: [{ chamberId: 'chamber.fixture', yesSeats: 161, noSeats: 100, abstainSeats: 52, unavailableSeats: 0, totalSeats: 313, coverage: 'complete', adopted: true }] };
    const next = addProposalResultBriefing(initial, proposal), briefing = next.information.briefings.find(item => item.fact.proposalId === proposal.id)!;
    expect(briefing.headline).toContain('52 abstentions'); expect(briefing.interpretation!.limitations.join(' ')).toContain('recorded chamber-level');
    expect(briefing.interpretation!.limitations.join(' ')).not.toContain('0.14'); expect(briefing.pauseRequested).toBe(false);
  });
  it('reports exact large labour-force ratios from the accessible reporting boundary', () => {
    const countryId = reportingCountry(), state = structuredClone(initial), regionIds = Object.keys(state.socioeconomy.regions).filter(id => state.regionOwnership[id] === countryId);
    for (const id of regionIds) { state.socioeconomy.regions[id].economy!.labourForce = 0; state.socioeconomy.regions[id].economy!.unemployed = 0; }
    state.socioeconomy.regions[regionIds[0]].economy!.labourForce = Number.MAX_SAFE_INTEGER;
    state.socioeconomy.regions[regionIds[0]].economy!.unemployed = Number.MAX_SAFE_INTEGER - 37;
    state.date = '2026-02-01'; state.socioeconomy.lastMonthlyDate = state.date;
    expect(runInformationMonth(state).information.latestGovernmentReports[countryId].valueBps).toBe(10_000);
  });
  it('creates unavailable proposal reactions only for an authorized executive without copying political Reality', () => {
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
      coverage: 'unavailable',
      confidenceBps: 0,
      publicEstimate: { supportBps: 0, opposeBps: 0, neutralBps: 0, unknownBps: 10_000 },
      parliamentaryEstimate: { yesSeats: 0, noSeats: 0, abstainSeats: 0, coverage: 'unavailable' },
      expectedConsequences: [],
      provenance: { status: 'unavailable', engine: 'government-information-0.15-v2', source: 'government-information.available-evidence' },
    });
    expect(estimated.governance.proposals[proposalId].analysis).toBeUndefined();
    expect(inspectGovernmentProposalEstimates(estimated, countryId, opposition.id)).toEqual([]);
    expect(() => produceGovernmentProposalEstimate(drafted, proposalId, opposition.id)).toThrow(/Government office access/);
    expect(informationInvariant.check(estimated, worldContext, 'save')).toEqual([]);
    const restored = restoreSimulationState(serializeSimulationState(estimated, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.information.proposalEstimates).toEqual(estimated.information.proposalEstimates);
    const changedReality = {
      ...drafted,
      socioeconomy: { ...drafted.socioeconomy, regions: {} },
      politics: { ...drafted.politics, countries: {} },
      fiscal: { ...drafted.fiscal, countries: {} },
      crisis: { ...drafted.crisis, countries: {} },
    };
    expect(produceGovernmentProposalEstimate(changedReality, proposalId, executive.id).information.proposalEstimates)
      .toEqual(estimated.information.proposalEstimates);
    expect(inspectProposalSupport(drafted, proposalId).informationStatus).toBe('engine_debug_reality');
  });

  it('binds estimates to effective date and payload, marks edited drafts stale, and re-estimates on the same day', () => {
    const executive = Object.values(initial.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
    const countryId = executive.countryId;
    const annualBudget = initial.fiscal.countries[countryId].annualBudget;
    let state = createFiscalProposal(initial, { proposerPersonId: executive.id, countryId, effectiveDate: '2026-02-01', payload: { annualBudget } });
    const proposalId = state.governance.proposalOrder.at(-1)!;
    state = produceGovernmentProposalEstimate(state, proposalId, executive.id);
    const old = state.information.proposalEstimates[0];
    expect(old.proposalContentFingerprint).toBe(governanceFingerprint(old.analyzedContent));
    state = replaceDraftProposal(state, proposalId, { payload: { annualBudget: { ...annualBudget, infrastructure: annualBudget.infrastructure + 1 } } });
    expect(inspectGovernmentProposalEstimates(state, countryId, executive.id)[0].stale).toBe(true);
    const staleMarkup = renderToStaticMarkup(createElement(FiscalPolicy, { state, countryId, personId: executive.id, onStateChange: () => undefined }));
    expect(staleMarkup).not.toContain('Last Government Information estimate');
    expect(staleMarkup).not.toContain('Government Information estimate ·');
    expect(staleMarkup).toContain(proposalId);
    expect(informationInvariant.check(state, worldContext, 'save')).toEqual([]);
    state = produceGovernmentProposalEstimate(state, proposalId, executive.id);
    expect(state.information.proposalEstimates).toHaveLength(2);
    expect(inspectGovernmentProposalEstimates(state, countryId, executive.id).map(item => item.stale)).toEqual([true, false]);
    expect(state.information.proposalEstimates[1].id).not.toBe(old.id);
    const currentMarkup = renderToStaticMarkup(createElement(FiscalPolicy, { state, countryId, personId: executive.id, onStateChange: () => undefined }));
    expect(currentMarkup).toContain('responses UNKNOWN');
    expect(currentMarkup).not.toContain('0 yes, 0 no seats');
    state = replaceDraftProposal(state, proposalId, { effectiveDate: '2026-03-01' });
    expect(inspectGovernmentProposalEstimates(state, countryId, executive.id).every(item => item.stale)).toBe(true);
    state = produceGovernmentProposalEstimate(state, proposalId, executive.id);
    expect(state.information.proposalEstimates).toHaveLength(3);
    const duplicate = produceGovernmentProposalEstimate(state, proposalId, executive.id);
    expect(duplicate.information.proposalEstimates).toEqual(state.information.proposalEstimates);
    const invalid = structuredClone(state);
    invalid.information.proposalEstimates[0].analyzedContent.effectiveDate = '2026-12-01';
    expect(informationInvariant.check(invalid, worldContext, 'save').join(' ')).toContain('contentFingerprint');
    expect(restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext)).toEqual(state);
  });

  it('resumes a canonical unresolved proposal when local selection is lost, scoped to person and Country', () => {
    const executive = Object.values(initial.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
    const countryId = executive.countryId;
    const state = createFiscalProposal(setControlledPerson(initial, executive.id), {
      proposerPersonId: executive.id, countryId, effectiveDate: '2026-02-01',
      payload: { annualBudget: initial.fiscal.countries[countryId].annualBudget },
    });
    const proposalId = state.governance.proposalOrder.at(-1)!;
    expect(selectUnresolvedFiscalProposal(state.governance, countryId, executive.id)?.id).toBe(proposalId);
    expect(selectUnresolvedFiscalProposal(state.governance, countryId, executive.id, 'lost-ui-selection')?.id).toBe(proposalId);
    expect(selectUnresolvedFiscalProposal(state.governance, countryId, 'other-person')).toBeUndefined();
    expect(selectUnresolvedFiscalProposal(state.governance, 'other-country', executive.id)).toBeUndefined();
    const restored = restoreSimulationState(serializeSimulationState(submitProposal(state, proposalId), worldContext), worldRegions, {}, {}, worldContext);
    expect(selectUnresolvedFiscalProposal(restored.governance, countryId, executive.id)?.status).toBe('submitted');
    const resolved = resolveProposalVote(restored, proposalId);
    expect(selectUnresolvedFiscalProposal(resolved.governance, countryId, executive.id)).toBeUndefined();
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
    const base = { ...initial, paused: false };
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
    const roundTrip = restoreSimulationState(serializeSimulationState(nextMonth, worldContext), worldRegions, {}, {}, worldContext);
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

  it('does not interpret a canonical crisis activation as a government-visible observation', () => {
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
    expect(state.information.briefings).toEqual([]);
    expect(state.crisis.countries[countryId].currentByType.fiscal_stress).toEqual(active);
    expect(informationInvariant.check(state, worldContext, 'tick')).toEqual([]);
  });

  it('bounds and deterministically deduplicates briefing history', () => {
    let state = initial;
    const proposalIds: string[] = [];
    for (let index = 0; index < 258; index += 1) {
      const proposal = parliamentaryProposal(state, index % 2 ? 'adopted' : 'rejected');
      const unique = { ...proposal, id: `proposal.history-${String(index).padStart(4, '0')}` };
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

  it('retains domestic briefings and report baselines despite over 256 events in other Countries', () => {
    const domestic = approvedProposalWithBaseline();
    const domesticBriefing = domestic.state.information.briefings[0];
    let state = domestic.state;
    const others = worldCountryIds.filter(id => id !== domestic.countryId).slice(0, 2);
    for (const countryId of others) for (let index = 0; index < 270; index += 1) {
      const proposal = { ...parliamentaryProposal(state, 'rejected'), id: `proposal.history-${countryId}-${index}`, countryId };
      state = { ...state, governance: { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: proposal } } };
      state = addProposalResultBriefing(state, proposal);
    }
    expect(state.information.briefings).toHaveLength(513);
    expect(state.information.briefings.filter(item => item.countryId === domestic.countryId)).toEqual([domesticBriefing]);
    for (const countryId of others) expect(state.information.briefings.filter(item => item.countryId === countryId)).toHaveLength(256);
    expect(state.information.governmentReportsById[domesticBriefing.fact.policyFollowUp!.baselineReportId!]).toEqual(domestic.baseline);
    expect(informationInvariant.check(state, worldContext, 'save')).toEqual([]);
  }, 30_000);

  it('enforces the global cap, foreign floor, player preference and deterministic date-and-ID tie ordering under extreme noise', () => {
    const playerCountry = Object.values(initial.governance.persons).find(person => person.isPartyLeader)!.countryId;
    const noisyCountry = worldCountryIds.find(id => id !== playerCountry)!;
    const history = retentionHistory(id => id === playerCountry ? 300 : id === noisyCountry ? 3_000 : 12,
      id => id === playerCountry ? 0 : id === noisyCountry ? 2_000 : 1_000);
    const retained = retainCountryBriefings(history.briefings, playerCountry);
    const withoutPlayer = retainCountryBriefings(history.briefings);
    expect(history.briefings.length).toBeGreaterThan(2_048);
    expect(retained).toHaveLength(2_048);
    expect(withoutPlayer).toHaveLength(2_048);
    expect(retained.filter(item => item.countryId === playerCountry)).toHaveLength(256);
    expect(withoutPlayer.filter(item => item.countryId === playerCountry)).toHaveLength(4);
    const ids = new Set(retained.map(item => item.id));
    for (const countryId of worldCountryIds) {
      const country = retained.filter(item => item.countryId === countryId);
      expect(country.length).toBeGreaterThanOrEqual(4);
      expect(country.length).toBeLessThanOrEqual(256);
      for (const latest of history.briefings.filter(item => item.countryId === countryId).slice(-4)) expect(ids.has(latest.id)).toBe(true);
    }
    expect(retainCountryBriefings([...history.briefings].reverse(), playerCountry)).toEqual(retained);
    expect(retainCountryBriefings(retained, playerCountry)).toEqual(retained);
    const excessive = { ...initial, date: '2050-01-01', information: { ...initial.information, ...history } };
    expect(informationInvariant.check(excessive, worldContext, 'save').join(' ')).toContain('Global briefing history exceeds');
    expect(() => restoreSimulationState(JSON.stringify(excessive), worldRegions, {}, {}, worldContext)).toThrow(/Global briefing history exceeds/);
  }, 30_000);

  it('fails explicitly when the protected minimum cannot fit or duplicate input would invalidate the hard bound', () => {
    const template = retentionHistory(() => 1).briefings[0];
    const impossible = Array.from({ length: 513 * 4 }, (_, index) => ({
      ...template, id: `capacity-fixture-${index}`, countryId: `capacity-fixture-country-${Math.floor(index / 4)}`,
    }));
    expect(() => retainCountryBriefings(impossible)).toThrow(/Country minimum/);
    expect(() => retainCountryBriefings([template, template])).toThrow(/duplicate briefing IDs/);
  });

  it('removes orphaned temporal comparisons and their unreferenced baseline when the domestic anchor expires', () => {
    const domestic = approvedProposalWithBaseline();
    const baselineId = domestic.state.information.briefings[0].fact.policyFollowUp!.baselineReportId!;
    let state = runInformationMonth({
      ...domestic.state, date: '2026-02-01',
      socioeconomy: { ...domestic.state.socioeconomy, lastMonthlyDate: '2026-02-01' },
    });
    const labourId = state.information.briefings.find(item => item.countryId === domestic.countryId && item.fact.kind === 'labour_report')!.id;
    expect(state.information.governmentReportsById[baselineId]).toBeDefined();
    for (let index = 0; index < 255; index += 1) {
      const proposal = { ...parliamentaryProposal(state, 'rejected'), id: `proposal.domestic-retention-${index}`, countryId: domestic.countryId };
      state = { ...state, governance: { ...state.governance, proposals: { ...state.governance.proposals, [proposal.id]: proposal } } };
      state = addProposalResultBriefing(state, proposal);
    }
    expect(state.information.briefings).toHaveLength(256);
    expect(state.information.briefings.find(item => item.id === labourId)?.fact.policyComparisons).toEqual([]);
    expect(state.information.briefings.find(item => item.id === labourId)?.headline).not.toContain('Since the measure entered into force');
    expect(state.information.governmentReportsById[baselineId]).toBeUndefined();
    expect(informationInvariant.check(state, worldContext, 'save')).toEqual([]);
  }, 30_000);

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
      schemaVersion: 18,
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

  it('explicitly upgrades information-v1 in schema 13 without rewriting political persons or simulated history', () => {
    const executive = Object.values(initial.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
    let base = withReports(setControlledPerson(initial, executive.id), [report(executive.countryId, initial.date, 700)]);
    base = createFiscalProposal(base, { proposerPersonId: executive.id, countryId: executive.countryId, effectiveDate: '2026-02-01', payload: { annualBudget: base.fiscal.countries[executive.countryId].annualBudget } });
    const id = base.governance.proposalOrder.at(-1)!;
    base = resolveProposalVote(submitProposal(base, id), id);
    const previousSave = structuredClone(base) as unknown as Record<string, unknown>;
    const legacyInformation = previousSave.information as Record<string, unknown>;
    legacyInformation.version = 'information-0.15-v1';
    legacyInformation.proposalEstimates = [{ id: 'unsafe-reality-estimate' }];
    legacyInformation.briefings = [...base.information.briefings, {
      id: 'unsafe-crisis-observation', countryId: reportingCountry(),
      eventType: 'crisis_activation', fact: { kind: 'crisis_activation' },
    }];
    const restored = restoreSimulationState(JSON.stringify(previousSave), worldRegions, {}, {}, worldContext);
    expect(restored.information.proposalEstimates).toEqual([]);
    expect(restored.information.latestGovernmentReports).toEqual(base.information.latestGovernmentReports);
    expect(restored.information.governmentReportsById).toEqual(base.information.governmentReportsById);
    expect(restored.information.briefings).toEqual(base.information.briefings);
    expect(restored.date).toBe(initial.date);
    expect(restored.engine.tick).toBe(initial.engine.tick);
    expect(restored.engine.seed).toBe(initial.engine.seed);
    expect(restored.governance).toEqual(base.governance);
    expect(restored.fiscal).toEqual(base.fiscal);
    expect(restored.crisis).toEqual(base.crisis);
    expect(restored.information.version).toBe(INFORMATION_VERSION);
  });

  it('explicitly migrates v2 retention while preserving safe estimates, control and all political/material history', () => {
    const executive = Object.values(initial.governance.persons).find(person => person.leaderProvenance?.sourceLeader?.id === 'wikidata:Q566257')!;
    let base = setControlledPerson(initial, executive.id);
    base = createFiscalProposal(base, { proposerPersonId: executive.id, countryId: executive.countryId, effectiveDate: '2026-02-01', payload: { annualBudget: base.fiscal.countries[executive.countryId].annualBudget } });
    base = produceGovernmentProposalEstimate(base, base.governance.proposalOrder.at(-1)!, executive.id);
    const noisyCountry = worldCountryIds.find(id => id !== executive.countryId)!;
    const history = retentionHistory(id => id === executive.countryId ? 300 : id === noisyCountry ? 3_000 : 12,
      id => id === executive.countryId ? 0 : id === noisyCountry ? 2_000 : 1_000);
    const previous = { ...base, date: '2050-01-01', information: { ...base.information, ...history, version: 'information-0.15-v2' } };
    const restored = restoreSimulationState(JSON.stringify(previous), worldRegions, {}, {}, worldContext);
    expect(restored.information.version).toBe(INFORMATION_VERSION);
    expect(restored.information.briefings).toEqual(retainCountryBriefings(history.briefings, executive.countryId));
    expect(restored.information.briefings).toHaveLength(INFORMATION_MODEL.briefingHistoryLimitGlobal);
    expect(restored.information.proposalEstimates).toEqual(base.information.proposalEstimates);
    expect(restored.information.latestGovernmentReports).toEqual(history.latestGovernmentReports);
    const references = referencedGovernmentReportIds(restored.information);
    expect(Object.keys(restored.information.governmentReportsById).sort()).toEqual([...references].sort());
    expect(restored.information.governmentReportsById[history.briefings[0].fact.reportId!]).toBeUndefined();
    const { information: restoredInformation, ...restoredCanonical } = restored;
    const { information: previousInformation, ...previousCanonical } = previous;
    expect(restoredCanonical).toEqual(previousCanonical);
    expect(restoredInformation.initializedOn).toBe(previousInformation.initializedOn);
    expect(restoreSimulationState(serializeSimulationState(restored, worldContext), worldRegions, {}, {}, worldContext)).toEqual(restored);
  }, 30_000);

  it('releases baseline references and orphan comparisons when the global cap expires their foreign policy anchor', () => {
    const domestic = approvedProposalWithBaseline();
    const advanced = advanceSimulationDays(domestic.state, 59);
    expect(advanced.date).toBe('2026-03-01');
    const anchor = domestic.state.information.briefings[0];
    const history = retentionHistory(() => 20, () => 31);
    const comparison = history.briefings.filter(item => item.countryId === domestic.countryId).at(-1)!;
    comparison.fact.policyComparisons = [{
      proposalId: anchor.fact.proposalId!, effectiveDate: anchor.fact.policyFollowUp!.effectiveDate,
      baselineDate: domestic.baseline.asOfDate, baselineValueBps: domestic.baseline.valueBps!,
      currentValueBps: comparison.fact.valueBps!, attributionStatus: 'temporal_only',
    }];
    comparison.headline += policyComparisonText(comparison.fact.policyComparisons[0]);
    const previous = {
      ...advanced,
      governance: { ...advanced.governance, player: { ...advanced.governance.player, controlledPersonId: undefined } },
      information: {
        ...advanced.information, ...history, version: 'information-0.15-v2',
        briefings: [...history.briefings, anchor],
        governmentReportsById: { ...history.governmentReportsById, [domestic.baseline.id]: domestic.baseline },
      },
    };
    const restored = restoreSimulationState(JSON.stringify(previous), worldRegions, {}, {}, worldContext);
    expect(restored.information.briefings).toHaveLength(2_048);
    expect(restored.information.briefings.some(item => item.id === anchor.id)).toBe(false);
    expect(restored.information.briefings.find(item => item.id === comparison.id)!.fact.policyComparisons).toEqual([]);
    expect(restored.information.briefings.find(item => item.id === comparison.id)!.headline).not.toContain('Since the measure entered into force');
    expect(restored.information.governmentReportsById[domestic.baseline.id]).toBeUndefined();
    expect(informationInvariant.check(restored, worldContext, 'save')).toEqual([]);
    expect(restored.governance).toEqual(previous.governance);
  }, 30_000);

  it('rejects missing v2/v3 estimate history instead of silently repairing a malformed state', () => {
    for (const version of ['information-0.15-v2', INFORMATION_VERSION]) {
      const malformed = { ...initial, information: { ...initial.information, version, proposalEstimates: undefined } };
      expect(() => restoreSimulationState(JSON.stringify(malformed), worldRegions, {}, {}, worldContext)).toThrow(/Malformed government information state/);
    }
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
