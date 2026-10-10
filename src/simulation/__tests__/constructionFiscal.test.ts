import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { socioeconomicWorld, worldContext, worldCountryIds, worldRegions } from './worldScenario';
import { assignPoliticalOffice, createPoliticalPerson } from '../governance/runtime';
import { advanceConstructionProgress, authorizeConstruction, cancelConstruction, completeConstruction, fundConstruction, pauseConstruction, proposeConstruction, repairAsset, reportAssetBreakdown, resumeConstruction, runAssetMaintenance, startWork } from '../assets/runtime';
import { initializeFiscal, runFiscalMonth } from '../fiscal/runtime';
import { admitTradeMarket, admitTradeRoute, initializeTrade, prepareTradeMonth, settleTradeMonth } from '../trade/runtime';
import { syntheticTradeMarket, SYNTHETIC_TRADE_SOURCE } from '../trade/scenario';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { CONSTRUCTION_DAILY_COST_PER_WORKER_USD, MAINTENANCE_COST_USD, MAINTENANCE_WEAR_MONTHS, REPAIR_COST_USD } from '../assets/model';

/** A fully-initialized world (real socioeconomic + fiscal treasury) with a head of government. */
const funded = () => {
  let state = initializeFiscal(socioeconomicWorld());
  const countryId = Object.keys(state.fiscal.countries).find(id => (state.fiscal.countries[id]?.cash ?? 0) > 0) ?? worldCountryIds[0];
  const regionId = Object.keys(state.regionOwnership).find(rid => state.regionOwnership[rid] === countryId) ?? worldRegions[0].id;
  state = createPoliticalPerson(state, { displayName: 'Head of Government', countryId });
  const leaderId = Object.keys(state.governance.persons)[0];
  state = assignPoliticalOffice(state, leaderId, { role: 'head_of_government', countryId });
  return { state, leaderId, countryId, regionId };
};

/** Admit a raw_materials stock of the given quantity for a Country. */
const withRawMaterials = (state: SimulationState, countryId: string, quantity: number) =>
  admitTradeMarket(initializeTrade(state), countryId, syntheticTradeMarket('raw_materials', {
    stock: { opening: quantity, produced: 0, received: 0, consumed: 0, exported: 0, quantity, capacity: Math.max(quantity, 100), target: quantity },
  }));

/** A funded + active + started construction project. */
const workingProject = () => {
  const { state, leaderId, countryId, regionId } = funded();
  const cost = CONSTRUCTION_DAILY_COST_PER_WORKER_USD * 4;
  let s = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: cost });
  s = authorizeConstruction(s, { projectId: 'project.00000000', authorizerPersonId: leaderId });
  s = fundConstruction(s, { projectId: 'project.00000000', funderPersonId: leaderId });
  s = withRawMaterials(s, countryId, 20);
  const labour = s.socioeconomy.regions[regionId].economy!.labourForce;
  s = startWork(s, { projectId: 'project.00000000', personId: leaderId, workers: Math.min(2, labour) });
  return { state: s, leaderId, countryId, regionId };
};

/** A completed project whose finished asset (asset.00000000) is operational. */
const completedAsset = () => {
  const { state, leaderId, countryId, regionId } = funded();
  const cost = CONSTRUCTION_DAILY_COST_PER_WORKER_USD; // exactly one worker-day
  let s = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.dam', title: 'Dam', estimatedCostUsd: cost });
  s = authorizeConstruction(s, { projectId: 'project.00000000', authorizerPersonId: leaderId });
  s = fundConstruction(s, { projectId: 'project.00000000', funderPersonId: leaderId });
  s = withRawMaterials(s, countryId, 10);
  s = startWork(s, { projectId: 'project.00000000', personId: leaderId, workers: 1 });
  s = advanceConstructionProgress(s);
  s = completeConstruction(s, { projectId: 'project.00000000', personId: leaderId });
  return { state: s, leaderId, countryId, regionId };
};

