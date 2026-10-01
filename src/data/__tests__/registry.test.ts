import { emptyFiscal } from '../../simulation/fiscal/model';
import { emptyCrisis } from '../../simulation/crisis/model';
import { emptyPolitics } from '../../simulation/politics/model';
import { emptyGovernance } from '../../simulation/governance/model';
import { emptyInformation } from '../../simulation/information/model';
import { emptySocioeconomy } from '../../simulation/socioeconomy/model';
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWorld } from '../geography';
import { indexRegistry } from '../registry';
import type { EntityRegistry, DatasetMapping } from '../registry';
import registryJson from '../entity-registry.json';
import mappingJson from '../natural-earth-mapping.json';
import { transferTerritory } from '../../simulation/territory';
import { createEngineState } from '../../simulation/state';

const geography: GeoJSON.FeatureCollection = JSON.parse(
  readFileSync('public/data/natural-earth-admin-0.geojson', 'utf8'),
);
const entityRegistry = registryJson as unknown as EntityRegistry;
const naturalEarthMapping = mappingJson as unknown as DatasetMapping;
const buildBundledWorld = (data: GeoJSON.FeatureCollection = geography) => buildWorld(data, naturalEarthMapping, entityRegistry);

describe('persistent entity registry', () => {
  it('covers every bundled feature with unique internal identities and valid references', () => {
    const world = buildBundledWorld();
    expect(world.territories).toHaveLength(177);
    expect(world.countries.size).toBe(new Set(naturalEarthMapping.features.map(item => item.countryId)).size);
    expect(new Set(world.territories.map(t => t.id)).size).toBe(naturalEarthMapping.features.length);
    expect(entityRegistry.countries.length).toBeGreaterThan(world.countries.size);
    expect(world.territories.every(t => world.countries.has(t.ownerCountryId!))).toBe(true);
  });

  it('preserves IDs after reordering, relabeling and replacing source geometry', () => {
    const changed = structuredClone(geography);
    changed.features.reverse();
    for (const f of changed.features) {
      f.properties = { ...f.properties, ADMIN: 'Renamed', NAME_EN: 'Renamed', SOVEREIGNT: 'Renamed', BRK_A3: 'ZZZ', ISO_A2: 'ZZ', ISO_A3: 'ZZZ', ADM0_A3: 'ZZZ' };
      f.geometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] };
    }
    const before = buildBundledWorld();
    const after = buildBundledWorld(changed);
    expect([...after.countries.keys()].sort()).toEqual([...before.countries.keys()].sort());
    expect(after.territories.map(t => t.id).sort()).toEqual(before.territories.map(t => t.id).sort());
    expect([...after.countries.values()].map(c => c.externalIds.isoAlpha3).sort()).toEqual([...before.countries.values()].map(c => c.externalIds.isoAlpha3).sort());
    expect([...after.countries.values()].map(c => [c.commonName,c.capital]).sort()).toEqual([...before.countries.values()].map(c => [c.commonName,c.capital]).sort());
  });

  it('resolves saved ownership after explicitly mapping a replacement dataset with new external IDs', () => {
    const original = buildBundledWorld();
    const territory = original.territories[0];
    const target = original.territories[1].ownerCountryId!;
    const save = transferTerritory({
      schemaVersion: 13, governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: true, speed: 1,
      territoryOwnership: Object.fromEntries(original.territories.map(t => [t.id, t.ownerCountryId])),
      regionOwnership: {},
      populationByRegion: {},
      economicOutputByRegion: {},
      bilateralRelations: {}, claims: [], explicitCasusBelli: [],
      wars: [], occupationByRegion: {}, engine: createEngineState(entityRegistry.countries.map(country => country.id)),
    }, territory.id, territory.ownerCountryId!, target);
    const mapping = structuredClone(naturalEarthMapping);
    mapping.datasetId = 'replacement-higher-resolution';
    mapping.featureIdProperty = 'replacementId';
    mapping.features.forEach(entry => { entry.sourceId = 'new-' + entry.sourceId; });
    const replacement = structuredClone(geography);
    replacement.features.forEach(f => {
      f.properties = { replacementId: 'new-' + f.properties!.NE_ID };
      f.geometry = { type: 'MultiPolygon', coordinates: [[[[0, 0], [2, 0], [0, 2], [0, 0]]]] };
    });
    const updated = buildWorld(replacement, mapping, entityRegistry);
    const restored = JSON.parse(JSON.stringify(save));
    expect(updated.territories[0].id).toBe(territory.id);
    expect(updated.countries.has(restored.territoryOwnership[territory.id])).toBe(true);
    expect(restored.territoryOwnership[territory.id]).toBe(target);
  });

  it('retains all IDs emitted by the previous release for the bundled snapshot', () => {
    // Legacy algorithm ONLY as a compatibility fixture; production never derives IDs.
    const legacyHash = (prefix: string, value: string) => {
      let hash = 0x811c9dc5;
      for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
      return prefix + '.' + (hash >>> 0).toString(36);
    };
    const world = buildBundledWorld();
    geography.features.forEach((f, i) => {
      const p = f.properties!;
      expect(world.territories[i].id).toBe(legacyHash('territory', p.NE_ID + '|' + JSON.stringify(f.geometry)));
      expect(world.territories[i].ownerCountryId).toBe(legacyHash('country', p.ADM0_A3 + '|' + p.SOVEREIGNT + '|' + (p.BRK_A3 ?? '')));
    });
  });

  it('rejects unrecognized, duplicate and missing source features instead of assigning IDs', () => {
    const unknown = structuredClone(geography);
    unknown.features[0].properties!.NE_ID = 123;
    expect(() => buildBundledWorld(unknown)).toThrow(/Unmapped/);
    expect(() => buildBundledWorld({ ...geography, features: [...geography.features, geography.features[0]] })).toThrow(/Duplicate/);
    expect(() => buildBundledWorld({ ...geography, features: geography.features.slice(1) })).toThrow(/missing/);
  });

  it('rejects broken registry references and ambiguous mappings', () => {
    const duplicate = structuredClone(entityRegistry);
    duplicate.countries.push(duplicate.countries[0]);
    expect(() => indexRegistry(duplicate, naturalEarthMapping)).toThrow(/Duplicate/);
    const invalid = structuredClone(naturalEarthMapping);
    invalid.features[0].territoryId = 'territory.unknown';
    expect(() => indexRegistry(entityRegistry, invalid)).toThrow(/unknown entity/);
    const ambiguous = structuredClone(naturalEarthMapping);
    ambiguous.features.push({ ...ambiguous.features[0], sourceId: 'another-feature' });
    expect(() => indexRegistry(entityRegistry, ambiguous)).toThrow(/Multiple features/);
  });
});
