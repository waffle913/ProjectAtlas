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
});
