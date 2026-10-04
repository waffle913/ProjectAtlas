import type { SimulationState } from '../../types';
import type { SimulationScheduler, SchedulerTaskContext } from '../scheduler';
import { countryPairKey } from '../diplomacy';
import { hasGovernmentInformationAccess } from '../information/runtime';
import type { GovernmentInternationalAssessment, GovernmentInternationalReport } from '../information/model';
import type { TradeRoute } from '../trade/model';
import { deterministicFingerprint } from '../fingerprint';
import { INTERNATIONAL_MODEL, emptyInternational, internationalActionId, internationalPairKey, normalInternationalEpisode, validInternationalCategory,
  type InternationalAction, type InternationalActionKind, type InternationalDriver, type InternationalEpisode, type InternationalEpisodeSummary, type InternationalPhase, type InternationalSeverity } from './model';

const nextDate = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const monthsAgo = (iso: string, months: number) => {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
};

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
  if (!hasInternationalAuthority(state, countryId, personId)) throw new Error('International action requires the controlled active person to hold a resolved executive office with government-information access in this Country.');
}
function requireCountry(state: SimulationState, countryId: string) {
  if (!state.engine.fidelityByCountry[countryId]) throw new Error(`Unknown Country: ${countryId}`);
}

function retainActions(state: SimulationState, actions: Record<string, InternationalAction>, order: string[]): { actions: Record<string, InternationalAction>; order: string[] } {
  const cutoff = monthsAgo(state.date, INTERNATIONAL_MODEL.condemnationDecayMonths);
  const kept = order.filter(id => {
    const action = actions[id];
    if (action.kind !== 'condemnation' && action.status === 'active') return true;
    if (action.kind === 'condemnation') return action.declaredOn >= cutoff;
    if (action.ceasesOn && action.ceasesOn >= cutoff) return true;
    return false;
  });
  const perPair = new Map<string, number>();
  const retained = kept.filter(id => {
    const action = actions[id], key = internationalPairKey(action.actorCountryId, action.targetCountryId);
    const count = perPair.get(key) ?? 0;
    if (count >= INTERNATIONAL_MODEL.actionRetentionPerPair) return false;
    perPair.set(key, count + 1);
    return true;
  }).slice(-INTERNATIONAL_MODEL.actionRetentionGlobal).sort((a, b) => a.localeCompare(b));
  return { actions: Object.fromEntries(retained.map(id => [id, actions[id]])), order: retained };
}

function addAction(state: SimulationState, action: Omit<InternationalAction, 'id' | 'status' | 'declaredOn' | 'effectiveOn'>): SimulationState {
  const id = internationalActionId(state.international.nextActionSequence);
  const record: InternationalAction = { ...action, id, declaredOn: state.date, effectiveOn: nextDate(state.date, 1), status: 'active' };
  const actions = { ...state.international.actions, [id]: record };
  const order = [...state.international.actionOrder, id];
  const retained = retainActions(state, actions, order);
  return { ...state, international: { ...state.international, actions: retained.actions, actionOrder: retained.order, nextActionSequence: state.international.nextActionSequence + 1 } };
}

export function condemn(state: SimulationState, actorCountryId: string, targetCountryId: string, personId: string, reason: string): SimulationState {
  requireAuthority(state, actorCountryId, personId);
  requireCountry(state, actorCountryId); requireCountry(state, targetCountryId);
  if (actorCountryId === targetCountryId) throw new Error('A Country cannot condemn itself.');
  if (!reason.trim()) throw new Error('A condemnation requires a represented reason.');
  return addAction(state, { actorCountryId, targetCountryId, kind: 'condemnation', categories: [], declaredByPersonId: personId, provenance: 'modelled', limitation: reason });
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
  const normalized = [...new Set(categories.map(category => { if (!validInternationalCategory(category)) throw new Error(`Unknown trade category in international restriction: ${String(category)}`); return category; }))].sort();
  if (!normalized.length) throw new Error('A trade restriction requires at least one represented category.');
  const active = Object.values(state.international.actions).filter(a => a.kind === kind && a.actorCountryId === actorCountryId && a.targetCountryId === targetCountryId && a.status === 'active');
  if (active.some(a => a.categories.some(category => normalized.includes(category)))) throw new Error('An overlapping active legal restriction already exists for this direction/category.');
  const globalActive = Object.values(state.international.actions).filter(a => a.kind !== 'condemnation' && a.status === 'active').length;
  if (globalActive >= INTERNATIONAL_MODEL.activeRestrictionGlobalLimit) throw new Error('Active international restriction global limit reached.');
  const pairActive = Object.values(state.international.actions).filter(a => a.kind !== 'condemnation' && a.status === 'active' && internationalPairKey(a.actorCountryId, a.targetCountryId) === internationalPairKey(actorCountryId, targetCountryId)).length;
  if (pairActive >= INTERNATIONAL_MODEL.activeRestrictionPerPairLimit) throw new Error('Active international restriction per-pair limit reached.');
  return addAction(state, { actorCountryId, targetCountryId, kind, categories: normalized, declaredByPersonId: personId, provenance: 'modelled', limitation: 'Legal economic restriction modelled as an explicit executive gameplay abstraction, not an observed constitutional sanction procedure.' });
}

