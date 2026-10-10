import { describe, expect, it } from 'vitest';
import type { SimulationState } from '../../types';
import { socioeconomicWorld, worldContext, worldCountryIds, worldRegions } from './worldScenario';
import { assignPoliticalOffice, createPoliticalPerson } from '../governance/runtime';
import { advanceConstructionProgress, authorizeConstruction, cancelConstruction, completeConstruction, fundConstruction, proposeConstruction, startWork } from '../assets/runtime';
import { initializeFiscal } from '../fiscal/runtime';
import { admitTradeMarket, initializeTrade } from '../trade/runtime';
import { syntheticTradeMarket } from '../trade/scenario';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { CONSTRUCTION_DAILY_COST_PER_WORKER_USD } from '../assets/model';

/** A fully-initialized world with a funded Country and a head of government. */
const funded = () => {
  let state = initializeFiscal(socioeconomicWorld());
  const countryId = Object.keys(state.fiscal.countries).find(id => (state.fiscal.countries[id]?.cash ?? 0) > 0) ?? worldCountryIds[0];
  const regionId = Object.keys(state.regionOwnership).find(rid => state.regionOwnership[rid] === countryId) ?? worldRegions[0].id;
  state = createPoliticalPerson(state, { displayName: 'Head of Government', countryId });
  const leaderId = Object.keys(state.governance.persons)[0];
  state = assignPoliticalOffice(state, leaderId, { role: 'head_of_government', countryId });
  return { state, leaderId, countryId, regionId };
};

/** The full lifecycle: budget -> project -> work -> completion -> finished asset. */
const campaign = (): SimulationState => {
  const { state: s0, leaderId, countryId, regionId } = funded();
  const cost = CONSTRUCTION_DAILY_COST_PER_WORKER_USD * 2; // two worker-days
  let s = proposeConstruction(s0, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: cost });
  s = authorizeConstruction(s, { projectId: 'project.00000000', authorizerPersonId: leaderId });
  s = fundConstruction(s, { projectId: 'project.00000000', funderPersonId: leaderId });
  s = admitTradeMarket(initializeTrade(s), countryId, syntheticTradeMarket('raw_materials', {
    stock: { opening: 10, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 10, capacity: 10, target: 10 },
  }));
  s = startWork(s, { projectId: 'project.00000000', personId: leaderId, workers: 1 });
  s = advanceConstructionProgress(s);
  s = advanceConstructionProgress(s);
  return completeConstruction(s, { projectId: 'project.00000000', personId: leaderId });
};

describe('0.24.11 construction integration campaign', () => {
  it('walks budget->project->work->completion->asset deterministically with save/reload', () => {
    const first = campaign();
    expect(first.assets.projects['project.00000000'].status).toBe('completed');
    expect(first.assets.assets['asset.00000000'].operatingStatus).toBe('operational');
    expect(first.assets.assets['asset.00000000'].capacity.amount).toBeGreaterThan(0);

    // Determinism: the same seed and commands reproduce the identical assets state.
    const second = campaign();
    expect(second.assets).toEqual(first.assets);

    // Save/reload preserves the finished asset and the completed project.
    const reloaded = restoreSimulationState(serializeSimulationState(first, worldContext), worldRegions, {}, {}, worldContext);
    expect(reloaded.assets).toEqual(first.assets);
    expect(assertSimulationInvariants(reloaded, worldContext, 'save')).toBe(true);
  }, 30_000);

  it('supports a world with many projects and preserves invariant integrity', () => {
    const { state: s0, leaderId, countryId, regionId } = funded();
    let s = s0;
    for (let i = 0; i < 5; i += 1) {
      s = proposeConstruction(s, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: `type.item${i}`, title: `Project ${i}`, estimatedCostUsd: CONSTRUCTION_DAILY_COST_PER_WORKER_USD });
    }
    expect(Object.keys(s.assets.projects)).toHaveLength(5);
    expect(s.assets.nextProjectSequence).toBe(5);
    expect(assertSimulationInvariants(s, worldContext, 'save')).toBe(true);
  }, 30_000);

  it('moves money and materials canonically: commit -> spend -> release on cancel', () => {
    const { state, leaderId, countryId, regionId } = funded();
    const cost = CONSTRUCTION_DAILY_COST_PER_WORKER_USD * 2;
    let s = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: cost });
    s = authorizeConstruction(s, { projectId: 'project.00000000', authorizerPersonId: leaderId });
    const beforeCash = s.fiscal.countries[countryId].cash;
    s = fundConstruction(s, { projectId: 'project.00000000', funderPersonId: leaderId });
    expect(s.fiscal.countries[countryId].constructionCommitted).toBe(cost);
    s = admitTradeMarket(initializeTrade(s), countryId, syntheticTradeMarket('raw_materials', {
      stock: { opening: 10, produced: 0, received: 0, consumed: 0, exported: 0, quantity: 10, capacity: 10, target: 10 },
    }));
    s = startWork(s, { projectId: 'project.00000000', personId: leaderId, workers: 1 });
    s = advanceConstructionProgress(s);
    expect(s.fiscal.countries[countryId].constructionExecuted).toBe(CONSTRUCTION_DAILY_COST_PER_WORKER_USD);
    expect(s.fiscal.countries[countryId].cash).toBe(beforeCash - CONSTRUCTION_DAILY_COST_PER_WORKER_USD);
    expect(s.trade.countries[countryId].markets['raw_materials'].stock!.quantity).toBe(9);
    s = cancelConstruction(s, { projectId: 'project.00000000', cancellerPersonId: leaderId });
    expect(s.fiscal.countries[countryId].constructionCommitted).toBe(0);
  }, 30_000);
});
