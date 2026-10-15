/**
 * 0.27.3 — Resources/energy V1: extraction installations.
 *
 * Contract model for extractive installations (mines, wells, quarries). Pure
 * vocabulary/contract layer: no new canonical state, no scheduler, no RNG, no
 * migration. A real installation is admitted only with dated evidence or an
 * explicit synthetic label; an unknown capacity is `null`, never a zero.
 *
 * Contract (docs/resources-0.27.md):
 * - an installation is anchored to one permanent Region (0.27.2) and extracts
 *   one resource;
 * - output requires operating status AND an admitted capacity; no personnel,
 *   no inputs, no maintenance → no output is fabricated here (those are
 *   represented as required, validated fields that the engine matches against
 *   the canonical labour/stock owners later);
 * - ownership (sovereign owner), exploitation (operator) and effective control
 *   are three distinct concepts kept as three distinct ids.
 */

import { isWholeUsd } from '../finance/settlement';

export const INSTALLATION_KINDS = Object.freeze(['mine', 'well', 'quarry'] as const);
export type InstallationKind = typeof INSTALLATION_KINDS[number];

export const INSTALLATION_STATUSES = Object.freeze(['planned', 'operating', 'paused', 'decommissioned', 'unavailable'] as const);
export type InstallationStatus = typeof INSTALLATION_STATUSES[number];

export interface ExtractionInstallation {
  /** Permanent opaque installation id. */
  readonly id: string;
  readonly kind: InstallationKind;
  /** Permanent opaque Region id the installation is anchored to. */
  readonly regionId: string;
  /** Permanent opaque resource id being extracted. */
  readonly resourceId: string;
  /** Admitted extractable capacity (aggregate quantity / month); null = unavailable. */
  readonly capacityPerMonth: number | null;
  readonly personnelRequired: number;
  readonly maintenancePerMonth: number;
  /** Required material inputs by resource id (aggregate quantity / month). */
  readonly inputs: Readonly<Record<string, number>>;
  readonly status: InstallationStatus;
  /** Sovereign owner (ownership), a permanent opaque Country id. */
  readonly ownerCountryId: string;
  /** Exploiter (operator), a permanent opaque actor id. */
  readonly operatorId: string;
  /** Effective controller, a permanent opaque actor id (may differ under occupation). */
  readonly controllerId: string;
}

export function validateInstallation(i: ExtractionInstallation): void {
  if (!i || typeof i.id !== 'string' || !i.id.trim()) throw new Error('Installation needs a non-empty id.');
  if (!INSTALLATION_KINDS.includes(i.kind)) throw new Error(`Unknown installation kind: ${String(i.kind)}.`);
  if (typeof i.regionId !== 'string' || !i.regionId.trim()) throw new Error('Installation needs a non-empty permanent Region id.');
  if (typeof i.resourceId !== 'string' || !i.resourceId.trim()) throw new Error('Installation needs a non-empty resource id.');
  if (i.capacityPerMonth !== null && (!isWholeUsd(i.capacityPerMonth) || i.capacityPerMonth <= 0)) {
    throw new Error('Extractable capacity must be a positive whole quantity or null (unavailable).');
  }
  if (!isWholeUsd(i.personnelRequired)) throw new Error('Personnel required must be a non-negative whole number.');
  if (!isWholeUsd(i.maintenancePerMonth)) throw new Error('Maintenance must be a non-negative whole-USD amount.');
  for (const [inputId, quantity] of Object.entries(i.inputs)) {
    if (!inputId.trim()) throw new Error('Installation input needs a non-empty resource id.');
    if (!isWholeUsd(quantity)) throw new Error(`Installation input ${inputId} must be a non-negative whole quantity.`);
  }
  if (!INSTALLATION_STATUSES.includes(i.status)) throw new Error(`Unknown installation status: ${String(i.status)}.`);
  if (typeof i.ownerCountryId !== 'string' || !i.ownerCountryId.trim()) throw new Error('Installation needs a sovereign owner id.');
  if (typeof i.operatorId !== 'string' || !i.operatorId.trim()) throw new Error('Installation needs an operator id.');
  if (typeof i.controllerId !== 'string' || !i.controllerId.trim()) throw new Error('Installation needs a controller id.');
}

/** Admitted extractable output: capacity × months when operating; 0 otherwise. An unavailable capacity yields 0, never a fabricated quantity. */
export function extractCapacity(i: ExtractionInstallation, months = 1): number {
  validateInstallation(i);
  if (!isWholeUsd(months) || months <= 0) throw new Error('Months must be a positive whole number.');
  if (i.status !== 'operating' || i.capacityPerMonth === null) return 0;
  return i.capacityPerMonth * months;
}
