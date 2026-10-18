import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SimulationState } from '../../types';
import { OperationsPanel } from '../OperationsPanel';

const COUNTRY = 'country.a';
const PERSON = 'person.a';

function person(access: boolean, commandMilitary: boolean) {
  return {
    id: PERSON,
    status: 'active',
    countryId: COUNTRY,
    office: {
      countryId: COUNTRY,
      role: 'head_of_government',
      authorityProfile: { capabilities: [...(access ? ['access_government_information'] : []), ...(commandMilitary ? ['command_military_operations'] : [])] },
    },
  };
}

function stateWith(overrides: Record<string, unknown> = {}): SimulationState {
  return {
    operations: { deployments: {}, engagements: {}, regionControl: {}, adjacency: {}, components: {}, componentOrder: [], deploymentOrder: [], engagementOrder: [] },
    military: { countries: { [COUNTRY]: { capability: { assignments: { 'region.own': 100 } } } } },
    governance: { persons: { [PERSON]: person(true, true) }, player: { controlledPersonId: PERSON } },
    information: {},
    wars: [],
    regionOwnership: { 'region.own': COUNTRY, 'region.foreign': 'country.b' },
    date: '2026-01-01',
    ...overrides,
  } as unknown as SimulationState;
}

describe('OperationsPanel', () => {
  it('does not render foreign Region effective-control from canonical engine reality', () => {
    const state = stateWith({ operations: { deployments: {}, engagements: {}, regionControl: { 'region.foreign': 'foreign_controlled' }, adjacency: {}, components: {}, componentOrder: [], deploymentOrder: [], engagementOrder: [] } });
    const markup = renderToStaticMarkup(createElement(OperationsPanel, { state, countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).not.toContain('foreign_controlled');
    expect(markup).not.toContain('Foreign-controlled');
    expect(markup).toContain('No contested control is recorded');
  });

  it('renders a friendly deployment by Region name, not its opaque deployment id', () => {
    const state = stateWith({
      operations: { deployments: { 'deployment.00000001': { id: 'deployment.00000001', countryId: COUNTRY, currentRegionId: 'region.own', personnel: 100, supply: { ammunition: 0, fuel: 0 }, status: 'deployed', losses: { personnel: 0, equipment: {} }, sourceRegionId: 'region.own' } }, engagements: {}, regionControl: {}, adjacency: {}, components: {}, componentOrder: [], deploymentOrder: ['deployment.00000001'], engagementOrder: [] },
    });
    const regionsById = new Map([['region.own', { commonName: 'Test Province' }]]);
    const markup = renderToStaticMarkup(createElement(OperationsPanel, { state, countryId: COUNTRY, personId: PERSON, onStateChange: () => {}, regionsById }));
    expect(markup).toContain('Test Province');
    expect(markup).not.toContain('deployment.00000001');
  });

  it('refuses commands when the person lacks military-command authority', () => {
    const state = stateWith({ governance: { persons: { [PERSON]: person(true, false) }, player: { controlledPersonId: PERSON } } });
    const markup = renderToStaticMarkup(createElement(OperationsPanel, { state, countryId: COUNTRY, personId: PERSON, onStateChange: () => {} }));
    expect(markup).toContain('lacks resolved executive operational authority');
    expect(markup).not.toContain('Deploy force');
  });
});
