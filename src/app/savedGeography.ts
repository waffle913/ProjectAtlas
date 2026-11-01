import type { RegionEntity, SimulationState, Territory } from '../types';
import type { LoadedRegionData } from '../data/regionData';
import { globePolygons, type GlobePolygon } from '../components/new-game/globeGeometry';
import { effectiveForeignController } from '../simulation/operations/runtime';

export type SavedPolygon = GlobePolygon & { regionId?: string; control?: 'occupied'|'contested'; controllerId?: string };
export interface SavedGeography { polygons: SavedPolygon[]; warnings: string[] }

/**
 * Snapshot of actual regional control; dated government reports are NOT the
 * source of truth for the geopolitical save-preview map.
 * Only region-level status is revealed, never hidden units or troop strengths.
 */
export function savedRegionStyle(state: SimulationState, regionId: string) {
  const countryId = state.regionOwnership[regionId];
  const control = state.operations.regionControl[regionId];
  if (control === 'contested') return { countryId, control: 'contested' as const };
  const occupation = state.occupationByRegion[regionId];
  if (control === 'foreign_controlled' && occupation && occupation.startDate <= state.date
    && effectiveForeignController(state,regionId) === occupation.occupierCountryId)
    return { countryId, control: 'occupied' as const, controllerId: occupation.occupierCountryId };
  return { countryId };
}

/** Reject incomplete/malformed local polygons rather than presenting missing land as faithful coverage. */
function polygonGeometryAvailable(geometry: GeoJSON.Geometry): boolean {
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
  return polygons.length>0 && polygons.every(p=>p.length>0 && p.every(r=>r.length>=4
    && r.every(v=>v.length>=2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Math.abs(v[0])<=180 && Math.abs(v[1])<=90)
    && r[0][0]===r[r.length-1][0] && r[0][1]===r[r.length-1][1]));
}

/** Fetch only affected parent Countries plus the played Country, from pinned local assets. */
export async function savedGeography(state: SimulationState, data: LoadedRegionData, territories: readonly Territory[], signal?: AbortSignal): Promise<SavedGeography> {
  const parents=new Set<string>();
  const controlledId=state.governance.player.controlledPersonId;
  const playedCountry=controlledId ? state.governance.persons[controlledId]?.countryId : undefined;
  if(playedCountry)parents.add(playedCountry);
  for(const r of data.registry.regions) if(state.regionOwnership[r.id]!==r.initialOwnerCountryId){
    parents.add(r.parentCountryId);
    const owner=state.regionOwnership[r.id];if(owner)parents.add(owner);
  }
  // Include all regions whose regional control differs from ordinary peacetime,
  // not only the player's objectives covered by an accessible monthly report.
  for(const id of new Set([
    ...Object.keys(state.occupationByRegion),
    ...Object.keys(state.operations.regionControl).filter(id => state.operations.regionControl[id] === 'contested' || state.operations.regionControl[id] === 'foreign_controlled'),
  ])) {
    const region=data.regionsById.get(id);
    if(region) {
      parents.add(region.parentCountryId);
      const owner=state.regionOwnership[id];
      if(owner)parents.add(owner);
    }
  }
  const polygons:SavedPolygon[]=globePolygons(territories.filter(t=>!t.ownerCountryId || !parents.has(t.ownerCountryId)));
  const warnings:string[]=[];
  for(const parent of [...parents].sort()) {
    const regions=data.regionsByCountryId.get(parent)??[];
    const covered=new Set<string>();
    const add=(r:RegionEntity,geometry:GeoJSON.Geometry)=>{
      if(!polygonGeometryAvailable(geometry))return;
      const style=savedRegionStyle(state,r.id);
      if(!style.countryId)return;
      const source:Territory={id:r.id,name:r.commonName,ownerCountryId:style.countryId,geometry,kind:'other',sourceFeatureId:r.id,sourceDatasetId:'existing-region-registry',sourceMetadata:{}};
      const countryId=style.countryId;
      polygons.push(...globePolygons([source]).map(p=>({...p,...style,countryId,regionId:r.id})));covered.add(r.id);
    };
    const asset=data.registry.geometryAssetsByCountry[parent];
    if(asset)try {
      const response=await fetch(asset,{signal});if(!response.ok)throw new Error('asset unavailable');
      const collection=await response.json() as GeoJSON.FeatureCollection;
      const grouped=new Map<string,GeoJSON.Feature[]>();
      for(const feature of collection.features){
        const id=feature.properties?.regionId;const r=data.regionsById.get(id);
        if(r?.parentCountryId!==parent || r.geographyMapping.status!=='mapped')continue;
        const entries=grouped.get(r.id)??[];entries.push(feature);grouped.set(r.id,entries);
      }
      for(const r of regions){
        if(r.geographyMapping.status!=='mapped')continue;
        const entries=grouped.get(r.id)??[];
        const sourceIds=entries.map(f=>String(f.properties?.sourceId??''));
        const expected=r.geographyMapping.sourceFeatureIds;
        if(sourceIds.length!==expected.length || new Set(sourceIds).size!==sourceIds.length
          || expected.some(id=>!sourceIds.includes(id))
          || entries.some(f=>!f.geometry || !polygonGeometryAvailable(f.geometry)))continue;
        for(const feature of entries)add(r,feature.geometry!);
      }
    }catch(error){if(signal?.aborted)throw error;warnings.push(`Géométrie régionale inaccessible : ${parent}. Aucun contour de remplacement inventé.`);}
    for(const r of regions)if(r.geographyMapping.status==='fallback_admin0'){
      const t=territories.find(t=>t.id===(r.geographyMapping.status==='fallback_admin0'?r.geographyMapping.territoryId:''));
      if(t)add(r,t.geometry);
    }
    for(const r of regions)if(!covered.has(r.id))warnings.push(`Géométrie indisponible : ${r.commonName} (${r.id}).`);
  }
  return {polygons,warnings};
}

export { sovereignBorderSegments } from '../components/new-game/globeGeometry';
