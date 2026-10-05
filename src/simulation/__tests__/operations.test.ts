import { describe, expect, it } from 'vitest';
import { militaryFixture, militaryCountry, otherCountry, militaryRegions, militaryContext, militaryParameters } from './military.test';
import { assertSimulationInvariants } from '../invariants';
import { createPoliticalPerson, setControlledPerson } from '../governance/runtime';
import { deploy, hasOperationsAuthority, initializeOperations, orderMovement, recomputeControl, resolveOneEngagement, runOperationalAI, supplyDeployment, withdrawDeployment } from '../operations/runtime';
import { advanceSimulationDays } from '../engine';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { admitMilitaryBaseline } from '../military/runtime';
import { createClaim } from '../diplomacy';
import { declareLimitedWar, endWar, isWarGoalSatisfied } from '../war';
import { inspectOperationsReports, runOperationsReports } from '../operations/reports';
import type { Deployment, StrategicComponent } from '../operations/model';
import type { MilitaryItem } from '../military/model';
import type { SchedulerTaskContext } from '../scheduler';

const fixture = () => initializeOperations(militaryFixture());

const targetRegionId = militaryRegions[1].id;
const sourceRegionId = militaryRegions[0].id;
const combatWarId = 'war.combat';

const combatSource = {
  status: 'modelled' as const,
  publisher: 'ProjectAtlas deterministic combat regression fixture',
  url: 'scenario:synthetic-combat-test',
  referenceDate: '2026-01-01', retrievedAt: '2026-10-03',
  licence: 'ProjectAtlas test fixture (ISC)', attribution: 'ProjectAtlas',
  limitation: 'Entirely synthetic; not a real national army observation.', scenarioFixture: true,
};

function combatFixture(): ReturnType<typeof militaryFixture> {
  let state = initializeOperations(militaryFixture());
  state = admitMilitaryBaseline(state, {
    countryId: otherCountry,
    source: combatSource,
    parameters: militaryParameters,
    authorized: 50, present: 50, trainees: 0,
    equipment: { personal: { operational: 100, unavailable: 0, maintenance: 0, reserve: 0 }, truck: { operational: 10, unavailable: 0, maintenance: 0, reserve: 0 } },
    consumables: { ammunition: { quantity: 1000, capacity: 10000 }, fuel: { quantity: 1000, capacity: 10000 } },
    industrialMaterials: 1000,
  });
  state = createClaim(state, { id: 'claim.combat', claimantCountryId: militaryCountry, regionId: targetRegionId, type: 'territorial', creationDate: state.date, reason: 'Deterministic combat regression claim.' }, militaryContext);
  state = declareLimitedWar(state, { warId: combatWarId, attackerCountryId: militaryCountry, defenderCountryId: otherCountry, targetRegionId, casusBelliId: `claim-derived:claim.combat:${otherCountry}` }, militaryContext);
  return state;
}

function deploymentRecord(input: { id: string; countryId: string; warId?: string; sourceRegionId: string; currentRegionId: string; personnel: number; equipment?: Partial<Record<MilitaryItem, number>>; supply?: { ammunition: number; fuel: number }; status?: Deployment['status'] }): Deployment {
  const equipment = input.equipment ?? {};
  return {
    id: input.id, countryId: input.countryId, warId: input.warId,
    sourceRegionId: input.sourceRegionId, currentRegionId: input.currentRegionId,
    personnel: input.personnel, equipment,
    supply: input.supply ?? { ammunition: 0, fuel: 0 },
    status: input.status ?? 'deployed',
    losses: { personnel: 0, equipment: {} },
    allocated: { personnel: input.personnel, equipment: { ...equipment } },
    provenance: 'modelled',
    limitation: 'Deterministic combat regression fixture deployment.',
  };
}

function withDeployments(state: ReturnType<typeof militaryFixture>, deployments: Deployment[]) {
  const nextDeployments = { ...state.operations.deployments };
  const order = [...state.operations.deploymentOrder];
  for (const deployment of deployments) {
    nextDeployments[deployment.id] = deployment;
    if (!order.includes(deployment.id)) order.push(deployment.id);
  }
  return { ...state, operations: { ...state.operations, deployments: nextDeployments, deploymentOrder: order, nextDeploymentSequence: Math.max(state.operations.nextDeploymentSequence, ...deployments.map(deployment => Number(deployment.id.split('.')[1]) + 1)) } };
}

function decisiveComponent(state: ReturnType<typeof militaryFixture>, regionId: string): StrategicComponent {
  const component = Object.values(state.operations.components).find(candidate => candidate.regionId === regionId && candidate.kind === 'decisive');
  if (!component) throw new Error(`Missing decisive component for ${regionId}`);
  return component;
}

