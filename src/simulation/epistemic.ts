export type KnowledgeLayer = 'reality' | 'government-information' | 'public-perception';

export interface LayeredValue<T> {
  readonly layer: KnowledgeLayer;
  readonly value: T;
  readonly observedAt: string;
  readonly sourceKey?: string;
}

export interface EpistemicView<TReality, TGovernment = TReality, TPublic = TGovernment> {
  reality(): LayeredValue<TReality>;
  governmentInformation(countryId: string): LayeredValue<TGovernment> | undefined;
  publicPerception(countryId: string): LayeredValue<TPublic> | undefined;
}

/** Current systems expose canonical reality while reserving distinct future information layers. */
export const canonicalReality = <T>(value: T, observedAt: string, sourceKey?: string): LayeredValue<T> => ({ layer: 'reality', value, observedAt, sourceKey });
