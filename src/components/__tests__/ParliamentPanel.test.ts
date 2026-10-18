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
    governance: { persons: { [PERSON]: person }, player: { controlledPersonId: PERSON }, cabinets: {} },
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
    expect(markup).toContain('requires active leadership of a registered party');
    expect(markup).not.toContain('Issue / change whip instruction');
  });

  it('does not expose confidential estimate data in the party whip view', () => {
    const markup = renderToStaticMarkup(createElement(ParliamentPanel, { state: partyLeaderState(), countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).not.toContain('Government Information estimate');
    expect(markup).not.toContain('confidence');
  });
});