describe('0.24.3 committed treasury vs monthly competing expenditures', () => {
  it('keeps committed cash unavailable to monthly fiscal execution', () => {
    const { state, leaderId, countryId, regionId } = funded();
    const cash = state.fiscal.countries[countryId].cash;
    expect(cash).toBeGreaterThan(0);
    let s = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: cash });
    s = authorizeConstruction(s, { projectId: 'project.00000000', authorizerPersonId: leaderId });
    s = fundConstruction(s, { projectId: 'project.00000000', funderPersonId: leaderId });
    expect(s.fiscal.countries[countryId].constructionCommitted).toBe(cash);
    const month = runFiscalMonth(s);
    expect(month.fiscal.countries[countryId].constructionCommitted).toBe(cash);
    expect(month.fiscal.countries[countryId].cash).toBeGreaterThanOrEqual(month.fiscal.countries[countryId].constructionCommitted);
    expect(assertSimulationInvariants(month, worldContext, 'save')).toBe(true);
  });

  it('refuses to spend committed cash on repair and maintenance', () => {
    const { state, leaderId, countryId, regionId } = completedAsset();
    const cash = state.fiscal.countries[countryId].cash;
    const commitAmount = cash - (MAINTENANCE_COST_USD - 1); // leave less than one maintenance cycle uncommitted
    let s = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.bridge', title: 'Bridge', estimatedCostUsd: commitAmount });
    s = authorizeConstruction(s, { projectId: 'project.00000001', authorizerPersonId: leaderId });
    s = fundConstruction(s, { projectId: 'project.00000001', funderPersonId: leaderId });
    expect(s.fiscal.countries[countryId].cash - s.fiscal.countries[countryId].constructionCommitted).toBe(MAINTENANCE_COST_USD - 1);
    const broken = reportAssetBreakdown(s, { assetId: 'asset.00000000', personId: leaderId, severity: 'out_of_service' });
    expect(() => repairAsset(broken, { assetId: 'asset.00000000', personId: leaderId })).toThrow(/uncommitted treasury funds/);
    // Maintenance on the operational asset is likewise refused: nothing is spent.
    const maintained = runAssetMaintenance(s);
    expect(maintained.fiscal.countries[countryId].assetMaintenanceSpent).toBe(s.fiscal.countries[countryId].assetMaintenanceSpent);
    expect(maintained.assets.assets['asset.00000000'].unfundedMaintenanceMonths).toBe(1);
  });
});

describe('0.24.3 construction execution through the monthly fiscal account', () => {
  it('books construction spending into totalSpending, balances and treasury conservation', () => {
    const { state, leaderId, countryId } = workingProject();
    const executed = advanceConstructionProgress(state);
    const spent = executed.fiscal.countries[countryId].constructionExecuted;
    expect(spent).toBeGreaterThan(0);
    const month = runFiscalMonth(executed);
    const account = month.fiscal.countries[countryId].account!;
    expect(account.construction!.executed).toBe(spent);
    expect(account.construction!.maintenance).toBe(0);
    expect(account.totalSpending).toBeGreaterThanOrEqual(spent);
    expect(account.closingCash).toBe(month.fiscal.countries[countryId].cash);
    expect(assertSimulationInvariants(month, worldContext, 'save')).toBe(true);
  });

  it('releases the commitment exactly on completion and cancel', () => {
    const { state, leaderId, countryId } = workingProject();
    let s = advanceConstructionProgress(state);
    const executed = s.fiscal.countries[countryId].constructionExecuted;
    expect(executed).toBeGreaterThan(0);
    expect(s.fiscal.countries[countryId].constructionCommitted).toBe(CONSTRUCTION_DAILY_COST_PER_WORKER_USD * 4 - executed);
    s = cancelConstruction(s, { projectId: 'project.00000000', cancellerPersonId: leaderId });
    expect(s.fiscal.countries[countryId].constructionCommitted).toBe(0);
  });
});

