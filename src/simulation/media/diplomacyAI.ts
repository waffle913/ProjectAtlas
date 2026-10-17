/**
 * 0.32.9 — Media V2: diplomacy, crises and opposition responses.
 *
 * Pure graduated-response contract (docs/media-0.32.md). An AI government's
 * response to a dispute is graduated and deterministic from the dispute severity
 * and an explicit decision to use force — never "fixed by what the player does".
 * Unavailable severity yields no action. No `SimulationState` integration, no
 * schema/migration, no scheduler, no RNG.
 */

export const SEVERITIES = Object.freeze(['low', 'moderate', 'severe', 'critical', 'unavailable'] as const);
export type DisputeSeverity = typeof SEVERITIES[number];

export const RESPONSE_KINDS = Object.freeze(['negotiate', 'condemn', 'sanction', 'mobilize', 'use_force', 'none'] as const);
export type ResponseKind = typeof RESPONSE_KINDS[number];

export interface GraduatedResponse {
  readonly id: string;
  readonly severity: DisputeSeverity;
  readonly responseKind: ResponseKind;
  readonly informationBasis: 'sourced' | 'modelled' | 'unavailable';
  readonly note: string;
}

export function validateGraduatedResponse(r: GraduatedResponse): void {
  if (!r || typeof r.id !== 'string' || !r.id.trim()) throw new Error('Graduated response needs a non-empty id.');
  if (!SEVERITIES.includes(r.severity)) throw new Error(`Unknown severity: ${String(r.severity)}.`);
  if (!RESPONSE_KINDS.includes(r.responseKind)) throw new Error(`Unknown response kind: ${String(r.responseKind)}.`);
  if (!['sourced', 'modelled', 'unavailable'].includes(r.informationBasis)) throw new Error(`Unknown information basis: ${String(r.informationBasis)}.`);
  if (typeof r.note !== 'string' || !r.note.trim()) throw new Error('Graduated response needs a note.');
}

/** Graduated, deterministic response; force only on an explicit decision; never fixed by the player's identity. */
export function selectResponse(severity: DisputeSeverity, explicitUseForce: boolean): ResponseKind {
  if (!SEVERITIES.includes(severity)) throw new Error(`Unknown severity: ${String(severity)}.`);
  if (severity === 'unavailable') return 'none';
  if (explicitUseForce) return 'use_force';
  switch (severity) {
    case 'low': return 'negotiate';
    case 'moderate': return 'condemn';
    case 'severe': return 'sanction';
    case 'critical': return 'mobilize';
    default: return 'none';
  }
}
