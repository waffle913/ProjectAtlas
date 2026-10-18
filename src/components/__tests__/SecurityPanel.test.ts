import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SimulationState } from '../../types';
import { SecurityPanel } from '../SecurityPanel';

const COUNTRY = 'country.a';
const PERSON = 'person.a';

function stateWith(office: { role: string } | undefined): SimulationState {
  return {
    governance: {
      persons: { [PERSON]: { id: PERSON, status: 'active', countryId: COUNTRY, office: office ? { countryId: COUNTRY, role: office.role, authorityProfile: { capabilities: [] } } : undefined } },
      player: { controlledPersonId: PERSON },
    },
    constitution: { countries: { [COUNTRY]: { emergency: { status: 'none', justificationEpisodeIds: [], restrictions: { assembliesBanned: false, strikesBanned: false, policePowersEnhanced: false, bordersClosed: false }, ministerialRecommendations: [] } } } },
    date: '2026-01-01',
  } as unknown as SimulationState;
}

describe('SecurityPanel', () => {
  it('offers the emergency declaration only to the executive head', () => {
    const markup = renderToStaticMarkup(createElement(SecurityPanel, { state: stateWith({ role: 'head_of_government' }), countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).toContain('Declare state of emergency');
  });

  it('refuses emergency powers to a non-executive person', () => {
    const markup = renderToStaticMarkup(createElement(SecurityPanel, { state: stateWith({ role: 'legislator' }), countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).toContain('Only the executive head may declare');
    expect(markup).not.toContain('Declare state of emergency');
  });
});