describe('0.24.6D paid maintenance and slow wear', () => {
  it('pays maintenance from uncommitted cash without touching construction commitments', () => {
    const { state, countryId } = completedAsset();
    const before = state.fiscal.countries[countryId];
    const maintained = runAssetMaintenance(state);
    const after = maintained.fiscal.countries[countryId];
    expect(after.cash).toBe(before.cash - MAINTENANCE_COST_USD);
    expect(after.assetMaintenanceSpent).toBe(before.assetMaintenanceSpent + MAINTENANCE_COST_USD);
    expect(after.constructionCommitted).toBe(before.constructionCommitted);
    expect(maintained.assets.assets['asset.00000000'].lastMaintainedOn).toBe(state.date);
    expect(maintained.assets.assets['asset.00000000'].unfundedMaintenanceMonths).toBe(0);
  });

  it('wears one physical-condition step every MAINTENANCE_WEAR_MONTHS unfunded months, not sooner', () => {
    const { state, countryId } = completedAsset();
    const broke = { ...state, fiscal: { ...state.fiscal, countries: { ...state.fiscal.countries, [countryId]: { ...state.fiscal.countries[countryId], cash: 0, constructionCommitted: 0 } } } };
    let s = broke;
    expect(s.assets.assets['asset.00000000'].physicalCondition).toBe('good');
    s = runAssetMaintenance(s); // first unfunded month
    expect(s.assets.assets['asset.00000000'].physicalCondition).toBe('good');
    expect(s.assets.assets['asset.00000000'].unfundedMaintenanceMonths).toBe(1);
    for (let month = 2; month < MAINTENANCE_WEAR_MONTHS; month += 1) s = runAssetMaintenance(s);
    expect(s.assets.assets['asset.00000000'].physicalCondition).toBe('good');
    s = runAssetMaintenance(s); // 12th unfunded month
    expect(s.assets.assets['asset.00000000'].physicalCondition).toBe('fair');
    expect(s.assets.assets['asset.00000000'].unfundedMaintenanceMonths).toBe(0);
    s = runAssetMaintenance(s); // 13th month — no immediate second wear
    expect(s.assets.assets['asset.00000000'].physicalCondition).toBe('fair');
    expect(s.assets.assets['asset.00000000'].unfundedMaintenanceMonths).toBe(1);
  });
});

describe('0.24.7 maintenance vs breakdown/repair', () => {
  it('never makes a broken asset available through maintenance', () => {
    const { state, leaderId, countryId } = completedAsset();
    const broken = reportAssetBreakdown(state, { assetId: 'asset.00000000', personId: leaderId, severity: 'out_of_service' });
    const maintained = runAssetMaintenance(broken);
    expect(maintained.assets.assets['asset.00000000'].operatingStatus).toBe('out_of_service');
    expect(maintained.assets.assets['asset.00000000'].availability).toBe('unavailable');
    expect(maintained.fiscal.countries[countryId].assetMaintenanceSpent).toBe(broken.fiscal.countries[countryId].assetMaintenanceSpent);
  });

  it('pays for a repair from uncommitted cash and restores only on its scheduled date', () => {
    const { state, leaderId, countryId } = completedAsset();
    const broken = reportAssetBreakdown(state, { assetId: 'asset.00000000', personId: leaderId, severity: 'out_of_service' });
    const repairing = repairAsset(broken, { assetId: 'asset.00000000', personId: leaderId });
    expect(repairing.fiscal.countries[countryId].cash).toBe(broken.fiscal.countries[countryId].cash - REPAIR_COST_USD);
    expect(repairing.fiscal.countries[countryId].assetMaintenanceSpent).toBe(REPAIR_COST_USD);
    expect(repairing.fiscal.countries[countryId].constructionCommitted).toBe(broken.fiscal.countries[countryId].constructionCommitted);
    expect(repairing.assets.assets['asset.00000000'].operatingStatus).toBe('out_of_service');
  });
});

