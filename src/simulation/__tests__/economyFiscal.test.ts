import { describe, it, expect } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { createEngineState } from '../state';
import { emptySocioeconomy, calibrate, cohortsFor, prior, ratio, type SocioRegion } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { emptyFiscal, type FiscalCountry, type Policy } from '../fiscal/model';
import { initializeFiscal } from '../fiscal/runtime';
import { emptyTrade } from '../trade/model';
import { emptyAssets } from '../assets/model';
import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyMilitary } from '../military/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptyPolitics } from '../politics/model';
import { emptyCrisis } from '../crisis/model';
import { countryFiscalDerivation, regionTaxDerivation } from '../economy/fiscal';

const base = (): SimulationState => ({
  schemaVersion: 20,
  operations: emptyOperations(),
  international: emptyInternational(),
  multilateral: emptyMultilateral(),
  constitution: emptyConstitution(),
  elections: emptyElections(),
  assets: emptyAssets(),
  trade: emptyTrade(),
  military: emptyMilitary(),
  governance: emptyGovernance(),
  information: emptyInformation(),
  politics: emptyPolitics(),
  crisis: emptyCrisis(),
  fiscal: emptyFiscal(),
  socioeconomy: emptySocioeconomy(),
  date: '2026-01-01',
  paused: false,
  speed: 1,
  territoryOwnership: {},
  regionOwnership: { r1: 'c1' },
  populationByRegion: {},
  economicOutputByRegion: {},
  bilateralRelations: {},
  claims: [],
  explicitCasusBelli: [],
  wars: [],
  occupationByRegion: {},
  engine: createEngineState(),
});

const calibratedRegion = (population: number, annualOutput: number): SocioRegion => {
  const cohorts = cohortsFor(population);
  return {
    population,
    annualOutputReference: annualOutput,
    cohorts,
    populationProvenance: prior('2026-01-01', 'test'),
    outputProvenance: prior('2026-01-01', 'test'),
    incomeDistributionProvenance: prior('2026-01-01', 'test'),
    orientationProvenance: prior('2026-01-01', 'test'),
    employmentProvenance: prior('2026-01-01', 'test'),
    economy: calibrate(population, annualOutput, cohorts),
  };
};

const stateWithEconomy = (region: SocioRegion, policy?: Policy): SimulationState => {
  const s = base();
  const next: SimulationState = { ...s, socioeconomy: { ...s.socioeconomy, regions: { r1: region } } };
  if (policy) next.fiscal.countries['c1'] = { policy } as FiscalCountry;
  return next;
};

const nullPolicy = (): Policy => ({ personal: null, consumption: null, payroll: null, corporate: null });

describe('economy budget/fiscal derivation (0.25.9)', () => {
  it('returns undefined for a Region without an economy or without an owning fiscal Country', () => {
    expect(regionTaxDerivation(base(), 'r1', 'c1')).toBeUndefined();
    const state = stateWithEconomy(calibratedRegion(1000, 1_200_000));
    expect(regionTaxDerivation(state, 'r1', 'missing')).toBeUndefined();
    expect(countryFiscalDerivation(base(), 'c1')).toBeUndefined();
  });

  it('reports transaction bases even when every rule is unavailable (unavailable != zero)', () => {
    const region = calibratedRegion(1000, 1_200_000);
    const state = stateWithEconomy(region, nullPolicy());
    const economy = region.economy!;
    const deriv = regionTaxDerivation(state, 'r1', 'c1')!;
    expect(deriv.reconciled).toBe('fiscal_not_yet_run');
    expect(deriv.taxes.personal.status).toBe('unavailable');
    expect(deriv.taxes.personal.base).toBe(economy.householdIncome);
    expect(deriv.taxes.personal.liability).toBe(0);
    expect(deriv.taxes.employee.base).toBe(ratio(economy.householdIncome, 8000, 10000));
    expect(deriv.taxes.employee.liability).toBe(0);
    expect(deriv.taxes.employer.base).toBe(deriv.taxes.employee.base);
    expect(deriv.taxes.corporate.base).toBe(ratio(Math.max(0, economy.output - economy.householdIncome), 5000, 10000));
    expect(deriv.taxes.corporate.liability).toBe(0);
    expect(deriv.taxes.consumption.base).toBe(ratio(economy.consumption, 7000, 10000));
    expect(deriv.taxes.consumption.liability).toBe(0);
    for (const category of ['personal', 'employee', 'employer', 'corporate', 'consumption'] as const) {
      expect(deriv.taxes[category].status).toBe('unavailable');
      expect(deriv.taxes[category].liability).toBe(0);
    }
    expect(deriv.wageBillUsd).toBe(ratio(economy.householdIncome, 8000, 10000));
    expect(deriv.businessSurplusUsd).toBe(deriv.taxes.corporate.base);
    expect(deriv.importedConsumptionUsd).toBe(0);
  });

  it('reconciles the derived liabilities with the canonical fiscal ledger (no double counting)', () => {
    const ids = ['country.u6myyj'];
    const regions: RegionEntity[] = [{ id: 'r-country.u6myyj', parentCountryId: ids[0], initialOwnerCountryId: ids[0], commonName: ids[0], administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: ['t'] } }];
    const state = initializeFiscal(initializeSocioeconomy({
      schemaVersion: 20,
      operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(),
      constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(),
      military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'),
      politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(),
      date: '2026-01-01', paused: false, speed: 1, territoryOwnership: {},
      regionOwnership: { [regions[0].id]: ids[0] },
      populationByRegion: { [regions[0].id]: 10000 },
      economicOutputByRegion: { [regions[0].id]: 1200000000 },
      bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {},
      engine: createEngineState(ids),
    }, regions));
    const rid = regions[0].id;
    const deriv = regionTaxDerivation(state, rid, ids[0])!;
    expect(deriv.reconciled).toBe('reconciled');
    expect(deriv.taxes).toEqual(state.fiscal.regions[rid].taxes);
    expect(deriv.taxes.personal.liability).toBeGreaterThan(0);

    const country = countryFiscalDerivation(state, ids[0])!;
    expect(country.reconciled).toBe('reconciled');
    expect(country.derivedKnownTaxRevenueUsd).toBe(
      (['personal', 'employee', 'employer', 'corporate', 'consumption'] as const)
        .reduce((sum, k) => sum + country.taxes[k].collected, 0),
    );
    expect(country.taxes).toEqual(deriv.taxes);
    expect(country.regions).toHaveLength(1);
  });
});
