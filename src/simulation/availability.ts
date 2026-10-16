/**
 * Shared availability taxonomy for pure service/production primitives.
 *
 * A material metric is only ever asserted on a *known* basis. When a required
 * datum is unavailable, the result must be typed `unavailable` and must never
 * fabricate a zero, an infinite capacity, or a shortage (`unavailable != 0`).
 *
 * - `computed`    — a real computation happened; delivered/backlog are meaningful.
 * - `unavailable` — a required datum (capacity, stock) is unknown; no material
 *                   metric is asserted.
 * - `paused`      — the establishment/sector is not operating for a known
 *                   non-capacity reason; not a capacity shortage.
 * - `known_zero`  — a value is documented zero (e.g. zero demand), distinct from
 *                   an unavailable datum.
 */

export const AVAILABILITY_STATUSES = Object.freeze(['computed', 'unavailable', 'paused', 'known_zero'] as const);
export type AvailabilityStatus = typeof AVAILABILITY_STATUSES[number];
