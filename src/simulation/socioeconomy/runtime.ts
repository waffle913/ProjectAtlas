import { fiscalDemand } from '../fiscal/runtime';
import { reservedPersonnel } from '../military/runtime';
import { constructionReservedPersonnel } from '../assets/workforce';
import type { SimulationState } from '../../types';
import type { SimulationScheduler } from '../scheduler';
import { clearDirty, markDirty } from '../dirty';
import { evolve, integer, MODEL, projectCapacity, type Shock } from './model';

export const ECONOMY_TASK = 'socioeconomy.monthly';
export function registerSocioeconomicTasks(scheduler: SimulationScheduler): SimulationScheduler {
  return scheduler.register({ id: ECONOMY_TASK, cadence: 'monthly', priority: 100, run: (state, context) => {
    const socio = state.socioeconomy;
    if (!socio.initializedOn) return state;
    const dirty = state.engine.dirtyDomains.find(d => d.domain === 'socioeconomy');
    if (context.execution === 'immediate' && !dirty) return state;
    const monthly = context.execution === 'scheduled' && socio.lastMonthlyDate !== state.date;
    const ids = monthly || !dirty?.entityIds.length ? Object.keys(socio.regions) : dirty.entityIds;
    const regions = { ...socio.regions };
    for (const id of ids) {
      const region = regions[id];
      if (!region) throw new Error(`Unknown socioeconomic region: ${id}`);
      regions[id] = monthly ? evolve(region, fiscalDemand(state, id), reservedPersonnel(state, id) + constructionReservedPersonnel(state, id)) : region.economy ? { ...region, economy: projectCapacity(region.economy, reservedPersonnel(state, id) + constructionReservedPersonnel(state, id)) } : region;
    }
    return clearDirty({ ...state, socioeconomy: { ...socio, regions, lastMonthlyDate: monthly ? state.date : socio.lastMonthlyDate } }, 'socioeconomy');
  } }).register({ id: 'administration.monthly', cadence: 'monthly', priority: 200, run: state => {
    if (!state.socioeconomy.initializedOn) return state;
    const totals = new Map<string, { count: number; total: number; output: number }>();
    for (const [id, r] of Object.entries(state.socioeconomy.regions)) {
      const country = state.regionOwnership[id]; if (!country) continue;
      const summary = totals.get(country) ?? { count: 0, total: 0, output: 0 };
      summary.total++;
      if (r.economy) { summary.count++; summary.output = integer(summary.output + r.economy.output); }
      totals.set(country, summary);
    }
    const entries = Object.keys(state.engine.fidelityByCountry).sort().filter(id => !state.socioeconomy.playerCountryIds.includes(id)).map(countryId => ({
      countryId, date: state.date, action: 'maintain_parameters' as const,
      reason: state.fiscal.initializedOn ? 'Execute existing fiscal policy, budget, transfers, interest and bounded financing; report unpaid commitments in fiscal accounts. No political reform.' : 'No fiscal or policy lever in 0.10; observe shared canonical economy without intervention.',
      observedRegions: totals.get(countryId)?.count ?? 0,
      outputUsdMonthly: totals.get(countryId)?.count ? totals.get(countryId)!.output : undefined,
      outputCoverage: !totals.get(countryId)?.count ? 'unavailable' as const : totals.get(countryId)!.count === totals.get(countryId)!.total ? 'complete' as const : 'partial' as const,
    }));
    const history = [...state.socioeconomy.administration, ...entries];
    const counts = new Map<string, number>();
    const administration = history.reverse().filter(e => { const n = (counts.get(e.countryId) ?? 0) + 1; counts.set(e.countryId, n); return n <= MODEL.journalLimit; }).reverse();
    return { ...state, socioeconomy: { ...state.socioeconomy, administration } };
  } });
}
/** Shock bounds are losses [0,100%]; removal is 10000 basis points. */
export function requestEconomicShock(state: SimulationState, scheduler: SimulationScheduler, regionId: string, shock: Shock): SimulationState {
  for (const value of [shock.capacityBps, shock.productivityBps, shock.labourBps]) if (!Number.isSafeInteger(value) || value < 0 || value > 10000) throw new Error('Shock must be between 0 and 10000 basis points.');
  const region = state.socioeconomy.regions[regionId];
  if (!region?.economy) throw new Error('Region has no calibrated economy.');
  let next = { ...state, socioeconomy: { ...state.socioeconomy, regions: { ...state.socioeconomy.regions, [regionId]: { ...region, economy: { ...region.economy, shock: { ...shock } } } } } };
  next = markDirty(next, { domain: 'socioeconomy', entityId: regionId, reason: 'exogenous_shock' });
  // Coalesce pending projections; all dirty regions are processed at the same boundary.
  return next.engine.pendingImmediateUpdates.some(r => r.taskId === ECONOMY_TASK) ? next : scheduler.requestImmediate(next, ECONOMY_TASK, 'economic_shock_projection');
}
