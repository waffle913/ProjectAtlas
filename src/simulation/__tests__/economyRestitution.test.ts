import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { emptyOperations } from '../operations/model';
import { initializeOperations } from '../operations/runtime';
import { emptyInternational } from '../international/model';
import { initializeInternational } from '../international/runtime';
import { emptyTrade } from '../trade/model';
import { initializeTrade } from '../trade/runtime';
import { emptyMilitary } from '../military/model';
import { initializeMilitary } from '../military/runtime';
import { emptyFiscal } from '../fiscal/model';
import { initializeFiscal } from '../fiscal/runtime';
import { emptyCrisis, initializeCrisisState } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { initializePolitics } from '../politics/initialization';
import { emptyGovernance } from '../governance/model';
import { createPoliticalPerson, assignPoliticalOffice, setControlledPerson } from '../governance/runtime';
import { emptyInformation } from '../information/model';
import { initializeInformationState } from '../information/runtime';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyAssets } from '../assets/model';
import { initializeMultilateral } from '../multilateral/runtime';
import { inspectEconomy } from '../economy/inspect';
import { createEngineState } from '../state';
import { serializeSimulationState, restoreSimulationState } from '../save';
import { assertSimulationInvariants } from '../invariants';

const A = 'country.synth-a', B = 'country.synth-b';
const regionA = 'region.synth-a', regionB = 'region.synth-b';
const regions: RegionEntity[] = [A, B].map((id, i) => ({ id: i === 0 ? regionA : regionB, parentCountryId: id, initialOwnerCountryId: id, commonName: `Synthetic Region ${i}`, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'synthetic-test', sourceFeatureIds: [String(i)] } }));
const context = { regions, countryIds: new Set([A, B]), regionIds: new Set([regionA, regionB]) };

function fixture(): SimulationState {
  let state: SimulationState = {
    schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
    territoryOwnership: {}, regionOwnership: { [regionA]: A, [regionB]: B },
    populationByRegion: { [regionA]: 10000, [regionB]: 10000 }, economicOutputByRegion: { [regionA]: 1200000000, [regionB]: 1200000000 },
    bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState([A, B]),
  };
  state = initializeInformationState(initializeFiscal(initializeSocioeconomy(state, regions)));
  state = { ...state, crisis: initializeCrisisState(state.crisis, [A, B], state.date), politics: initializePolitics(state, [A, B], regions) };
  state = initializeMilitary(state);
  state = initializeTrade(state);
  state = initializeInternational(state);
  state = initializeOperations(state);
  state = initializeMultilateral(state);
  state = createPoliticalPerson(state, { countryId: A, displayName: 'Head' });
  const headId = Object.keys(state.governance.persons)[0];
  state = assignPoliticalOffice(state, headId, { countryId: A, role: 'head_of_government' });
  state = createPoliticalPerson(state, { countryId: A, displayName: 'Legislator' });
  const legislatorId = Object.keys(state.governance.persons).find(id => id !== headId)!;
  state = assignPoliticalOffice(state, legislatorId, { countryId: A, role: 'legislator' });
  state = createPoliticalPerson(state, { countryId: A, displayName: 'Opposition leader' });
  return setControlledPerson(state, headId);
}
const headId = (state: SimulationState) => state.governance.player.controlledPersonId!;
const legislatorId = (state: SimulationState) => Object.values(state.governance.persons).find(p => p.office?.role === 'legislator')!.id;
const oppositionId = (state: SimulationState) => Object.values(state.governance.persons).find(p => p.office === undefined)!.id;

describe('0.25.11 economy restitution, authority and save determinism', () => {
  it('gates the economy view behind a government-information office', () => {
    const state = fixture();
    expect(inspectEconomy(state, A, headId(state))).toBeDefined();
    expect(inspectEconomy(state, A, legislatorId(state))).toBeUndefined();
    expect(inspectEconomy(state, A, oppositionId(state))).toBeUndefined();
    expect(inspectEconomy(state, B, headId(state))).toBeUndefined();
  });

  it('never mutates canonical state and labels provenance honestly', () => {
    const state = fixture();
    const before = structuredClone(state);
    const view = inspectEconomy(state, A, headId(state))!;
    expect(state).toEqual(before);
    expect(view.access).toBe('government');
    expect(view.provenance.status).toBe('derived');
    expect(view.provenance.limitation).toMatch(/is presented as a real observation/);
    expect(view.regions.length).toBe(1);
    expect(view.regions[0].regionId).toBe(regionA);
    expect(view.regions[0].households).toBeDefined();
    expect(view.regions[0].firms).toBeDefined();
    expect(view.regions[0].domesticPrice).toBeDefined();
    expect(view.trade).toBeDefined();
    expect(view.fiscal).toBeDefined();
    // modelled status is kept distinct, never collapsed into an observation
    expect(view.regions[0].domesticPrice!.status).toBe('modelled');
  });

  it('recomputes identically after a save/reload round trip (no migration, deterministic restitution)', () => {
    const state = fixture();
    expect(assertSimulationInvariants(state, context, 'save')).toBe(true);
    const restored = restoreSimulationState(serializeSimulationState(state, context), regions, {}, {}, context);
    expect(inspectEconomy(restored, A, headId(state))).toEqual(inspectEconomy(state, A, headId(state)));
  });
});
