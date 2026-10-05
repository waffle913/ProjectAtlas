import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyOperations } from '../operations/model';
import { initializeOperations } from '../operations/runtime';
import { emptyInternational } from '../international/model';
import { initializeInternational } from '../international/runtime';
import { emptyTrade } from '../trade/model';
import { initializeTrade } from '../trade/runtime';
import { emptyMilitary } from '../military/model';
import { initializeMilitary, admitMilitaryBaseline } from '../military/runtime';
import type { MilitaryParameters } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { initializeFiscal, scheduleFiscalReform } from '../fiscal/runtime';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { emptyInformation } from '../information/model';
import { initializeInformationState } from '../information/runtime';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { emptyMultilateral } from '../multilateral/model';
import { initializeMultilateral, proposeTreaty, signTreaty, establishOrganization, joinOrganization, proposeDecision, voteOnDecision, closeDecision, runMultilateralMonth, runMultilateralAI } from '../multilateral/runtime';
import { createClaim } from '../diplomacy';
import { declareLimitedWar, endWar } from '../war';
import { deploy, supplyDeployment, orderMovement, runOperationalAI } from '../operations/runtime';
import { createEngineState } from '../state';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants, validateFidelityConservation } from '../invariants';
import { requestFidelityTransition } from '../fidelity';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { imposeExportRestriction, liftSanction } from '../international/runtime';

const A = 'country.synth-a', B = 'country.synth-b';
const regionA = 'region.synth-a', regionB = 'region.synth-b';
const regions: RegionEntity[] = [A, B].map((id, i) => ({ id: i === 0 ? regionA : regionB, parentCountryId: id, initialOwnerCountryId: id, commonName: `Synthetic Region ${i}`, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'synthetic-test', sourceFeatureIds: [String(i)] } }));
const context = { regions, countryIds: new Set([A, B]), regionIds: new Set([regionA, regionB]) };
const parameters: MilitaryParameters = { monthlySalaryUsd: 1000, recruitmentPerMonth: 10, reductionPerMonth: 5, trainingMonths: 3, instructors: 20, trainingCostPerPersonUsd: 100, technicians: 10, factoryUnitsPerMonth: 10, factoryMaterialPerUnit: 1, logisticsStaff: 5, logisticsPersonsPerStaff: 20, exerciseAmmunitionPerPerson: 1, exerciseFuelPerPerson: 1, desiredEquipment: { personal: 100, truck: 5 }, desiredConsumables: { ammunition: 500, fuel: 500 } };
const source = { status: 'modelled' as const, publisher: 'Synthetic V1 campaign', url: 'scenario:synthetic-v1-campaign', referenceDate: '2026-01-01', retrievedAt: '2026-10-03', licence: 'ProjectAtlas test fixture (ISC)', attribution: 'ProjectAtlas', limitation: 'Entirely synthetic campaign fixture.', scenarioFixture: true };

function fixture(): SimulationState {
  let state: SimulationState = {
    schemaVersion: 18, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
    territoryOwnership: {}, regionOwnership: { [regionA]: A, [regionB]: B },
    populationByRegion: { [regionA]: 10000, [regionB]: 10000 }, economicOutputByRegion: { [regionA]: 1200000000, [regionB]: 1200000000 },
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState([A, B]),
  };
  state = initializeInformationState(initializeFiscal(initializeSocioeconomy(state, regions)));
  state = initializeMilitary(state);
  state = initializeTrade(state);
  state = initializeInternational(state);
  state = initializeOperations(state);
  state = initializeMultilateral(state);
  for (const countryId of [A, B]) {
    state = admitMilitaryBaseline(state, { countryId, source, parameters, authorized: 100, present: 50, trainees: 0, equipment: { personal: { operational: 100, unavailable: 0, maintenance: 0, reserve: 0 }, truck: { operational: 10, unavailable: 0, maintenance: 0, reserve: 0 } }, consumables: { ammunition: { quantity: 1000, capacity: 10000 }, fuel: { quantity: 1000, capacity: 10000 } }, industrialMaterials: 1000 });
  }
  state = createPoliticalPerson(state, { countryId: A, displayName: 'Synthetic executive' });
  const person = Object.keys(state.governance.persons)[0];
  state = setControlledPerson(assignPoliticalOffice(state, person, { countryId: A, role: 'head_of_government' }), person);
  state = scheduleFiscalReform(state, { countryId: A, effectiveDate: state.date, annualBudget: { ...state.fiscal.countries[A].annualBudget, defense: 12000000 } });
  return state;
}
const person = (state: SimulationState) => state.governance.player.controlledPersonId!;

