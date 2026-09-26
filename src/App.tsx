import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Country, SimulationState, Territory } from "./types";
import { buildWorld } from "./data/geography";
import { loadCountryData, type LoadedCountryData } from "./data/countryData";
import { loadRegionData, type LoadedRegionData } from "./data/regionData";
import { Clock } from "./components/Clock";
import { CountryPanel } from "./components/CountryPanel";
import { RegionPanel } from "./components/RegionPanel";
import { SimulationClock } from "./simulation/clock";
import "leaflet/dist/leaflet.css";
import "./styles.css";
const initialState: SimulationState = {
  schemaVersion: 2,
  date: "2026-01-01",
  paused: true,
  speed: 1,
  territoryOwnership: {},
  regionOwnership: {},
};
function FitWorld() {
  const map = useMap();
  useEffect(() => {
    map.fitWorld({ padding: [10, 10] });
  }, [map]);
  return null;
}
function ZoomReporter({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => onZoom(map.getZoom()), [map, onZoom]);
  return null;
}
const palette = ["#6f8791", "#75856e", "#8a7c69", "#7b7890", "#668b83", "#8a7376", "#7d8667", "#6d7f99", "#8b8064", "#728b79"];
const countryColour = (id?: string) => {
  let hash = 2166136261;
  for (const char of id ?? "") hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return palette[(hash >>> 0) % palette.length];
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
    admin1Overview?: GeoJSON.FeatureCollection;
  }>({});
  const [selected, setSelected] = useState<string>();
  const [selectedRegion, setSelectedRegion] = useState<string>();
  const [countryData, setCountryData] = useState<LoadedCountryData>();
  const [regionData, setRegionData] = useState<LoadedRegionData>();
  const [regionGeometry, setRegionGeometry] = useState<GeoJSON.FeatureCollection>();
  const [mapZoom, setMapZoom] = useState(2);
  const [sim, setSim] = useState(initialState);
  const [loadError, setLoadError] = useState<string>();
  const clock = useRef(new SimulationClock(initialState));
  useEffect(() => {
    let active = true;
    Promise.all([
      loadCountryData(),
      fetch("/data/natural-earth-admin-0.geojson"),
      fetch("/data/natural-earth-land.geojson"),
      fetch("/data/natural-earth-lakes.geojson"),
      fetch("/data/natural-earth-rivers.geojson"),
      fetch("/data/admin1/overview.geojson"),
    ])
      .then(async ([data, ...responses]) => {
        if (responses.some((response) => !response.ok))
          throw new Error(
            "One or more local geographic assets are unavailable.",
          );
        const [regions, ...geography] = await Promise.all([
          loadRegionData(data.registry),
          ...responses.map((response) => response.json()),
        ]);
        return [data, regions, ...geography] as const;
      })
      .then(([data, regions, admin0, land, lakes, rivers, admin1Overview]) => {
        if (!active) return;
        const nextWorld = buildWorld(admin0, data.mapping, data.registry);
        const ownership = Object.fromEntries(
          nextWorld.territories.map((territory) => [
            territory.id,
            territory.ownerCountryId,
          ]),
        );
        clock.current.setTerritoryOwnership(ownership);
        clock.current.setRegionOwnership(Object.fromEntries(
          regions.registry.regions.map((region) => [region.id, region.initialOwnerCountryId]),
        ));
        setSim(clock.current.snapshot());
        setWorld(nextWorld);
        setCountryData(data);
        setRegionData(regions);
        setPhysical({ land, lakes, rivers, admin1Overview });
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
    let active = true;
    setSelectedRegion(undefined);
    if (!selected || !regionData || !world) {
      setRegionGeometry(undefined);
      return () => { active = false; };
    }
    const asset = regionData.registry.geometryAssetsByCountry[selected];
    if (asset) {
      fetch(asset)
        .then(response => {
          if (!response.ok) throw new Error(`Local Region geometry is unavailable: ${asset}`);
          return response.json();
        })
        .then(data => { if (active) setRegionGeometry(data); })
        .catch(error => { if (active) setLoadError(error instanceof Error ? error.message : 'Local Region geometry could not be loaded.'); });
    } else {
      const features = (regionData.regionsByCountryId.get(selected) ?? []).flatMap(region => {
        if (region.geographyMapping.status !== 'fallback_admin0' || !region.macroTerritoryId) return [];
        const territory = world.territories.find(item => item.id === region.macroTerritoryId);
        return territory ? [{ type: 'Feature' as const, properties: { regionId: region.id, countryId: selected }, geometry: territory.geometry }] : [];
      });
      setRegionGeometry({ type: 'FeatureCollection', features });
    }
    return () => { active = false; };
  }, [selected, regionData, world]);
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
  const selectedRegionEntity = selectedRegion ? regionData?.regionsById.get(selectedRegion) : undefined;
  const selectedRegionOwnerId = selectedRegion ? sim.regionOwnership[selectedRegion] : undefined;
  const selectedRegionOwner = selectedRegionOwnerId
    ? world?.countries.get(selectedRegionOwnerId) ?? countryData?.registry.countries.find(country => country.id === selectedRegionOwnerId)
    : undefined;
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
  if (!world || !regionData)
    return (
      <main className="load-state">
        <p>Loading local country and Region assets…</p>
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
          <small>MILESTONE 0.3 · GLOBAL ADMIN-1 REGIONS</small>
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
            <ZoomReporter onZoom={setMapZoom} />
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
                  color: "#202c32",
                  weight: 1.05,
                  fillColor: countryColour(f?.properties?.owner),
                  fillOpacity: 0.68,
                })}
                onEachFeature={(feature, layer) => {
                  layer.on({
                    mouseover: () =>
                      (layer as L.Path).setStyle({
                        weight: 1.8,
                        fillOpacity: 0.88,
                      }),
                    mouseout: () =>
                      (layer as L.Path).setStyle({
                        weight: 1.05,
                        fillOpacity: 0.68,
                      }),
                    click: () => {
                      setSelected(feature.properties?.owner);
                      setSelectedRegion(undefined);
                    },
                  });
                }}
              />
            )}
            {physical.admin1Overview && (
              <GeoJSON
                data={physical.admin1Overview}
                interactive={false}
                style={{
                  color: "#37454a",
                  weight: mapZoom >= 4 ? 0.7 : 0.28,
                  opacity: mapZoom >= 4 ? 0.78 : 0.36,
                  fillOpacity: 0,
                }}
              />
            )}
            {regionGeometry && mapZoom >= 4 && (
              <GeoJSON
                key={`${selected}-${selectedRegion ?? "none"}-${mapZoom >= 5 ? "near" : "far"}`}
                data={regionGeometry}
                style={(feature) => {
                  const regionId = feature?.properties?.regionId as string;
                  const owner = sim.regionOwnership[regionId] ?? selected;
                  return {
                    color: selectedRegion === regionId ? "#efc781" : "#46545a",
                    weight: selectedRegion === regionId ? 2 : mapZoom >= 5 ? 0.9 : 0.55,
                    fillColor: countryColour(owner),
                    fillOpacity: selectedRegion === regionId ? 0.82 : 0.56,
                  };
                }}
                onEachFeature={(feature, layer) => {
                  layer.on({
                    click: (event) => {
                      L.DomEvent.stopPropagation(event.originalEvent);
                      setSelectedRegion(feature.properties?.regionId);
                    },
                  });
                }}
              />
            )}
          </MapContainer>
          <div className="map-note">
            Local Natural Earth · select a country, then zoom to inspect Admin-1 Regions
          </div>
        </section>
        {selectedRegionEntity ? (
          <RegionPanel
            region={selectedRegionEntity}
            currentOwner={selectedRegionOwner}
            parentCountry={selectedCountry}
            source={selectedRegionEntity.geographyMapping.status === "mapped" ? {
              name: "Natural Earth 10m Admin-1 States and Provinces",
              url: regionData.registry.sourceSnapshot.sourceUrl,
              datasetId: regionData.registry.sourceSnapshot.snapshotId,
              retrievedAt: regionData.registry.sourceSnapshot.retrievedAt,
            } : selectedRegionEntity.geographyMapping.source}
            onBack={() => setSelectedRegion(undefined)}
          />
        ) : (
          <CountryPanel
            country={selectedCountry}
            factsRecord={selected ? countryData?.factsByCountryId.get(selected) : undefined}
            officeholders={selected ? countryData?.officeholdersByCountryId.get(selected) : undefined}
          />
        )}
      </div>
    </main>
  );
}
