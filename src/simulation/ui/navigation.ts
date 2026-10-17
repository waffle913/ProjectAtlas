/**
 * 0.33.2–0.33.5 — Interface V1: navigation shell (map, domain bar, left rail, tablet).
 *
 * Pure navigation contract (docs/interface-0.33.md). The map layers, the domain
 * bar, the left rail (advisors/actors/notifications) and the right Tablet are
 * named with their visibility rules. A layer or section is only shown when its
 * information is available (`unavailable != 0` — never rendered as an empty
 * screen). No `SimulationState` integration, no schema/migration, no scheduler.
 */

export const MAP_LAYERS = Object.freeze(['economy', 'politics', 'resources', 'trade', 'logistics', 'military'] as const);
export type MapLayer = typeof MAP_LAYERS[number];

export const UI_DOMAINS = Object.freeze(['politics', 'economy', 'finances', 'services', 'security', 'defence', 'diplomacy', 'trade'] as const);
export type UIDomain = typeof UI_DOMAINS[number];

export const LEFT_RAIL_STATES = Object.freeze(['normal', 'hover', 'selected', 'notification', 'important', 'urgent', 'unavailable'] as const);
export type LeftRailState = typeof LEFT_RAIL_STATES[number];

export const TABLET_SECTIONS = Object.freeze(['news', 'statements', 'messages', 'private_briefings', 'reports', 'history'] as const);
export type TabletSection = typeof TABLET_SECTIONS[number];

/** A map layer is viewable only when its information is available. */
export function canViewMapLayer(layer: MapLayer, available: boolean): boolean {
  if (!MAP_LAYERS.includes(layer)) throw new Error(`Unknown map layer: ${String(layer)}.`);
  return available === true;
}

/** The Tablet separates public journal/news from office-gated private briefings/reports. */
export function isPrivateTabletSection(section: TabletSection): boolean {
  if (!TABLET_SECTIONS.includes(section)) throw new Error(`Unknown tablet section: ${String(section)}.`);
  return section === 'private_briefings' || section === 'reports' || section === 'messages';
}
