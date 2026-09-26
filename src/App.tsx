import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, useMap } from "react-leaflet";
import type L from "leaflet";
import type { Country, SimulationState, Territory } from "./types";
import { buildWorld } from "./data/geography";
import { Clock } from "./components/Clock";
import { CountryPanel } from "./components/CountryPanel";
import { SimulationClock } from "./simulation/clock";
import "leaflet/dist/leaflet.css";
import "./styles.css";
const initialState: SimulationState = {
  date: "2026-01-01",
  paused: true,
  speed: 1,
  territoryOwnership: {},
};
function FitWorld() {
  const map = useMap();
  useEffect(() => {
    map.fitWorld({ padding: [10, 10] });
  }, [map]);
  return null;
}
const colours: Record<string, string> = {
  sovereign: "#69869b",
  dependency: "#8d98a4",
  disputed: "#b68569",
  other: "#727b83",
};
export default function App() {
  const [world, setWorld] = useState<{
    countries: Map<string, Country>;
    territories: Territory[];
  }>();
  const [physical, setPhysical] = useState<{
    land?: GeoJSON.FeatureCollection;
    lakes?: GeoJSON.FeatureCollection;
    rivers?: GeoJSON.FeatureCollection;
  }>({});
  const [selected, setSelected] = useState<string>();
  const [sim, setSim] = useState(initialState);
  const [loadError, setLoadError] = useState<string>();
  const clock = useRef(new SimulationClock(initialState));
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/data/natural-earth-admin-0.geojson"),
      fetch("/data/natural-earth-land.geojson"),
      fetch("/data/natural-earth-lakes.geojson"),
      fetch("/data/natural-earth-rivers.geojson"),
    ])
      .then(async (responses) => {
        if (responses.some((response) => !response.ok))
          throw new Error(
            "One or more local geographic assets are unavailable.",
          );
        return Promise.all(responses.map((response) => response.json()));
      })
      .then(([admin0, land, lakes, rivers]) => {
        if (!active) return;
        const nextWorld = buildWorld(admin0);
        const ownership = Object.fromEntries(
          nextWorld.territories.map((territory) => [
            territory.id,
            territory.ownerCountryId,
          ]),
        );
        clock.current.setTerritoryOwnership(ownership);
        setSim(clock.current.snapshot());
        setWorld(nextWorld);
        setPhysical({ land, lakes, rivers });
      })
      .catch(
        (error) =>
          active &&
          setLoadError(
            error instanceof Error
              ? error.message
              : "Local geography could not be loaded.",
          ),
      );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      setSim(clock.current.advance(now - previous));
      previous = now;
    }, 250);
    return () => window.clearInterval(timer);
  }, []);
  const selectedCountry = selected ? world?.countries.get(selected) : undefined;
  const collection = useMemo(
    () =>
      world &&
      ({
        type: "FeatureCollection",
        features: world.territories.map((t) => ({
          type: "Feature",
          properties: {
            territoryId: t.id,
            owner: sim.territoryOwnership[t.id] ?? t.ownerCountryId,
            kind: t.kind,
          },
          geometry: t.geometry,
        })),
      } as GeoJSON.FeatureCollection),
    [world, sim.territoryOwnership],
  );
  const changeClock = (next: SimulationState) => {
    clock.current.setPaused(next.paused);
    clock.current.setSpeed(next.speed);
    setSim(clock.current.snapshot());
  };
  if (loadError)
    return (
      <main className="load-state">
        <h1>Map data unavailable</h1>
        <p>{loadError}</p>
        <button onClick={() => window.location.reload()}>
          Retry loading local data
        </button>
      </main>
    );
  if (!world)
    return (
      <main className="load-state">
        <p>Loading local geographic assets…</p>
      </main>
    );
  return (
    <main>
      <header>
        <div>
          <span className="brand-mark">◈</span>
          <span className="brand">
            PROJECT<span>ATLAS</span>
          </span>
          <small>MILESTONE 0.2 · COUNTRY REGISTRY</small>
        </div>
        <Clock state={sim} onChange={changeClock} />
      </header>
      <div className="workspace">
        <section className="map">
          <MapContainer
            center={[20, 0]}
            zoom={2}
            minZoom={2}
            maxZoom={7}
            zoomControl={false}
            worldCopyJump
          >
            <FitWorld />
            {physical.land && (
              <GeoJSON
                data={physical.land}
                interactive={false}
                style={{
                  color: "#4e695f",
                  weight: 0.7,
                  fillColor: "#607867",
                  fillOpacity: 1,
                }}
              />
            )}
            {physical.rivers && (
              <GeoJSON
                data={physical.rivers}
                interactive={false}
                style={{ color: "#82a9b9", weight: 0.75, opacity: 0.85 }}
              />
            )}
            {physical.lakes && (
              <GeoJSON
                data={physical.lakes}
                interactive={false}
                style={{
                  color: "#31596c",
                  weight: 0.4,
                  fillColor: "#31596c",
                  fillOpacity: 1,
                }}
              />
            )}
            {collection && (
              <GeoJSON
                data={collection}
                style={(f) => ({
                  color: "#26333a",
                  weight: 0.55,
                  fillColor:
                    colours[f?.properties?.kind as string] ?? "#69869b",
                  fillOpacity: 0.62,
                })}
                onEachFeature={(feature, layer) => {
                  layer.on({
                    mouseover: () =>
                      (layer as L.Path).setStyle({
                        weight: 1.6,
                        fillOpacity: 0.88,
                      }),
                    mouseout: () =>
                      (layer as L.Path).setStyle({
                        weight: 0.55,
                        fillOpacity: 0.62,
                      }),
                    click: () => setSelected(feature.properties?.owner),
                  });
                }}
              />
            )}
          </MapContainer>
          <div className="map-note">
            Local Natural Earth physical basemap · separate political overlay
          </div>
        </section>
        <CountryPanel country={selectedCountry} />
      </div>
    </main>
  );
}
