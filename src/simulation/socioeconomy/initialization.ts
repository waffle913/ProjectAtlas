import type { RegionEntity, SimulationState } from '../../types';
import type { RegionDemographicsData, NationalPopulationData } from '../../data/populationData';
import type { EconomicBaselinesData } from '../../data/economicData';
import type { CountryFactsRecord } from '../../data/countryData';
import { allocate, calibrate, cohortsFor, emptySocioeconomy, integer, MODEL, prior, type Provenance, type SocioRegion } from './model';

export interface InitializationData {
  demographics: RegionDemographicsData; national: NationalPopulationData;
  economics: EconomicBaselinesData; facts: CountryFactsRecord[];
}
// Annual observations describe a completed year, not its first day.
const admissible = (referenceDate: string, date: string) => (/^\d{4}$/.test(referenceDate) ? `${referenceDate}-12-31` : referenceDate) <= date;
/** Kept separate from audited datasets. No mutation of baseline maps or source records. */
export function initializeSocioeconomy(state: SimulationState, regions: readonly RegionEntity[], data?: InitializationData): SimulationState {
  const sorted = [...regions].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const demographics = new Map(data?.demographics.records.map(r => [r.regionId, r]));
  const economics = new Map(data?.economics.records.map(r => [r.regionId, r]));
  const national = new Map(data?.national.records.map(r => [r.countryId, r]));
  const facts = new Map(data?.facts.map(r => [r.countryId, r.facts]));
  const populations: Record<string, number | undefined> = {};
  const outputs: Record<string, number | undefined> = {};
  const pp: Record<string, Provenance> = {}, ep: Record<string, Provenance> = {};
  const groups = new Map<string, RegionEntity[]>();
  for (const region of sorted) {
    const list = groups.get(region.parentCountryId) ?? []; list.push(region); groups.set(region.parentCountryId, list);
    const id = region.id, pop = demographics.get(id), output = economics.get(id);
    populations[id] = state.populationByRegion[id]; outputs[id] = state.economicOutputByRegion[id];
    pp[id] = prior(state.date, 'saved_population_no_historical_provenance', populations[id] !== undefined);
    ep[id] = prior(state.date, 'saved_annual_output_no_historical_provenance', outputs[id] !== undefined);
    if (data) {
      populations[id] = pop && pop.status !== 'unavailable' && pop.baselineDate <= state.date && pop.sourceObservations.every(o => admissible(o.referenceDate, state.date)) ? pop.baselinePopulation : undefined;
      outputs[id] = output && output.status !== 'unavailable' && admissible(output.nationalSourceObservation.referenceDate, state.date) ? output.baselineAnnualOutputUsd : undefined;
      pp[id] = pop && pop.status !== 'unavailable' && populations[id] !== undefined ? { status: pop.isDerived ? 'derived' : 'sourced', method: pop.allocationMethod, logicalDate: state.date, inputs: [...pop.sourceObservations.map(s => ({ dataset: s.source.datasetId, referenceDate: s.referenceDate, value: s.value })), { dataset: pop.spatialWeightSource.datasetId, referenceDate: pop.baselineDate, value: pop.spatialWeight }], limitation: pop.limitationNote } : prior(state.date, 'no_defensible_population', false);
      ep[id] = output && output.status !== 'unavailable' && outputs[id] !== undefined ? { status: 'derived', method: output.allocationMethod, logicalDate: state.date, inputs: [{ dataset: output.nationalSourceObservation.source.datasetId, referenceDate: output.nationalSourceObservation.referenceDate, value: output.nationalSourceObservation.value }], limitation: output.limitationNote } : prior(state.date, 'no_defensible_output', false);
    }
  }
  // Fill only gaps, conserving national totals while preserving accepted local amounts.
  if (data) for (const [country, local] of groups) {
    const observation = national.get(country);
    const missing = local.filter(r => populations[r.id] === undefined);
    const known = local.reduce((sum, r) => sum + (populations[r.id] ?? 0), 0);
    if (missing.length && observation && admissible(observation.referenceDate, state.date) && observation.value >= known) {
      const amounts = allocate(observation.value - known, missing.map(() => 1));
      missing.forEach((r, i) => {
        populations[r.id] = amounts[i];
        pp[r.id] = { status: 'modelled', method: MODEL.populationFallback, logicalDate: state.date,
          inputs: [{ dataset: observation.source.datasetId, referenceDate: observation.referenceDate, value: observation.value }],
          limitation: 'Uniform allocation of remaining national population; no complete accepted regional weights. Not an observed regional distribution.' };
      });
    }
    const gdp = facts.get(country)?.nominalGdpUsd;
    const missingOutput = local.filter(r => outputs[r.id] === undefined);
    const knownOutput = local.reduce((sum, r) => sum + (outputs[r.id] ?? 0), 0);
    if (missingOutput.length && gdp?.status === 'available' && typeof gdp.value === 'number' && admissible(gdp.referenceDate, state.date) && Math.round(gdp.value) >= knownOutput && missingOutput.every(r => populations[r.id] !== undefined) && missingOutput.some(r => populations[r.id]! > 0)) {
      const amounts = allocate(integer(Math.round(gdp.value)) - knownOutput, missingOutput.map(r => populations[r.id]!));
      missingOutput.forEach((r, i) => { outputs[r.id] = amounts[i]; ep[r.id] = { status: 'modelled', method: 'national_output_by_simulation_population_largest_remainder', logicalDate: state.date, inputs: [{ dataset: gdp.source.datasetId, referenceDate: gdp.referenceDate, value: gdp.value as number }, { dataset: `simulation.population:${r.id}`, referenceDate: state.date, value: populations[r.id] }], limitation: 'Uniform output per inhabitant; national GDP is a capacity anchor, not observed local production.' }; });
    }
  }
  const initialized: Record<string, SocioRegion> = {};
  for (const region of sorted) {
    const id = region.id, population = populations[id], annual = outputs[id];
    if (population !== undefined) integer(population);
    if (annual !== undefined) integer(annual);
    const cohorts = population === undefined ? [] : cohortsFor(population);
    initialized[id] = {
      population, annualOutputReference: annual, cohorts, populationProvenance: pp[id], outputProvenance: ep[id],
      incomeDistributionProvenance: prior(state.date, 'modelled_income_shares_20_40_40', population !== undefined),
      orientationProvenance: prior(state.date, 'modelled_noninformative_prior', population !== undefined),
      employmentProvenance: prior(state.date, 'labour_60pct_employed_95pct_prior', population !== undefined && annual !== undefined && population > 0),
      economy: population === undefined || annual === undefined ? undefined : calibrate(population, annual, cohorts),
    };
  }
  return { ...state, socioeconomy: { ...emptySocioeconomy(), initializedOn: state.date, regions: initialized },
    populationByRegion: Object.fromEntries(sorted.map(region => [region.id, initialized[region.id].population])),
    economicOutputByRegion: Object.fromEntries(sorted.map(region => [region.id, initialized[region.id].annualOutputReference])) };
}
