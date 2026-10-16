/**
 * 0.28.1 — Industry V1: product, sector and nomenclature contracts.
 *
 * Vocabulary/accounting-contract milestone, parallel to 0.25.1/0.26.1/0.27.1.
 * It establishes the product/sector/nomenclature vocabulary and the admission
 * rule, without building any mechanism:
 *
 * - It is NOT integrated into `SimulationState`, the save schema, migrations,
 *   the scheduler or the RNG.
 * - It defines no second production engine, no second goods list and no second
 *   stock store; the canonical owners remain the 0.25 economy and the 0.17
 *   trade taxonomy.
 * - It admits no real product/sector/activity inventory: a record is admitted
 *   only with compatible dated evidence or an explicit synthetic label.
 *   `unavailable != 0` — an unknown product/sector is never a fabricated zero.
 *
 * Nomenclature rule: ISIC/NACE/HS/CPC/PRODCOM are external documentary
 * classifications. A mapping to a product is a dated, traceable correspondence;
 * it never equates two nomenclatures abusively (an HS code is not a sector, a
 * NACE class is not a PRODCOM product). A `sourced` mapping carries structured
 * provenance (source, publication date, reference date, admissibility), never a
 * bare free-text note.
 */

import { isSimulationDate } from '../date';

export const INDUSTRY_VERSION = 'industry-0.28-v1' as const;

/** Permanent opaque identifiers (vocabulary only). */
export type ProductId = string;
export type SectorId = string;
export type ActivityId = string;

export const NOMENCLATURES = Object.freeze(['isic', 'nace', 'hs', 'cpc', 'prodcom'] as const);
export type Nomenclature = typeof NOMENCLATURES[number];

export const COVERAGE_STATUSES = Object.freeze(['sourced', 'derived', 'modelled', 'synthetic', 'unavailable'] as const);
export type Coverage = typeof COVERAGE_STATUSES[number];

export const ADMISSIBILITY = Object.freeze(['admissible', 'requires_confirmation', 'inadmissible'] as const);
export type Admissibility = typeof ADMISSIBILITY[number];

export interface ProductRecord {
  readonly id: string;
  readonly coverage: Coverage;
  readonly note: string;
}

export interface NomenclatureMapping {
  /** Permanent opaque id of the mapped product/activity. */
  readonly subjectId: string;
  readonly nomenclature: Nomenclature;
  /** The admitted external classification code (e.g. HS 6-digit). */
  readonly code: string;
  readonly coverage: 'sourced' | 'derived' | 'modelled' | 'unavailable';
  /** Publisher/document name; required and non-empty for `sourced`. */
  readonly source: string | null;
  /** Publication date (YYYY-MM-DD); required for `sourced`. */
  readonly publishedOn: string | null;
  /** The date the datum documents (scenario-date applicability); required for `sourced`. */
  readonly referenceDate: string | null;
  /** Admission status; a `sourced` mapping must not be `inadmissible`. */
  readonly admissibility: Admissibility;
  readonly note: string;
}

/** 0.28.1 admits no real product/sector/activity inventory or mapping. */
export const PRODUCTS: Readonly<Record<ProductId, ProductRecord>> = Object.freeze({});
export const SECTORS: Readonly<Record<SectorId, ProductRecord>> = Object.freeze({});
export const ACTIVITIES: Readonly<Record<ActivityId, ProductRecord>> = Object.freeze({});
export const NOMENCLATURE_MAPPINGS: Readonly<Record<string, NomenclatureMapping>> = Object.freeze({});

export function validateNomenclatureMapping(m: NomenclatureMapping): void {
  if (!m || typeof m.subjectId !== 'string' || !m.subjectId.trim()) throw new Error('Mapping needs a non-empty subject id.');
  if (!NOMENCLATURES.includes(m.nomenclature)) throw new Error(`Unknown nomenclature: ${String(m.nomenclature)}.`);
  if (typeof m.code !== 'string' || !m.code.trim()) throw new Error('Mapping needs a non-empty nomenclature code.');
  if (!['sourced', 'derived', 'modelled', 'unavailable'].includes(m.coverage)) throw new Error(`Unknown coverage: ${String(m.coverage)}.`);
  if (!ADMISSIBILITY.includes(m.admissibility)) throw new Error(`Unknown admissibility: ${String(m.admissibility)}.`);
  if (typeof m.note !== 'string') throw new Error('Mapping needs a string note.');

  if (m.coverage === 'sourced') {
    if (typeof m.source !== 'string' || !m.source.trim()) throw new Error('A sourced mapping needs a non-empty source (publisher/document).');
    if (!isSimulationDate(m.publishedOn)) throw new Error('A sourced mapping needs a valid publication date (publishedOn).');
    if (!isSimulationDate(m.referenceDate)) throw new Error('A sourced mapping needs a valid reference date (referenceDate).');
    if (m.admissibility === 'inadmissible') throw new Error('A sourced mapping cannot be inadmissible.');
  } else {
    if (m.source !== null && (typeof m.source !== 'string' || !m.source.trim())) throw new Error('A non-sourced mapping with a source must use a non-empty string or null.');
    if (m.publishedOn !== null && !isSimulationDate(m.publishedOn)) throw new Error('publishedOn must be a valid simulation date or null.');
    if (m.referenceDate !== null && !isSimulationDate(m.referenceDate)) throw new Error('referenceDate must be a valid simulation date or null.');
  }
}

// ---------------------------------------------------------------------------
// Open design decisions (BLOCKED_DESIGN until a human decides).
// ---------------------------------------------------------------------------

export interface IndustryDecisionGate {
  readonly id: 'competition_market_structures';
  readonly status: 'undecided' | 'decided';
  readonly question: string;
  readonly dependsOnSubMilestones: readonly string[];
}

export const INDUSTRY_DECISIONS: readonly IndustryDecisionGate[] = Object.freeze([
  {
    id: 'competition_market_structures',
    status: 'undecided',
    question: 'Which detailed competition / concentration / monopoly mechanisms and antitrust powers are actually validated, with which market rules and legal powers? Do not activate any silently.',
    dependsOnSubMilestones: ['0.28.8'],
  },
]);

export const isCompetitionInScope = (): boolean => INDUSTRY_DECISIONS.find((d) => d.id === 'competition_market_structures')!.status === 'decided';