describe('0.21 integrated campaigns', () => {
  it('A: fiscal reform -> household -> crisis -> information chain over multiple months', () => {
    let state = fixture();
    const before = structuredClone(state);
    for (let month = 0; month < 4; month++) state = advanceSimulationDays(state, month === 0 ? 31 : 30);
    expect(assertSimulationInvariants(state, context, 'save')).toBe(true);
    expect(state.fiscal.countries[A].account).toBeDefined();
    expect(state.socioeconomy.regions[regionA].economy).toBeDefined();
    expect(state.fiscal.countries[A].account!.defense).toBeDefined();
    const restored = restoreSimulationState(serializeSimulationState(state, context), regions, {}, {}, context);
    expect(advanceSimulationDays(restored, 30)).toEqual(advanceSimulationDays(state, 30));
    expect(state).not.toEqual(before);
  }, 120000);

  it('C: full limited-war chain and post-war monthly stability', () => {
    let state = fixture();
    state = createClaim(state, { id: 'claim.war', claimantCountryId: A, regionId: regionB, type: 'territorial', creationDate: state.date, reason: 'Synthetic war campaign.' }, context);
    state = declareLimitedWar(state, { warId: 'war.campaign', attackerCountryId: A, defenderCountryId: B, targetRegionId: regionB, casusBelliId: `claim-derived:claim.war:${B}` }, context);
    state = deploy(state, { countryId: A, personId: person(state), warId: 'war.campaign', sourceRegionId: regionA, currentRegionId: regionA, personnel: 40, equipment: { personal: 40, truck: 5 } });
    const depId = state.operations.deploymentOrder[0];
    state = supplyDeployment(state, depId, person(state), 40, 20);
    state = runOperationalAI(state);
    for (let month = 0; month < 4; month++) state = advanceSimulationDays(state, 30);
    expect(assertSimulationInvariants(state, context, 'save')).toBe(true);
    // post-war: end with white peace and continue monthly processing
    state = endWar(state, 'war.campaign', 'white_peace', context);
    const sovereignty = state.regionOwnership[regionB];
    for (let month = 0; month < 3; month++) state = advanceSimulationDays(state, 30);
    expect(state.regionOwnership[regionB]).toBe(sovereignty);
    expect(assertSimulationInvariants(state, context, 'save')).toBe(true);
  }, 120000);

  it('D: treaty non-aggression obligation violated by a qualifying war', () => {
    let state = fixture();
    state = proposeTreaty(state, person(state), { title: 'Synthetic non-aggression', parties: [A, B], clauses: [{ kind: 'non_aggression', partyAId: A, partyBId: B }], entryIntoForce: { kind: 'signature', requiredRatifications: 2 }, withdrawal: { noticeDays: 30 } });
    const treatyId = state.multilateral.treatyOrder[0];
    state = signTreaty(state, treatyId, person(state));
    state = runMultilateralAI(state);
    expect(state.multilateral.treaties[treatyId].status).toBe('active');
    state = createClaim(state, { id: 'claim.d', claimantCountryId: A, regionId: regionB, type: 'territorial', creationDate: state.date, reason: 'Synthetic.' }, context);
    state = declareLimitedWar(state, { warId: 'war.d', attackerCountryId: A, defenderCountryId: B, targetRegionId: regionB, casusBelliId: `claim-derived:claim.d:${B}` }, context);
    state = runMultilateralMonth(state);
    expect(Object.values(state.multilateral.violations).some(v => v.kind === 'non_aggression' && v.violatingCountryId === A && v.violatedAgainstCountryId === B)).toBe(true);
    const restored = restoreSimulationState(serializeSimulationState(state, context), regions, {}, {}, context);
    expect(restored.multilateral.violations).toEqual(state.multilateral.violations);
  }, 120000);

  it('E: fidelity transitions conserve canonical quantities', () => {
    let state = fixture();
    state = advanceSimulationDays(state, 60);
    const before = structuredClone(state);
    state = requestFidelityTransition(state, A, 'Background', new Set([A, B]), 'synthetic');
    const afterTransition = advanceSimulationDays(state, 1);
    expect(validateFidelityConservation(before, afterTransition)).toEqual([]);
    state = requestFidelityTransition(afterTransition, A, 'Detailed', new Set([A, B]), 'synthetic');
    const back = advanceSimulationDays(state, 1);
    expect(back.socioeconomy.regions[regionA].population).toBe(before.socioeconomy.regions[regionA].population);
    expect(back.fiscal.countries[A].debt).toBe(before.fiscal.countries[A].debt);
  }, 120000);

  it('F: Path A/B continuation equivalence for a war state', () => {
    const setup = () => {
      let state = fixture();
      state = createClaim(state, { id: 'claim.f', claimantCountryId: A, regionId: regionB, type: 'territorial', creationDate: state.date, reason: 'Synthetic.' }, context);
      return declareLimitedWar(state, { warId: 'war.f', attackerCountryId: A, defenderCountryId: B, targetRegionId: regionB, casusBelliId: `claim-derived:claim.f:${B}` }, context);
    };
    const pathA = advanceSimulationDays(advanceSimulationDays(setup(), 30), 30);
    const mid = advanceSimulationDays(setup(), 30);
    const pathB = advanceSimulationDays(restoreSimulationState(serializeSimulationState(mid, context), regions, {}, {}, context), 30);
    expect(pathB.engine.tick).toBe(pathA.engine.tick);
    expect(pathB.regionOwnership).toEqual(pathA.regionOwnership);
    expect(pathB.fiscal.countries[A].debt).toBe(pathA.fiscal.countries[A].debt);
    expect(pathB.operations.deployments).toEqual(pathA.operations.deployments);
  }, 120000);
});
