// Map layer definitions and colour binding for the 0.33 interface. Pure functions
// only: they read canonical SimulationState and never mutate it. Layers that have
// no canonical per-Region data in the current build are listed as unavailable and
// rendered with the neutral "no data" colour rather than fabricated values.

import type { SimulationState } from '../types';

export type MapLayer = 'ownership' | 'population' | 'economicOutput' | 'occupation';

export const MAP_LAYERS: ReadonlyArray<{ id: MapLayer; label: string }> = [
  { id: 'ownership', label: 'Ownership' },
  { id: 'population', label: 'Population' },
  { id: 'economicOutput', label: 'Economy' },
  { id: 'occupation', label: 'Occupation' },
];

export const UNAVAILABLE_LAYER_LABELS = ['Resources', 'Trade', 'Logistics'] as const;

export const UNAVAILABLE_COLOUR = '#49545a';
export const OCCUPIED_COLOUR = '#b3541e';
export const UNOCCUPIED_COLOUR = '#46545a';
export const MIXED_COLOUR = '#6f6d68';

const PALETTE = ['#6f8791', '#75856e', '#8a7c69', '#7b7890', '#668b83', '#8a7376', '#7d8667', '#6d7f99', '#8b8064', '#728b79'];

/** Deterministic per-country colour derived from the permanent opaque Country id. */
export function countryColour(id?: string): string {
  let hash = 2166136261;
  for (const char of id ?? '') hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return PALETTE[(hash >>> 0) % PALETTE.length];
}

const INTENSITY_MIN_LOG = 2; // ~100 people/USD
const INTENSITY_MAX_LOG = 10; // ~10^10

function lerpChannel(a: number, b: number, t: number): string {
  return Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
}

/** Continuous logarithmic choropleth; `unavailable`/negative values map to the
 *  no-data colour, while a genuine zero renders at the lightest intensity
 *  (unavailable != zero). */
function intensityColour(value: number | undefined): string {
  if (value === undefined || value === null || !Number.isFinite(value) || value < 0) return UNAVAILABLE_COLOUR;
  const t = Math.min(1, Math.max(0, (Math.log10(Math.max(1, value)) - INTENSITY_MIN_LOG) / (INTENSITY_MAX_LOG - INTENSITY_MIN_LOG)));
  // Interpolate a light tint (#e3efe3) toward a dark green (#1f6d1f).
  return `#${lerpChannel(0xe3, 0x1f, t)}${lerpChannel(0xef, 0x6d, t)}${lerpChannel(0xe3, 0x1f, t)}`;
}

/** Returns the Region fill colour for a map layer, bound to canonical state. */
export function regionLayerColour(layer: MapLayer, regionId: string, sim: SimulationState): string {
  switch (layer) {
    case 'ownership': {
      const owner = sim.regionOwnership[regionId];
      return owner ? countryColour(owner) : UNAVAILABLE_COLOUR;
    }
    case 'population':
      return intensityColour(sim.populationByRegion[regionId]);
    case 'economicOutput':
      return intensityColour(sim.economicOutputByRegion[regionId]);
    case 'occupation':
      return sim.occupationByRegion[regionId] ? OCCUPIED_COLOUR : UNOCCUPIED_COLOUR;
  }
}

/** Aggregate a macro-area's (territory's) Regions into a map-layer colour for the
 *  world zoom level. Only admissible (defined) values are summed; an area with no
 *  admissible observation renders unavailable, never a fabricated zero. */
export function territoryLayerColour(
  layer: MapLayer,
  regionIds: readonly string[],
  fallbackOwnerId: string | undefined,
  sim: SimulationState,
): string {
  switch (layer) {
    case 'ownership': {
      if (regionIds.length === 0) return fallbackOwnerId ? countryColour(fallbackOwnerId) : UNAVAILABLE_COLOUR;
      const owners = [...new Set(regionIds.map(id => sim.regionOwnership[id]).filter((owner): owner is string => Boolean(owner)))];
      if (owners.length === 1) return countryColour(owners[0]);
      if (owners.length > 1) return MIXED_COLOUR;
      return fallbackOwnerId ? countryColour(fallbackOwnerId) : UNAVAILABLE_COLOUR;
    }
    case 'population': {
      let sum = 0; let known = false;
      for (const id of regionIds) { const value = sim.populationByRegion[id]; if (value !== undefined) { sum += value; known = true; } }
      return known ? intensityColour(sum) : UNAVAILABLE_COLOUR;
    }
    case 'economicOutput': {
      let sum = 0; let known = false;
      for (const id of regionIds) { const value = sim.economicOutputByRegion[id]; if (value !== undefined) { sum += value; known = true; } }
      return known ? intensityColour(sum) : UNAVAILABLE_COLOUR;
    }
    case 'occupation':
      return regionIds.some(id => sim.occupationByRegion[id]) ? OCCUPIED_COLOUR : UNOCCUPIED_COLOUR;
  }
}

/** Player-facing legend per layer: colours, units, availability and aggregation. */
export const LAYER_LEGEND: Readonly<Record<MapLayer, string>> = Object.freeze({
  ownership: 'One colour per sovereign owner. Mixed-colour areas contain Regions with more than one sovereign owner.',
  population: 'Green intensity (log scale) = total population, summed over the area\'s Regions with an admissible observation. Grey = no admissible population observation for the area.',
  economicOutput: 'Green intensity (log scale) = total annual economic output in USD at scenario start (2026-01-01), summed over the area\'s Regions with an admissible observation. Grey = no admissible economic observation.',
  occupation: 'Orange = effective military occupation recorded in at least one Region (distinct from sovereignty). Grey = no occupation recorded.',
});
