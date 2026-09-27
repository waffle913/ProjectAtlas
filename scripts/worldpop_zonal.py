import json, math, sys
from pathlib import Path
try:
    import numpy as np
    import rasterio
    from rasterio.features import geometry_mask
    from rasterio.windows import from_bounds
    import shapely
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union
    from shapely.strtree import STRtree
except ImportError as error:
    raise SystemExit('WorldPop rebuild requires Python 3 with rasterio==1.4.3, shapely==2.1.2 and numpy==2.2.6. Install with: python -m pip install rasterio==1.4.3 shapely==2.1.2 numpy==2.2.6') from error

ROOT = Path(__file__).resolve().parents[1]
def read(path): return json.loads((ROOT / path).read_text(encoding='utf-8'))
def valid(geometry):
    value = shape(geometry)
    return shapely.make_valid(value) if not value.is_valid else value
def parts(geometry):
    if geometry.is_empty: return []
    if geometry.geom_type == 'Polygon': return [geometry]
    if geometry.geom_type == 'MultiPolygon': return list(geometry.geoms)
    if geometry.geom_type == 'GeometryCollection': return [part for item in geometry.geoms for part in parts(item)]
    return []

raster_path, output_path = Path(sys.argv[1]), Path(sys.argv[2])
region_registry, mapping_data, admin1 = read('src/data/region-registry.json'), read('src/data/admin1-mapping.json'), read('src/data/source-snapshots/natural-earth-admin1-v5.1.2.geojson')
entity_registry, admin0_mapping, admin0 = read('src/data/entity-registry.json'), read('src/data/natural-earth-mapping.json'), read('public/data/natural-earth-admin-0.geojson')
source_to_region = {item['sourceId']: item for item in mapping_data['features']}
region_geometries = {}
for feature in admin1['features']:
    binding = source_to_region.get(str(feature.get('properties', {}).get(mapping_data['featureIdProperty'], '')))
    if binding and feature.get('geometry'): region_geometries.setdefault(binding['regionId'], []).append(valid(feature['geometry']))
admin0_bindings = {item['sourceId']: item for item in admin0_mapping['features']}
country_geometries, territory_geometries = {}, {}
for feature in admin0['features']:
    binding = admin0_bindings.get(str(feature.get('properties', {}).get(admin0_mapping['featureIdProperty'], '')))
    if binding and feature.get('geometry'):
        geometry = valid(feature['geometry']); country_geometries.setdefault(binding['countryId'], []).append(geometry); territory_geometries[binding['territoryId']] = geometry

