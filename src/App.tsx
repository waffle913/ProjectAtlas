import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Country, SimulationState, Territory } from "./types";
import { buildWorld } from "./data/geography";
import { loadCountryData, type LoadedCountryData } from "./data/countryData";
import { loadRegionData, type LoadedRegionData } from "./data/regionData";
import { loadPopulationData, populationBaselineState, type LoadedPopulationData } from "./data/populationData";
import { controlledEconomicOutput, controlledPopulation } from "./simulation/region";
import { loadEconomicData, economicBaselineState, type LoadedEconomicData } from "./data/economicData";
import { Clock } from "./components/Clock";
import { CountryPanel } from "./components/CountryPanel";
import { RegionPanel } from "./components/RegionPanel";
import { SimulationClock } from "./simulation/clock";
import { getAvailableCasusBelli, validateDiplomacyState, type AvailableCasusBelli } from "./simulation/diplomacy";
import { isWarGoalSatisfied, validateWarState } from "./simulation/war";
import "leaflet/dist/leaflet.css";
import "./styles.css";
const initialState: SimulationState = {
  schemaVersion: 6,
  date: "2026-01-01",
  paused: true,
  speed: 1,
  territoryOwnership: {},
  regionOwnership: {},
  populationByRegion: {},
  economicOutputByRegion: {},
  bilateralRelations: {},
  claims: [],
  explicitCasusBelli: [],
  wars: [],
  occupationByRegion: {},
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
  const [populationData, setPopulationData] = useState<LoadedPopulationData>();
  const [economicData, setEconomicData] = useState<LoadedEconomicData>();
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
        const population = await loadPopulationData(regions.registry.regions, new Set(data.registry.countries.map(country => country.id)));
        const economy = await loadEconomicData(regions.registry.regions);
        return [data, regions, population, economy, ...geography] as const;
      })
      .then(([data, regions, population, economy, admin0, land, lakes, rivers, admin1Overview]) => {
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
        clock.current.setPopulationByRegion(populationBaselineState(population.demographics));
        clock.current.setEconomicOutputByRegion(economicBaselineState(economy.baselines));
        const registryContext = { countryIds: new Set(data.registry.countries.map(country => country.id)), regionIds: new Set(regions.registry.regions.map(region => region.id)) };
        validateDiplomacyState(clock.current.snapshot(), registryContext);
        validateWarState(clock.current.snapshot(), registryContext);
        setSim(clock.current.snapshot());
        setWorld(nextWorld);
        setCountryData(data);
        setRegionData(regions);
        setPopulationData(population);
        setEconomicData(economy);
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
  const regionIdsByMacroTerritory = useMemo(() => {
    const index = new Map<string, string[]>();
    for (const region of regionData?.registry.regions ?? []) {
      if (!region.macroTerritoryId) continue;
      const ids = index.get(region.macroTerritoryId) ?? []; ids.push(region.id); index.set(region.macroTerritoryId, ids);
    }
    return index;
  }, [regionData]);
  const collection = useMemo(
    () =>
      world && regionData &&
      ({
        type: "FeatureCollection",
        features: world.territories.map((t) => ({
          type: "Feature",
          properties: {
            territoryId: t.id,
            navigationCountryId: t.ownerCountryId,
            regionOwners: [...new Set((regionIdsByMacroTerritory.get(t.id) ?? []).map(regionId => sim.regionOwnership[regionId]).filter(Boolean))],
          },
          geometry: t.geometry,
        })),
      } as GeoJSON.FeatureCollection),
    [world, regionData, regionIdsByMacroTerritory, sim.regionOwnership],
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
  if (!world || !regionData || !populationData || !economicData)
    return (
      <main className="load-state">
        <p>Loading local country and Region assets…</p>
      </main>
    );
  const countryName = (countryId: string) => world.countries.get(countryId)?.commonName ?? countryData?.registry.countries.find(country => country.id === countryId)?.commonName ?? countryId;
  const regionName = (regionId: string) => regionData.regionsById.get(regionId)?.commonName ?? regionId;
  const diplomacyContext = { countryIds: new Set(countryData!.registry.countries.map(country => country.id)), regionIds: new Set(regionData.registry.regions.map(region => region.id)) };
  const activeClaimsMade = selected ? sim.claims.filter(claim => claim.status === 'active' && claim.claimantCountryId === selected).map(claim => ({ claim, regionName: regionName(claim.regionId) })) : [];
  const foreignClaims = selected ? sim.claims.filter(claim => claim.status === 'active' && claim.claimantCountryId !== selected && sim.regionOwnership[claim.regionId] === selected).map(claim => ({ claim, claimantName: countryName(claim.claimantCountryId), regionName: regionName(claim.regionId) })) : [];
  const availableCasusBelli: Array<{ cb: AvailableCasusBelli; targetName: string }> = selected ? countryData!.registry.countries.filter(country => country.id !== selected).flatMap(country => getAvailableCasusBelli(sim, selected, country.id, diplomacyContext).map(cb => ({ cb, targetName: country.commonName }))) : [];
  const selectedRegionClaims = selectedRegionEntity ? sim.claims.filter(claim => claim.status === 'active' && claim.regionId === selectedRegionEntity.id).map(claim => ({ claim, claimantName: countryName(claim.claimantCountryId) })) : [];
  const activeWars = selected ? sim.wars.filter(war => war.status === 'active' && (war.attackerCountryId === selected || war.defenderCountryId === selected)).map(war => ({ war, attackerName: countryName(war.attackerCountryId), defenderName: countryName(war.defenderCountryId), targetRegionName: regionName(war.targetRegionId), objectiveSatisfied: isWarGoalSatisfied(sim, war.id) })) : [];
  const selectedOccupation = selectedRegionEntity ? sim.occupationByRegion[selectedRegionEntity.id] : undefined;
  const selectedOccupationWar = selectedOccupation ? sim.wars.find(war => war.id === selectedOccupation.warId) : undefined;
  const selectedObjectiveWars = selectedRegionEntity ? sim.wars.filter(war => war.status === 'active' && war.targetRegionId === selectedRegionEntity.id).map(war => ({ war, attackerName: countryName(war.attackerCountryId), defenderName: countryName(war.defenderCountryId) })) : [];
  return (
    <main>
      <header>
        <div>
          <span className="brand-mark">◈</span>
          <span className="brand">
            PROJECT<span>ATLAS</span>
          </span>
          <small>MILESTONE 0.7 · LIMITED WAR &amp; PEACE</small>
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
                  fillColor: f?.properties?.regionOwners?.length === 1 ? countryColour(f.properties.regionOwners[0]) : f?.properties?.regionOwners?.length > 1 ? "#6f6d68" : countryColour(f?.properties?.navigationCountryId),
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
                      setSelected(feature.properties?.navigationCountryId);
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
                key={`${selected}-${selectedRegion ?? "none"}-${mapZoom >= 5 ? "near" : "far"}-${Object.keys(sim.occupationByRegion).sort().join(',')}`}
                data={regionGeometry}
                style={(feature) => {
                  const regionId = feature?.properties?.regionId as string;
                  const owner = sim.regionOwnership[regionId] ?? selected;
                  const occupation = sim.occupationByRegion[regionId];
                  return {
                    color: selectedRegion === regionId ? "#efc781" : occupation ? "#d66f62" : "#46545a",
                    weight: selectedRegion === regionId ? 2.2 : occupation ? 1.8 : mapZoom >= 5 ? 0.9 : 0.55,
                    dashArray: occupation ? "6 3" : undefined,
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
            demographic={populationData.byRegionId.get(selectedRegionEntity.id)}
            currentPopulation={sim.populationByRegion[selectedRegionEntity.id]}
            economic={economicData.byRegionId.get(selectedRegionEntity.id)}
            currentEconomicOutput={sim.economicOutputByRegion[selectedRegionEntity.id]}
            activeClaims={selectedRegionClaims}
            occupation={selectedOccupation ? { ...selectedOccupation, occupierName: countryName(selectedOccupation.occupierCountryId), war: selectedOccupationWar } : undefined}
            objectiveWars={selectedObjectiveWars}
          />
        ) : (
          <CountryPanel
            country={selectedCountry}
            factsRecord={selected ? countryData?.factsByCountryId.get(selected) : undefined}
            officeholders={selected ? countryData?.officeholdersByCountryId.get(selected) : undefined}
            nationalPopulation={selected ? populationData.nationalByCountryId.get(selected) : undefined}
            controlledPopulation={selected ? controlledPopulation(sim, selected) : undefined}
            controlledPopulationComplete={selected ? controlledPopulation(sim, selected) !== undefined : false}
            controlledEconomicOutput={selected ? controlledEconomicOutput(sim, selected) : undefined}
            controlledEconomicOutputComplete={selected ? controlledEconomicOutput(sim, selected) !== undefined : false}
            activeClaimsMade={activeClaimsMade}
            foreignClaims={foreignClaims}
            availableCasusBelli={availableCasusBelli}
            activeWars={activeWars}
          />
        )}
      </div>
    </main>
  );
}
