import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyAssets } from '../assets/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptyFiscal } from '../fiscal/model';
import { assessFiscalSolvency, initializeFiscal, runFiscalMonth } from '../fiscal/runtime';
import { borrowingCapacity } from '../fiscal/math';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { createEngineState } from '../state';
import { assertSimulationInvariants } from '../invariants';
import { restoreSimulationState, serializeSimulationState } from '../save';

const region = (id: string): RegionEntity => ({ id: `region.${id}`, parentCountryId: `country.${id}`, initialOwnerCountryId: `country.${id}`, commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } });
const build = (): { state: SimulationState; regions: RegionEntity[] } => {
  const regions = [region('a')], countryIds = ['country.a'];
  let state: SimulationState = {
    schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
    territoryOwnership: {}, regionOwnership: { 'region.a': 'country.a' },
    populationByRegion: { 'region.a': 100_000 }, economicOutputByRegion: { 'region.a': 1_200_000_000 },
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(countryIds, 'finance-seed'),
  };
  state = initializeFiscal(initializeSocioeconomy(state, regions));
  state = runFiscalMonth({ ...state, date: '2026-02-01' });
  return { state, regions };
};
const invariantContext = (regions: RegionEntity[]) => ({ regions, countryIds: new Set(['country.a']), regionIds: new Set(['region.a']) });

describe('finance 0.26 runtime integration', () => {
  it('assesses a healthy sovereign as solvent over the canonical fiscal surfaces', () => {
    const { state } = build();
    const { assessment, credit } = assessFiscalSolvency(state, 'country.a');
    expect(assessment.state).toBe('solvent');
    expect(assessment.reason).toBeNull();
    const c = state.fiscal.countries['country.a'];
    expect(credit).toEqual({ usable: c.debtLimit - c.debt, blocked: false });
    // Recorded at the monthly close as a derived indicator.
    expect(c.account!.stress.solvencyState).toBe('solvent');
    expect(c.account!.stress.solvencyReason).toBeNull();
  });

  it('blocks new borrowing for a sovereign in default and lets arrears feed back causally', () => {
    let { state, regions } = build();
    const c = state.fiscal.countries['country.a'];
    expect(c.debt).toBe(0);
    expect(borrowingCapacity(c)).toBeGreaterThan(0); // credit exists without the solvency gate
    // Simulate a prior month that left unpaid interest (a real default trigger).
    state = { ...state, fiscal: { ...state.fiscal, countries: { ...state.fiscal.countries, 'country.a': { ...c, interestArrears: 500_000_000, cash: 0 } } } };
    const next = runFiscalMonth({ ...state, date: '2026-03-01' });
    const account = next.fiscal.countries['country.a'].account!;
    expect(account.financingNeed).toBeGreaterThan(0);
    expect(account.borrowed).toBe(0);                     // creditCeiling blocks new credit on default
    expect(account.closingDebt).toBe(account.openingDebt); // no new debt issued
    // The country still pays interest from current revenue, but the block on new
    // credit leaves it in default: arrears persist and never fall to zero.
    expect(account.interestArrears).toBeGreaterThan(0);
    expect(account.stress.solvencyState).toBe('in_default');
    expect(account.stress.solvencyReason).toBe('interest_arrears');
    const { assessment, credit } = assessFiscalSolvency(next, 'country.a');
    expect(assessment.state).toBe('in_default');
    expect(credit).toEqual({ usable: 0, blocked: true });
    expect(assertSimulationInvariants(next, invariantContext(regions), 'save')).toBe(true);
  });

  it('round-trips the derived solvency indicator through save/reload', () => {
    const { state, regions } = build();
    const restored = restoreSimulationState(serializeSimulationState(state, invariantContext(regions)), regions, {}, {}, invariantContext(regions));
    expect(restored.fiscal.countries['country.a'].account!.stress.solvencyState).toBe('solvent');
    expect(restored.fiscal.countries['country.a'].account!.stress.solvencyReason).toBeNull();
  });
});
