/// <reference types="node" />
import { describe, expect, it } from 'vitest';
// @ts-expect-error Pipeline modules are executable ESM shared with build scripts.
import { parseCsv } from '../../../scripts/csv.mjs';
// @ts-expect-error Pipeline modules are executable ESM shared with build scripts.
import { computeZonalStatistics, validateSpatialWeightsArtifact } from '../../../scripts/worldpop-zonal.mjs';
import { validateNationalPopulationData } from '../populationData';
import weightsJson from '../population-spatial-weights.json';
import manifestJson from '../population-source-manifest.json';
import regionsJson from '../region-registry.json';
import countriesJson from '../entity-registry.json';
import coverageJson from '../population-coverage-report.json';
import auditJson from '../population-spatial-audit.json';
import type { RegionRegistry } from '../regionData';

const rectangle = (x0: number, y0: number, x1: number, y1: number) => ({ type: 'Polygon', coordinates: [[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]] });
describe('population source pipeline', () => {
  it('parses quoted commas, escaped quotes and embedded newlines without shifting columns', async () => {
    const rows = await parseCsv('Location,Notes,Value\r\n"Example, Republic","said ""hello""\nand continued",42\r\n');
    expect(rows).toEqual([['Location','Notes','Value'], ['Example, Republic','said "hello"\nand continued','42']]);
  });
  it('rejects duplicate, unknown, invalid and unsourced national observations', () => {
    const source = { name: 'Source', url: 'https://example.test', datasetId: 'snapshot', retrievedAt: '2026-01-01' };
    const valid = { schemaVersion: 1, sourceSnapshot: 'snapshot', records: [{ countryId: 'country.known', value: 10, referenceDate: '2026-01-01', isEstimate: true, isProjection: true, source }] };
    expect(validateNationalPopulationData(valid, new Set(['country.known']))).toBe(true);
    expect(() => validateNationalPopulationData({ ...valid, records: [...valid.records, valid.records[0]] }, new Set(['country.known']))).toThrow(/Duplicate/);
    expect(() => validateNationalPopulationData({ ...valid, records: [{ ...valid.records[0], countryId: 'country.unknown', value: Number.NaN, referenceDate: 'bad', source: { ...source, datasetId: '' } }] }, new Set(['country.known']))).toThrow(/unknown country|Invalid national|Malformed national|provenance/);
  });
  it('computes deterministic zonal weights and detects overlap, gaps and outside-parent allocation', async () => {
    const values = new Float32Array([1,2,3,4,5,6,7,8]);
    const grid = { width: 4, height: 2, originX: 0, originY: 2, resolutionX: 1, resolutionY: -1, noData: -99999, readWindow: async ([x0,y0,x1,y1]: number[]) => { const out=[]; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) out.push(values[y*4+x]); return Float32Array.from(out); } };
    const country = { countryId: 'country.a', geometries: [rectangle(0,0,4,2)], bbox: [0,0,4,2], regions: [
      { regionId: 'region.a', geometries: [rectangle(0,0,2,2)], bbox: [0,0,2,2] },
      { regionId: 'region.b', geometries: [rectangle(2,0,4,2)], bbox: [2,0,4,2] },
    ] };
    const first = await computeZonalStatistics(grid, [country]); const second = await computeZonalStatistics(grid, [{ ...country, regions: [...country.regions].reverse() }]);
    expect(first).toEqual(second); expect(first.weights.map((item: {weight:number}) => item.weight)).toEqual([14,22]); expect(first.countryAudits[0].accepted).toBe(true);
    const overlap = structuredClone(country); overlap.regions[0].bbox = [0,0,3,2]; overlap.regions[0].geometries = [rectangle(0,0,3,2)];
    expect((await computeZonalStatistics(grid, [overlap])).countryAudits[0].issues).toContain('overlapping_or_double_counted_cells');
    const gap = structuredClone(country); gap.regions[1].bbox = [3,0,4,2]; gap.regions[1].geometries = [rectangle(3,0,4,2)];
    expect((await computeZonalStatistics(grid, [gap])).countryAudits[0].issues).toContain('suspicious_population_gap');
  });
  it('validates the committed real spatial-weight artifact against permanent Regions and the pinned raster', () => {
    expect(validateSpatialWeightsArtifact(weightsJson, (regionsJson as unknown as RegionRegistry).regions, manifestJson)).toBe(true);
    const knownCountries = new Set(countriesJson.countries.map(country => country.id));
    expect((weightsJson.weights as Array<{ countryId: string }>).every(item => knownCountries.has(item.countryId))).toBe(true);
    const broken = structuredClone(weightsJson); broken.weights.pop();
    expect(() => validateSpatialWeightsArtifact(broken, (regionsJson as unknown as RegionRegistry).regions, manifestJson)).toThrow(/incomplete/);
  });
  it('reports the committed accepted spatial audit instead of requiring another rebuild', () => {
    expect(coverageJson.spatialAudit.status).toBe('accepted');
    expect(coverageJson.spatialAudit.status).not.toBe('required_on_rebuild');
    expect(coverageJson.spatialAudit.sha256).toBe(weightsJson.audit.sha256);
    expect(coverageJson.spatialAudit.sha256).toBe(auditJson.sha256);
    expect(coverageJson.spatialAudit).toMatchObject({
      acceptedCountries: auditJson.summary.acceptedCountries,
      rejectedCountries: auditJson.summary.rejectedCountries,
      preprocessingRejectedCountries: auditJson.summary.preprocessingRejectedCountries,
      processingEngine: auditJson.processingTools.engine,
    });
  });
});
