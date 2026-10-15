/**
 * 0.27.5 — Resources/energy V1: energy production.
 *
 * Pure energy-plant contract (docs/resources-0.27.md). A plant converts a fuel
 * (thermal/nuclear) or a renewable flow (hydro/wind/solar) into electricity,
 * with an explicit conversion efficiency and — for renewables — an
 * intermittency/availability loss. No new canonical state, no scheduler, no
 * RNG, no migration.
 *
 * Contract:
 * - electricity never comes from nothing: for a fuelled plant the electricity
 *   output is bounded by the fuel's energy content times the efficiency; for a
 *   renewable plant the output is bounded by capacity and availability;
 * - output requires operating status and an admitted capacity; `null` capacity
 *   is unavailable, never a fabricated zero;
 * - water/other input dependence is represented when documented, not invented.
 */

import { isWholeUsd } from '../finance/settlement';
import { INSTALLATION_STATUSES, type InstallationStatus } from './installation';

export const ENERGY_PLANT_KINDS = Object.freeze(['thermal', 'hydro', 'wind', 'solar', 'nuclear', 'other'] as const);
export type EnergyPlantKind = typeof ENERGY_PLANT_KINDS[number];

export interface EnergyPlant {
  readonly id: string;
  readonly kind: EnergyPlantKind;
  /** Permanent opaque Region id the plant is anchored to. */
  readonly regionId: string;
  /** Admitted electricity capacity (MWh / month); null = unavailable. */
  readonly capacityMwhPerMonth: number | null;
  /** Fuel resource id for thermal/nuclear; null for renewables. */
  readonly fuelInputId: string | null;
  /** Fuel→electricity conversion efficiency in bps (10,000 bps = 100%). */
  readonly efficiencyBps: number;
  /** Availability loss for intermittent sources (0–10,000 bps); 0 for dispatchable plants. */
  readonly intermittencyBps: number;
  readonly maintenancePerMonth: number;
  readonly status: InstallationStatus;
}

const FUELED: ReadonlySet<EnergyPlantKind> = new Set(['thermal', 'nuclear']);

export function validateEnergyPlant(p: EnergyPlant): void {
  if (!p || typeof p.id !== 'string' || !p.id.trim()) throw new Error('Energy plant needs a non-empty id.');
  if (!ENERGY_PLANT_KINDS.includes(p.kind)) throw new Error(`Unknown energy plant kind: ${String(p.kind)}.`);
  if (typeof p.regionId !== 'string' || !p.regionId.trim()) throw new Error('Energy plant needs a non-empty permanent Region id.');
  if (p.capacityMwhPerMonth !== null && (!isWholeUsd(p.capacityMwhPerMonth) || p.capacityMwhPerMonth <= 0)) {
    throw new Error('Energy capacity must be a positive whole MWh/month or null (unavailable).');
  }
  if (FUELED.has(p.kind) && (typeof p.fuelInputId !== 'string' || !p.fuelInputId.trim())) {
    throw new Error(`A ${p.kind} plant needs a non-empty fuel input id.`);
  }
  if (!FUELED.has(p.kind) && p.fuelInputId !== null) throw new Error(`A ${p.kind} plant must not declare a fuel input.`);
  if (!Number.isInteger(p.efficiencyBps) || p.efficiencyBps <= 0 || p.efficiencyBps > 10000) throw new Error('efficiencyBps must be an integer in (0, 10000].');
  if (!Number.isInteger(p.intermittencyBps) || p.intermittencyBps < 0 || p.intermittencyBps > 10000) throw new Error('intermittencyBps must be an integer in [0, 10000].');
  if (!isWholeUsd(p.maintenancePerMonth)) throw new Error('Maintenance must be a non-negative whole-USD amount.');
  if (!INSTALLATION_STATUSES.includes(p.status)) throw new Error(`Unknown plant status: ${String(p.status)}.`);
}

/** Electricity output (MWh) over `months`, bounded by capacity and availability; 0 when not operating. */
export function energyOutput(p: EnergyPlant, months = 1): number {
  validateEnergyPlant(p);
  if (!isWholeUsd(months) || months <= 0) throw new Error('Months must be a positive whole number.');
  if (p.status !== 'operating' || p.capacityMwhPerMonth === null) return 0;
  const availabilityBps = 10000 - p.intermittencyBps;
  return Math.floor((p.capacityMwhPerMonth * availabilityBps * months) / 10000);
}

/** Fuel (aggregate quantity) required to produce `outputMwh`, derived from the efficiency; renewables need none. */
export function fuelRequired(p: EnergyPlant, outputMwh: number): number {
  validateEnergyPlant(p);
  if (!isWholeUsd(outputMwh)) throw new Error('Output MWh must be a non-negative whole number.');
  if (!FUELED.has(p.kind)) return 0;
  if (outputMwh === 0) return 0;
  return Math.ceil((outputMwh * 10000) / p.efficiencyBps);
}
