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
import { transferRegion } from '../region';
import { adjustRelation, countryPairKey, createClaim, createExplicitCasusBelli, expireCasusBelli, getAvailableCasusBelli, getDiplomaticStatus, getRelation, renounceClaim, revokeCasusBelli, setRelation, validateDiplomacyState, type DiplomacyContext } from '../diplomacy';
import { restoreSimulationState, serializeSimulationState } from '../save';
import { createEngineState } from '../state';

const context: DiplomacyContext = { countryIds: new Set(['country.a', 'country.b', 'country.c']), regionIds: new Set(['region.x']) };
const initial = (): SimulationState => ({ schemaVersion: 19, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: true, speed: 1, territoryOwnership: { legacy: 'country.b' }, regionOwnership: { 'region.x': 'country.b' }, populationByRegion: { 'region.x': 5_000_000 }, economicOutputByRegion: { 'region.x': 200_000_000_000 }, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(context.countryIds) });
const claim = { id: 'claim.001', claimantCountryId: 'country.a', regionId: 'region.x', type: 'territorial' as const, creationDate: '2026-01-01', reason: 'Reviewed test claim' };
const region: RegionEntity = { id: 'region.x', parentCountryId: 'country.b', initialOwnerCountryId: 'country.b', commonName: 'X', administrativeLevel: 1, externalIds: {}, geographyMapping: { status: 'mapped', datasetId: 'test', sourceFeatureIds: ['x'] } };

