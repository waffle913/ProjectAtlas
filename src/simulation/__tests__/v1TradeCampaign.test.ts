import { describe, expect, it } from 'vitest';
import { tradeFixture, tradeMonth, tradeCountries, tradeContext, tradeRegions } from './tradeFixture';
import { imposeExportRestriction, blockedRouteKeysForDate } from '../international/runtime';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';

const [exporter, importer] = [tradeCountries[0], tradeCountries[2]];

describe('0.21 trade + sanctions integrated campaign', () => {
  it('runs a represented flow, sanction, material consequence and deterministic continuation', () => {
    let state = tradeFixture();
    const person = state.governance.player.controlledPersonId!;
    state = tradeMonth(state);
    expect(state.trade.flows.length).toBeGreaterThan(0);
    const beforeKey = `${exporter}|${importer}|food`;
    const beforeFlow = state.trade.flows.filter(f => f.exporterId === exporter && f.importerId === importer && f.category === 'food');
    const beforeQuantity = beforeFlow.reduce((sum, f) => sum + (f.quantity ?? 0), 0);

    state = imposeExportRestriction(state, exporter, importer, person, ['food']);
    state = advanceSimulationDays(state, 1);
    expect(blockedRouteKeysForDate(state, state.date)).toContain(beforeKey);

    for (let m = 0; m < 3; m++) state = tradeMonth(state);
    expect(assertSimulationInvariants(state, tradeContext, 'save')).toBe(true);

    const afterFlow = state.trade.flows.filter(f => f.exporterId === exporter && f.importerId === importer && f.category === 'food');
    const afterQuantity = afterFlow.reduce((sum, f) => sum + (f.quantity ?? 0), 0);
    expect(afterQuantity).toBeLessThanOrEqual(beforeQuantity);
    for (const f of state.trade.flows) expect(f.quantity).toBeGreaterThanOrEqual(0);

    const restored = restoreSimulationState(serializeSimulationState(state, tradeContext), tradeRegions, {}, {}, tradeContext);
    expect(advanceSimulationDays(restored, 30)).toEqual(advanceSimulationDays(state, 30));
  }, 120000);
});