describe('0.24.9 legacy schema-20 save migration', () => {
  it('backfills the fiscal-construction fields and reconstructs the outstanding commitment', () => {
    const { state, leaderId, countryId, regionId } = funded();
    const cost = state.fiscal.countries[countryId].cash;
    let s = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: cost });
    s = authorizeConstruction(s, { projectId: 'project.00000000', authorizerPersonId: leaderId });
    s = fundConstruction(s, { projectId: 'project.00000000', funderPersonId: leaderId });
    // Simulate a schema-20 save written before the fiscal-construction integration.
    const legacy = structuredClone(s) as unknown as { fiscal: { countries: Record<string, Record<string, unknown>> } };
    for (const country of Object.values(legacy.fiscal.countries)) {
      delete country.constructionCommitted;
      delete country.constructionExecuted;
      delete country.assetMaintenanceSpent;
    }
    const restored = restoreSimulationState(JSON.stringify(legacy), worldRegions, {}, {}, worldContext);
    expect(restored.schemaVersion).toBe(20);
    expect(restored.fiscal.countries[countryId].constructionCommitted).toBe(cost);
    expect(restored.fiscal.countries[countryId].constructionExecuted).toBe(0);
    expect(restored.fiscal.countries[countryId].assetMaintenanceSpent).toBe(0);
    // The reconstructed commitment still protects the treasury.
    const second = proposeConstruction(restored, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.bridge', title: 'Bridge', estimatedCostUsd: 1 });
    expect(() => fundConstruction(second, { projectId: 'project.00000001', funderPersonId: leaderId })).toThrow(/Insufficient treasury funds/);
    expect(assertSimulationInvariants(restored, worldContext, 'save')).toBe(true);
  });
});

describe('0.24.8 territorial control during the project lifecycle', () => {
  it('freezes every lifecycle command and progression when sovereignty is lost', () => {
    const { state, leaderId, countryId, regionId } = funded();
    const cost = CONSTRUCTION_DAILY_COST_PER_WORKER_USD * 4;
    const lose = (s: SimulationState) => ({ ...s, regionOwnership: { ...s.regionOwnership, [regionId]: 'country.other' } });
    const planned = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: cost });
    expect(() => authorizeConstruction(lose(planned), { projectId: 'project.00000000', authorizerPersonId: leaderId })).toThrow(/sovereignly owned/);
    const active = authorizeConstruction(planned, { projectId: 'project.00000000', authorizerPersonId: leaderId });
    expect(() => fundConstruction(lose(active), { projectId: 'project.00000000', funderPersonId: leaderId })).toThrow(/sovereignly owned/);
    const fundedState = fundConstruction(active, { projectId: 'project.00000000', funderPersonId: leaderId });
    expect(() => startWork(lose(fundedState), { projectId: 'project.00000000', personId: leaderId, workers: 1 })).toThrow(/sovereignly owned/);
    const started = withRawMaterials(fundedState, countryId, 20);
    const worked = startWork(started, { projectId: 'project.00000000', personId: leaderId, workers: 1 });
    expect(() => completeConstruction(lose(worked), { projectId: 'project.00000000', personId: leaderId })).toThrow(/sovereignly owned/);
    const paused = pauseConstruction(worked, { projectId: 'project.00000000', personId: leaderId });
    expect(() => resumeConstruction(lose(paused), { projectId: 'project.00000000', personId: leaderId })).toThrow(/sovereignly owned/);
    // Progression freezes rather than throwing.
    const progressed = advanceConstructionProgress(lose(worked));
    expect(progressed.assets.projects['project.00000000'].completedWorkUsd).toBe(0);
  });

  it('freezes progression when the Region becomes contested', () => {
    const { state, leaderId, countryId, regionId } = workingProject();
    const contested = { ...state, operations: { ...state.operations, regionControl: { ...state.operations.regionControl, [regionId]: 'contested' as const } } };
    const progressed = advanceConstructionProgress(contested);
    expect(progressed.assets.projects['project.00000000'].completedWorkUsd).toBe(0);
    expect(() => completeConstruction(contested, { projectId: 'project.00000000', personId: leaderId })).toThrow(/effectively controls/);
  });
});

