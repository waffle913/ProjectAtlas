export type EntityKind = 'sovereign' | 'dependency' | 'disputed' | 'other';

export interface SourceValue<T> { value: T; source: string; sourceUrl: string; asOf: string; note?: string }
export interface Country {
  id: string; commonName: string; officialName?: string; iso2?: string; iso3?: string; unM49?: string;
  kind: EntityKind; capital?: string; continent?: string; subregion?: string;
  sources: Record<string, SourceValue<string | number> | undefined>;
}
export interface Territory {
  id: string; name: string; geometry: GeoJSON.Geometry; ownerCountryId?: string;
  sovereignty: string; kind: EntityKind; sourceFeatureId: string;
}
export interface SimulationState { date: string; paused: boolean; speed: 1 | 2 | 4; territoryOwnership: Record<string, string | undefined> }
