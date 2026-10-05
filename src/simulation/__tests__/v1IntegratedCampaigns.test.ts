import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyOperations } from '../operations/model';
import { initializeOperations, recomputeControl, runOperationalAI, supplyDeployment, orderMovement } from '../operations/runtime';
import { emptyInternational } from '../international/model';
import { initializeInternational } from '../international/runtime';
import { emptyTrade } from '../trade/model';
import { initializeTrade } from '../trade/runtime';
import { emptyMilitary } from '../military/model';
import { initializeMilitary, admitMilitaryBaseline } from '../military/runtime';
import type { MilitaryParameters } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { initializeFiscal, scheduleFiscalReform, runFiscalMonth } from '../fiscal/runtime';
import { emptyCrisis, initializeCrisisState } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { initializePolitics } from '../politics/initialization';
import { emptyGovernance } from '../governance/model';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { emptyInformation } from '../information/model';
import { initializeInformationState } from '../information/runtime';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { emptyMultilateral } from '../multilateral/model';
import { initializeMultilateral, proposeTreaty, signTreaty, establishOrganization, proposeDecision, voteOnDecision, closeDecision, runMultilateralAI, runMultilateralMonth, withdrawFromOrganization } from '../multilateral/runtime';
import { createClaim } from '../diplomacy';
import { declareLimitedWar, endWar, isWarGoalSatisfied, occupyRegion } from '../war';
import { deploy } from '../operations/runtime';
import { createEngineState } from '../state';
import { advanceSimulationDays } from '../engine';
import { assertSimulationInvariants, validateFidelityConservation } from '../invariants';
import { requestFidelityTransition } from '../fidelity';
import { restoreSimulationState, serializeSimulationState } from '../save';

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
  state = { ...state, crisis: initializeCrisisState(state.crisis, [A, B], state.date), politics: initializePolitics(state, [A, B], regions) };
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
const assigned = (state: SimulationState, countryId: string) => Object.values(state.military.countries[countryId].capability?.assignments ?? {}).reduce((s, a) => s + a, 0);
const operational = (state: SimulationState, countryId: string) => Object.values(state.military.countries[countryId].capability?.equipment ?? {}).reduce((s, e) => s + (e?.operational ?? 0), 0);
const makeDangerous = (state: SimulationState) => {
  state = runFiscalMonth({ ...state, date: '2026-02-01' });
  const country = state.fiscal.countries[A], account = country.account!;
  const output = state.socioeconomy.regions[regionA].economy!.output;
  account.stress.unpaidCommitments = Math.max(1, account.totalRevenue * 2);
  account.interestPaid = Math.max(1, Math.floor(account.totalRevenue * 0.3));
  country.debt = output * 18;
  account.totalSpending = account.totalRevenue + Math.floor(output * 0.2);
  return state;
};