export function liftSanction(state: SimulationState, actionId: string, personId: string): SimulationState {
  const action = state.international.actions[actionId];
  if (!action || action.kind === 'condemnation') throw new Error('Unknown or non-liftable international restriction.');
  requireAuthority(state, action.actorCountryId, personId);
  if (action.status === 'lifted') return state;
  const ceasesOn = nextDate(state.date, 1);
  return { ...state, international: { ...state.international, actions: { ...state.international.actions, [actionId]: { ...action, status: 'lifted', liftDeclaredOn: state.date, ceasesOn } } } };
}

export function routeRestrictionKey(route: Pick<TradeRoute, 'exporterId' | 'importerId' | 'category'>) {
  return `${route.exporterId}|${route.importerId}|${route.category}`;
}

function restrictionActiveOn(action: InternationalAction, date: string): boolean {
  return action.kind !== 'condemnation' && action.effectiveOn <= date && (action.ceasesOn === undefined || date < action.ceasesOn);
}

export function blockedRouteKeysForDate(state: SimulationState, date: string): Set<string> {
  const keys = new Set<string>();
  for (const action of Object.values(state.international.actions)) {
    if (!restrictionActiveOn(action, date)) continue;
    for (const category of action.categories) {
      if (action.kind === 'import_restriction') keys.add(`${action.targetCountryId}|${action.actorCountryId}|${category}`);
      else if (action.kind === 'export_restriction') keys.add(`${action.actorCountryId}|${action.targetCountryId}|${category}`);
    }
  }
  return keys;
}

export function sanctionBlocksRoute(state: SimulationState, route: Pick<TradeRoute, 'exporterId' | 'importerId' | 'category'>, date: string = state.date): boolean {
  return blockedRouteKeysForDate(state, date).has(routeRestrictionKey(route));
}

export interface InternationalPublicAction {
  id: string; actorCountryId: string; targetCountryId: string; kind: InternationalActionKind; categories: InternationalAction['categories'];
  declaredOn: string; effectiveOn: string; liftDeclaredOn?: string; ceasesOn?: string; status: InternationalAction['status'];
}

export function publicInternationalActions(state: SimulationState, countryId: string): InternationalPublicAction[] {
  return Object.values(state.international.actions)
    .filter(action => action.actorCountryId === countryId || action.targetCountryId === countryId)
    .sort((a, b) => a.declaredOn.localeCompare(b.declaredOn) || a.id.localeCompare(b.id))
    .map(action => structuredClone({ id: action.id, actorCountryId: action.actorCountryId, targetCountryId: action.targetCountryId, kind: action.kind, categories: action.categories, declaredOn: action.declaredOn, effectiveOn: action.effectiveOn, liftDeclaredOn: action.liftDeclaredOn, ceasesOn: action.ceasesOn, status: action.status }));
}

