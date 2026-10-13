import { describe, it, expect } from 'vitest';
import type { SimulationState } from '../../types';
import { createEngineState } from '../state';
import { emptySocioeconomy, calibrate, cohortsFor, prior, type SocioRegion } from '../socioeconomy/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyTrade } from '../trade/model';
import { emptyAssets } from '../assets/model';
import type { AssetRecord } from '../assets/model';
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
import {
  decomposeRegionalProduction, regionalCapitalFactor, totalAttributedOutput,
  ASSET_TYPE_CAPACITY_REGISTRY,
} from '../economy/production';

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

const operationalAsset = (assetId: string, regionId: string, amount: number): AssetRecord => ({
  assetId,
  assetTypeId: 'synthetic.plant',
  regionId,
  operatingStatus: 'operational',
  capacity: { amount, unit: 'unit', coverage: 'modelled', limitation: 'synthetic test asset' },
  availability: 'available',
  physicalCondition: 'good',
  coverage: { status: 'modelled' },
});

const stateWithEconomy = (region: SocioRegion): SimulationState => {
  const s = base();
  return { ...s, socioeconomy: { ...s.socioeconomy, regions: { r1: region } } };
};

describe('economy production factors (0.25.2A)', () => {
  it('yields no activities for a Region without a calibrated economy', () => {
    expect(decomposeRegionalProduction(base(), 'r1')).toEqual([]);
  });

  it('conserves the aggregate: baseline carries exactly economy.output and productionCapacity', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region);
    const activities = decomposeRegionalProduction(state, 'r1');
    expect(activities).toHaveLength(1);
    expect(activities[0].coverage).toBe('modelled');
    expect(activities[0].outputUsd).toBe(region.economy!.output);
    expect(activities[0].capacityUsd).toBe(region.economy!.productionCapacity);
    expect(totalAttributedOutput(activities)).toBe(region.economy!.output);
    expect(activities[0].factors.capital.coverage).toBe('not_applicable');
  });

  it('lists an asset-backed activity per sited asset without adding output (no fabricated productivity)', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region);
    state.assets.assets = { 'asset.00000001': operationalAsset('asset.00000001', 'r1', 5) };
    const activities = decomposeRegionalProduction(state, 'r1');
    expect(activities).toHaveLength(2);
    const assetActivity = activities.find(a => a.coverage === 'asset_backed')!;
    expect(assetActivity.factors.capital.amount).toBe(5);
    expect(assetActivity.capacityUsd).toBe(0);
    expect(assetActivity.outputUsd).toBe(0);
    expect(totalAttributedOutput(activities)).toBe(region.economy!.output);
  });

  it('never turns an unavailable asset capacity into a zero-but-binding factor', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region);
    state.assets.assets = { 'asset.00000001': { ...operationalAsset('asset.00000001', 'r1', 5), operatingStatus: 'out_of_service', availability: 'unavailable' } };
    const capital = regionalCapitalFactor(state, 'r1');
    expect(capital.amount).toBeUndefined();
    expect(capital.assetIds).toEqual(['asset.00000001']);
    const activity = decomposeRegionalProduction(state, 'r1').find(a => a.coverage === 'asset_backed')!;
    expect(activity.factors.capital.amount).toBeUndefined();
    expect(totalAttributedOutput(decomposeRegionalProduction(state, 'r1'))).toBe(region.economy!.output);
  });

  it('does not sum mixed physical capacity units', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region);
    const a = operationalAsset('asset.00000001', 'r1', 5);
    const b = { ...operationalAsset('asset.00000002', 'r1', 3), capacity: { amount: 3, unit: 'tonnes', coverage: 'modelled' as const } };
    state.assets.assets = { 'asset.00000001': a, 'asset.00000002': b };
    expect(regionalCapitalFactor(state, 'r1').unit).toBe('mixed');
    expect(regionalCapitalFactor(state, 'r1').amount).toBeUndefined();
  });

  it('keeps the asset-type capacity registry empty (no invented industrial capacity)', () => {
    expect(ASSET_TYPE_CAPACITY_REGISTRY).toEqual({});
  });
});
