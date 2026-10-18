import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SimulationState } from '../../types';
import { DiplomacyPanel } from '../DiplomacyPanel';

const COUNTRY = 'country.a';
const TARGET = 'country.b';
const PERSON = 'person.a';

function governance(withAccess: boolean) {
  return {
    persons: {
      [PERSON]: {
        id: PERSON, status: 'active', countryId: COUNTRY,
        office: { countryId: COUNTRY, role: 'head_of_government', authorityProfile: { capabilities: withAccess ? ['access_government_information'] : [] } },
      },
    },
    player: { controlledPersonId: PERSON },
  };
}

function stateWith(overrides: Record<string, unknown> = {}): SimulationState {
  return {
    governance: governance(true),
    international: { actions: {}, actionOrder: [], nextActionSequence: 0 },
    wars: [],
    date: '2026-01-01',
    ...overrides,
  } as unknown as SimulationState;
}

describe('DiplomacyPanel', () => {
  it('renders recorded actions by Country name, not opaque id', () => {
    const state = stateWith({
      international: {
        actions: { 'action.1': { id: 'action.1', actorCountryId: COUNTRY, targetCountryId: TARGET, kind: 'condemnation', categories: [], declaredOn: '2026-01-02', effectiveOn: '2026-01-03', status: 'active', declaredByPersonId: PERSON, provenance: 'modelled', limitation: '' } },
        actionOrder: ['action.1'], nextActionSequence: 1,
      },
    });
    const countriesById = new Map([[COUNTRY, { commonName: 'Atlantis' }], [TARGET, { commonName: 'Brigadoon' }]]);
    const markup = renderToStaticMarkup(createElement(DiplomacyPanel, { state, countryId: COUNTRY, personId: PERSON, onStateChange: () => {}, countriesById }));
    expect(markup).toContain('Atlantis');
    expect(markup).toContain('Brigadoon');
    expect(markup).toContain('Atlantis → Brigadoon');
  });

  it('refuses commands without resolved executive diplomatic authority', () => {
    const state = stateWith({ governance: governance(false) });
    const markup = renderToStaticMarkup(createElement(DiplomacyPanel, { state, countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).toContain('lacks resolved executive diplomatic authority');
    expect(markup).not.toContain('Record decision');
  });
});
