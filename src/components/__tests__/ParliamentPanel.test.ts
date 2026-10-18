import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SimulationState } from '../../types';
import { ParliamentPanel } from '../ParliamentPanel';

const COUNTRY = 'country.a';
const PERSON = 'person.a';

function stateWith(role: string | undefined): SimulationState {
  const person = {
    id: PERSON, status: 'active', countryId: COUNTRY, displayName: 'Executive', createdOn: '2026-01-01', isPartyLeader: false,
    office: role ? { countryId: COUNTRY, role, authorityProfile: { capabilities: [] } } : undefined,
  };
  return {
    governance: { persons: { [PERSON]: person }, player: { controlledPersonId: PERSON }, cabinets: {}, proposals: {} },
    date: '2026-01-01',
  } as unknown as SimulationState;
}

function partyLeaderState(officeRole?: string): SimulationState {
  const person = {
    id: PERSON, status: 'active', countryId: COUNTRY, displayName: 'Leader', createdOn: '2026-01-01', isPartyLeader: true, partyId: 'party.a',
    office: officeRole ? { countryId: COUNTRY, role: officeRole, authorityProfile: { capabilities: [] } } : undefined,
  };
  const proposal = { id: 'prop.1', kind: 'fiscal_reform', status: 'submitted', countryId: COUNTRY, effectiveDate: '2026-02-01' };
  return {
    governance: { persons: { [PERSON]: person }, player: { controlledPersonId: PERSON }, cabinets: {}, proposals: { 'prop.1': proposal } },
    date: '2026-01-01',
  } as unknown as SimulationState;
}

/** A party leader with a resolved proposal that carries a recorded whip instruction. */
function resolvedWhipState(): SimulationState {
  const person = {
    id: PERSON, status: 'active', countryId: COUNTRY, displayName: 'Leader', createdOn: '2026-01-01', isPartyLeader: true, partyId: 'party.a',
  };
  const proposal = {
    id: 'prop.enacted', kind: 'fiscal_reform', status: 'enacted', countryId: COUNTRY, effectiveDate: '2026-02-01', createdOn: '2026-01-01', resolvedOn: '2026-01-15',
    whipInstructions: [{ on: '2026-01-10', proposalId: 'prop.enacted', byPersonId: PERSON, partyId: 'party.a', instruction: 'yes' }],
    voteResult: { outcome: 'adopted', resolvedOn: '2026-01-15' },
  };
  return {
    governance: { persons: { [PERSON]: person }, player: { controlledPersonId: PERSON }, cabinets: {}, proposals: { 'prop.enacted': proposal } },
    date: '2026-01-16',
  } as unknown as SimulationState;
}

describe('ParliamentPanel', () => {
  it('offers the executive governing actions to the head of government', () => {
    const markup = renderToStaticMarkup(createElement(ParliamentPanel, { state: stateWith('head_of_government'), countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).toContain('Dissolve parliament');
    expect(markup).toContain('Appoint a minister');
  });

  it('refuses governing actions to a non-executive person', () => {
    const markup = renderToStaticMarkup(createElement(ParliamentPanel, { state: stateWith('legislator'), countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).toContain('Government actions require the executive head');
    expect(markup).not.toContain('Dissolve parliament');
  });

  it('offers the party whip to an eligible opposition party leader without an office', () => {
    const markup = renderToStaticMarkup(createElement(ParliamentPanel, { state: partyLeaderState(), countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).toContain('Party whip');
    expect(markup).toContain('Issue / change whip instruction');
    expect(markup).toContain('Fiscal reform proposal');
  });

  it('refuses the party whip to a person who is not a party leader', () => {
    const markup = renderToStaticMarkup(createElement(ParliamentPanel, { state: stateWith('legislator'), countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).toContain('require active leadership of a registered party');
    expect(markup).not.toContain('Issue / change whip instruction');
  });

  it('does not expose confidential estimate data in the party whip view', () => {
    const markup = renderToStaticMarkup(createElement(ParliamentPanel, { state: partyLeaderState(), countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).not.toContain('Government Information estimate');
    expect(markup).not.toContain('confidence');
  });

  it('shows a read-only history of issued whip instructions for resolved proposals', () => {
    const markup = renderToStaticMarkup(createElement(ParliamentPanel, { state: resolvedWhipState(), countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).toContain('Issued instructions');
    expect(markup).toContain('Fiscal reform proposal · effective 2026-02-01');
    expect(markup).toContain('your party');
    expect(markup).toContain('YES — vote in favour');
    expect(markup).toContain('issued 2026-01-10');
    expect(markup).toContain('Enacted');
    expect(markup).toContain('outcome: adopted on 2026-01-15');
    // Resolved proposals are read-only: no instruction control is offered for them.
    expect(markup).not.toContain('Issue / change whip instruction');
  });

  it('never renders hidden seat estimates or internal distributions in the whip history', () => {
    const state = resolvedWhipState();
    const proposal = state.governance.proposals['prop.enacted'] as unknown as Record<string, unknown>;
    proposal.voteResult = {
      ...(proposal.voteResult as object),
      yesSeats: 120, noSeats: 80,
      chambers: [{ chamberId: 'chamber.a', yesSeats: 120, partyEvaluations: [{ partyId: 'party.a', internalDistribution: { agreementMeanBps: 6_000, yesBps: 6_000 } }] }],
    };
    const markup = renderToStaticMarkup(createElement(ParliamentPanel, { state, countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).toContain('outcome: adopted');
    expect(markup).not.toContain('yesSeats');
    expect(markup).not.toContain('chamber.a');
    expect(markup).not.toContain('agreementMeanBps');
    expect(markup).not.toContain('internalDistribution');
  });
});
