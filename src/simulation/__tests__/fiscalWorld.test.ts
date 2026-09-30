import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { socioeconomicWorld, worldContext } from './worldScenario';
import { initializeFiscal } from '../fiscal/runtime';
import { assertSimulationInvariants } from '../invariants';
import legalCoverage from '../../data/fiscal-coverage-report.json';
it('audits actual fiscal initialization for every Country separately from legal coverage', () => {
  const before = socioeconomicWorld(), state = initializeFiscal(before);
  expect(state.socioeconomy).toBe(before.socioeconomy);
  expect(assertSimulationInvariants(state, worldContext, 'reload')).toBe(true);
  const report = { modelVersion: state.fiscal.version, date: state.date, legalExtractSha256: legalCoverage.extractSha256,
    countries: Object.entries(state.fiscal.countries).map(([countryId, c]) => ({ countryId,
      economicCoverage: c.initialization.economicCoverage,
      legal: Object.fromEntries(Object.entries(c.policy).map(([k, rule]) => [k, rule?.status ?? 'unavailable'])),
      simulation: { knownTaxRevenue: 'simulated-from-available-legal-rules', otherRevenue: c.revenueCalibration.status, totalRevenue: 'mixed-explicit-components', revenueCalibrationDataset: c.revenueCalibration.dataset, debt: c.debtInitialization.status, debtInitializationDataset: c.debtInitialization.dataset, spending: c.initialization.economicCoverage === 'unavailable' ? 'unavailable-economic-base' : 'modelled', interest: 'modelled', collectionEfficiency: 'modelled',
        health: c.initialization.economicCoverage === 'unavailable' ? 'unavailable-economic-base' : 'modelled', education: c.initialization.economicCoverage === 'unavailable' ? 'unavailable-economic-base' : 'modelled', socialProtection: c.initialization.economicCoverage === 'unavailable' ? 'unavailable-economic-base' : 'modelled', infrastructure: c.initialization.economicCoverage === 'unavailable' ? 'unavailable-economic-base' : 'modelled' },
    })) };
  const path = 'src/data/fiscal-initialization-report.json';
  if (process.env.WRITE_FISCAL_REPORT === '1') writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(report);
  const coverage = { countries: report.countries.length, activeRegions: Object.keys(state.fiscal.regions).length,
    economicCoverage: Object.fromEntries(['complete', 'partial', 'unavailable'].map(k => [k, report.countries.filter(c => c.economicCoverage === k).length])) };
  console.info(`FISCAL_INITIALIZATION_COVERAGE ${JSON.stringify(coverage)}`);
});
