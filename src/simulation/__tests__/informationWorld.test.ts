/// <reference types="node" />
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { initializePartyLeaders, replacePartyLeader } from '../governance/runtime';
import { politicalRegistry } from '../politics/registry';
import { createCoreScheduler } from '../engine';
import { advanceSimulationDays } from '../engine';
import { serializeSimulationState } from '../save';
import { emptyGovernance } from '../governance/model';
import type { MinisterialBriefing } from '../information/model';
import { runInformationMonth } from '../information/runtime';
import { socioeconomicWorld, worldContext, worldCountryIds, worldPoliticalInputs, worldRegions } from './worldScenario';

describe('full-world information and leadership 0.15 benchmark', () => {
  it('measures initial leader generation, save impact, scheduled-day overhead and succession', () => {
    const base = socioeconomicWorld();
    let startedAt = performance.now();
    const leadersOnly = initializePartyLeaders({ ...base, governance: emptyGovernance(base.date) });
    const leaderGenerationMs = performance.now() - startedAt;

    startedAt = performance.now();
    const state = initializeNewGame(base, worldRegions, worldCountryIds, undefined, worldPoliticalInputs);
    const initializationMs = performance.now() - startedAt;
    const partyCount = Object.keys(politicalRegistry.parties).length;
    const leaderCount = Object.values(state.governance.persons).filter(person => person.isPartyLeader && person.status === 'active').length;
    const partyId = Object.keys(politicalRegistry.parties).sort()[0];
    const findPartyLeader = () => Object.values(leadersOnly.governance.persons)
      .filter(person => person.partyId === partyId && person.isPartyLeader && person.status === 'active');
    expect(findPartyLeader()).toHaveLength(1);
    startedAt = performance.now();
    let lookupCount = 0;
    for (let iteration = 0; iteration < 1_000; iteration += 1) lookupCount += findPartyLeader().length;
    const leaderLookupMs = (performance.now() - startedAt) / 1_000;
    expect(lookupCount).toBe(1_000);
    const serialized = serializeSimulationState(state, worldContext);
    const without015: Record<string, unknown> = JSON.parse(serialized);
    delete without015.information;
    without015.schemaVersion = 12;
    const legacyGovernance = without015.governance as Record<string, unknown>;
    delete legacyGovernance.leadersInitializedOn;
    delete legacyGovernance.successions;
    delete legacyGovernance.successionOrder;
    delete legacyGovernance.nextSuccessionSequence;
    const legacyPersons = legacyGovernance.persons as Record<string, Record<string, unknown>>;
    legacyGovernance.persons = Object.fromEntries(Object.entries(legacyPersons).filter(([, person]) => !person.leaderProvenance));
    legacyGovernance.nextPersonSequence = 0;
    const legacyBytes = Buffer.byteLength(JSON.stringify(without015));
    const currentBytes = Buffer.byteLength(serialized);

    const scheduler = createCoreScheduler();
    startedAt = performance.now();
    const ordinaryDay = scheduler.advanceOneDay(state).state;
    const ordinaryDayMs = performance.now() - startedAt;
    const beforeMonthly = advanceSimulationDays(state, 30);
    startedAt = performance.now();
    const monthlyDay = scheduler.advanceOneDay(beforeMonthly).state;
    const monthlyDayMs = performance.now() - startedAt;
    expect(monthlyDay.date).toBe('2026-02-01');
    const reportDate = '2026-02-01';
    startedAt = performance.now();
    const reportState = runInformationMonth({
      ...state,
      date: reportDate,
      socioeconomy: { ...state.socioeconomy, lastMonthlyDate: reportDate },
    });
    const reportGenerationMs = performance.now() - startedAt;
    expect(Object.keys(reportState.information.latestGovernmentReports)).toHaveLength(worldCountryIds.length);
    const briefingSample: MinisterialBriefing = {
      id: 'briefing:proposal_result:country.example:proposal.00000000',
      countryId: 'country.example',
      portfolio: 'finance',
      access: 'public',
      eventType: 'proposal_result',
      severity: 'advisory',
      createdOn: reportDate,
      sourceId: 'proposal.00000000',
      headline: 'Parliament rejected the reform by 152 votes to 161.',
      fact: { kind: 'parliamentary_result', proposalId: 'proposal.00000000', outcome: 'rejected', yesSeats: 152, noSeats: 161, evidenceStatus: 'modelled' },
      pauseRequested: false,
    };
    const briefingHistoryBytes = Buffer.byteLength(JSON.stringify(Array.from({ length: 256 }, (_, index) => ({
      ...briefingSample,
      id: `briefing:proposal_result:country.example:proposal.${String(index).padStart(8, '0')}`,
      sourceId: `proposal.${String(index).padStart(8, '0')}`,
    }))));

    startedAt = performance.now();
    const succeeded = replacePartyLeader(state, partyId);
    const successionMs = performance.now() - startedAt;
    expect(Object.values(leadersOnly.governance.persons).filter(person => person.isPartyLeader && person.status === 'active')).toHaveLength(partyCount);
    expect(leaderCount).toBe(partyCount);
    expect(succeeded.governance.successions[succeeded.governance.successionOrder.at(-1)!]).toMatchObject({ partyId, selection: 'modelled_fallback' });
    expect(ordinaryDay.engine.tick).toBe(state.engine.tick + 1);
    expect(monthlyDay.information.latestGovernmentReports).toBeDefined();

    const result = {
      benchmark: 'projectatlas-government-information-0.15',
      countries: worldCountryIds.length,
      regions: worldRegions.length,
      gameplayParties: partyCount,
      activeGameplayLeaders: leaderCount,
      isolatedLeaderGenerationMs: Number(leaderGenerationMs.toFixed(2)),
      singlePartyLeaderLookupMs: Number(leaderLookupMs.toFixed(4)),
      newGameInitializationMs: Number(initializationMs.toFixed(2)),
      informationStateBytes: Buffer.byteLength(JSON.stringify(state.information)),
      firstMonthlyReportGenerationMs: Number(reportGenerationMs.toFixed(2)),
      firstMonthlyReports: Object.keys(reportState.information.latestGovernmentReports).length,
      informationStateAfterFirstReportBytes: Buffer.byteLength(JSON.stringify(reportState.information)),
      serialized256BriefingHistoryBytes: briefingHistoryBytes,
      currentSaveBytes: currentBytes,
      estimatedSchema12SaveBytesWithout015: legacyBytes,
      estimatedSaveDeltaBytes: currentBytes - legacyBytes,
      ordinaryDayMs: Number(ordinaryDayMs.toFixed(4)),
      monthlyChangedDayMs: Number(monthlyDayMs.toFixed(2)),
      deterministicFallbackSuccessionMs: Number(successionMs.toFixed(2)),
    };
    console.info(`INFORMATION_WORLD_BENCHMARK ${JSON.stringify(result)}`);
  }, 60_000);
});
