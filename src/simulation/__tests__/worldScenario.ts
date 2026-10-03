import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import type { RegionEntity, SimulationState } from '../../types';
import entityRegistry from '../../data/entity-registry.json';
import regionRegistry from '../../data/region-registry.json';
import demographics from '../../data/region-demographics.json';
import economics from '../../data/region-economic-baselines.json';
import national from '../../data/source-snapshots/wpp2024-population-2026-01-01.json';
import facts from '../../data/country-facts.json';
import offices from '../../data/political-offices.json';
import { createEngineState } from '../state';
import { emptySocioeconomy } from '../socioeconomy/model';
import { initializeSocioeconomy, type InitializationData } from '../socioeconomy/initialization';
import type { PoliticalInitializationData } from '../politics/initialization';
export const worldRegions = regionRegistry.regions as unknown as RegionEntity[];
export const worldCountryIds = entityRegistry.countries.map(c => c.id);
export const worldContext = { regions: worldRegions, countryIds: new Set(worldCountryIds), regionIds: new Set(worldRegions.map(r => r.id)) };
export const worldInputs = { demographics, economics, national, facts: facts.countries } as unknown as InitializationData;
export const worldPoliticalInputs = { countries: entityRegistry.countries, offices } as unknown as PoliticalInitializationData;
export const worldBase = (): SimulationState => ({
  schemaVersion: 15, trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: false, speed: 1,
  territoryOwnership: Object.fromEntries(entityRegistry.territories.map(t => [t.id, t.initialOwnerCountryId])),
  regionOwnership: Object.fromEntries(worldRegions.map(r => [r.id, r.initialOwnerCountryId])),
  populationByRegion: Object.fromEntries(demographics.records.map(r => [r.regionId, r.status === 'unavailable' ? undefined : r.baselinePopulation])),
  economicOutputByRegion: Object.fromEntries(economics.records.map(r => [r.regionId, r.status === 'unavailable' ? undefined : r.baselineAnnualOutputUsd])),
  bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {}, engine: createEngineState(worldCountryIds),
});
export const socioeconomicWorld = () => initializeSocioeconomy(worldBase(), worldRegions, worldInputs);