const combatWar = { id: combatWarId, attackerCountryId: militaryCountry, defenderCountryId: otherCountry, targetRegionId };

function forcingRoll(value: number): SchedulerTaskContext {
  return {
    date: '2026-01-02', tick: 1, cadence: 'daily', execution: 'scheduled', eventKey: 'cadence:daily',
    random: { uint32: () => value, float: () => value / 10000, integer: () => value },
  };
}

function resolveCombat(state: ReturnType<typeof militaryFixture>, roll: number, attacker: Deployment, defender: Deployment) {
  const component = decisiveComponent(state, targetRegionId);
  return resolveOneEngagement(withDeployments(state, [attacker, defender]), forcingRoll(roll), combatWar, component, [attacker], [defender]);
}

function armedFixture() {
  return withDeployments(combatFixture(), [
    deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 40 } }),
    deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 40 } }),
  ]);
}

describe('0.19 operational foundation', () => {
  it('initializes strategic components and control without changing sovereignty', () => {
    const state = fixture();
    expect(Object.keys(state.operations.components).length).toBeGreaterThan(0);
    expect(state.regionOwnership).toEqual(militaryFixture().regionOwnership);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('requires resolved executive authority rather than Country selection', () => {
    const state = fixture();
    const person = state.governance.player.controlledPersonId!;
    expect(hasOperationsAuthority(state, militaryCountry, person)).toBe(true);
    const noOffice = createPoliticalPerson(setControlledPerson(state, undefined), { countryId: militaryCountry, displayName: 'No office' });
    const noOfficeId = Object.keys(noOffice.governance.persons).find(id => noOffice.governance.persons[id].countryId === militaryCountry && !noOffice.governance.persons[id].office)!;
    const controlled = setControlledPerson(noOffice, noOfficeId);
    expect(hasOperationsAuthority(controlled, militaryCountry, noOfficeId)).toBe(false);
    expect(() => deploy(controlled, { countryId: militaryCountry, personId: noOfficeId, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1 })).toThrow();
  });
  it('conserves deployment personnel and rejects double deployment', () => {
    let state = fixture();
    const person = state.governance.player.controlledPersonId!;
    state = deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1 });
    const deployment = state.operations.deployments[state.operations.deploymentOrder[0]];
    expect(deployment.personnel).toBe(1);
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
    expect(() => deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1000000 })).toThrow();
  });
  it('records prospective movement order and withdrawal', () => {
    let state = fixture();
    const person = state.governance.player.controlledPersonId!;
    state = deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1 });
    const id = state.operations.deploymentOrder[0];
    state = orderMovement(state, id, person, militaryRegions[1].id);
    expect(state.operations.deployments[id].order!.effectiveOn.localeCompare(state.date)).toBeGreaterThan(0);
    state = withdrawDeployment(state, id, person);
    expect(state.operations.deployments[id].status).toBe('withdrawing');
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('rejects consumable or over-allocated deployment equipment', () => {
    let state = fixture();
    const person = state.governance.player.controlledPersonId!;
    expect(() => deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1, equipment: { ammunition: 1 } })).toThrow();
    expect(() => deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1, equipment: { truck: 999999 } })).toThrow();
  });
  it('validates symmetric adjacency', () => {
    let state = fixture();
    state.operations.adjacency = { [militaryRegions[0].id]: [militaryRegions[1].id], [militaryRegions[1].id]: [militaryRegions[0].id] };
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('rejects consumable equipment forged into deployment equipment', () => {
    let state = fixture();
    const person = state.governance.player.controlledPersonId!;
    state = deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1 });
    const corrupt = structuredClone(state);
    corrupt.operations.deployments[corrupt.operations.deploymentOrder[0]].equipment.ammunition = 1;
    expect(() => assertSimulationInvariants(corrupt, militaryContext, 'save')).toThrow();
  });
  it('transfers finite supply from canonical stocks into a deployment cache', () => {
    let state = fixture();
    const person = state.governance.player.controlledPersonId!;
    state = deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1 });
    const id = state.operations.deploymentOrder[0];
    const beforeAmmo = state.military.countries[militaryCountry].capability!.consumables.ammunition?.quantity ?? 0;
    state = supplyDeployment(state, id, person, 10, 5);
    expect(state.operations.deployments[id].supply.ammunition).toBe(10);
    expect(state.operations.deployments[id].supply.fuel).toBe(5);
    expect(state.military.countries[militaryCountry].capability!.consumables.ammunition?.quantity).toBe(beforeAmmo - 10);
    expect(() => supplyDeployment(state, id, person, 999999, 0)).toThrow();
    expect(assertSimulationInvariants(state, militaryContext, 'save')).toBe(true);
  });
  it('rejects neutral transit for adjacent movement', () => {
    let state = fixture();
    const person = state.governance.player.controlledPersonId!;
    state = deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1 });
    const id = state.operations.deploymentOrder[0];
    state.operations.adjacency = { [militaryRegions[0].id]: [militaryRegions[1].id], [militaryRegions[1].id]: [militaryRegions[0].id] };
    state = orderMovement(state, id, person, militaryRegions[1].id);
    expect(() => advanceSimulationDays(state, 1)).toThrow(/Movement access is denied/);
  });
  it('upgrades schema-17 deployments missing allocated basis deterministically', () => {
    let state = fixture();
    const person = state.governance.player.controlledPersonId!;
    state = deploy(state, { countryId: militaryCountry, personId: person, sourceRegionId: militaryRegions[0].id, currentRegionId: militaryRegions[0].id, personnel: 1 });
    const saved = JSON.parse(serializeSimulationState(state, militaryContext)) as any;
    delete saved.operations.deployments[saved.operations.deploymentOrder[0]].allocated;
    const restored = restoreSimulationState(JSON.stringify(saved), militaryRegions, {}, {}, militaryContext);
    const deployment = restored.operations.deployments[restored.operations.deploymentOrder[0]];
    expect(deployment.allocated.personnel).toBe(deployment.personnel + deployment.losses.personnel);
    expect(assertSimulationInvariants(restored, militaryContext, 'reload')).toBe(true);
  });
});

