// Left-rail (0.33.4) data model: controlled actor, government advisors, and
// urgency-ordered notifications, all derived from canonical state. Pure functions
// only — they never mutate state and never fabricate actors/advisors that do not
// exist.

import type { SimulationState } from '../types';
import { inspectBriefings } from '../simulation/information/runtime';

export type RailDestination = 'fiscal' | 'economy' | 'politics' | 'services' | 'security' | 'operations' | 'treaties' | 'diplomacy' | 'military' | 'trade';

export interface RailActor {
  personId: string;
  displayName: string;
  officeTitle: string | null;
  isPartyLeader: boolean;
}

export interface RailAdvisor {
  portfolioId: string;
  portfolioName: string;
  ministerPersonId: string;
  ministerName: string;
}

export interface RailNotification {
  id: string;
  severity: 'info' | 'advisory' | 'important' | 'urgent';
  headline: string;
  createdOn: string;
  destination: RailDestination;
}

const SEVERITY_ORDER: Record<RailNotification['severity'], number> = { urgent: 0, important: 1, advisory: 2, info: 3 };

function briefingDestination(fact: { kind: string }): RailDestination {
  switch (fact.kind) {
    case 'crisis_activation': return 'security';
    case 'labour_report': return 'economy';
    case 'parliamentary_result': return 'politics';
    case 'military_report': return 'military';
    case 'trade_report': return 'trade';
    default: return 'politics';
  }
}

/** The controlled person, if any — the single actor the player actually controls. */
export function controlledActor(state: SimulationState, personId: string | undefined): RailActor | undefined {
  if (!personId) return undefined;
  const person = state.governance.persons[personId];
  if (!person) return undefined;
  return {
    personId,
    displayName: person.displayName,
    officeTitle: person.office?.title ?? person.office?.role ?? null,
    isPartyLeader: person.isPartyLeader,
  };
}

/** Cabinet ministers of the controlled country — the advisors that produce briefings. */
export function governmentAdvisors(state: SimulationState, countryId: string | undefined): RailAdvisor[] {
  if (!countryId) return [];
  const cabinet = state.governance.cabinets?.[countryId];
  if (!cabinet) return [];
  return Object.entries(cabinet.portfolios)
    .map(([portfolioId, portfolio]) => ({
      portfolioId,
      portfolioName: portfolio.name,
      ministerPersonId: portfolio.ministerPersonId ?? '',
      ministerName: portfolio.ministerPersonId ? (state.governance.persons[portfolio.ministerPersonId]?.displayName ?? 'unavailable') : 'vacant',
    }))
    .sort((a, b) => a.portfolioName.localeCompare(b.portfolioName));
}

/** Briefings the office can see, ordered by severity (urgent first) then newest first. */
export function orderedNotifications(state: SimulationState, countryId: string, personId: string): RailNotification[] {
  return inspectBriefings(state, countryId, personId)
    .map(briefing => ({
      id: briefing.id,
      severity: briefing.severity,
      headline: briefing.headline,
      createdOn: briefing.createdOn,
      destination: briefingDestination(briefing.fact),
    }))
    .sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || b.createdOn.localeCompare(a.createdOn));
}
