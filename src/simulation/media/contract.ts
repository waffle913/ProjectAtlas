/**
 * 0.32.1 — Media V2: information contract.
 *
 * Pure information contract (docs/media-0.32.md). Reality, government
 * information and public perception are three distinct layers; an item
 * propagates between them only through an explicit access grant, never
 * automatically (reality never auto-exposes to public perception). Every item
 * carries dated provenance, coverage, confidence and uncertainty; an unknown
 * source or confidence is `unavailable`, never zero. No `SimulationState`
 * integration, no schema/migration, no scheduler, no RNG.
 */

import { isSimulationDate } from '../date';

export const MEDIA_VERSION = 'media-0.32-v1' as const;

/** The three distinct knowledge layers (mirrors epistemic.ts KnowledgeLayer). */
export const INFORMATION_LAYERS = Object.freeze(['reality', 'government-information', 'public-perception'] as const);
export type InformationLayer = typeof INFORMATION_LAYERS[number];

export const COVERAGE_STATUSES = Object.freeze(['sourced', 'derived', 'modelled', 'partial', 'unavailable'] as const);
export type CoverageStatus = typeof COVERAGE_STATUSES[number];

export interface InformationSource {
  readonly id: string;
  readonly publisher: string;
  /** Source URL; null = unavailable (never a fabricated zero/omission). */
  readonly url: string | null;
  /** The date the situation applies to (scenario date). */
  readonly referenceDate: string;
  readonly retrievalDate: string | null;
  /** Licence; null = requires_confirmation (never assumed licensed). */
  readonly licence: string | null;
  readonly attribution: string | null;
  readonly limitation: string;
}

export function validateInformationSource(s: InformationSource): void {
  if (!s || typeof s.id !== 'string' || !s.id.trim()) throw new Error('Information source needs a non-empty id.');
  if (typeof s.publisher !== 'string' || !s.publisher.trim()) throw new Error('Information source needs a non-empty publisher.');
  if (s.url !== null && (typeof s.url !== 'string' || !s.url.trim())) throw new Error('url must be a non-empty string or null.');
  if (!isSimulationDate(s.referenceDate)) throw new Error('referenceDate must be a valid simulation date.');
  if (s.retrievalDate !== null && !isSimulationDate(s.retrievalDate)) throw new Error('retrievalDate must be a valid simulation date or null.');
  if (s.licence !== null && (typeof s.licence !== 'string' || !s.licence.trim())) throw new Error('licence must be a non-empty string or null.');
  if (s.attribution !== null && (typeof s.attribution !== 'string' || !s.attribution.trim())) throw new Error('attribution must be a non-empty string or null.');
  if (typeof s.limitation !== 'string' || !s.limitation.trim()) throw new Error('Information source needs a limitation.');
}

export interface InformationItem {
  readonly id: string;
  readonly layer: InformationLayer;
  readonly sourceId: string;
  readonly coverage: CoverageStatus;
  /** Confidence in basis points (0..10000); null = unavailable (never zero). */
  readonly confidenceBps: number | null;
  /** The fact; typed by the layer at integration, opaque here. */
  readonly value: unknown;
  readonly observedAt: string;
  readonly note: string;
}

export function validateInformationItem(i: InformationItem): void {
  if (!i || typeof i.id !== 'string' || !i.id.trim()) throw new Error('Information item needs a non-empty id.');
  if (!INFORMATION_LAYERS.includes(i.layer)) throw new Error(`Unknown information layer: ${String(i.layer)}.`);
  if (typeof i.sourceId !== 'string' || !i.sourceId.trim()) throw new Error('Information item needs a non-empty source id.');
  if (!COVERAGE_STATUSES.includes(i.coverage)) throw new Error(`Unknown coverage: ${String(i.coverage)}.`);
  if (i.confidenceBps !== null && (!Number.isSafeInteger(i.confidenceBps) || i.confidenceBps < 0 || i.confidenceBps > 10000)) throw new Error('confidenceBps must be a whole number between 0 and 10000 or null.');
  if (!isSimulationDate(i.observedAt)) throw new Error('observedAt must be a valid simulation date.');
  if (typeof i.note !== 'string' || !i.note.trim()) throw new Error('Information item needs a note.');
}

export type AccessBasis = 'government_access' | 'public_disclosure' | 'none';

/** Propagation between layers only through an explicit access grant; reality never auto-exposes to perception. */
export function canPropagate(from: InformationLayer, to: InformationLayer, access: AccessBasis): boolean {
  if (from === to) return true;
  if (from === 'reality' && to === 'government-information') return access === 'government_access';
  if (from === 'government-information' && to === 'public-perception') return access === 'public_disclosure';
  return false; // no direct reality -> perception, no backwards propagation
}
