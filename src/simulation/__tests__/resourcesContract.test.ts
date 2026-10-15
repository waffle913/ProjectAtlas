import { describe, it, expect } from 'vitest';
import type { SimulationState } from '../../types';
import { createEngineState } from '../state';
import { emptySocioeconomy } from '../socioeconomy/model';
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
import {
  RESOURCES_VERSION, MATTER_ENERGY_FAMILIES, RESOURCE_SCOPES, PHYSICAL_UNIT_FAMILIES,
  PHYSICAL_UNITS, RESOURCES, FUELS, REFINED_PRODUCTS, ENERGY_CARRIERS,
  SCOPE_OWNERS, REQUIRED_SCOPES, RESOURCE_DECISIONS, isSpatialGridInScope, isAgricultureClimateInScope,
} from '../resources/contract';

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

describe('resources/energy taxonomy and contract (0.27.1)', () => {
  it('declares the matter/energy families and the four distinct scopes', () => {
    expect(RESOURCES_VERSION).toBe('resources-0.27-v1');
    expect(MATTER_ENERGY_FAMILIES).toEqual(['resource', 'fuel', 'refined_product', 'energy_carrier']);
    expect(RESOURCE_SCOPES).toEqual(['reserve', 'deposit', 'production', 'stock']);
    expect(PHYSICAL_UNIT_FAMILIES).toEqual(['mass', 'volume', 'energy']);
  });

  it('admits no real resource/fuel/refined-product/energy inventory in 0.27.1 (no fabricated geology)', () => {
    expect(RESOURCES).toEqual({});
    expect(FUELS).toEqual({});
    expect(REFINED_PRODUCTS).toEqual({});
    expect(ENERGY_CARRIERS).toEqual({});
  });

  it('admits physical units with distinct mass/volume/energy families', () => {
    expect(Object.keys(PHYSICAL_UNITS).sort()).toEqual(['barrel', 'cubic_metre', 'megawatt_hour', 'tonne']);
    expect(PHYSICAL_UNITS.tonne.family).toBe('mass');
    expect(PHYSICAL_UNITS.cubic_metre.family).toBe('volume');
    expect(PHYSICAL_UNITS.barrel.family).toBe('volume');
    expect(PHYSICAL_UNITS.megawatt_hour.family).toBe('energy');
  });

  it('maps each scope to its canonical owner exactly once (reserve/deposit stay unavailable)', () => {
    const scopes = SCOPE_OWNERS.map(e => e.scope);
    expect(new Set(scopes).size).toBe(scopes.length);
    expect(scopes.slice().sort()).toEqual([...REQUIRED_SCOPES].sort());
    const byScope = Object.fromEntries(SCOPE_OWNERS.map(e => [e.scope, e]));
    expect(byScope.production.ownerSubsystem).toBe('socioeconomy');
    expect(byScope.stock.ownerSubsystem).toBe('trade');
    expect(byScope.reserve.ownerSubsystem).toBe('none');
    expect(byScope.deposit.ownerSubsystem).toBe('none');
  });

  it('reads the production and stock owners without throwing on an empty state', () => {
    const state = emptyState();
    for (const entry of SCOPE_OWNERS) {
      expect(() => entry.read(state, 'country-a')).not.toThrow();
    }
  });

  it('keeps reserve and deposit unavailable (read returns undefined, never a zero)', () => {
    const state = emptyState();
    const byScope = Object.fromEntries(SCOPE_OWNERS.map(e => [e.scope, e]));
    expect(byScope.reserve.read(state, 'country-a')).toBeUndefined();
    expect(byScope.deposit.read(state, 'country-a')).toBeUndefined();
  });

  it('keeps the open design gates undecided (spatial grid, agriculture/climate/environment)', () => {
    expect(RESOURCE_DECISIONS.map(d => d.id).sort()).toEqual(['agriculture_climate_environment', 'intra_region_spatial_grid']);
    for (const gate of RESOURCE_DECISIONS) {
      expect(gate.status).toBe('undecided');
      expect(gate.question.length).toBeGreaterThan(0);
      expect(gate.dependsOnSubMilestones.length).toBeGreaterThan(0);
    }
    expect(isSpatialGridInScope()).toBe(false);
    expect(isAgricultureClimateInScope()).toBe(false);
  });
});