describe('0.19 checkpoint D deterministic combat contracts', () => {
  it('produces identical deterministic combat results for identical inputs', () => {
    const first = advanceSimulationDays(armedFixture(), 2);
    const second = advanceSimulationDays(armedFixture(), 2);
    expect(first).toEqual(second);
    expect(Object.keys(first.operations.engagements)).toHaveLength(1);
    expect(Object.values(first.operations.deployments).some(deployment => deployment.losses.personnel > 0)).toBe(true);
  });

  it('keeps combat accounting independent of unrelated-war insertion order', () => {
    const base = advanceSimulationDays(armedFixture(), 2);
    const state = combatFixture();
    const primary = state.wars[0];
    const unrelated = { ...primary, id: 'war.unrelated', targetRegionId: sourceRegionId, attackerCountryId: otherCountry, defenderCountryId: militaryCountry, declarationCasusBelli: { ...primary.declarationCasusBelli, targetRegionIds: [sourceRegionId] } };
    const disturbed = advanceSimulationDays(withDeployments({ ...state, wars: [unrelated, primary] }, [
      deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 40 } }),
      deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 40 } }),
    ]), 2);
    const artifacts = (s: typeof base) => ({
      engagements: Object.fromEntries(Object.entries(s.operations.engagements).filter(([, engagement]) => engagement.warId === combatWarId)),
      deployments: Object.fromEntries(Object.entries(s.operations.deployments).filter(([, deployment]) => deployment.warId === combatWarId)),
      components: s.operations.components,
      regionControl: s.operations.regionControl,
    });
    expect(artifacts(disturbed)).toEqual(artifacts(base));
  });

  it('limits effective combat personnel to available ammunition', () => {
    const state = combatFixture();
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 50, supply: { ammunition: 50, fuel: 0 } });
    const supplied = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 100, supply: { ammunition: 100, fuel: 0 } });
    const starved = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 100, supply: { ammunition: 0, fuel: 0 } });
    const withAmmo = resolveCombat(state, 5000, supplied, defender);
    const withoutAmmo = resolveCombat(state, 5000, starved, defender);
    expect(withAmmo.operations.deployments['deployment.00000000'].losses.personnel).toBe(0);
    expect(withAmmo.operations.deployments['deployment.00000001'].losses.personnel).toBeGreaterThan(0);
    expect(withoutAmmo.operations.deployments['deployment.00000000'].losses.personnel).toBeGreaterThan(0);
    expect(withoutAmmo.operations.deployments['deployment.00000001'].losses.personnel).toBe(0);
  });

  it('limits mechanized equipment participation to available fuel', () => {
    const state = combatFixture();
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 20, supply: { ammunition: 20, fuel: 0 } });
    const fueled = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 1, supply: { ammunition: 0, fuel: 5 }, equipment: { truck: 5 } });
    const dry = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 1, supply: { ammunition: 0, fuel: 0 }, equipment: { truck: 5 } });
    const withFuel = resolveCombat(state, 5000, fueled, defender);
    const withoutFuel = resolveCombat(state, 5000, dry, defender);
    expect(withFuel.operations.deployments['deployment.00000000'].losses.personnel).toBe(0);
    expect(withFuel.operations.deployments['deployment.00000001'].losses.personnel).toBeGreaterThan(0);
    expect(withoutFuel.operations.deployments['deployment.00000000'].losses.personnel).toBeGreaterThan(0);
    expect(withoutFuel.operations.deployments['deployment.00000001'].losses.personnel).toBe(0);
  });

  it('consumes ammunition and fuel from both sides of an engagement', () => {
    const state = combatFixture();
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 50, fuel: 50 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 50, fuel: 50 } });
    const result = resolveCombat(state, 5000, attacker, defender);
    const afterAttacker = result.operations.deployments['deployment.00000000'];
    const afterDefender = result.operations.deployments['deployment.00000001'];
    const engagement = result.operations.engagements[result.operations.engagementOrder[0]];
    expect(afterAttacker.supply.ammunition).toBeLessThan(50);
    expect(afterDefender.supply.ammunition).toBeLessThan(50);
    expect(afterAttacker.supply.fuel).toBeLessThan(50);
    expect(afterDefender.supply.fuel).toBeLessThan(50);
    expect(engagement.consumed.ammunition).toBe(50 - afterAttacker.supply.ammunition + 50 - afterDefender.supply.ammunition);
    expect(engagement.consumed.fuel).toBe(50 - afterAttacker.supply.fuel + 50 - afterDefender.supply.fuel);
  });

  it('reconciles each casualty exactly once across assignments, population, cohorts and labour', () => {
    const state = combatFixture();
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 0, fuel: 0 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 } });
    const beforeAssignments = state.military.countries[militaryCountry].capability!.assignments[sourceRegionId];
    const beforePopulation = state.populationByRegion[sourceRegionId]!;
    const beforeCohortSum = state.socioeconomy.regions[sourceRegionId].cohorts.reduce((sum, cohort) => sum + cohort.persons, 0);
    const result = resolveCombat(state, 5000, attacker, defender);
    const losses = result.operations.deployments['deployment.00000000'].losses.personnel;
    expect(losses).toBeGreaterThan(0);
    const capability = result.military.countries[militaryCountry].capability!;
    const region = result.socioeconomy.regions[sourceRegionId];
    const economy = region.economy!;
    const reserved = Object.values(result.military.countries).reduce((sum, country) => sum + (country.capability?.assignments[sourceRegionId] ?? 0), 0);
    expect(capability.assignments[sourceRegionId]).toBe(beforeAssignments - losses);
    expect(result.populationByRegion[sourceRegionId]).toBe(beforePopulation - losses);
    expect(region.population).toBe(beforePopulation - losses);
    expect(region.cohorts.reduce((sum, cohort) => sum + cohort.persons, 0)).toBe(beforeCohortSum - losses);
    expect(economy.employed + economy.unemployed + reserved).toBe(economy.labourForce);
    expect(assertSimulationInvariants(result, militaryContext, 'save')).toBe(true);
  });

  it('moves a fully depleted deployment into a valid withdrawn terminal state', () => {
    const state = combatFixture();
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 1, supply: { ammunition: 0, fuel: 0 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 } });
    const result = resolveCombat(state, 5000, attacker, defender);
    const depleted = result.operations.deployments['deployment.00000000'];
    expect(depleted.personnel).toBe(0);
    expect(depleted.status).toBe('withdrawn');
    expect(depleted.losses.personnel).toBe(1);
    expect(assertSimulationInvariants(result, militaryContext, 'save')).toBe(true);
  });

  it('persists destroyed equipment through military processing and save/reload', () => {
    const state = combatFixture();
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 40 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 20 } });
    const result = resolveCombat(state, 5000, attacker, defender);
    const destroyed = result.military.countries[otherCountry].capability!.equipment.personal!.destroyed!;
    expect(destroyed).toBeGreaterThan(0);
    const personal = result.military.countries[otherCountry].capability!.equipment.personal!;
    expect(personal.operational + personal.unavailable + personal.maintenance + personal.reserve + destroyed).toBe(personal.opening + personal.delivered);
    const restored = restoreSimulationState(serializeSimulationState(result, militaryContext), militaryRegions, {}, {}, militaryContext);
    expect(restored.military.countries[otherCountry].capability!.equipment.personal!.destroyed).toBe(destroyed);
    expect(restored.military.countries[otherCountry].capability!.equipment.personal!.operational).toBe(personal.operational);
  });

  it('reuses one engagement across repeated combat days and preserves its original start date', () => {
    const result = advanceSimulationDays(armedFixture(), 2);
    expect(result.operations.engagementOrder).toHaveLength(1);
    expect(result.operations.nextEngagementSequence).toBe(1);
    const engagement = result.operations.engagements[result.operations.engagementOrder[0]];
    expect(engagement.startDate).toBe('2026-01-02');
    expect(engagement.status).toBe('active');
  });

  it('accumulates engagement personnel and equipment evidence across repeated resolutions', () => {
    const state = combatFixture();
    const component = decisiveComponent(state, targetRegionId);
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 40 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 20 } });
    const afterFirst = resolveOneEngagement(withDeployments(state, [attacker, defender]), forcingRoll(5000), combatWar, component, [attacker], [defender]);
    const engagementId = afterFirst.operations.engagementOrder[0];
    const afterSecond = resolveOneEngagement(afterFirst, forcingRoll(9500), combatWar, component, [afterFirst.operations.deployments['deployment.00000000']], [afterFirst.operations.deployments['deployment.00000001']], engagementId);
    const engagement = afterSecond.operations.engagements[engagementId];
    expect(afterSecond.operations.engagementOrder).toEqual([engagementId]);
    expect(engagement.attackerLosses.personnel).toBeGreaterThan(0);
    expect(engagement.defenderLosses.personnel).toBeGreaterThan(0);
    expect(engagement.attackerLosses.personnel).toBe(afterSecond.operations.deployments['deployment.00000000'].losses.personnel);
    expect(engagement.defenderLosses.personnel).toBe(afterSecond.operations.deployments['deployment.00000001'].losses.personnel);
    expect(engagement.attackerLosses.equipment).toEqual(afterSecond.operations.deployments['deployment.00000000'].losses.equipment);
    expect(engagement.defenderLosses.equipment).toEqual(afterSecond.operations.deployments['deployment.00000001'].losses.equipment);
    expect(engagement.consumed.ammunition).toBeGreaterThan(0);
  });

  it('accumulates deployment equipment losses across first and repeated losses', () => {
    const state = combatFixture();
    const component = decisiveComponent(state, targetRegionId);
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 40 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 20 } });
    const afterFirst = resolveOneEngagement(withDeployments(state, [attacker, defender]), forcingRoll(5000), combatWar, component, [attacker], [defender]);
    const engagementId = afterFirst.operations.engagementOrder[0];
    const firstLoss = afterFirst.operations.deployments['deployment.00000001'].losses.equipment.personal!;
    expect(firstLoss).toBeGreaterThan(0);
    expect(afterFirst.operations.deployments['deployment.00000001'].equipment.personal).toBe(20 - firstLoss);
    const afterSecond = resolveOneEngagement(afterFirst, forcingRoll(5000), combatWar, component, [afterFirst.operations.deployments['deployment.00000000']], [afterFirst.operations.deployments['deployment.00000001']], engagementId);
    const secondLoss = afterSecond.operations.deployments['deployment.00000001'].losses.equipment.personal!;
    expect(secondLoss).toBeGreaterThan(firstLoss);
    expect(afterSecond.operations.deployments['deployment.00000001'].equipment.personal).toBe(20 - secondLoss);
    expect(afterSecond.operations.engagements[engagementId].defenderLosses.equipment.personal).toBe(secondLoss);
  });

  it('resolves an engagement once one side disappears', () => {
    const state = combatFixture();
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 1, supply: { ammunition: 0, fuel: 0 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 } });
    const afterWipe = resolveCombat(state, 5000, attacker, defender);
    const engagementId = afterWipe.operations.engagementOrder[0];
    expect(afterWipe.operations.deployments['deployment.00000000'].status).toBe('withdrawn');
    expect(afterWipe.operations.engagements[engagementId].status).toBe('active');
    const resolved = advanceSimulationDays(afterWipe, 1);
    expect(resolved.operations.engagements[engagementId].status).toBe('resolved');
    expect(assertSimulationInvariants(resolved, militaryContext, 'save')).toBe(true);
  });

  it('reloads pre-allocated schema-17 deployment bases deterministically', () => {
    const state = initializeOperations(militaryFixture());
    const deployment = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, sourceRegionId, currentRegionId: sourceRegionId, personnel: 7, equipment: { personal: 5 } });
    deployment.allocated = { personnel: 10, equipment: { personal: 8 } };
    deployment.losses = { personnel: 3, equipment: { personal: 3 } };
    const armed = withDeployments(state, [deployment]);
    const serialized = serializeSimulationState(armed, militaryContext);
    const restored = restoreSimulationState(serialized, militaryRegions, {}, {}, militaryContext);
    expect(restored.operations.deployments['deployment.00000000'].allocated).toEqual({ personnel: 10, equipment: { personal: 8 } });
    expect(restored).toEqual(armed);
    const reloaded = restoreSimulationState(serializeSimulationState(restored, militaryContext), militaryRegions, {}, {}, militaryContext);
    expect(reloaded).toEqual(restored);
    const missing = JSON.parse(serializeSimulationState(armed, militaryContext)) as any;
    delete missing.operations.deployments['deployment.00000000'].allocated;
    const rebuilt = restoreSimulationState(JSON.stringify(missing), militaryRegions, {}, {}, militaryContext);
    expect(rebuilt.operations.deployments['deployment.00000000'].allocated).toEqual({ personnel: 10, equipment: { personal: 8 } });
  });
});

