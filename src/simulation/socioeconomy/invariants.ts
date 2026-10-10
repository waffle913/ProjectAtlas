import type { SimulationInvariant } from '../invariants';
import { cohortsFor, INCOMES, MODEL, ORIENTATIONS } from './model';
import { isSimulationDate } from '../date';
import { reservedPersonnel } from '../military/runtime';
import { constructionReservedPersonnel } from '../assets/workforce';
const quantity = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export const socioeconomicInvariant: SimulationInvariant = {
  id: 'socioeconomic-conservation',
  check: (state, context) => {
    const errors: string[] = [], socio = state.socioeconomy;
    if (!socio || socio.modelVersion !== MODEL.version || !socio.regions || !Array.isArray(socio.administration) || !Array.isArray(socio.playerCountryIds)) return ['Malformed socioeconomic state.'];
    const dates = new Map<string, boolean>(), populations = new Map<number, ReadonlyMap<string, number>>();
    const validDate = (value: string) => {
      let valid = dates.get(value);
      if (valid === undefined) { valid = isSimulationDate(value); dates.set(value, valid); }
      return valid;
    };
    if (!socio.initializedOn && Object.keys(socio.regions).length) errors.push('Socioeconomic Regions lack initialization date.');
    if (socio.initializedOn !== undefined && (!validDate(socio.initializedOn) || socio.initializedOn > state.date)
      || socio.lastMonthlyDate !== undefined && (!validDate(socio.lastMonthlyDate) || socio.lastMonthlyDate > state.date)) errors.push('Invalid socioeconomic dates.');
    for (const dirty of state.engine.dirtyDomains.filter(d => d.domain === 'socioeconomy')) for (const id of dirty.entityIds) if (!context.regionIds.has(id)) errors.push(`Dirty economy references unknown Region: ${id}`);
    for (const id of socio.playerCountryIds) if (!context.countryIds.has(id)) errors.push(`Unknown player Country: ${id}`);
    if (socio.initializedOn) for (const id of context.regionIds) if (!socio.regions[id]) errors.push(`Missing socioeconomic Region: ${id}`);
    for (const [id, r] of Object.entries(socio.regions)) {
      const fail = (message: string) => errors.push(`${id}: ${message}`);
      if (!context.regionIds.has(id)) fail('Unknown Region.');
      for (const provenance of [r.populationProvenance, r.outputProvenance, r.incomeDistributionProvenance, r.orientationProvenance, r.employmentProvenance]) {
        if (!provenance || !['sourced', 'derived', 'modelled', 'unavailable'].includes(provenance.status) || !provenance.method || !validDate(provenance.logicalDate) || !Array.isArray(provenance.inputs) || provenance.logicalDate > state.date) fail('Missing status/provenance.');
      }
      if (r.annualOutputReference !== undefined && !quantity(r.annualOutputReference)) fail('Invalid annual output reference.');
      if ((r.outputProvenance.status === 'unavailable') !== (r.annualOutputReference === undefined)) fail('Annual output reference and quality disagree.');
      if (!Array.isArray(r.cohorts)) { fail('Malformed cohorts.'); continue; }
      if (r.population === undefined) {
        if (r.cohorts.length || r.economy || r.populationProvenance.status !== 'unavailable') fail('Unavailable population cannot become zero or generate cohorts/economy.');
        continue;
      }
      if (!quantity(r.population)) { fail('Invalid population.'); continue; }
      if (r.populationProvenance.status === 'unavailable') fail('Population has unavailable status but a value.');
      if (r.cohorts.length !== 9) fail('Expected nine cohorts.');
      const seen = new Set<string>();
      for (const c of r.cohorts) {
        const key = `${c.income}:${c.orientation}`;
        if (seen.has(key) || !INCOMES.includes(c.income) || !ORIENTATIONS.includes(c.orientation) || !quantity(c.persons)) fail('Invalid or duplicate cohort.');
        seen.add(key);
      }
      if (r.cohorts.reduce((s, c) => s + c.persons, 0) !== r.population) fail('Cohort population is not conserved.');
      if (r.population !== state.populationByRegion[id]) fail('Region population diverges from canonical populationByRegion.');
      let expectedCohorts = populations.get(r.population);
      if (!expectedCohorts) {
        expectedCohorts = new Map(cohortsFor(r.population).map(c => [`${c.income}:${c.orientation}`, c.persons]));
        populations.set(r.population, expectedCohorts);
      }
      if (r.cohorts.some(c => c.persons !== expectedCohorts.get(`${c.income}:${c.orientation}`))) fail('Canonical income/orientation population split is not conserved.');
      const e = r.economy; if (!e) continue;
      if (r.outputProvenance.status === 'unavailable' || r.employmentProvenance.status === 'unavailable') fail('Economy cannot use unavailable inputs.');
      if (e.unit !== 'USD_PER_MONTH' || e.personsUnit !== 'PERSONS') fail('Invalid units.');
      for (const field of ['baseOutput', 'baseEmployed', 'labourForce', 'employed', 'unemployed', 'capacity', 'productionCapacity', 'output', 'householdIncome', 'householdDemand', 'demand', 'consumption', 'otherDemandResidual', 'otherDemandRealized', 'shortage', 'essentialConsumption', 'basicNeedsCoverageBps'] as const) if (!quantity(e[field])) fail(`Invalid quantity ${field}.`);
      for (const list of [e.incomeByGroup, e.consumptionByGroup, e.essentialReferenceByGroup]) if (!Array.isArray(list) || list.length !== 3 || !list.every(quantity)) fail('Invalid group flow.');
      if (!quantity(e.productivity.outputUsd) || !quantity(e.productivity.workers) || !e.productivity.workers) fail('Invalid rational productivity.');
      if (Object.values(e.shock).some(v => !quantity(v) || v > 10000)) fail('Invalid shock.');
      if (e.employed + e.unemployed + reservedPersonnel(state, id) + constructionReservedPersonnel(state, id) !== e.labourForce || e.labourForce > r.population || e.baseEmployed > e.labourForce) fail('Labour stock conservation failed.');
      if (e.output > e.productionCapacity || e.output > e.demand || e.output !== e.consumption + e.otherDemandRealized || e.demand !== e.householdDemand + e.otherDemandResidual || e.shortage !== e.demand - e.output) fail('Output/demand/consumption accounting failed.');
      if (e.incomeByGroup.reduce((a, b) => a + b, 0) !== e.householdIncome || e.consumptionByGroup.reduce((a, b) => a + b, 0) !== e.consumption || e.householdIncome > e.output) fail('Household income/consumption accounting failed.');
      if (e.basicNeedsCoverageBps > 10000 || e.essentialConsumption > e.consumption) fail('Invalid needs coverage.');
      const importFields = [e.importedConsumptionByGroup, e.importedReferenceConsumptionByGroup, e.importAvailableNeedsCoverageBps, e.importEssentialConsumption, e.importRequestedBudgetByGroup];
      const prepared = state.trade.prepared?.regions[id];
      if (prepared || importFields.some(value => value !== undefined)) {
        if (!prepared) fail('Imported consumption has no dated funding/fulfillment record.');
        if ([e.importedConsumptionByGroup, e.importedReferenceConsumptionByGroup, e.importRequestedBudgetByGroup].some(list =>
          !Array.isArray(list) || list.length !== 3 || !list.every(quantity))
          || !quantity(e.importAvailableNeedsCoverageBps) || e.importAvailableNeedsCoverageBps > 10000
          || !quantity(e.importEssentialConsumption)) fail('Invalid or incomplete separately fulfilled imported consumption.');
      }
    }
    const counts = new Map<string, number>();
    for (const entry of socio.administration) {
      if (!context.countryIds.has(entry.countryId) || !validDate(entry.date) || entry.date > state.date || entry.action !== 'maintain_parameters' || !entry.reason || !quantity(entry.observedRegions) || (entry.outputUsdMonthly !== undefined && !quantity(entry.outputUsdMonthly)) || !['complete', 'partial', 'unavailable'].includes(entry.outputCoverage) || (entry.outputCoverage === 'unavailable') !== (entry.outputUsdMonthly === undefined)) errors.push('Invalid administration journal entry.');
      counts.set(entry.countryId, (counts.get(entry.countryId) ?? 0) + 1);
    }
    if ([...counts.values()].some(n => n > MODEL.journalLimit)) errors.push('Unbounded administration journal.');
    return errors;
  },
};
