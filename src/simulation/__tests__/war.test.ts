import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptySocioeconomy } from '../../simulation/socioeconomy/model';
import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { adjustRelation, createClaim, createExplicitCasusBelli, expireCasusBelli, getAvailableCasusBelli, renounceClaim, revokeCasusBelli, setRelation, validateDiplomacyState, type DiplomacyContext } from '../diplomacy';
import { declareLimitedWar, endWar, getRegionOccupation, getWarOccupations, isWarGoalSatisfied, liberateRegion, occupyRegion, validateWarState } from '../war';
import { initializeOperations } from '../operations/runtime';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { controlledBaselineAnnualOutput, controlledBaselinePopulation, transferRegion } from '../region';
import { createEngineState } from '../state';

const context: DiplomacyContext = { countryIds: new Set(['country.a', 'country.b', 'country.c']), regionIds: new Set(['region.target', 'region.other', 'region.attacker']) };
const regions: RegionEntity[] = [...context.regionIds].map((id): RegionEntity => ({ id, parentCountryId: id === 'region.attacker' ? 'country.a' : 'country.b', initialOwnerCountryId: id === 'region.attacker' ? 'country.a' : 'country.b', commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } }));
const initialBase = (): SimulationState => ({ schemaVersion: 19, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: true, speed: 1, territoryOwnership: { legacy: 'country.b' }, regionOwnership: { 'region.target': 'country.b', 'region.other': 'country.b', 'region.attacker': 'country.a' }, populationByRegion: { 'region.target': 5_000_000, 'region.other': 2_000_000, 'region.attacker': 3_000_000 }, economicOutputByRegion: { 'region.target': 200_000_000_000, 'region.other': 80_000_000_000, 'region.attacker': 100_000_000_000 }, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(context.countryIds) });
const initial = () => initializeOperations(initialBase());
const controlFor = (state: SimulationState, regionId: string, controllerCountryId: string): SimulationState => {
  const components = { ...state.operations.components };
  for (const [id, component] of Object.entries(components)) {
    if (component.regionId === regionId && component.kind === 'decisive') components[id] = { ...component, controllingCountryId: controllerCountryId, captureProgress: 0, contested: false };
  }
  return { ...state, operations: { ...state.operations, components, regionControl: { ...state.operations.regionControl, [regionId]: 'foreign_controlled' as const } } };
};
const occupyWithControl = (state: SimulationState, params: { regionId: string; warId: string; occupierCountryId: string; startDate?: string }) => occupyRegion(controlFor(state, params.regionId, params.occupierCountryId), params, context);
const claimInput = { id: 'claim.target', claimantCountryId: 'country.a', regionId: 'region.target', type: 'territorial' as const, creationDate: '2026-01-01', reason: 'Reviewed claim' };
const withClaim = () => createClaim(initial(), claimInput, context);
const declareClaimWar = (state = withClaim(), warId = 'war.001') => declareLimitedWar(state, { warId, attackerCountryId: 'country.a', defenderCountryId: 'country.b', targetRegionId: 'region.target', casusBelliId: 'claim-derived:claim.target:country.b' }, context);
const competingClaim = { ...claimInput, id: 'claim.competing', claimantCountryId: 'country.c' };
const withCompetingClaim = () => createClaim(withClaim(), competingClaim, context);
const declareCompetingWar = (state: SimulationState) => declareLimitedWar(state, { warId: 'war.competing', attackerCountryId: 'country.c', defenderCountryId: 'country.b', targetRegionId: 'region.target', casusBelliId: 'claim-derived:claim.competing:country.b' }, context);

