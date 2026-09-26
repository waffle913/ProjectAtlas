import { describe, expect, it } from 'vitest';
import { bindRegionGeometry } from '../regionData';
import { reconcileRegionCandidates } from '../regionReconciliation.js';
import type { RegionIdentity, SourceRegionCandidate } from '../regionReconciliation.js';
import type { Admin1Mapping, RegionRegistry } from '../regionData';

const identities: RegionIdentity[] = [
  { id: 'region.alpha', status: 'active', identityKind: 'admin1', parentCountryId: 'country.one', commonName: 'Alpha', nameAliases: ['Old Alpha'], iso31662: 'AA-1' },
  { id: 'region.beta', status: 'active', identityKind: 'admin1', parentCountryId: 'country.one', commonName: 'Beta', stableExternalIds: { wikidata: ['Q200'] } },
  { id: 'region.gamma', status: 'active', identityKind: 'admin1', parentCountryId: 'country.one', commonName: 'Gamma', nameAliases: ['Old Gamma'] },
];
const oldAliases = [
  { datasetId: 'natural-earth-old', sourceId: 'old-1', sourceAdmin1Code: 'OLD-A', regionId: 'region.alpha' },
  { datasetId: 'natural-earth-old', sourceId: 'old-2', sourceAdmin1Code: 'OLD-B', regionId: 'region.beta' },
  { datasetId: 'natural-earth-old', sourceId: 'old-3', sourceAdmin1Code: 'OLD-C', regionId: 'region.gamma' },
];
const replacement: SourceRegionCandidate[] = [
  { datasetId: 'replacement-admin1', reviewKey: 'replacement:gamma', parentCountryId: 'country.one', name: 'Renamed Three', sourceFeatureIds: ['new-903'], sourceAdmin1Codes: ['NEW-Z'] },
  { datasetId: 'replacement-admin1', reviewKey: 'replacement:beta', parentCountryId: 'country.one', name: 'Renamed Two', wikidataIds: ['Q200'], sourceFeatureIds: ['new-902'], sourceAdmin1Codes: ['NEW-Y'] },
  { datasetId: 'replacement-admin1', reviewKey: 'replacement:alpha', parentCountryId: 'country.one', name: 'Renamed One', iso31662: 'AA-1', sourceFeatureIds: ['new-901'], sourceAdmin1Codes: ['NEW-X'] },
];

describe('dataset-independent Region reconciliation', () => {
  it('retains exact IDs when every source ID, code, name, geometry and order changes', () => {
    const reconciled = reconcileRegionCandidates({ identities, aliases: oldAliases, candidates: replacement, reviewedMatches: { 'replacement:gamma': 'region.gamma' } });
    expect(reconciled.map(item => item.regionId)).toEqual(['region.gamma', 'region.beta', 'region.alpha']);
    const mapping: Admin1Mapping = {
      schemaVersion: 2, datasetId: 'replacement-admin1', featureIdProperty: 'replacementId', excludedFeatures: [],
      features: reconciled.map(item => ({ sourceId: item.sourceFeatureIds[0], sourceAdmin1Code: item.sourceAdmin1Codes[0], regionId: item.regionId, countryId: item.parentCountryId })),
    };
    const registry = { schemaVersion: 2, sourceSnapshot: {} as RegionRegistry['sourceSnapshot'], geometryAssetsByCountry: {}, regions: identities.map(identity => ({
      id: identity.id, parentCountryId: identity.parentCountryId, initialOwnerCountryId: identity.parentCountryId,
      commonName: identity.commonName, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped' as const, datasetId: 'replacement-admin1', sourceFeatureIds: [] },
    })), retiredRegions: [], reservedRegionIds: [] };
    const geometry: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [...reconciled].reverse().map((item, index) => ({
      type: 'Feature', properties: { replacementId: item.sourceFeatureIds[0], name: `Entirely new label ${index}` },
      geometry: { type: 'Polygon', coordinates: [[[index, 0], [index + 1, 0], [index, 1], [index, 0]]] },
    })) };
    expect(bindRegionGeometry(geometry, mapping, registry).map(item => item.regionId).sort()).toEqual(['region.alpha', 'region.beta', 'region.gamma']);
  });

  it('requires a genuinely new split identity to be explicitly registered', () => {
    const parent = identities.slice(0, 1);
    const split: SourceRegionCandidate[] = [
      { datasetId: 'split-source', reviewKey: 'split:existing', parentCountryId: 'country.one', name: 'Changed Parent', iso31662: 'AA-1', sourceFeatureIds: ['split-a'], sourceAdmin1Codes: ['S-A'] },
      { datasetId: 'split-source', reviewKey: 'split:new', parentCountryId: 'country.one', name: 'Unrecognized Child', sourceFeatureIds: ['split-b'], sourceAdmin1Codes: ['S-B'] },
    ];
    expect(() => reconcileRegionCandidates({ identities: parent, aliases: [], candidates: split })).toThrow(/requires explicit review/);
    const explicitNew: RegionIdentity = { id: 'region.explicit-new', status: 'active', identityKind: 'admin1', parentCountryId: 'country.one', commonName: 'Confirmed New Region' };
    const reconciled = reconcileRegionCandidates({ identities: [...parent, explicitNew], aliases: [], candidates: split, reviewedMatches: { 'split:new': explicitNew.id } });
    expect(reconciled.find(item => item.reviewKey === 'split:existing')?.regionId).toBe('region.alpha');
    expect(reconciled.find(item => item.reviewKey === 'split:new')?.regionId).toBe('region.explicit-new');
  });

  it('requires an explicit merge migration and keeps the old identity known', () => {
    const before: RegionIdentity[] = [identities[0], { ...identities[1], iso31662: 'AA-2' }];
    const merged: SourceRegionCandidate[] = [{ datasetId: 'merge-source', reviewKey: 'merge:one', parentCountryId: 'country.one', name: 'Merged', iso31662: 'AA-1', sourceFeatureIds: ['merge-1'], sourceAdmin1Codes: ['M-1'] }];
    expect(() => reconcileRegionCandidates({ identities: before, aliases: [], candidates: merged })).toThrow(/explicit retirement\/merge migration/);
    const after: RegionIdentity[] = [before[0], { ...before[1], status: 'retired', successorRegionId: 'region.alpha' }];
    const reconciled = reconcileRegionCandidates({ identities: after, aliases: [], candidates: merged });
    expect(reconciled[0].regionId).toBe('region.alpha');
    expect(after.find(identity => identity.id === 'region.beta')).toMatchObject({ status: 'retired', successorRegionId: 'region.alpha' });
  });
});
