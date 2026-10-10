import type { SimulationState } from '../../types';
import { hasPoliticalAuthority } from '../governance/runtime';
import type { AuthorityCapability } from '../governance/model';
import { reservedPersonnel } from '../military/runtime';
import type { SimulationScheduler } from '../scheduler';
import { assetId, COMPLETED_ASSET_CAPACITY, COMPLETED_ASSET_CAPACITY_UNIT, CONSTRUCTION_DAILY_COST_PER_WORKER_USD, CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY, constructionProjectId, REPAIR_COST_USD, REPAIR_DURATION_DAYS, type AssetRecord, type ConstructionProjectRecord } from './model';
import { availableConstructionMaterials } from './materials';
import { constructionReservedPersonnel } from './workforce';

const requireActivePerson = (state: SimulationState, personId: string) => {
  const person = state.governance.persons[personId];
  if (!person || person.status !== 'active') throw new Error(`Unknown or inactive political person: ${personId}`);
  return person;
};

const requireAuthority = (state: SimulationState, personId: string, countryId: string, capability: AuthorityCapability) => {
  if (!hasPoliticalAuthority(state, personId, countryId, capability)) {
    throw new Error(`Actor lacks authority to ${capability} construction in this Country.`);
  }
};

const requireCountry = (state: SimulationState, countryId: string) => {
  if (!state.engine.fidelityByCountry[countryId]) throw new Error(`Unknown Country: ${countryId}`);
};

/** Canonical Region existence: a Region is canonical when it has a sovereign-ownership
 *  entry, whether or not its current owner is recorded. Territorial control/occupation
 *  constraints are 0.24.8 scope and are not applied here. */
const requireRegion = (state: SimulationState, regionId: string) => {
  if (!(regionId in state.regionOwnership)) throw new Error(`Unknown Region: ${regionId}`);
};

const insertProject = (state: SimulationState, project: ConstructionProjectRecord): SimulationState => ({
  ...state,
  assets: {
    ...state.assets,
    projects: { ...state.assets.projects, [project.projectId]: project },
    projectOrder: [...state.assets.projectOrder, project.projectId],
    nextProjectSequence: state.assets.nextProjectSequence + 1,
  },
});

const updateProject = (state: SimulationState, projectId: string, patch: Partial<ConstructionProjectRecord>): SimulationState => {
  const project = state.assets.projects[projectId];
  return {
    ...state,
    assets: {
      ...state.assets,
      projects: { ...state.assets.projects, [projectId]: { ...project, ...patch } },
    },
  };
};

/** Reconcile each Region's labour force so civilian employment + unemployment +
 *  military reservations + construction reservations exactly conserve the labour
 *  force. A reserved construction worker is never also employed or unemployed. */
export function reconcileConstructionWorkforce(state: SimulationState): SimulationState {
  const regions = { ...state.socioeconomy.regions };
  for (const [id, r] of Object.entries(regions)) {
    if (!r.economy) continue;
    const reserved = reservedPersonnel(state, id) + constructionReservedPersonnel(state, id);
    const e = r.economy;
    if (reserved > e.labourForce) throw new Error('Reserved labour exceeds regional labour force.');
    const employed = Math.min(e.employed, e.labourForce - reserved);
    if (employed !== e.employed || e.unemployed !== e.labourForce - employed - reserved) {
      regions[id] = { ...r, economy: { ...e, employed, unemployed: e.labourForce - employed - reserved } };
    }
  }
  return { ...state, socioeconomy: { ...state.socioeconomy, regions } };
}

/**
 * 0.24.2B/C — Propose a construction project (status `planned`). Requires the
 * `propose_construction` capability in the project's Country. The project is a
 * plan/site, distinct from the finished asset it may later produce (0.24.6B).
 */
