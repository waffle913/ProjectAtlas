import observations from '../../data/trade-observations.json';
import type { TradeObservation } from './model';
import { TRADE_CATEGORIES, validateTradeSource } from './model';
import { integer } from '../socioeconomy/model';
import { isSimulationDate } from '../date';

export const tradeObservations = observations.records as TradeObservation[];
export function tradeEvidenceAvailableOn(r: TradeObservation): string {
  validateTradeSource(r.source);
  const dates = [r.source.publishedOn ?? r.source.retrievedAt, r.source.referenceDate];
  for (const input of r.inputs ?? []) {
    validateTradeSource({ ...input, status: 'observed', synthetic: false, transformation: 'Referenced input to historical normalization.' });
    dates.push(input.publishedOn ?? input.retrievedAt, input.referenceDate);
  }
  return dates.sort().at(-1)!;
}
export function validateTradeObservations(countryIds: ReadonlySet<string>) {
  const seen = new Set<string>();
  for (const r of tradeObservations) {
    validateTradeSource(r.source); integer(r.annualValueUsd);
    if (seen.has(r.id) || !r.id || !countryIds.has(r.exporterId) || !countryIds.has(r.importerId)
      || r.exporterId === r.importerId || !TRADE_CATEGORIES.includes(r.category)
      || r.temporalStatus !== 'historical_prior' || r.coverage !== 'partial'
      || r.source.referenceDate > observations.scenarioDate
      || (r.quantity === undefined) !== (r.quantityUnit === undefined)
      || !isSimulationDate(r.availableOn) || r.availableOn !== tradeEvidenceAvailableOn(r)) throw new Error('Invalid historical trade observation, input availability or identity.');
    if (r.quantity !== undefined) integer(r.quantity);
    seen.add(r.id);
  }
}
export function governmentHistoricalTrade(countryId: string, date: string) {
  if (!isSimulationDate(date)) throw new Error('Government trade evidence needs a valid simulation date.');
  return tradeObservations.filter(r => (r.exporterId === countryId || r.importerId === countryId)
    && tradeEvidenceAvailableOn(r) <= date);
}
