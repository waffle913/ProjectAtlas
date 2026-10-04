import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { allocate, integer, MODEL, ratio } from '../socioeconomy/model';
import type { SchedulerTaskContext } from '../scheduler';
import { hasGovernmentInformationAccess } from '../information/runtime';
import { EQUIPMENT_REGISTRY, presentPersonnel, trainingPersonnel, type MilitaryItem } from '../military/model';
import { emptyOperations, OPERATIONS_MODEL, operationsComponentId, operationsDeploymentId, operationsEngagementId, validMilitaryItem,
  type Deployment, type Engagement, type OperationsState, type RegionControl, type StrategicComponent } from './model';

export function initializeOperations(state: SimulationState): SimulationState {
  if (state.operations.initializedOn) return state;
  const components = deterministicComponents(state);
  const regionControl: Record<string, RegionControl> = {};
  for (const regionId of Object.keys(state.regionOwnership).sort()) {
    const occupation = state.occupationByRegion[regionId];
    regionControl[regionId] = occupation ? 'foreign_controlled' : 'sovereign_controlled';
  }
  return { ...state, operations: { ...emptyOperations(state.date), components: components.byId, componentOrder: components.order, nextComponentSequence: components.order.length, regionControl } };
}

export function hasOperationsAuthority(state: SimulationState, countryId: string, personId: string): boolean {
  const person = state.governance.persons[personId];
  return state.governance.player.controlledPersonId === personId
    && hasGovernmentInformationAccess(state, personId, countryId)
    && (person?.office?.role === 'head_of_government' || person?.office?.role === 'head_of_state')
    && person.office.evidence?.authorityBasis !== 'institutional_authority_unresolved'
    && Boolean(person?.office?.authorityProfile.capabilities.includes('command_military_operations'));
}

function requireAuthority(state: SimulationState, countryId: string, personId: string) {
  if (!hasOperationsAuthority(state, countryId, personId)) throw new Error('Military operations require the controlled active person to hold a resolved executive office with government-information and budget authority.');
}

function deterministicComponents(state: SimulationState): { byId: Record<string, StrategicComponent>; order: string[] } {
  const byId: Record<string, StrategicComponent> = {};
  const order: string[] = [];
  for (const regionId of Object.keys(state.regionOwnership).sort()) {
    for (let index = 0; index < OPERATIONS_MODEL.componentFallbackDecisive; index++) {
      const id = `component.abstract:${regionId}:${index}`;
      const owner = state.regionOwnership[regionId];
      const occupier = state.occupationByRegion[regionId]?.occupierCountryId;
      byId[id] = { id, regionId, kind: 'decisive', coverage: 'modelled', contested: false, controllingCountryId: occupier ?? owner, provenance: occupier ? 'Legacy established control at migration boundary; no simulated capture history.' : 'Abstract modelled decisive component controlled by its sovereign owner.' };
      order.push(id);
    }
  }
  return { byId, order };
}

export function ensureRegionControl(state: SimulationState): SimulationState {
  const control: Record<string, RegionControl> = { ...state.operations.regionControl };
  for (const regionId of Object.keys(state.regionOwnership).sort()) {
    control[regionId] = state.occupationByRegion[regionId] ? 'foreign_controlled' : 'sovereign_controlled';
  }
  return { ...state, operations: { ...state.operations, regionControl: control } };
}