export function proposeConstruction(
  state: SimulationState,
  input: { proposerPersonId: string; countryId: string; regionId: string; assetTypeId: string; title: string; estimatedCostUsd?: number },
): SimulationState {
  const proposer = requireActivePerson(state, input.proposerPersonId);
  requireAuthority(state, input.proposerPersonId, input.countryId, 'propose_construction');
  requireCountry(state, input.countryId);
  requireRegion(state, input.regionId);
  if (typeof input.assetTypeId !== 'string' || !input.assetTypeId.trim()) throw new Error('A construction project requires a non-empty asset type.');
  if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('A construction project requires a non-empty title.');
  if (input.estimatedCostUsd !== undefined && (!Number.isSafeInteger(input.estimatedCostUsd) || input.estimatedCostUsd <= 0)) throw new Error('A construction cost estimate must be a positive integer USD amount.');
  const project: ConstructionProjectRecord = {
    projectId: constructionProjectId(state.assets.nextProjectSequence),
    countryId: input.countryId,
    regionId: input.regionId,
    assetTypeId: input.assetTypeId.trim(),
    title: input.title.trim(),
    status: 'planned',
    proposedOn: state.date,
    proposedByPersonId: proposer.id,
    ...(input.estimatedCostUsd !== undefined ? { estimatedCostUsd: input.estimatedCostUsd } : {}),
    coverage: { status: 'modelled' },
  };
  return insertProject(state, project);
}

/**
 * 0.24.2B/C — Authorize a planned project, transitioning it to `active`.
 * Authorization implies the project is approved and construction begins:
 * `authorizedOn` and `startedOn` are both set on the current date. Requires the
 * `authorize_construction` capability in the project's Country.
 */
export function authorizeConstruction(state: SimulationState, input: { projectId: string; authorizerPersonId: string }): SimulationState {
  const authorizer = requireActivePerson(state, input.authorizerPersonId);
  const project = state.assets.projects[input.projectId];
  if (!project) throw new Error(`Unknown construction project: ${input.projectId}`);
  requireAuthority(state, input.authorizerPersonId, project.countryId, 'authorize_construction');
  if (project.status !== 'planned') throw new Error('Only a planned construction project can be authorized.');
  return updateProject(state, input.projectId, {
    status: 'active',
    authorizedOn: state.date,
    authorizedByPersonId: authorizer.id,
    startedOn: state.date,
  });
}

/**
 * 0.24.2B/C + 0.24.3C — Cancel a planned/active/paused project, transitioning it
 * to `cancelled`. Requires the `cancel_construction` capability in the project's
 * Country. Any committed treasury reservation is released (0.24.3C coherent
 * financial treatment): the commitment is cleared so it becomes available again.
 */
export function cancelConstruction(state: SimulationState, input: { projectId: string; cancellerPersonId: string }): SimulationState {
  const canceller = requireActivePerson(state, input.cancellerPersonId);
  const project = state.assets.projects[input.projectId];
  if (!project) throw new Error(`Unknown construction project: ${input.projectId}`);
  requireAuthority(state, input.cancellerPersonId, project.countryId, 'cancel_construction');
  if (!['planned', 'active', 'paused'].includes(project.status)) throw new Error('A completed or already-cancelled construction project cannot be cancelled.');
  const cancelled = updateProject(state, input.projectId, {
    status: 'cancelled',
    cancelledOn: state.date,
    cancelledByPersonId: canceller.id,
    committedUsd: undefined,
    reservedWorkers: undefined,
  });
  return reconcileConstructionWorkforce(cancelled);
}

/**
 * 0.24.3B/C — Commit the project's estimated cost from the Country treasury.
 * Requires the `fund_construction` capability. Refuses without a cost estimate,
 * without sufficient uncommitted treasury cash, or when the project is already
 * funded (a commitment is never reusable). Cancellation releases the commitment.
 */
