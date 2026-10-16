/**
 * 0.27.2 — Resources/energy V1: territorial anchoring and geographic evidence.
 *
 * Region-level anchoring contract (docs/resources-0.27.md). A resource or an
 * installation is anchored to a permanent Region id — never to a grid cell, a
 * point or a polygon. This is a pure vocabulary/contract module: no new
 * canonical state, no scheduler, no RNG, no migration.
 *
 * Contract:
 * - `regionId` is a permanent opaque Region id, never regenerated from a name,
 *   array index, geometry source id or ISO code;
 * - 0.27.2 admits whole-Region anchoring only (`precision: 'region'`).
 *   Intra-regional positioning (`documented_intra_region`) depends on the
 *   undecided spatial-grid decision and stays BLOCKED_DESIGN;
 * - `unavailable != 0`: an unknown anchor is `null`, never a fabricated Region
 *   or a fabricated position;
 * - any real geometry reference carries dated, traceable provenance.
 */

import { isSimulationDate } from '../date';
import { isSpatialGridInScope } from './contract';

export const ANCHOR_PRECISIONS = Object.freeze(['region', 'documented_intra_region', 'unavailable'] as const);
export type AnchorPrecision = typeof ANCHOR_PRECISIONS[number];

export interface RegionAnchorProvenance {
  publisher: string;
  dataset: string;
  url: string;
  referenceDate: string;
  retrievedAt: string;
  licence: string;
  attribution: string;
  limitation: string;
}

export interface RegionAnchor {
  /** Permanent opaque id of the anchored resource or installation. */
  readonly subjectId: string;
  /** Permanent opaque Region id the subject is anchored to. */
  readonly regionId: string;
  /** Whole-Region anchoring in 0.27.2; intra-region positioning is BLOCKED_DESIGN. */
  readonly precision: AnchorPrecision;
  /** Source geometry reference; null when unavailable. */
  readonly geometryReference: string | null;
  readonly provenance?: RegionAnchorProvenance;
}

export function validateRegionAnchor(a: RegionAnchor): void {
  if (!a || typeof a.subjectId !== 'string' || !a.subjectId.trim()) throw new Error('Anchor needs a non-empty subject id.');
  if (!ANCHOR_PRECISIONS.includes(a.precision)) throw new Error(`Unknown anchor precision: ${String(a.precision)}.`);
  if (a.precision === 'unavailable') {
    if (a.regionId !== '') throw new Error('An unavailable anchor must not name a Region.');
    if (a.geometryReference !== null || a.provenance) throw new Error('An unavailable anchor must not carry a geometry reference or provenance.');
    return;
  }
  if (typeof a.regionId !== 'string' || !a.regionId.trim()) throw new Error('Anchor needs a non-empty permanent Region id.');
  if (a.precision === 'documented_intra_region' && !isSpatialGridInScope()) {
    throw new Error('documented_intra_region anchoring is BLOCKED_DESIGN until the intra-region spatial-grid decision.');
  }
  if (a.geometryReference !== null && !a.provenance) {
    throw new Error('A geometry reference requires dated provenance.');
  }
  if (a.provenance) {
    if (![a.provenance.publisher, a.provenance.dataset, a.provenance.url, a.provenance.licence, a.provenance.attribution, a.provenance.limitation].every(v => typeof v === 'string' && v.trim())) {
      throw new Error('Anchor provenance needs publisher/dataset/url/licence/attribution/limitation.');
    }
    if (!isSimulationDate(a.provenance.referenceDate) || !isSimulationDate(a.provenance.retrievedAt)) {
      throw new Error('Anchor provenance dates must be valid simulation dates.');
    }
  }
}

/** Anchor a subject to a whole Region (0.27.2 default precision). No intra-region position is assumed. */
export function anchorToRegion(
  subjectId: string,
  regionId: string,
  geometryReference: string | null = null,
  provenance?: RegionAnchorProvenance,
): RegionAnchor {
  const anchor: RegionAnchor = {
    subjectId, regionId, precision: 'region',
    geometryReference: geometryReference ?? null,
    ...(provenance ? { provenance } : {}),
  };
  validateRegionAnchor(anchor);
  return anchor;
}

/** An unavailable anchor: explicitly no Region-level evidence, never a fabricated one. */
export const unavailableAnchor = (subjectId: string): RegionAnchor => {
  const anchor: RegionAnchor = { subjectId, regionId: '', precision: 'unavailable', geometryReference: null };
  validateRegionAnchor(anchor);
  return anchor;
};
