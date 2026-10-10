import type { SimulationState } from '../../types';
import { hasPoliticalAuthority } from '../governance/runtime';
import type { AuthorityCapability } from '../governance/model';
import { reservedPersonnel } from '../military/runtime';
import { hasGovernmentInformationAccess } from '../information/runtime';
import type { SimulationScheduler } from '../scheduler';
import { assetAvailability, assetId, COMPLETED_ASSET_CAPACITY, COMPLETED_ASSET_CAPACITY_UNIT, CONSTRUCTION_DAILY_COST_PER_WORKER_USD, CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY, constructionProjectId, MAINTENANCE_COST_USD, MAINTENANCE_MATERIALS, MAINTENANCE_WEAR_MONTHS, REPAIR_COST_USD, REPAIR_DURATION_DAYS, type AssetRecord, type ConstructionProjectRecord } from './model';
import { availableConstructionMaterials, consumeConstructionMaterials } from './materials';
import { constructionReservedPersonnel, effectiveRegionControl } from './workforce';

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

/** 0.24.8 — a project can only be operated while its Country sovereignly owns AND
 *  effectively controls the site Region. Sovereignty, occupation and effective
 *  control stay distinct; a contested or changed controller freezes the project. */
const hasSiteControl = (state: SimulationState, project: ConstructionProjectRecord): boolean => {
  if (state.regionOwnership[project.regionId] !== project.countryId) return false;
  const control = effectiveRegionControl(state, project.regionId);
  return !control.contested && control.controller === project.countryId;
};

