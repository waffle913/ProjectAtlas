import { useEffect, useMemo, useState } from 'react';
import { GeoJSON, MapContainer, useMap } from 'react-leaflet';
import type L from 'leaflet';
import type { Country, SimulationState, Territory } from './types';
import { buildWorld } from './data/geography';
import { Clock } from './components/Clock';
import { CountryPanel } from './components/CountryPanel';
import 'leaflet/dist/leaflet.css'; import './styles.css';
const initialState: SimulationState = { date: '2026-01-01', paused: true, speed: 1, territoryOwnership: {} };
function FitWorld(){ const map = useMap(); useEffect(()=>{ map.fitWorld({padding:[10,10]}); },[map]); return null; }
const colours: Record<string,string> = {sovereign:'#69869b', dependency:'#8d98a4', disputed:'#b68569', other:'#727b83'};
export default function App() {
  const [world, setWorld] = useState<{countries: Map<string,Country>; territories: Territory[]}>(); const [physical, setPhysical] = useState<{land?:GeoJSON.FeatureCollection; lakes?:GeoJSON.FeatureCollection; rivers?:GeoJSON.FeatureCollection}>({}); const [selected, setSelected] = useState<string>(); const [sim, setSim] = useState(initialState);
  useEffect(() => { Promise.all([fetch('/data/natural-earth-admin-0.geojson').then(r=>r.json()), fetch('/data/natural-earth-land.geojson').then(r=>r.json()), fetch('/data/natural-earth-lakes.geojson').then(r=>r.json()), fetch('/data/natural-earth-rivers.geojson').then(r=>r.json())]).then(([admin0,land,lakes,rivers]) => { setWorld(buildWorld(admin0)); setPhysical({land,lakes,rivers}); }); }, []);
  const selectedCountry = selected ? world?.countries.get(selected) : undefined;
  const collection = useMemo(() => world && ({type:'FeatureCollection', features: world.territories.map(t=>({type:'Feature', properties:{territoryId:t.id, owner:sim.territoryOwnership[t.id] ?? t.ownerCountryId, kind:t.kind}, geometry:t.geometry}))} as GeoJSON.FeatureCollection), [world,sim.territoryOwnership]);
  return <main><header><div><span className="brand-mark">◈</span><span className="brand">PROJECT<span>ATLAS</span></span><small>MILESTONE 0.1 · WORLD FOUNDATION</small></div><Clock state={sim} onChange={setSim}/></header><div className="workspace"><section className="map"><MapContainer center={[20,0]} zoom={2} minZoom={2} maxZoom={7} zoomControl={false} worldCopyJump><FitWorld/>{physical.land && <GeoJSON data={physical.land} interactive={false} style={{color:'#4e695f',weight:.7,fillColor:'#607867',fillOpacity:1}}/>}{physical.rivers && <GeoJSON data={physical.rivers} interactive={false} style={{color:'#82a9b9',weight:.75,opacity:.85}}/>}{physical.lakes && <GeoJSON data={physical.lakes} interactive={false} style={{color:'#31596c',weight:.4,fillColor:'#31596c',fillOpacity:1}}/>}{collection && <GeoJSON data={collection} style={(f) => ({ color:'#26333a', weight:0.55, fillColor: colours[(f?.properties?.kind as string)] ?? '#69869b', fillOpacity: .62 })} onEachFeature={(feature, layer) => { layer.on({ mouseover: () => (layer as L.Path).setStyle({weight:1.6,fillOpacity:.88}), mouseout: () => (layer as L.Path).setStyle({weight:.55,fillOpacity:.62}), click: () => setSelected(feature.properties?.owner) }); }}/>}</MapContainer><div className="map-note">Local Natural Earth physical basemap · separate political overlay</div></section><CountryPanel country={selectedCountry}/></div></main>;
}
