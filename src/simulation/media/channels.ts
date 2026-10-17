/**
 * 0.32.2 — Media V2: media and information channels.
 *
 * Pure media-channel contract (docs/media-0.32.md). A channel relays existing
 * information to an audience — it never creates information from an interface.
 * Diffusion is gated by the layer-access grant (0.32.1) and bounded by the
 * channel's reach; an unknown reach is `unavailable`, never a fabricated zero.
 * No `SimulationState` integration, no schema/migration, no scheduler, no RNG.
 */

import type { AvailabilityStatus } from '../availability';
import { canPropagate, type AccessBasis, type InformationLayer } from './contract';

export const CHANNEL_KINDS = Object.freeze(['news', 'statement', 'social', 'broadcast'] as const);
export type ChannelKind = typeof CHANNEL_KINDS[number];

/** Canonical owners of channel resources — no second audience/opinion store. */
export const CHANNEL_OWNERS = Object.freeze({
  audience: 'politics.opinion', // 0.13 opinion (audience = cohorts/regions)
  resources: 'finance',         // channel operation costs (deferred)
  sources: 'information',       // 0.15 government info / 0.32.1 items
} as const);

export interface MediaChannel {
  readonly id: string;
  readonly kind: ChannelKind;
  /** Aggregated audience reach in basis points (0..10000); null = unavailable. */
  readonly reachBps: number | null;
  /** Cadence the channel publishes on (e.g. 'weekly'). */
  readonly schedule: string;
  /** Where the channel gets its content (an existing information source). */
  readonly sourceId: string;
  readonly note: string;
}

export function validateMediaChannel(c: MediaChannel): void {
  if (!c || typeof c.id !== 'string' || !c.id.trim()) throw new Error('Media channel needs a non-empty id.');
  if (!CHANNEL_KINDS.includes(c.kind)) throw new Error(`Unknown channel kind: ${String(c.kind)}.`);
  if (c.reachBps !== null && (!Number.isSafeInteger(c.reachBps) || c.reachBps < 0 || c.reachBps > 10000)) throw new Error('reachBps must be a whole number between 0 and 10000 or null.');
  if (typeof c.schedule !== 'string' || !c.schedule.trim()) throw new Error('Media channel needs a non-empty schedule.');
  if (typeof c.sourceId !== 'string' || !c.sourceId.trim()) throw new Error('Media channel needs a non-empty source id.');
  if (typeof c.note !== 'string' || !c.note.trim()) throw new Error('Media channel needs a note.');
}

export interface DiffusionResult {
  readonly status: AvailabilityStatus;
  /** Effective reach; null when not asserted (unavailable/paused). */
  readonly reachBps: number | null;
}

/**
 * Diffuse an existing item through a channel. The channel never creates
 * information: it relays an item only when the layer-access grant allows the
 * propagation, and its reach is bounded and availability-typed.
 */
export function diffuse(channel: MediaChannel, fromLayer: InformationLayer, toLayer: InformationLayer, access: AccessBasis): DiffusionResult {
  validateMediaChannel(channel);
  if (!canPropagate(fromLayer, toLayer, access)) return { status: 'unavailable', reachBps: null };
  if (channel.reachBps === null) return { status: 'unavailable', reachBps: null };
  return { status: 'computed', reachBps: channel.reachBps };
}
