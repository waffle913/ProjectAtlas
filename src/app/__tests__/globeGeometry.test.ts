import { describe,expect,it } from 'vitest';
import { countryAt,countryCenter,globePolygons,lonLat,unwrapRing,xyz } from '../../components/new-game/globeGeometry';
import type { Territory } from '../../types';
const territory=(id:string,coordinates:number[][][]):Territory=>({id,name:id,ownerCountryId:id,geometry:{type:'Polygon',coordinates}} as Territory);
describe('globe geographic identity and picking',()=>{
 it('unwraps antimeridian components without spanning the entire world',()=>{const r=unwrapRing([[179,-10],[-179,-10],[-179,10],[179,10],[179,-10]]);expect(Math.max(...r.map(p=>p[0]))-Math.min(...r.map(p=>p[0]))).toBe(2);const p=globePolygons([territory('fiji',[[[179,-10],[-179,-10],[-179,10],[179,10],[179,-10]]])]);expect(countryAt(p,179.5,0)).toBe('fiji');expect(countryAt(p,-179.5,0)).toBe('fiji');expect(countryAt(p,0,0)).toBeUndefined();});
 it('respects holes and stable identity for disjoint polygons',()=>{const p=globePolygons([territory('c',[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[3,3],[7,3],[7,7],[3,7],[3,3]]]),territory('c',[[[30,0],[31,0],[31,1],[30,1],[30,0]]])]);expect(countryAt(p,2,2)).toBe('c');expect(countryAt(p,5,5)).toBeUndefined();expect(countryAt(p,30.5,.5)).toBe('c');expect(countryCenter(p,'c')).toEqual([5,5]);});
 it('keeps tiny countries selectable and does not mutate source geometry',()=>{const t=territory('small',[[[1,1],[1.001,1],[1.001,1.001],[1,1.001],[1,1]]]);const before=JSON.stringify(t);expect(countryAt(globePolygons([t]),1.0005,1.0005)).toBe('small');expect(JSON.stringify(t)).toBe(before);});
 it.each([[0,0],[179.9,50],[-179.9,-45],[30,89]])('round trips longitude/latitude %s %s',(lon,lat)=>{const p=lonLat(xyz([lon,lat]));expect(p[0]).toBeCloseTo(lon,7);expect(p[1]).toBeCloseTo(lat,7);});
});