export function fundConstruction(state: SimulationState, input: { projectId: string; funderPersonId: string }): SimulationState {
  requireActivePerson(state, input.funderPersonId);
  const project = state.assets.projects[input.projectId];
  if (!project) throw new Error(`Unknown construction project: ${input.projectId}`);
  requireAuthority(state, input.funderPersonId, project.countryId, 'fund_construction');
  if (project.status === 'completed' || project.status === 'cancelled') throw new Error('A completed or cancelled construction project cannot be funded.');
  if (project.estimatedCostUsd === undefined) throw new Error('This construction project has no cost estimate and cannot be funded.');
  if (project.committedUsd !== undefined) throw new Error('This construction project is already funded.');
  const cash = state.fiscal.countries[project.countryId]?.cash ?? 0;
  const alreadyCommitted = Object.values(state.assets.projects)
    .filter(other => other.countryId === project.countryId && other.committedUsd !== undefined)
    .reduce((sum, other) => sum + (other.committedUsd ?? 0), 0);
  if (cash - alreadyCommitted < project.estimatedCostUsd) throw new Error('Insufficient treasury funds to commit this construction project.');
  return updateProject(state, input.projectId, { committedUsd: project.estimatedCostUsd });
}

/**
 * 0.24.4A — Reserve workers from the site Region's labour force to begin work.
 * Requires the `authorize_construction` capability. The project must be active
 * and funded. Reserved workers are subtracted from the labour force so no worker
 * is employed twice (see reconcileConstructionWorkforce).
 */
export function startWork(state: SimulationState, input: { projectId: string; personId: string; workers: number }): SimulationState {
  requireActivePerson(state, input.personId);
  const project = state.assets.projects[input.projectId];
  if (!project) throw new Error(`Unknown construction project: ${input.projectId}`);
  requireAuthority(state, input.personId, project.countryId, 'authorize_construction');
  if (project.status !== 'active') throw new Error('Only an active construction project can start work.');
  if (project.committedUsd === undefined || project.committedUsd <= 0) throw new Error('A construction project must be funded before work starts.');
  if (project.reservedWorkers !== undefined) throw new Error('Work has already started on this project.');
  if (!Number.isSafeInteger(input.workers) || input.workers <= 0) throw new Error('Worker count must be a positive integer.');
  const economy = state.socioeconomy.regions[project.regionId]?.economy;
  if (!economy) throw new Error('The construction Region has no economic labour force.');
  const available = economy.labourForce - reservedPersonnel(state, project.regionId) - constructionReservedPersonnel(state, project.regionId);
  if (input.workers > available) throw new Error('Insufficient regional labour to reserve this many construction workers.');
  const started = updateProject(state, input.projectId, { reservedWorkers: input.workers, completedWorkUsd: 0 });
  return reconcileConstructionWorkforce(started);
}

/**
 * 0.24.4D — Pause an active project: progression stops. Requires the
 * `authorize_construction` capability. Reserved workers remain assigned while
 * paused and are only released on cancellation/completion.
 */
export function pauseConstruction(state: SimulationState, input: { projectId: string; personId: string }): SimulationState {
  requireActivePerson(state, input.personId);
  const project = state.assets.projects[input.projectId];
  if (!project) throw new Error(`Unknown construction project: ${input.projectId}`);
  requireAuthority(state, input.personId, project.countryId, 'authorize_construction');
  if (project.status !== 'active') throw new Error('Only an active construction project can be paused.');
  return updateProject(state, input.projectId, { status: 'paused', pausedOn: state.date });
}

/**
 * 0.24.4D — Resume a paused project: progression resumes. Requires the
 * `authorize_construction` capability.
 */
export function resumeConstruction(state: SimulationState, input: { projectId: string; personId: string }): SimulationState {
  requireActivePerson(state, input.personId);
  const project = state.assets.projects[input.projectId];
  if (!project) throw new Error(`Unknown construction project: ${input.projectId}`);
  requireAuthority(state, input.personId, project.countryId, 'authorize_construction');
  if (project.status !== 'paused') throw new Error('Only a paused construction project can be resumed.');
  return updateProject(state, input.projectId, { status: 'active', pausedOn: undefined });
}

/**
 * 0.24.6A/B — Complete an active, fully-funded, fully-worked project: transition
 * it to `completed` and materialize the finished physical asset exactly once.
 * Requires the `authorize_construction` capability. Completion criteria are
 * explicit: completedWorkUsd must reach the estimated cost. The finished asset is
 * a distinct record in the single canonical assets store, never duplicated, and
 * carries a modelled physical capacity (asset -> capacity, never a GDP shortcut).
 */
