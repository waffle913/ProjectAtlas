import { describe, expect, it } from 'vitest';
import { initializeNewGame } from '../initialization';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants } from '../invariants';
import { establishOrganization, proposeTreaty, signTreaty, proposeDecision, voteOnDecision, closeDecision, runMultilateralAI, runMultilateralMonth } from '../multilateral/runtime';
import { assignPoliticalOffice, createPoliticalPerson, setControlledPerson } from '../governance/runtime';
import { admitTradeMarket, admitTradeRoute } from '../trade/runtime';
import { syntheticTradeMarket, SYNTHETIC_TRADE_SOURCE } from '../trade/scenario';
import { admitMilitaryBaseline } from '../military/runtime';
import { imposeExportRestriction, blockedRouteKeysForDate } from '../international/runtime';
import { createClaim } from '../diplomacy';
import { declareLimitedWar } from '../war';
import { deploy, runOperationalAI } from '../operations/runtime';
import { worldBase, worldContext, worldCountryIds, worldInputs, worldPoliticalInputs, worldRegions } from './worldScenario';

const parameters = { monthlySalaryUsd: 1000, recruitmentPerMonth: 10, reductionPerMonth: 5, trainingMonths: 3, instructors: 20, trainingCostPerPersonUsd: 100, technicians: 10, factoryUnitsPerMonth: 10, factoryMaterialPerUnit: 1, logisticsStaff: 5, logisticsPersonsPerStaff: 20, exerciseAmmunitionPerPerson: 1, exerciseFuelPerPerson: 1, desiredEquipment: { personal: 100, truck: 5 }, desiredConsumables: { ammunition: 500, fuel: 500 } };
const syntheticSource = { status: 'modelled' as const, publisher: 'Synthetic V1 sparse stress', url: 'scenario:synthetic-v1-stress', referenceDate: '2026-01-01', retrievedAt: '2026-10-03', licence: 'ProjectAtlas test fixture (ISC)', attribution: 'ProjectAtlas', limitation: 'Entirely synthetic sparse stress fixture.', scenarioFixture: true };