function pressureFor(countryAId: string, countryBId: string, claims: readonly string[], condemnationDirs: ReadonlySet<string>, aToB: ReadonlySet<string>, bToA: ReadonlySet<string>): InternationalDriver[] {
  const drivers: InternationalDriver[] = [];
  for (const claimId of claims) {
    drivers.push({ kind: 'territorial_claim', weightBps: INTERNATIONAL_MODEL.weights.territorialClaim, detail: `claim:${claimId}` });
  }
  for (const dir of condemnationDirs) drivers.push({ kind: 'condemnation', weightBps: INTERNATIONAL_MODEL.condemnationPressurePerDirection, detail: `condemnation:${dir}` });
  if (aToB.size) drivers.push({ kind: 'sanction', weightBps: INTERNATIONAL_MODEL.weights.activeSanction, detail: `${countryAId}->${countryBId}` });
  if (bToA.size) drivers.push({ kind: 'sanction', weightBps: INTERNATIONAL_MODEL.weights.activeSanction, detail: `${countryBId}->${countryAId}` });
  if (aToB.size && bToA.size) drivers.push({ kind: 'reciprocal_coercion', weightBps: INTERNATIONAL_MODEL.weights.reciprocalCoercion, detail: countryPairKey(countryAId, countryBId) });
  return drivers.sort((a, b) => a.kind.localeCompare(b.kind) || a.detail.localeCompare(b.detail));
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
  return { pairKey: episode.pairKey, countryAId: episode.countryAId, countryBId: episode.countryBId, pressureStartedOn: episode.pressureStartedOn ?? date, activatedOn: episode.activatedOn, recoveringOn: episode.recoveringOn, endedOn: date, maximumPressure: episode.maximumPressure, maximumSeverity: episode.maximumSeverity, dominantDrivers: episode.drivers.filter(d => d.weightBps > 0).slice(0, 3).map(d => `${d.kind}:${d.weightBps}`), resolutionDrivers: [] };
}
function evaluateEpisode(episode: InternationalEpisode, drivers: InternationalDriver[], date: string): { episode: InternationalEpisode; ended: boolean } {
  const pressure = Math.min(INTERNATIONAL_MODEL.maximumPressure, drivers.reduce((sum, d) => sum + d.weightBps, 0));
  const severity = severityFor(pressure);
  const dangerous = pressure >= INTERNATIONAL_MODEL.activationMinimumPressure;
  const recovering = pressure < INTERNATIONAL_MODEL.recoveryCeiling;
  let next: InternationalEpisode = { ...episode, pressure, severity, maximumPressure: Math.max(episode.maximumPressure, pressure), maximumSeverity: maximumSeverity(episode.maximumSeverity, severity), drivers, lastEvaluatedOn: date };
  if (episode.phase === 'NORMAL') {
    if (!dangerous) return { episode: next, ended: false };
    return { episode: { ...next, phase: 'PRESSURE', pressureStartedOn: date, dangerousEvaluations: 1, recoveryEvaluations: 0 }, ended: false };
  }
  if (episode.phase === 'PRESSURE') {
    if (recovering) { const recoveryEvaluations = episode.recoveryEvaluations + 1; return { episode: { ...next, recoveryEvaluations }, ended: recoveryEvaluations >= INTERNATIONAL_MODEL.pressureRecoveryEvaluations }; }
    const dangerousEvaluations = dangerous ? episode.dangerousEvaluations + 1 : episode.dangerousEvaluations;
    next = { ...next, dangerousEvaluations, recoveryEvaluations: 0 };
    if (dangerousEvaluations >= 3 && dangerous) return { episode: { ...next, phase: 'ACTIVE', activatedOn: date }, ended: false };
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

function claimsByPair(state: SimulationState): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const claim of state.claims) {
    if (claim.status !== 'active' || claim.creationDate > state.date) continue;
    const owner = state.regionOwnership[claim.regionId];
    if (!owner || owner === claim.claimantCountryId) continue;
    const pair = internationalPairKey(claim.claimantCountryId, owner);
    const list = map.get(pair) ?? []; list.push(claim.id); map.set(pair, list);
  }
  return map;
}

export function runInternationalMonth(state: SimulationState, _context: SchedulerTaskContext): SimulationState {
  let international = initializeInternational(state).international;
  if (international.lastMonthlyDate === state.date) return international === state.international ? state : { ...state, international };
  const claims = claimsByPair(state);
  const pairs = new Set<string>([...claims.keys()]);
  const evidence = new Map<string, { condemnationDirs: Set<string>; aToB: Set<string>; bToA: Set<string> }>();
  const cutoff = monthsAgo(state.date, INTERNATIONAL_MODEL.condemnationDecayMonths);
  for (const action of Object.values(international.actions)) {
    if (action.declaredOn > state.date) continue;
    const pair = internationalPairKey(action.actorCountryId, action.targetCountryId);
    pairs.add(pair);
    let e = evidence.get(pair);
    if (!e) { e = { condemnationDirs: new Set(), aToB: new Set(), bToA: new Set() }; evidence.set(pair, e); }
    const [a, b] = pair.split('::');
    if (action.kind === 'condemnation') {
      if (action.declaredOn >= cutoff) e.condemnationDirs.add(`${action.actorCountryId}->${action.targetCountryId}`);
    } else if (action.status === 'active' && action.effectiveOn <= state.date) {
      if (action.actorCountryId === a && action.targetCountryId === b) e.aToB.add(`${action.kind}:${action.categories.join(',')}`);
      else e.bToA.add(`${action.kind}:${action.categories.join(',')}`);
    }
  }
  for (const [pairKey, episode] of Object.entries(international.episodes)) {
    if (episode.phase !== 'NORMAL') pairs.add(pairKey);
  }
  const episodes = { ...international.episodes };
  for (const pairKey of [...pairs].sort()) {
    const [a, b] = pairKey.split('::');
    const e = evidence.get(pairKey) ?? { condemnationDirs: new Set<string>(), aToB: new Set<string>(), bToA: new Set<string>() };
    const drivers = pressureFor(a, b, claims.get(pairKey) ?? [], e.condemnationDirs, e.aToB, e.bToA);
    const episode = episodes[pairKey] ?? normalInternationalEpisode(a, b);
    const evaluated = evaluateEpisode(episode, drivers, state.date);
    if (evaluated.ended) episodes[pairKey] = { ...normalInternationalEpisode(a, b), history: [...episode.history, archive(evaluated.episode, state.date)].slice(-INTERNATIONAL_MODEL.historyLimitPerPair) };
    else episodes[pairKey] = evaluated.episode;
  }
  international = { ...international, episodes, lastMonthlyDate: state.date };
  return { ...state, international };
}

