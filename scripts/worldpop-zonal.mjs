import { createHash } from 'node:crypto';

export const stableJson = value => `${JSON.stringify(value, null, 2)}\n`;
export const hashJson = value => createHash('sha256').update(stableJson(value)).digest('hex');

const rings = geometry => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
export function geometryBounds(geometry) {
  const values = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of rings(geometry)) for (const ring of polygon) for (const [x, y] of ring) { values[0] = Math.min(values[0], x); values[1] = Math.min(values[1], y); values[2] = Math.max(values[2], x); values[3] = Math.max(values[3], y); }
  if (!Number.isFinite(values[0])) throw new Error(`Unsupported or empty geometry: ${geometry.type}`); return values;
}
const pointInRing = (x, y, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
export function pointInGeometry(x, y, geometry) {
  for (const polygon of rings(geometry)) if (polygon.length && pointInRing(x, y, polygon[0]) && !polygon.slice(1).some(hole => pointInRing(x, y, hole))) return true;
  return false;
}
const contains = (shape, x, y) => x >= shape.bbox[0] && x <= shape.bbox[2] && y >= shape.bbox[1] && y <= shape.bbox[3] && shape.geometries.some(geometry => pointInGeometry(x, y, geometry));
const unionBounds = shapes => shapes.reduce((box, shape) => [Math.min(box[0], shape.bbox[0]), Math.min(box[1], shape.bbox[1]), Math.max(box[2], shape.bbox[2]), Math.max(box[3], shape.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]);
export const explodeGeometry = geometry => geometry.type === 'MultiPolygon' ? geometry.coordinates.map(coordinates => ({ type: 'Polygon', coordinates })) : [geometry];
export function mergeBounds(bounds) {
  const pending = bounds.map(box => [...box]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), result = [];
  while (pending.length) {
    let current = pending.shift(), merged = true;
    while (merged) { merged = false; for (let index = 0; index < pending.length; index += 1) { const next = pending[index]; if (current[0] <= next[2] && current[2] >= next[0] && current[1] <= next[3] && current[3] >= next[1]) { current = [Math.min(current[0], next[0]), Math.min(current[1], next[1]), Math.max(current[2], next[2]), Math.max(current[3], next[3])]; pending.splice(index, 1); merged = true; break; } } }
    result.push(current);
  }
  return result;
}

/** Grid adapter: width, height, originX/Y, resolutionX/Y, noData, readWindow([x0,y0,x1,y1]). */
export async function computeZonalStatistics(grid, countries, { chunkRows = 128, gapPopulationFraction = 0.005, onProgress } = {}) {
  const countryAudits = [], weights = [];
  const orderedCountries = [...countries].sort((a, b) => a.countryId.localeCompare(b.countryId)); let countryIndex = 0;
  for (const country of orderedCountries) {
    const regionTotals = new Map(country.regions.map(region => [region.regionId, 0]));
    const buckets = new Map();
    for (const region of country.regions) for (let bx = Math.floor(region.bbox[0]); bx <= Math.floor(region.bbox[2]); bx += 1) for (let by = Math.floor(region.bbox[1]); by <= Math.floor(region.bbox[3]); by += 1) { const key = `${bx}:${by}`, list = buckets.get(key) ?? []; list.push(region); buckets.set(key, list); }
    const toPixel = (coordinate, origin, resolution) => (coordinate - origin) / resolution - 0.5;
    let overlapCells = 0, overlapPopulation = 0, gapCells = 0, gapPopulation = 0, outsideParentCells = 0, outsideParentPopulation = 0, countryRasterPopulation = 0;
    for (const bbox of country.scanBounds ?? [unionBounds([...country.regions, { bbox: country.bbox }])]) {
      const xs = [toPixel(bbox[0], grid.originX, grid.resolutionX), toPixel(bbox[2], grid.originX, grid.resolutionX)], ys = [toPixel(bbox[1], grid.originY, grid.resolutionY), toPixel(bbox[3], grid.originY, grid.resolutionY)];
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(grid.width, Math.ceil(Math.max(...xs)) + 1), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(grid.height, Math.ceil(Math.max(...ys)) + 1);
      if (x0 >= x1 || y0 >= y1) continue;
      for (let top = y0; top < y1; top += chunkRows) {
        const bottom = Math.min(y1, top + chunkRows); const values = await grid.readWindow([x0, top, x1, bottom]);
        for (let row = top; row < bottom; row += 1) for (let col = x0; col < x1; col += 1) {
        const value = Number(values[(row - top) * (x1 - x0) + (col - x0)]);
        if (!Number.isFinite(value) || value <= 0 || value === grid.noData) continue;
        const x = grid.originX + (col + 0.5) * grid.resolutionX, y = grid.originY + (row + 0.5) * grid.resolutionY;
        const inCountry = country.geometries.some(geometry => pointInGeometry(x, y, geometry));
        const hits = (buckets.get(`${Math.floor(x)}:${Math.floor(y)}`) ?? []).filter(region => contains(region, x, y));
        if (inCountry) countryRasterPopulation += value;
        if (hits.length > 1) { overlapCells += 1; overlapPopulation += value; continue; }
        if (inCountry && !hits.length) { gapCells += 1; gapPopulation += value; continue; }
        if (!inCountry && hits.length) { outsideParentCells += 1; outsideParentPopulation += value; continue; }
        if (inCountry && hits.length === 1) regionTotals.set(hits[0].regionId, regionTotals.get(hits[0].regionId) + value);
        }
      }
    }
    const zeroPopulationRegions = [...regionTotals].filter(([, value]) => value === 0).map(([regionId]) => regionId).sort();
    const gapFraction = countryRasterPopulation ? gapPopulation / countryRasterPopulation : 0;
    const issues = [];
    if (overlapCells) issues.push('overlapping_or_double_counted_cells'); if (outsideParentCells) issues.push('population_outside_parent_country');
    if (gapCells && gapFraction > gapPopulationFraction) issues.push('suspicious_population_gap'); if (zeroPopulationRegions.length) issues.push('expected_inhabited_region_has_no_raster_population');
    const accepted = issues.length === 0;
    countryAudits.push({ countryId: country.countryId, accepted, issues, regionCount: country.regions.length, countryRasterPopulation, overlapCells, overlapPopulation, gapCells, gapPopulation, gapPopulationFraction: gapFraction, outsideParentCells, outsideParentPopulation, zeroPopulationRegions });
    if (accepted) for (const [regionId, weight] of [...regionTotals].sort(([a], [b]) => a.localeCompare(b))) weights.push({ countryId: country.countryId, regionId, weight });
    countryIndex += 1; onProgress?.({ completed: countryIndex, total: orderedCountries.length, countryId: country.countryId, accepted });
  }
  return { countryAudits, weights, acceptedCountries: countryAudits.filter(item => item.accepted).length, rejectedCountries: countryAudits.filter(item => !item.accepted).length };
}

export function validateSpatialWeightsArtifact(artifact, regions, manifest) {
  const errors = [], known = new Map(regions.map(region => [region.id, region])), seen = new Set();
  if (artifact.schemaVersion !== 2 || artifact.raster?.sha256 !== manifest.worldPopSource.sha256 || artifact.raster?.productId !== manifest.worldPopSource.productId || artifact.raster?.retrievedAt !== manifest.worldPopSource.retrievedAt || !artifact.raster?.license) errors.push('Spatial weights do not match the pinned WorldPop source.');
  if (!/^[a-f0-9]{64}$/.test(artifact.audit?.sha256 ?? '') || artifact.audit.status !== 'accepted') errors.push('Spatial weights lack an accepted audit.');
  if (!artifact.processingTools?.engine || !artifact.processingTools?.gdal || !artifact.processingTools?.rasterio || !artifact.authoritativeRegionGeometry) errors.push('Spatial weights lack processing-tool or geometry provenance.');
  const idsByCountry = new Map();
  for (const item of artifact.weights ?? []) {
    const region = known.get(item.regionId); if (!region) errors.push(`Spatial weight references unknown Region: ${item.regionId}`);
    if (seen.has(item.regionId)) errors.push(`Duplicate spatial weight: ${item.regionId}`); seen.add(item.regionId);
    if (region && region.parentCountryId !== item.countryId) errors.push(`Spatial weight is allocated outside parent country: ${item.regionId}`);
    if (!Number.isFinite(item.weight) || item.weight <= 0) errors.push(`Invalid spatial weight: ${item.regionId}`);
    if (!item.source?.datasetId || !item.source?.retrievedAt) errors.push(`Spatial weight lacks provenance: ${item.regionId}`);
    const ids = idsByCountry.get(item.countryId) ?? new Set(); ids.add(item.regionId); idsByCountry.set(item.countryId, ids);
  }
  for (const [countryId, ids] of idsByCountry) {
    const expected = regions.filter(region => region.parentCountryId === countryId).map(region => region.id);
    if (expected.length !== ids.size || expected.some(id => !ids.has(id))) errors.push(`Spatial weights are incomplete for accepted country: ${countryId}`);
  }
  if (artifact.audit?.acceptedCountries !== idsByCountry.size) errors.push('Spatial-weight audit country count disagrees with accepted weights.');
  if (errors.length) throw new Error(errors.join('\n')); return true;
}