describe('0.19 logistics throughput', () => {
  const distantSupplyFixture = (trucks: number, personnel: number) => {
    const state = combatFixture();
    const occupied = {
      ...state,
      occupationByRegion: { ...state.occupationByRegion, [targetRegionId]: { regionId: targetRegionId, warId: combatWarId, occupierCountryId: militaryCountry, startDate: state.date } },
      operations: { ...state.operations, regionControl: { ...state.operations.regionControl, [targetRegionId]: 'foreign_controlled' as const }, adjacency: { [sourceRegionId]: [targetRegionId], [targetRegionId]: [sourceRegionId] } },
    };
    const deployment = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel, equipment: { truck: trucks } });
    return withDeployments(occupied, [deployment]);
  };

  it('refuses to resupply a cut-off force without an accessible path', () => {
    const state = combatFixture();
    const deployment = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 10, equipment: { truck: 5 } });
    const armed = withDeployments({ ...state, operations: { ...state.operations, adjacency: { [sourceRegionId]: [targetRegionId], [targetRegionId]: [sourceRegionId] } } }, [deployment]);
    expect(() => supplyDeployment(armed, 'deployment.00000000', armed.governance.player.controlledPersonId!, 10, 0)).toThrow(/does not exist/);
  });

  it('refuses distant resupply without transport equipment or crew', () => {
    const state = distantSupplyFixture(0, 10);
    expect(() => supplyDeployment(state, 'deployment.00000000', state.governance.player.controlledPersonId!, 10, 0)).toThrow(/no transport capacity/);
    const undercrewed = distantSupplyFixture(5, 1);
    expect(() => supplyDeployment(undercrewed, 'deployment.00000000', undercrewed.governance.player.controlledPersonId!, 10, 0)).toThrow(/no transport capacity/);
  });

  it('caps distant resupply by finite convoy throughput and burns transport fuel', () => {
    const state = distantSupplyFixture(5, 10);
    const result = supplyDeployment(state, 'deployment.00000000', state.governance.player.controlledPersonId!, 200, 0);
    const capability = result.military.countries[militaryCountry].capability!;
    expect(result.operations.deployments['deployment.00000000'].supply.ammunition).toBe(100);
    expect(capability.consumables.ammunition!.quantity).toBe(1000 - 100);
    expect(capability.consumables.fuel!.quantity).toBe(1000 - 5);
    expect(capability.consumables.fuel!.consumed).toBe(5);
  });

  it('conserves national stock, transfer and transport fuel exactly', () => {
    const state = distantSupplyFixture(5, 10);
    const beforeAmmo = state.military.countries[militaryCountry].capability!.consumables.ammunition!.quantity;
    const beforeFuel = state.military.countries[militaryCountry].capability!.consumables.fuel!.quantity;
    const result = supplyDeployment(state, 'deployment.00000000', state.governance.player.controlledPersonId!, 40, 30);
    const after = result.military.countries[militaryCountry].capability!;
    const deployment = result.operations.deployments['deployment.00000000'];
    expect(after.consumables.ammunition!.quantity).toBe(beforeAmmo - deployment.supply.ammunition);
    expect(after.consumables.fuel!.quantity).toBe(beforeFuel - deployment.supply.fuel - 5);
    expect(deployment.supply.ammunition).toBe(40);
    expect(deployment.supply.fuel).toBe(30);
  });
});