function activeRestrictions(state: SimulationState): InternationalAction[] {
  return Object.values(state.international.actions).filter(a => a.kind !== 'condemnation' && a.status === 'active' && a.effectiveOn <= state.date);
}

export const registerInternationalTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'international.monthly', cadence: 'monthly', priority: INTERNATIONAL_MODEL.schedulerPriority, run: runInternationalMonth });
export const registerInternationalReportTasks = (scheduler: SimulationScheduler) => scheduler.register({ id: 'international.reports', cadence: 'monthly', priority: INTERNATIONAL_MODEL.reportPriority, run: runInternationalReports });

export interface InternationalAssessment { pairKey: string; countryAId: string; countryBId: string; phase: InternationalPhase; severity: InternationalSeverity; pressure: number; drivers: InternationalDriver[]; lastEvaluatedOn?: string; stale: boolean }
export function inspectInternationalAssessments(state: SimulationState, countryId: string, personId: string): InternationalAssessment[] | undefined {
  if (!hasGovernmentInformationAccess(state, personId, countryId)) return undefined;
  const report = state.information.internationalReports?.latest[countryId];
  if (!report) return undefined;
  return report.assessments.map(a => structuredClone({ ...a, lastEvaluatedOn: report.asOfDate, stale: report.asOfDate < state.date }));
}
export function runInternationalReports(state: SimulationState): SimulationState {
  const international = initializeInternational(state).international;
  if (international.lastMonthlyDate !== state.date) return state;
  const latest = { ...state.information.internationalReports?.latest };
  const byCountry = new Map<string, GovernmentInternationalAssessment[]>();
  for (const episode of Object.values(international.episodes)) {
    for (const countryId of [episode.countryAId, episode.countryBId]) {
      const list = byCountry.get(countryId) ?? [];
      list.push({ pairKey: episode.pairKey, countryAId: episode.countryAId, countryBId: episode.countryBId, phase: episode.phase, severity: episode.severity, pressure: episode.pressure, drivers: structuredClone(episode.drivers) });
      byCountry.set(countryId, list);
    }
  }
  for (const [countryId, assessments] of byCountry) {
    if (latest[countryId]?.producedOn === state.date) continue;
    const report: GovernmentInternationalReport = {
      id: `international-report:${countryId}:${state.date}`,
      countryId,
      asOfDate: state.date,
      producedOn: state.date,
      source: 'international.administrative-report',
      access: 'government',
      coverage: assessments.length ? 'partial' : 'unavailable',
      status: assessments.length ? 'modelled' : 'unavailable',
      confidenceBps: assessments.length ? 6000 : 0,
      limitation: 'Modelled international assessment; not observed diplomatic intelligence.',
      uncertainty: 'Pressure, drivers and severity are derived from represented claims/actions, not sourced crisis reports.',
      assessments,
      restrictions: activeRestrictions(state).filter(a => a.actorCountryId === countryId || a.targetCountryId === countryId).map(a => ({ actorCountryId: a.actorCountryId, targetCountryId: a.targetCountryId, kind: a.kind, categories: a.categories, effectiveOn: a.effectiveOn, liftDeclaredOn: a.liftDeclaredOn, ceasesOn: a.ceasesOn })),
      fingerprint: '',
    };
    report.fingerprint = deterministicFingerprint({ ...report, fingerprint: undefined });
    latest[countryId] = report;
  }
  const boundedById = Object.fromEntries(Object.values(latest).map(report => [report.id, report]));
  return { ...state, information: { ...state.information, internationalReports: { latest, byId: boundedById } } };
}