export function deploy(state: SimulationState, input: { countryId: string; personId: string; warId?: string; sourceRegionId: string; currentRegionId: string; personnel: number; equipment?: Partial<Record<MilitaryItem, number>>; supply?: { ammunition: number; fuel: number } }): SimulationState {
  requireAuthority(state, input.countryId, input.personId);
  integer(input.personnel);
  if (input.personnel <= 0) throw new Error('A deployment requires positive personnel.');
  const capability = state.military.countries[input.countryId]?.capability;
  if (!capability) throw new Error('Military operations require an admitted synthetic/modelled capability; unavailable factual armies cannot fabricate a force.');
  if (!capability.assignments[input.sourceRegionId]) throw new Error('Deployment source Region has no represented military assignment.');
  if (input.currentRegionId !== input.sourceRegionId) throw new Error('A new land deployment must start in its source Region; movement requires a separate order.');
  const deployedPersonnel = deployedTotals(state, input.countryId).personnel;
  const available = Math.max(0, presentPersonnel(capability) - trainingPersonnel(capability));
  if (deployedPersonnel + input.personnel > available) throw new Error('Deployment exceeds qualified available personnel.');
  const assignment = capability.assignments[input.sourceRegionId] ?? 0;
  const regionDeployed = deployedPersonnelByRegion(state, input.countryId).get(input.sourceRegionId) ?? 0;
  if (regionDeployed + input.personnel > assignment) throw new Error('Deployment exceeds personnel actually assigned to the source Region.');
  const equipment = input.equipment ?? {};
  if (input.supply && (input.supply.ammunition || input.supply.fuel)) throw new Error('Initial deployment supply is not yet supported; supply transfer is deferred to Pass 2.');
  for (const [item, quantity] of Object.entries(equipment)) {
    if (!validMilitaryItem(item)) throw new Error(`Unknown military equipment item: ${item}`);
    integer(quantity as number);
    if (EQUIPMENT_REGISTRY[item as MilitaryItem].consumable) throw new Error(`Consumable item cannot be allocated to a deployment: ${item}`);
    const stock = capability.equipment[item as MilitaryItem]?.operational ?? 0;
    const alreadyDeployed = deployedTotals(state, input.countryId).equipment[item as MilitaryItem] ?? 0;
    if (alreadyDeployed + (quantity as number) > stock) throw new Error(`Deployment exceeds operational equipment stock for ${item}.`);
  }
  const id = operationsDeploymentId(state.operations.nextDeploymentSequence);
  const record: Deployment = {
    id, countryId: input.countryId, warId: input.warId, sourceRegionId: input.sourceRegionId, currentRegionId: input.currentRegionId,
    personnel: input.personnel, equipment, supply: { ammunition: 0, fuel: 0 }, status: 'deploying',
    losses: { personnel: 0, equipment: {} }, allocated: { personnel: input.personnel, equipment: { ...equipment } }, provenance: 'modelled', limitation: 'Modelled aggregate operational deployment; not an observed real-world force disposition.',
  };
  return { ...state, operations: { ...state.operations, deployments: { ...state.operations.deployments, [id]: record }, deploymentOrder: [...state.operations.deploymentOrder, id], nextDeploymentSequence: state.operations.nextDeploymentSequence + 1 } };
}

export function withdrawDeployment(state: SimulationState, deploymentId: string, personId: string): SimulationState {
  const deployment = state.operations.deployments[deploymentId];
  if (!deployment) throw new Error(`Unknown deployment: ${deploymentId}`);
  requireAuthority(state, deployment.countryId, personId);
  if (deployment.status === 'withdrawn') return state;
  return { ...state, operations: { ...state.operations, deployments: { ...state.operations.deployments, [deploymentId]: { ...deployment, status: 'withdrawing', withdrawalEffectiveOn: nextDay(state.date) } } } };
}

export function orderMovement(state: SimulationState, deploymentId: string, personId: string, targetRegionId: string): SimulationState {
  const deployment = state.operations.deployments[deploymentId];
  if (!deployment) throw new Error(`Unknown deployment: ${deploymentId}`);
  requireAuthority(state, deployment.countryId, personId);
  if (deployment.status === 'withdrawn') throw new Error('A withdrawn deployment cannot move.');
  if (!state.regionOwnership[targetRegionId]) throw new Error(`Unknown Region: ${targetRegionId}`);
  const effectiveOn = nextDay(state.date);
  return { ...state, operations: { ...state.operations, deployments: { ...state.operations.deployments, [deploymentId]: { ...deployment, status: 'moving', order: { targetRegionId, effectiveOn, kind: 'move' } } } } };
}

