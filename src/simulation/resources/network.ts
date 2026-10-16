/**
 * 0.27.6 — Resources/energy V1: networks and accessibility.
 *
 * Pure energy-network contract (docs/resources-0.27.md). A network is a set of
 * directed links between permanent Regions with a capacity and availability.
 * Delivery is bounded by link capacity and availability, and no energy flows
 * without a connection. No new canonical state, no scheduler, no RNG, no
 * migration.
 *
 * Contract:
 * - no flow without a connection: a requested delivery without any link is
 *   curtailed entirely, never fabricated;
 * - delivered <= requested and delivered <= available path capacity; the
 *   shortfall is the bottleneck (curtailment);
 * - `null` capacity is unavailable, never a fabricated zero.
 */

import { isWholeUsd } from '../finance/settlement';
import { INSTALLATION_STATUSES, type InstallationStatus } from './installation';

export interface NetworkLink {
  readonly id: string;
  readonly fromRegionId: string;
  readonly toRegionId: string;
  /** Admitted link capacity (MWh/month); null = unavailable. */
  readonly capacityMwhPerMonth: number | null;
  /** Availability (0–10,000 bps); outages reduce delivered energy. */
  readonly availabilityBps: number;
  readonly status: InstallationStatus;
}

export function validateNetworkLink(l: NetworkLink): void {
  if (!l || typeof l.id !== 'string' || !l.id.trim()) throw new Error('Network link needs a non-empty id.');
  if (typeof l.fromRegionId !== 'string' || !l.fromRegionId.trim()) throw new Error('Network link needs a non-empty source Region id.');
  if (typeof l.toRegionId !== 'string' || !l.toRegionId.trim()) throw new Error('Network link needs a non-empty target Region id.');
  if (l.fromRegionId === l.toRegionId) throw new Error('A network link needs distinct source and target Regions.');
  if (l.capacityMwhPerMonth !== null && (!isWholeUsd(l.capacityMwhPerMonth) || l.capacityMwhPerMonth <= 0)) {
    throw new Error('Link capacity must be a positive whole MWh/month or null (unavailable).');
  }
  if (!Number.isInteger(l.availabilityBps) || l.availabilityBps < 0 || l.availabilityBps > 10000) throw new Error('availabilityBps must be an integer in [0, 10000].');
  if (!INSTALLATION_STATUSES.includes(l.status)) throw new Error(`Unknown link status: ${String(l.status)}.`);
}

/** Deliverable capacity of one link over `months`, bounded by capacity and availability; 0 when not operating. */
export function linkCapacity(l: NetworkLink, months = 1): number {
  validateNetworkLink(l);
  if (!isWholeUsd(months) || months <= 0) throw new Error('Months must be a positive whole number.');
  if (l.status !== 'operating' || l.capacityMwhPerMonth === null) return 0;
  return Math.floor((l.capacityMwhPerMonth * l.availabilityBps * months) / 10000);
}

export interface DeliveryResult {
  readonly delivered: number;
  readonly curtailed: number;
  readonly pathIds: string[];
}

/** Deliver energy from a source to a target Region along direct links, bounded by path capacity. */
export function deliverEnergy(links: readonly NetworkLink[], sourceId: string, targetId: string, requestedMwh: number, months = 1): DeliveryResult {
  if (!isWholeUsd(requestedMwh)) throw new Error('Requested MWh must be a non-negative whole number.');
  if (!isWholeUsd(months) || months <= 0) throw new Error('Months must be a positive whole number.');
  for (const l of links) validateNetworkLink(l);
  const path = links.filter((l) => l.fromRegionId === sourceId && l.toRegionId === targetId);
  const totalCapacity = path.reduce((sum, l) => sum + linkCapacity(l, months), 0);
  const delivered = Math.min(requestedMwh, totalCapacity);
  return { delivered, curtailed: requestedMwh - delivered, pathIds: path.map((l) => l.id) };
}