describe('0.21 integrated campaigns', () => {
  it('A: fiscal reform -> fiscal stress -> crisis pressure -> opinion over months', () => {
    let state = makeDangerous(fixture());
    const baseline = structuredClone(state);
    for (let month = 0; month < 4; month++) state = advanceSimulationDays(state, month === 0 ? 31 : 30);
    expect(assertSimulationInvariants(state, context, 'save')).toBe(true);
    expect(state.crisis.countries[A].currentByType['fiscal_stress'].currentPressure).toBeGreaterThan(baseline.crisis.countries[A].currentByType['fiscal_stress'].currentPressure);
    expect(state.politics.regionalOpinion[regionA].cohorts).not.toEqual(baseline.politics.regionalOpinion[regionA].cohorts);
    expect(state.socioeconomy.regions[regionA].economy).toBeDefined();
    const restored = restoreSimulationState(serializeSimulationState(state, context), regions, {}, {}, context);
    expect(advanceSimulationDays(restored, 30)).toEqual(advanceSimulationDays(state, 30));
  }, 120000);

  it('C: war -> casualties/destruction -> control/occupation -> settlement -> post-war survival', () => {
    let state = fixture();
    const personnelBefore = { [A]: assigned(state, A), [B]: assigned(state, B) };
    const equipmentBefore = { [A]: operational(state, A), [B]: operational(state, B) };
    state = createClaim(state, { id: 'claim.war', claimantCountryId: A, regionId: regionB, type: 'territorial', creationDate: state.date, reason: 'Synthetic war campaign.' }, context);
    state = declareLimitedWar(state, { warId: 'war.campaign', attackerCountryId: A, defenderCountryId: B, targetRegionId: regionB, casusBelliId: `claim-derived:claim.war:${B}` }, context);
    state = deploy(state, { countryId: A, personId: person(state), warId: 'war.campaign', sourceRegionId: regionA, currentRegionId: regionA, personnel: 40, equipment: { personal: 40, truck: 5 } });
    const depId = state.operations.deploymentOrder[0];
    state = { ...state, operations: { ...state.operations, adjacency: { ...state.operations.adjacency, [regionA]: [regionB], [regionB]: [regionA] } } };
    state = supplyDeployment(state, depId, person(state), 40, 40);
    state = orderMovement(state, depId, person(state), regionB);
    state = runOperationalAI(state);
    for (let month = 0; month < 3; month++) state = advanceSimulationDays(state, 30);
    expect(assertSimulationInvariants(state, context, 'save')).toBe(true);
    const casualties = Object.values(state.operations.deployments).reduce<number>((s, d) => s + d.losses.personnel, 0);
    const destroyed = Object.values(state.operations.deployments).reduce<number>((s, d) => s + Object.values(d.losses.equipment).reduce<number>((x, e) => x + (e ?? 0), 0), 0);
    expect(casualties).toBeGreaterThan(0);
    expect(destroyed).toBeGreaterThan(0);
    // establish genuine effective control over the target (decisive components -> attacker), then occupation
    const components = { ...state.operations.components };
    for (const [id, c] of Object.entries(components)) if (c.regionId === regionB && c.kind === 'decisive') components[id] = { ...c, controllingCountryId: A, captureProgress: 0, contested: false };
    state = { ...state, operations: { ...state.operations, components } };
    state = recomputeControl(state, [regionB]);
    expect(isWarGoalSatisfied(state, 'war.campaign')).toBe(true);
    state = endWar(state, 'war.campaign', 'attacker_victory', context);
    expect(state.regionOwnership[regionB]).toBe(A);
    const personnelAfterSettlement = { [A]: assigned(state, A), [B]: assigned(state, B) };
    const equipmentAfterSettlement = { [A]: operational(state, A), [B]: operational(state, B) };
    expect(personnelAfterSettlement[A] + personnelAfterSettlement[B]).toBeLessThanOrEqual(personnelBefore[A] + personnelBefore[B]);
    expect(equipmentAfterSettlement[A] + equipmentAfterSettlement[B]).toBeLessThanOrEqual(equipmentBefore[A] + equipmentBefore[B]);
    for (let month = 0; month < 3; month++) state = advanceSimulationDays(state, 30);
    expect(assertSimulationInvariants(state, context, 'save')).toBe(true);
    expect(state.regionOwnership[regionB]).toBe(A);
    expect(assigned(state, A) + assigned(state, B)).toBeLessThanOrEqual(personnelBefore[A] + personnelBefore[B]);
    expect(operational(state, A) + operational(state, B)).toBeLessThanOrEqual(equipmentBefore[A] + equipmentBefore[B]);
  }, 120000);

  it('D: organization membership -> vote -> adopted decision effect -> withdrawal', () => {
    let state = fixture();
    state = establishOrganization(state, person(state), { title: 'Synthetic body', votingRule: { kind: 'majority', quorumBps: 4000 } });
    const orgId = state.multilateral.organizationOrder[0];
    state = proposeDecision(state, orgId, person(state), { kind: 'condemnation', targetCountryId: B, reason: 'Synthetic condemnation.' });
    const decisionId = state.multilateral.decisionOrder[0];
    state = voteOnDecision(state, decisionId, person(state), 'yes');
    state = closeDecision(state, decisionId);
    const adopted = state.multilateral.decisions[decisionId];
    expect(adopted.status).toBe('adopted');
    expect(adopted.appliedEffectIds.length).toBeGreaterThan(0);
    expect(Object.values(state.international.actions).some(a => a.kind === 'condemnation' && a.targetCountryId === B)).toBe(true);
    state = withdrawFromOrganization(state, orgId, person(state));
    expect(state.multilateral.organizations[orgId].members[A]).toBeUndefined();
    const restored = restoreSimulationState(serializeSimulationState(state, context), regions, {}, {}, context);
    expect(restored.multilateral.organizations[orgId].members).toEqual(state.multilateral.organizations[orgId].members);
    expect(restored.multilateral.decisions[decisionId]).toEqual(state.multilateral.decisions[decisionId]);
  }, 120000);

  it('E: fidelity transitions conserve complex mutable state', () => {
    let state = fixture();
    state = makeDangerous(state);
    state = establishOrganization(state, person(state), { title: 'Synthetic fidelity body', votingRule: { kind: 'majority' } });
    state = proposeTreaty(state, person(state), { title: 'Synthetic fidelity treaty', parties: [A, B], clauses: [{ kind: 'non_aggression', partyAId: A, partyBId: B }], entryIntoForce: { kind: 'signature', requiredRatifications: 2 }, withdrawal: { noticeDays: 30 } });
    state = signTreaty(state, state.multilateral.treatyOrder[0], person(state));
    state = advanceSimulationDays(state, 30);
    const before = structuredClone(state);
    state = requestFidelityTransition(state, A, 'Background', new Set([A, B]), 'synthetic');
    const afterTransition = advanceSimulationDays(state, 1);
    expect(validateFidelityConservation(before, afterTransition)).toEqual([]);
    state = requestFidelityTransition(afterTransition, A, 'Detailed', new Set([A, B]), 'synthetic');
    const back = advanceSimulationDays(state, 1);
    expect(back.socioeconomy.regions[regionA].population).toBe(before.socioeconomy.regions[regionA].population);
    expect(back.fiscal.countries[A].debt).toBe(before.fiscal.countries[A].debt);
    expect(operational(back, A)).toBe(operational(before, A));
    expect(back.military.countries[A].capability?.consumables.ammunition?.quantity).toBe(before.military.countries[A].capability?.consumables.ammunition?.quantity);
    expect(back.regionOwnership).toEqual(before.regionOwnership);
    expect(back.multilateral.treaties).toEqual(before.multilateral.treaties);
    expect(back.multilateral.organizations).toEqual(before.multilateral.organizations);
  }, 120000);

  it('F: Path A/B continuation equivalence across war, treaty and trade state', () => {
    const setup = () => {
      let state = fixture();
      state = proposeTreaty(state, person(state), { title: 'Synthetic continuation treaty', parties: [A, B], clauses: [{ kind: 'non_aggression', partyAId: A, partyBId: B }], entryIntoForce: { kind: 'signature', requiredRatifications: 2 }, withdrawal: { noticeDays: 30 } });
      state = signTreaty(state, state.multilateral.treatyOrder[0], person(state));
      state = createClaim(state, { id: 'claim.f', claimantCountryId: A, regionId: regionB, type: 'territorial', creationDate: state.date, reason: 'Synthetic.' }, context);
      return declareLimitedWar(state, { warId: 'war.f', attackerCountryId: A, defenderCountryId: B, targetRegionId: regionB, casusBelliId: `claim-derived:claim.f:${B}` }, context);
    };
    const pathA = advanceSimulationDays(advanceSimulationDays(setup(), 30), 30);
    const mid = advanceSimulationDays(setup(), 30);
    const pathB = advanceSimulationDays(restoreSimulationState(serializeSimulationState(mid, context), regions, {}, {}, context), 30);
    expect(pathB.engine.tick).toBe(pathA.engine.tick);
    expect(pathB.regionOwnership).toEqual(pathA.regionOwnership);
    expect(pathB.occupationByRegion).toEqual(pathA.occupationByRegion);
    expect(pathB.fiscal.countries[A].debt).toBe(pathA.fiscal.countries[A].debt);
    expect(pathB.operations.deployments).toEqual(pathA.operations.deployments);
    expect(pathB.multilateral.treaties).toEqual(pathA.multilateral.treaties);
    expect(pathB.trade.flows).toEqual(pathA.trade.flows);
    expect(pathB.politics.regionalOpinion).toEqual(pathA.politics.regionalOpinion);
  }, 120000);
});