const requireSiteControl = (state: SimulationState, project: ConstructionProjectRecord) => {
  if (state.regionOwnership[project.regionId] !== project.countryId) throw new Error('The project Region is no longer sovereignly owned by the Country.');
  const control = effectiveRegionControl(state, project.regionId);
  if (control.contested || control.controller !== project.countryId) throw new Error('The Country no longer effectively controls the project Region.');
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

/** Update the canonical fiscal construction balances (committed/executed/cash) for a Country. */
const withFiscalConstruction = (state: SimulationState, countryId: string, patch: { committed?: number; executed?: number; maintenance?: number; cash?: number }): SimulationState => {
  const c = state.fiscal.countries[countryId];
  if (!c) return state;
  return {
    ...state,
    fiscal: { ...state.fiscal, countries: { ...state.fiscal.countries, [countryId]: {
      ...c,
      constructionCommitted: (c.constructionCommitted ?? 0) + (patch.committed ?? 0),
      constructionExecuted: (c.constructionExecuted ?? 0) + (patch.executed ?? 0),
      assetMaintenanceSpent: (c.assetMaintenanceSpent ?? 0) + (patch.maintenance ?? 0),
      cash: c.cash + (patch.cash ?? 0),
    } } },
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
  // 0.24.2C/0.24.8 — territorial legality: the Country must sovereignly own AND
  // effectively control the proposed Region (sovereignty != occupation != control).
  if (state.regionOwnership[input.regionId] !== input.countryId) throw new Error('A construction project can only be proposed in a Region the Country sovereignly owns.');
  const siteControl = effectiveRegionControl(state, input.regionId);
  if (siteControl.contested || siteControl.controller !== input.countryId) throw new Error('The Country does not effectively control the proposed construction Region.');
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
  requireSiteControl(state, project);
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
  const unspent = (project.committedUsd ?? 0) - (project.completedWorkUsd ?? 0);
  return reconcileConstructionWorkforce(withFiscalConstruction(cancelled, project.countryId, { committed: -unspent }));
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
  requireSiteControl(state, project);
  if (project.estimatedCostUsd === undefined) throw new Error('This construction project has no cost estimate and cannot be funded.');
  if (project.committedUsd !== undefined) throw new Error('This construction project is already funded.');
  const fiscalCountry = state.fiscal.countries[project.countryId];
  const cash = fiscalCountry?.cash ?? 0;
  const committed = fiscalCountry?.constructionCommitted ?? 0;
  if (cash - committed < project.estimatedCostUsd) throw new Error('Insufficient treasury funds to commit this construction project.');
  return withFiscalConstruction(updateProject(state, input.projectId, { committedUsd: project.estimatedCostUsd }), project.countryId, { committed: project.estimatedCostUsd });
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
  requireSiteControl(state, project);
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
  requireSiteControl(state, project);
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
  requireSiteControl(state, project);
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
  requireSiteControl(state, project);
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
  const unspent = (project.committedUsd ?? 0) - (project.completedWorkUsd ?? 0);
  return reconcileConstructionWorkforce(withFiscalConstruction(completed, project.countryId, { committed: -unspent }));
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
/** The Country effectively controlling an asset's Region (operations-derived). */
const assetCountry = (state: SimulationState, asset: AssetRecord): string => effectiveRegionControl(state, asset.regionId).controller ?? '';

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
  if (!countryId) throw new Error('The asset Region has no effective controller.');
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
  if (!countryId) throw new Error('The asset Region has no effective controller.');
  requireAuthority(state, input.personId, countryId, 'authorize_construction');
  if (asset.operatingStatus !== 'degraded' && asset.operatingStatus !== 'out_of_service') throw new Error('Only a broken asset can be repaired.');
  if (asset.repairReadyOn !== undefined) throw new Error('This asset already has a scheduled repair.');
  const fiscalCountry = state.fiscal.countries[countryId];
  if ((fiscalCountry?.cash ?? 0) - (fiscalCountry?.constructionCommitted ?? 0) < REPAIR_COST_USD) throw new Error('Insufficient uncommitted treasury funds to repair this asset.');
  return withFiscalConstruction(updateAsset(state, input.assetId, { repairReadyOn: addDays(state.date, REPAIR_DURATION_DAYS) }), countryId, { maintenance: REPAIR_COST_USD, cash: -REPAIR_COST_USD });
}

/** 0.24.7B — complete repairs whose scheduled date has arrived (scheduler task). */
export function completeDueRepairs(state: SimulationState): SimulationState {
  const assets = { ...state.assets.assets };
  let changed = false;
  for (const [id, asset] of Object.entries(assets)) {
    if (asset.repairReadyOn !== undefined && asset.repairReadyOn <= state.date) {
      assets[id] = { ...asset, operatingStatus: 'operational', availability: assetAvailability('operational', asset.physicalCondition), repairReadyOn: undefined };
      changed = true;
    }
  }
  return changed ? { ...state, assets: { ...state.assets, assets } } : state;
}

/** The Country effectively controlling an asset's Region: the military occupier
 *  when one exists, otherwise the sovereign owner. Sovereignty, occupation and
 *  effective control stay distinct; this V1 proxy uses occupation-over-sovereignty
 *  (finer operations region-control is a later refinement). */
export const assetController = (state: SimulationState, assetId: string): string | undefined => {
  const asset = state.assets.assets[assetId];
  if (!asset) return undefined;
  return effectiveRegionControl(state, asset.regionId).controller;
};

/**
 * 0.24.8C — A military operation damages an asset in a controlled Region. Requires
 * command_military_operations authority in the Country that effectively controls
 * the asset's Region. The asset identity stays tied to its permanent Region
 * (0.24.8A) and the damage persists (0.24.8D): it is restored only by an explicit
 * repair, never automatically when a war ends.
 */
export function damageAsset(state: SimulationState, input: { assetId: string; personId: string; severity: 'degraded' | 'out_of_service' }): SimulationState {
  requireActivePerson(state, input.personId);
  const asset = state.assets.assets[input.assetId];
  if (!asset) throw new Error(`Unknown asset: ${input.assetId}`);
  const controller = assetController(state, input.assetId);
  if (!controller) throw new Error('The asset Region has no effective controller.');
  requireAuthority(state, input.personId, controller, 'command_military_operations');
  if (asset.operatingStatus !== 'operational' && asset.operatingStatus !== 'degraded') throw new Error('Only an operational or degraded asset can be damaged.');
  if (input.severity === 'degraded') return updateAsset(state, input.assetId, { operatingStatus: 'degraded', availability: 'partial' });
  return updateAsset(state, input.assetId, { operatingStatus: 'out_of_service', availability: 'unavailable' });
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
  const fiscalByCountry = new Map<string, number>();
  let changed = false;
  const ordered = Object.entries(projects).sort(([left], [right]) => left.localeCompare(right));
  for (const [pid, project] of ordered) {
    if (project.status !== 'active' || project.reservedWorkers === undefined || project.committedUsd === undefined) continue;
    if (!hasSiteControl(state, project)) continue; // contested/changed control freezes progression.
    const remaining = project.committedUsd - (project.completedWorkUsd ?? 0);
    if (remaining <= 0) continue;
    const available = availableConstructionMaterials(state, project.countryId) - (consumedThisPass.get(project.countryId) ?? 0);
    const dailyWorkers = Math.min(project.reservedWorkers, Math.floor(available / CONSTRUCTION_MATERIALS_PER_WORKER_PER_DAY));
    if (dailyWorkers <= 0) continue;
    const dailyWork = Math.min(dailyWorkers * CONSTRUCTION_DAILY_COST_PER_WORKER_USD, remaining);
    if (dailyWork <= 0) continue;
    // Materials are proportional to the work actually credited, so a partial
    // final worker-day never over-consumes.
    const materials = Math.ceil(dailyWork / CONSTRUCTION_DAILY_COST_PER_WORKER_USD);
    projects[pid] = {
      ...project,
      completedWorkUsd: (project.completedWorkUsd ?? 0) + dailyWork,
    };
    consumedThisPass.set(project.countryId, (consumedThisPass.get(project.countryId) ?? 0) + materials);
    fiscalByCountry.set(project.countryId, (fiscalByCountry.get(project.countryId) ?? 0) + dailyWork);
    changed = true;
  }
  if (!changed) return state;
  let next = { ...state, assets: { ...state.assets, projects } };
  for (const [countryId, executed] of fiscalByCountry) next = withFiscalConstruction(next, countryId, { committed: -executed, executed, cash: -executed });
  for (const [countryId, materials] of consumedThisPass) next = consumeConstructionMaterials(next, countryId, materials);
  return next;
}

/** 0.24.4B — construction progression runs on the shared scheduler, never a parallel timer. */
const CONDITION_ORDER = ['excellent', 'good', 'fair', 'poor', 'critical'] as const;
/** 0.24.6D — monthly maintenance: funded operational assets are maintained (wear
 *  counter reset); unfunded operational assets accrue maintenance debt and wear one
 *  physical-condition step every MAINTENANCE_WEAR_MONTHS unfunded months. Broken
 *  assets are never maintained into availability — an out_of_service/degraded asset
 *  is restored only by its explicit repair (0.24.7B). */
export function runAssetMaintenance(state: SimulationState): SimulationState {
  let next = state;
  for (const [assetId, asset] of Object.entries(state.assets.assets)) {
    if (asset.operatingStatus !== 'operational') continue; // broken/retired assets need repair, never maintenance.
    const controller = assetController(next, assetId);
    if (!controller) continue;
    const fiscalCountry = next.fiscal.countries[controller];
    const uncommitted = (fiscalCountry?.cash ?? 0) - (fiscalCountry?.constructionCommitted ?? 0);
    const materials = availableConstructionMaterials(next, controller);
    if (uncommitted >= MAINTENANCE_COST_USD && materials >= MAINTENANCE_MATERIALS) {
      next = withFiscalConstruction(next, controller, { maintenance: MAINTENANCE_COST_USD, cash: -MAINTENANCE_COST_USD });
      next = consumeConstructionMaterials(next, controller, MAINTENANCE_MATERIALS);
      next = updateAsset(next, assetId, { lastMaintainedOn: next.date, unfundedMaintenanceMonths: 0 });
      continue;
    }
    const canWear = asset.physicalCondition !== undefined && (CONDITION_ORDER as readonly string[]).includes(asset.physicalCondition);
    if (!canWear) continue;
    const unfunded = (asset.unfundedMaintenanceMonths ?? 0) + 1;
    if (unfunded >= MAINTENANCE_WEAR_MONTHS) {
      const nextCondition = CONDITION_ORDER[Math.min(CONDITION_ORDER.length - 1, CONDITION_ORDER.indexOf(asset.physicalCondition as (typeof CONDITION_ORDER)[number]) + 1)];
      next = updateAsset(next, assetId, { unfundedMaintenanceMonths: 0, physicalCondition: nextCondition, availability: assetAvailability('operational', nextCondition) });
    } else {
      next = updateAsset(next, assetId, { unfundedMaintenanceMonths: unfunded });
    }
  }
  return next;
}

export const registerConstructionTasks = (scheduler: SimulationScheduler) => scheduler
  .register({ id: 'construction.progress', cadence: 'daily', priority: 60, run: advanceConstructionProgress })
  .register({ id: 'construction.repair', cadence: 'daily', priority: 61, run: completeDueRepairs })
  .register({ id: 'construction.maintenance', cadence: 'monthly', priority: 62, run: runAssetMaintenance });

/** 0.24.10A/C — Government-information-gated construction query. The player sees
 *  only the projects and assets their office's Country can actually know; returns
 *  a defensive clone, or undefined without information access. Reality stays
 *  distinct from Government Information. */
export const inspectConstruction = (state: SimulationState, personId: string, countryId: string) => {
  if (!hasGovernmentInformationAccess(state, personId, countryId)) return undefined;
  const assets = Object.values(state.assets.assets).filter(asset => assetController(state, asset.assetId) === countryId);
  const projects = Object.values(state.assets.projects).filter(project => project.countryId === countryId);
  return structuredClone({ assets, projects });
};

/** 0.24.10D — full technical/provenance view for diagnostics, never the normal UI. */
export const inspectAssetsDebug = (state: SimulationState) => structuredClone(state.assets);
