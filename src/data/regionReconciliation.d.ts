export interface RegionIdentity {
  id: string;
  status: 'active' | 'retired';
  identityKind: 'admin1' | 'national_fallback';
  parentCountryId: string;
  commonName: string;
  nameAliases?: string[];
  iso31662?: string;
  stableExternalIds?: { wikidata?: string[] };
  successorRegionId?: string;
}
export interface DatasetRegionAlias {
  datasetId: string;
  sourceId: string;
  sourceAdmin1Code?: string;
  regionId: string;
}
export interface SourceRegionCandidate {
  datasetId: string;
  reviewKey: string;
  parentCountryId: string;
  name: string;
  iso31662?: string;
  wikidataIds?: string[];
  sourceFeatureIds: string[];
  sourceAdmin1Codes: string[];
  [key: string]: unknown;
}
export function reconcileRegionCandidates(input: {
  identities: RegionIdentity[];
  aliases: DatasetRegionAlias[];
  candidates: SourceRegionCandidate[];
  reviewedMatches?: Record<string, string>;
  requireComplete?: boolean;
}): Array<SourceRegionCandidate & { regionId: string }>;