describe('diplomacy foundation', () => {
  it('rejects duplicate Explicit CB target creation without mutating state or input', () => {
    const base = initial(), before = structuredClone(base);
    const cb = { id: 'cb.duplicate', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'territorial_claim' as const, creationDate: '2026-01-01', targetRegionIds: ['region.x', 'region.x'] };
    const inputBefore = structuredClone(cb);
    expect(() => createExplicitCasusBelli(base, cb, context)).toThrow(/duplicate target Region/);
    expect(base).toEqual(before); expect(cb).toEqual(inputBefore);
  });
  it.each(['invariant', 'reload'] as const)('rejects duplicate Explicit CB targets in persisted state at %s', boundary => {
    const corrupted = createExplicitCasusBelli(initial(), { id: 'cb.corrupted', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'territorial_claim', creationDate: '2026-01-01', targetRegionIds: ['region.x'] }, context);
    corrupted.explicitCasusBelli[0].targetRegionIds!.push('region.x');
    const before = structuredClone(corrupted);
    if (boundary === 'invariant') expect(() => validateDiplomacyState(corrupted, context)).toThrow(/duplicate target Region/);
    else expect(() => restoreSimulationState(serializeSimulationState(corrupted), [region], {}, {}, context)).toThrow(/duplicate target Region/);
    expect(corrupted).toEqual(before);
  });
  it('uses order-independent pair keys and neutral defaults', () => {
    expect(countryPairKey('country.a', 'country.b')).toBe(countryPairKey('country.b', 'country.a'));
    expect(getRelation(initial(), 'country.a', 'country.b')).toMatchObject({ score: 0, status: 'neutral' });
    expect(getDiplomaticStatus(initial(), 'country.b', 'country.a')).toBe('neutral');
    expect(() => countryPairKey('country.a', 'country.a')).toThrow(/itself/);
  });
  it('updates relations immutably and bounds scores', () => {
    const base = initial(), friendly = setRelation(base, 'country.b', 'country.a', 75, 'friendly', context), bounded = adjustRelation(friendly, 'country.a', 'country.b', 50, context);
    expect(base.bilateralRelations).toEqual({}); expect(getRelation(friendly, 'country.a', 'country.b')).toMatchObject({ score: 75, status: 'friendly' }); expect(getRelation(bounded, 'country.b', 'country.a').score).toBe(100);
    expect(adjustRelation(setRelation(base, 'country.a', 'country.b', -90, 'hostile', context), 'country.a', 'country.b', -50, context).bilateralRelations[countryPairKey('country.a', 'country.b')].score).toBe(-100);
  });
  it('rejects duplicate active claims and retains renounced history', () => {
    const claimed = createClaim(initial(), claim, context);
    expect(() => createClaim(claimed, { ...claim, id: 'claim.002' }, context)).toThrow(/Duplicate active claim/);
    const renounced = renounceClaim(claimed, claim.id); expect(renounced.claims).toHaveLength(1); expect(renounced.claims[0].status).toBe('renounced'); expect(getAvailableCasusBelli(renounced, 'country.a', 'country.b', context)).toEqual([]);
  });
  it('derives claim CBs from authoritative Region ownership and retargets after transfer', () => {
    const claimed = createClaim(initial(), claim, context);
    expect(getAvailableCasusBelli(claimed, 'country.a', 'country.b', context)[0]).toMatchObject({ targetCountryId: 'country.b', claimId: claim.id, targetRegionIds: ['region.x'] });
    const transferred = transferRegion(claimed, 'region.x', 'country.b', 'country.c');
    expect(getAvailableCasusBelli(transferred, 'country.a', 'country.b', context)).toEqual([]);
    expect(getAvailableCasusBelli(transferred, 'country.a', 'country.c', context)[0]).toMatchObject({ targetCountryId: 'country.c', claimId: claim.id });
    expect(transferred.claims).toEqual(claimed.claims); expect(transferred.populationByRegion['region.x']).toBe(5_000_000); expect(transferred.economicOutputByRegion['region.x']).toBe(200_000_000_000);
    expect(transferred.territoryOwnership.legacy).toBe('country.b');
  });
  it('activates a future-dated claim on its creation date and still retargets afterward', () => {
    const futureClaim = createClaim(initial(), { ...claim, id: 'claim.future', creationDate: '2030-01-05' }, context);
    expect(getAvailableCasusBelli(futureClaim, 'country.a', 'country.b', context)).toEqual([]);
    const activated = { ...futureClaim, date: '2030-01-05' };
    expect(getAvailableCasusBelli(activated, 'country.a', 'country.b', context)).toEqual([expect.objectContaining({ claimId: 'claim.future' })]);
    const transferred = transferRegion(activated, 'region.x', 'country.b', 'country.c');
    expect(getAvailableCasusBelli(transferred, 'country.a', 'country.b', context)).toEqual([]);
    expect(getAvailableCasusBelli(transferred, 'country.a', 'country.c', context)[0]).toMatchObject({ claimId: 'claim.future', targetCountryId: 'country.c' });
  });
  it('never produces a self-CB when the claimant owns the Region', () => {
    const owned = { ...initial(), regionOwnership: { 'region.x': 'country.a' } }, claimed = createClaim(owned, claim, context);
    expect(getAvailableCasusBelli(claimed, 'country.a', 'country.a', context)).toEqual([]);
    expect(getAvailableCasusBelli(claimed, 'country.a', 'country.b', context)).toEqual([]);
  });
  it('combines explicit and derived CBs while excluding revoked and expired records', () => {
    const claimed = createClaim(initial(), claim, context);
    const withRetaliation = createExplicitCasusBelli(claimed, { id: 'cb.001', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'retaliation', creationDate: '2026-01-01', expiryDate: '2026-02-01', reason: 'Event result', originatingEventId: 'event.001' }, context);
    expect(getAvailableCasusBelli(withRetaliation, 'country.a', 'country.b', context).map(cb => cb.source).sort()).toEqual(['claim', 'explicit']);
    expect(getAvailableCasusBelli(revokeCasusBelli(withRetaliation, 'cb.001'), 'country.a', 'country.b', context)).toHaveLength(1);
    expect(getAvailableCasusBelli(expireCasusBelli(withRetaliation, 'cb.001'), 'country.a', 'country.b', context)).toHaveLength(1);
    expect(getAvailableCasusBelli({ ...withRetaliation, explicitCasusBelli: withRetaliation.explicitCasusBelli.map(cb => ({ ...cb, status: 'used' as const })) }, 'country.a', 'country.b', context)).toHaveLength(1);
    expect(getAvailableCasusBelli({ ...withRetaliation, date: '2026-02-02' }, 'country.a', 'country.b', context)).toHaveLength(1);
  });
  it('returns an explicit CB only inside its inclusive creation-to-expiry window', () => {
    const future = createExplicitCasusBelli(initial(), { id: 'cb.future', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'containment', creationDate: '2030-01-05', expiryDate: '2030-01-10' }, context);
    expect(getAvailableCasusBelli(future, 'country.a', 'country.b', context)).toEqual([]);
    expect(getAvailableCasusBelli({ ...future, date: '2030-01-05' }, 'country.a', 'country.b', context).map(cb => cb.id)).toEqual(['cb.future']);
    expect(getAvailableCasusBelli({ ...future, date: '2030-01-10' }, 'country.a', 'country.b', context).map(cb => cb.id)).toEqual(['cb.future']);
    expect(getAvailableCasusBelli({ ...future, date: '2030-01-11' }, 'country.a', 'country.b', context)).toEqual([]);
  });
  it('validates references, duplicates, dates, statuses and score ranges', () => {
    const valid = createExplicitCasusBelli(createClaim(setRelation(initial(), 'country.a', 'country.b', 10, 'neutral', context), claim, context), { id: 'cb.001', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'containment', creationDate: '2026-01-01', targetRegionIds: ['region.x'] }, context);
    expect(validateDiplomacyState(valid, context)).toBe(true);
    const invalid = structuredClone(valid); invalid.bilateralRelations[countryPairKey('country.a', 'country.b')].score = 101; invalid.claims.push({ ...invalid.claims[0], id: 'claim.002' });
    expect(() => validateDiplomacyState(invalid, context)).toThrow(/Malformed bilateral relation.*Duplicate active claim/s);
    expect(() => createExplicitCasusBelli(initial(), { id: 'cb.bad', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'retaliation', creationDate: '2026-02-01', expiryDate: '2026-01-01' }, context)).toThrow(/Malformed/);
  });
  it('round-trips v6 diplomacy without aliasing mutable arrays', () => {
    const state = createExplicitCasusBelli(createClaim(initial(), claim, context), { id: 'cb.001', issuerCountryId: 'country.a', targetCountryId: 'country.b', type: 'retaliation', creationDate: '2026-01-01', targetRegionIds: ['region.x'] }, context);
    const restored = restoreSimulationState(serializeSimulationState(state), [region], {}, {}, context);
    expect(restored).toEqual(state); restored.claims[0].status = 'renounced'; restored.explicitCasusBelli[0].targetRegionIds!.push('mutation'); expect(state.claims[0].status).toBe('active'); expect(state.explicitCasusBelli[0].targetRegionIds).toEqual(['region.x']);
    const invalid = structuredClone(state); invalid.claims[0].claimantCountryId = 'country.unknown';
    expect(() => restoreSimulationState(serializeSimulationState(invalid), [region], {}, {}, context)).toThrow(/unknown entity/);
  });
});
