import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { internationalPairKey, INTERNATIONAL_MODEL, INTERNATIONAL_VERSION, validInternationalCategory } from './model';
import { blockedRouteKeysForDate, routeRestrictionKey } from './runtime';

const phaseValues = new Set(['NORMAL', 'PRESSURE', 'ACTIVE', 'RECOVERING']);
const severityValues = new Set(['none', 'low', 'moderate', 'severe', 'critical']);
const kindValues = new Set(['condemnation', 'import_restriction', 'export_restriction']);
const bounded = (value: unknown, maximum: number) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
const severityRank = { none: 0, low: 1, moderate: 2, severe: 3, critical: 4 } as const;

export const internationalInvariant: SimulationInvariant = {
  id: 'international-tensions-crises-sanctions',
  check: (state, context) => {
    const errors: string[] = [];
    const international = state.international;
    if (!international || international.version !== INTERNATIONAL_VERSION || !international.actions || !Array.isArray(international.actionOrder) || !international.episodes || !international.factualCoverage) return ['Malformed international state.'];
    if (!international.initializedOn) return Object.keys(international.actions).length || Object.keys(international.episodes).length || international.actionOrder.length || international.lastMonthlyDate ? ['Uninitialized international state contains material evidence.'] : [];
    if (!validDate(international.initializedOn) || international.initializedOn! > state.date || international.lastMonthlyDate !== undefined && (!validDate(international.lastMonthlyDate) || international.lastMonthlyDate > state.date)) errors.push('Invalid international initialization/monthly dates.');
    if (!['unavailable', 'partial', 'sourced'].includes(international.factualCoverage.status) || !validDate(international.factualCoverage.referenceDate) || !international.factualCoverage.limitation?.trim()) errors.push('Malformed international factual coverage.');
    if (!bounded(international.nextActionSequence, Number.MAX_SAFE_INTEGER)) errors.push('Invalid international action sequence.');
    if (new Set(international.actionOrder).size !== international.actionOrder.length || international.actionOrder.some(id => !international.actions[id]) || Object.keys(international.actions).some(id => !international.actionOrder.includes(id))) errors.push('International action order does not reconcile.');
    if (international.actionOrder.length > INTERNATIONAL_MODEL.actionRetentionGlobal) errors.push('International action history exceeds its global bound.');
    const seen = new Set<string>();
    const activeRestrictions = new Map<string, string>();
    for (const action of Object.values(international.actions)) {
      if (seen.has(action.id)) errors.push(`Duplicate international action ID ${action.id}.`);
      seen.add(action.id);
      if (action.id !== internationalActionIdForCheck(action.id) || !/^international-action\.\d{8}$/.test(action.id) || !context.countryIds.has(action.actorCountryId) || !context.countryIds.has(action.targetCountryId) || action.actorCountryId === action.targetCountryId || !kindValues.has(action.kind) || !validDate(action.declaredOn) || action.declaredOn > state.date || !validDate(action.effectiveOn) || action.effectiveOn <= action.declaredOn || action.status !== 'active' && action.status !== 'lifted' || action.status === 'lifted' && (!validDate(action.liftedOn) || action.liftedOn! < action.declaredOn || action.liftedOn! > state.date) || action.status === 'active' && action.liftedOn !== undefined || !state.governance.persons[action.declaredByPersonId] || !['modelled', 'synthetic'].includes(action.provenance) || !action.limitation?.trim()) errors.push(`Malformed international action ${action.id}.`);
      if (action.kind !== 'condemnation') {
        if (!Array.isArray(action.categories) || !action.categories.length || new Set(action.categories).size !== action.categories.length || action.categories.some(c => !validInternationalCategory(c)) || action.categories.some((c, i) => i && c <= action.categories[i - 1])) errors.push(`Invalid international restriction categories on ${action.id}.`);
        if (action.status === 'active') {
          const key = `${action.kind}|${action.actorCountryId}|${action.targetCountryId}|${action.categories.join(',')}`;
          if (activeRestrictions.has(key)) errors.push(`Duplicate active legal restriction ${key}.`);
          activeRestrictions.set(key, action.id);
        }
      } else if (action.categories.length) errors.push(`Condemnation ${action.id} carries trade categories.`);
    }
    const pairCounts = new Map<string, number>();
    for (const action of Object.values(international.actions)) {
      const key = internationalPairKey(action.actorCountryId, action.targetCountryId);
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
    if ([...pairCounts.values()].some(count => count > INTERNATIONAL_MODEL.actionRetentionPerPair + 1)) errors.push('International per-pair action history exceeds its bound.');
    for (const [pairKey, episode] of Object.entries(international.episodes)) {
      if (!context.countryIds.has(episode.countryAId) || !context.countryIds.has(episode.countryBId) || episode.countryAId === episode.countryBId || episode.pairKey !== pairKey || pairKey !== internationalPairKey(episode.countryAId, episode.countryBId)) errors.push(`Malformed international episode pair ${pairKey}.`);
      if (!phaseValues.has(episode.phase) || !severityValues.has(episode.severity) || !bounded(episode.pressure, INTERNATIONAL_MODEL.maximumPressure) || !bounded(episode.maximumPressure, INTERNATIONAL_MODEL.maximumPressure) || !severityValues.has(episode.maximumSeverity) || severityRank[episode.maximumSeverity] < severityRank[episode.severity] || episode.maximumPressure < episode.pressure || !bounded(episode.dangerousEvaluations, Number.MAX_SAFE_INTEGER) || !bounded(episode.recoveryEvaluations, Number.MAX_SAFE_INTEGER) || !Array.isArray(episode.drivers) || !Array.isArray(episode.history) || episode.history.length > INTERNATIONAL_MODEL.historyLimitPerPair || episode.lastEvaluatedOn !== undefined && (!validDate(episode.lastEvaluatedOn) || episode.lastEvaluatedOn > state.date)) errors.push(`Malformed international episode ${pairKey}.`);
      for (const driver of episode.drivers) if (!driver.kind || !driver.detail || !bounded(driver.weightBps, INTERNATIONAL_MODEL.maximumPressure)) errors.push(`Malformed international driver on ${pairKey}.`);
      for (const [index, summary] of episode.history.entries()) {
        if (summary.pairKey !== pairKey || !validDate(summary.endedOn) || summary.endedOn > state.date || !bounded(summary.maximumPressure, INTERNATIONAL_MODEL.maximumPressure) || !severityValues.has(summary.maximumSeverity) || index && summary.endedOn < episode.history[index - 1].endedOn) errors.push(`Malformed international episode history ${pairKey}.`);
      }
    }
    const blocked = blockedRouteKeysForDate({ ...state, international }, state.date);
    for (const flow of state.trade.flows) {
      const route = state.trade.routes.find(r => r.id === flow.routeId);
      if (route && blocked.has(routeRestrictionKey(route))) errors.push(`Blocked international flow exists for ${flow.routeId} on ${flow.date}.`);
    }
    return errors;
  },
};

function internationalActionIdForCheck(id: string) { return id; }
