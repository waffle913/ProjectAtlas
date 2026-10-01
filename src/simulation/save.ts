import { emptyFiscal } from './fiscal/model';
import { emptyCrisis, initializeCrisisState } from './crisis/model';
import { initializeFiscal, upgradeFiscalStateV1 } from './fiscal/runtime';
import { emptySocioeconomy } from './socioeconomy/model';
import { emptyPolitics } from './politics/model';
import { initializePolitics, rebasePoliticsRegistry } from './politics/initialization';
import { politicalRegistry } from './politics/registry';
import { initializeSocioeconomy } from './socioeconomy/initialization';
import { emptyGovernance } from './governance/model';
import { upgradeGovernanceSchema12 } from './governance/migration';
import { initializePartyLeaders } from './governance/runtime';
import { emptyInformation, INFORMATION_VERSION } from './information/model';
import { initializeInformationState } from './information/runtime';
import type { RegionEntity, SimulationState } from '../types';
import type { DiplomacyContext } from './diplomacy';
import { assertSimulationInvariants, type InvariantContext } from './invariants';
import { cloneSimulationState, createEngineState } from './state';

export interface LegacySimulationStateV1 { schemaVersion?: 1; date: string; paused: boolean; speed: 1 | 2 | 5; territoryOwnership: Record<string, string | undefined> }
type DiplomacyFields = 'bilateralRelations' | 'claims' | 'explicitCasusBelli';
type WarFields = 'wars' | 'occupationByRegion';
type EngineFields = 'engine' | 'socioeconomy' | 'fiscal' | 'crisis' | 'politics' | 'governance' | 'information';
export interface SimulationStateV2 extends Omit<SimulationState, 'schemaVersion' | 'populationByRegion' | 'economicOutputByRegion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 2 }
export interface SimulationStateV3 extends Omit<SimulationState, 'schemaVersion' | 'economicOutputByRegion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 3 }
export interface SimulationStateV4 extends Omit<SimulationState, 'schemaVersion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 4 }
export interface SimulationStateV5 extends Omit<SimulationState, 'schemaVersion' | WarFields | EngineFields> { schemaVersion: 5 }
export interface SimulationStateV6 extends Omit<SimulationState, 'schemaVersion' | EngineFields> { schemaVersion: 6 }

const countryIdsFor = (state: { territoryOwnership: Record<string, string | undefined>; regionOwnership?: Record<string, string | undefined> }, regions: readonly RegionEntity[], context?: DiplomacyContext) =>
  context?.countryIds ?? new Set([
    ...regions.flatMap(region => [region.parentCountryId, region.initialOwnerCountryId]),
    ...Object.values(state.territoryOwnership),
    ...Object.values(state.regionOwnership ?? {}),
  ].filter((id): id is string => Boolean(id)));
const withEngine = (state: Omit<SimulationState, 'schemaVersion' | EngineFields>, regions: readonly RegionEntity[], context?: DiplomacyContext): SimulationState => {
  const countryIds = countryIdsFor(state, regions, context);
  const initialized = initializeFiscal(initializeSocioeconomy(initializeInformationState({ ...state, schemaVersion: 13, information: emptyInformation(state.date), governance: emptyGovernance(state.date), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), engine: createEngineState(countryIds) }), regions));
  const crisis = { ...initialized, crisis: initializeCrisisState(initialized.crisis, countryIds, initialized.date) };
  const withPolitics = { ...crisis, politics: initializePolitics(crisis, countryIds, regions), governance: emptyGovernance(crisis.date) };
  return initializePartyLeaders(withPolitics);
};
const validationContext = (regions: RegionEntity[], context: DiplomacyContext): InvariantContext => ({ ...context, regions });

