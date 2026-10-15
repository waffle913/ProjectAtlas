import { describe, it, expect } from 'vitest';
import type { SimulationState } from '../../types';
import { createEngineState } from '../state';
import { emptySocioeconomy } from '../socioeconomy/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyTrade } from '../trade/model';
import { TRADE_CATEGORIES, CATEGORY_REGISTRY } from '../trade/model';
import { CATEGORIES as FISCAL_CATEGORIES } from '../fiscal/model';
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
import {
  MONETARY_UNIT, PHYSICAL_UNITS, GOODS, PUBLIC_SERVICES, SECTORS, ACTIVITIES,
  PRICE_STATUSES, unavailablePrice, derivedPrice, type PhysicalUnitRecord,
} from '../economy/model';
import {
  CANONICAL_OWNERS, REQUIRED_INVENTORY, ECONOMY_DOMAINS, ECONOMY_MEASURES,
  OWNER_SCOPES, OWNER_SUBSYSTEMS,
} from '../economy/ownership';

const emptyState = (): SimulationState => ({
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
  regionOwnership: {},
  populationByRegion: {},
  economicOutputByRegion: {},
  bilateralRelations: {},
  claims: [],
  explicitCasusBelli: [],
  wars: [],
  occupationByRegion: {},
  engine: createEngineState(),
});

describe('economy units of account (0.25.1)', () => {
  it('defines exactly one monetary unit: integer nominal USD with microUSD prices and basis-point rates', () => {
    expect(MONETARY_UNIT.id).toBe('USD_NOMINAL');
    expect(MONETARY_UNIT.microUsdPerUsd).toBe(1_000_000);
    expect(MONETARY_UNIT.bpsPerWhole).toBe(10_000);
    expect(MONETARY_UNIT.priceSubUnit).toBe('microUSD');
    expect(MONETARY_UNIT.rateUnit).toBe('basis_points');
  });

  it('defines the three physical-unit families with distinct kinds', () => {
    const units = Object.values(PHYSICAL_UNITS) as PhysicalUnitRecord[];
    expect(units.map(u => u.id).sort()).toEqual(['AGGREGATE_QUANTITY', 'ASSET_CAPACITY', 'PERSONS']);
    expect(units.map(u => u.kind).sort()).toEqual(['aggregate_quantity', 'capacity', 'count']);
  });

  it('reuses the immutable trade category taxonomy as the goods vocabulary (no second list)', () => {
    expect(Object.keys(GOODS).sort()).toEqual([...TRADE_CATEGORIES].sort());
    for (const category of TRADE_CATEGORIES) {
      expect(GOODS[category].taxonomy).toBe('trade-0.17-v1');
      expect(GOODS[category].essential).toBe(CATEGORY_REGISTRY[category].essential);
    }
  });

  it('reuses the fiscal spending categories as the public-service vocabulary', () => {
    expect(Object.keys(PUBLIC_SERVICES).sort()).toEqual([...FISCAL_CATEGORIES].sort());
    for (const category of FISCAL_CATEGORIES) {
      expect(PUBLIC_SERVICES[category].family).toBe('public_service');
      expect(PUBLIC_SERVICES[category].taxonomy).toBe('fiscal-0.11-v2');
    }
  });

  it('admits no real sector/activity taxonomy in 0.25.1 (no fabricated capacity)', () => {
    expect(SECTORS).toEqual({});
    expect(ACTIVITIES).toEqual({});
  });

  it('distinguishes observed/derived/modelled/unavailable prices; unavailable is never a zero', () => {
    expect(PRICE_STATUSES).toEqual(['observed', 'derived', 'modelled', 'unavailable']);
    const unav = unavailablePrice('tonnes');
    expect(unav.status).toBe('unavailable');
    expect('valueMicroUsd' in unav).toBe(false);
    const sourced = derivedPrice('tonnes', 1_500_000, {
      publisher: 'p', dataset: 'd', url: 'https://example.invalid', referenceDate: '2024-01-01',
      retrievedAt: '2026-10-01', licence: 'l', attribution: 'a', limitation: 'lim',
    });
    expect(sourced.status).toBe('derived');
    expect(sourced.valueMicroUsd).toBe(1_500_000);
    expect(sourced.provenance?.licence).toBe('l');
  });
});

describe('economy canonical ownership inventory (0.25.1)', () => {
  it('covers every required variable exactly once', () => {
    const variables = CANONICAL_OWNERS.map(e => e.variable);
    expect(new Set(variables).size).toBe(variables.length);
    expect(variables.sort()).toEqual([...REQUIRED_INVENTORY].sort());
  });

  it('assigns a unique canonical owner path to each variable (no duplicated ownership)', () => {
    const paths = CANONICAL_OWNERS.map(e => e.ownerPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('uses only the known domain/measure/scope/subsystem vocabularies', () => {
    for (const entry of CANONICAL_OWNERS) {
      expect(ECONOMY_DOMAINS).toContain(entry.domain);
      expect(ECONOMY_MEASURES).toContain(entry.measure);
      expect(OWNER_SCOPES).toContain(entry.scope);
      expect(OWNER_SUBSYSTEMS).toContain(entry.ownerSubsystem);
      expect(entry.ownerPath.startsWith('state.')).toBe(true);
      expect(entry.rationale.length).toBeGreaterThan(0);
    }
  });

  it('reads its canonical field without throwing on an empty, uninitialized state', () => {
    const state = emptyState();
    for (const entry of CANONICAL_OWNERS) {
      expect(() => entry.read(state, 'region-a', 'country-a')).not.toThrow();
    }
  });

  it('reads exactly the documented field on a populated state', () => {
    const state = emptyState();
    const ownership = { 'region-a': 'country-a' };
    state.regionOwnership = ownership;
    const flows = state.trade.flows;
    const assets = state.assets.assets;
    const ownershipEntry = CANONICAL_OWNERS.find(e => e.variable === 'ownership')!;
    const flowEntry = CANONICAL_OWNERS.find(e => e.variable === 'trade_flow')!;
    const assetEntry = CANONICAL_OWNERS.find(e => e.variable === 'asset')!;
    expect(ownershipEntry.read(state, '', '')).toBe(ownership);
    expect(flowEntry.read(state, '', '')).toBe(flows);
    expect(assetEntry.read(state, '', '')).toBe(assets);
  });
});
