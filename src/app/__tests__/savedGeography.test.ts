import { beforeAll,describe,it,expect,vi,afterEach } from 'vitest';
import fs from 'node:fs/promises';
import { loadFixtures,canada,usa,maine } from '../../../tests/load-game/fixture';
import { worldContext,worldRegions } from '../../simulation/__tests__/worldScenario';
import { serializeSimulationState,restoreSimulationState } from '../../simulation/save';
import { savedRegionStyle,sovereignBorderSegments,savedGeography } from '../savedGeography';
import { campaignPresentation } from '../loadCampaign';
import { type LoadedRegionData } from '../../data/regionData';
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
 it('does not expose military state to opposition or turn stale reports into current occupation',()=>{
  expect(snapshots.opposition).toBeDefined();
  expect(savedRegionStyle(snapshots.opposition!,maine.id)).toEqual({countryId:usa});
  expect(campaignPresentation(snapshots.opposition!).economicReports).toEqual([]);
  expect(savedRegionStyle({...snapshots.occupied,date:'2031-06-19'},maine.id)).toEqual({countryId:usa});
  const noOccupation={...snapshots.occupied,occupationByRegion:{}};
  expect(savedRegionStyle(noOccupation,maine.id)).toEqual({countryId:usa});
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
 it('writes invariant-validated synthetic fixtures for the runner browser, restores exact saved snapshots',async()=>{
  const entries=[];
  for(const [id,state] of Object.entries({occupied:snapshots.occupied,ceded:snapshots.ceded,opposition:snapshots.opposition!})){
   const raw=serializeSimulationState(state,worldContext);
   const restored=restoreSimulationState(raw,worldRegions,{}, {},worldContext);
   expect(restored.date).toBe(state.date);expect(restored.engine.tick).toBe(state.engine.tick);
   expect(restored.regionOwnership).toEqual(state.regionOwnership);expect(restored.occupationByRegion).toEqual(state.occupationByRegion);
   entries.push({id:'synthetic.'+id,raw,metadata:{name:'TEST SYNTHÉTIQUE — Canada 2031 · '+id,countryId:canada,countryName:'Canada',controlledPersonName:state.governance.persons[state.governance.player.controlledPersonId!].displayName,office:null,simulationDate:state.date,createdAt:'2026-10-31T00:00:00Z',modifiedAt:'2026-10-31T00:00:00Z',schemaVersion:state.schemaVersion}});
  }
  if(process.env.CI){await fs.mkdir('artifacts/load-game',{recursive:true});await fs.writeFile('artifacts/load-game/fixtures.json',JSON.stringify(entries));}
 });
});