export function supplyDeployment(state: SimulationState, deploymentId: string, personId: string, ammunition: number, fuel: number): SimulationState {
  const deployment = state.operations.deployments[deploymentId];
  if (!deployment) throw new Error(`Unknown deployment: ${deploymentId}`);
  requireAuthority(state, deployment.countryId, personId);
  integer(ammunition); integer(fuel);
  const capability = state.military.countries[deployment.countryId]?.capability;
  if (!capability) throw new Error('Supply requires an admitted military capability.');
  if (!supplyPathExists(state, deployment)) throw new Error('Supply path does not exist from a friendly source to this deployment.');
  const ammo = capability.consumables.ammunition?.quantity ?? 0;
  const fuelStock = capability.consumables.fuel?.quantity ?? 0;
  if (ammunition > ammo || fuel > fuelStock) throw new Error('Supply transfer exceeds canonical national stock.');
  const nextAmmo = deployment.supply.ammunition + ammunition, nextFuel = deployment.supply.fuel + fuel;
  const capabilityNext = {
    ...capability,
    consumables: {
      ...capability.consumables,
      ammunition: capability.consumables.ammunition ? { ...capability.consumables.ammunition, quantity: ammo - ammunition, consumed: (capability.consumables.ammunition.consumed ?? 0) + ammunition } : capability.consumables.ammunition,
      fuel: capability.consumables.fuel ? { ...capability.consumables.fuel, quantity: fuelStock - fuel, consumed: (capability.consumables.fuel.consumed ?? 0) + fuel } : capability.consumables.fuel,
    },
  };
  return {
    ...state,
    military: { ...state.military, countries: { ...state.military.countries, [deployment.countryId]: { ...state.military.countries[deployment.countryId], capability: capabilityNext } } },
    operations: { ...state.operations, deployments: { ...state.operations.deployments, [deploymentId]: { ...deployment, supply: { ammunition: nextAmmo, fuel: nextFuel } } } },
  };
}

function supplyPathExists(state: SimulationState, deployment: Deployment): boolean {
  if (deployment.currentRegionId === deployment.sourceRegionId) return true;
  const queue = [deployment.sourceRegionId], seen = new Set<string>([deployment.sourceRegionId]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current === deployment.currentRegionId) return true;
    for (const neighbour of state.operations.adjacency[current] ?? []) {
      if (seen.has(neighbour)) continue;
      const owner = state.regionOwnership[neighbour];
      const control = state.operations.regionControl[neighbour];
      if (owner === deployment.countryId || (control === 'foreign_controlled' && state.occupationByRegion[neighbour]?.occupierCountryId === deployment.countryId)) {
        seen.add(neighbour); queue.push(neighbour);
      }
    }
  }
  return false;
}

export function runOperationsDay(state: SimulationState, context: SchedulerTaskContext): SimulationState {
  let next = state;
  for (const id of [...next.operations.deploymentOrder]) {
    const deployment = next.operations.deployments[id];
    if (!deployment) continue;
    if (deployment.status === 'deploying') {
      next = { ...next, operations: { ...next.operations, deployments: { ...next.operations.deployments, [id]: { ...deployment, status: 'deployed' } } } };
    } else if (deployment.status === 'moving') {
      const order = deployment.order;
      if (order && order.effectiveOn <= next.date) {
        const adjacency = next.operations.adjacency[deployment.currentRegionId] ?? [];
        if (!adjacency.includes(order.targetRegionId)) throw new Error('Movement order is not along represented land adjacency.');
        if (!movementAccess(next, deployment, order.targetRegionId)) throw new Error('Movement access is denied through neutral or inaccessible territory.');
        next = { ...next, operations: { ...next.operations, deployments: { ...next.operations.deployments, [id]: { ...deployment, currentRegionId: order.targetRegionId, status: 'deployed', order: undefined } } } };
      }
    } else if (deployment.status === 'withdrawing' && deployment.withdrawalEffectiveOn && deployment.withdrawalEffectiveOn <= next.date) {
      next = { ...next, operations: { ...next.operations, deployments: { ...next.operations.deployments, [id]: { ...deployment, status: 'withdrawn', order: undefined } } } };
    }
  }
  next = resolveEngagements(next, context);
  return next;
}