describe('0.21 sparse active multi-system stress', () => {
  it('runs trade + sanction + war + treaty/org at full registry scale over repeated cadences', () => {
    let state = initializeNewGame(worldBase(), worldRegions, worldCountryIds, worldInputs, worldPoliticalInputs);
    const [c1, c2, c3] = [...worldCountryIds].slice(0, 3);
    const targetRegion = worldRegions.find(r => r.parentCountryId === c2)!.id;
    const sourceRegion = worldRegions.find(r => r.parentCountryId === c1)!.id;
    state = createPoliticalPerson(state, { countryId: c1, displayName: 'Synthetic stress executive' });
    const person = Object.keys(state.governance.persons).find(id => state.governance.persons[id].countryId === c1)!;
    state = setControlledPerson(assignPoliticalOffice(state, person, { countryId: c1, role: 'head_of_government' }), person);

    // active represented trade
    state = admitTradeMarket(state, c1, syntheticTradeMarket('food', { productionPerMonth: 120, domesticNeedPerMonth: 20, importNeedPerMonth: 0, strategicUse: 'stress food', domesticReplacementCapacity: 0, domesticReplacementPerMonth: 0, priceMicroUsd: 10000000000, baselinePriceMicroUsd: 10000000000 }));
    state = admitTradeMarket(state, c2, syntheticTradeMarket('food', { productionPerMonth: 0, domesticNeedPerMonth: 0, importNeedPerMonth: 80, strategicUse: 'stress food', domesticReplacementCapacity: 30, domesticReplacementPerMonth: 3, priceMicroUsd: 10000000000, baselinePriceMicroUsd: 10000000000 }));
    state = admitTradeRoute(state, { id: 'route.stress:food', exporterId: c1, importerId: c2, category: 'food', source: { ...SYNTHETIC_TRADE_SOURCE }, capacityPerMonth: 100, establishedCapacity: 60, expansionPerMonth: 10, logisticsBps: 250, tariffBps: 500 });

    // sanction/restriction
    state = imposeExportRestriction(state, c1, c2, person, ['energy']);

    // military/war activity
    for (const countryId of [c1, c2]) {
      state = admitMilitaryBaseline(state, { countryId, source: syntheticSource, parameters, authorized: 60, present: 30, trainees: 0, equipment: { personal: { operational: 60, unavailable: 0, maintenance: 0, reserve: 0 }, truck: { operational: 10, unavailable: 0, maintenance: 0, reserve: 0 } }, consumables: { ammunition: { quantity: 800, capacity: 10000 }, fuel: { quantity: 800, capacity: 10000 } }, industrialMaterials: 1000 });
    }
    state = createClaim(state, { id: 'claim.stress', claimantCountryId: c1, regionId: targetRegion, type: 'territorial', creationDate: state.date, reason: 'Synthetic stress war.' }, worldContext);
    state = declareLimitedWar(state, { warId: 'war.stress', attackerCountryId: c1, defenderCountryId: c2, targetRegionId: targetRegion, casusBelliId: `claim-derived:claim.stress:${c2}` }, worldContext);
    state = deploy(state, { countryId: c1, personId: person, warId: 'war.stress', sourceRegionId: sourceRegion, currentRegionId: sourceRegion, personnel: 1, equipment: { personal: 1 } });

    // treaty/organization activity
    state = establishOrganization(state, person, { title: 'Synthetic stress body', votingRule: { kind: 'majority', quorumBps: 4000 } });
    const orgId = state.multilateral.organizationOrder[0];
    state = proposeTreaty(state, person, { title: 'Synthetic stress treaty', parties: [c1, c2, c3], clauses: [{ kind: 'non_aggression', partyAId: c1, partyBId: c2 }], entryIntoForce: { kind: 'signature', requiredRatifications: 3 }, withdrawal: { noticeDays: 30 } });
    state = signTreaty(state, state.multilateral.treatyOrder[0], person);
    state = proposeDecision(state, orgId, person, { kind: 'condemnation', targetCountryId: c3, reason: 'Synthetic stress condemnation.' });
    state = voteOnDecision(state, state.multilateral.decisionOrder[0], person, 'yes');

    const started = performance.now();
    let monthly = 0;
    for (let day = 0; day < 90; day++) {
      state = runMultilateralAI(runOperationalAI(advanceSimulationDays(state, 1)));
      if (state.date.endsWith('-01')) {
        state = closeDecision(state, state.multilateral.decisionOrder[0]);
        state = runMultilateralMonth(state);
        expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
        monthly += 1;
      }
    }
    const elapsed = performance.now() - started;
    expect(monthly).toBeGreaterThanOrEqual(3);
    expect(state.information.briefings.length).toBeLessThanOrEqual(2048);
    expect(state.trade.flows.length).toBeGreaterThan(0);
    expect(blockedRouteKeysForDate(state, state.date)).toContain(`${c1}|${c2}|energy`);
    expect(state.wars.some(w => w.id === 'war.stress')).toBe(true);
    expect(Object.keys(state.multilateral.treaties)).toHaveLength(1);
    expect(Object.keys(state.multilateral.organizations)).toHaveLength(1);
    expect(Object.values(state.international.actions).some(a => a.kind === 'export_restriction')).toBe(true);
    console.info(`V1_SPARSE_STRESS ${JSON.stringify({ days: 90, monthly, countries: 3, tradeFlows: state.trade.flows.length, wars: state.wars.length, deployments: Object.keys(state.operations.deployments).length, treaties: 1, orgs: 1, decisions: Object.keys(state.multilateral.decisions).length, restrictions: Object.values(state.international.actions).filter(a => a.kind !== 'condemnation').length, briefings: state.information.briefings.length, elapsedMs: Math.round(elapsed) })}`);
  }, 600000);
});