with rasterio.open(raster_path) as dataset:
    if dataset.crs is None or dataset.crs.to_epsg() != 4326: raise SystemExit(f'WorldPop raster must use EPSG:4326, received {dataset.crs}.')
    nodata = dataset.nodata
    def sum_geometry(geometry):
        total, cells = 0.0, 0
        for polygon in parts(geometry):
            left, bottom, right, top = polygon.bounds
            window = from_bounds(left, bottom, right, top, dataset.transform).round_offsets().round_lengths()
            try: window = window.intersection(rasterio.windows.Window(0, 0, dataset.width, dataset.height))
            except rasterio.errors.WindowError: continue
            if window.width <= 0 or window.height <= 0: continue
            values = dataset.read(1, window=window, masked=False); transform = dataset.window_transform(window)
            mask = geometry_mask([mapping(polygon)], out_shape=values.shape, transform=transform, invert=True, all_touched=False)
            usable = mask & np.isfinite(values) & (values > 0)
            if nodata is not None: usable &= values != nodata
            total += float(values[usable].sum(dtype=np.float64)); cells += int(usable.sum())
        return total, cells

    audits, weights, preprocessing = [], [], []
    countries = sorted(entity_registry['countries'], key=lambda item: item['id'])
    for index, country in enumerate(countries, 1):
        country_id = country['id']; registered = [region for region in region_registry['regions'] if region['parentCountryId'] == country_id]
        parents = country_geometries.get(country_id, [])
        if not parents:
            preprocessing.append({'countryId': country_id, 'issue': 'missing_parent_country_geometry', 'expectedRegions': len(registered), 'preparedRegions': 0}); continue
        parent = unary_union(parents); prepared = []
        for region in registered:
            source = region_geometries.get(region['id'], [])
            if not source and region['geographyMapping']['status'] == 'fallback_admin0':
                fallback = territory_geometries.get(region['geographyMapping']['territoryId']); source = [fallback] if fallback else []
            if source: prepared.append((region['id'], unary_union(source)))
        if len(prepared) != len(registered):
            preprocessing.append({'countryId': country_id, 'issue': 'incomplete_authoritative_region_geometry', 'expectedRegions': len(registered), 'preparedRegions': len(prepared)}); continue
        parent_population, _ = sum_geometry(parent); region_union = unary_union([geometry for _, geometry in prepared])
        gap_population, gap_cells = sum_geometry(parent.difference(region_union)); outside_population, outside_cells = sum_geometry(region_union.difference(parent))
        overlap_geometry = []
        geometries = [geometry for _, geometry in prepared]; tree = STRtree(geometries)
        for left_index, geometry in enumerate(geometries):
            for right_index in tree.query(geometry, predicate='intersects'):
                right_index = int(right_index)
                if right_index <= left_index: continue
                intersection = geometry.intersection(geometries[right_index])
                if not intersection.is_empty and intersection.area > 1e-12: overlap_geometry.append(intersection)
        overlap_population, overlap_cells = sum_geometry(unary_union(overlap_geometry)) if overlap_geometry else (0.0, 0)
        totals = []
        for region_id, geometry in prepared:
            value, _ = sum_geometry(geometry.intersection(parent)); totals.append((region_id, value))
        zero_regions = sorted(region_id for region_id, value in totals if value <= 0); gap_fraction = gap_population / parent_population if parent_population > 0 else 0
        outside_fraction = outside_population / parent_population if parent_population > 0 else (1 if outside_population > 0 else 0)
        issues = []
        if overlap_cells: issues.append('overlapping_or_double_counted_cells')
        if outside_cells and outside_fraction > 0.05: issues.append('population_outside_parent_country')
        if gap_cells and gap_fraction > 0.05: issues.append('suspicious_population_gap')
        if zero_regions: issues.append('expected_inhabited_region_has_no_raster_population')
        accepted = not issues
        audits.append({'countryId': country_id, 'accepted': accepted, 'issues': issues, 'regionCount': len(prepared), 'countryRasterPopulation': parent_population, 'overlapCells': overlap_cells, 'overlapPopulation': overlap_population, 'gapCells': gap_cells, 'gapPopulation': gap_population, 'gapPopulationFraction': gap_fraction, 'outsideParentCells': outside_cells, 'outsideParentPopulation': outside_population, 'outsideParentPopulationFraction': outside_fraction, 'zeroPopulationRegions': zero_regions})
        if accepted: weights.extend({'countryId': country_id, 'regionId': region_id, 'weight': value} for region_id, value in totals)
        if index % 10 == 0 or index == len(countries): print(f'WorldPop audit {index}/{len(countries)}: {country_id}', file=sys.stderr, flush=True)
    result = {'toolVersions': {'python': sys.version.split()[0], 'rasterio': rasterio.__version__, 'gdal': rasterio.__gdal_version__, 'shapely': shapely.__version__, 'numpy': np.__version__}, 'raster': {'width': dataset.width, 'height': dataset.height, 'crs': str(dataset.crs), 'nodata': nodata, 'transform': list(dataset.transform)[:6]}, 'preprocessingIssues': preprocessing, 'countryAudits': audits, 'weights': sorted(weights, key=lambda item: item['regionId'])}
output_path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
