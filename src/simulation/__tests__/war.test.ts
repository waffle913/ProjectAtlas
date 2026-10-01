import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptySocioeconomy } from '../../simulation/socioeconomy/model';
import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import { createClaim, createExplicitCasusBelli, getAvailableCasusBelli, renounceClaim, type DiplomacyContext } from '../diplomacy';
import { declareLimitedWar, endWar, getRegionOccupation, getWarOccupations, isWarGoalSatisfied, liberateRegion, occupyRegion, validateWarState } from '../war';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { controlledBaselineAnnualOutput, controlledBaselinePopulation } from '../region';
import { createEngineState } from '../state';

const context: DiplomacyContext = { countryIds: new Set(['country.a', 'country.b', 'country.c']), regionIds: new Set(['region.target', 'region.other', 'region.attacker']) };
const regions: RegionEntity[] = [...context.regionIds].map((id): RegionEntity => ({ id, parentCountryId: id === 'region.attacker' ? 'country.a' : 'country.b', initialOwnerCountryId: id === 'region.attacker' ? 'country.a' : 'country.b', commonName: id, administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: [id] } }));
const initial = (): SimulationState => ({ schemaVersion: 13, governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: true, speed: 1, territoryOwnership: { legacy: 'country.b' }, regionOwnership: { 'region.target': 'country.b', 'region.other': 'country.b', 'region.attacker': 'country.a' }, populationByRegion: { 'region.target': 5_000_000, 'region.other': 2_000_000, 'region.attacker': 3_000_000 }, economicOutputByRegion: { 'region.target': 200_000_000_000, 'region.other': 80_000_000_000, 'region.attacker': 100_000_000_000 }, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(context.countryIds) });
const claimInput = { id: 'claim.target', claimantCountryId: 'country.a', regionId: 'region.target', type: 'territorial' as const, creationDate: '2026-01-01', reason: 'Reviewed claim' };
const withClaim = () => createClaim(initial(), claimInput, context);
const declareClaimWar = (state = withClaim(), warId = 'war.001') => declareLimitedWar(state, { warId, attackerCountryId: 'country.a', defenderCountryId: 'country.b', targetRegionId: 'region.target', casusBelliId: 'claim-derived:claim.target:country.b' }, context);

describe('limited bilateral war', () => {
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
    const targetOccupied = occupyRegion(declared, { regionId: 'region.target', warId: 'war.001', occupierCountryId: 'country.a' }, context); expect(isWarGoalSatisfied(targetOccupied, 'war.001')).toBe(true);
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