describe('0.19 checkpoint E strategic capture and control', () => {
  const targetDecisive = (state: ReturnType<typeof militaryFixture>) => Object.values(state.operations.components).find(component => component.regionId === targetRegionId && component.kind === 'decisive')!;

  it('derives Region control from all decisive components and ignores secondary components', () => {
    const state = combatFixture();
    const decisive = targetDecisive(state);
    const extra = { id: 'component.test-extra', regionId: targetRegionId, kind: 'decisive' as const, coverage: 'modelled' as const, contested: false, controllingCountryId: otherCountry, provenance: 'Synthetic second decisive component.' };
    const secondary = { id: 'component.test-secondary', regionId: targetRegionId, kind: 'secondary' as const, coverage: 'modelled' as const, contested: false, controllingCountryId: militaryCountry, provenance: 'Synthetic secondary component.' };
    const armed = { ...state, operations: { ...state.operations, components: { ...state.operations.components, [extra.id]: extra, [secondary.id]: secondary }, componentOrder: [...state.operations.componentOrder, extra.id, secondary.id] } };
    expect(recomputeControl(armed).operations.regionControl[targetRegionId]).toBe('sovereign_controlled');
    const split = { ...armed, operations: { ...armed.operations, components: { ...armed.operations.components, [extra.id]: { ...extra, controllingCountryId: militaryCountry } } } };
    expect(recomputeControl(split).operations.regionControl[targetRegionId]).toBe('contested');
    const foreign = { ...armed, operations: { ...armed.operations, components: { ...armed.operations.components, [extra.id]: { ...extra, controllingCountryId: militaryCountry }, [decisive.id]: { ...decisive, controllingCountryId: militaryCountry } } } };
    expect(recomputeControl(foreign).operations.regionControl[targetRegionId]).toBe('foreign_controlled');
  });

  it('accumulates capture progress across decisive wins, then full capture creates a matching occupation and war goal', () => {
    const state = combatFixture();
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 40 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 20 } });
    const afterFirst = resolveCombat(state, 5000, attacker, defender);
    const decisive1 = targetDecisive(afterFirst);
    expect(decisive1.captureProgress).toBe(2500);
    expect(decisive1.controllingCountryId).toBe(otherCountry);
    expect(recomputeControl(afterFirst).operations.regionControl[targetRegionId]).toBe('contested');
    const afterSecond = resolveOneEngagement(afterFirst, forcingRoll(5000), combatWar, decisive1, [afterFirst.operations.deployments['deployment.00000000']], [afterFirst.operations.deployments['deployment.00000001']], afterFirst.operations.engagementOrder[0]);
    const decisive2 = targetDecisive(afterSecond);
    expect(decisive2.controllingCountryId).toBe(militaryCountry);
    expect(decisive2.captureProgress).toBe(0);
    const captured = recomputeControl(afterSecond);
    expect(captured.operations.regionControl[targetRegionId]).toBe('foreign_controlled');
    expect(captured.occupationByRegion[targetRegionId]).toMatchObject({ occupierCountryId: militaryCountry, warId: combatWarId });
    expect(isWarGoalSatisfied(captured, combatWarId)).toBe(true);
  });

  it('removes the occupation when the sovereign defender recaptures decisive control', () => {
    const state = combatFixture();
    const decisive = targetDecisive(state);
    const captured = recomputeControl({ ...state, operations: { ...state.operations, components: { ...state.operations.components, [decisive.id]: { ...decisive, controllingCountryId: militaryCountry } } } });
    expect(captured.operations.regionControl[targetRegionId]).toBe('foreign_controlled');
    expect(captured.occupationByRegion[targetRegionId]).toBeDefined();
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 20 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 40 } });
    let after = resolveCombat(captured, 5000, attacker, defender);
    expect(targetDecisive(after).captureProgress).toBe(2500);
    after = resolveOneEngagement(after, forcingRoll(5000), combatWar, targetDecisive(after), [after.operations.deployments['deployment.00000000']], [after.operations.deployments['deployment.00000001']], after.operations.engagementOrder[0]);
    const recaptured = recomputeControl(after);
    expect(recaptured.operations.regionControl[targetRegionId]).toBe('sovereign_controlled');
    expect(recaptured.occupationByRegion[targetRegionId]).toBeUndefined();
  });

  it('preserves destroyed equipment and casualties through settlement', () => {
    const state = combatFixture();
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 40 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 20 } });
    const afterCombat = resolveCombat(state, 5000, attacker, defender);
    const destroyed = afterCombat.military.countries[otherCountry].capability!.equipment.personal!.destroyed!;
    expect(destroyed).toBeGreaterThan(0);
    const decisive = targetDecisive(afterCombat);
    const captured = recomputeControl({ ...afterCombat, operations: { ...afterCombat.operations, components: { ...afterCombat.operations.components, [decisive.id]: { ...decisive, controllingCountryId: militaryCountry, captureProgress: 0, contested: false } } } });
    const ended = endWar(captured, combatWarId, 'attacker_victory', militaryContext);
    expect(ended.regionOwnership[targetRegionId]).toBe(militaryCountry);
    expect(ended.military.countries[otherCountry].capability!.equipment.personal!.destroyed).toBe(destroyed);
    expect(ended.military.countries[otherCountry].capability!.equipment.personal!.operational).toBe(afterCombat.military.countries[otherCountry].capability!.equipment.personal!.operational);
  });
});

