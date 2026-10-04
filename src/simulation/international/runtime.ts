import type { SimulationState } from '../../types';
import type { SimulationScheduler, SchedulerTaskContext } from '../scheduler';
import { countryPairKey } from '../diplomacy';
import { hasGovernmentInformationAccess } from '../information/runtime';
import type { TradeRoute } from '../trade/model';
import { INTERNATIONAL_MODEL, emptyInternational, internationalActionId, internationalPairKey, normalInternationalEpisode,
  validInternationalCategory, type InternationalAction, type InternationalActionKind, type InternationalDriver, type InternationalEpisode, type InternationalEpisodeSummary, type InternationalPhase, type InternationalSeverity, type InternationalState } from './model';

const sortedPair = (a: string, b: string) => a <= b ? [a, b] as const : [b, a] as const;

export function initializeInternational(state: SimulationState): SimulationState {
  if (state.international.initializedOn) return state;
  return { ...state, international: emptyInternational(state.date) };
}

export function hasInternationalAuthority(state: SimulationState, countryId: string, personId: string): boolean {
  const person = state.governance.persons[personId];
  return state.governance.player.controlledPersonId === personId
    && hasGovernmentInformationAccess(state, personId, countryId)
    && (person?.office?.role === 'head_of_government' || person?.office?.role === 'head_of_state')
    && person.office.evidence?.authorityBasis !== 'institutional_authority_unresolved';
}

function requireAuthority(state: SimulationState, countryId: string, personId: string) {
  if (!hasInternationalAuthority(state, countryId, personId)) {
    throw new Error('International action requires the controlled active person to hold a resolved executive office with government-information access in this Country.');
  }
}

function requireCountry(state: SimulationState, countryId: string) {
  if (!state.engine.fidelityByCountry[countryId]) throw new Error(`Unknown Country: ${countryId}`);
}

function addAction(state: SimulationState, action: Omit<InternationalAction, 'id' | 'status' | 'imposedOn' | 'declaredByPersonId'> & { declaredByPersonId: string }): SimulationState {
  const id = internationalActionId(state.international.nextActionSequence);
  const record: InternationalAction = { ...action, id, imposedOn: state.date, status: 'active' };
  return {
    ...state,
    international: {
      ...state.international,
      actions: { ...state.international.actions, [id]: record },
      actionOrder: [...state.international.actionOrder, id],
      nextActionSequence: state.international.nextActionSequence + 1,
    },
  };
}

export function condemn(state: SimulationState, actorCountryId: string, targetCountryId: string, personId: string, reason: string): SimulationState {
  requireAuthority(state, actorCountryId, personId);
  requireCountry(state, actorCountryId); requireCountry(state, targetCountryId);
  if (actorCountryId === targetCountryId) throw new Error('A Country cannot condemn itself.');
  if (!reason.trim()) throw new Error('A condemnation requires a represented reason.');
  return addAction(state, {
    actorCountryId,
    targetCountryId,
    kind: 'condemnation',
    categories: [],
    declaredByPersonId: personId,
    provenance: 'modelled',
    limitation: reason,
  });
}

export function imposeImportRestriction(state: SimulationState, actorCountryId: string, targetCountryId: string, personId: string, categories: readonly unknown[]): SimulationState {
  return imposeRestriction(state, actorCountryId, targetCountryId, personId, 'import_restriction', categories);
}

export function imposeExportRestriction(state: SimulationState, actorCountryId: string, targetCountryId: string, personId: string, categories: readonly unknown[]): SimulationState {
  return imposeRestriction(state, actorCountryId, targetCountryId, personId, 'export_restriction', categories);
}

