import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { controlledActor, governmentAdvisors, orderedNotifications } from '../leftRail';

type Severity = 'info' | 'advisory' | 'important' | 'urgent';

function stateWith(opts: {
  personId?: string;
  officeTitle?: string;
  isPartyLeader?: boolean;
  withAccess?: boolean;
  portfolios?: Record<string, { name: string; ministerPersonId?: string }>;
  briefings?: Array<{ id: string; severity: Severity; headline: string; createdOn: string; kind: string }>;
}): SimulationState {
  const personId = opts.personId ?? 'p1';
  const countryId = 'c1';
  return {
    governance: {
      player: { controlledPersonId: personId },
      persons: {
        p1: { id: 'p1', displayName: 'Ada Prime', status: 'active', isPartyLeader: opts.isPartyLeader ?? true, office: { countryId, role: 'head_of_government', title: opts.officeTitle ?? 'Chancellor', authorityProfile: { capabilities: opts.withAccess === false ? [] : ['access_government_information'] } } },
        p2: { id: 'p2', displayName: 'Bea Minister', status: 'active', isPartyLeader: false, office: { countryId, role: 'minister', title: 'Minister of Finance', authorityProfile: { capabilities: ['access_government_information'] } } },
      },
      cabinets: { c1: { countryId, portfolios: opts.portfolios ?? { finance: { name: 'Finance', ministerPersonId: 'p2' } } } },
    },
    information: {
      briefings: (opts.briefings ?? []).map(({ kind, ...rest }) => ({ ...rest, fact: { kind }, countryId, access: 'government' as const })),
    },
  } as unknown as SimulationState;
}

describe('left rail (0.33.4)', () => {
  it('derives the controlled actor from the player person', () => {
    const actor = controlledActor(stateWith({}), 'p1');
    expect(actor).toMatchObject({ personId: 'p1', displayName: 'Ada Prime', officeTitle: 'Chancellor', isPartyLeader: true });
    expect(controlledActor(stateWith({}), undefined)).toBeUndefined();
  });

  it('derives advisors from the cabinet, marking vacant portfolios honestly', () => {
    const advisors = governmentAdvisors(stateWith({
      portfolios: {
        finance: { name: 'Finance', ministerPersonId: 'p2' },
        defence: { name: 'Defence' },
      },
    }), 'c1');
    expect(advisors).toEqual([
      { portfolioId: 'defence', portfolioName: 'Defence', ministerPersonId: '', ministerName: 'vacant' },
      { portfolioId: 'finance', portfolioName: 'Finance', ministerPersonId: 'p2', ministerName: 'Bea Minister' },
    ]);
    expect(governmentAdvisors(stateWith({}), undefined)).toEqual([]);
  });

  it('orders notifications by urgency then recency', () => {
    const notifications = orderedNotifications(stateWith({
      briefings: [
        { id: 'b1', severity: 'info', headline: 'Old info', createdOn: '2026-01-05', kind: 'labour_report' },
        { id: 'b2', severity: 'urgent', headline: 'Crisis', createdOn: '2026-01-02', kind: 'crisis_activation' },
        { id: 'b3', severity: 'important', headline: 'Vote', createdOn: '2026-01-10', kind: 'parliamentary_result' },
      ],
    }), 'c1', 'p1');
    expect(notifications.map(item => item.id)).toEqual(['b2', 'b3', 'b1']);
  });

  it('maps briefing kinds to their navigation destination', () => {
    const notifications = orderedNotifications(stateWith({
      briefings: [
        { id: 'b1', severity: 'important', headline: 'crisis', createdOn: '2026-01-01', kind: 'crisis_activation' },
        { id: 'b2', severity: 'important', headline: 'trade', createdOn: '2026-01-01', kind: 'trade_report' },
        { id: 'b3', severity: 'important', headline: 'military', createdOn: '2026-01-01', kind: 'military_report' },
      ],
    }), 'c1', 'p1');
    expect(notifications.map(item => item.destination)).toEqual(['security', 'trade', 'military']);
  });

  it('hides government-only briefings from an office without access', () => {
    const notifications = orderedNotifications(stateWith({
      withAccess: false,
      briefings: [{ id: 'b1', severity: 'urgent', headline: 'secret', createdOn: '2026-01-01', kind: 'crisis_activation' }],
    }), 'c1', 'p1');
    expect(notifications).toEqual([]);
  });
});