describe('0.19 checkpoint F operational AI', () => {
  it('deploys and resupplies non-player belligerents without touching the player country or declaring wars', () => {
    const state = combatFixture();
    const afterAI = runOperationalAI(state);
    expect(Object.values(afterAI.operations.deployments).some(deployment => deployment.countryId === otherCountry)).toBe(true);
    expect(Object.values(afterAI.operations.deployments).some(deployment => deployment.countryId === militaryCountry)).toBe(false);
    expect(afterAI.wars).toEqual(state.wars);
    expect(afterAI.military.countries[otherCountry].capability!.consumables.ammunition!.quantity).toBe(1000);
    const day1 = advanceSimulationDays(afterAI, 1);
    const defenderDeployment = Object.values(day1.operations.deployments).find(deployment => deployment.countryId === otherCountry)!;
    expect(defenderDeployment.status).toBe('deployed');
    expect(defenderDeployment.supply.ammunition).toBeGreaterThan(0);
  });

  it('respects physical availability and never fabricates forces', () => {
    const state = combatFixture();
    const capability = state.military.countries[otherCountry].capability!;
    const totalAvailable = Object.values(capability.assignments).reduce((sum, value) => sum + value, 0);
    const existing = deploymentRecord({ id: 'deployment.00000000', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: totalAvailable });
    const afterAI = runOperationalAI(withDeployments(state, [existing]));
    const deployments = Object.values(afterAI.operations.deployments).filter(deployment => deployment.countryId === otherCountry && deployment.status !== 'withdrawn');
    expect(deployments).toHaveLength(1);
    expect(deployments[0].personnel).toBe(totalAvailable);
  });

  it('withdraws non-player deployments whose war has ended', () => {
    const state = combatFixture();
    const ended = endWar(state, combatWarId, 'white_peace', militaryContext);
    const stale = deploymentRecord({ id: 'deployment.00000000', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 10 });
    const afterAI = runOperationalAI(withDeployments(ended, [stale]));
    expect(afterAI.operations.deployments['deployment.00000000'].status).toBe('withdrawing');
  });
});