function resolveEngagements(state: SimulationState, context: SchedulerTaskContext): SimulationState {
  let next = state;
  const activeWars = next.wars.filter(war => war.status === 'active');
  const byRegion = new Map<string, Deployment[]>();
  for (const deployment of Object.values(next.operations.deployments)) {
    if (deployment.status === 'withdrawn' || !deployment.warId) continue;
    const list = byRegion.get(deployment.currentRegionId) ?? [];
    list.push(deployment);
    byRegion.set(deployment.currentRegionId, list);
  }
  for (const war of activeWars) {
    for (const component of Object.values(next.operations.components)) {
      if (component.kind !== 'decisive') continue;
      const regionDeployments = byRegion.get(component.regionId) ?? [];
      const attackers = regionDeployments.filter(d => d.warId === war.id && d.countryId === war.attackerCountryId);
      const defenders = regionDeployments.filter(d => d.warId === war.id && d.countryId === war.defenderCountryId);
      if (!attackers.length || !defenders.length) continue;
      const existing = Object.values(next.operations.engagements).find(e => e.warId === war.id && e.componentId === component.id && e.status === 'active');
      next = resolveOneEngagement(next, context, war, component, attackers, defenders, existing?.id);
    }
  }
  for (const [id, engagement] of Object.entries(next.operations.engagements)) {
    if (engagement.status !== 'active') continue;
    const war = next.wars.find(w => w.id === engagement.warId);
    const hasAttackers = Object.values(next.operations.deployments).some(d => d.warId === war?.id && d.countryId === engagement.attackerCountryId && d.currentRegionId === engagement.regionId && d.status !== 'withdrawn');
    const hasDefenders = Object.values(next.operations.deployments).some(d => d.warId === war?.id && d.countryId === engagement.defenderCountryId && d.currentRegionId === engagement.regionId && d.status !== 'withdrawn');
    if (!war || war.status !== 'active' || !hasAttackers || !hasDefenders) {
      next = { ...next, operations: { ...next.operations, engagements: { ...next.operations.engagements, [id]: { ...engagement, status: 'resolved' } } } };
    }
  }
  return next;
}

