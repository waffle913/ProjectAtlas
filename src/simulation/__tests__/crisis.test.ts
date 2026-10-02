import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyCrisis, initializeCrisisState, CRISIS_TYPES, type CrisisType } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { inspectCrises, runCrisisMonth } from '../crisis/runtime';
import { crisisInvariant } from '../crisis/invariants';
import { emptyFiscal } from '../fiscal/model';
import { initializeFiscal, runFiscalMonth } from '../fiscal/runtime';
import { requestFidelityTransition, applyPendingFidelityTransitions } from '../fidelity';
import { assertSimulationInvariants, validateFidelityConservation } from '../invariants';
import { deterministicInteger } from '../rng';
import { migrateSimulationState, restoreSimulationState, serializeSimulationState } from '../save';
import type { SchedulerTaskContext } from '../scheduler';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { createEngineState } from '../state';
import { createCoreScheduler } from '../engine';
import { SimulationClock } from '../clock';

const region = (id: string): RegionEntity => ({ id: `region.${id}`, parentCountryId: `country.${id}`, initialOwnerCountryId: `country.${id}`, commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } });
const build = (ids = ['a'], seed = 'crisis-seed'): { state: SimulationState; regions: RegionEntity[] } => {
  const regions = ids.map(region), countryIds = ids.map(id => `country.${id}`);
  let state: SimulationState = {
    schemaVersion: 13, governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
    territoryOwnership: {}, regionOwnership: Object.fromEntries(regions.map(r => [r.id, r.parentCountryId])),
    populationByRegion: Object.fromEntries(regions.map(r => [r.id, 100_000])), economicOutputByRegion: Object.fromEntries(regions.map(r => [r.id, 1_200_000_000])),
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(countryIds, seed),
  };
  state = initializeFiscal(initializeSocioeconomy(state, regions));
  state = runFiscalMonth({ ...state, date: '2026-02-01' });
  return { state, regions };
};

const context = (state: SimulationState, forcedRoll?: number): SchedulerTaskContext => ({
  date: state.date, tick: state.engine.tick, cadence: 'monthly', execution: 'scheduled', eventKey: 'cadence:monthly',
  random: {
    uint32: key => deterministicInteger(state.engine.seed, { system: 'crisis.monthly', entityId: key?.entityId, date: state.date, tick: state.engine.tick, eventKey: 'cadence:monthly' }, 0, 0x1_0000_0000),
    float: key => deterministicInteger(state.engine.seed, { system: 'crisis.monthly', entityId: key?.entityId, date: state.date, tick: state.engine.tick, eventKey: 'cadence:monthly' }, 0, 1_000_000) / 1_000_000,
    integer: (min, max, key) => forcedRoll === undefined ? deterministicInteger(state.engine.seed, { system: 'crisis.monthly', entityId: key?.entityId, date: state.date, tick: state.engine.tick, eventKey: 'cadence:monthly' }, min, max) : Math.min(max - 1, Math.max(min, forcedRoll)),
  },
});
const evaluate = (state: SimulationState, month: number, forcedRoll?: number) => {
  const next = { ...state, date: `2026-${String(month).padStart(2, '0')}-01`, engine: { ...state.engine, tick: state.engine.tick + 30 } };
  return runCrisisMonth(next, context(next, forcedRoll));
};
const episode = (state: SimulationState, type: CrisisType, id = 'country.a') => state.crisis.countries[id].currentByType[type];