describe('0.19 checkpoint F fog of war', () => {
  it('produces a government-gated fog-of-war report that never exposes enemy canonical strength', () => {
    const state = combatFixture();
    const attacker = deploymentRecord({ id: 'deployment.00000000', countryId: militaryCountry, warId: combatWarId, sourceRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 40 } });
    const defender = deploymentRecord({ id: 'deployment.00000001', countryId: otherCountry, warId: combatWarId, sourceRegionId: targetRegionId, currentRegionId: targetRegionId, personnel: 40, supply: { ammunition: 40, fuel: 0 }, equipment: { personal: 20 } });
    const afterCombat = resolveCombat(state, 5000, attacker, defender);
    const reconciled = recomputeControl(afterCombat);
    const reported = runOperationsReports(reconciled);
    const report = reported.information.operationsReports!.latest[militaryCountry]!;
    expect(report.access).toBe('government');
    expect(report.status).toBe('modelled');
    expect(report.wars).toHaveLength(1);
    expect(report.wars[0].enemyCountryId).toBe(otherCountry);
    expect(report.wars[0].enemyStrength).toBe('unavailable');
    expect(report.wars[0].control).toBe('contested');
    expect(report.wars[0].contact).toHaveLength(1);
    expect(report.wars[0].contact[0].recordedEnemyPersonnelLosses).toBeGreaterThan(0);
    expect(report.wars[0]).not.toHaveProperty('enemyPersonnel');
    expect(report.wars[0]).not.toHaveProperty('enemyEquipment');
    expect(report.wars[0]).not.toHaveProperty('enemySupply');
    expect(report.fingerprint).toBeTruthy();
  });

  it('gates operations report inspection behind government information access', () => {
    const state = combatFixture();
    const reported = runOperationsReports(state);
    const person = state.governance.player.controlledPersonId!;
    expect(inspectOperationsReports(reported, militaryCountry, person)).toBeDefined();
    expect(inspectOperationsReports(reported, otherCountry, person)).toBeUndefined();
    expect(inspectOperationsReports(reported, militaryCountry, 'unknown-person')).toBeUndefined();
  });
});
