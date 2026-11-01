import {countryCenter,xyz,type GlobePolygon,type Point} from './globeGeometry';
export interface CountryFocus {center:Point;radius:number}
export function countryFocus(polygons:readonly GlobePolygon[],id:string):CountryFocus|undefined{
  const center=countryCenter(polygons,id);if(!center)return;
  const direction=xyz(center);let radius=Math.PI/180;
  for(const p of polygons)if(p.countryId===id)for(const point of p.rings[0]){
    const v=xyz(point);const angle=Math.acos(Math.max(-1,Math.min(1,direction[0]*v[0]+direction[1]*v[1]+direction[2]*v[2])));
    // Retain the main geographic neighbourhood; distant overseas components must
    // not force a small mainland Country to be framed as the entire Earth.
    if(angle<=Math.PI/3)radius=Math.max(radius,angle);
  }
  return {center,radius};
}
export function focusDistance(radius:number,verticalFovDegrees:number,aspect:number):number{
  const half=verticalFovDegrees*Math.PI/360;
  const limiting=Math.min(half,Math.atan(Math.tan(half)*Math.max(.2,aspect)))*.82;
  return Math.max(1.18,Math.min(5,Math.cos(radius)+Math.sin(radius)/Math.tan(limiting)*1.12));
}
export const easeCamera=(t:number)=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
