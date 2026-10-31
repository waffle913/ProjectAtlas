import { useEffect, useMemo, useRef, useState } from 'react';
import type { Territory } from '../../types';
import { globePolygons } from './globeGeometry';
import type { GlobeController } from './globeRenderer';
export function CountryGlobe({ territories, selectedId, onSelect, names }: { territories: readonly Territory[]; selectedId:string; onSelect:(id:string)=>void; names:ReadonlyMap<string,string> }) {
  const host=useRef<HTMLDivElement>(null);const controller=useRef<GlobeController|undefined>(undefined);const select=useRef(onSelect);select.current=onSelect;
  const [status,setStatus]=useState<'loading'|'ready'|'unavailable'>('loading');const [hover,setHover]=useState<string>();
  const polygons=useMemo(()=>globePolygons(territories),[territories]);const selected=useRef(selectedId);selected.current=selectedId;
  useEffect(()=>{let active=true;const target=host.current!;const unavailable=()=>{controller.current?.dispose();controller.current=undefined;setStatus('unavailable');};target.addEventListener('globe-unavailable',unavailable);
    import('./globeRenderer').then(({mountGlobe})=>{if(!active)return;try{controller.current=mountGlobe(target,polygons,id=>select.current(id),setHover);if(selected.current)controller.current.select(selected.current);setStatus('ready');}catch{unavailable();}}).catch(()=>{if(active)unavailable();});
    return()=>{active=false;target.removeEventListener('globe-unavailable',unavailable);controller.current?.dispose();controller.current=undefined;};},[polygons]);
  useEffect(()=>{if(selectedId)controller.current?.select(selectedId);},[selectedId]);
  return <><div className="ng-globe" ref={host} data-globe-status={status}/>{status==='unavailable' && <div className="ng-globe-fallback" role="status"><strong>Globe 3D indisponible</strong><p>WebGL n’est pas disponible. La recherche et la liste de tous les pays permettent de poursuivre au clavier.</p></div>}{status==='loading' && <p className="ng-globe-status" role="status">Préparation du globe 3D…</p>}
    {status==='ready' && <><div className="ng-hover" role="status">{hover?names.get(hover):names.get(selectedId)}</div><div className="ng-globe-controls"><button aria-label="Zoom avant" onClick={()=>controller.current?.zoom(.85)}>＋</button><button aria-label="Zoom arrière" onClick={()=>controller.current?.zoom(1.15)}>−</button><button aria-label="Recentrer sur le pays choisi" onClick={()=>controller.current?.recenter()}>⊙</button></div><p className="ng-globe-help">Glisser pour tourner <span>Molette pour zoomer</span><span>Cliquer pour sélectionner</span></p></>}
  </>;
}
