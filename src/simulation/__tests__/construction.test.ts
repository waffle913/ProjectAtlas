import { describe, expect, it } from 'vitest';
import { socioeconomicWorld, worldBase, worldContext, worldCountryIds, worldRegions } from './worldScenario';
import { assignPoliticalOffice, createPoliticalPerson } from '../governance/runtime';
import { authorizeConstruction, cancelConstruction, fundConstruction, proposeConstruction } from '../assets/runtime';
import { initializeFiscal } from '../fiscal/runtime';
import { assetsInvariant } from '../assets/invariants';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { ASSETS_VERSION } from '../assets/model';

const countryId = worldCountryIds[0];
const regionId = worldRegions[0].id;

/** worldBase + an active person installed as head of government of `countryId`. */
const headOfGovernment = () => {
  let state = createPoliticalPerson(worldBase(), { displayName: 'Head of Government', countryId });
  const leaderId = Object.keys(state.governance.persons)[0];
  state = assignPoliticalOffice(state, leaderId, { role: 'head_of_government', countryId });
  return { state, leaderId };
};

/** headOfGovernment plus a second person holding a legislator office (no construction authority). */
const withLegislator = () => {
  const { state: s0, leaderId } = headOfGovernment();
  let state = createPoliticalPerson(s0, { displayName: 'Legislator', countryId });
  const legislatorId = Object.keys(state.governance.persons).find(id => id !== leaderId)!;
  state = assignPoliticalOffice(state, legislatorId, { role: 'legislator', countryId });
  return { state, leaderId, legislatorId };
};

describe('0.24 construction projects', () => {
  it('initializes an empty canonical project domain within the assets state', () => {
    const state = worldBase();
    expect(state.assets.version).toBe(ASSETS_VERSION);
    expect(state.assets.projects).toEqual({});
    expect(state.assets.projectOrder).toEqual([]);
    expect(state.assets.nextProjectSequence).toBe(0);
    expect(assertSimulationInvariants(state, worldContext, 'save')).toBe(true);
  });

  it('proposes a planned project with a permanent identity and permanent Region reference', () => {
    const { state, leaderId } = headOfGovernment();
    const next = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Regional road' });
    const project = next.assets.projects['project.00000000'];
    expect(project.projectId).toBe('project.00000000');
    expect(project.status).toBe('planned');
    expect(project.countryId).toBe(countryId);
    expect(project.regionId).toBe(regionId);
    expect(project.assetTypeId).toBe('type.road');
    expect(project.proposedByPersonId).toBe(leaderId);
    expect(project.proposedOn).toBe(next.date);
    expect(next.assets.projectOrder).toEqual(['project.00000000']);
    expect(next.assets.nextProjectSequence).toBe(1);
    expect(assertSimulationInvariants(next, worldContext, 'save')).toBe(true);
  });

  it('rejects a proposer who holds no construction authority (legislator)', () => {
    const { state, legislatorId } = withLegislator();
    expect(() => proposeConstruction(state, { proposerPersonId: legislatorId, countryId, regionId, assetTypeId: 'type.road', title: 'Road' }))
      .toThrow(/lacks authority/);
  });

  it('rejects an unknown proposer person', () => {
    const { state } = headOfGovernment();
    expect(() => proposeConstruction(state, { proposerPersonId: 'person.ghost', countryId, regionId, assetTypeId: 'type.road', title: 'Road' }))
      .toThrow(/Unknown or inactive political person/);
  });

  it('rejects a non-canonical Region reference', () => {
    const { state, leaderId } = headOfGovernment();
    expect(() => proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId: 'region.ghost', assetTypeId: 'type.road', title: 'Road' }))
      .toThrow(/Unknown Region/);
  });

  it('authorizes a planned project into active with a dated transition', () => {
    const { state, leaderId } = headOfGovernment();
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.dam', title: 'Dam' });
    const authorized = authorizeConstruction(proposed, { projectId: 'project.00000000', authorizerPersonId: leaderId });
    const project = authorized.assets.projects['project.00000000'];
    expect(project.status).toBe('active');
    expect(project.authorizedOn).toBe(proposed.date);
    expect(project.authorizedByPersonId).toBe(leaderId);
    expect(project.startedOn).toBe(proposed.date);
    expect(assertSimulationInvariants(authorized, worldContext, 'save')).toBe(true);
  });

  it('rejects authorizing an already-active project', () => {
    const { state, leaderId } = headOfGovernment();
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road' });
    const authorized = authorizeConstruction(proposed, { projectId: 'project.00000000', authorizerPersonId: leaderId });
    expect(() => authorizeConstruction(authorized, { projectId: 'project.00000000', authorizerPersonId: leaderId })).toThrow(/planned/);
  });

  it('cancels an active project', () => {
    const { state, leaderId } = headOfGovernment();
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road' });
    const authorized = authorizeConstruction(proposed, { projectId: 'project.00000000', authorizerPersonId: leaderId });
    const cancelled = cancelConstruction(authorized, { projectId: 'project.00000000', cancellerPersonId: leaderId });
    const project = cancelled.assets.projects['project.00000000'];
    expect(project.status).toBe('cancelled');
    expect(project.cancelledOn).toBe(cancelled.date);
    expect(project.cancelledByPersonId).toBe(leaderId);
    expect(assertSimulationInvariants(cancelled, worldContext, 'save')).toBe(true);
  });

  it('rejects a planned project carrying lifecycle residue via the assets invariant', () => {
    const { state, leaderId } = headOfGovernment();
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road' });
    const planned = proposed.assets.projects['project.00000000'];
    const forged = {
      ...proposed,
      assets: { ...proposed.assets, projects: { ...proposed.assets.projects, 'project.00000000': { ...planned, authorizedOn: proposed.date } } },
    };
    expect(assetsInvariant.check(forged, worldContext, 'save')).toContain('Planned project project.00000000 carries lifecycle residue.');
  });

  it('survives a save/reload round-trip without a second project store', () => {
    const { state, leaderId } = headOfGovernment();
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road' });
    const restored = restoreSimulationState(serializeSimulationState(proposed, worldContext), worldRegions, {}, {}, worldContext);
    expect(restored.assets.projects['project.00000000']).toEqual(proposed.assets.projects['project.00000000']);
    expect(restored.assets.projectOrder).toEqual(['project.00000000']);
  });
});

