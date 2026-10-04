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
import { upgradeInformationState } from './information/migration';
import { emptyMilitary, MILITARY_VERSION } from './military/model';
import { initializeMilitary } from './military/runtime';
import { upgradeMilitaryReportReadiness } from './military/reports';
import { emptyTrade, TRADE_VERSION } from './trade/model';
import { initializeTrade } from './trade/runtime';
import { emptyInternational } from './international/model';
import { initializeInternational } from './international/runtime';
import { emptyOperations } from './operations/model';
import { initializeOperations } from './operations/runtime';
import type { RegionEntity, SimulationState } from '../types';
import type { DiplomacyContext } from './diplomacy';
import { assertSimulationInvariants, type InvariantContext } from './invariants';
import { cloneSimulationState, createEngineState } from './state';

export interface LegacySimulationStateV1 { schemaVersion?: 1; date: string; paused: boolean; speed: 1 | 2 | 5; territoryOwnership: Record<string, string | undefined> }
type DiplomacyFields = 'bilateralRelations' | 'claims' | 'explicitCasusBelli';
type WarFields = 'wars' | 'occupationByRegion';
type EngineFields = 'engine' | 'socioeconomy' | 'fiscal' | 'crisis' | 'politics' | 'governance' | 'information' | 'military' | 'trade';
export interface SimulationStateV2 extends Omit<SimulationState, 'schemaVersion' | 'populationByRegion' | 'economicOutputByRegion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 2 }
export interface SimulationStateV3 extends Omit<SimulationState, 'schemaVersion' | 'economicOutputByRegion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 3 }
export interface SimulationStateV4 extends Omit<SimulationState, 'schemaVersion' | DiplomacyFields | WarFields | EngineFields> { schemaVersion: 4 }
export interface SimulationStateV5 extends Omit<SimulationState, 'schemaVersion' | WarFields | EngineFields> { schemaVersion: 5 }
export interface SimulationStateV6 extends Omit<SimulationState, 'schemaVersion' | EngineFields> { schemaVersion: 6 }

const countryIdsFor = (state: { territoryOwnership: Record<string, string | undefined>; regionOwnership?: Record<string, string | undefined> }, regions: readonly RegionEntity[], context?: DiplomacyContext) => {
  if (context) return context.countryIds;
  const countryIds = new Set(regions.flatMap(region => [region.parentCountryId, region.initialOwnerCountryId]));
  // A registered legacy macro's saved owner is historical evidence, not a new Country invented by migration.
  for (const region of regions) {
    const owner = region.macroTerritoryId ? state.territoryOwnership[region.macroTerritoryId] : undefined;
    if (owner !== undefined) {
      if (typeof owner !== 'string' || !owner.trim()) throw new Error('Malformed legacy Country ownership reference.');
      countryIds.add(owner);
    }
  }
  for (const owner of [...Object.values(state.territoryOwnership), ...Object.values(state.regionOwnership ?? {})]) {
    if (owner !== undefined && !countryIds.has(owner)) {
      if (typeof owner !== 'string' || !politicalRegistry.countries[owner]) throw new Error(`Unexplained legacy Country reference: ${String(owner)}. Supply the permanent registry context.`);
      countryIds.add(owner);
    }
  }
  return countryIds;
};
const withEngine = (state: Omit<SimulationState, 'schemaVersion' | EngineFields | 'international' | 'operations'>, regions: readonly RegionEntity[], context?: DiplomacyContext): SimulationState => {
  const countryIds = countryIdsFor(state, regions, context);
  const initialized = initializeFiscal(initializeSocioeconomy(initializeInformationState({ ...state, schemaVersion: 17, operations: emptyOperations(), international: emptyInternational(), trade: emptyTrade(), military: emptyMilitary(), information: emptyInformation(state.date), governance: emptyGovernance(state.date), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), engine: createEngineState(countryIds) }), regions));
  const crisis = { ...initialized, crisis: initializeCrisisState(initialized.crisis, countryIds, initialized.date) };
  const withPolitics = { ...crisis, politics: initializePolitics(crisis, countryIds, regions), governance: emptyGovernance(crisis.date) };
  return initializeOperations(initializeInternational(initializeTrade(initializeMilitary(initializePartyLeaders(withPolitics)))));
};
const validationContext = (regions: RegionEntity[], context: DiplomacyContext): InvariantContext => ({ ...context, regions });