function imposeRestriction(state: SimulationState, actorCountryId: string, targetCountryId: string, personId: string, kind: 'import_restriction' | 'export_restriction', categories: readonly unknown[]): SimulationState {
  requireAuthority(state, actorCountryId, personId);
  requireCountry(state, actorCountryId); requireCountry(state, targetCountryId);
  if (actorCountryId === targetCountryId) throw new Error('A Country cannot restrict trade with itself.');
  const normalized = [...new Set(categories.map(category => {
    if (!validInternationalCategory(category)) throw new Error(`Unknown trade category in international restriction: ${String(category)}`);
    return category;
  }))].sort();
  if (!normalized.length) throw new Error('A trade restriction requires at least one represented category.');
  return addAction(state, {
    actorCountryId,
    targetCountryId,
    kind,
    categories: normalized,
    declaredByPersonId: personId,
    provenance: 'modelled',
    limitation: 'Legal economic restriction modelled as an explicit executive gameplay abstraction, not an observed constitutional sanction procedure.',
  });
}

export function liftSanction(state: SimulationState, actionId: string, personId: string): SimulationState {
  const action = state.international.actions[actionId];
  if (!action || action.kind === 'condemnation') throw new Error('Unknown or non-liftable international restriction.');
  requireAuthority(state, action.actorCountryId, personId);
  if (action.status === 'lifted') return state;
  return {
    ...state,
    international: {
      ...state.international,
      actions: {
        ...state.international.actions,
        [actionId]: { ...action, status: 'lifted', liftedOn: state.date },
      },
    },
  };
}

export function sanctionBlocksRoute(state: SimulationState, route: TradeRoute, date: string = state.date): boolean {
  for (const action of Object.values(state.international.actions)) {
    if (action.status !== 'active' || action.kind === 'condemnation' || action.imposedOn > date) continue;
    if (!action.categories.includes(route.category)) continue;
    if (action.kind === 'import_restriction' && action.actorCountryId === route.importerId && action.targetCountryId === route.exporterId) return true;
    if (action.kind === 'export_restriction' && action.actorCountryId === route.exporterId && action.targetCountryId === route.importerId) return true;
  }
  return false;
}

function driversFor(state: SimulationState, countryAId: string, countryBId: string): InternationalDriver[] {
  const drivers: InternationalDriver[] = [];
  const months = INTERNATIONAL_MODEL.condemnationDecayMonths;
  for (const claim of state.claims) {
    if (claim.status !== 'active' || claim.creationDate > state.date) continue;
    const owner = state.regionOwnership[claim.regionId];
    if (!owner || !((claim.claimantCountryId === countryAId && owner === countryBId) || (claim.claimantCountryId === countryBId && owner === countryAId))) continue;
    drivers.push({ kind: 'territorial_claim', weightBps: INTERNATIONAL_MODEL.weights.territorialClaim, detail: `claim:${claim.id}:${claim.regionId}` });
  }
  let aToB = false, bToA = false;
  for (const action of Object.values(state.international.actions)) {
    if (action.status !== 'active' || action.imposedOn > state.date) continue;
    if (action.kind === 'condemnation') {
      const recent = action.imposedOn >= monthsAgo(state.date, months);
      if (recent && ((action.actorCountryId === countryAId && action.targetCountryId === countryBId) || (action.actorCountryId === countryBId && action.targetCountryId === countryAId))) {
        drivers.push({ kind: 'condemnation', weightBps: INTERNATIONAL_MODEL.weights.condemnation, detail: `condemnation:${action.id}` });
      }
      continue;
    }
    if (action.actorCountryId === countryAId && action.targetCountryId === countryBId) { aToB = true; drivers.push({ kind: 'sanction', weightBps: INTERNATIONAL_MODEL.weights.activeSanction, detail: `sanction:${action.id}` }); }
    if (action.actorCountryId === countryBId && action.targetCountryId === countryAId) { bToA = true; drivers.push({ kind: 'sanction', weightBps: INTERNATIONAL_MODEL.weights.activeSanction, detail: `sanction:${action.id}` }); }
  }
  if (aToB && bToA) drivers.push({ kind: 'reciprocal_coercion', weightBps: INTERNATIONAL_MODEL.weights.reciprocalCoercion, detail: `${countryPairKey(countryAId, countryBId)}` });
  return drivers.sort((a, b) => a.kind.localeCompare(b.kind) || a.detail.localeCompare(b.detail));
}