describe('limited bilateral war', () => {
  it('rejects competing active objectives across different Country pairs before mutation', () => {
    const active = declareClaimWar(withCompetingClaim());
    const before = structuredClone(active);
    expect(validateDiplomacyState(active, context)).toBe(true);
    expect(validateWarState(active, context)).toBe(true);
    expect(getAvailableCasusBelli(active, 'country.c', 'country.b', context)).toHaveLength(1);
    expect(() => declareCompetingWar(active)).toThrow(/Region region.target is already the objective of an active war/);
    expect(active).toEqual(before);
  });
  it.each(['invariant', 'reload'] as const)('rejects imported duplicate active objectives with otherwise valid wars at %s', boundary => {
    const prepared = withCompetingClaim();
    const corrupted = declareClaimWar(prepared);
    corrupted.wars.push(declareCompetingWar(prepared).wars[0]);
    const before = structuredClone(corrupted);
    expect(validateDiplomacyState(corrupted, context)).toBe(true);
    expect(corrupted.wars.map(war => war.attackerCountryId)).toEqual(['country.a', 'country.c']);
    expect(corrupted.occupationByRegion).toEqual({});
    if (boundary === 'invariant') expect(() => validateWarState(corrupted, context)).toThrow(/Duplicate active war target Region/);
    else expect(() => restoreSimulationState(serializeSimulationState(corrupted), regions, {}, {}, context)).toThrow(/Duplicate active war target Region/);
    expect(corrupted).toEqual(before);
  });
  it('reuses an ended objective without rewriting either historical war', () => {
    const ended = endWar(declareClaimWar(withCompetingClaim()), 'war.001', 'white_peace', context);
    const historical = structuredClone(ended.wars[0]);
    const next = declareCompetingWar(ended);
    expect(next.regionOwnership['region.target']).toBe('country.b');
    expect(next.wars[0]).toEqual(historical);
    expect(validateWarState(next, context)).toBe(true);
    expect(restoreSimulationState(serializeSimulationState(next), regions, {}, {}, context)).toEqual(next);
    const bothEnded = endWar(next, 'war.competing', 'white_peace', context);
    expect(bothEnded.wars).toHaveLength(2);
    expect(bothEnded.wars.every(war => war.status === 'ended' && war.targetRegionId === 'region.target')).toBe(true);
    expect(bothEnded.wars[0]).toEqual(historical);
    expect(validateWarState(bothEnded, context)).toBe(true);
    expect(restoreSimulationState(serializeSimulationState(bothEnded), regions, {}, {}, context)).toEqual(bothEnded);
  });
  it('allows distinct active objectives and preserves the other war after victory', () => {
    const active = createClaim(declareClaimWar(), { ...competingClaim, regionId: 'region.other' }, context);
    const concurrent = declareLimitedWar(active, { warId: 'war.other', attackerCountryId: 'country.c', defenderCountryId: 'country.b', targetRegionId: 'region.other', casusBelliId: 'claim-derived:claim.competing:country.b' }, context);
    expect(validateWarState(concurrent, context)).toBe(true);
    const occupied = occupyWithControl(concurrent, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' });
    const ended = endWar(occupied, 'war.001', 'attacker_victory', context);
    expect(ended.wars[1]).toEqual(concurrent.wars[1]);
    expect(ended.wars[1].status).toBe('active');
    expect(ended.regionOwnership['region.other']).toBe('country.b');
    expect(validateWarState(ended, context)).toBe(true);
    expect(restoreSimulationState(serializeSimulationState(ended), regions, {}, {}, context)).toEqual(ended);
  });
  it('defensively rejects duplicate Explicit CB targets before snapshotting or consuming the CB', () => {
    const corrupted = createExplicitCasusBelli(initial(), { id: 'cb.defensive', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'territorial_claim', creationDate: '2026-01-01', targetRegionIds: ['region.target'] }, context);
    corrupted.explicitCasusBelli[0].targetRegionIds!.push('region.target');
    const before = structuredClone(corrupted);
    expect(() => declareLimitedWar(corrupted, { warId: 'war.defensive', attackerCountryId: 'country.a', defenderCountryId: 'country.b', targetRegionId: 'region.target', casusBelliId: 'cb.defensive' }, context)).toThrow(/duplicate target Region/);
    expect(corrupted).toEqual(before);
  });
  it('preserves valid multi-Region Explicit CB order and transfers only the declared objective', () => {
    const targets = ['region.other', 'region.target'];
    const authorized = createExplicitCasusBelli(initial(), { id: 'cb.multi', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'territorial_claim', creationDate: '2026-01-01', targetRegionIds: targets }, context);
    expect(validateDiplomacyState(authorized, context)).toBe(true);
    const declared = declareLimitedWar(authorized, { warId: 'war.multi', attackerCountryId: 'country.a', defenderCountryId: 'country.b', targetRegionId: 'region.target', casusBelliId: 'cb.multi' }, context);
    expect(declared.wars[0].declarationCasusBelli.targetRegionIds).toEqual(targets);
    expect(declared.wars[0].declarationCasusBelli.targetRegionIds).not.toBe(authorized.explicitCasusBelli[0].targetRegionIds);
    expect(authorized.explicitCasusBelli[0].status).toBe('active');
    expect(validateWarState(declared, context)).toBe(true);
    const ended = endWar(occupyWithControl(declared, { regionId: 'region.target', warId: 'war.multi', occupierCountryId: 'country.a' }), 'war.multi', 'attacker_victory', context);
    expect(ended.regionOwnership).toEqual({ ...authorized.regionOwnership, 'region.target': 'country.a' });
    expect(ended.wars[0].declarationCasusBelli).toEqual(declared.wars[0].declarationCasusBelli);
    expect(restoreSimulationState(serializeSimulationState(ended), regions, {}, {}, context)).toEqual(ended);
  });
  it('keeps all twelve public Region, Diplomacy and War mutations invariant-closed and immutable', () => {
    let state = initial();
    const apply = (mutation: (current: SimulationState) => SimulationState) => {
      const before = structuredClone(state);
      const next = mutation(state);
      expect(state).toEqual(before);
      expect(validateDiplomacyState(next, context)).toBe(true);
      expect(validateWarState(next, context)).toBe(true);
      expect(restoreSimulationState(serializeSimulationState(next), regions, {}, {}, context)).toEqual(next);
      state = next;
    };
    apply(current => setRelation(current, 'country.a', 'country.b', 20, 'friendly', context));
    apply(current => adjustRelation(current, 'country.b', 'country.a', -50, context));
    apply(current => transferRegion(current, 'region.other', 'country.b', 'country.c'));
    apply(current => createClaim(current, claimInput, context));
    apply(current => createExplicitCasusBelli(current, { id: 'cb.revoke', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'retaliation', creationDate: '2026-01-01' }, context));
    apply(current => revokeCasusBelli(current, 'cb.revoke'));
    apply(current => createExplicitCasusBelli(current, { id: 'cb.expire', issuerCountryId: 'country.c', targetCountryId: 'country.b', type: 'containment', creationDate: '2025-12-01', expiryDate: '2025-12-31' }, context));
    apply(current => expireCasusBelli(current, 'cb.expire'));
    apply(current => declareClaimWar(current));
    const snapshot = structuredClone(state.wars[0].declarationCasusBelli);
    apply(current => renounceClaim(current, claimInput.id));
    apply(current => occupyWithControl(current, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }));
    apply(current => liberateRegion(current, 'region.target', 'country.b', context));
    apply(current => occupyWithControl(current, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }));
    apply(current => endWar(current, 'war.001', 'attacker_victory', context));
    expect(state.wars[0].declarationCasusBelli).toEqual(snapshot);
    apply(current => transferRegion(current, 'region.target', 'country.a', 'country.c'));
  });
  it('rejects active target sovereignty corruption even without occupation, including schema-13 reload', () => {
    const active = declareClaimWar();
    expect(validateWarState(active, context)).toBe(true);
    expect(restoreSimulationState(serializeSimulationState(active), regions, {}, {}, context)).toEqual(active);
    const corrupted = structuredClone(active); corrupted.regionOwnership['region.target'] = 'country.c';
    expect(corrupted.occupationByRegion).toEqual({});
    expect(() => validateWarState(corrupted, context)).toThrow(/target.*sovereignly owned by the defender/);
    expect(() => restoreSimulationState(serializeSimulationState(corrupted), regions, {}, {}, context)).toThrow(/target.*sovereignly owned by the defender/);
  });
  it.each(['attacker_victory', 'defender_victory', 'white_peace'] as const)('protects non-target occupied sovereignty without changing liberation or %s', outcome => {
    const occupied = occupyRegion(declareClaimWar(), { regionId: 'region.other', warId: 'war.001', occupierCountryId: 'country.a' }, context);
    const before = structuredClone(occupied);
    expect(() => transferRegion(occupied, 'region.other', 'country.b', 'country.c')).toThrow(/occupied.*active war/);
    expect(occupied).toEqual(before);
    expect(transferRegion(occupied, 'region.other', 'country.b', 'country.b')).toEqual(occupied);
    const liberated = liberateRegion(occupied, 'region.other', 'country.b', context);
    expect(liberated.occupationByRegion).toEqual({});
    expect(validateWarState(transferRegion(liberated, 'region.other', 'country.b', 'country.c'), context)).toBe(true);
    const ready = outcome === 'attacker_victory'
      ? occupyWithControl(occupied, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }) : occupied;
    const ended = endWar(ready, 'war.001', outcome, context);
    expect(ended.occupationByRegion).toEqual({});
    expect(ended.regionOwnership['region.other']).toBe('country.b');
    expect(ended.regionOwnership['region.target']).toBe(outcome === 'attacker_victory' ? 'country.a' : 'country.b');
    const transferred = transferRegion(ended, 'region.other', 'country.b', 'country.c');
    expect(validateWarState(transferred, context)).toBe(true);
    expect(restoreSimulationState(serializeSimulationState(transferred), regions, {}, {}, context)).toEqual(transferred);
  });
  it('requires explicit resolution for an active objective but permits ordinary transfers elsewhere and after peace', () => {
    const active = declareClaimWar();
    expect(() => transferRegion(active, 'region.target', 'country.b', 'country.c')).toThrow(/active war objective/);
    expect(() => transferRegion(active, 'region.target', 'country.b', 'country.a')).toThrow(/active war objective/);
    expect(transferRegion(active, 'region.other', 'country.b', 'country.c').regionOwnership['region.other']).toBe('country.c');
    const occupied = occupyWithControl(active, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' });
    expect(occupied.regionOwnership['region.target']).toBe('country.b');
    const ended = endWar(occupied, 'war.001', 'attacker_victory', context);
    expect(validateWarState(ended, context)).toBe(true);
    const transferred = transferRegion(ended, 'region.target', 'country.a', 'country.c');
    expect(transferred.regionOwnership['region.target']).toBe('country.c');
    expect(validateWarState(transferred, context)).toBe(true);
  });
  it.each([['region.target', 'region.unknown'], ['region.target', 'region.target']])('rejects extra unknown/duplicate CB snapshot targets: %s', (...targets) => {
    const state = declareClaimWar(); state.wars[0].declarationCasusBelli.targetRegionIds = targets;
    expect(() => validateWarState(state, context)).toThrow();
  });
  it('rejects declarations without a valid CB, wrong targets, self-war and duplicate active pairs', () => {
    expect(() => declareLimitedWar(initial(), { warId: 'war.none', attackerCountryId: 'country.a', defenderCountryId: 'country.b', targetRegionId: 'region.target', casusBelliId: 'missing' }, context)).toThrow(/not currently available/);
    expect(() => declareLimitedWar(withClaim(), { warId: 'war.wrong', attackerCountryId: 'country.a', defenderCountryId: 'country.b', targetRegionId: 'region.other', casusBelliId: 'claim-derived:claim.target:country.b' }, context)).toThrow(/does not authorize/);
    expect(() => declareLimitedWar(withClaim(), { warId: 'war.self', attackerCountryId: 'country.a', defenderCountryId: 'country.a', targetRegionId: 'region.attacker', casusBelliId: 'anything' }, context)).toThrow(/itself/);
    const active = declareClaimWar();
    expect(() => declareLimitedWar(active, { warId: 'war.duplicate', attackerCountryId: 'country.b', defenderCountryId: 'country.a', targetRegionId: 'region.attacker', casusBelliId: 'anything' }, context)).toThrow(/simultaneous active war/);
  });
  it('declares a valid Region war, snapshots a claim-derived CB, and survives claim renunciation', () => {
    const declared = declareClaimWar();
    expect(declared.wars[0]).toMatchObject({ id: 'war.001', status: 'active', targetRegionId: 'region.target', declarationCasusBelli: { source: 'claim', claimId: 'claim.target', reason: 'Reviewed claim' } });
    const renounced = renounceClaim(declared, 'claim.target');
    expect(renounced.wars).toEqual(declared.wars); expect(renounced.wars[0].status).toBe('active'); expect(getAvailableCasusBelli(renounced, 'country.a', 'country.b', context)).toEqual([]);
  });
  it('consumes an explicit territorial CB at declaration', () => {
    const authorized = createExplicitCasusBelli(initial(), { id: 'cb.explicit', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'territorial_claim', creationDate: '2026-01-01', targetRegionIds: ['region.target'], reason: 'Event authorization' }, context);
    const declared = declareLimitedWar(authorized, { warId: 'war.explicit', attackerCountryId: 'country.a', defenderCountryId: 'country.b', targetRegionId: 'region.target', casusBelliId: 'cb.explicit' }, context);
    expect(declared.explicitCasusBelli[0].status).toBe('used'); expect(declared.wars[0].declarationCasusBelli).toMatchObject({ id: 'cb.explicit', source: 'explicit', reason: 'Event authorization' });
  });
  it('keeps occupation separate from sovereignty, population, economy and legacy ownership', () => {
    const declared = declareClaimWar(), occupied = occupyRegion(declared, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }, context);
    expect(getRegionOccupation(occupied, 'region.target')).toMatchObject({ occupierCountryId: 'country.a', warId: 'war.001' }); expect(getWarOccupations(occupied, 'war.001')).toHaveLength(1);
    expect(occupied.regionOwnership).toEqual(declared.regionOwnership); expect(occupied.populationByRegion).toEqual(declared.populationByRegion); expect(occupied.economicOutputByRegion).toEqual(declared.economicOutputByRegion); expect(occupied.territoryOwnership).toEqual(declared.territoryOwnership);
    expect(() => occupyRegion(declared, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.c' }, context)).toThrow(/belligerent/);
    expect(() => occupyRegion(occupied, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }, context)).toThrow(/already occupied/);
    const liberated = liberateRegion(occupied, 'region.target', 'country.b', context); expect(getRegionOccupation(liberated, 'region.target')).toBeUndefined(); expect(declared.occupationByRegion).toEqual({});
  });
  it('requires target occupation for attacker victory and transfers exactly that Region', () => {
    const declared = declareClaimWar(); expect(isWarGoalSatisfied(declared, 'war.001')).toBe(false); expect(() => endWar(declared, 'war.001', 'attacker_victory', context)).toThrow(/objective/);
    const targetOccupied = occupyWithControl(declared, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }); expect(isWarGoalSatisfied(targetOccupied, 'war.001')).toBe(true);
    const bothOccupied = occupyRegion(targetOccupied, { regionId: 'region.other', warId: 'war.001', occupierCountryId: 'country.a' }, context);
    const ended = endWar(bothOccupied, 'war.001', 'attacker_victory', context);
    expect(ended.regionOwnership['region.target']).toBe('country.a'); expect(ended.regionOwnership['region.other']).toBe('country.b'); expect(ended.occupationByRegion).toEqual({});
    expect(ended.wars).toHaveLength(1); expect(ended.wars[0]).toMatchObject({ status: 'ended', outcome: 'attacker_victory', endDate: '2026-01-01' });
    expect(ended.populationByRegion).toEqual(declared.populationByRegion); expect(ended.economicOutputByRegion).toEqual(declared.economicOutputByRegion); expect(ended.territoryOwnership).toEqual({ legacy: 'country.b' });
    expect(controlledBaselinePopulation(ended, 'country.a')).toBe(8_000_000); expect(controlledBaselineAnnualOutput(ended, 'country.a')).toBe(300_000_000_000);
    expect(controlledBaselinePopulation(ended, 'country.b')).toBe(2_000_000); expect(controlledBaselineAnnualOutput(ended, 'country.b')).toBe(80_000_000_000);
    expect(getAvailableCasusBelli(ended, 'country.a', 'country.b', context)).toEqual([]);
    const laterLost = { ...ended, regionOwnership: { ...ended.regionOwnership, 'region.target': 'country.c' } };
    expect(getAvailableCasusBelli(laterLost, 'country.a', 'country.c', context)[0]).toMatchObject({ claimId: 'claim.target', targetCountryId: 'country.c' });
  });
  it('does not let a forged occupation satisfy take_region without genuine control', () => {
    const declared = declareClaimWar();
    const forged = occupyRegion(declared, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }, context);
    expect(getRegionOccupation(forged, 'region.target')).toBeDefined();
    expect(isWarGoalSatisfied(forged, 'war.001')).toBe(false);
    expect(() => endWar(forged, 'war.001', 'attacker_victory', context)).toThrow(/objective/);
    expect(isWarGoalSatisfied(occupyWithControl(declared, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }), 'war.001')).toBe(true);
  });
  it('reconciles operational Region/component control to the new sovereign on attacker victory', () => {
    const declared = declareClaimWar();
    const controlled = occupyWithControl(declared, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' });
    expect(controlled.operations.regionControl['region.target']).toBe('foreign_controlled');
    const ended = endWar(controlled, 'war.001', 'attacker_victory', context);
    expect(ended.operations.regionControl['region.target']).toBe('sovereign_controlled');
    const targetComponents = Object.values(ended.operations.components).filter(component => component.regionId === 'region.target');
    expect(targetComponents.length).toBeGreaterThan(0);
    expect(targetComponents.every(component => component.controllingCountryId === 'country.a' && component.captureProgress === 0 && !component.contested)).toBe(true);
    expect(validateWarState(ended, context)).toBe(true);
  });
  it.each(['defender_victory', 'white_peace'] as const)('%s transfers nothing and clears war occupations', outcome => {
    const declared = declareClaimWar(), occupied = occupyRegion(declared, { regionId: 'region.other', warId: 'war.001', occupierCountryId: 'country.a' }, context), ended = endWar(occupied, 'war.001', outcome, context);
    expect(ended.regionOwnership).toEqual(declared.regionOwnership); expect(ended.occupationByRegion).toEqual({}); expect(ended.wars[0]).toMatchObject({ status: 'ended', outcome });
  });
  it('round-trips v6 wars and occupations without nested aliasing', () => {
    const occupied = occupyRegion(declareClaimWar(), { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }, context);
    expect(validateWarState(occupied, context)).toBe(true);
    const restored = restoreSimulationState(serializeSimulationState(occupied), regions, {}, {}, context); expect(restored).toEqual(occupied);
    restored.wars[0].declarationCasusBelli.targetRegionIds!.push('mutation'); restored.occupationByRegion['region.target'].occupierCountryId = 'country.c';
    expect(occupied.wars[0].declarationCasusBelli.targetRegionIds).toEqual(['region.target']); expect(occupied.occupationByRegion['region.target'].occupierCountryId).toBe('country.a');
  });
  it('rejects malformed wars and stale or invalid occupations', () => {
    const occupied = occupyRegion(declareClaimWar(), { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }, context);
    const malformedWar = structuredClone(occupied); malformedWar.wars[0].endDate = '2025-01-01'; malformedWar.wars[0].outcome = 'attacker_victory';
    expect(() => validateWarState(malformedWar, context)).toThrow(/malformed dates|Active war contains an end state/);
    const duplicate = structuredClone(occupied); duplicate.wars.push(structuredClone(duplicate.wars[0]));
    expect(() => validateWarState(duplicate, context)).toThrow(/Duplicate or missing war ID|Duplicate active war pair/);
    const stale = structuredClone(occupied); stale.wars[0].status = 'ended'; stale.wars[0].endDate = '2026-01-01'; stale.wars[0].outcome = 'white_peace';
    expect(() => validateWarState(stale, context)).toThrow(/ended war/);
    const thirdParty = structuredClone(occupied); thirdParty.occupationByRegion['region.target'].occupierCountryId = 'country.c';
    expect(() => validateWarState(thirdParty, context)).toThrow(/belligerent or sovereignty/);
  });
  it('rejects restored wars and occupations dated after the simulation date', () => {
    const active = declareClaimWar();
    const futureStart = structuredClone(active); futureStart.wars[0].startDate = '2030-01-01';
    expect(() => restoreSimulationState(serializeSimulationState(futureStart), regions, {}, {}, context)).toThrow(/future dates/);

    const ended = endWar(active, 'war.001', 'white_peace', context);
    const futureEnd = structuredClone(ended); futureEnd.wars[0].endDate = '2030-01-01';
    expect(() => restoreSimulationState(serializeSimulationState(futureEnd), regions, {}, {}, context)).toThrow(/future dates/);

    const occupied = occupyRegion(active, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }, context);
    const futureOccupation = structuredClone(occupied); futureOccupation.occupationByRegion['region.target'].startDate = '2030-01-01';
    expect(() => restoreSimulationState(serializeSimulationState(futureOccupation), regions, {}, {}, context)).toThrow(/future Region occupation/);
  });
});