function makeDangerous(state: SimulationState, type: CrisisType, countryId = 'country.a') {
  const next = structuredClone(state), country = next.fiscal.countries[countryId], account = country.account!;
  if (type === 'fiscal_stress') {
    const localRegion = next.socioeconomy.regions[`region.${countryId.slice('country.'.length)}`], output = localRegion.economy!.output;
    account.stress.unpaidCommitments = Math.max(1, account.totalRevenue * 2); account.interestPaid = Math.max(1, Math.floor(account.totalRevenue * 0.3)); country.debt = output * 18; account.totalSpending = account.totalRevenue + Math.floor(output * 0.2);
  } else if (type === 'public_service_degradation') {
    for (const name of ['health', 'education'] as const) { const service = country.services[name]; service.coverageBps = 5_000; service.spending = 0; service.required = Math.max(1, service.required); service.backlog = service.required * 2; }
  } else if (type === 'infrastructure_degradation') {
    const service = country.services.infrastructure; service.coverageBps = 5_000; service.fundedCapacity = 0; service.referenceMonthlyCost = Math.max(1, service.referenceMonthlyCost); service.required = Math.max(1, service.required); service.spending = 0; service.backlog = service.required * 2; account.executed.infrastructure = 0;
  } else if (type === 'transfer_system_stress') {
    account.appropriated.pensions = 1_000; account.appropriated.incomeSupport = 1_000; account.executed.pensions = 0; account.executed.incomeSupport = 0; account.arrears.pensions = 2_000; account.arrears.incomeSupport = 2_000; account.stress.pensionFundingGap = 1_000; account.stress.incomeSupportFundingGap = 1_000;
  } else {
    const economy = next.socioeconomy.regions['region.a'].economy!; economy.employed = Math.floor(economy.labourForce / 2); economy.unemployed = economy.labourForce - economy.employed; economy.basicNeedsCoverageBps = 5_000; economy.essentialConsumption = Math.floor(economy.essentialReferenceByGroup.reduce((a, b) => a + b, 0) / 2); economy.shortage = Math.max(1, economy.demand); economy.consumption = Math.floor(economy.householdDemand / 2); account.stress.disposableIncomeDeclineBps = 2_000;
  }
  return next;
}

