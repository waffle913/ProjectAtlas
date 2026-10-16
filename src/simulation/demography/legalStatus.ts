/**
 * 0.30.4 — Demography/migration V2: legal statuses and integration.
 *
 * Pure legal-status contract (docs/demography-0.30.md). A legal status is only
 * asserted against an explicitly documented legal instrument; an unknown rule is
 * `unavailable`, never zero rights and never zero service access. Social
 * integration is a contextualized material mechanism (residence time,
 * employment, service access), never an arbitrary cultural-conformity gauge.
 * No new canonical state, no scheduler, no RNG, no migration.
 */

import { SERVICE_FAMILIES, type ServiceFamily } from '../services/contract';

export const LEGAL_STATUS_KINDS = Object.freeze([
  'citizenship', 'residence', 'work', 'family', 'protection',
] as const);
export type LegalStatusKind = typeof LEGAL_STATUS_KINDS[number];

export interface LegalStatusRule {
  readonly id: string;
  readonly countryId: string;
  readonly kind: LegalStatusKind;
  /** `documented_law` requires a legal instrument; `unavailable` never implies zero rights. */
  readonly basis: 'documented_law' | 'unavailable';
  /** The legal instrument / source reference that documents the status; null when unavailable. */
  readonly legalInstrumentRef: string | null;
  /** Service families the status confers access to; null = unknown (unavailable != zero). */
  readonly serviceAccess: readonly ServiceFamily[] | null;
  readonly note: string;
}

export function validateLegalStatusRule(r: LegalStatusRule): void {
  if (!r || typeof r.id !== 'string' || !r.id.trim()) throw new Error('Legal status rule needs a non-empty id.');
  if (typeof r.countryId !== 'string' || !r.countryId.trim()) throw new Error('Legal status rule needs a non-empty country id.');
  if (!LEGAL_STATUS_KINDS.includes(r.kind)) throw new Error(`Unknown legal status kind: ${String(r.kind)}.`);
  if (!['documented_law', 'unavailable'].includes(r.basis)) throw new Error(`Unknown basis: ${String(r.basis)}.`);
  if (r.basis === 'documented_law') {
    if (typeof r.legalInstrumentRef !== 'string' || !r.legalInstrumentRef.trim()) {
      throw new Error('A documented_law status needs a legal instrument reference.');
    }
    if (r.serviceAccess === null) throw new Error('A documented_law status needs explicit service access (may be empty, never null).');
    if (!Array.isArray(r.serviceAccess) || !r.serviceAccess.every((f) => SERVICE_FAMILIES.includes(f))) throw new Error('serviceAccess must be an array of known service families.');
  } else {
    if (r.legalInstrumentRef !== null) throw new Error('An unavailable status must not fabricate a legal instrument reference.');
    if (r.serviceAccess !== null) throw new Error('An unavailable status must not assert service access (unavailable != zero).');
  }
  if (typeof r.note !== 'string' || !r.note.trim()) throw new Error('Legal status rule needs a note.');
}

export interface IntegrationContext {
  /** Whole months of continuous residence. */
  readonly residenceMonths: number;
  readonly employed: boolean;
  /** Number of service families actually accessed (0..SERVICE_FAMILIES.length). */
  readonly serviceAccessCount: number;
}

export interface IntegrationAssessment {
  /** 0..10000 bps. */
  readonly indexBps: number;
  readonly components: { residenceBps: number; employmentBps: number; serviceBps: number };
  readonly note: string;
}

const RESIDENCE_WINDOW_MONTHS = 60;
const RESIDENCE_WEIGHT_BPS = 4000;
const EMPLOYMENT_WEIGHT_BPS = 3000;
const SERVICE_WEIGHT_BPS = 3000;

/**
 * Contextualized integration index (0..10000 bps): residence time + employment +
 * service access. Explicitly material, never a cultural-conformity gauge.
 */
export function assessIntegration(ctx: IntegrationContext): IntegrationAssessment {
  if (!Number.isSafeInteger(ctx.residenceMonths) || ctx.residenceMonths < 0) {
    throw new Error('residenceMonths must be a non-negative whole number.');
  }
  if (typeof ctx.employed !== 'boolean') throw new Error('employed must be a boolean.');
  if (!Number.isSafeInteger(ctx.serviceAccessCount) || ctx.serviceAccessCount < 0 || ctx.serviceAccessCount > SERVICE_FAMILIES.length) {
    throw new Error(`serviceAccessCount must be a whole number between 0 and ${SERVICE_FAMILIES.length}.`);
  }
  const residenceBps = Math.round(Math.min(1, ctx.residenceMonths / RESIDENCE_WINDOW_MONTHS) * RESIDENCE_WEIGHT_BPS);
  const employmentBps = ctx.employed ? EMPLOYMENT_WEIGHT_BPS : 0;
  const serviceBps = Math.round((ctx.serviceAccessCount / SERVICE_FAMILIES.length) * SERVICE_WEIGHT_BPS);
  const indexBps = residenceBps + employmentBps + serviceBps;
  return {
    indexBps: Math.max(0, Math.min(10000, indexBps)),
    components: { residenceBps, employmentBps, serviceBps },
    note: 'Integration is measured by residence duration, employment and service access only — never a cultural-conformity gauge.',
  };
}
