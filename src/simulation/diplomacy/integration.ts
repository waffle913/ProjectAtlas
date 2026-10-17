/**
 * 0.31 — Diplomacy/Military V2 runtime integration over the canonical owners.
 *
 * - Coercion measures (condemnation / sanction / embargo) map onto the existing
 *   0.18 international-action system with an explicit import/export direction
 *   (never silently misclassified); an intervention stays a 0.19 operation and
 *   is not a trade control.
 * - Concessions apply to the canonical relation score (`bilateralRelations`) or
 *   to the ordinary customs rate of an existing trade route (`tariffBps`).
 * - The military support chain is derived from the canonical 0.16 stocks
 *   (consumables, personnel) and delivered through the 0.31 support contract.
 *
 * No second treaty, relation, stock or supply engine is introduced.
 */

import type { SimulationState } from '../../types';
import type { DiplomacyContext } from '../diplomacy';
import { adjustRelation } from '../diplomacy';
import { condemn, imposeExportRestriction, imposeImportRestriction } from '../international/runtime';
import { presentPersonnel } from '../military/model';
import { deliverSupportChain, type SupportLink } from '../military/supportChain';
import { validateCoercionMeasure, internationalActionKindFor, type CoercionMeasure } from './sanctions';
import { validateConcession, type Concession } from './negotiation';

export function applyCoercionMeasure(state: SimulationState, measure: CoercionMeasure, personId: string): SimulationState {
  validateCoercionMeasure(measure);
  const actionKind = internationalActionKindFor(measure.kind, measure.direction);
  switch (actionKind) {
    case 'condemnation':
      return condemn(state, measure.actorCountryId, measure.targetCountryId, personId, measure.note);
    case 'import_restriction':
      return imposeImportRestriction(state, measure.actorCountryId, measure.targetCountryId, personId, measure.categories);
    case 'export_restriction':
      return imposeExportRestriction(state, measure.actorCountryId, measure.targetCountryId, personId, measure.categories);
    default:
      // intervention -> 0.19 military operation, not a trade control.
      throw new Error('An intervention is a military operation, not a trade control; it is not applied through the international action system.');
  }
}

const contextFor = (state: SimulationState): DiplomacyContext => ({
  countryIds: new Set(Object.keys(state.engine.fidelityByCountry)),
  regionIds: new Set(Object.keys(state.socioeconomy.regions)),
});

export function applyConcession(state: SimulationState, concession: Concession): SimulationState {
  validateConcession(concession);
  if (concession.kind === 'relation_adjustment') {
    return adjustRelation(state, concession.fromCountryId, concession.toCountryId, concession.value, contextFor(state));
  }
  // tariff_reduction: the conceding Country lowers the ordinary customs rate it
  // charges on the counterparty's goods (existing admitted routes only).
  const routes = state.trade.routes.map((route) => {
    if (route.importerId !== concession.fromCountryId || route.exporterId !== concession.toCountryId || route.tariffBps === null) return route;
    return { ...route, tariffBps: Math.max(0, route.tariffBps - concession.value) };
  });
  return { ...state, trade: { ...state.trade, routes } };
}

/** Derive the canonical 0.16 support-chain links for a Country. Clearly-mapped
 *  stages (fuel, ammunition, personnel) are computed from canonical stocks;
 *  unmapped stages stay unavailable (unavailable != 0). */
export function militarySupportLinks(state: SimulationState, countryId: string): SupportLink[] {
  const c = state.military.countries[countryId]?.capability;
  if (!c) return [{ id: 'capability', kind: 'personnel', requiredPerMonth: null, available: null }];
  return [
    { id: 'fuel', kind: 'fuel', requiredPerMonth: c.parameters.desiredConsumables.fuel ?? null, available: c.consumables.fuel?.quantity ?? null },
    { id: 'ammunition', kind: 'ammunition', requiredPerMonth: c.parameters.desiredConsumables.ammunition ?? null, available: c.consumables.ammunition?.quantity ?? null },
    { id: 'personnel', kind: 'personnel', requiredPerMonth: c.authorized, available: presentPersonnel(c) },
    // parts/maintenance/transport have no clean canonical requirement without
    // inventing one, so they stay unavailable.
    { id: 'parts', kind: 'parts', requiredPerMonth: null, available: null },
    { id: 'maintenance', kind: 'maintenance', requiredPerMonth: null, available: null },
    { id: 'transport', kind: 'transport', requiredPerMonth: null, available: null },
  ];
}

/** Deliver a Country's canonical 0.16 support chain through the 0.31 contract. */
export function militarySupportChain(state: SimulationState, countryId: string): ReturnType<typeof deliverSupportChain> {
  return deliverSupportChain(militarySupportLinks(state, countryId));
}
