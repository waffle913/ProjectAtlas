import type { RegionEntity, SimulationState, Territory } from '../types';
import type { LoadedRegionData } from '../data/regionData';
import { globePolygons, type GlobePolygon } from '../components/new-game/globeGeometry';
import { campaignPresentation } from './loadCampaign';
import { effectiveForeignController } from '../simulation/operations/runtime';

export type SavedPolygon = GlobePolygon & { regionId?: string; control?: 'occupied'|'contested'; controllerId?: string };
export interface SavedGeography { polygons: SavedPolygon[]; warnings: string[] }

/** Sovereignty is public; military shading needs current accessible evidence, not omniscience. */
export function savedRegionStyle(state: SimulationState, regionId: string, presentation = campaignPresentation(state)) {
  const countryId = state.regionOwnership[regionId];
  const report = presentation.operations;
  const known = report?.asOfDate === state.date && report.status !== 'unavailable'
    ? report.wars.find(w=>w.targetRegionId===regionId) : undefined;
  if (known?.control === 'contested' && state.operations.regionControl[regionId] === 'contested')
    return { countryId, control: 'contested' as const };
  const occupation = state.occupationByRegion[regionId];
  if (known?.control === 'foreign_controlled' && state.operations.regionControl[regionId] === 'foreign_controlled'
    && occupation && occupation.startDate <= state.date && effectiveForeignController(state,regionId) === occupation.occupierCountryId)
    return { countryId, control:'occupied' as const, controllerId:occupation.occupierCountryId };
  return { countryId };
}

/** Fetch only affected parent Countries plus the played Country, from pinned local assets. */
export async function savedGeography(state: SimulationState, data: LoadedRegionData, territories: readonly Territory[], signal?: AbortSignal): Promise<SavedGeography> {
  const view=campaignPresentation(state);
  const parents=new Set<string>();
  if(view.countryId)parents.add(view.countryId);
  for(const r of data.registry.regions) if(state.regionOwnership[r.id]!==r.initialOwnerCountryId)parents.add(r.parentCountryId);
  // Don't use hidden current military state to decide which geographic assets to request.
  for(const war of view.operations?.wars??[]) { const r=data.regionsById.get(war.targetRegionId);if(r)parents.add(r.parentCountryId); }
  const polygons:SavedPolygon[]=globePolygons(territories.filter(t=>!t.ownerCountryId || !parents.has(t.ownerCountryId)));
  const warnings:string[]=[];
  for(const parent of [...parents].sort()) {
    const regions=data.regionsByCountryId.get(parent)??[];
    const covered=new Set<string>();
    const add=(r:RegionEntity,geometry:GeoJSON.Geometry)=>{
      const style=savedRegionStyle(state,r.id,view);
      if(!style.countryId)return;
      const source:Territory={id:r.id,name:r.commonName,ownerCountryId:style.countryId,geometry,kind:'other',sourceFeatureId:r.id,sourceDatasetId:'existing-region-registry',sourceMetadata:{}};
      const countryId=style.countryId;
      polygons.push(...globePolygons([source]).map(p=>({...p,...style,countryId,regionId:r.id})));covered.add(r.id);
    };
    const asset=data.registry.geometryAssetsByCountry[parent];
    if(asset)try {
      const response=await fetch(asset,{signal});if(!response.ok)throw new Error('asset unavailable');
      const collection=await response.json() as GeoJSON.FeatureCollection;
      for(const feature of collection.features){
        const id=feature.properties?.regionId;const r=data.regionsById.get(id);
        // The shipped asset is already bound to permanent Region IDs; reject cross-parent mappings.
        if(r?.parentCountryId===parent && feature.geometry && r.geographyMapping.status==='mapped')add(r,feature.geometry);
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