export function migrateSimulationState(save: unknown, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}, baselineEconomicOutput: Record<string, number | undefined> = {}, diplomacyContext?: DiplomacyContext): SimulationState {
  if (!save || typeof save !== 'object') throw new Error('Malformed simulation save.');
  const version = (save as { schemaVersion?: unknown }).schemaVersion;
  if (version === 7 || version === 8 || version === 9 || version === 10 || version === 11 || version === 12 || version === 13) {
    const current = save as SimulationState & { crisis?: SimulationState['crisis']; politics?: SimulationState['politics'] };
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v7-v13 simulation save.');
    if (!current.engine || typeof current.engine.seed !== 'string' || !Number.isSafeInteger(current.engine.tick) || !current.engine.fidelityByCountry || !Array.isArray(current.engine.pendingFidelityTransitions) || !Array.isArray(current.engine.recentFidelityTransitions) || !Array.isArray(current.engine.pendingImmediateUpdates) || !Array.isArray(current.engine.dirtyDomains)) throw new Error('Malformed v7 simulation engine state.');
    if (version >= 8 && (!current.socioeconomy || current.socioeconomy.modelVersion !== 'socioeconomy-0.10-v1')) throw new Error('Malformed or unsupported v8 socioeconomic model.');
    if (version >= 9 && !['fiscal-0.11-v1', 'fiscal-0.11-v2'].includes(current.fiscal?.version)) throw new Error('Malformed fiscal model.');
    if (version === 10 && current.crisis?.version !== 'crisis-0.12-v1') throw new Error('Malformed crisis model.');
    if (version >= 11 && (current.crisis?.version !== 'crisis-0.12-v1' || current.politics?.version !== 'politics-0.13-v1')) throw new Error('Malformed politics or crisis model.');
    if (version >= 12 && current.governance?.version !== 'governance-0.14-v1') throw new Error('Malformed governance model.');
    if (version === 13 && current.information?.version !== INFORMATION_VERSION) throw new Error('Malformed government information model.');
    const fiscal = version >= 9 ? upgradeFiscalStateV1(current.fiscal, current.date) : emptyFiscal();
    const countryIds = countryIdsFor(current, regions, diplomacyContext);
    const crisis = version >= 10 ? current.crisis! : initializeCrisisState(emptyCrisis(), countryIds, current.date);
    const base = { ...current, schemaVersion: 13 as const, information: version === 13 ? current.information! : emptyInformation(current.date), governance: version >= 12 ? current.governance! : emptyGovernance(current.date), politics: version >= 11 ? current.politics! : emptyPolitics(), crisis, fiscal, socioeconomy: version === 7 ? emptySocioeconomy() : current.socioeconomy };
    const upgraded = cloneSimulationState(base);
    const fiscalRestored = version >= 9 ? upgraded : initializeFiscal(version === 7 ? initializeSocioeconomy(upgraded, regions) : upgraded);
    const savedRegistryVersion = version >= 11 ? (current.politics as { registryVersion?: unknown }).registryVersion : undefined;
    const hasNormalizedPolitics = savedRegistryVersion === 'political-registry-0.13-v4';
    // Early 0.13 schema-11 saves embedded mutable static registries. Rebuild their
    // deterministic opinion branch against the current pinned registry instead of
    // carrying stale party references into the runtime.
    const needsPoliticalRebase = savedRegistryVersion === 'political-registry-0.13-v2' || savedRegistryVersion === 'political-registry-0.13-v3';
    const politicsRestored = hasNormalizedPolitics ? fiscalRestored : needsPoliticalRebase ? { ...fiscalRestored, politics: rebasePoliticsRegistry(fiscalRestored) } : { ...fiscalRestored, politics: initializePolitics({ ...fiscalRestored, politics: emptyPolitics() }, countryIds, regions) };
    let restored = version >= 12 ? upgradeGovernanceSchema12(politicsRestored) : politicsRestored;
    if (version < 13) {
      restored = initializeInformationState(restored);
      restored = initializePartyLeaders(restored);
    } else if (current.information!.initializedOn && current.information!.proposalEstimates === undefined) {
      restored = initializeInformationState(restored);
    }
    if (version === 13 && restored.date === politicalRegistry.referenceDate) restored = initializePartyLeaders(restored);
    assertSimulationInvariants(restored, validationContext(regions, diplomacyContext), 'reload');
    return restored;
  }
  if (version !== undefined && ![1, 2, 3, 4, 5, 6].includes(version as number)) throw new Error(`Unsupported simulation save schema version: ${String(version)}`);

  let migrated: SimulationState;
  if (version === 6) {
    const current = save as SimulationStateV6;
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v6 simulation save migration.');
    if (!current.populationByRegion || !current.economicOutputByRegion || !current.bilateralRelations || !Array.isArray(current.claims) || !Array.isArray(current.explicitCasusBelli) || !Array.isArray(current.wars) || !current.occupationByRegion) throw new Error('Malformed v6 simulation state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: Object.fromEntries(Object.entries(current.bilateralRelations).map(([key, relation]) => [key, { ...relation }])), claims: current.claims.map(claim => ({ ...claim })), explicitCasusBelli: current.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })), wars: current.wars.map(war => ({ ...war, declarationCasusBelli: { ...war.declarationCasusBelli, targetRegionIds: war.declarationCasusBelli.targetRegionIds ? [...war.declarationCasusBelli.targetRegionIds] : undefined } })), occupationByRegion: Object.fromEntries(Object.entries(current.occupationByRegion).map(([id, occupation]) => [id, { ...occupation }])) }, regions, diplomacyContext);
  } else if (version === 5) {
    const current = save as SimulationStateV5;
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v5 simulation save migration.');
    if (!current.populationByRegion || !current.economicOutputByRegion || !current.bilateralRelations || !Array.isArray(current.claims) || !Array.isArray(current.explicitCasusBelli)) throw new Error('Malformed v5 simulation state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: Object.fromEntries(Object.entries(current.bilateralRelations).map(([key, relation]) => [key, { ...relation }])), claims: current.claims.map(claim => ({ ...claim })), explicitCasusBelli: current.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })), wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else if (version === 4) {
    const current = save as SimulationStateV4;
    if (!current.populationByRegion || !current.economicOutputByRegion || Object.values(current.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0)) || Object.values(current.economicOutputByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Malformed v4 simulation state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: { ...current.economicOutputByRegion }, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else if (version === 3) {
    const current = save as SimulationStateV3;
    if (!current.populationByRegion || Object.values(current.populationByRegion).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new Error('Malformed v3 simulation population state.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: { ...current.populationByRegion }, economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else if (version === 2) {
    const current = save as SimulationStateV2;
    if (!current.territoryOwnership || !current.regionOwnership || !current.date || ![1, 2, 5].includes(current.speed)) throw new Error('Malformed v2 simulation save.');
    migrated = withEngine({ ...current, territoryOwnership: { ...current.territoryOwnership }, regionOwnership: { ...current.regionOwnership }, populationByRegion: Object.fromEntries(regions.map(region => [region.id, baselinePopulation[region.id]])), economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  } else {
    const legacy = save as LegacySimulationStateV1;
    if (!legacy.territoryOwnership || !legacy.date || ![1, 2, 5].includes(legacy.speed)) throw new Error('Malformed legacy simulation save.');
    const regionOwnership = Object.fromEntries(regions.map(region => [region.id, (region.macroTerritoryId && legacy.territoryOwnership[region.macroTerritoryId]) ?? region.initialOwnerCountryId]));
    migrated = withEngine({ ...legacy, territoryOwnership: { ...legacy.territoryOwnership }, regionOwnership, populationByRegion: Object.fromEntries(regions.map(region => [region.id, baselinePopulation[region.id]])), economicOutputByRegion: Object.fromEntries(regions.map(region => [region.id, baselineEconomicOutput[region.id]])), bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {} }, regions, diplomacyContext);
  }
  if (diplomacyContext) assertSimulationInvariants(migrated, validationContext(regions, diplomacyContext), 'reload');
  return migrated;
}

export function serializeSimulationState(state: SimulationState, context?: InvariantContext) {
  if (context) assertSimulationInvariants(state, context, 'save');
  return JSON.stringify(state);
}
export const restoreSimulationState = (serialized: string, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}, baselineEconomicOutput: Record<string, number | undefined> = {}, diplomacyContext?: DiplomacyContext) => migrateSimulationState(JSON.parse(serialized), regions, baselinePopulation, baselineEconomicOutput, diplomacyContext);
