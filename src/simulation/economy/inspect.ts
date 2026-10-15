/**
 * 0.25.11 — Data, migrations and restitution: authority-gated economy view.
 *
 * The 0.25 economy is a pure, read-only derivation layer over the single
 * canonical `SimulationState`. It introduces no new canonical state, no save
 * schema and no migration: the derivations read the existing socioeconomy /
 * fiscal / trade / assets fields, so old saves remain loadable and the views
 * recompute deterministically after restore (see economyRestitution.test.ts).
 *
 * Restitution honours the Reality -> Government Information -> Public Perception
 * boundary: exact engine reality is exposed only through this gated view, and
 * only to an office holding `access_government_information` for the Country.
 * The UI observes (never mutates) canonical state; every returned value is a
 * deep clone. Coverage/provenance stays honest — 0.25 quantities are `derived`
 * from canonical state or explicitly `modelled` synthetic priors, never
 * presented as real observations, and an unavailable input stays unavailable
 * (never a fabricated zero).
 */

import type { SimulationState } from '../../types';
import { hasGovernmentInformationAccess } from '../information/runtime';
import { aggregateFirmAccount, investmentPlan, type AggregateFirmAccount, type InvestmentPlan } from './firms';
import { householdSpending, type HouseholdSpendingAccount } from './households';
import { domesticMarketPrice, type DomesticMarketPrice } from './prices';
import { countryTradePosition, type CountryTradePosition } from './tradeIntegration';
import { countryFiscalDerivation, type CountryFiscalDerivation } from './fiscal';

export interface RegionEconomyInspection {
  regionId: string;
  /** Demand/needs/shortage view (0.25.5). */
  households?: HouseholdSpendingAccount;
  /** Aggregate firm account and bounded investment (0.25.6). */
  firms?: AggregateFirmAccount;
  investment?: InvestmentPlan;
  /** Modelled domestic price view (0.25.7). */
  domesticPrice?: DomesticMarketPrice;
}

export interface EconomyInspection {
  countryId: string;
  asOfDate: string;
  access: 'government';
  /** Honest coverage/provenance label carried end to end. */
  provenance: {
    status: 'derived' | 'unavailable';
    limitation: string;
  };
  regions: RegionEconomyInspection[];
  /** Country-level trade position (0.25.8). */
  trade?: CountryTradePosition;
  /** Country-level fiscal derivation (0.25.9). */
  fiscal?: CountryFiscalDerivation;
  note: string;
}

/** Authority-gated restitution of the 0.25 economy views for a Country's
 *  sovereign Regions. Returns `undefined` when the person does not hold a
 *  government-information office for this Country (an opposition leader or a
 *  legislator without the capability sees nothing). Never mutates state. */
export function inspectEconomy(state: SimulationState, countryId: string, personId: string): EconomyInspection | undefined {
  if (!hasGovernmentInformationAccess(state, personId, countryId)) return undefined;
  const regionIds = Object.keys(state.socioeconomy.regions)
    .filter(id => state.regionOwnership[id] === countryId && state.socioeconomy.regions[id].economy)
    .sort();
  const regions: RegionEconomyInspection[] = regionIds.map(regionId => {
    const entry: RegionEconomyInspection = { regionId };
    const households = householdSpending(state, regionId);
    const firms = aggregateFirmAccount(state, regionId);
    const investment = investmentPlan(state, regionId);
    const domesticPrice = domesticMarketPrice(state, regionId);
    if (households) entry.households = households;
    if (firms) entry.firms = firms;
    if (investment) entry.investment = investment;
    if (domesticPrice) entry.domesticPrice = domesticPrice;
    return entry;
  });
  const trade = countryTradePosition(state, countryId);
  const fiscal = countryFiscalDerivation(state, countryId);
  return structuredClone({
    countryId,
    asOfDate: state.date,
    access: 'government',
    provenance: {
      status: 'derived',
      limitation: '0.25 economy quantities are derived from the single canonical SimulationState (socioeconomy/fiscal/trade/assets) or are explicitly modelled synthetic priors. No derived or modelled value is presented as a real observation; an unavailable input stays unavailable and is never rendered as zero.',
    },
    regions,
    ...(trade ? { trade } : {}),
    ...(fiscal ? { fiscal } : {}),
    note: 'Authority-gated economy view: only a government-information-holding office of this Country receives it; the UI observes canonical state and never mutates it.',
  });
}