function monthsAgo(date: string, months: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() - months, 1);
  return parsed.toISOString().slice(0, 10);
}

function severityFor(pressure: number): InternationalSeverity {
  const s = INTERNATIONAL_MODEL.severity;
  if (pressure >= s.critical) return 'critical';
  if (pressure >= s.severe) return 'severe';
  if (pressure >= s.moderate) return 'moderate';
  if (pressure >= s.low) return 'low';
  return 'none';
}

function maximumSeverity(a: InternationalSeverity, b: InternationalSeverity): InternationalSeverity {
  const rank = { none: 0, low: 1, moderate: 2, severe: 3, critical: 4 } as const;
  return rank[a] >= rank[b] ? a : b;
}

function archive(episode: InternationalEpisode, date: string): InternationalEpisodeSummary {
  return {
    pairKey: episode.pairKey,
    countryAId: episode.countryAId,
    countryBId: episode.countryBId,
    pressureStartedOn: episode.pressureStartedOn ?? date,
    activatedOn: episode.activatedOn,
    recoveringOn: episode.recoveringOn,
    endedOn: date,
    maximumPressure: episode.maximumPressure,
    maximumSeverity: episode.maximumSeverity,
    dominantDrivers: episode.drivers.filter(driver => driver.weightBps > 0).slice(0, 3).map(driver => `${driver.kind}:${driver.weightBps}`),
    resolutionDrivers: [],
  };
}

function evaluateEpisode(episode: InternationalEpisode, drivers: InternationalDriver[], date: string): { episode: InternationalEpisode; ended: boolean } {
  const pressure = Math.min(INTERNATIONAL_MODEL.maximumPressure, drivers.reduce((sum, driver) => sum + driver.weightBps, 0));
  const severity = severityFor(pressure);
  const dangerous = pressure >= INTERNATIONAL_MODEL.activationMinimumPressure;
  const recovering = pressure < INTERNATIONAL_MODEL.recoveryCeiling;
  let next: InternationalEpisode = {
    ...episode,
    pressure,
    severity,
    maximumPressure: Math.max(episode.maximumPressure, pressure),
    maximumSeverity: maximumSeverity(episode.maximumSeverity, severity),
    drivers,
    lastEvaluatedOn: date,
  };
  if (episode.phase === 'NORMAL') {
    if (!dangerous) return { episode: next, ended: false };
    next = { ...next, phase: 'PRESSURE', pressureStartedOn: date, dangerousEvaluations: 1, recoveryEvaluations: 0 };
    return { episode: next, ended: false };
  }
  if (episode.phase === 'PRESSURE') {
    if (recovering) {
      const recoveryEvaluations = episode.recoveryEvaluations + 1;
      return { episode: { ...next, recoveryEvaluations }, ended: recoveryEvaluations >= INTERNATIONAL_MODEL.pressureRecoveryEvaluations };
    }
    const dangerousEvaluations = dangerous ? episode.dangerousEvaluations + 1 : episode.dangerousEvaluations;
    next = { ...next, dangerousEvaluations, recoveryEvaluations: 0 };
    if (dangerousEvaluations >= 3 && dangerous) {
      return { episode: { ...next, phase: 'ACTIVE', activatedOn: date }, ended: false };
    }
    return { episode: next, ended: false };
  }
  if (episode.phase === 'ACTIVE') {
    if (!recovering) return { episode: { ...next, recoveryEvaluations: 0 }, ended: false };
    const recoveryEvaluations = episode.recoveryEvaluations + 1;
    if (recoveryEvaluations < INTERNATIONAL_MODEL.activeRecoveryEvaluations) return { episode: { ...next, recoveryEvaluations }, ended: false };
    return { episode: { ...next, phase: 'RECOVERING', recoveringOn: date, recoveryEvaluations: 0 }, ended: false };
  }
  if (!recovering) return { episode: { ...next, phase: 'ACTIVE', recoveryEvaluations: 0 }, ended: false };
  const recoveryEvaluations = episode.recoveryEvaluations + 1;
  return { episode: { ...next, recoveryEvaluations }, ended: recoveryEvaluations >= INTERNATIONAL_MODEL.recoveringResolutionEvaluations };
}

