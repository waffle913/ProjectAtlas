/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { socioeconomicWorld, worldBase, worldContext, worldInputs, worldRegions, worldCountryIds } from './worldScenario';
import { initializeSocioeconomy } from '../socioeconomy/initialization';
import { socioeconomicCoverage } from '../socioeconomy/coverage';
import { assertSimulationInvariants } from '../invariants';

describe('0.10 full-world initialization and data contract', () => {
  it('preserves accepted data and exact national population totals without mutating audited inputs', () => {
    const before = JSON.stringify(worldInputs), base = worldBase(), state = socioeconomicWorld();
    expect(JSON.stringify(worldInputs)).toBe(before);
    for (const [id, region] of Object.entries(state.socioeconomy.regions)) {
      expect(state.populationByRegion[id]).toBe(region.population);
      expect(state.economicOutputByRegion[id]).toBe(region.annualOutputReference);
    }
    for (const record of worldInputs.demographics.records) if (record.status !== 'unavailable') expect(state.socioeconomy.regions[record.regionId].population).toBe(record.baselinePopulation);
    for (const record of worldInputs.economics.records) if (record.status !== 'unavailable') expect(state.socioeconomy.regions[record.regionId].economy?.baseOutput).toBe(Math.round(record.baselineAnnualOutputUsd / 12));
    for (const record of worldInputs.national.records) {
      const local = worldRegions.filter(r => r.parentCountryId === record.countryId);
      if (!local.length) continue;
      expect(local.reduce((sum, r) => sum + state.socioeconomy.regions[r.id].population!, 0), record.countryId).toBe(record.value);
    }
    for (const record of worldInputs.facts) {
      const local = worldRegions.filter(r => r.parentCountryId === record.countryId);
      const gdp = record.facts.nominalGdpUsd;
      if (!local.length || gdp?.status !== 'available' || typeof gdp.value !== 'number' || local.some(r => state.socioeconomy.regions[r.id].annualOutputReference === undefined)) continue;
      expect(local.reduce((sum, r) => sum + state.socioeconomy.regions[r.id].annualOutputReference!, 0), record.countryId).toBe(Math.round(gdp.value));
    }
    expect(assertSimulationInvariants(state, worldContext, 'reload')).toBe(true);
    expect(initializeSocioeconomy(worldBase(), [...worldRegions].reverse(), worldInputs)).toEqual(state);
  });
  it('keeps truly unknown populations unavailable, with no invented cohort or income', () => {
    const state = socioeconomicWorld();
    const unknown = Object.values(state.socioeconomy.regions).filter(r => r.populationProvenance.status === 'unavailable');
    expect(unknown.length).toBeGreaterThan(0);
    for (const r of unknown) { expect(r.population).toBeUndefined(); expect(r.cohorts).toEqual([]); expect(r.economy).toBeUndefined(); }
    const modelled = Object.values(state.socioeconomy.regions).filter(r => r.populationProvenance.status === 'modelled');
    expect(modelled.length).toBeGreaterThan(2000);
    expect(modelled.every(r => r.populationProvenance.inputs.length && r.populationProvenance.limitation)).toBe(true);
  });
  it('rejects post-scenario observations from initialization', () => {
    const inputs = structuredClone(worldInputs);
    inputs.national.records.forEach(r => { r.referenceDate = '2027-01-01'; });
    inputs.demographics.records.forEach(r => { if (r.status !== 'unavailable') r.baselineDate = '2027-01-01'; });
    inputs.economics.records.forEach(r => { if (r.status !== 'unavailable') r.nationalSourceObservation.referenceDate = '2027'; });
    inputs.facts.forEach(r => { const gdp = r.facts.nominalGdpUsd; if (gdp?.status === 'available') gdp.referenceDate = '2027'; });
    const state = initializeSocioeconomy(worldBase(), worldRegions, inputs);
    expect(Object.values(state.socioeconomy.regions).every(r => r.population === undefined && r.economy === undefined)).toBe(true);
  });
  it('does not treat a same-year annual GDP observation as available on January first', () => {
    const inputs = structuredClone(worldInputs);
    inputs.economics.records.forEach(r => { if (r.status !== 'unavailable') r.nationalSourceObservation.referenceDate = '2026'; });
    inputs.facts.forEach(r => { const gdp = r.facts.nominalGdpUsd; if (gdp?.status === 'available') gdp.referenceDate = '2026'; });
    const state = initializeSocioeconomy(worldBase(), worldRegions, inputs);
    expect(Object.values(state.socioeconomy.regions).every(r => r.annualOutputReference === undefined && r.economy === undefined)).toBe(true);
    expect(Object.values(state.socioeconomy.regions).some(r => r.population !== undefined)).toBe(true);
  });
  it('reproduces the separate 0.10 coverage report per Country', () => {
    const report = socioeconomicCoverage(socioeconomicWorld(), worldRegions, worldCountryIds);
    const text = JSON.stringify(report, null, 2) + '\n';
    const path = 'src/data/socioeconomic-coverage-report.json';
    if (process.env.WRITE_SOCIOECONOMIC_REPORT === '1') writeFileSync(path, text);
    expect(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).toBe(text);
    expect(report.countries).toHaveLength(252);
    console.info(`SOCIOECONOMIC_COVERAGE ${JSON.stringify(report.summary)}`);
  });
});
