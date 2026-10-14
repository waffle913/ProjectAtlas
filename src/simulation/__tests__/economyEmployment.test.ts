import { describe, it, expect } from 'vitest';
import type { SimulationState } from '../../types';
import { createEngineState } from '../state';
import { emptySocioeconomy, calibrate, cohortsFor, prior, type SocioRegion } from '../socioeconomy/model';
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
import { decomposeLabour } from '../economy/employment';

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

describe('economy employment, wages and income (0.25.4)', () => {
  it('returns no accounts and no conservation for a Region without an economy', () => {
    const result = decomposeLabour(base(), 'r1', 0, 0);
    expect(result.accounts).toEqual([]);
    expect(result.conservation.conserved).toBe(false);
  });

  it('attributes employment and the wage bill exactly across activities', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region);
    const { accounts, conservation } = decomposeLabour(state, 'r1', 0, 0);
    const economy = region.economy!;
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts.reduce((sum, a) => sum + a.employedPersons, 0)).toBe(economy.employed);
    expect(accounts.reduce((sum, a) => sum + a.wageBillUsd, 0)).toBe(economy.householdIncome);
    const wageRate = economy.householdIncome / economy.employed;
    for (const account of accounts) expect(account.wageUsdPerWorkerPerMonth).toBe(Math.round(wageRate));
    expect(conservation.conserved).toBe(true);
  });

  it('conserves the single labour universe with reservations (never double-employing)', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const economy = region.economy!;
    const reserved = Math.min(10, economy.labourForce - economy.employed);
    // The engine books reservations into `unemployed`; reflect that in the fixture.
    const adjusted = { ...economy, unemployed: economy.labourForce - economy.employed - reserved };
    const state = stateWithEconomy({ ...region, economy: adjusted });
    const { conservation } = decomposeLabour(state, 'r1', reserved, 0);
    expect(conservation.reserved).toBe(reserved);
    expect(conservation.employed).toBeLessThanOrEqual(conservation.labourForce - reserved);
    expect(conservation.employed + conservation.unemployed + conservation.reserved).toBe(conservation.labourForce);
    expect(conservation.conserved).toBe(true);
  });

  it('handles a zero-output economy by attributing all employed to the baseline activity', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const economy = { ...region.economy!, output: 0, productionCapacity: 0, householdIncome: 0 };
    const state = stateWithEconomy({ ...region, economy });
    const { accounts } = decomposeLabour(state, 'r1', 0, 0);
    const totalEmployed = accounts.reduce((sum, a) => sum + a.employedPersons, 0);
    expect(totalEmployed).toBe(economy.employed);
  });
});