export function runInternationalMonth(state: SimulationState, _context: SchedulerTaskContext): SimulationState {
  let international = initializeInternational(state).international;
  if (international.lastMonthlyDate === state.date) return international === state.international ? state : { ...state, international };
  const episodes: Record<string, InternationalEpisode> = { ...international.episodes };
  const activePairs = new Set<string>();
  for (const claim of state.claims) {
    if (claim.status !== 'active' || claim.creationDate > state.date) continue;
    const owner = state.regionOwnership[claim.regionId];
    if (owner && owner !== claim.claimantCountryId) activePairs.add(internationalPairKey(claim.claimantCountryId, owner));
  }
  for (const action of Object.values(international.actions)) {
    if (action.imposedOn > state.date) continue;
    activePairs.add(internationalPairKey(action.actorCountryId, action.targetCountryId));
  }
  for (const pairKey of [...activePairs].sort()) {
    const [countryA, countryB] = pairKey.split('::');
    const episode = episodes[pairKey] ?? normalInternationalEpisode(countryA, countryB);
    const drivers = driversFor(state, countryA, countryB);
    const evaluated = evaluateEpisode(episode, drivers, state.date);
    if (evaluated.ended) {
      episodes[pairKey] = {
        ...normalInternationalEpisode(countryA, countryB),
        history: [...episode.history, archive(evaluated.episode, state.date)].slice(-INTERNATIONAL_MODEL.historyLimitPerPair),
      };
    } else {
      episodes[pairKey] = evaluated.episode;
    }
  }
  international = { ...international, episodes, lastMonthlyDate: state.date };
  return { ...state, international };
}

export const registerInternationalTasks = (scheduler: SimulationScheduler) => scheduler.register({
  id: 'international.monthly',
  cadence: 'monthly',
  priority: INTERNATIONAL_MODEL.schedulerPriority,
  run: runInternationalMonth,
});

export interface InternationalPublicAction {
  id: string;
  actorCountryId: string;
  targetCountryId: string;
  kind: InternationalActionKind;
  categories: InternationalAction['categories'];
  imposedOn: string;
  liftedOn?: string;
  status: InternationalAction['status'];
}

export function publicInternationalActions(state: SimulationState, countryId: string): InternationalPublicAction[] {
  return Object.values(state.international.actions)
    .filter(action => action.actorCountryId === countryId || action.targetCountryId === countryId)
    .sort((a, b) => a.imposedOn.localeCompare(b.imposedOn) || a.id.localeCompare(b.id))
    .map(action => structuredClone({
      id: action.id,
      actorCountryId: action.actorCountryId,
      targetCountryId: action.targetCountryId,
      kind: action.kind,
      categories: action.categories,
      imposedOn: action.imposedOn,
      liftedOn: action.liftedOn,
      status: action.status,
    }));
}

export interface InternationalAssessment {
  pairKey: string;
  countryAId: string;
  countryBId: string;
  phase: InternationalPhase;
  severity: InternationalSeverity;
  pressure: number;
  drivers: InternationalDriver[];
  lastEvaluatedOn?: string;
  stale: boolean;
}

export function inspectInternationalAssessments(state: SimulationState, countryId: string, personId: string): InternationalAssessment[] | undefined {
  if (!hasGovernmentInformationAccess(state, personId, countryId)) return undefined;
  return Object.values(state.international.episodes)
    .filter(episode => episode.countryAId === countryId || episode.countryBId === countryId)
    .sort((a, b) => a.pairKey.localeCompare(b.pairKey))
    .map(episode => structuredClone({
      pairKey: episode.pairKey,
      countryAId: episode.countryAId,
      countryBId: episode.countryBId,
      phase: episode.phase,
      severity: episode.severity,
      pressure: episode.pressure,
      drivers: episode.drivers,
      lastEvaluatedOn: episode.lastEvaluatedOn,
      stale: episode.lastEvaluatedOn !== state.date,
    }));
}
