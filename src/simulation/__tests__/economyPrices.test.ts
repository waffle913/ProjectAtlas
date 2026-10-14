import { describe, it, expect } from 'vitest';
import type { SimulationState } from '../../types';
import { createEngineState } from '../state';
import { emptySocioeconomy, calibrate, cohortsFor, prior, evolve, type SocioRegion } from '../socioeconomy/model';
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
import { domesticMarketPrice, adjustDomesticPrice, PRICE_MODEL } from '../economy/prices';

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

describe('economy domestic prices and markets (0.25.7)', () => {
  it('returns undefined for a Region without an economy', () => {
    expect(domesticMarketPrice(base(), 'r1')).toBeUndefined();
  });

  it('moves the price up on shortage and down on surplus, bounded by the monthly step', () => {
    expect(adjustDomesticPrice(10000, 'up')).toBe(10500);
    expect(adjustDomesticPrice(10000, 'down')).toBe(9500);
    expect(adjustDomesticPrice(10000, 'none')).toBe(10000);
    // bounded step, no oscillation: consecutive moves are each +500, never a jump
    expect(adjustDomesticPrice(adjustDomesticPrice(10000, 'up'), 'up')).toBe(11000);
  });

  it('clamps the price to the floor and ceiling (no absurd oscillation)', () => {
    expect(adjustDomesticPrice(PRICE_MODEL.floorBps, 'down')).toBe(PRICE_MODEL.floorBps);
    expect(adjustDomesticPrice(PRICE_MODEL.ceilingBps, 'up')).toBe(PRICE_MODEL.ceilingBps);
    expect(adjustDomesticPrice(PRICE_MODEL.floorBps + 1, 'down')).toBe(PRICE_MODEL.floorBps);
  });

  it('derives a modelled price with supply/demand/shortage and distinct status', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const price = domesticMarketPrice(stateWithEconomy(region), 'r1')!;
    expect(price.status).toBe('modelled');
    expect(price.supplyUsd).toBe(region.economy!.output);
    expect(price.demandUsd).toBe(region.economy!.demand);
    expect(price.pressure).toBe(price.surplusUsd > 0 ? 'down' : price.shortageUsd > 0 ? 'up' : 'none');
    expect(price.priceBps).toBe(adjustDomesticPrice(10000, price.pressure));
  });

  it('reports upward pressure and a rising price when capacity-constrained', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const constrained = evolve(region, undefined, 0, 1).economy!;
    const price = domesticMarketPrice(stateWithEconomy({ ...region, economy: constrained }), 'r1')!;
    expect(constrained.shortage).toBeGreaterThan(0);
    expect(price.shortageUsd).toBeGreaterThan(0);
    expect(price.pressure).toBe('up');
    expect(price.priceBps).toBe(10500);
  });
});
