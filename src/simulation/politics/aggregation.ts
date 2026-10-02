import type { SimulationState } from '../../types';
import { allocate } from '../socioeconomy/model';
import type { RegionalPoliticalOpinion } from './model';

export function aggregateNationalSupport(state: SimulationState, regionIds: readonly string[], regional: Record<string, RegionalPoliticalOpinion>, partyCount: number): number[] {
  const weights: number[] = Array(partyCount + 1).fill(0); let persons = 0;
  for (const regionId of [...regionIds].sort()) for (const [cohortId, opinion] of Object.entries(regional[regionId]?.cohorts ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const count = state.socioeconomy.regions[regionId]?.cohorts.find(item => `${item.income}:${item.orientation}` === cohortId)?.persons ?? 0;
    persons += count;
    opinion[2].forEach((value, index) => { weights[index] += value * count; });
  }
  return allocate(10_000, persons ? weights : weights.map((_, index) => index === partyCount ? 1 : 0));
}
