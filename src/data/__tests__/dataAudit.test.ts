import { emptyFiscal } from '../../simulation/fiscal/model';
import { emptyCrisis } from '../../simulation/crisis/model';
import { emptyPolitics } from '../../simulation/politics/model';
import { emptyGovernance } from '../../simulation/governance/model';
import { emptyInformation } from '../../simulation/information/model';
import { emptySocioeconomy } from '../../simulation/socioeconomy/model';
/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import type { RegionEntity, SimulationState } from '../../types';
import auditJson from '../data-audit-report.json';
import registryJson from '../entity-registry.json';
import regionRegistryJson from '../region-registry.json';
import demographicsJson from '../region-demographics.json';
import economicsJson from '../region-economic-baselines.json';
import { assertSimulationInvariants } from '../../simulation/invariants';
import { createEngineState } from '../../simulation/state';

const registry = registryJson;
const regions = regionRegistryJson.regions as unknown as RegionEntity[];

describe('milestone 0.9 global data audit', () => {
  it('locks permanent Country and Region identity sets', () => {
    expect(auditJson.summary).toMatchObject({ countries: 252, territories: 252, regions: 4_574 });
    expect(auditJson.identityFingerprints).toEqual({
      countryIdsSha256: 'd63eb55201d4bb990808b7974e22a7d006c66df4f203bd563060a89293010729',
      regionIdsSha256: '89cf07b43b40f855da72e3f47bf2819e3488c9ea5ba4fdd328305a983ff2eb9a',
    });
  });

  it('uses explicit normalized availability without turning unknown data into zero', () => {
    const statuses = new Set(['available', 'unavailable', 'partial', 'not_applicable']);
    for (const country of auditJson.countries) {
      expect(statuses.has(country.territorialRepresentation.status)).toBe(true);
      expect(statuses.has(country.population.status)).toBe(true);
      expect(statuses.has(country.nominalEconomicOutput.status)).toBe(true);
      expect(statuses.has(country.nationalFacts.status)).toBe(true);
      expect(statuses.has(country.politicalOffices.status)).toBe(true);
    }
    for (const record of demographicsJson.records) if (record.status === 'unavailable') expect(record).not.toHaveProperty('baselinePopulation');
    for (const record of economicsJson.records) if (record.status === 'unavailable') expect(record).not.toHaveProperty('baselineAnnualOutputUsd');
  });

  it('retains provenance and actual reference dates in audited datasets', () => {
    expect(auditJson.datasets.length).toBeGreaterThan(10);
    for (const dataset of auditJson.datasets) {
      expect(dataset).toMatchObject({ datasetId: expect.any(String), name: expect.any(String), url: expect.stringMatching(/^https?:\/\//), retrievedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
      expect(dataset.uses.length).toBeGreaterThan(0);
    }
    expect(auditJson.datasets.some(dataset => dataset.datasetId === regionRegistryJson.sourceSnapshot.snapshotId)).toBe(true);
    expect(auditJson.countries.some(country => Object.values(country.nationalFacts.fields).some(fact => fact.status === 'available' && fact.referenceDate !== '2026-01-01'))).toBe(true);
  });

  it('reproduces the committed machine and human reports byte-for-byte', () => {
    const result = spawnSync(process.execPath, ['scripts/audit-data.mjs'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Audited 252 Countries and 4574 Regions with no blocking anomalies.');
  }, 30_000);

  it('loads the complete initial scenario as schema 8 without invariant violations', () => {
    const populationByRegion = Object.fromEntries(demographicsJson.records.map(record => [record.regionId, record.status === 'unavailable' ? undefined : record.baselinePopulation]));
    const economicOutputByRegion = Object.fromEntries(economicsJson.records.map(record => [record.regionId, record.status === 'unavailable' ? undefined : record.baselineAnnualOutputUsd]));
    const state: SimulationState = {
      schemaVersion: 13, governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(), date: '2026-01-01', paused: true, speed: 1,
      territoryOwnership: Object.fromEntries(registry.territories.map(territory => [territory.id, territory.initialOwnerCountryId])),
      regionOwnership: Object.fromEntries(regions.map(region => [region.id, region.initialOwnerCountryId])),
      populationByRegion, economicOutputByRegion, bilateralRelations: {}, claims: [], explicitCasusBelli: [], wars: [], occupationByRegion: {},
      engine: createEngineState(registry.countries.map(country => country.id)),
    };
    const context = { countryIds: new Set(registry.countries.map(country => country.id)), regionIds: new Set(regions.map(region => region.id)), regions };
    expect(assertSimulationInvariants(state, context, 'reload')).toBe(true);
  });
});