export function migrateSimulationState(save: unknown, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}, baselineEconomicOutput: Record<string, number | undefined> = {}, diplomacyContext?: DiplomacyContext): SimulationState {
  if (!save || typeof save !== 'object') throw new Error('Malformed simulation save.');
  const version = (save as { schemaVersion?: unknown }).schemaVersion;
  // JSON omits undefined properties. Restore identity keys only, never baseline values or owners.
  const fields = ['regionOwnership', 'populationByRegion', 'economicOutputByRegion'] as const;
  const record = save as Record<string, unknown>;
  save = { ...record, ...Object.fromEntries(fields.flatMap(field => {
    const map = record[field];
    return map && typeof map === 'object' && !Array.isArray(map)
      ? [[field, { ...Object.fromEntries(regions.map(region => [region.id, undefined])), ...map }]] : [];
  })) };
  if (version === 7 || version === 8 || version === 9 || version === 10 || version === 11 || version === 12 || version === 13 || version === 14 || version === 15 || version === 16 || version === 17) {
    const current = save as SimulationState & { crisis?: SimulationState['crisis']; politics?: SimulationState['politics'] };
    if (!diplomacyContext) throw new Error('A Country and Region registry context is required to validate a v7-v15 simulation save.');
    if (!current.engine || typeof current.engine.seed !== 'string' || !Number.isSafeInteger(current.engine.tick) || !current.engine.fidelityByCountry || !Array.isArray(current.engine.pendingFidelityTransitions) || !Array.isArray(current.engine.recentFidelityTransitions) || !Array.isArray(current.engine.pendingImmediateUpdates) || !Array.isArray(current.engine.dirtyDomains)) throw new Error('Malformed v7 simulation engine state.');
    if (version >= 8 && (!current.socioeconomy || current.socioeconomy.modelVersion !== 'socioeconomy-0.10-v1')) throw new Error('Malformed or unsupported v8 socioeconomic model.');
    if (version >= 9 && !['fiscal-0.11-v1', 'fiscal-0.11-v2'].includes(current.fiscal?.version)) throw new Error('Malformed fiscal model.');
    if (version === 10 && current.crisis?.version !== 'crisis-0.12-v1') throw new Error('Malformed crisis model.');
    if (version >= 11 && (current.crisis?.version !== 'crisis-0.12-v1' || current.politics?.version !== 'politics-0.13-v1')) throw new Error('Malformed politics or crisis model.');
    if (version >= 12 && current.governance?.version !== 'governance-0.14-v1') throw new Error('Malformed governance model.');
    if (version >= 13 && ![INFORMATION_VERSION, 'information-0.15-v1', 'information-0.15-v2'].includes(current.information?.version)) throw new Error('Malformed government information model.');
    if (version >= 14 && current.military?.version !== MILITARY_VERSION) throw new Error('Malformed military model.');
    if (version === 15 && current.trade?.version !== TRADE_VERSION) throw new Error('Malformed trade model.');
    if (version === 16 && current.trade?.version !== TRADE_VERSION) throw new Error('Malformed trade model in schema-16 save.');
    if (version === 16 && current.international?.version !== 'international-0.18-v1') throw new Error('Malformed international model.');
    if (version === 17 && current.operations?.version !== 'operations-0.19-v1') throw new Error('Malformed operations model.');
    const fiscal = version >= 9 ? upgradeFiscalStateV1(current.fiscal, current.date) : emptyFiscal();
    const countryIds = countryIdsFor(current, regions, diplomacyContext);
    const crisis = version >= 10 ? current.crisis! : initializeCrisisState(emptyCrisis(), countryIds, current.date);
    const base = { ...current, schemaVersion: 17 as const, operations: version >= 17 ? current.operations! : emptyOperations(), international: version >= 16 ? current.international! : emptyInternational(), trade: version >= 15 ? current.trade : emptyTrade(), military: version >= 14 ? current.military : emptyMilitary(), information: version >= 13 ? current.information! : emptyInformation(current.date), governance: version >= 12 ? current.governance! : emptyGovernance(current.date), politics: version >= 11 ? current.politics! : emptyPolitics(), crisis, fiscal, socioeconomy: version === 7 ? emptySocioeconomy() : current.socioeconomy };
    const upgraded = cloneSimulationState(base);
    const fiscalRestored = version >= 9 ? upgraded : initializeFiscal(version === 7 ? initializeSocioeconomy(upgraded, regions) : upgraded);
    const savedRegistryVersion = version >= 11 ? (current.politics as { registryVersion?: unknown }).registryVersion : undefined;
    if (version >= 13 && savedRegistryVersion !== politicalRegistry.version) throw new Error(`Incompatible political registry in schema-${version} save: ${String(savedRegistryVersion)}. An explicit versioned migration is required.`);
    const hasNormalizedPolitics = savedRegistryVersion === politicalRegistry.version;
    // Early 0.13 schema-11 saves embedded mutable static registries. Rebuild their
    // deterministic opinion branch against the current pinned registry instead of
    // carrying stale party references into the runtime.
    const needsPoliticalRebase = savedRegistryVersion === 'political-registry-0.13-v2' || savedRegistryVersion === 'political-registry-0.13-v3';
    const politicsRestored = hasNormalizedPolitics ? fiscalRestored : needsPoliticalRebase ? { ...fiscalRestored, politics: rebasePoliticsRegistry(fiscalRestored) } : { ...fiscalRestored, politics: initializePolitics({ ...fiscalRestored, politics: emptyPolitics() }, countryIds, regions) };
    let restored = version === 12 ? upgradeGovernanceSchema12(politicsRestored) : politicsRestored;
    if (version < 13) {
      restored = initializeInformationState(restored);
      restored = initializePartyLeaders(restored);
    } else {
      restored = upgradeInformationState(restored);
    }
    if (version < 14) restored = initializeMilitary(restored);
    else restored = upgradeMilitaryReportReadiness(restored);
    if (version < 15) restored = initializeTrade(restored);
    if (version < 16) restored = initializeInternational(restored);
    if (version < 17) restored = initializeOperations(restored);
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
  const finalContext = diplomacyContext ?? { countryIds: countryIdsFor(migrated, regions), regionIds: new Set(regions.map(region => region.id)) };
  assertSimulationInvariants(migrated, validationContext(regions, finalContext), 'reload');
  return migrated;
}

export function serializeSimulationState(state: SimulationState, context?: InvariantContext) {
  if (context) assertSimulationInvariants(state, context, 'save');
  return JSON.stringify(state);
}
export const restoreSimulationState = (serialized: string, regions: RegionEntity[], baselinePopulation: Record<string, number | undefined> = {}, baselineEconomicOutput: Record<string, number | undefined> = {}, diplomacyContext?: DiplomacyContext) => migrateSimulationState(JSON.parse(serialized), regions, baselinePopulation, baselineEconomicOutput, diplomacyContext);
