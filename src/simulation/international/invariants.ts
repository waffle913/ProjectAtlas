import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { internationalPairKey, INTERNATIONAL_MODEL, INTERNATIONAL_VERSION, validInternationalCategory } from './model';
import { sanctionBlocksRoute } from './runtime';

const phaseValues = new Set(['NORMAL', 'PRESSURE', 'ACTIVE', 'RECOVERING']);
const severityValues = new Set(['none', 'low', 'moderate', 'severe', 'critical']);
const kindValues = new Set(['condemnation', 'import_restriction', 'export_restriction']);
const bounded = (value: unknown, maximum: number) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;

export const internationalInvariant: SimulationInvariant = {
  id: 'international-tensions-crises-sanctions',
  check: (state, context) => {
    const errors: string[] = [];
    const international = state.international;
    if (!international || international.version !== INTERNATIONAL_VERSION || !international.actions || !Array.isArray(international.actionOrder) || !international.episodes) {
      return ['Malformed international state.'];
    }
    if (!international.initializedOn) {
      return Object.keys(international.actions).length || Object.keys(international.episodes).length || international.actionOrder.length || international.lastMonthlyDate
        ? ['Uninitialized international state contains material evidence.']
        : [];
    }
    if (!validDate(international.initializedOn) || international.initializedOn! > state.date
      || international.lastMonthlyDate !== undefined && (!validDate(international.lastMonthlyDate) || international.lastMonthlyDate > state.date)) {
      errors.push('Invalid international initialization/monthly dates.');
    }
    if (!bounded(international.nextActionSequence, Number.MAX_SAFE_INTEGER)) errors.push('Invalid international action sequence.');
    if (new Set(international.actionOrder).size !== international.actionOrder.length
      || international.actionOrder.some(id => !international.actions[id])
      || Object.keys(international.actions).some(id => !international.actionOrder.includes(id))) {
      errors.push('International action order does not reconcile.');
    }
    const actionIds = new Set<string>();
    for (const action of Object.values(international.actions)) {
      actionIds.add(action.id);
      if (!action.id || !/^international-action\.\d{8}$/.test(action.id)
        || !context.countryIds.has(action.actorCountryId) || !context.countryIds.has(action.targetCountryId)
        || action.actorCountryId === action.targetCountryId
        || !kindValues.has(action.kind) || !validDate(action.imposedOn) || action.imposedOn > state.date
        || action.status !== 'active' && action.status !== 'lifted'
        || action.status === 'lifted' && (!validDate(action.liftedOn) || action.liftedOn! < action.imposedOn || action.liftedOn! > state.date)
        || action.status === 'active' && action.liftedOn !== undefined
        || !state.governance.persons[action.declaredByPersonId]
        || !['modelled', 'synthetic'].includes(action.provenance)
        || !action.limitation?.trim()) {
        errors.push(`Malformed international action ${action.id}.`);
      }
      if (action.kind !== 'condemnation') {
        if (!Array.isArray(action.categories) || !action.categories.length
          || new Set(action.categories).size !== action.categories.length
          || action.categories.some(category => !validInternationalCategory(category))) {
          errors.push(`Invalid international restriction categories on ${action.id}.`);
        }
      } else if (action.categories.length) {
        errors.push(`Condemnation ${action.id} carries trade categories.`);
      }
    }
    for (const [pairKey, episode] of Object.entries(international.episodes)) {
      if (!context.countryIds.has(episode.countryAId) || !context.countryIds.has(episode.countryBId)
        || episode.countryAId === episode.countryBId || episode.pairKey !== pairKey
        || pairKey !== internationalPairKey(episode.countryAId, episode.countryBId)) {
        errors.push(`Malformed international episode pair ${pairKey}.`);
      }
      if (!phaseValues.has(episode.phase) || !severityValues.has(episode.severity)
        || !bounded(episode.pressure, INTERNATIONAL_MODEL.maximumPressure)
        || !bounded(episode.maximumPressure, INTERNATIONAL_MODEL.maximumPressure)
        || !severityValues.has(episode.maximumSeverity)
        || !bounded(episode.dangerousEvaluations, Number.MAX_SAFE_INTEGER)
        || !bounded(episode.recoveryEvaluations, Number.MAX_SAFE_INTEGER)
        || !Array.isArray(episode.drivers) || !Array.isArray(episode.history)
        || episode.history.length > INTERNATIONAL_MODEL.historyLimitPerPair
        || episode.lastEvaluatedOn !== undefined && (!validDate(episode.lastEvaluatedOn) || episode.lastEvaluatedOn > state.date)) {
        errors.push(`Malformed international episode ${pairKey}.`);
      }
      for (const driver of episode.drivers) {
        if (!driver.kind || !driver.detail || !bounded(driver.weightBps, INTERNATIONAL_MODEL.maximumPressure)) errors.push(`Malformed international driver on ${pairKey}.`);
      }
    }
    for (const flow of state.trade.flows) {
      const route = state.trade.routes.find(r => r.id === flow.routeId);
      if (route && sanctionBlocksRoute({ ...state, international }, route, flow.date)) {
        errors.push(`Blocked international flow exists for ${flow.routeId} on ${flow.date}.`);
      }
    }
    return errors;
  },
};
