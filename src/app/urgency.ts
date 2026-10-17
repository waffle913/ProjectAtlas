// Urgency / interruption policy for the 0.33 interface. Only briefings that are
// actually visible to the controlled office (authority-gated via the information
// runtime) may trigger an interruption; severity `urgent` is the sole grave-event
// trigger, so ordinary briefings never pause the simulation.

import type { SimulationState } from '../types';
import { inspectBriefings } from '../simulation/information/runtime';

/** Ids of urgent briefings the controlled office can actually see. */
export function visibleUrgentBriefingIds(state: SimulationState, countryId: string, personId: string): string[] {
  return inspectBriefings(state, countryId, personId)
    .filter(briefing => briefing.severity === 'urgent')
    .map(briefing => briefing.id);
}

/** Number of urgent briefings that appeared in `after` but were not visible in `before`. */
export function newUrgentBriefingCount(before: SimulationState, after: SimulationState, countryId: string, personId: string): number {
  const beforeIds = new Set(visibleUrgentBriefingIds(before, countryId, personId));
  return visibleUrgentBriefingIds(after, countryId, personId).filter(id => !beforeIds.has(id)).length;
}
