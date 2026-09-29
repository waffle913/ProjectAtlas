import type { SimulationState } from '../../types';

export type Quality = 'sourced' | 'derived' | 'modelled' | 'unavailable';
export interface Provenance {
  status: Quality; method: string; logicalDate: string;
  inputs: { dataset: string; referenceDate: string; value?: number }[];
  limitation?: string;
}
export const MODEL = Object.freeze({
  version: 'socioeconomy-0.10-v1', populationShares: [40, 40, 20], incomeShares: [20, 40, 40],
  consumptionBps: [9500, 8500, 6500], essentialBps: [8000, 5500, 3000],
  labourBps: 6000, initialEmploymentBps: 9500, householdIncomeBps: 6500,
  employmentAdjustmentBps: 5000, journalLimit: 24,
  populationFallback: 'equal_region_weights_largest_remainder',
});
export const INCOMES = ['low', 'middle', 'high'] as const;
export const ORIENTATIONS = ['left', 'centre', 'right'] as const;
export interface Cohort { income: typeof INCOMES[number]; orientation: typeof ORIENTATIONS[number]; persons: number }
export interface Shock { capacityBps: number; productivityBps: number; labourBps: number }
export const NO_SHOCK: Shock = { capacityBps: 10000, productivityBps: 10000, labourBps: 10000 };
export interface Economy {
  unit: 'USD_PER_MONTH'; personsUnit: 'PERSONS';
  baseOutput: number; baseEmployed: number; labourForce: number;
  employed: number; unemployed: number;
  productivity: { outputUsd: number; workers: number }; // Rational USD / worker / month.
  capacity: number; productionCapacity: number; output: number; householdIncome: number; incomeByGroup: number[];
  householdDemand: number; demand: number; consumption: number; consumptionByGroup: number[];
  otherDemandResidual: number; otherDemandRealized: number; shortage: number;
  essentialReferenceByGroup: number[]; essentialConsumption: number; basicNeedsCoverageBps: number;
  shock: Shock;
}
export interface SocioRegion {
  population?: number; annualOutputReference?: number; cohorts: Cohort[];
  populationProvenance: Provenance; outputProvenance: Provenance;
  incomeDistributionProvenance: Provenance; orientationProvenance: Provenance;
  employmentProvenance: Provenance;
  economy?: Economy;
}
export interface AdministrationEntry { date: string; countryId: string; action: 'maintain_parameters'; reason: string; observedRegions: number; outputUsdMonthly?: number; outputCoverage: 'complete' | 'partial' | 'unavailable' }
export interface SocioeconomicState {
  modelVersion: string; initializedOn?: string; lastMonthlyDate?: string;
  regions: Record<string, SocioRegion>; playerCountryIds: string[];
  administration: AdministrationEntry[];
}
export const emptySocioeconomy = (): SocioeconomicState => ({ modelVersion: MODEL.version, regions: {}, playerCountryIds: [], administration: [] });
export function integer(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid non-negative safe integer: ${value}`);
  return value;
}
export function ratio(value: number, numerator: number, denominator: number): number {
  integer(value); integer(numerator); integer(denominator);
  if (!denominator) throw new Error('Zero ratio denominator.');
  return integer(Number((BigInt(value) * BigInt(numerator) + BigInt(Math.floor(denominator / 2))) / BigInt(denominator)));
}
/** Exact largest remainder; input order is the deterministic tie-break. */
export function allocate(total: number, weights: readonly number[]): number[] {
  integer(total); weights.forEach(integer);
  const sum = weights.reduce((a, b) => a + BigInt(b), 0n);
  if (!sum) { if (total) throw new Error('Cannot allocate positive total to zero weights.'); return weights.map(() => 0); }
  const products = weights.map(w => BigInt(total) * BigInt(w));
  const result = products.map(v => Number(v / sum));
  const order = products.map((v, i) => ({ i, remainder: v % sum })).sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
  const left = total - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < left; i++) result[order[i].i]++;
  return result;
}
export const prior = (date: string, method: string, available = true): Provenance => ({ status: available ? 'modelled' : 'unavailable', method, logicalDate: date, inputs: available ? [{ dataset: MODEL.version, referenceDate: date }] : [] });
export function cohortsFor(population: number): Cohort[] {
  return allocate(population, MODEL.populationShares).flatMap((persons, i) => allocate(persons, [1, 1, 1]).map((n, j) => ({ income: INCOMES[i], orientation: ORIENTATIONS[j], persons: n })));
}
const incomeWeights = (cohorts: Cohort[]) => INCOMES.map((group, i) => cohorts.some(c => c.income === group && c.persons > 0) ? MODEL.incomeShares[i] : 0);
const demandByGroup = (income: number[]) => income.map((value, i) => ratio(value, MODEL.consumptionBps[i], 10000));
export function calibrate(population: number, annualOutput: number, cohorts: Cohort[]): Economy | undefined {
  integer(population); integer(annualOutput);
  if (!population) return undefined;
  const baseOutput = ratio(annualOutput, 1, 12);
  const labourForce = Math.max(1, ratio(population, MODEL.labourBps, 10000));
  const baseEmployed = Math.max(1, ratio(labourForce, MODEL.initialEmploymentBps, 10000));
  const householdIncome = ratio(baseOutput, MODEL.householdIncomeBps, 10000);
  const incomeByGroup = allocate(householdIncome, incomeWeights(cohorts));
  const consumptionByGroup = demandByGroup(incomeByGroup);
  const consumption = consumptionByGroup.reduce((a, b) => a + b, 0);
  const essentialReferenceByGroup = consumptionByGroup.map((v, i) => ratio(v, MODEL.essentialBps[i], 10000));
  return {
    unit: 'USD_PER_MONTH', personsUnit: 'PERSONS', baseOutput, baseEmployed, labourForce,
    employed: baseEmployed, unemployed: labourForce - baseEmployed,
    productivity: { outputUsd: baseOutput, workers: baseEmployed }, capacity: baseOutput, productionCapacity: baseOutput, output: baseOutput,
    householdIncome, incomeByGroup, householdDemand: consumption, demand: baseOutput,
    consumption, consumptionByGroup, otherDemandResidual: baseOutput - consumption, otherDemandRealized: baseOutput - consumption,
    shortage: 0, essentialReferenceByGroup, essentialConsumption: essentialReferenceByGroup.reduce((a, b) => a + b, 0),
    basicNeedsCoverageBps: 10000, shock: { ...NO_SHOCK },
  };
}
/** Pure projection: immediate updates change capacity only, never book another month. */
export function projectCapacity(e: Economy): Economy {
  const infrastructure = ratio(e.baseOutput, e.shock.capacityBps, 10000);
  const labour = ratio(e.baseEmployed, e.shock.labourBps, 10000);
  const productivity = ratio(e.baseOutput, e.shock.productivityBps, 10000);
  const capacity = Math.min(infrastructure, ratio(productivity, labour, e.baseEmployed));
  return { ...e, capacity, productivity: { outputUsd: productivity, workers: e.baseEmployed } };
}
export function evolve(region: SocioRegion, fiscal?: { householdRequests: number[]; otherDemand: number }): SocioRegion {
  if (!region.economy) return region;
  const e = { ...projectCapacity(region.economy), otherDemandResidual: fiscal?.otherDemand ?? region.economy.otherDemandResidual };
  const householdRequests = fiscal?.householdRequests ?? demandByGroup(e.incomeByGroup);
  const householdDemand = householdRequests.reduce((a, b) => a + b, 0);
  const demand = integer(householdDemand + e.otherDemandResidual);
  // Bounded hiring responds to demand; actual employed workers constrain production.
  const potentialOutput = Math.min(e.capacity, demand);
  const desiredJobs = e.productivity.outputUsd ? Math.min(e.labourForce, ratio(potentialOutput, e.baseEmployed, e.productivity.outputUsd)) : 0;
  const availableJobs = ratio(e.baseEmployed, e.shock.labourBps, 10000);
  const employed = Math.min(availableJobs, ratio(e.employed, 10000 - MODEL.employmentAdjustmentBps, 10000) + ratio(desiredJobs, MODEL.employmentAdjustmentBps, 10000));
  const productionCapacity = Math.min(e.capacity, ratio(e.productivity.outputUsd, employed, e.baseEmployed));
  const output = Math.min(productionCapacity, demand);
  const employmentIncome = e.baseEmployed ? ratio(e.baseOutput, employed, e.baseEmployed) : 0;
  const householdIncome = ratio(Math.min(output, employmentIncome), MODEL.householdIncomeBps, 10000);
  const incomeByGroup = allocate(householdIncome, incomeWeights(region.cohorts));
  const realized = allocate(output, [...householdRequests, e.otherDemandResidual]);
  const consumptionByGroup = realized.slice(0, 3);
  const consumption = consumptionByGroup.reduce((a, b) => a + b, 0);
  const essentialConsumption = consumptionByGroup.reduce((sum, v, i) => sum + Math.min(e.essentialReferenceByGroup[i], ratio(v, MODEL.essentialBps[i], 10000)), 0);
  const reference = e.essentialReferenceByGroup.reduce((a, b) => a + b, 0);
  return { ...region, economy: { ...e, productionCapacity, output, employed, unemployed: e.labourForce - employed,
    householdIncome, incomeByGroup, householdDemand, demand, consumption, consumptionByGroup,
    otherDemandRealized: realized[3], shortage: demand - output, essentialConsumption,
    basicNeedsCoverageBps: reference ? ratio(essentialConsumption, 10000, reference) : 10000,
  } };
}
export const inspectSocioeconomy = (state: SimulationState, regionId: string) => structuredClone({
  date: state.date, regionId, owner: state.regionOwnership[regionId], ...state.socioeconomy.regions[regionId],
  dirty: state.engine.dirtyDomains.filter(d => d.domain === 'socioeconomy' && (!d.entityIds.length || d.entityIds.includes(regionId))),
});

/** Explicit defensive copy avoids structuredClone's world-scale serialization overhead. */
export function cloneSocioeconomy(s: SocioeconomicState): SocioeconomicState {
  const provenance = (p: Provenance): Provenance => ({ ...p, inputs: p.inputs.map(i => ({ ...i })) });
  return { ...s, playerCountryIds: [...s.playerCountryIds], administration: s.administration.map(e => ({ ...e })),
    regions: Object.fromEntries(Object.entries(s.regions).map(([id, r]) => [id, {
      ...r, cohorts: r.cohorts.map(c => ({ ...c })),
      populationProvenance: provenance(r.populationProvenance), outputProvenance: provenance(r.outputProvenance),
      incomeDistributionProvenance: provenance(r.incomeDistributionProvenance), orientationProvenance: provenance(r.orientationProvenance), employmentProvenance: provenance(r.employmentProvenance),
      economy: r.economy ? { ...r.economy, productivity: { ...r.economy.productivity }, shock: { ...r.economy.shock }, incomeByGroup: [...r.economy.incomeByGroup], consumptionByGroup: [...r.economy.consumptionByGroup], essentialReferenceByGroup: [...r.economy.essentialReferenceByGroup] } : undefined,
    }])) };
}
