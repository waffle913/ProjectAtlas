export type EntityKind = 'sovereign' | 'dependency' | 'disputed' | 'other';

export interface DataSource { name: string; url: string; datasetId: string; retrievedAt: string }
export interface SourceValue<T> { value: T; source: DataSource; referenceDate: string; isEstimate: boolean; note?: string }
export interface Country {
  id: string; commonName: string; officialName?: string;
  externalIds: { isoAlpha2?: string; isoAlpha3?: string; unM49?: string };
  entityType: 'sovereign_state' | 'dependency' | 'disputed' | 'partially_recognized' | 'special_status';
  sovereignCountryId?: string; capital?: string; continent?: string; unSubregion?: string;
  sources: Record<string, DataSource[]>; kind: EntityKind;
}
export interface Territory {
  id: string; name: string; geometry: GeoJSON.Geometry; ownerCountryId?: string;
  kind: EntityKind; sourceFeatureId: string; sourceDatasetId: string;
  sourceMetadata: Record<string, unknown>;
}
export interface SimulationState { date: string; paused: boolean; speed: 1 | 2 | 5; territoryOwnership: Record<string, string | undefined> }
