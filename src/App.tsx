import { emptyOperations } from './simulation/operations/model';
import { emptyInternational } from './simulation/international/model';
import { emptyMultilateral } from './simulation/multilateral/model';
import { emptyConstitution } from './simulation/constitution/model';
import { emptyElections } from './simulation/elections/model';
import { emptyTrade } from './simulation/trade/model';
import { emptyMilitary } from './simulation/military/model';
import { StartGame } from './components/StartGame';
import { MilitaryCapabilities } from './components/MilitaryCapabilities';
import { OperationsPanel } from './components/OperationsPanel';
import { MultilateralPanel } from './components/MultilateralPanel';
import { TradeInspection } from './components/TradeInspection';
import { configureSyntheticTradeScenario } from './simulation/trade/scenario';
import { configureSyntheticMilitaryScenario } from './simulation/military/scenario';
import { BriefingTablet } from './components/BriefingTablet';
import { FiscalPolicy } from './components/FiscalPolicy';
import { emptyFiscal } from './simulation/fiscal/model';
import { emptyCrisis } from './simulation/crisis/model';
import { emptyPolitics } from './simulation/politics/model';
import { emptyGovernance } from './simulation/governance/model';
import { emptyInformation } from './simulation/information/model';
import { emptySocioeconomy } from './simulation/socioeconomy/model';
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Country, SimulationState, Territory } from "./types";
import { buildWorld } from "./data/geography";
import { loadCountryData, type LoadedCountryData } from "./data/countryData";
import { loadRegionData, type LoadedRegionData } from "./data/regionData";
import { loadPopulationData, populationBaselineState, type LoadedPopulationData } from "./data/populationData";
import { loadEconomicData, economicBaselineState, type LoadedEconomicData } from "./data/economicData";
import { Clock } from "./components/Clock";
import { CountryPanel } from "./components/CountryPanel";
import { RegionPanel } from "./components/RegionPanel";
import { SimulationClock } from "./simulation/clock";
import { createEngineState } from "./simulation/state";
import { assertSimulationInvariants } from "./simulation/invariants";
import { setControlledPerson } from "./simulation/governance/runtime";
import { hasGovernmentInformationAccess, inspectGovernmentReports } from "./simulation/information/runtime";
import { politicalRegistry } from "./simulation/politics/registry";
import { initializeNewGame } from "./simulation/initialization";
import { serializeSimulationState, restoreSimulationState } from "./simulation/save";
import { MainMenu, type MenuScreen } from "./components/MainMenu";
import { SettingsMenu } from "./components/SettingsMenu";
import { SaveManager } from "./components/SaveManager";
import { loadSettings, saveSettings, applyUiScale, type AppSettings } from "./app/preferences";
import { listSaves, mostRecentSave, saveGame, loadSave, deleteSave, saveIdFor } from "./app/saveStorage";
import { initDesktopBackends, exitApplication, applyNativeDisplayMode } from "./app/desktop";
import "leaflet/dist/leaflet.css";
import "./styles.css";
const initialState: SimulationState = {
  schemaVersion: 19, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(),
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
  engine: createEngineState(),
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
  const [activePage, setActivePage] = useState('overview');
  const [screen, setScreen] = useState<MenuScreen>('menu');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [savePrompt, setSavePrompt] = useState<null | { mode: 'save' | 'saveAs'; name: string }>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [saves, setSaves] = useState(() => listSaves());
  useEffect(() => { applyUiScale(settings); }, [settings]);
  useEffect(() => { void initDesktopBackends(); }, []);
  useEffect(() => { void applyNativeDisplayMode(settings.graphics.displayMode); }, [settings.graphics.displayMode]);
  const persistSettings = (next: AppSettings) => { setSettings(next); saveSettings(next); };
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
        clock.current.setCountries(data.registry.countries.map(country => country.id));
        clock.current = new SimulationClock(initializeNewGame(
          clock.current.snapshot(),
          regions.registry.regions,
          data.registry.countries.map(country => country.id),
          { demographics: population.demographics, national: population.national, economics: economy.baselines, facts: data.facts.countries },
          { countries: data.registry.countries, offices: data.politics },
        ));
        const registryContext = { countryIds: new Set(data.registry.countries.map(country => country.id)), regionIds: new Set(regions.registry.regions.map(region => region.id)) };
        assertSimulationInvariants(clock.current.snapshot(), { ...registryContext, regions: regions.registry.regions }, 'reload');
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
      const next = clock.current.advanceIfChanged(now - previous);
      if (next) setSim(next);
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
  const registryContext = countryData && regionData && world ? {
    countryIds: new Set(countryData.registry.countries.map(c => c.id)),
    regionIds: new Set(regionData.registry.regions.map(r => r.id)),
    regions: regionData.registry.regions,
  } : undefined;
  const applyState = (next: SimulationState) => { clock.current = new SimulationClock(next); setSim(clock.current.snapshot()); };
  const ctrlPersonId = sim.governance.player.controlledPersonId;
  const ctrlPerson = ctrlPersonId ? sim.governance.persons[ctrlPersonId] : undefined;
  const loadSlot = (id: string) => {
    if (!registryContext) return;
    const json = loadSave(id);
    if (!json) { setLoadError('The selected save could not be read.'); return; }
    try {
      applyState(restoreSimulationState(json, registryContext.regions, {}, {}, registryContext));
      setScreen('game');
    } catch (error) {
      setLoadError(error instanceof Error ? `Could not load save: ${error.message}` : 'Could not load save.');
    }
  };
  const continueGame = () => { const recent = mostRecentSave(); if (recent) loadSlot(recent.id); };
  const saveCurrent = (name: string) => {
    if (!registryContext) return;
    const country = ctrlPerson?.countryId ? world?.countries.get(ctrlPerson.countryId) : undefined;
    const json = serializeSimulationState(sim, registryContext);
    saveGame(saveIdFor(name), name, json, {
      countryId: ctrlPerson?.countryId ?? '',
      countryName: country?.commonName ?? '—',
      controlledPersonName: ctrlPerson?.displayName ?? '—',
      office: ctrlPerson?.office?.role ?? null,
      simulationDate: sim.date,
      schemaVersion: sim.schemaVersion,
    });
    setSaves(listSaves());
  };
  const exitApp = () => { void exitApplication(); };
  if (screen === 'settings') return <SettingsMenu settings={settings} onChange={persistSettings} onBack={() => setScreen(ctrlPerson ? 'game' : 'menu')} />;
  if (screen === 'load') return <SaveManager onLoad={loadSlot} onBack={() => setScreen(ctrlPerson ? 'game' : 'menu')} />;
  if (screen === 'credits') return (
    <main className="load-state credits">
      <h1>ProjectAtlas</h1>
      <p>ProjectAtlas is built on audited, provenance-carrying datasets (Natural Earth, IPU Parline, and other attributed sources). Detailed source, licence and attribution records live in the in-game provenance details and repository data audit.</p>
      <button onClick={() => setScreen(ctrlPerson ? 'game' : 'menu')}>← Back</button>
    </main>
  );
  if (screen === 'menu') return <MainMenu hasSave={Boolean(mostRecentSave())} onContinue={continueGame} onNewGame={() => setScreen('new-game')} onLoad={() => setScreen('load')} onSettings={() => setScreen('settings')} onCredits={() => setScreen('credits')} onExit={exitApp} settings={settings} />;
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
  if (!world || !countryData || !regionData || !populationData || !economicData)
    return (
      <main className="load-state">
        <p>Loading local country and Region assets…</p>
      </main>
    );
  const controlledPersonId = sim.governance.player.controlledPersonId;
  const controlledPerson = controlledPersonId ? sim.governance.persons[controlledPersonId] : undefined;
  const playerCountryId = controlledPerson?.countryId;
  const playerCanReadGovernment = Boolean(controlledPerson && playerCountryId && hasGovernmentInformationAccess(sim, controlledPerson.id, playerCountryId));
  const commitCommand = (next: SimulationState) => {
    clock.current = new SimulationClock(next);
    setSim(clock.current.snapshot());
  };
  const startAs = (personId: string, syntheticMilitary = false, syntheticTrade = false) => {
    const countryId = sim.governance.persons[personId]?.countryId;
    if (!countryId) throw new Error('Selected political person has no registered Country.');
    let next = syntheticMilitary ? configureSyntheticMilitaryScenario(sim, countryId) : sim;
    if (syntheticTrade) next = configureSyntheticTradeScenario(next, countryId);
    commitCommand(setControlledPerson(next, personId));
  };
  const navItems = [
    ['overview', 'Overview', '⌂'], ['fiscal', 'Fiscality', '¤'], ['economy', 'Economy', '▥'],
    ['politics', 'Politics', '⚑'], ['services', 'Health / services', '＋'],
    ['security', 'Security', '◇'], ['operations', 'Operations', '◎'], ['treaties', 'Treaties', '§'], ['diplomacy', 'Diplomacy', '⇄'], ['military', 'Military', '⚔'],
    ['trade', 'Trade', '⇆'],
  ];
  return (
    <main>
      <header>
        <div>
          <span className="brand-mark">◈</span>
          <span className="brand">
            PROJECT<span>ATLAS</span>
          </span>
          <small>Version {import.meta.env.VITE_APP_VERSION ?? '1.0.0'}</small>
        </div>
        <div className="header-tools">
          <Clock state={sim} onChange={changeClock} />
          <button className="menu-button" onClick={() => setPauseOpen(true)} aria-label="Menu">☰</button>
          {controlledPerson && <BriefingTablet state={sim} onStateChange={commitCommand} onNavigate={setActivePage} />}
        </div>
      </header>
      <div className="workspace">
        <nav className="nav-rail" aria-label="Main navigation">
          {navItems.map(([id, label, icon]) => <button key={id} className={activePage === id ? 'active' : ''} title={label} aria-label={label} onClick={() => setActivePage(id)}><span>{icon}</span><small>{label}</small></button>)}
        </nav>
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
                key={`${selected}-${selectedRegion ?? "none"}-${mapZoom >= 5 ? "near" : "far"}`}
                data={regionGeometry}
                style={(feature) => {
                  const regionId = feature?.properties?.regionId as string;
                  const owner = sim.regionOwnership[regionId] ?? selected;
                  return {
                  color: selectedRegion === regionId ? "#efc781" : "#46545a",
                  weight: selectedRegion === regionId ? 2.2 : mapZoom >= 5 ? 0.9 : 0.55,
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
        {activePage === 'fiscal' && controlledPerson && playerCountryId ? (
          <aside className="panel">
            <FiscalPolicy state={sim} countryId={playerCountryId} personId={controlledPerson.id} onStateChange={commitCommand} />
          </aside>
        ) : activePage === 'military' && controlledPerson && playerCountryId ? (
          <aside className="panel"><MilitaryCapabilities state={sim} countryId={playerCountryId} personId={controlledPerson.id} onStateChange={commitCommand} onBudget={() => setActivePage('fiscal')} /></aside>
        ) : activePage === 'operations' && controlledPerson && playerCountryId ? (
          <aside className="panel"><OperationsPanel state={sim} countryId={playerCountryId} personId={controlledPerson.id} onStateChange={commitCommand} /></aside>
        ) : activePage === 'treaties' && controlledPerson && playerCountryId ? (
          <aside className="panel"><MultilateralPanel state={sim} countryId={playerCountryId} personId={controlledPerson.id} onStateChange={commitCommand} /></aside>
        ) : activePage === 'trade' && controlledPerson && playerCountryId ? (
          <aside className="panel"><TradeInspection state={sim} countryId={playerCountryId} personId={controlledPerson.id} onStateChange={commitCommand} /></aside>
        ) : activePage === 'economy' ? (
          <aside className="panel"><h2>Economic information</h2>
            {playerCanReadGovernment && playerCountryId && controlledPerson ? inspectGovernmentReports(sim, playerCountryId, controlledPerson.id).map(report => <section key={report.id}><strong>Labour report · {report.asOfDate}</strong><p>{report.valueBps === undefined ? 'Unavailable' : `Unemployment ${(report.valueBps / 100).toFixed(2)}%`}</p><small>{report.coverage} · {report.limitation}</small></section>) : <p>Current internal economic reports are not available to an opposition person. No public unemployment report is currently implemented.</p>}
          </aside>
        ) : activePage === 'politics' ? (
          <aside className="panel"><h2>Public political institutions</h2>
            {selected ? <><p>{politicalRegistry.countries[selected]?.coverage.legislature ?? 'unavailable'} legislative coverage.</p>{politicalRegistry.countries[selected]?.partyIds.map(id => politicalRegistry.parties[id]).sort((a, b) => a.displayName.localeCompare(b.displayName)).map(party => <section key={party.id}><strong>{party.displayName}</strong><p>{party.governmentStatus === 'government' ? 'Government bloc' : party.governmentStatus === 'opposition' ? 'Opposition' : 'Government position unavailable'} · {party.currentSeats === null ? 'seat count unavailable' : `${party.currentSeats} seats`}</p><small>Fictional gameplay party · ideology basis {party.ideologicalBasis.status}</small></section>)}</> : <p>Select a Country on the map to inspect public political information.</p>}
          </aside>
        ) : activePage === 'overview' && selectedRegionEntity ? (
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
        ) : activePage === 'overview' ? (
          <CountryPanel
            country={selectedCountry}
            factsRecord={selected ? countryData?.factsByCountryId.get(selected) : undefined}
            officeholders={selected ? countryData?.officeholdersByCountryId.get(selected) : undefined}
            nationalPopulation={selected ? populationData.nationalByCountryId.get(selected) : undefined}
          />
        ) : <aside className="panel"><h2>{navItems.find(([id]) => id === activePage)?.[1]}</h2><p>This system is not represented in the current ProjectAtlas build. ProjectAtlas does not fabricate placeholder capability values or actions.</p>{activePage === 'diplomacy' && selected && <p>Current recorded territorial claims: {sim.claims.filter(claim => claim.status === 'active' && (claim.claimantCountryId === selected || sim.regionOwnership[claim.regionId] === selected)).length} · active wars: {sim.wars.filter(war => war.status === 'active' && (war.attackerCountryId === selected || war.defenderCountryId === selected)).length}. Further diplomacy decisions are not implemented.</p>}</aside>}
      </div>
      {pauseOpen && (
        <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="Pause menu">
          <div className="pause-menu">
            <h1>Paused</h1>
            <button onClick={() => setPauseOpen(false)}>Resume</button>
            <button onClick={() => setSavePrompt({ mode: 'save', name: ctrlPerson?.displayName ?? 'ProjectAtlas' })}>Save</button>
            <button onClick={() => setSavePrompt({ mode: 'saveAs', name: '' })}>Save As</button>
            <button onClick={() => { setPauseOpen(false); setScreen('load'); }}>Load Game</button>
            <button onClick={() => { setPauseOpen(false); setScreen('settings'); }}>Settings</button>
            <button onClick={() => { setPauseOpen(false); setScreen('menu'); }}>Return to Main Menu</button>
            <button className="danger" onClick={exitApp}>Exit Game</button>
          </div>
        </div>
      )}
      {savePrompt && (
        <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="Save game">
          <div className="pause-menu">
            <h1>{savePrompt.mode === 'saveAs' ? 'Save As' : 'Save Game'}</h1>
            <input value={savePrompt.name} onChange={e => setSavePrompt({ ...savePrompt, name: e.target.value })} placeholder="Save name" autoFocus />
            <button onClick={() => { saveCurrent(savePrompt.name || 'ProjectAtlas'); setSavePrompt(null); setPauseOpen(false); }}>Save</button>
            <button onClick={() => setSavePrompt(null)}>Cancel</button>
          </div>
        </div>
      )}
      {!controlledPerson && <StartGame countries={countryData.registry.countries} persons={Object.values(sim.governance.persons)} onPlay={startAs} />}
    </main>
  );
}
