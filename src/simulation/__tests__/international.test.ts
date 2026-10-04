import { describe, expect, it } from 'vitest';
import { tradeFixture, tradeMonth, tradeCountries, tradeContext, tradeRegions } from './tradeFixture';
import { assertSimulationInvariants } from '../invariants';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson, revokePoliticalOffice } from '../governance/runtime';
import { createClaim } from '../diplomacy';
import { advanceSimulationDays } from '../engine';
import { restoreSimulationState } from '../save';
import {
  condemn, hasInternationalAuthority, imposeExportRestriction, imposeImportRestriction, initializeInternational,
  inspectInternationalAssessments, liftSanction, publicInternationalActions, sanctionBlocksRoute,
} from '../international/runtime';

const intlFixture = () => initializeInternational(tradeFixture());

function controlAs(state: ReturnType<typeof intlFixture>, countryId: string) {
  const next = createPoliticalPerson(state, { countryId, displayName: 'International executive' });
  const person = Object.keys(next.governance.persons).find(id =>
    next.governance.persons[id].countryId === countryId && !next.governance.persons[id].office)!;
  return setControlledPerson(assignPoliticalOffice(next, person, { countryId, role: 'head_of_government' }), person);
}

describe('0.18 international tensions, crises and sanctions', () => {
  it('requires a resolved executive office rather than Country selection or party leadership', () => {
    const state = intlFixture();
    const person = createPoliticalPerson(state, { countryId: tradeCountries[2], displayName: 'No office' });
    const noOfficeId = Object.keys(person.governance.persons).find(id => person.governance.persons[id].countryId === tradeCountries[2] && !person.governance.persons[id].office)!;
    const controlled = setControlledPerson(person, noOfficeId);
    expect(hasInternationalAuthority(controlled, tradeCountries[2], noOfficeId)).toBe(false);
    expect(() => imposeExportRestriction(controlled, tradeCountries[2], tradeCountries[0], noOfficeId, ['food'])).toThrow();
    const executive = controlAs(state, tradeCountries[2]);
    const executiveId = executive.governance.player.controlledPersonId!;
    expect(hasInternationalAuthority(executive, tradeCountries[2], executiveId)).toBe(true);
  });

  it('blocks only the sanctioned direction/category and preserves routes and prior flows', () => {
    const before = tradeMonth(intlFixture());
    const prior = before.trade.flows.filter(f => f.exporterId === tradeCountries[0] && f.importerId === tradeCountries[2]);
    expect(prior.length).toBeGreaterThan(0);
    let state = intlFixture();
    state = imposeExportRestriction(state, tradeCountries[0], tradeCountries[2], state.governance.player.controlledPersonId!, ['food']);
    expect(state.trade.routes.length).toBe(intlFixture().trade.routes.length);
    const route = state.trade.routes.find(r => r.exporterId === tradeCountries[0] && r.importerId === tradeCountries[2] && r.category === 'food')!;
    expect(sanctionBlocksRoute(state, route)).toBe(true);
    const after = tradeMonth(state);
    expect(after.trade.flows.some(f => f.exporterId === tradeCountries[0] && f.importerId === tradeCountries[2] && f.category === 'food')).toBe(false);
    expect(after.trade.flows.some(f => f.exporterId === tradeCountries[1] && f.importerId === tradeCountries[2] && f.category === 'food')).toBe(true);
    expect(after.trade.routes.some(r => r.id === route.id)).toBe(true);
    expect(assertSimulationInvariants(after, tradeContext, 'save')).toBe(true);
  });

  it('import restriction blocks the importer->exporter direction and lifting restores eligibility', () => {
    let state = controlAs(intlFixture(), tradeCountries[2]);
    const person = state.governance.player.controlledPersonId!;
    state = imposeImportRestriction(state, tradeCountries[2], tradeCountries[0], person, ['food']);
    const actionId = state.international.actionOrder[0];
    const blocked = tradeMonth(state);
    expect(blocked.trade.flows.some(f => f.exporterId === tradeCountries[0] && f.importerId === tradeCountries[2] && f.category === 'food')).toBe(false);
    const lifted = tradeMonth(liftSanction(blocked, actionId, person));
    expect(lifted.international.actions[actionId].status).toBe('lifted');
    expect(lifted.trade.flows.some(f => f.exporterId === tradeCountries[0] && f.importerId === tradeCountries[2] && f.category === 'food')).toBe(true);
    expect(assertSimulationInvariants(lifted, tradeContext, 'save')).toBe(true);
  });

  it('derives persistent pressure from claims and condemnation without declaring war', () => {
    let state = intlFixture();
    const claimState = createClaim(state, { id: 'claim.intl.real', claimantCountryId: tradeCountries[0], regionId: Object.keys(state.regionOwnership).find(id => state.regionOwnership[id] === tradeCountries[2])!, type: 'territorial', creationDate: state.date }, tradeContext);
    let next = condemn(claimState, tradeCountries[0], tradeCountries[2], state.governance.player.controlledPersonId!, 'Represented official condemnation');
    next = tradeMonth(next);
    const episode = Object.values(next.international.episodes).find(e => e.countryAId === tradeCountries[0] && e.countryBId === tradeCountries[2]);
    expect(episode?.pressure).toBeGreaterThan(0);
    expect(next.wars).toEqual(intlFixture().wars);
    expect(next.regionOwnership).toEqual(intlFixture().regionOwnership);
    expect(assertSimulationInvariants(next, tradeContext, 'save')).toBe(true);
  });

  it('keeps public actions visible and internal assessments office-gated and stale-safe', () => {
    let state = intlFixture();
    state = condemn(state, tradeCountries[0], tradeCountries[2], state.governance.player.controlledPersonId!, 'Public condemnation');
    const publicActions = publicInternationalActions(state, tradeCountries[0]);
    expect(publicActions.some(action => action.kind === 'condemnation')).toBe(true);
    const person = state.governance.player.controlledPersonId!;
    expect(inspectInternationalAssessments(state, tradeCountries[0], person)).toBeDefined();
    expect(inspectInternationalAssessments(revokePoliticalOffice(state, person), tradeCountries[0], person)).toBeUndefined();
    const later = advanceSimulationDays(tradeMonth(state), 1);
    const assessment = inspectInternationalAssessments(later, tradeCountries[0], person)?.[0];
    expect(assessment?.stale).toBe(true);
  });
  it('migrates schema 15 to schema 16 without replaying trade history', () => {
    const state = tradeMonth(intlFixture());
    const saved = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    saved.schemaVersion = 15;
    delete saved.international;
    const restored = restoreSimulationState(JSON.stringify(saved), tradeRegions, {}, {}, tradeContext);
    expect(restored.schemaVersion).toBe(16);
    expect(restored.international.version).toBe('international-0.18-v1');
    expect(restored.international.initializedOn).toBe(restored.date);
    expect(restored.trade).toEqual(state.trade);
    expect(assertSimulationInvariants(restored, tradeContext, 'reload')).toBe(true);
  });
});
