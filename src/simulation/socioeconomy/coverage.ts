import type { RegionEntity, SimulationState } from '../../types';
import type { Quality } from './model';
const counts = () => ({ sourced: 0, derived: 0, modelled: 0, unavailable: 0 });
export function socioeconomicCoverage(state: SimulationState, regions: readonly RegionEntity[], countryIds: readonly string[]) {
  const countries = [...countryIds].sort().map(countryId => {
    const local = regions.filter(r => r.parentCountryId === countryId).map(r => state.socioeconomy.regions[r.id]);
    const population = counts(), output = counts(), incomeDistribution = counts(), employment = counts(), orientation = counts();
    for (const r of local) {
      population[r.populationProvenance.status]++; output[r.outputProvenance.status]++;
      incomeDistribution[r.incomeDistributionProvenance.status]++; employment[r.employmentProvenance.status]++; orientation[r.orientationProvenance.status]++;
    }
    return { countryId, regions: local.length, activeEconomies: local.filter(r => r.economy).length, cohorts: local.reduce((sum, r) => sum + r.cohorts.length, 0), population, output, incomeDistribution, employment, orientation,
      limitations: [...new Set(local.flatMap(r => [r.populationProvenance, r.outputProvenance].map(p => p.limitation ?? (p.status === 'unavailable' ? p.method : undefined)).filter((v): v is string => Boolean(v))))],
      modelAssumptions: ['Income shares 20/40/40; persons 40/40/20', 'Symmetric political prior, no economic effect', 'Labour force 60%, initial employment 95%', 'Household share 65%; residual demand held exogenous'],
    };
  });
  const summary = { countries: countries.length, regions: regions.length, activeEconomies: countries.reduce((sum, c) => sum + c.activeEconomies, 0), cohorts: countries.reduce((sum, c) => sum + c.cohorts, 0), population: counts(), output: counts(), incomeDistribution: counts(), employment: counts(), orientation: counts() };
  for (const c of countries) for (const field of ['population', 'output', 'incomeDistribution', 'employment', 'orientation'] as const) for (const q of Object.keys(counts()) as Quality[]) summary[field][q] += c[field][q];
  return { milestone: '0.10', modelVersion: state.socioeconomy.modelVersion, logicalDate: state.date, limitations: ['Simulation initialization only; audited data unchanged.', 'Existing pinned sources may have retrieval/revision dates after scenario date; only reference dates on/before scenario are used. Not a historical information-set reconstruction.', 'No sourced income quintiles or regional employment series in current snapshots; explicit priors only.'], summary, countries };
}
