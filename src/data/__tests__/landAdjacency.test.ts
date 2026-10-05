import { describe, expect, it } from 'vitest';
import regionRegistryJson from '../region-registry.json';
import adjacencyJson from '../land-adjacency.json';
import { LAND_ADJACENCY_VERSION, landAdjacencyRegistry, staticLandNeighbours } from '../landAdjacency';
import type { RegionEntity } from '../../types';

const registry = regionRegistryJson.regions as unknown as RegionEntity[];

describe('0.19 static land adjacency registry', () => {
  it('derives a deterministic, symmetric, sorted unique no-self-edge graph over permanent Region IDs', () => {
    expect(adjacencyJson.schemaVersion).toBe(1);
    const adjacency = adjacencyJson.adjacency as Record<string, string[]>;
    const regionIds = new Set(registry.map(region => region.id));
    for (const [regionId, neighbours] of Object.entries(adjacency)) {
      expect(regionIds.has(regionId)).toBe(true);
      expect(neighbours).toEqual([...neighbours].sort());
      expect(new Set(neighbours).size).toBe(neighbours.length);
      expect(neighbours).not.toContain(regionId);
      for (const neighbour of neighbours) {
        expect(regionIds.has(neighbour)).toBe(true);
        expect(adjacency[neighbour]).toContain(regionId);
      }
    }
  });

  it('covers every Region as either adjacent or explicitly unavailable, never both', () => {
    const adjacency = adjacencyJson.adjacency as Record<string, string[]>;
    const unavailable = adjacencyJson.unavailable as Record<string, string>;
    for (const region of registry) {
      const hasEdges = Boolean(adjacency[region.id]?.length);
      const isUnavailable = region.id in unavailable;
      expect(hasEdges !== isUnavailable).toBe(true);
      if (isUnavailable) expect(unavailable[region.id].trim()).not.toBe('');
    }
  });

  it('exposes an immutable frozen registry with stable deterministic lookups', () => {
    expect(landAdjacencyRegistry.version).toBe(LAND_ADJACENCY_VERSION);
    expect(Object.isFrozen(landAdjacencyRegistry)).toBe(true);
    expect(Object.isFrozen(landAdjacencyRegistry.adjacency)).toBe(true);
    const first = staticLandNeighbours('region.f54a2090-1395-409d-b6ce-f3f72fbefccc');
    const second = staticLandNeighbours('region.f54a2090-1395-409d-b6ce-f3f72fbefccc');
    expect(first).toBe(second);
    expect(staticLandNeighbours('region.missing')).toEqual([]);
  });

  it('documents cross-country and cross-Region land adjacency from the pinned geometry', () => {
    const adjacency = adjacencyJson.adjacency as Record<string, string[]>;
    const mapping = new Map((regionRegistryJson.regions as unknown as RegionEntity[]).map(region => [region.id, region.parentCountryId]));
    let crossCountryEdges = 0;
    for (const [regionId, neighbours] of Object.entries(adjacency)) {
      for (const neighbour of neighbours) {
        if (mapping.get(neighbour) !== mapping.get(regionId)) crossCountryEdges += 1;
      }
    }
    expect(crossCountryEdges).toBeGreaterThan(0);
  });
});