/** A fully-initialized world (real socioeconomic + fiscal treasury) with a head of government. */
const funded = () => {
  let state = initializeFiscal(socioeconomicWorld());
  const fundedCountryId = Object.keys(state.fiscal.countries).find(id => (state.fiscal.countries[id]?.cash ?? 0) > 0)!;
  const fundedRegionId = Object.keys(state.regionOwnership).find(rid => state.regionOwnership[rid] === fundedCountryId) ?? worldRegions[0].id;
  state = createPoliticalPerson(state, { displayName: 'Head of Government', countryId: fundedCountryId });
  const leaderId = Object.keys(state.governance.persons)[0];
  state = assignPoliticalOffice(state, leaderId, { role: 'head_of_government', countryId: fundedCountryId });
  return { state, leaderId, countryId: fundedCountryId, regionId: fundedRegionId };
};

describe('0.24.3 construction financing', () => {
  it('proposes a project with an explicit cost estimate distinct from any commitment', () => {
    const { state, leaderId } = headOfGovernment();
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.dam', title: 'Dam', estimatedCostUsd: 2_500_000 });
    const project = proposed.assets.projects['project.00000000'];
    expect(project.estimatedCostUsd).toBe(2_500_000);
    expect(project.committedUsd).toBeUndefined();
    expect(assertSimulationInvariants(proposed, worldContext, 'save')).toBe(true);
  });

  it('refuses to fund a project without a cost estimate', () => {
    const { state, leaderId } = headOfGovernment();
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road' });
    expect(() => fundConstruction(proposed, { projectId: 'project.00000000', funderPersonId: leaderId })).toThrow(/no cost estimate/);
  });

  it('refuses to fund when the treasury lacks uncommitted cash', () => {
    const { state, leaderId } = headOfGovernment();
    // worldBase carries no fiscal treasury, so available cash is zero.
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: 1 });
    expect(() => fundConstruction(proposed, { projectId: 'project.00000000', funderPersonId: leaderId })).toThrow(/Insufficient treasury funds/);
  });

  it('refuses a funder without the fund_construction authority', () => {
    const { state, leaderId, legislatorId } = withLegislator();
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: 1 });
    expect(() => fundConstruction(proposed, { projectId: 'project.00000000', funderPersonId: legislatorId })).toThrow(/lacks authority/);
  });

  it('commits treasury cash and refuses to reuse it', () => {
    const { state, leaderId, countryId: cid, regionId: rid } = funded();
    const cash = state.fiscal.countries[cid].cash;
    expect(cash).toBeGreaterThan(0);
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId: cid, regionId: rid, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: cash });
    const fundedState = fundConstruction(proposed, { projectId: 'project.00000000', funderPersonId: leaderId });
    expect(fundedState.assets.projects['project.00000000'].committedUsd).toBe(cash);
    // The whole treasury is now committed, so another project cannot be funded (no reuse).
    const second = proposeConstruction(fundedState, { proposerPersonId: leaderId, countryId: cid, regionId: rid, assetTypeId: 'type.bridge', title: 'Bridge', estimatedCostUsd: 1 });
    expect(() => fundConstruction(second, { projectId: 'project.00000001', funderPersonId: leaderId })).toThrow(/Insufficient treasury funds/);
    // The same project cannot be funded twice.
    expect(() => fundConstruction(fundedState, { projectId: 'project.00000000', funderPersonId: leaderId })).toThrow(/already funded/);
  });

  it('releases the commitment when a funded project is cancelled', () => {
    const { state, leaderId, countryId: cid, regionId: rid } = funded();
    const cash = state.fiscal.countries[cid].cash;
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId: cid, regionId: rid, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: cash });
    const fundedState = fundConstruction(proposed, { projectId: 'project.00000000', funderPersonId: leaderId });
    const cancelled = cancelConstruction(fundedState, { projectId: 'project.00000000', cancellerPersonId: leaderId });
    expect(cancelled.assets.projects['project.00000000'].committedUsd).toBeUndefined();
    expect(cancelled.assets.projects['project.00000000'].status).toBe('cancelled');
  });

  it('rejects a commitment exceeding the estimate via the assets invariant', () => {
    const { state, leaderId } = headOfGovernment();
    const proposed = proposeConstruction(state, { proposerPersonId: leaderId, countryId, regionId, assetTypeId: 'type.road', title: 'Road', estimatedCostUsd: 1000 });
    const planned = proposed.assets.projects['project.00000000'];
    const forged = {
      ...proposed,
      assets: { ...proposed.assets, projects: { ...proposed.assets.projects, 'project.00000000': { ...planned, committedUsd: 2000 } } },
    };
    expect(assetsInvariant.check(forged, worldContext, 'save')).toContain('Project project.00000000 has an invalid cost commitment.');
  });
});
