import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { ASSETS_VERSION, assetId, type AssetRecord } from '../assets/model';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { worldBase, worldContext, worldRegions } from './worldScenario';

const firstRegion = [...worldContext.regionIds][0];
const validAsset = (): AssetRecord => ({
  assetId: assetId(0),
  assetTypeId: 'type.generic',
  regionId: firstRegion,
  operatingStatus: 'operational',
  capacity: { amount: 100, unit: 'MW', coverage: 'modelled', limitation: 'Modelled gameplay capacity; not an observed real-world datum.' },
  availability: 'available',
  physicalCondition: 'good',
  coverage: { status: 'modelled' },
});
const withAsset = (asset: AssetRecord): SimulationState => {
  const base = worldBase();
  return { ...base, assets: { ...base.assets, assets: { [asset.assetId]: asset }, assetOrder: [asset.assetId], nextAssetSequence: 1 } };
};

describe('0.24 canonical physical assets', () => {
  it('initializes an empty canonical assets domain', () => {
    const state = worldBase();
    expect(state.assets.version).toBe(ASSETS_VERSION);
    expect(state.assets.assets).toEqual({});
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
  });

  it('accepts a valid asset with a permanent Region reference', () => {
    expect(assertSimulationInvariants(withAsset(validAsset()), worldContext, 'save')).toBe(true);
  });

  it('rejects an asset whose Region reference is not a canonical Region', () => {
    const forged = withAsset({ ...validAsset(), regionId: 'region.ghost' });
    expect(() => assertSimulationInvariants(forged, worldContext, 'save')).toThrow(/unknown Region/);
  });

  it('never records a numeric capacity when coverage is unavailable', () => {
    const forged = withAsset({ ...validAsset(), capacity: { amount: 50, unit: 'MW', coverage: 'unavailable', limitation: 'No sourced capacity.' } });
    expect(() => assertSimulationInvariants(forged, worldContext, 'save')).toThrow(/numeric capacity/);
  });

  it('survives a save/reload round-trip without a second asset store', () => {
    const state = withAsset(validAsset());
    const restored = restoreSimulationState(serializeSimulationState(state, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.assets.assets[assetId(0)].assetId).toBe(assetId(0));
    expect(restored.assets.assets).toEqual(state.assets.assets);
  });
});
