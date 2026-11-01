import { beforeAll,describe,it,expect,vi,afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { loadFixtures,canada,usa,maine } from '../../../tests/load-game/fixture';
import { worldContext,worldRegions } from '../../simulation/__tests__/worldScenario';
import { serializeSimulationState,restoreSimulationState } from '../../simulation/save';
import { savedRegionStyle,sovereignBorderSegments,savedGeography } from '../savedGeography';
import { campaignPresentation } from '../loadCampaign';
import { type LoadedRegionData } from '../../data/regionData';
import regionRegistry from '../../data/region-registry.json';
import type { GlobePolygon } from '../../components/new-game/globeGeometry';
let snapshots:ReturnType<typeof loadFixtures>;
beforeAll(()=>{snapshots=loadFixtures();},60000);
afterEach(()=>vi.unstubAllGlobals());
describe('synthetic saved-world UI projection (not production data)',()=>{
 it('keeps A occupation, B cession, and A again independent without mutating sovereignty',()=>{
  const a=JSON.stringify(snapshots.occupied),b=JSON.stringify(snapshots.ceded);
  expect(savedRegionStyle(snapshots.occupied,maine.id)).toMatchObject({countryId:usa,control:'occupied',controllerId:canada});
  expect(savedRegionStyle(snapshots.ceded,maine.id)).toEqual({countryId:canada});
  expect(savedRegionStyle(snapshots.occupied,maine.id).control).toBe('occupied');
  expect(JSON.stringify(snapshots.occupied)).toBe(a);expect(JSON.stringify(snapshots.ceded)).toBe(b);
 });
 it('keeps a saved occupation visible between reports and without government access',()=>{
  expect(snapshots.opposition).toBeDefined();
  expect(savedRegionStyle(snapshots.opposition!,maine.id)).toEqual({countryId:usa,control:'occupied',controllerId:canada});
  expect(campaignPresentation(snapshots.opposition!).economicReports).toEqual([]);
  expect(campaignPresentation(snapshots.opposition!).population).toBeUndefined();
  expect(campaignPresentation(snapshots.opposition!).monthlyOutput).toBeUndefined();
  expect(savedRegionStyle({...snapshots.occupied,date:'2031-06-19'},maine.id)).toEqual({countryId:usa,control:'occupied',controllerId:canada});
  const noOccupation={...snapshots.occupied,occupationByRegion:{}};
  expect(savedRegionStyle(noOccupation,maine.id)).toEqual({countryId:usa});
 });
 it('keeps unknown aggregates unavailable and excludes future economic and military reports',()=>{
  const s=structuredClone(snapshots.occupied);const view=campaignPresentation(s);
  expect(view.population).toBeGreaterThan(0);expect(view.monthlyOutput).toBeUndefined();
  s.information.operationsReports!.latest[canada].producedOn='2032-01-01';
  expect(campaignPresentation(s).operations).toBeUndefined();
  s.information.latestGovernmentReports={future:{id:'future',countryId:canada,indicator:'unemployment_rate',valueBps:0,asOfDate:'2032-01-01',status:'modelled',coverage:'complete',unit:'basis_points',source:'socioeconomy.monthly',limitation:'Synthetic test'}};
  expect(campaignPresentation(s).economicReports).toEqual([]);
  s.information.latestGovernmentReports.future.asOfDate=s.date;
  expect(campaignPresentation(s).economicReports[0].valueBps).toBe(0);
 });
 it('renders contested separately and never infers a cession from an ended war',()=>{
  const s=structuredClone(snapshots.occupied);s.operations.regionControl[maine.id]='contested';
  s.information.operationsReports!.latest[canada].wars[0].control='contested';
  expect(savedRegionStyle(s,maine.id)).toEqual({countryId:usa,control:'contested'});
  const ended={...snapshots.occupied,wars:snapshots.ceded.wars,occupationByRegion:{}};
  expect(savedRegionStyle(ended,maine.id).countryId).toBe(usa);
 });
 it('removes a shared border only after the two sovereignties actually agree',()=>{
  const square=(countryId:string,x:number):GlobePolygon=>({countryId,area:1,rings:[[[x,0],[x+1,0],[x+1,1],[x,1]]]});
  expect(sovereignBorderSegments([square(canada,0),square(usa,1)])).toHaveLength(7);
  expect(sovereignBorderSegments([square(canada,0),square(canada,1)])).toHaveLength(6);
 });
 it('reports missing regional geometry without recolouring a national polygon',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
  const regions=[maine];const data={registry:{regions,geometryAssetsByCountry:{[usa]:'/missing'}},regionsByCountryId:new Map([[usa,regions]]),regionsById:new Map([[maine.id,maine]])} as unknown as LoadedRegionData;
  const result=await savedGeography(snapshots.ceded,data,[]);
  expect(result.polygons).toEqual([]);expect(result.warnings.join(' ')).toContain('Maine');
 });
 it('uses the actual Maine geometry and removes shared Canada–Maine segments only after cession',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(await fs.readFile('public'+url,'utf8'))));
  const countries=[canada,usa];const regions=worldRegions.filter(r=>countries.includes(r.parentCountryId));
  const data={registry:{regions,geometryAssetsByCountry:regionRegistry.geometryAssetsByCountry},regionsByCountryId:new Map(countries.map(id=>[id,regions.filter(r=>r.parentCountryId===id)])),regionsById:new Map(regions.map(r=>[r.id,r]))} as unknown as LoadedRegionData;
  const a=await savedGeography(snapshots.occupied,data,[]),b=await savedGeography(snapshots.ceded,data,[]);
  expect(a.warnings).toEqual([]);expect(b.warnings).toEqual([]);
  expect(a.polygons.filter(p=>p.regionId===maine.id).every(p=>p.countryId===usa && p.control==='occupied')).toBe(true);
  expect(b.polygons.filter(p=>p.regionId===maine.id).every(p=>p.countryId===canada && !p.control)).toBe(true);
  expect(sovereignBorderSegments(b.polygons).length).toBeLessThan(sovereignBorderSegments(a.polygons).length);
 });
 it('covers a foreign contested Region without a Canadian intelligence report',async()=>{
  const foreign=worldRegions.find(r=>r.parentCountryId!==canada && r.parentCountryId!==usa
    && r.geographyMapping.status==='mapped' && Boolean(regionRegistry.geometryAssetsByCountry[r.parentCountryId]));
  expect(foreign).toBeDefined();
  if(!foreign)return;
  const s=structuredClone(snapshots.occupied);
  s.operations.regionControl[foreign.id]='contested';
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(await fs.readFile('public'+url,'utf8'))));
  const selected=[maine,foreign];
  const data={registry:{regions:selected,geometryAssetsByCountry:regionRegistry.geometryAssetsByCountry},
    regionsByCountryId:new Map([
      [canada,[]], [usa,[maine]], [foreign.parentCountryId,[foreign]],
    ]),regionsById:new Map(selected.map(r=>[r.id,r]))} as unknown as LoadedRegionData;
  const projected=await savedGeography(s,data,[]);
  expect(projected.polygons.some(p=>p.regionId===foreign.id && p.countryId===s.regionOwnership[foreign.id]
    && p.control==='contested')).toBe(true);
 });
 it('writes invariant-validated synthetic fixtures for the runner browser, restores exact saved snapshots',async()=>{
  const entries=[];
  for(const [id,state] of Object.entries({occupied:snapshots.occupied,ceded:snapshots.ceded,opposition:snapshots.opposition!})){
   const raw=serializeSimulationState(state,worldContext);
   const restored=restoreSimulationState(raw,worldRegions,{}, {},worldContext);
   expect(restored.date).toBe(state.date);expect(restored.engine.tick).toBe(state.engine.tick);
   expect(restored.regionOwnership).toEqual(state.regionOwnership);expect(restored.occupationByRegion).toEqual(state.occupationByRegion);
   if(process.env.CI){await fs.mkdir('artifacts/load-game/storage',{recursive:true});await fs.writeFile('artifacts/load-game/storage/synthetic.'+id+'.json',raw);}
   entries.push({id:'synthetic.'+id,metadata:{name:'TEST SYNTHÉTIQUE — Canada 2031 · '+id,countryId:canada,countryName:'Canada',controlledPersonName:state.governance.persons[state.governance.player.controlledPersonId!].displayName,office:null,simulationDate:state.date,createdAt:'2026-10-31T00:00:00Z',modifiedAt:'2026-10-31T00:00:00Z',schemaVersion:state.schemaVersion}});
  }
  if(process.env.CI){await fs.mkdir('artifacts/load-game',{recursive:true});await fs.writeFile('artifacts/load-game/fixtures.json',JSON.stringify(entries));}
 });
});