export function resolveOneEngagement(state: SimulationState, context: SchedulerTaskContext, war: { id: string; attackerCountryId: string; defenderCountryId: string }, component: StrategicComponent, attackers: Deployment[], defenders: Deployment[], existingId?: string): SimulationState {
  let next = state;
  const attackerPower = attackers.reduce((sum, deployment) => sum + combatPower(deployment), 0);
  const defenderPower = defenders.reduce((sum, deployment) => sum + combatPower(deployment), 0);
  const ratio = defenderPower > 0 ? attackerPower / defenderPower : 1e6;
  const roll = context.random.integer(0, 10000, { entityId: `${war.id}:${component.id}` });
  const attackerWins = ratio >= 1 ? roll < 9000 : roll < 2000;
  const loser = attackerWins ? defenders : attackers;
  const lossFraction = attackerWins ? 0.15 : 0.08;
  let ammoConsumed = 0;
  let fuelConsumed = 0;
  for (const deployment of [...attackers, ...defenders]) {
    const isLoser = loser.includes(deployment);
    const losses = isLoser ? Math.min(deployment.personnel, Math.max(1, Math.floor(deployment.personnel * lossFraction))) : 0;
    const ammo = Math.min(deployment.supply.ammunition, Math.max(1, Math.floor(deployment.personnel * (isLoser ? 0.05 : 0.03))));
    const fuel = Math.min(deployment.supply.fuel, Math.max(0, Math.floor(deployment.personnel / 20)));
    const equipmentLosses: Partial<Record<MilitaryItem, number>> = {};
    if (isLoser) {
      for (const [item, quantity] of Object.entries(deployment.equipment)) {
        const lost = Math.min(quantity as number, Math.floor((quantity as number) * lossFraction));
        if (lost > 0) equipmentLosses[item as MilitaryItem] = lost;
      }
    }
    ammoConsumed += ammo;
    fuelConsumed += fuel;
    next = applyMilitaryLosses(next, deployment, losses, equipmentLosses);
    const nextPersonnel = deployment.personnel - losses;
    const nextLossEquipment: Partial<Record<MilitaryItem, number>> = { ...deployment.losses.equipment };
    for (const [item, lost] of Object.entries(equipmentLosses)) nextLossEquipment[item as MilitaryItem] = (nextLossEquipment[item as MilitaryItem] ?? 0) + (lost as number);
    next = {
      ...next,
      operations: {
        ...next.operations,
        deployments: {
          ...next.operations.deployments,
          [deployment.id]: {
            ...deployment,
            personnel: nextPersonnel,
            status: nextPersonnel <= 0 ? 'withdrawn' : deployment.status,
            supply: { ammunition: deployment.supply.ammunition - ammo, fuel: deployment.supply.fuel - fuel },
            equipment: Object.fromEntries(Object.entries(deployment.equipment).map(([item, quantity]) => [item, (quantity as number) - (equipmentLosses[item as MilitaryItem] ?? 0)])),
            losses: {
              personnel: deployment.losses.personnel + losses,
              equipment: nextLossEquipment,
            },
          },
        },
      },
    };
  }
  const previousEngagement = existingId ? next.operations.engagements[existingId] : undefined;
  const engagement: Engagement = {
    id: existingId ?? operationsEngagementId(next.operations.nextEngagementSequence),
    warId: war.id,
    regionId: component.regionId,
    componentId: component.id,
    attackerCountryId: war.attackerCountryId,
    defenderCountryId: war.defenderCountryId,
    startDate: next.date,
    status: 'active',
    attackerLosses: { personnel: attackers.reduce((sum, d) => sum + (next.operations.deployments[d.id]?.losses.personnel ?? d.losses.personnel), 0), equipment: {} },
    defenderLosses: { personnel: defenders.reduce((sum, d) => sum + (next.operations.deployments[d.id]?.losses.personnel ?? d.losses.personnel), 0), equipment: {} },
    consumed: { ammunition: (previousEngagement?.consumed.ammunition ?? 0) + ammoConsumed, fuel: (previousEngagement?.consumed.fuel ?? 0) + fuelConsumed },
  };
  next = {
    ...next,
    operations: {
      ...next.operations,
      engagements: { ...next.operations.engagements, [engagement.id]: engagement },
      engagementOrder: existingId ? next.operations.engagementOrder : [...next.operations.engagementOrder, engagement.id],
      nextEngagementSequence: existingId ? next.operations.nextEngagementSequence : next.operations.nextEngagementSequence + 1,
    },
  };
  return next;
}

function applyMilitaryLosses(state: SimulationState, deployment: Deployment, personnelLosses: number, equipmentLosses: Partial<Record<MilitaryItem, number>>): SimulationState {
  let next = state;
  const country = next.military.countries[deployment.countryId];
  const capability = country?.capability;
  if (!capability) return next;
  const assignments = { ...capability.assignments };
  assignments[deployment.sourceRegionId] = Math.max(0, (assignments[deployment.sourceRegionId] ?? 0) - personnelLosses);
  const equipment = { ...capability.equipment };
  for (const [item, lost] of Object.entries(equipmentLosses)) {
    const stock = equipment[item as MilitaryItem];
    if (!stock) continue;
    equipment[item as MilitaryItem] = {
      ...stock,
      operational: Math.max(0, stock.operational - (lost as number)),
      destroyed: (stock.destroyed ?? 0) + (lost as number),
    };
  }
  next = {
    ...next,
    military: {
      ...next.military,
      countries: {
        ...next.military.countries,
        [deployment.countryId]: { ...country, capability: { ...capability, assignments, equipment } },
      },
    },
  };
  const region = next.socioeconomy.regions[deployment.sourceRegionId];
  const oldPopulation = next.populationByRegion[deployment.sourceRegionId] ?? 0;
  const newPopulation = Math.max(0, oldPopulation - personnelLosses);
  next = { ...next, populationByRegion: { ...next.populationByRegion, [deployment.sourceRegionId]: newPopulation } };
  if (region && newPopulation > 0) {
    const economy = region.economy;
    if (economy) {
      const labourForce = Math.max(1, ratio(newPopulation, MODEL.labourBps, 10000));
      const reserved = reservedPersonnelForRegion(next, deployment.sourceRegionId);
      const employed = Math.min(economy.employed, Math.max(0, labourForce - reserved));
      const unemployed = labourForce - employed - reserved;
      const cohortLosses = allocate(personnelLosses, region.cohorts.map(c => c.persons));
      const cohorts = region.cohorts.map((c, i) => ({ ...c, persons: Math.max(0, c.persons - cohortLosses[i]) })).filter(c => c.persons > 0);
      next = {
        ...next,
        socioeconomy: {
          ...next.socioeconomy,
          regions: {
            ...next.socioeconomy.regions,
            [deployment.sourceRegionId]: {
              ...region,
              population: newPopulation,
              cohorts,
              economy: { ...economy, labourForce, employed, unemployed },
            },
          },
        },
      };
    }
  }
  return next;
}

