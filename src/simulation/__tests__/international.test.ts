import { describe, expect, it } from 'vitest';
import { tradeFixture, tradeMonth, tradeCountries, tradeContext, tradeRegions } from './tradeFixture';
import { assertSimulationInvariants } from '../invariants';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson, revokePoliticalOffice } from '../governance/runtime';
import { createClaim, renounceClaim } from '../diplomacy';
import { advanceSimulationDays } from '../engine';
import { restoreSimulationState } from '../save';
import { simulationDelta } from '../world';
import {
  condemn, hasInternationalAuthority, imposeExportRestriction, imposeImportRestriction, initializeInternational,
  inspectInternationalAssessments, liftSanction, publicInternationalActions, sanctionBlocksRoute,
} from '../international/runtime';
import { INTERNATIONAL_MODEL } from '../international/model';

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
    expect(sanctionBlocksRoute(state, route, '2026-01-02')).toBe(true);
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
    const monthly = tradeMonth(state);
    const person = monthly.governance.player.controlledPersonId!;
    expect(inspectInternationalAssessments(monthly, tradeCountries[0], person)).toBeDefined();
    expect(inspectInternationalAssessments(revokePoliticalOffice(monthly, person), tradeCountries[0], person)).toBeUndefined();
    const later = advanceSimulationDays(monthly, 1);
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
  it('distinguishes declaration from prospective effective date for same-day sanctions', () => {
    const before = tradeMonth(intlFixture());
    let state = imposeExportRestriction(before, tradeCountries[0], tradeCountries[2], before.governance.player.controlledPersonId!, ['food']);
    const action = state.international.actions[state.international.actionOrder.at(-1)!];
    expect(action.declaredOn).toBe(before.date);
    expect(action.effectiveOn.localeCompare(action.declaredOn)).toBeGreaterThan(0);
    const route = state.trade.routes.find(r => r.exporterId === tradeCountries[0] && r.importerId === tradeCountries[2] && r.category === 'food')!;
    expect(sanctionBlocksRoute(state, route, action.declaredOn)).toBe(false);
    expect(sanctionBlocksRoute(state, route, action.effectiveOn)).toBe(true);
  });
  it('does not let duplicate restrictions or repeated condemnations manufacture unlimited pressure', () => {
    let state = intlFixture();
    const person = state.governance.player.controlledPersonId!;
    state = imposeExportRestriction(state, tradeCountries[0], tradeCountries[2], person, ['food']);
    expect(() => imposeExportRestriction(state, tradeCountries[0], tradeCountries[2], person, ['food'])).toThrow();
    state = condemn(state, tradeCountries[0], tradeCountries[2], person, 'One');
    state = condemn(state, tradeCountries[0], tradeCountries[2], person, 'Two');
    state = tradeMonth(state);
    expect(assertSimulationInvariants(state, tradeContext, 'save')).toBe(true);
    const episode = Object.values(state.international.episodes).find(e => e.countryAId === tradeCountries[0] && e.countryBId === tradeCountries[2]);
    const sanctionDrivers = episode?.drivers.filter(d => d.kind === 'sanction') ?? [];
    expect(sanctionDrivers.length).toBeLessThanOrEqual(1);
    expect(episode?.pressure).toBeLessThanOrEqual(INTERNATIONAL_MODEL.maximumPressure);
  });
  it('lets claim-only episodes recover and resolve after renunciation', () => {
    let state = intlFixture();
    const claimId = 'claim.intl.recover';
    state = createClaim(state, { id: claimId, claimantCountryId: tradeCountries[0], regionId: Object.keys(state.regionOwnership).find(id => state.regionOwnership[id] === tradeCountries[2])!, type: 'territorial', creationDate: state.date }, tradeContext);
    state = tradeMonth(state);
    expect(Object.values(state.international.episodes).some(e => e.pressure > 0)).toBe(true);
    state = renounceClaim(state, claimId);
    for (let i = 0; i < 6; i++) state = tradeMonth(state);
    const episode = Object.values(state.international.episodes).find(e => e.countryAId === tradeCountries[0] && e.countryBId === tradeCountries[2]);
    expect(episode?.phase).toBe('NORMAL');
  });
  it('reports international changes in simulation delta', () => {
    const before = intlFixture();
    const after = condemn(before, tradeCountries[0], tradeCountries[2], before.governance.player.controlledPersonId!, 'Delta condemnation');
    expect(simulationDelta(before, after).changedDomains).toContain('international');
    expect(simulationDelta(before, before).changedDomains).not.toContain('international');
  });
  it('uses prospective cessation so same-day lifts preserve historical flows', () => {
    let state = intlFixture();
    const person = state.governance.player.controlledPersonId!;
    state = imposeExportRestriction(state, tradeCountries[0], tradeCountries[2], person, ['food']);
    const active = tradeMonth(state);
    const action = active.international.actions[active.international.actionOrder.at(-1)!];
    expect(action.ceasesOn).toBeUndefined();
    const lifted = liftSanction(active, action.id, person);
    const liftedAction = lifted.international.actions[action.id];
    expect(liftedAction.liftDeclaredOn).toBe(lifted.date);
    expect(liftedAction.ceasesOn!.localeCompare(liftedAction.liftDeclaredOn!)).toBeGreaterThan(0);
    const route = lifted.trade.routes.find(r => r.exporterId === tradeCountries[0] && r.importerId === tradeCountries[2] && r.category === 'food')!;
    expect(sanctionBlocksRoute(lifted, route, lifted.date)).toBe(true);
    expect(sanctionBlocksRoute(lifted, route, liftedAction.ceasesOn!)).toBe(false);
    expect(assertSimulationInvariants(lifted, tradeContext, 'save')).toBe(true);
  });
  it('validates booked flows against their own historical date, not current state', () => {
    const booked = tradeMonth(intlFixture());
    let state = imposeExportRestriction(booked, tradeCountries[0], tradeCountries[2], booked.governance.player.controlledPersonId!, ['food']);
    state = advanceSimulationDays(state, 1);
    expect(assertSimulationInvariants(state, tradeContext, 'save')).toBe(true);
  });
  it('never prunes active restrictions under historical retention pressure', () => {
    let state = intlFixture();
    const person = state.governance.player.controlledPersonId!;
    state = imposeExportRestriction(state, tradeCountries[0], tradeCountries[2], person, ['food']);
    const actionId = state.international.actionOrder.at(-1)!;
    for (let i = 0; i < 120; i++) state = condemn(state, tradeCountries[0], tradeCountries[2], person, `Historical ${i}`);
    expect(state.international.actions[actionId]).toBeDefined();
    expect(Object.values(state.international.actions).filter(a => a.kind === 'condemnation').length).toBeLessThanOrEqual(64);
    expect(assertSimulationInvariants(state, tradeContext, 'save')).toBe(true);
  });
  it('retains a lifted restriction through its ceasesOn boundary', () => {
    let state = intlFixture();
    const person = state.governance.player.controlledPersonId!;
    state = imposeExportRestriction(state, tradeCountries[0], tradeCountries[2], person, ['food']);
    state = tradeMonth(state);
    const action = state.international.actions[state.international.actionOrder.at(-1)!];
    state = liftSanction(state, action.id, person);
    state = condemn(state, tradeCountries[0], tradeCountries[2], person, 'Added after lift');
    expect(state.international.actions[action.id]).toBeDefined();
    expect(assertSimulationInvariants(state, tradeContext, 'save')).toBe(true);
  });
  it('rejects forged international episode pressure, severity and drivers', () => {
    let state = tradeMonth(intlFixture());
    state = condemn(state, tradeCountries[0], tradeCountries[2], state.governance.player.controlledPersonId!, 'Pressure');
    state = tradeMonth(state);
    const pairKey = Object.keys(state.international.episodes).find(key => key.includes(tradeCountries[0]) && key.includes(tradeCountries[2]))!;
    const corrupt = structuredClone(state);
    corrupt.international.episodes[pairKey].pressure = 999;
    expect(() => assertSimulationInvariants(corrupt, tradeContext, 'save')).toThrow();
    const dup = structuredClone(state);
    dup.international.episodes[pairKey].drivers.push(structuredClone(dup.international.episodes[pairKey].drivers[0]));
    expect(() => assertSimulationInvariants(dup, tradeContext, 'save')).toThrow();
  });
});
