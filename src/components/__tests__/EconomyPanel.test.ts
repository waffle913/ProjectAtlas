import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SimulationState } from '../../types';
import { EconomyPanel } from '../EconomyPanel';

function stateWith(personId: string, countryId: string, withAccess: boolean): SimulationState {
  return {
    governance: {
      persons: {
        [personId]: {
          id: personId,
          status: 'active',
          office: { countryId, role: 'head_of_government', authorityProfile: { capabilities: withAccess ? ['access_government_information'] : [] } },
        },
      },
    },
    socioeconomy: { regions: {} },
    regionOwnership: {},
    fiscal: { countries: {} },
    trade: { flows: [], countries: {} },
    assets: { assets: {} },
    date: '2026-01-01',
  } as unknown as SimulationState;
}

describe('EconomyPanel', () => {
  it('hides the derived economy view from an office without government-information access', () => {
    const markup = renderToStaticMarkup(createElement(EconomyPanel, { state: stateWith('p1', 'c1', false), countryId: 'c1', personId: 'p1' }));
    expect(markup).toContain('not available to an opposition person');
    expect(markup).not.toContain('Provenance');
  });

  it('renders the authority-gated derived economy view with honest provenance', () => {
    const markup = renderToStaticMarkup(createElement(EconomyPanel, { state: stateWith('p1', 'c1', true), countryId: 'c1', personId: 'p1' }));
    expect(markup).toContain('Provenance: derived');
    expect(markup).toContain('Trade position');
  });
});