export function completeConstruction(state: SimulationState, input: { projectId: string; personId: string }): SimulationState {
  requireActivePerson(state, input.personId);
  const project = state.assets.projects[input.projectId];
  if (!project) throw new Error(`Unknown construction project: ${input.projectId}`);
  requireAuthority(state, input.personId, project.countryId, 'authorize_construction');
  if (project.status !== 'active') throw new Error('Only an active construction project can be completed.');
  if (project.estimatedCostUsd === undefined || project.committedUsd === undefined) throw new Error('A construction project must be estimated and funded before completion.');
  if ((project.completedWorkUsd ?? 0) < project.estimatedCostUsd) throw new Error('Construction work is not yet complete.');
  if (project.resultingAssetId !== undefined) throw new Error('This construction project has already produced its asset.');
  const assetIdValue = assetId(state.assets.nextAssetSequence);
  const asset: AssetRecord = {
    assetId: assetIdValue,
    assetTypeId: project.assetTypeId,
    regionId: project.regionId,
    operatingStatus: 'operational',
    capacity: { amount: COMPLETED_ASSET_CAPACITY, unit: COMPLETED_ASSET_CAPACITY_UNIT, coverage: 'modelled', limitation: 'Modelled placeholder capacity; asset-type-specific capacity arrives with the 0.25 economy registry.' },
    availability: 'available',
    physicalCondition: 'good',
    coverage: { status: 'modelled' },
  };
  const withAsset: SimulationState = {
    ...state,
    assets: {
      ...state.assets,
      assets: { ...state.assets.assets, [assetIdValue]: asset },
      assetOrder: [...state.assets.assetOrder, assetIdValue],
      nextAssetSequence: state.assets.nextAssetSequence + 1,
    },
  };
  const completed = updateProject(withAsset, input.projectId, {
    status: 'completed',
    completedOn: state.date,
    resultingAssetId: assetIdValue,
    reservedWorkers: undefined,
  });
  return reconcileConstructionWorkforce(completed);
}

const addDays = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const updateAsset = (state: SimulationState, assetIdValue: string, patch: Partial<AssetRecord>): SimulationState => ({
  ...state,
  assets: { ...state.assets, assets: { ...state.assets.assets, [assetIdValue]: { ...state.assets.assets[assetIdValue], ...patch } } },
});

/** The sovereign Country owning an asset's Region (canonical ownership, never a second territorial truth). */
const assetCountry = (state: SimulationState, asset: AssetRecord): string => state.regionOwnership[asset.regionId] ?? '';

/**
 * 0.24.7A — Report an asset breakdown, making its capacity partially or totally
 * unavailable. Requires the authorize_construction authority in the sovereign
 * Country of the asset's Region. Only an operational/degraded asset can break.
 */
export function reportAssetBreakdown(state: SimulationState, input: { assetId: string; personId: string; severity: 'degraded' | 'out_of_service' }): SimulationState {
  requireActivePerson(state, input.personId);
  const asset = state.assets.assets[input.assetId];
  if (!asset) throw new Error(`Unknown asset: ${input.assetId}`);
  const countryId = assetCountry(state, asset);
  if (!countryId) throw new Error('The asset Region has no sovereign owner.');
  requireAuthority(state, input.personId, countryId, 'authorize_construction');
  if (asset.operatingStatus !== 'operational' && asset.operatingStatus !== 'degraded') throw new Error('Only an operational or degraded asset can be reported broken.');
  if (input.severity === 'degraded') return updateAsset(state, input.assetId, { operatingStatus: 'degraded', availability: 'partial' });
  return updateAsset(state, input.assetId, { operatingStatus: 'out_of_service', availability: 'unavailable' });
}

/**
 * 0.24.7B — Schedule a repair for a broken asset. Requires the
 * authorize_construction authority and a treasury able to cover the modelled
 * repair cost. The repair is never instant or free: it completes only when
 * repairReadyOn arrives (completeDueRepairs). The cost is a read-only treasury
 * check (soft reservation), consistent with 0.24.3 financing.
 */
