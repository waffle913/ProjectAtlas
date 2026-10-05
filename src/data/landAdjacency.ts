import adjacencyData from './land-adjacency.json';

/**
 * Static, deterministic land-adjacency registry derived from the pinned,
 * committed Admin-1 geometry. This is authoritative runtime geography and is
 * intentionally kept out of every save: the per-save `operations.adjacency`
 * only carries synthetic/override edges, so the full static graph is never
 * duplicated into serialized state.
 */
export const LAND_ADJACENCY_VERSION = 'land-adjacency-v1' as const;

export interface LandAdjacencyRegistry {
  schemaVersion: 1;
  derivedFrom: {
    regionRegistrySchemaVersion: number;
    snapshotId: string;
    retrievedAt: string;
    sourceUrl: string;
    license: string;
    licenseUrl: string;
    method: string;
    limitations: string[];
  };
  adjacency: Record<string, string[]>;
  unavailable: Record<string, string>;
}

const data = adjacencyData as LandAdjacencyRegistry;
if (data.schemaVersion !== 1) throw new Error('Unsupported land adjacency registry schema.');

export const landAdjacencyRegistry: {
  version: typeof LAND_ADJACENCY_VERSION;
  adjacency: Readonly<Record<string, readonly string[]>>;
  unavailable: Readonly<Record<string, string>>;
} = Object.freeze({
  version: LAND_ADJACENCY_VERSION,
  adjacency: Object.freeze(Object.fromEntries(Object.entries(data.adjacency).map(([id, neighbours]) => [id, Object.freeze([...neighbours])]))),
  unavailable: Object.freeze({ ...data.unavailable }),
});

/** Deterministic land neighbours for a permanent Region ID, or an empty list when geometry is unavailable. */
export function staticLandNeighbours(regionId: string): readonly string[] {
  return landAdjacencyRegistry.adjacency[regionId] ?? [];
}
