import { describe, it, expect } from 'vitest';
import type { SimulationState } from '../../types';
import { createEngineState } from '../state';
import { emptySocioeconomy, calibrate, cohortsFor, prior, type SocioRegion } from '../socioeconomy/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyTrade } from '../trade/model';
import type { TradeFlow } from '../trade/model';
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
import { countryDomesticOutputUsd, countryTradePosition } from '../economy/tradeIntegration';

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
  regionOwnership: { r1: 'c1', r2: 'c2' },
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

const flow = (exporterId: string, importerId: string, valueUsd: number, landedUsd: number): TradeFlow => ({
  routeId: 'route.test',
  exporterId,
  importerId,
  category: 'food',
  unit: 'tonnes',
  date: '2026-01-01',
  quantity: 1,
  priceMicroUsd: 1_000_000,
  valueUsd,
  logisticsBps: 0,
  logisticsUsd: 0,
  tariffBps: 0,
  customsUsd: 0,
  landedUsd,
  customsCoverage: 'modelled',
});

describe('economy international trade integration (0.25.8)', () => {
  it('sums only sovereign Regions into a Country domestic output', () => {
    const s = base();
    s.socioeconomy.regions = { r1: calibratedRegion(1000, 1_200_000), r2: calibratedRegion(500, 600_000) };
    const c1 = countryDomesticOutputUsd(s, 'c1');
    expect(c1).toBe(s.socioeconomy.regions['r1'].economy!.output);
    expect(countryDomesticOutputUsd(s, 'c2')).toBe(s.socioeconomy.regions['r2'].economy!.output);
  });

  it('reports a zero balance with no trade flows', () => {
    const s = base();
    s.socioeconomy.regions = { r1: calibratedRegion(1000, 1_200_000) };
    const position = countryTradePosition(s, 'c1');
    expect(position.exportValueUsd).toBe(0);
    expect(position.importValueUsd).toBe(0);
    expect(position.balanceUsd).toBe(0);
    expect(position.productionCeilingUsd).toBeUndefined();
  });

  it('derives the balance from canonical flows and keeps exports inside the output envelope', () => {
    const s = base();
    s.socioeconomy.regions = { r1: calibratedRegion(1000, 1_200_000) };
    s.trade.flows = [flow('c1', 'c2', 30_000, 30_000), flow('c2', 'c1', 10_000, 10_500)];
    const position = countryTradePosition(s, 'c1');
    expect(position.exportValueUsd).toBe(30_000);
    expect(position.importValueUsd).toBe(10_500);
    expect(position.balanceUsd).toBe(19_500);
    expect(position.exportValueUsd).toBeLessThanOrEqual(position.domesticOutputUsd);
  });

  it('does not add exports on top of output (exports are a destination, never a second GDP)', () => {
    const s = base();
    const region = calibratedRegion(1000, 1_200_000);
    s.socioeconomy.regions = { r1: region };
    s.trade.flows = [flow('c1', 'c2', region.economy!.output, region.economy!.output)];
    const position = countryTradePosition(s, 'c1');
    // exports are attributed from the existing output, not added to it
    expect(position.domesticOutputUsd).toBe(region.economy!.output);
    expect(position.exportValueUsd).toBeLessThanOrEqual(position.domesticOutputUsd);
  });
});
