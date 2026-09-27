export type EntityKind = 'sovereign' | 'dependency' | 'disputed' | 'other';

export interface DataSource { name: string; url: string; datasetId: string; retrievedAt: string }
export interface SourceValue<T> { value: T; source: DataSource; referenceDate: string; isEstimate: boolean; note?: string }
export interface Country {
  id: string; commonName: string; officialName?: string;
  externalIds: { isoAlpha2?: string; isoAlpha3?: string; unM49?: string };
  entityType: 'sovereign_state' | 'dependency' | 'disputed' | 'partially_recognized' | 'special_status';
  unMembership: 'member' | 'observer' | 'non_member';
  sovereignCountryId?: string; capital?: string; continent?: string; unSubregion?: string;
  sources: Record<string, DataSource[]>; kind: EntityKind;
}
export interface Territory {
  id: string; name: string; geometry: GeoJSON.Geometry; ownerCountryId?: string;
  kind: EntityKind; sourceFeatureId: string; sourceDatasetId: string;
  sourceMetadata: Record<string, unknown>;
}
export interface RegionEntity {
  id: string;
  parentCountryId: string;
  initialOwnerCountryId: string;
  macroTerritoryId?: string;
  commonName: string;
  localAdministrativeType?: string;
  administrativeLevel: number;
  iso31662?: string;
  externalIds: Record<string, string | string[]>;
  geographyMapping:
    | { status: 'mapped'; datasetId: string; sourceFeatureIds: string[] }
    | { status: 'fallback_admin0'; territoryId: string; reason: string; checkedAt: string; source: DataSource }
    | { status: 'unavailable'; reason: string; checkedAt: string; source: DataSource };
  sourceMetadata?: Record<string, unknown>;
}
export type DiplomaticStatus = 'neutral' | 'friendly' | 'hostile';
export interface BilateralRelation {
  countryAId: string;
  countryBId: string;
  score: number;
  status: DiplomaticStatus;
}
export type ClaimType = 'territorial' | 'core';
export interface TerritorialClaim {
  id: string;
  claimantCountryId: string;
  regionId: string;
  type: ClaimType;
  creationDate: string;
  status: 'active' | 'renounced';
  reason?: string;
  provenance?: string;
}
export type CasusBelliType = 'territorial_claim' | 'retaliation' | 'containment';
export interface ExplicitCasusBelli {
  id: string;
  issuerCountryId: string;
  targetCountryId: string;
  type: CasusBelliType;
  creationDate: string;
  expiryDate?: string;
  targetRegionIds?: string[];
  status: 'active' | 'used' | 'expired' | 'revoked';
  reason?: string;
  originatingEventId?: string;
}
export interface WarDeclarationCasusBelliSnapshot {
  id: string;
  issuerCountryId: string;
  targetCountryId: string;
  type: CasusBelliType;
  source: 'claim' | 'explicit';
  creationDate: string;
  targetRegionIds?: string[];
  claimId?: string;
  reason?: string;
  originatingEventId?: string;
}
export interface LimitedWar {
  id: string;
  attackerCountryId: string;
  defenderCountryId: string;
  status: 'active' | 'ended';
  startDate: string;
  endDate?: string;
  warGoal: 'take_region';
  targetRegionId: string;
  declarationCasusBelli: WarDeclarationCasusBelliSnapshot;
  outcome?: 'attacker_victory' | 'defender_victory' | 'white_peace';
}
export interface RegionOccupation {
  regionId: string;
  warId: string;
  occupierCountryId: string;
  startDate: string;
}
export interface SimulationState {
  schemaVersion: 6;
  date: string;
  paused: boolean;
  speed: 1 | 2 | 5;
  territoryOwnership: Record<string, string | undefined>;
  regionOwnership: Record<string, string | undefined>;
  populationByRegion: Record<string, number | undefined>;
  economicOutputByRegion: Record<string, number | undefined>;
  bilateralRelations: Record<string, BilateralRelation>;
  claims: TerritorialClaim[];
  explicitCasusBelli: ExplicitCasusBelli[];
  wars: LimitedWar[];
  occupationByRegion: Record<string, RegionOccupation>;
}
