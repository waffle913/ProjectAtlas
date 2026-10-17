import { emptyAssets } from './simulation/assets/model';
import { emptyOperations } from './simulation/operations/model';
import { emptyInternational } from './simulation/international/model';
import { publicInternationalActions } from './simulation/international/runtime';
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
import { EconomyPanel } from './components/EconomyPanel';
import { emptyFiscal } from './simulation/fiscal/model';
import { emptyCrisis } from './simulation/crisis/model';
import { emptyPolitics } from './simulation/politics/model';
import { emptyGovernance } from './simulation/governance/model';
import { emptyInformation } from './simulation/information/model';
import { emptySocioeconomy } from './simulation/socioeconomy/model';
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Country, RegionEntity, SimulationState, Territory } from "./types";
import { buildWorld } from "./data/geography";
import { loadCountryData, type LoadedCountryData } from "./data/countryData";
import { loadRegionData, type LoadedRegionData } from "./data/regionData";
import { loadPopulationData, populationBaselineState, type LoadedPopulationData } from "./data/populationData";
import { loadEconomicData, economicBaselineState, type LoadedEconomicData } from "./data/economicData";
import type { InitializationData } from "./simulation/socioeconomy/initialization";
import type { PoliticalInitializationData } from "./simulation/politics/initialization";
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
import { initDesktopBackends, exitApplication, applyNativeDisplayMode, isTauri } from "./app/desktop";
import { countryColour, regionLayerColour, MAP_LAYERS, UNAVAILABLE_LAYER_LABELS, type MapLayer } from "./app/mapLayers";
import { newUrgentBriefingCount } from "./app/urgency";
import { controlledActor, governmentAdvisors, orderedNotifications } from "./app/leftRail";
import "leaflet/dist/leaflet.css";
import "./styles.css";
const initialState: SimulationState = {
  schemaVersion: 20, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets('2026-01-01'), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(),
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
  const [mapLayer, setMapLayer] = useState<MapLayer>('ownership');
  const [screen, setScreen] = useState<MenuScreen>('menu');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [savePrompt, setSavePrompt] = useState<null | { mode: 'save' | 'saveAs'; name: string }>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [saves, setSaves] = useState(() => listSaves());
  const [storageState, setStorageState] = useState<'initializing' | 'ready' | 'error'>(() => (isTauri() ? 'initializing' : 'ready'));
  const [storageError, setStorageError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [loadStage, setLoadStage] = useState('Loading country registry and geography…');
  const newGameBaseRef = useRef<SimulationState | undefined>(undefined);
  const newGameSeedRef = useRef<{ regions: RegionEntity[]; countryIds: string[]; socioeconomicData: InitializationData; politicalData: PoliticalInitializationData } | undefined>(undefined);
  useEffect(() => { applyUiScale(settings); }, [settings]);
  useEffect(() => {
    let active = true;
    if (!isTauri()) { setStorageState('ready'); return; }
    initDesktopBackends()
      .then((result) => {
        if (!active) return;
        // Read errors (a corrupt settings file or an unreadable save) are surfaced
        // as warnings, never a hard block: the native backend is installed and the
        // successfully-read saves remain usable.
        if (result.error) setStorageError(result.error);
        setStorageState('ready');
        // Reload settings and save listings from the native backend, so the
        // application never silently keeps reading the browser localStorage.
        setSettings(loadSettings());
        setSaves(listSaves());
      })
      .catch((error) => {
        if (!active) return;
        setStorageError(error instanceof Error ? error.message : String(error));
        setStorageState('error');
      });
    return () => { active = false; };
  }, []);
  useEffect(() => { void applyNativeDisplayMode(settings.graphics.displayMode); }, [settings.graphics.displayMode]);
  const persistSettings = (next: AppSettings) => {
    setSettings(next);
    void saveSettings(next).catch((error) => setStorageError(`Settings could not be saved: ${error instanceof Error ? error.message : String(error)}`));
  };
  const storageReady = storageState === 'ready';
  const clock = useRef(new SimulationClock(initialState));
  useEffect(() => {
    let active = true;
    setLoadStage('Loading country registry and geography…');
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
        setLoadStage('Loading Region registry and boundaries…');
        const [regions, ...geography] = await Promise.all([
          loadRegionData(data.registry),
          ...responses.map((response) => response.json()),
        ]);
        setLoadStage('Loading population baselines…');
        const population = await loadPopulationData(regions.registry.regions, new Set(data.registry.countries.map(country => country.id)));
        setLoadStage('Loading economic baselines…');
        const economy = await loadEconomicData(regions.registry.regions);
        return [data, regions, population, economy, ...geography] as const;
      })
      .then(([data, regions, population, economy, admin0, land, lakes, rivers, admin1Overview]) => {
        if (!active) return;
        setLoadStage('Initializing simulation…');
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
        // Capture the fresh-game base + seed so "New Game" can re-initialize a
        // genuinely fresh simulation without any prior session's state.
        const base = clock.current.snapshot();
        const countryIds = data.registry.countries.map(country => country.id);
        const socioeconomicData: InitializationData = { demographics: population.demographics, national: population.national, economics: economy.baselines, facts: data.facts.countries };
        const politicalData: PoliticalInitializationData = { countries: data.registry.countries, offices: data.politics };
        newGameBaseRef.current = base;
        newGameSeedRef.current = { regions: regions.registry.regions, countryIds, socioeconomicData, politicalData };
        clock.current = new SimulationClock(initializeNewGame(
          base,
          regions.registry.regions,
          countryIds,
          socioeconomicData,
          politicalData,
        ));
        const registryContext = { countryIds: new Set(countryIds), regionIds: new Set(regions.registry.regions.map(region => region.id)) };
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
      const before = clock.current.snapshot();
      const next = clock.current.advanceIfChanged(now - previous);
      if (next) {
        setSim(next);
        // Interruption policy: only a newly-visible urgent briefing (a grave
        // event) may pause the simulation, and only when the player asked for it.
        const controlledPersonId = next.governance.player.controlledPersonId;
        const countryId = controlledPersonId ? next.governance.persons[controlledPersonId]?.countryId : undefined;
        if (settings.gameplay.pauseOnUrgent && controlledPersonId && countryId && newUrgentBriefingCount(before, next, countryId, controlledPersonId) > 0) {
          clock.current.setPaused(true);
          setSim(clock.current.snapshot());
        }
      }
      previous = now;
    }, 250);
    return () => window.clearInterval(timer);
  }, [settings.gameplay.pauseOnUrgent]);
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
  const dataReady = Boolean(world && countryData && regionData && populationData && economicData);
  // A new game always re-initializes from the captured fresh base + seed, so
  // returning to the menu and starting again can never preserve a prior
  // session's player, ownership, wars, budgets or clock state.
  const startNewGame = () => {
    if (!newGameBaseRef.current || !newGameSeedRef.current) return;
    const { regions, countryIds, socioeconomicData, politicalData } = newGameSeedRef.current;
    const fresh = initializeNewGame(structuredClone(newGameBaseRef.current), regions, countryIds, socioeconomicData, politicalData);
    setSelected(undefined);
    setSelectedRegion(undefined);
    setActivePage('overview');
    setMapLayer('ownership');
    setSaveError(undefined);
    applyState(fresh);
    setScreen('game');
  };
  // Opening the pause menu, or leaving the game view entirely, genuinely
  // suspends progression: the shared clock is paused and never advances while a
  // menu is shown.
  useEffect(() => {
    const inGame = screen === 'game' && !pauseOpen;
    if (!inGame && !clock.current.snapshot().paused) {
      clock.current.setPaused(true);
      setSim(clock.current.snapshot());
    }
  }, [screen, pauseOpen]);
  const ctrlPersonId = sim.governance.player.controlledPersonId;
  const ctrlPerson = ctrlPersonId ? sim.governance.persons[ctrlPersonId] : undefined;
  // Autosave is a wall-clock feature, never a simulation scheduler. The ref holds
  // the latest render's state so the interval effect does not need `sim` (which
  // changes every tick) in its dependency array.
  const autosaveRef = useRef<{ sim: SimulationState; ctrlPerson: typeof ctrlPerson; registryContext: typeof registryContext; world: typeof world } | undefined>(undefined);
  useEffect(() => { autosaveRef.current = { sim, ctrlPerson, registryContext, world }; });
  useEffect(() => {
    if (!settings.gameplay.autosave || !storageReady) return;
    const intervalMinutes = Math.max(1, Number(settings.gameplay.autosaveIntervalMinutes) || 15);
    let inFlight = false;
    const timer = window.setInterval(() => {
      const snapshot = autosaveRef.current;
      if (!snapshot || inFlight || !snapshot.registryContext || !snapshot.ctrlPerson || snapshot.sim.paused) return;
      inFlight = true;
      const { sim: current, ctrlPerson: person, registryContext: context, world: currentWorld } = snapshot;
      const country = person.countryId ? currentWorld?.countries.get(person.countryId) : undefined;
      const json = serializeSimulationState(current, context);
      saveGame('__autosave__', 'Autosave', json, {
        countryId: person.countryId,
        countryName: country?.commonName ?? '—',
        controlledPersonName: person.displayName ?? '—',
        office: person.office?.role ?? null,
        simulationDate: current.date,
        schemaVersion: current.schemaVersion,
      })
        .then(() => setSaves(listSaves()))
        .catch((error) => setSaveError(`Autosave failed: ${error instanceof Error ? error.message : String(error)}`))
        .finally(() => { inFlight = false; });
    }, intervalMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [settings.gameplay.autosave, settings.gameplay.autosaveIntervalMinutes, storageReady]);
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
  const saveCurrent = async (name: string): Promise<boolean> => {
    if (!registryContext) return false;
    if (!storageReady) { setSaveError('Storage is still initializing — please wait a moment and try again.'); return false; }
    const country = ctrlPerson?.countryId ? world?.countries.get(ctrlPerson.countryId) : undefined;
    const json = serializeSimulationState(sim, registryContext);
    try {
      await saveGame(saveIdFor(name), name, json, {
        countryId: ctrlPerson?.countryId ?? '',
        countryName: country?.commonName ?? '—',
        controlledPersonName: ctrlPerson?.displayName ?? '—',
        office: ctrlPerson?.office?.role ?? null,
        simulationDate: sim.date,
        schemaVersion: sim.schemaVersion,
      });
      setSaves(listSaves());
      setSaveError(undefined);
      return true;
    } catch (error) {
      setSaveError(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
  const exitApp = () => { void exitApplication(); };
  if (screen === 'settings') return <SettingsMenu settings={settings} onChange={persistSettings} onBack={() => setScreen(ctrlPerson ? 'game' : 'menu')} />;
  if (screen === 'load') return storageReady
    ? <SaveManager onLoad={loadSlot} onBack={() => setScreen(ctrlPerson ? 'game' : 'menu')} />
    : <main className="load-state"><h1>{storageState === 'error' ? 'Save storage unavailable' : 'Storage initializing'}</h1><p>{storageState === 'error' ? (storageError ?? 'Local save storage could not be read.') : 'Local save storage is still being prepared. Please wait a moment.'}</p><button onClick={() => setScreen(ctrlPerson ? 'game' : 'menu')}>← Back</button></main>;
  if (screen === 'credits') return (
    <main className="load-state credits">
      <h1>ProjectAtlas</h1>
      <p>ProjectAtlas is built on audited, provenance-carrying datasets (Natural Earth, IPU Parline, and other attributed sources). Detailed source, licence and attribution records live in the in-game provenance details and repository data audit.</p>
      <button onClick={() => setScreen(ctrlPerson ? 'game' : 'menu')}>← Back</button>
    </main>
  );
  if (screen === 'menu') return <MainMenu hasSave={Boolean(mostRecentSave())} ready={dataReady && storageReady} onContinue={continueGame} onNewGame={startNewGame} onLoad={() => setScreen('load')} onSettings={() => setScreen('settings')} onCredits={() => setScreen('credits')} onExit={exitApp} settings={settings} />;
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
        <p>{loadStage}</p>
      </main>
    );
  const controlledPersonId = sim.governance.player.controlledPersonId;
  const controlledPerson = controlledPersonId ? sim.governance.persons[controlledPersonId] : undefined;
  const playerCountryId = controlledPerson?.countryId;
  const playerCanReadGovernment = Boolean(controlledPerson && playerCountryId && hasGovernmentInformationAccess(sim, controlledPerson.id, playerCountryId));
  const railActor = controlledActor(sim, controlledPersonId);
  const railAdvisors = governmentAdvisors(sim, playerCountryId);
  const railNotifications = controlledPersonId && playerCountryId ? orderedNotifications(sim, playerCountryId, controlledPersonId) : [];
  const commitCommand = (next: SimulationState) => {
    clock.current.replaceState(next);
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
        {controlledPerson && (
          <aside className="left-rail" aria-label="Actors, advisors and notifications">
            {railActor && <section className="rail-actor"><strong>{railActor.displayName}</strong><small>{railActor.officeTitle ?? 'No public office'}{railActor.isPartyLeader ? ' · party leader' : ''}</small></section>}
            <section className="rail-notifications">
              <h3>Notifications</h3>
              {railNotifications.length ? railNotifications.slice(0, 8).map(note => (
                <button key={note.id} className="rail-note" title={note.headline} onClick={() => setActivePage(note.destination)}>
                  <span className={`severity severity-${note.severity}`}>{note.severity}</span><small>{note.headline}</small>
                </button>
              )) : <p className="muted">No notifications.</p>}
            </section>
            {railAdvisors.length > 0 && <details className="rail-advisors"><summary>Advisors ({railAdvisors.length})</summary>{railAdvisors.map(advisor => <p key={advisor.portfolioId}><strong>{advisor.portfolioName}</strong> · {advisor.ministerName}</p>)}</details>}
          </aside>
        )}
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
                  return {
                  color: selectedRegion === regionId ? "#efc781" : "#46545a",
                  weight: selectedRegion === regionId ? 2.2 : mapZoom >= 5 ? 0.9 : 0.55,
                    fillColor: regionLayerColour(mapLayer, regionId, sim),
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
            <div className="layer-control" role="toolbar" aria-label="Map layers">
              {MAP_LAYERS.map(({ id, label }) => (
                <button key={id} type="button" className={mapLayer === id ? 'active' : ''} onClick={() => setMapLayer(id)}>{label}</button>
              ))}
              <span className="layer-unavailable">Unavailable: {UNAVAILABLE_LAYER_LABELS.join(' · ')}</span>
            </div>
            <p>Admin-1 Region boundaries at zoom ≥ 4. Select a country, then zoom to inspect Regions.</p>
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
            {playerCanReadGovernment && playerCountryId && controlledPerson ? <>
              {inspectGovernmentReports(sim, playerCountryId, controlledPerson.id).map(report => <section key={report.id}><strong>Labour report · {report.asOfDate}</strong><p>{report.valueBps === undefined ? 'Unavailable' : `Unemployment ${(report.valueBps / 100).toFixed(2)}%`}</p><small>{report.coverage} · {report.limitation}</small></section>)}
              <EconomyPanel state={sim} countryId={playerCountryId} personId={controlledPerson.id} />
            </> : <p>Current internal economic reports are not available to an opposition person. No public unemployment report is currently implemented.</p>}
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
        ) : activePage === 'security' && selected ? (
          <aside className="panel"><h2>Security</h2>
            {(() => { const entry = sim.constitution.countries[selected]; return entry ? <section><strong>State of emergency</strong><p>{entry.emergency.status}{entry.emergency.restrictions.policePowersEnhanced ? ' · enhanced police powers' : ''}</p></section> : <p>Constitutional emergency status is unavailable for this Country.</p>; })()}
            {sim.wars.filter(war => war.status === 'active' && (war.attackerCountryId === selected || war.defenderCountryId === selected)).length > 0 && <p>This Country is party to an active war.</p>}
            {playerCanReadGovernment && selected === playerCountryId
              ? (() => { const episodes = Object.values(sim.crisis.countries[selected]?.currentByType ?? {}).filter(episode => episode.activatedOn && !episode.endedOn); return episodes.length > 0 ? <section><strong>Active crises</strong>{episodes.map(episode => <p key={episode.id}>{episode.type}: {episode.severity} (pressure {episode.currentPressure})</p>)}</section> : <p>No active crises are recorded for this Country.</p>; })()
              : <p>Crisis severity and pressure are internal government assessments, not public information.</p>}
            <p>Further security systems are not represented in the current build.</p>
          </aside>
        ) : activePage === 'services' && selected ? (
          <aside className="panel"><h2>Public services</h2>
            {playerCanReadGovernment && selected === playerCountryId
              ? (() => { const fiscal = sim.fiscal.countries[selected]; return fiscal ? <section><strong>Annual budget allocations (USD)</strong>{(['health', 'education', 'pensions', 'incomeSupport', 'infrastructure'] as const).map(cat => <p key={cat}>{cat}: {fiscal.annualBudget[cat]}</p>)}</section> : <p>Fiscal service data is unavailable for this Country.</p>; })()
              : <p>Annual budget allocations are government information, not public.</p>}
            <p>Service delivery backlogs are reported through the fiscal engine where available.</p>
          </aside>
        ) : <aside className="panel"><h2>{navItems.find(([id]) => id === activePage)?.[1]}</h2><p>This system is not represented in the current ProjectAtlas build. ProjectAtlas does not fabricate placeholder capability values or actions.</p>{activePage === 'diplomacy' && selected && <>
  <p>Active recorded territorial claims: {sim.claims.filter(claim => claim.status === 'active' && (claim.claimantCountryId === selected || sim.regionOwnership[claim.regionId] === selected)).length} · active wars: {sim.wars.filter(war => war.status === 'active' && (war.attackerCountryId === selected || war.defenderCountryId === selected)).length}.</p>
  {(() => { const actions = publicInternationalActions(sim, selected).filter(action => action.status === 'active'); return actions.length > 0 ? <section><strong>Recorded international actions</strong>{actions.map(action => <p key={action.id}>{action.actorCountryId} → {action.targetCountryId}: {action.kind}{action.categories.length > 0 ? ` (${action.categories.join(', ')})` : ''}</p>)}</section> : null; })()}
  <p>Further diplomacy decisions are not implemented.</p>
</>}</aside>}
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
            <input value={savePrompt.name} onChange={e => { setSavePrompt({ ...savePrompt, name: e.target.value }); setConfirmOverwrite(false); }} placeholder="Save name" autoFocus />
            <button disabled={!storageReady} onClick={async () => {
              const name = savePrompt.name || 'ProjectAtlas';
              const targetId = saveIdFor(name);
              const exists = listSaves().some(save => save.id === targetId);
              if (exists && !confirmOverwrite) { setConfirmOverwrite(true); return; }
              if (await saveCurrent(name)) { setSavePrompt(null); setPauseOpen(false); setConfirmOverwrite(false); }
            }}>{confirmOverwrite ? 'Overwrite existing save' : 'Save'}</button>
            <button onClick={() => { setSavePrompt(null); setSaveError(undefined); setConfirmOverwrite(false); }}>Cancel</button>
            {confirmOverwrite && !saveError && <p className="save-error">A save with this name already exists. Overwrite it?</p>}
            {(saveError || storageError) && <p className="save-error">{saveError ?? storageError}</p>}
          </div>
        </div>
      )}
      {!controlledPerson && <StartGame countries={countryData.registry.countries} persons={Object.values(sim.governance.persons)} onPlay={startAs} />}
    </main>
  );
}
