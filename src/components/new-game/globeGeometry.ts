import type { Territory } from '../../types';
export type Point = [number, number];
export interface GlobePolygon { countryId: string; rings: Point[][]; area: number }
export function unwrapRing(ring: number[][], anchor?: number): Point[] {
  const result: Point[] = [];
  for (const [lon, lat] of ring) {
    let x = lon; const previous = result.at(-1)?.[0] ?? anchor ?? lon;
    while (x - previous > 180) x -= 360;
    while (x - previous < -180) x += 360;
    result.push([x, lat]);
  }
  if (result.length > 1 && Math.abs(result[0][0] - result.at(-1)![0]) < 1e-8 && result[0][1] === result.at(-1)![1]) result.pop();
  return result;
}
export function ringArea(ring: Point[]): number { return Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0]*q[1] - q[0]*p[1]; },0))/2; }
export function globePolygons(territories: readonly Territory[]): GlobePolygon[] {
  return territories.flatMap(t => {
    const polygons = t.geometry.type === 'Polygon' ? [t.geometry.coordinates] : t.geometry.type === 'MultiPolygon' ? t.geometry.coordinates : [];
    return polygons.map(p => { const outer = unwrapRing(p[0]); return { countryId: t.ownerCountryId, rings: [outer, ...p.slice(1).map(r => unwrapRing(r, outer[0]?.[0]))], area: ringArea(outer) }; });
  });
}
function inRing(lon: number, lat: number, ring: Point[]): boolean {
  if (!ring.length) return false;
  const center = ring.reduce((s,p)=>s+p[0],0)/ring.length;
  const x = lon + Math.round((center - lon)/360)*360;
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i], b=ring[j];
    if ((a[1]>lat)!==(b[1]>lat) && x < (b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
export function countryAt(polygons: readonly GlobePolygon[], lon: number, lat: number): string | undefined {
  // Prefer the smallest matching polygon at shared/overlapping generalized boundaries.
  return polygons.filter(p=>inRing(lon,lat,p.rings[0]) && !p.rings.slice(1).some(r=>inRing(lon,lat,r))).sort((a,b)=>a.area-b.area || a.countryId.localeCompare(b.countryId))[0]?.countryId;
}
export function countryCenter(polygons: readonly GlobePolygon[], countryId: string): Point | undefined {
  const largest = polygons.filter(p=>p.countryId===countryId).sort((a,b)=>b.area-a.area)[0];
  if (!largest?.rings[0].length) return undefined;
  const ring=largest.rings[0];
  // Largest geographic component avoids recentering France between Europe and Guiana.
  return [(Math.min(...ring.map(p=>p[0]))+Math.max(...ring.map(p=>p[0])))/2, (Math.min(...ring.map(p=>p[1]))+Math.max(...ring.map(p=>p[1])))/2];
}
export function xyz([lon,lat]: Point, radius=1): [number,number,number] { const a=lat*Math.PI/180,b=lon*Math.PI/180;return [radius*Math.cos(a)*Math.cos(b),radius*Math.sin(a),-radius*Math.cos(a)*Math.sin(b)]; }
export function lonLat([x,y,z]: [number,number,number]): Point { const r=Math.hypot(x,y,z);return [Math.atan2(-z,x)*180/Math.PI,Math.asin(Math.max(-1,Math.min(1,y/r)))*180/Math.PI]; }
