import { describe, it, expect } from 'vitest';
import type { SimulationState } from '../../types';
import { createEngineState } from '../state';
import { emptySocioeconomy, calibrate, cohortsFor, prior, type SocioRegion } from '../socioeconomy/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyTrade } from '../trade/model';
import { emptyAssets } from '../assets/model';
import { CONSTRUCTION_DAILY_COST_PER_WORKER_USD, CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY } from '../assets/model';
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
import { aggregateFirmAccount, investmentPlan } from '../economy/firms';

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

describe('economy aggregate firms and investment (0.25.6)', () => {
  it('returns undefined for a Region without an economy', () => {
    expect(aggregateFirmAccount(base(), 'r1')).toBeUndefined();
    expect(investmentPlan(base(), 'r1')).toBeUndefined();
  });

  it('derives the aggregate firm account from output and fiscal firm ledgers', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region);
    state.fiscal.regions['r1'] = { labourCost: 40000, businessSurplus: 30000, retainedBusinessSurplus: 20000 } as never;
    const account = aggregateFirmAccount(state, 'r1')!;
    expect(account.firmRepresentation).toBe('aggregate');
    expect(account.revenueUsd).toBe(region.economy!.output);
    expect(account.labourCostUsd).toBe(40000);
    expect(account.businessSurplusUsd).toBe(30000);
    expect(account.retainedSurplusUsd).toBe(20000);
  });

  it('falls back to output-minus-household-income surplus before fiscal initialization', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const account = aggregateFirmAccount(stateWithEconomy(region), 'r1')!;
    expect(account.businessSurplusUsd).toBe(Math.max(0, region.economy!.output - region.economy!.householdIncome));
    expect(account.retainedSurplusUsd).toBe(account.businessSurplusUsd);
  });

  it('bounds investment by retained surplus and requires real resources (never free)', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region);
    state.fiscal.regions['r1'] = { labourCost: 1000, businessSurplus: 5000, retainedBusinessSurplus: 5000 } as never;
    const plan = investmentPlan(state, 'r1')!;
    expect(plan.affordableInvestmentUsd).toBe(5000);
    expect(plan.workerDaysRequired).toBe(Math.max(1, Math.ceil(5000 / CONSTRUCTION_DAILY_COST_PER_WORKER_USD)));
    expect(plan.constructionMaterialUnitsRequired).toBe(plan.workerDaysRequired * CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY);
    expect(plan.materialCategory).toBe('raw_materials');
  });

  it('plans zero investment when there is no retained surplus', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region);
    state.fiscal.regions['r1'] = { labourCost: 0, businessSurplus: 0, retainedBusinessSurplus: 0 } as never;
    const plan = investmentPlan(state, 'r1')!;
    expect(plan.affordableInvestmentUsd).toBe(0);
    expect(plan.workerDaysRequired).toBe(0);
    expect(plan.constructionMaterialUnitsRequired).toBe(0);
  });
});