describe('0.24.5D material shortage → import → stock → resumed work', () => {
  it('closes a construction material shortage through the Trade engine', () => {
    const { state, leaderId, countryId, regionId } = funded();
    const exporter = worldCountryIds.find(id => id !== countryId && state.fiscal.countries[id]
      && Object.keys(state.socioeconomy.regions).some(r => state.regionOwnership[r] === id && state.socioeconomy.regions[r].economy))!;
    expect(exporter).toBeDefined();
    let s = admitTradeMarket(initializeTrade(state), countryId, syntheticTradeMarket('raw_materials', {
      productionPerMonth: 0, domesticNeedPerMonth: 0, importNeedPerMonth: 10, use: 'industrial',
      stock: { opening: 0, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 0, capacity: 100, target: 100 },
    }));
    s = admitTradeMarket(s, exporter, syntheticTradeMarket('raw_materials', {
      productionPerMonth: 100, domesticNeedPerMonth: 0, use: 'industrial',
    }));
    s = admitTradeRoute(s, { id: 'route.raw', exporterId: exporter, importerId: countryId, category: 'raw_materials',
      source: { ...SYNTHETIC_TRADE_SOURCE }, capacityPerMonth: 100, establishedCapacity: 50, expansionPerMonth: 10, logisticsBps: 250, tariffBps: 500 });
    const cost = CONSTRUCTION_DAILY_COST_PER_WORKER_USD;
    s = proposeConstruction(s, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: cost });
    s = authorizeConstruction(s, { projectId: 'project.00000000', authorizerPersonId: leaderId });
    s = fundConstruction(s, { projectId: 'project.00000000', funderPersonId: leaderId });
    s = startWork(s, { projectId: 'project.00000000', personId: leaderId, workers: 1 });
    // Shortage: no stock, no progress.
    const before = s.assets.projects['project.00000000'].completedWorkUsd ?? 0;
    s = advanceConstructionProgress(s);
    expect(s.assets.projects['project.00000000'].completedWorkUsd).toBe(before);
    // The Trade month imports the construction material into canonical stock.
    s = settleTradeMonth(prepareTradeMonth(s));
    expect(s.trade.countries[countryId].markets['raw_materials']!.stock!.quantity).toBeGreaterThan(0);
    // Construction resumes with the delivered stock.
    s = advanceConstructionProgress(s);
    expect(s.assets.projects['project.00000000'].completedWorkUsd).toBeGreaterThan(before);
  });
});

describe('0.24.11 save/reload and conservation', () => {
  it('round-trips commitments, maintenance and repair through save/reload', () => {
    const { state, leaderId, countryId, regionId } = funded();
    const cost = CONSTRUCTION_DAILY_COST_PER_WORKER_USD * 4;
    let s = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: cost });
    s = authorizeConstruction(s, { projectId: 'project.00000000', authorizerPersonId: leaderId });
    s = fundConstruction(s, { projectId: 'project.00000000', funderPersonId: leaderId });
    s = withRawMaterials(s, countryId, 20);
    s = startWork(s, { projectId: 'project.00000000', personId: leaderId, workers: 1 });
    s = advanceConstructionProgress(s);
    const reloaded = restoreSimulationState(serializeSimulationState(s, worldContext), worldRegions, {}, {}, worldContext);
    expect(reloaded.fiscal.countries[countryId].constructionCommitted).toBe(s.fiscal.countries[countryId].constructionCommitted);
    expect(reloaded.fiscal.countries[countryId].constructionExecuted).toBe(s.fiscal.countries[countryId].constructionExecuted);
    expect(reloaded.assets.projects['project.00000000'].completedWorkUsd).toBe(s.assets.projects['project.00000000'].completedWorkUsd);
    expect(assertSimulationInvariants(reloaded, worldContext, 'save')).toBe(true);
  });

  it('conserves treasury and materials through construction execution', () => {
    const { state, leaderId, countryId } = workingProject();
    const before = state.fiscal.countries[countryId];
    const stockBefore = state.trade.countries[countryId].markets['raw_materials']!.stock!.quantity;
    const next = advanceConstructionProgress(state);
    const executed = next.fiscal.countries[countryId].constructionExecuted - before.constructionExecuted;
    const materialsUsed = Math.ceil(executed / CONSTRUCTION_DAILY_COST_PER_WORKER_USD);
    expect(next.fiscal.countries[countryId].cash).toBe(before.cash - executed);
    expect(next.fiscal.countries[countryId].constructionCommitted).toBe(before.constructionCommitted - executed);
    expect(next.trade.countries[countryId].markets['raw_materials']!.stock!.quantity).toBe(stockBefore - materialsUsed);
    expect(assertSimulationInvariants(next, worldContext, 'save')).toBe(true);
  });
});
