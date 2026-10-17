import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import {
  countryColour,
  MAP_LAYERS,
  OCCUPIED_COLOUR,
  regionLayerColour,
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
});
