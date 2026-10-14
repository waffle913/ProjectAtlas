import { describe, it, expect } from 'vitest';
import type { SimulationState } from '../../types';
import { createEngineState } from '../state';
import { emptySocioeconomy, calibrate, cohortsFor, prior, evolve, MODEL, ratio, type SocioRegion } from '../socioeconomy/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyTrade } from '../trade/model';
import { emptyAssets } from '../assets/model';
import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyMilitary } from '../military/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptyPolitics } from '../politics/model';
import { emptyCrisis } from '../crisis/model';
import { householdSpending } from '../economy/households';

const base = (): SimulationState => ({
  schemaVersion: 20,
  operations: emptyOperations(),
  international: emptyInternational(),
  multilateral: emptyMultilateral(),
  constitution: emptyConstitution(),
  elections: emptyElections(),
  assets: emptyAssets(),
  trade: emptyTrade(),
  military: emptyMilitary(),
  governance: emptyGovernance(),
  information: emptyInformation(),
  politics: emptyPolitics(),
  crisis: emptyCrisis(),
  fiscal: emptyFiscal(),
  socioeconomy: emptySocioeconomy(),
  date: '2026-01-01',
  paused: false,
  speed: 1,
  territoryOwnership: {},
  regionOwnership: { r1: 'c1' },
  populationByRegion: {},
  economicOutputByRegion: {},
  bilateralRelations: {},
  claims: [],
  explicitCasusBelli: [],
  wars: [],
  occupationByRegion: {},
  engine: createEngineState(),
});

const calibratedRegion = (population: number, annualOutput: number): SocioRegion => {
  const cohorts = cohortsFor(population);
  return {
    population,
    annualOutputReference: annualOutput,
    cohorts,
    populationProvenance: prior('2026-01-01', 'test'),
    outputProvenance: prior('2026-01-01', 'test'),
    incomeDistributionProvenance: prior('2026-01-01', 'test'),
    orientationProvenance: prior('2026-01-01', 'test'),
    employmentProvenance: prior('2026-01-01', 'test'),
    economy: calibrate(population, annualOutput, cohorts),
  };
};

const stateWithEconomy = (region: SocioRegion): SimulationState => {
  const s = base();
  return { ...s, socioeconomy: { ...s.socioeconomy, regions: { r1: region } } };
};

describe('economy household needs and spending (0.25.5)', () => {
  it('returns undefined for a Region without an economy', () => {
    expect(householdSpending(base(), 'r1')).toBeUndefined();
  });

  it('derives demand from income via propensities and splits essential/discretionary', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region);
    const account = householdSpending(state, 'r1')!;
    const income = region.economy!.incomeByGroup;
    const expectedDemand = income.map((v, i) => ratio(v, MODEL.consumptionBps[i], 10000));
    expect(account.disposableByGroup).toEqual(income);
    expect(account.demandByGroup).toEqual(expectedDemand);
    expect(account.essentialDemandByGroup).toEqual(expectedDemand.map((v, i) => ratio(v, MODEL.essentialBps[i], 10000)));
    expect(account.demandTotal).toBe(expectedDemand.reduce((a, b) => a + b, 0));
    expect(account.discretionaryDemandTotal).toBe(account.demandTotal - account.essentialDemandTotal);
    // initial calibrated economy fully covers needs
    expect(account.needsCoverageBps).toBe(10000);
    expect(account.essentialShortfallUsd).toBe(0);
  });

  it('uses fiscal disposable income as the demand driver when present', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region);
    state.fiscal.regions['r1'] = { disposable: [1000, 2000, 3000] } as never;
    const account = householdSpending(state, 'r1')!;
    expect(account.disposableByGroup).toEqual([1000, 2000, 3000]);
    expect(account.demandByGroup).toEqual([ratio(1000, MODEL.consumptionBps[0], 10000), ratio(2000, MODEL.consumptionBps[1], 10000), ratio(3000, MODEL.consumptionBps[2], 10000)]);
  });

  it('reports a material essential shortfall when production is capacity-constrained', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const constrained = evolve(region, undefined, 0, 1).economy!;
    const state = stateWithEconomy({ ...region, economy: constrained });
    const account = householdSpending(state, 'r1')!;
    expect(constrained.shortage).toBeGreaterThan(0);
    expect(account.shortageUsd).toBeGreaterThan(0);
    expect(account.essentialShortfallUsd).toBeGreaterThan(0);
    expect(account.needsCoverageBps).toBeLessThan(10000);
  });
});