export function repairAsset(state: SimulationState, input: { assetId: string; personId: string }): SimulationState {
  requireActivePerson(state, input.personId);
  const asset = state.assets.assets[input.assetId];
  if (!asset) throw new Error(`Unknown asset: ${input.assetId}`);
  const countryId = assetCountry(state, asset);
  if (!countryId) throw new Error('The asset Region has no sovereign owner.');
  requireAuthority(state, input.personId, countryId, 'authorize_construction');
  if (asset.operatingStatus !== 'degraded' && asset.operatingStatus !== 'out_of_service') throw new Error('Only a broken asset can be repaired.');
  if (asset.repairReadyOn !== undefined) throw new Error('This asset already has a scheduled repair.');
  if ((state.fiscal.countries[countryId]?.cash ?? 0) < REPAIR_COST_USD) throw new Error('Insufficient treasury funds to repair this asset.');
  return updateAsset(state, input.assetId, { repairReadyOn: addDays(state.date, REPAIR_DURATION_DAYS) });
}

/** 0.24.7B — complete repairs whose scheduled date has arrived (scheduler task). */
export function completeDueRepairs(state: SimulationState): SimulationState {
  const assets = { ...state.assets.assets };
  let changed = false;
  for (const [id, asset] of Object.entries(assets)) {
    if (asset.repairReadyOn !== undefined && asset.repairReadyOn <= state.date) {
      assets[id] = { ...asset, operatingStatus: 'operational', availability: 'available', repairReadyOn: undefined };
      changed = true;
    }
  }
  return changed ? { ...state, assets: { ...state.assets, assets } } : state;
}

/**
 * 0.24.4C + 0.24.5 — Advance funded work for active projects with reserved
 * workers. Each reserved worker completes CONSTRUCTION_DAILY_COST_PER_WORKER_USD
 * of funded work per day, capped by the remaining committed budget, and consumes
 * CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY of the construction-material category
 * per worker per day, bounded by the Country's available trade stock. Progression
 * therefore depends on labour, funding and materials, and a material shortage
 * slows or stops it (no instant construction, no automatic material creation).
 */
export function advanceConstructionProgress(state: SimulationState): SimulationState {
  const projects = { ...state.assets.projects };
  const consumedThisPass = new Map<string, number>();
  let changed = false;
  for (const [pid, project] of Object.entries(projects)) {
    if (project.status !== 'active' || project.reservedWorkers === undefined || project.committedUsd === undefined) continue;
    const remaining = project.committedUsd - (project.completedWorkUsd ?? 0);
    if (remaining <= 0) continue;
    const available = availableConstructionMaterials(state, project.countryId) - (consumedThisPass.get(project.countryId) ?? 0);
    const dailyWorkers = Math.min(project.reservedWorkers, Math.floor(available / CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY));
    if (dailyWorkers <= 0) continue;
    const dailyWork = Math.min(dailyWorkers * CONSTRUCTION_DAILY_COST_PER_WORKER_USD, remaining);
    if (dailyWork <= 0) continue;
    const materials = dailyWorkers * CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY;
    projects[pid] = {
      ...project,
      completedWorkUsd: (project.completedWorkUsd ?? 0) + dailyWork,
      consumedMaterials: (project.consumedMaterials ?? 0) + materials,
    };
    consumedThisPass.set(project.countryId, (consumedThisPass.get(project.countryId) ?? 0) + materials);
    changed = true;
  }
  return changed ? { ...state, assets: { ...state.assets, projects } } : state;
}

/** 0.24.4B — construction progression runs on the shared scheduler, never a parallel timer. */
export const registerConstructionTasks = (scheduler: SimulationScheduler) => scheduler
  .register({ id: 'construction.progress', cadence: 'daily', priority: 60, run: advanceConstructionProgress })
  .register({ id: 'construction.repair', cadence: 'daily', priority: 61, run: completeDueRepairs });
