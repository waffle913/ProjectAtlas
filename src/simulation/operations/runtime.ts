import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { integer } from '../socioeconomy/model';
import { hasGovernmentInformationAccess } from '../information/runtime';
import { EQUIPMENT_REGISTRY, presentPersonnel, trainingPersonnel, type MilitaryItem } from '../military/model';
import { emptyOperations, OPERATIONS_MODEL, operationsComponentId, operationsDeploymentId, validMilitaryItem,
  type Deployment, type OperationsState, type RegionControl, type StrategicComponent } from './model';

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
    losses: { personnel: 0, equipment: {} }, provenance: 'modelled', limitation: 'Modelled aggregate operational deployment; not an observed real-world force disposition.',
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
  return { ...state, operations: { ...state.operations, deployments: { ...state.operations.deployments, [deploymentId]: { ...deployment, order: { targetRegionId, effectiveOn, kind: 'move' } } } } };
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

export const registerOperationsTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'operations.daily', cadence: 'daily', priority: OPERATIONS_MODEL.schedulerPriority, run: state => state });
