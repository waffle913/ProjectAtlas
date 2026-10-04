import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { OPERATIONS_MODEL, OPERATIONS_VERSION, operationsComponentId, validMilitaryItem } from './model';
import { EQUIPMENT_REGISTRY, presentPersonnel, trainingPersonnel, type MilitaryItem } from '../military/model';

export const operationsInvariant: SimulationInvariant = {
  id: 'operations-0.19-conservation',
  check: (state, context) => {
    const errors: string[] = [];
    const operations = state.operations;
    if (!operations || operations.version !== OPERATIONS_VERSION || !operations.deployments || !Array.isArray(operations.deploymentOrder) || !operations.components || !Array.isArray(operations.componentOrder) || !operations.regionControl || !operations.adjacency) return ['Malformed operations state.'];
    if (!operations.initializedOn) return Object.keys(operations.deployments).length || Object.keys(operations.components).length || Object.keys(operations.regionControl).length ? ['Uninitialized operations contain material state.'] : [];
    if (!validDate(operations.initializedOn) || operations.initializedOn! > state.date) errors.push('Invalid operations initialization date.');
    if (new Set(operations.deploymentOrder).size !== operations.deploymentOrder.length || operations.deploymentOrder.some(id => !operations.deployments[id]) || Object.keys(operations.deployments).some(id => !operations.deploymentOrder.includes(id))) errors.push('Operations deployment order does not reconcile.');
    for (const id of Object.keys(operations.deployments)) {
      const match = /^deployment\.(\d{8})$/.exec(id);
      if (!match || Number(match[1]) >= operations.nextDeploymentSequence) errors.push(`Invalid or reused deployment sequence ${id}.`);
    }
    for (const [id, deployment] of Object.entries(operations.deployments)) {
      if (id !== deployment.id || !/^deployment\.\d{8}$/.test(deployment.id) || !context.countryIds.has(deployment.countryId) || !context.regionIds.has(deployment.sourceRegionId) || !context.regionIds.has(deployment.currentRegionId) || !Number.isSafeInteger(deployment.personnel) || deployment.personnel <= 0 || !['deploying', 'deployed', 'withdrawing', 'withdrawn'].includes(deployment.status) || !['modelled', 'synthetic'].includes(deployment.provenance) || !deployment.limitation?.trim()) errors.push(`Malformed deployment ${id}.`);
      if (deployment.warId) {
        const war = state.wars.find(w => w.id === deployment.warId);
        if (!war || (war.attackerCountryId !== deployment.countryId && war.defenderCountryId !== deployment.countryId)) errors.push(`Deployment ${id} references an invalid or non-belligerent war.`);
      }
      for (const [item, quantity] of Object.entries(deployment.equipment)) {
        if (!validMilitaryItem(item) || !Number.isSafeInteger(quantity) || quantity < 0 || EQUIPMENT_REGISTRY[item as MilitaryItem].consumable) errors.push(`Invalid deployment equipment on ${id}.`);
      }
      if (deployment.order && (!context.regionIds.has(deployment.order.targetRegionId) || !validDate(deployment.order.effectiveOn))) errors.push(`Invalid deployment movement order on ${id}.`);
      if (deployment.withdrawalEffectiveOn !== undefined && (!validDate(deployment.withdrawalEffectiveOn) || deployment.status !== 'withdrawing')) errors.push(`Invalid deployment withdrawal chronology on ${id}.`);
      if (!Number.isSafeInteger(deployment.supply.ammunition) || deployment.supply.ammunition < 0 || !Number.isSafeInteger(deployment.supply.fuel) || deployment.supply.fuel < 0) errors.push(`Invalid deployment supply on ${id}.`);
      if (!Number.isSafeInteger(deployment.losses.personnel) || deployment.losses.personnel < 0 || deployment.losses.personnel > deployment.personnel) errors.push(`Invalid deployment personnel losses on ${id}.`);
      for (const [item, quantity] of Object.entries(deployment.losses.equipment)) if (!validMilitaryItem(item) || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > (deployment.equipment[item as MilitaryItem] ?? 0)) errors.push(`Invalid deployment equipment losses on ${id}.`);
    }
    const byCountry = new Map<string, { personnel: number; equipment: Partial<Record<MilitaryItem, number>> }>();
    for (const deployment of Object.values(operations.deployments)) {
      if (deployment.status === 'withdrawn') continue;
      const totals = byCountry.get(deployment.countryId) ?? { personnel: 0, equipment: {} };
      totals.personnel += deployment.personnel;
      for (const [item, quantity] of Object.entries(deployment.equipment)) totals.equipment[item as MilitaryItem] = (totals.equipment[item as MilitaryItem] ?? 0) + (quantity as number);
      byCountry.set(deployment.countryId, totals);
    }
    for (const [countryId, totals] of byCountry) {
      const capability = state.military.countries[countryId]?.capability;
      if (!capability) errors.push(`Deployment exists without an admitted capability for ${countryId}.`);
      else {
        if (totals.personnel > presentPersonnel(capability) - trainingPersonnel(capability)) errors.push(`Deployed personnel exceed qualified available personnel for ${countryId}.`);
        for (const [item, quantity] of Object.entries(totals.equipment)) {
          if ((capability.equipment[item as MilitaryItem]?.operational ?? 0) < (quantity as number)) errors.push(`Deployed equipment exceed operational stock for ${item}.`);
        }
      }
    }
    for (const [regionId, control] of Object.entries(operations.regionControl)) {
      if (!context.regionIds.has(regionId) || !['sovereign_controlled', 'contested', 'foreign_controlled'].includes(control)) errors.push(`Invalid operations region control ${regionId}.`);
    }
    for (const [regionId, neighbours] of Object.entries(operations.adjacency)) {
      if (!context.regionIds.has(regionId) || !Array.isArray(neighbours) || new Set(neighbours).size !== neighbours.length) errors.push(`Malformed operations adjacency for ${regionId}.`);
      for (const neighbour of neighbours) {
        if (!context.regionIds.has(neighbour) || neighbour === regionId) errors.push(`Invalid operations adjacency edge ${regionId}->${neighbour}.`);
        if (!(operations.adjacency[neighbour] ?? []).includes(regionId)) errors.push(`Asymmetric operations adjacency edge ${regionId}<->${neighbour}.`);
      }
    }
    for (const [id, component] of Object.entries(operations.components)) {
      if (id !== component.id || !context.regionIds.has(component.regionId) || !['decisive', 'secondary'].includes(component.kind) || !['sourced', 'derived', 'modelled', 'unavailable'].includes(component.coverage) || typeof component.contested !== 'boolean' || component.controllingCountryId !== undefined && !context.countryIds.has(component.controllingCountryId) || !component.provenance?.trim()) errors.push(`Malformed strategic component ${id}.`);
    }
    if (new Set(operations.componentOrder).size !== operations.componentOrder.length || operations.componentOrder.some(id => !operations.components[id]) || Object.keys(operations.components).some(id => !operations.componentOrder.includes(id))) errors.push('Operations component order does not reconcile.');
    for (const id of Object.keys(operations.components)) {
      const match = /^component\.\d{8}$/.exec(id);
      if (match && Number(match[1]) >= operations.nextComponentSequence) errors.push(`Invalid component sequence ${id}.`);
    }
    return errors;
  },
};
