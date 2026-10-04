import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { OPERATIONS_MODEL, OPERATIONS_VERSION, validMilitaryItem } from './model';
import { equipmentTotal, presentPersonnel, trainingPersonnel, type MilitaryItem } from '../military/model';

export const operationsInvariant: SimulationInvariant = {
  id: 'operations-0.19-conservation',
  check: (state, context) => {
    const errors: string[] = [];
    const operations = state.operations;
    if (!operations || operations.version !== OPERATIONS_VERSION || !operations.deployments || !Array.isArray(operations.deploymentOrder) || !operations.components || !Array.isArray(operations.componentOrder) || !operations.regionControl || !operations.adjacency) return ['Malformed operations state.'];
    if (!operations.initializedOn) return Object.keys(operations.deployments).length || Object.keys(operations.components).length || Object.keys(operations.regionControl).length ? ['Uninitialized operations contain material state.'] : [];
    if (!validDate(operations.initializedOn) || operations.initializedOn! > state.date) errors.push('Invalid operations initialization date.');
    if (new Set(operations.deploymentOrder).size !== operations.deploymentOrder.length || operations.deploymentOrder.some(id => !operations.deployments[id]) || Object.keys(operations.deployments).some(id => !operations.deploymentOrder.includes(id))) errors.push('Operations deployment order does not reconcile.');
    for (const [id, deployment] of Object.entries(operations.deployments)) {
      if (id !== deployment.id || !/^deployment\.\d{8}$/.test(deployment.id) || !context.countryIds.has(deployment.countryId) || !context.regionIds.has(deployment.sourceRegionId) || !context.regionIds.has(deployment.currentRegionId) || !Number.isSafeInteger(deployment.personnel) || deployment.personnel <= 0 || !['deploying', 'deployed', 'withdrawing', 'withdrawn'].includes(deployment.status) || !['modelled', 'synthetic'].includes(deployment.provenance) || !deployment.limitation?.trim()) errors.push(`Malformed deployment ${id}.`);
      for (const [item, quantity] of Object.entries(deployment.equipment)) if (!validMilitaryItem(item) || !Number.isSafeInteger(quantity) || quantity < 0) errors.push(`Invalid deployment equipment on ${id}.`);
      if (deployment.order && (!context.regionIds.has(deployment.order.targetRegionId) || !validDate(deployment.order.effectiveOn) || deployment.order.effectiveOn <= state.date)) errors.push(`Invalid deployment movement order on ${id}.`);
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
    for (const [id, component] of Object.entries(operations.components)) {
      if (id !== component.id || !context.regionIds.has(component.regionId) || !['decisive', 'secondary'].includes(component.kind) || !['sourced', 'derived', 'modelled', 'unavailable'].includes(component.coverage) || typeof component.contested !== 'boolean' || component.controllingCountryId !== undefined && !context.countryIds.has(component.controllingCountryId) || !component.provenance?.trim()) errors.push(`Malformed strategic component ${id}.`);
    }
    return errors;
  },
};
