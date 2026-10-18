import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import {
  countryColour,
  LAYER_LEGEND,
  MAP_LAYERS,
  MIXED_COLOUR,
  OCCUPIED_COLOUR,
  regionLayerColour,
  territoryLayerColour,
  UNAVAILABLE_COLOUR,
  UNOCCUPIED_COLOUR,
} from '../mapLayers';

type Patch = Partial<Pick<SimulationState, 'regionOwnership' | 'populationByRegion' | 'economicOutputByRegion' | 'occupationByRegion'>>;
function sim(patch: Patch): SimulationState {
  return {
    regionOwnership: {},
    populationByRegion: {},
    economicOutputByRegion: {},
    occupationByRegion: {},
    ...patch,
  } as unknown as SimulationState;
}

describe('map layers', () => {
  it('exposes the implemented layers and does not fabricate unavailable layers', () => {
    expect(MAP_LAYERS.map(layer => layer.id)).toEqual(['ownership', 'population', 'economicOutput', 'occupation']);
  });

  it('binds the ownership layer to canonical sovereign ownership', () => {
    const state = sim({ regionOwnership: { r1: 'c1', r2: 'c2' } });
    expect(regionLayerColour('ownership', 'r1', state)).toBe(countryColour('c1'));
    expect(regionLayerColour('ownership', 'r2', state)).toBe(countryColour('c2'));
  });

  it('renders an unowned Region as unavailable rather than inventing an owner', () => {
    expect(regionLayerColour('ownership', 'r1', sim({ regionOwnership: {} }))).toBe(UNAVAILABLE_COLOUR);
  });

  it('binds the population layer to populationByRegion and marks missing data unavailable', () => {
    const state = sim({ populationByRegion: { big: 12_000_000, small: 120_000 } });
    expect(regionLayerColour('population', 'big', state)).not.toBe(regionLayerColour('population', 'small', state));
    expect(regionLayerColour('population', 'missing', state)).toBe(UNAVAILABLE_COLOUR);
  });

  it('binds the economy layer to economicOutputByRegion and marks missing data unavailable', () => {
    const state = sim({ economicOutputByRegion: { rich: 5_000_000_000, poor: 50_000_000 } });
    expect(regionLayerColour('economicOutput', 'rich', state)).not.toBe(regionLayerColour('economicOutput', 'poor', state));
    expect(regionLayerColour('economicOutput', 'missing', state)).toBe(UNAVAILABLE_COLOUR);
  });

  it('distinguishes occupied from unoccupied Regions on the occupation layer', () => {
    const state = sim({ occupationByRegion: { r1: { regionId: 'r1', warId: 'w1', occupierCountryId: 'c9', startDate: '2026-03-01' } } });
    expect(regionLayerColour('occupation', 'r1', state)).toBe(OCCUPIED_COLOUR);
    expect(regionLayerColour('occupation', 'r2', state)).toBe(UNOCCUPIED_COLOUR);
  });

  it('derives a stable colour from a permanent Country id', () => {
    expect(countryColour('fra')).toBe(countryColour('fra'));
    expect(countryColour('fra')).not.toBe(countryColour('usa'));
  });

  it('distinguishes a genuine zero population from unavailable data', () => {
    const state = sim({ populationByRegion: { zero: 0 } });
    expect(regionLayerColour('population', 'zero', state)).not.toBe(UNAVAILABLE_COLOUR);
    expect(regionLayerColour('population', 'missing', state)).toBe(UNAVAILABLE_COLOUR);
  });

  it('aggregates population and economy over a territory\'s Regions at world zoom', () => {
    const state = sim({ populationByRegion: { r1: 100, r2: 200 }, economicOutputByRegion: { r1: 500, r2: 500 } });
    expect(territoryLayerColour('population', ['r1', 'r2'], 'c1', state)).not.toBe(UNAVAILABLE_COLOUR);
    expect(territoryLayerColour('economicOutput', ['r1', 'r2'], 'c1', state)).not.toBe(UNAVAILABLE_COLOUR);
    // partial coverage still renders (sum of admissible values), never fabricated
    expect(territoryLayerColour('population', ['r1', 'rMissing'], 'c1', state)).not.toBe(UNAVAILABLE_COLOUR);
    // no admissible observation -> unavailable, never a fabricated zero
    expect(territoryLayerColour('population', ['rMissing'], 'c1', state)).toBe(UNAVAILABLE_COLOUR);
    expect(territoryLayerColour('economicOutput', [], 'c1', state)).toBe(UNAVAILABLE_COLOUR);
  });

  it('uses a mixed colour when a territory spans more than one sovereign owner', () => {
    const state = sim({ regionOwnership: { r1: 'c1', r2: 'c2' } });
    expect(territoryLayerColour('ownership', ['r1', 'r2'], 'c1', state)).toBe(MIXED_COLOUR);
    expect(territoryLayerColour('ownership', ['r1'], 'c1', state)).toBe(countryColour('c1'));
    // no mapped Regions -> fall back to the territory's owner
    expect(territoryLayerColour('ownership', [], 'c1', state)).toBe(countryColour('c1'));
  });

  it('marks a territory occupied when any Region is occupied', () => {
    const state = sim({ occupationByRegion: { r1: { regionId: 'r1', warId: 'w1', occupierCountryId: 'c9', startDate: '2026-03-01' } } });
    expect(territoryLayerColour('occupation', ['r1', 'r2'], 'c1', state)).toBe(OCCUPIED_COLOUR);
    expect(territoryLayerColour('occupation', ['r2'], 'c1', state)).toBe(UNOCCUPIED_COLOUR);
  });

  it('provides a legend for every implemented layer', () => {
    for (const { id } of MAP_LAYERS) expect(LAYER_LEGEND[id]).toBeTruthy();
  });
});