describe('generic deterministic crisis engine', () => {
  it.each(['roll-condition', 'chance-formula', 'country', 'type', 'activation-missing', 'exceedance', 'severity-components', 'recovery-counter', 'tripwire-recovery', 'source-system', 'source-status', 'source-detail', 'thresholds', 'evaluation-date'])('rejects range-valid contradictory crisis evidence: %s', corruption => {
    let { state, regions } = build(); state = makeDangerous(state, 'fiscal_stress');
    for (const month of [3, 4, 5, 6]) state = evaluate(state, month, 0);
    const current = episode(state, 'fiscal_stress'), snapshot = current.activationSnapshot!, wire = current.currentTripwires[0];
    const ctx = { countryIds: new Set(['country.a']), regionIds: new Set(regions.map(item => item.id)), regions };
    expect(crisisInvariant.check(state, ctx, 'reload')).toEqual([]);
    if (corruption === 'roll-condition') snapshot.tippingRollBps = snapshot.tippingChanceBps;
    if (corruption === 'chance-formula') snapshot.tippingChanceBps--;
    if (corruption === 'country') snapshot.tripwires[0].countryId = 'country.b';
    if (corruption === 'type') snapshot.tripwires[0].crisisType = 'household_distress';
    if (corruption === 'activation-missing') current.activationSnapshot = undefined;
    if (corruption === 'exceedance') wire.exceedanceBps--;
    if (corruption === 'severity-components') { wire.severityContribution--; wire.deteriorationContribution++; }
    if (corruption === 'recovery-counter') current.recoveryEvaluations = 1;
    if (corruption === 'tripwire-recovery') wire.recoveryMonths = 1;
    if (corruption === 'source-system') { wire.sourceSystem = 'socioeconomy-0.10-v1'; wire.provenance.sourceSystem = wire.sourceSystem; }
    if (corruption === 'source-status') wire.provenance.status = 'derived';
    if (corruption === 'source-detail') wire.provenance.detail = 'Forged observation.';
    if (corruption === 'thresholds') wire.dangerThreshold++;
    if (corruption === 'evaluation-date') current.lastEvaluatedOn = '2026-01-01';
    expect(crisisInvariant.check(state, ctx, 'reload').length).toBeGreaterThan(0);
  });
  it.each(['severity', 'maximumSeverity', 'dangerous', 'recovered', 'persistence', 'snapshot-pressure', 'snapshot-severity', 'snapshot-chance', 'snapshot-roll', 'snapshot-date', 'snapshot-duplicate', 'snapshot-flag', 'state-date'])('rejects corrupted derived crisis evidence: %s', corruption => {
    let { state, regions } = build(); state = makeDangerous(state, 'fiscal_stress');
    for (const month of [3, 4, 5, 6]) state = evaluate(state, month, 0);
    const current = episode(state, 'fiscal_stress'), snapshot = current.activationSnapshot!, tripwire = current.currentTripwires[0];
    const invariantContext = { countryIds: new Set(['country.a']), regionIds: new Set(regions.map(item => item.id)), regions };
    expect(snapshot).toBeDefined(); expect(crisisInvariant.check(state, invariantContext, 'save')).toEqual([]);
    if (corruption === 'severity') current.severity = 'none';
    if (corruption === 'maximumSeverity') current.maximumSeverity = 'none';
    if (corruption === 'dangerous') tripwire.dangerous = !tripwire.dangerous;
    if (corruption === 'recovered') tripwire.recovered = !tripwire.recovered;
    if (corruption === 'persistence') tripwire.persistenceContribution++;
    if (corruption === 'snapshot-pressure') snapshot.pressure++;
    if (corruption === 'snapshot-severity') snapshot.severity = 'none';
    if (corruption === 'snapshot-chance') snapshot.tippingChanceBps = 10_001;
    if (corruption === 'snapshot-roll') snapshot.tippingRollBps = -1;
    if (corruption === 'snapshot-date') snapshot.date = '2026-13-01';
    if (corruption === 'snapshot-duplicate') snapshot.tripwires.push(structuredClone(snapshot.tripwires[0]));
    if (corruption === 'snapshot-flag') snapshot.tripwires[0].dangerous = !snapshot.tripwires[0].dangerous;
    if (corruption === 'state-date') state.crisis.lastMonthlyDate = '2026-02-30';
    expect(crisisInvariant.check(state, invariantContext, 'save').length).toBeGreaterThan(0);
  });
  it('runs monthly after economy, fiscal and administration in the shared scheduler', () => {
    const tasks = createCoreScheduler().describe();
    expect(tasks.find(item => item.id === 'crisis.monthly')).toMatchObject({ cadence: 'monthly', priority: 300 });
    expect(tasks.map(item => item.id).indexOf('crisis.monthly')).toBeGreaterThan(tasks.map(item => item.id).indexOf('socioeconomy.administration'));
  });

  it('reuses the immutable crisis snapshot branch on ordinary days and replaces it monthly', () => {
    const built = build(), clock = new SimulationClock({ ...built.state, date: '2026-02-27' });
    const first = clock.snapshot(), ordinaryDay = clock.advance(1_000), monthlyDay = clock.advance(1_000);
    expect(ordinaryDay.crisis).toBe(first.crisis);
    expect(monthlyDay.crisis).not.toBe(ordinaryDay.crisis);
    expect(Object.isFrozen(monthlyDay.crisis.countries)).toBe(true);
  });

  it('keeps a stable fixture NORMAL and does not treat unavailable tax laws as stress', () => {
    let { state } = build(); state = evaluate(state, 3);
    expect(CRISIS_TYPES.map(type => episode(state, type).state)).toEqual(CRISIS_TYPES.map(() => 'NORMAL'));
    expect(episode(state, 'fiscal_stress').currentPressure).toBe(0);
    expect(state.fiscal.countries['country.a'].policy.personal).toBeNull();
  });

  it('treats positive unpaid commitments over zero revenue as capped dangerous stress', () => {
    let { state } = build(); const account = state.fiscal.countries['country.a'].account!;
    account.totalRevenue = 0; account.stress.unpaidCommitments = 100;
    state = evaluate(state, 3, 9_999);
    const tripwire = episode(state, 'fiscal_stress').currentTripwires.find(item => item.indicator === 'unpaid_commitments_to_revenue')!;
    expect(tripwire).toMatchObject({ currentValue: 30_000, dangerous: true });
    expect(tripwire.provenance.detail).toContain('zero_denominator_cap');
  });

  it('treats zero commitments over zero revenue as no stress', () => {
    let { state } = build(); const country = state.fiscal.countries['country.a'], account = country.account!;
    account.totalRevenue = 0; account.totalSpending = 0; account.interestPaid = 0; account.stress.unpaidCommitments = 0; country.debt = 0;
    state = evaluate(state, 3, 9_999);
    const tripwire = episode(state, 'fiscal_stress').currentTripwires.find(item => item.indicator === 'unpaid_commitments_to_revenue')!;
    expect(tripwire).toMatchObject({ currentValue: 0, dangerous: false, pressureContribution: 0 });
    expect(episode(state, 'fiscal_stress').state).toBe('NORMAL');
  });

  it('omits zero-reference household coverage instead of inventing zero-percent coverage', () => {
    let { state } = build(); const economy = state.socioeconomy.regions['region.a'].economy!;
    economy.householdDemand = 0; economy.consumption = 0; economy.demand = 0; economy.shortage = 0; economy.essentialReferenceByGroup = [0, 0, 0]; economy.essentialConsumption = 0;
    state = evaluate(state, 3, 9_999);
    const current = episode(state, 'household_distress');
    expect(current.currentTripwires.some(item => item.indicator === 'household_consumption_coverage')).toBe(false);
    expect(current.currentTripwires.some(item => item.indicator === 'basic_needs_coverage')).toBe(false);
    expect(current.state).toBe('NORMAL');
  });

  it('omits a genuinely unavailable service observation instead of reading it as zero', () => {
    let { state } = build(); state.fiscal.countries['country.a'].services.health.coverageBps = null;
    state = evaluate(state, 3, 9_999);
    const current = episode(state, 'public_service_degradation');
    expect(current.currentTripwires.some(item => item.indicator === 'health_coverage')).toBe(false);
    expect(current.state).toBe('NORMAL');
  });

  it('moves brief danger through PRESSURE back to NORMAL without ACTIVE', () => {
    const built = build(); const stable = structuredClone(built.state);
    let state = evaluate(makeDangerous(built.state, 'fiscal_stress'), 3, 9_999);
    expect(episode(state, 'fiscal_stress').state).toBe('PRESSURE');
    state = evaluate({ ...stable, crisis: state.crisis }, 4, 9_999);
    expect(episode(state, 'fiscal_stress').state).toBe('PRESSURE');
    state = evaluate({ ...stable, crisis: state.crisis }, 5, 9_999);
    expect(episode(state, 'fiscal_stress').state).toBe('NORMAL');
    expect(state.crisis.countries['country.a'].history[0].activatedOn).toBeUndefined();
  });

  it('accumulates decomposable pressure and cannot tip below eligibility thresholds', () => {
    let { state } = build(); state = makeDangerous(state, 'fiscal_stress');
    state = evaluate(state, 3, 0); const first = episode(state, 'fiscal_stress');
    expect(first.state).toBe('PRESSURE'); expect(first.activationRngKey).toBeUndefined();
    state = evaluate(state, 4, 0); const second = episode(state, 'fiscal_stress');
    expect(second.currentPressure).toBeGreaterThan(first.currentPressure);
    expect(second.currentPressure).toBe(second.currentTripwires.reduce((n, item) => n + item.pressureContribution, 0));
    expect(second.activationRngKey).toBeUndefined();
  });

  it('uses deterministic keyed tipping independent of Country insertion order', () => {
    const run = (order: string[]) => {
      let { state } = build(order, 'same-seed');
      for (const id of order) state = makeDangerous(state, 'fiscal_stress', `country.${id}`);
      for (const month of [3, 4, 5, 6, 7, 8]) state = evaluate(state, month);
      return Object.fromEntries(order.map(id => [id, episode(state, 'fiscal_stress', `country.${id}`).activatedOn]));
    };
    const first = run(['a', 'b']), second = run(['b', 'a']);
    expect(first).toEqual(second);
    expect(run(['a'])).toEqual(run(['a']));
  });

  it('allows seed to change timing only after real danger exists', () => {
    const activation = (seed: string) => {
      let { state } = build(['a'], seed); state = makeDangerous(state, 'fiscal_stress');
      for (const month of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) { state = evaluate(state, month); if (episode(state, 'fiscal_stress').activatedOn) break; }
      return episode(state, 'fiscal_stress').activatedOn;
    };
    const timings = new Set(Array.from({ length: 12 }, (_, index) => activation(`seed-${index}`)));
    expect(timings.size).toBeGreaterThan(1);
  });

  it('increases pressure when material conditions worsen and hysteresis avoids oscillation', () => {
    let { state } = build(); state = makeDangerous(state, 'fiscal_stress'); state = evaluate(state, 3, 9_999);
    const prior = episode(state, 'fiscal_stress').currentPressure;
    state.fiscal.countries['country.a'].account!.stress.debtToAnnualOutputBps = 25_000;
    state = evaluate(state, 4, 9_999); expect(episode(state, 'fiscal_stress').currentPressure).toBeGreaterThan(prior);
    state.fiscal.countries['country.a'].account!.stress = { ...state.fiscal.countries['country.a'].account!.stress, unpaidCommitments: 0, interestBurdenBps: 0, deficitToOutputBps: 0, debtToAnnualOutputBps: 8_000 };
    state = evaluate(state, 5, 9_999); expect(episode(state, 'fiscal_stress').state).toBe('PRESSURE');
  });

  it('recovers and resolves automatically after sustained material improvement', () => {
    const built = build(); const stable = structuredClone(built.state);
    let state = makeDangerous(built.state, 'fiscal_stress');
    for (const month of [3, 4, 5]) state = evaluate(state, month, 0);
    expect(episode(state, 'fiscal_stress').state).toBe('ACTIVE');
    for (const month of [6, 7]) state = evaluate({ ...stable, date: state.date, engine: state.engine, crisis: state.crisis }, month, 0);
    expect(episode(state, 'fiscal_stress').state).toBe('RECOVERING');
    for (const month of [8, 9, 10]) state = evaluate({ ...stable, date: state.date, engine: state.engine, crisis: state.crisis }, month, 0);
    expect(episode(state, 'fiscal_stress').state).toBe('NORMAL');
    expect(state.crisis.countries['country.a'].history[0]).toMatchObject({ activatedOn: '2026-05-01', recoveringOn: '2026-07-01', endedOn: '2026-10-01' });
  });

  it.each(['impossible-date', 'reversed-activation', 'reversed-recovery', 'future-ordinal', 'maximum-severity'])('rejects internally contradictory completed episode history: %s', corruption => {
    const built = build(), stable = structuredClone(built.state);
    let state = makeDangerous(built.state, 'fiscal_stress');
    for (const month of [3, 4, 5]) state = evaluate(state, month, 0);
    for (const month of [6, 7, 8, 9, 10]) state = evaluate({ ...stable, date: state.date, engine: state.engine, crisis: state.crisis }, month, 0);
    const context = { countryIds: new Set(['country.a']), regionIds: new Set(['region.a']), regions: built.regions };
    expect(crisisInvariant.check(state, context, 'save')).toEqual([]);
    const old = state.crisis.countries['country.a'].history[0];
    if (corruption === 'impossible-date') old.endedOn = '2026-02-30';
    if (corruption === 'reversed-activation') old.activatedOn = '2026-01-01';
    if (corruption === 'reversed-recovery') old.recoveringOn = old.pressureStartedOn;
    if (corruption === 'future-ordinal') old.episodeOrdinal = episode(state, 'fiscal_stress').episodeOrdinal;
    if (corruption === 'maximum-severity') old.maximumSeverity = old.maximumSeverity === 'low' ? 'moderate' : 'low';
    expect(crisisInvariant.check(state, context, 'reload').length).toBeGreaterThan(0);
  });

  it.each(CRISIS_TYPES)('detects persistent material drivers for %s', type => {
    let { state } = build(); state = makeDangerous(state, type); state = evaluate(state, 3, 9_999);
    const current = episode(state, type);
    expect(current.state).toBe('PRESSURE'); expect(current.currentTripwires.filter(item => item.dangerous).length).toBeGreaterThanOrEqual(type === 'household_distress' ? 4 : 2);
  });

  it('preserves financing provenance in diagnostics without adding a coverage penalty', () => {
    let { state } = build(); state = makeDangerous(state, 'fiscal_stress'); state = evaluate(state, 3, 9_999);
    const current = inspectCrises(state, 'country.a')!.monitored.find(item => item.type === 'fiscal_stress')!;
    expect(current.currentTripwires.every(item => item.provenance.status === 'modelled')).toBe(true);
    expect(current.currentTripwires.some(item => item.indicator.includes('unavailable'))).toBe(false);
  });

  it('observes causes without directly changing economic, fiscal, service or household outputs', () => {
    let { state } = build(); state = makeDangerous(state, 'household_distress');
    const fiscal = structuredClone(state.fiscal), socioeconomy = structuredClone(state.socioeconomy);
    state = evaluate(state, 3, 0);
    expect(state.fiscal).toEqual(fiscal); expect(state.socioeconomy).toEqual(socioeconomy);
  });

  it('does not cascade from one crisis state into another crisis score', () => {
    let { state } = build(); state = makeDangerous(state, 'fiscal_stress');
    for (const month of [3, 4, 5]) state = evaluate(state, month, 0);
    expect(episode(state, 'fiscal_stress').state).toBe('ACTIVE');
    expect(episode(state, 'household_distress').state).toBe('NORMAL');
    expect(episode(state, 'household_distress').currentPressure).toBe(0);
  });

  it('migrates schema 9 at the saved date without fake history', () => {
    const { state, regions } = build(); const legacy = structuredClone(state) as unknown as Record<string, unknown>; delete legacy.crisis; legacy.schemaVersion = 9; legacy.date = '2031-06-15';
    const ids = new Set(['country.a']), migrated = migrateSimulationState(legacy, regions, {}, {}, { countryIds: ids, regionIds: new Set(['region.a']) });
    expect(migrated.schemaVersion).toBe(13); expect(migrated.crisis.initializedOn).toBe('2031-06-15'); expect(migrated.crisis.lastMonthlyDate).toBeUndefined();
    expect(migrated.crisis.countries['country.a'].history).toEqual([]); expect(episode(migrated, 'fiscal_stress').lastEvaluatedOn).toBeUndefined();
  });

  it('preserves deterministic continuation across save/reload and fidelity transitions', () => {
    let { state, regions } = build(); const account = state.fiscal.countries['country.a'].account!; account.stress.unpaidCommitments = account.totalRevenue * 2; state = evaluate(state, 3);
    const ids = new Set(['country.a']), invariantContext = { regions, countryIds: ids, regionIds: new Set(['region.a']) };
    const restored = restoreSimulationState(serializeSimulationState(state), regions, {}, {}, invariantContext);
    expect(evaluate(restored, 4)).toEqual(evaluate(state, 4));
    const queued = requestFidelityTransition(state, 'country.a', 'Detailed', ids), transitioned = applyPendingFidelityTransitions(queued);
    expect(validateFidelityConservation(queued, transitioned)).toEqual([]); expect(transitioned.crisis).toEqual(queued.crisis);
  });

  it('satisfies episode invariants with finite integer diagnostics', () => {
    let { state, regions } = build(); const account = state.fiscal.countries['country.a'].account!; account.stress.unpaidCommitments = account.totalRevenue * 2; for (const month of [3, 4, 5]) state = evaluate(state, month, 0);
    const ids = new Set(['country.a']); expect(assertSimulationInvariants(state, { regions, countryIds: ids, regionIds: new Set(['region.a']) }, 'tick')).toBe(true);
    expect(JSON.stringify(state.crisis)).not.toMatch(/NaN|Infinity/);
  });
});
