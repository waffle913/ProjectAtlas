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
import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics, COHORT } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { initializeFiscal } from '../fiscal/runtime';
import { initializePolitics } from '../politics/initialization';
import { initializeInformationState } from '../information/runtime';
import { createEngineState } from '../state';
import { assertSimulationInvariants } from '../invariants';
import { applyOpinionShiftToPolitics } from '../media/integration';

const A = 'country.med-a', regionA = 'region.med-a';
function fixture(): { state: SimulationState; regions: RegionEntity[] } {
  const regions: RegionEntity[] = [{ id: regionA, parentCountryId: A, initialOwnerCountryId: A, commonName: 'Synthetic media Region', administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'synthetic-media-fixture', sourceFeatureIds: ['0'] } }];
  let state: SimulationState = {
    schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
    territoryOwnership: {}, regionOwnership: { [regionA]: A },
    populationByRegion: { [regionA]: 10000 }, economicOutputByRegion: { [regionA]: 1200000000 },
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState([A], 'media-seed'),
  };
  state = initializeInformationState(initializeFiscal(initializeSocioeconomy(state, regions)));
  state = { ...state, politics: initializePolitics(state, [A], regions) };
  return { state, regions };
}

describe('media 0.32 runtime integration (opinion shift -> politics)', () => {
  it('applies a causal, bounded opinion shift to canonical cohort sentiment', () => {
    const { state, regions } = fixture();
    const regional = state.politics.regionalOpinion[regionA];
    const cohortKey = Object.keys(regional.cohorts)[0];
    const before = regional.cohorts[cohortKey][COHORT.sentiment];
    const shifted = applyOpinionShiftToPolitics(state, { id: 'shift.1', regionId: regionA, cohortKey, deltaBps: 1500, causeId: 'statement:executive-address', date: state.date, note: 'Synthetic causal opinion shift' });
    expect(shifted.politics.regionalOpinion[regionA].cohorts[cohortKey][COHORT.sentiment]).toBe(before + 1500);
    expect(assertSimulationInvariants(shifted, { regions, countryIds: new Set([A]), regionIds: new Set([regionA]) }, 'save')).toBe(true);
  });

  it('applies a whole-region shift to every cohort and clamps at the canonical bound', () => {
    const { state } = fixture();
    let shifted = applyOpinionShiftToPolitics(state, { id: 'shift.2', regionId: regionA, cohortKey: null, deltaBps: -10000, causeId: 'crisis:material', date: state.date, note: 'Synthetic clamping shift' });
    for (const opinion of Object.values(shifted.politics.regionalOpinion[regionA].cohorts)) {
      expect(opinion[COHORT.sentiment]).toBe(-10000);
    }
    // A further negative shift clamps at the bound, never below it.
    shifted = applyOpinionShiftToPolitics(shifted, { id: 'shift.2b', regionId: regionA, cohortKey: null, deltaBps: -1, causeId: 'crisis:material', date: state.date, note: 'Clamp check' });
    for (const opinion of Object.values(shifted.politics.regionalOpinion[regionA].cohorts)) {
      expect(opinion[COHORT.sentiment]).toBe(-10000);
    }
  });

  it('fails closed on an unknown Region or cohort', () => {
    const { state } = fixture();
    expect(() => applyOpinionShiftToPolitics(state, { id: 'shift.3', regionId: 'region.nope', cohortKey: null, deltaBps: 10, causeId: 'x', date: state.date, note: 'x' })).toThrow(/Unknown political Region/);
    expect(() => applyOpinionShiftToPolitics(state, { id: 'shift.4', regionId: regionA, cohortKey: 'unknown:cohort', deltaBps: 10, causeId: 'x', date: state.date, note: 'x' })).toThrow(/Unknown political cohort/);
  });
});
