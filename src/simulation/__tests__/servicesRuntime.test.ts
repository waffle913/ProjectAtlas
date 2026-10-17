import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyAssets } from '../assets/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptyFiscal, type Service } from '../fiscal/model';
import { evolveService, initializeFiscal } from '../fiscal/runtime';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { createEngineState } from '../state';
import { SERVICE_SUPPLY_REQUIREMENTS, meetServiceSupplies, serviceSupplyFactorBps, type SupplyRequirement } from '../services/supplies';
import type { TradeMarket } from '../trade/model';

const build = (): SimulationState => {
  const regions: RegionEntity[] = [{ id: 'region.a', parentCountryId: 'country.a', initialOwnerCountryId: 'country.a', commonName: 'a', administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: ['a'] } }];
  let state: SimulationState = {
    schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
    territoryOwnership: {}, regionOwnership: { 'region.a': 'country.a' },
    populationByRegion: { 'region.a': 100_000 }, economicOutputByRegion: { 'region.a': 1_200_000_000 },
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(['country.a'], 'services-seed'),
  };
  return initializeFiscal(initializeSocioeconomy(state, regions));
};
const service: Service = { status: 'modelled', referencePopulation: 10000, referenceMonthlyCost: 1000, required: 1000, spending: 0, fundedCapacity: 10000, capacity: 10000, coverageBps: 10000, backlog: 0 };
const healthRegistry = { health: [{ id: 'health.medicines', itemId: 'chemicals_pharmaceuticals', requiredPerMonth: 100, essential: true }] } as Readonly<Partial<Record<'health', readonly SupplyRequirement[]>>>;
const withStock = (state: SimulationState, quantity: number): SimulationState => ({
  ...state, trade: { ...state.trade, countries: { ...state.trade.countries, 'country.a': {
    coverage: 'partial' as const, limitation: 'test',
    markets: { chemicals_pharmaceuticals: { stock: { opening: quantity, produced: 0, received: 0, consumed: 0, exported: 0, quantity, capacity: 1000, target: quantity } } as unknown as TradeMarket },
  } } },
});

describe('services 0.29 runtime integration (supplies -> TradeStock -> delivery)', () => {
  it('leaves delivery unbound without an admitted supply requirement', () => {
    const state = build();
    expect(SERVICE_SUPPLY_REQUIREMENTS).toEqual({});
    expect(meetServiceSupplies(state, 'country.a', 'health')).toBeUndefined();
    expect(serviceSupplyFactorBps(state, 'country.a', 'health')).toBeUndefined();
    expect(evolveService(service, 10000, 1000).fundedCapacity).toBe(10000);
  });

  it('binds service delivery to the canonical TradeStock and records the rupture', () => {
    const state = withStock(build(), 60);
    expect(serviceSupplyFactorBps(state, 'country.a', 'health', healthRegistry)).toBe(6000);
    expect(meetServiceSupplies(state, 'country.a', 'health', healthRegistry)![0]).toEqual({ itemId: 'chemicals_pharmaceuticals', delivered: 60, rupture: 40 });
  });

  it('treats an absent store as unavailable, never a zero-binding rupture', () => {
    const state = build(); // no trade market configured
    expect(serviceSupplyFactorBps(state, 'country.a', 'health', healthRegistry)).toBeUndefined();
  });

  it('reduces delivered capacity under a supply rupture (causal state transition)', () => {
    const full = evolveService(service, 10000, 1000);
    const ruptured = evolveService(service, 10000, 1000, 5000);
    expect(ruptured.capacity).toBeLessThan(full.capacity);   // supply bounds delivered care
    expect(ruptured.coverageBps!).toBeLessThan(full.coverageBps!);
    expect(evolveService(service, 10000, 1000, 0).capacity).toBeLessThan(ruptured.capacity); // total rupture
  });
});
