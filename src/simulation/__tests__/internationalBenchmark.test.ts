import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { advanceSimulationDays } from '../engine';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { condemn, imposeExportRestriction } from '../international/runtime';
import { worldBase, worldCountryIds, worldContext, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';
import registry from '../../data/entity-registry.json';

describe('international 0.18 synthetic full-world benchmark', () => {
  it('evaluates bounded synthetic international pairs and restrictions across the real world registry', () => {
    let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    const iso = ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'CHN', 'JPN', 'IND', 'BRA', 'AUS', 'ITA', 'ESP', 'NLD', 'SWE', 'NOR', 'POL', 'TUR', 'SAU', 'KOR', 'MEX', 'ARG'];
    const participants = iso.map(code => registry.countries.find(c => c.externalIds.isoAlpha3 === code)!.id);
    state = createPoliticalPerson(state, { countryId: participants[0], displayName: 'Synthetic international benchmark executive' });
    const person = Object.keys(state.governance.persons).find(id => state.governance.persons[id].countryId === participants[0] && !state.governance.persons[id].office)!;
    state = setControlledPerson(assignPoliticalOffice(state, person, { countryId: participants[0], role: 'head_of_government' }), person);
    for (let i = 1; i < participants.length; i++) {
      state = condemn(state, participants[0], participants[i], person, 'Synthetic benchmark condemnation');
      for (const category of ['food', 'energy', 'raw_materials', 'consumer_goods', 'industrial_goods', 'capital_goods', 'transport_equipment', 'chemicals_pharmaceuticals', 'electronics', 'services', 'unclassified_goods']) {
        state = imposeExportRestriction(state, participants[0], participants[i], person, [category]);
      }
    }
    const started = performance.now();
    const next = advanceSimulationDays(state, 31);
    const elapsed = performance.now() - started;
    expect(Object.keys(next.international.actions).length).toBeLessThanOrEqual(1000);
    expect(Object.keys(next.international.episodes).length).toBeGreaterThan(0);
    expect(assertSimulationInvariants(next, worldContext, 'save')).toBe(true);
    console.info(`INTERNATIONAL_WORLD_BENCHMARK ${JSON.stringify({ countries: 252, regions: 4574, activeActions: Object.keys(next.international.actions).length, evaluatedPairs: Object.keys(next.international.episodes).length, episodes: Object.keys(next.international.episodes).length, monthlyEvaluations: 1, days: 31, elapsedMs: elapsed })}`);
  }, 120000);
});

import { assertSimulationInvariants } from '../invariants';