function reservedPersonnelForRegion(state: SimulationState, regionId: string): number {
  let total = 0;
  for (const country of Object.values(state.military.countries)) {
    total += country.capability?.assignments[regionId] ?? 0;
  }
  return total;
}

function combatPower(deployment: Deployment): number {
  let equipment = 0;
  const fuel = deployment.supply.fuel;
  const ammo = deployment.supply.ammunition;
  for (const [item, quantity] of Object.entries(deployment.equipment)) {
    const mechanized = item === 'armour' || item === 'artillery' || item === 'truck';
    const usable = mechanized ? Math.min(quantity as number, fuel) : (quantity as number);
    const weight = item === 'armour' ? 40 : item === 'artillery' ? 30 : item === 'communications' ? 10 : item === 'truck' ? 5 : 1;
    equipment += usable * weight;
  }
  const offensivePersonnel = Math.min(deployment.personnel, ammo);
  return offensivePersonnel + equipment;
}

function movementAccess(state: SimulationState, deployment: Deployment, targetRegionId: string): boolean {
  const owner = state.regionOwnership[targetRegionId];
  if (owner === deployment.countryId) return true;
  if (state.occupationByRegion[targetRegionId]?.occupierCountryId === deployment.countryId) return true;
  if (deployment.warId) {
    const war = state.wars.find(w => w.id === deployment.warId);
    if (war && war.status === 'active' && owner === (war.attackerCountryId === deployment.countryId ? war.defenderCountryId : war.attackerCountryId)) return true;
  }
  return false;
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function deployedTotals(state: SimulationState, countryId: string) {
  let personnel = 0;
  const equipment: Partial<Record<MilitaryItem, number>> = {};
  for (const deployment of Object.values(state.operations.deployments)) {
    if (deployment.countryId !== countryId || deployment.status === 'withdrawn') continue;
    personnel += deployment.personnel;
    for (const [item, quantity] of Object.entries(deployment.equipment)) {
      const key = item as MilitaryItem;
      equipment[key] = (equipment[key] ?? 0) + (quantity as number);
    }
  }
  return { personnel, equipment };
}

export function deployedPersonnelByRegion(state: SimulationState, countryId: string): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const deployment of Object.values(state.operations.deployments)) {
    if (deployment.countryId !== countryId || deployment.status === 'withdrawn') continue;
    map.set(deployment.sourceRegionId, (map.get(deployment.sourceRegionId) ?? 0) + deployment.personnel);
  }
  return map;
}

export function deployedEquipmentByCountry(state: SimulationState, countryId: string): Partial<Record<MilitaryItem, number>> {
  const equipment: Partial<Record<MilitaryItem, number>> = {};
  for (const deployment of Object.values(state.operations.deployments)) {
    if (deployment.countryId !== countryId || deployment.status === 'withdrawn') continue;
    for (const [item, quantity] of Object.entries(deployment.equipment)) {
      const key = item as MilitaryItem;
      equipment[key] = (equipment[key] ?? 0) + (quantity as number);
    }
  }
  return equipment;
}

export function deployedPersonnelTotal(state: SimulationState, countryId: string): number {
  let total = 0;
  for (const deployment of Object.values(state.operations.deployments)) {
    if (deployment.countryId !== countryId || deployment.status === 'withdrawn') continue;
    total += deployment.personnel;
  }
  return total;
}

export const registerOperationsTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'operations.daily', cadence: 'daily', priority: OPERATIONS_MODEL.schedulerPriority, run: runOperationsDay });
