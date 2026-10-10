import type { SimulationState } from '../../types';
import { hasPoliticalAuthority } from '../governance/runtime';
import type { AuthorityCapability } from '../governance/model';
import { constructionProjectId, type ConstructionProjectRecord } from './model';

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

/**
 * 0.24.2B/C — Propose a construction project (status `planned`). Requires the
 * `propose_construction` capability in the project's Country. The project is a
 * plan/site, distinct from the finished asset it may later produce (0.24.6B).
 */
export function proposeConstruction(
  state: SimulationState,
  input: { proposerPersonId: string; countryId: string; regionId: string; assetTypeId: string; title: string },
): SimulationState {
  const proposer = requireActivePerson(state, input.proposerPersonId);
  requireAuthority(state, input.proposerPersonId, input.countryId, 'propose_construction');
  requireCountry(state, input.countryId);
  requireRegion(state, input.regionId);
  if (typeof input.assetTypeId !== 'string' || !input.assetTypeId.trim()) throw new Error('A construction project requires a non-empty asset type.');
  if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('A construction project requires a non-empty title.');
  const project: ConstructionProjectRecord = {
    projectId: constructionProjectId(state.assets.nextProjectSequence),
    countryId: input.countryId,
    regionId: input.regionId,
    assetTypeId: input.assetTypeId.trim(),
    title: input.title.trim(),
    status: 'planned',
    proposedOn: state.date,
    proposedByPersonId: proposer.id,
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
 * 0.24.2B/C — Cancel a planned/active/paused project, transitioning it to
 * `cancelled`. Requires the `cancel_construction` capability in the project's
 * Country. Financial treatment of cancellation is 0.24.3C scope and is not
 * implemented here; this command records only the lifecycle transition.
 */
export function cancelConstruction(state: SimulationState, input: { projectId: string; cancellerPersonId: string }): SimulationState {
  const canceller = requireActivePerson(state, input.cancellerPersonId);
  const project = state.assets.projects[input.projectId];
  if (!project) throw new Error(`Unknown construction project: ${input.projectId}`);
  requireAuthority(state, input.cancellerPersonId, project.countryId, 'cancel_construction');
  if (!['planned', 'active', 'paused'].includes(project.status)) throw new Error('A completed or already-cancelled construction project cannot be cancelled.');
  return updateProject(state, input.projectId, {
    status: 'cancelled',
    cancelledOn: state.date,
    cancelledByPersonId: canceller.id,
  });
}
