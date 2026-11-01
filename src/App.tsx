import { SessionIntegrity } from './app/sessionIntegrity';
import { MenuDialog } from './components/MenuDialog';
import { CreditsMenu } from './components/CreditsMenu';
import { readCampaignSummary, type CampaignSummary } from './app/campaignSummary';
import { emptyAssets } from './simulation/assets/model';
import { emptyOperations } from './simulation/operations/model';
import { emptyInternational } from './simulation/international/model';
import { emptyMultilateral } from './simulation/multilateral/model';
import { emptyConstitution } from './simulation/constitution/model';
import { emptyElections } from './simulation/elections/model';
import { emptyTrade } from './simulation/trade/model';
import { emptyMilitary } from './simulation/military/model';
import { NewGameSetup, initialNewGameDraft, type NewGameDraft } from './components/new-game/NewGameSetup';
import { createConfirmedCampaign, startingSelectionSnapshot } from './app/newCampaign';
import { MilitaryCapabilities } from './components/MilitaryCapabilities';
import { OperationsPanel } from './components/OperationsPanel';
import { DiplomacyPanel } from './components/DiplomacyPanel';
import { SecurityPanel } from './components/SecurityPanel';
import { ParliamentPanel } from './components/ParliamentPanel';
import { MultilateralPanel } from './components/MultilateralPanel';
import { TradeInspection } from './components/TradeInspection';
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
import type { PoliticalStartPath } from "./simulation/governance/selection";
import { hasGovernmentInformationAccess, inspectGovernmentReports } from "./simulation/information/runtime";
import { politicalRegistry } from "./simulation/politics/registry";
import { initializeNewGame } from "./simulation/initialization";
import { serializeSimulationState, restoreSimulationState } from "./simulation/save";
import { MainMenu, type MenuScreen } from "./components/MainMenu";
import { SettingsMenu } from "./components/SettingsMenu";
import { SaveManager, type LoadPreview } from "./components/SaveManager";
import { loadSettings, saveSettings, applyUiScale, normalizeSettings, type AppSettings } from "./app/preferences";
import { listSaves, mostRecentSave, saveGame, loadSave, deleteSave, saveIdFor } from "./app/saveStorage";
import { initDesktopBackends, exitApplication, registerNativeCloseRequest, applyNativeDisplayMode, isTauri } from "./app/desktop";
import { regionLayerColour, territoryLayerColour, MAP_LAYERS, LAYER_LEGEND, UNAVAILABLE_LAYER_LABELS, type MapLayer } from "./app/mapLayers";
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
  const [loadSlotError, setLoadSlotError] = useState<string>();
  const [activePage, setActivePage] = useState('overview');
  const [mapLayer, setMapLayer] = useState<MapLayer>('ownership');
  const [screen, setScreenState] = useState<MenuScreen>('menu');
  const integrity=useRef(new SessionIntegrity());
  const [loadPreview,setLoadPreview]=useState<LoadPreview>();
  const [pendingDestructive,setPendingDestructive]=useState<{label:string;action:()=>void|Promise<void>}>();
  const [guardError,setGuardError]=useState<string>();
  const [guardBusy,setGuardBusy]=useState(false);
  const [settingsError,setSettingsError]=useState<string>();
  const [displayError,setDisplayError]=useState<string>();
  const [displayBusy,setDisplayBusy]=useState(false);
  const displayBusyRef=useRef(false);
  const failedDisplayMode=useRef<AppSettings["graphics"]["displayMode"] | undefined>(undefined);
  const settingsWriteSequence=useRef(0);
  const closeAction=useRef<()=>void>(()=>{});
  const auxiliaryOrigin = useRef<'menu' | 'game' | 'new-game' | 'load'>('menu');
  const loadOrigin = useRef<'menu'|'game'|'new-game'>('menu');
  const [newGameDraft,setNewGameDraft] = useState<NewGameDraft>(()=>initialNewGameDraft([]));
  const newGameSelectionRef=useRef<SimulationState | undefined>(undefined);
  const [menuSelection, setMenuSelection] = useState<{ id: string; summary: CampaignSummary }>();
  const openAuxiliary = (destination: 'settings' | 'credits' | 'load') => {
    if(destination==='load')loadOrigin.current=screen==='game'?'game':screen==='new-game'?'new-game':'menu';
    auxiliaryOrigin.current = screen === 'load' ? 'load' : screen === 'game' ? 'game' : screen === 'new-game' ? 'new-game' : 'menu';
    setScreen(destination);
  };
  const returnFromAuxiliary = () => setScreen(auxiliaryOrigin.current);
  const selectMenuSave = (id: string) => {
    setMenuSelection({ id, summary: readCampaignSummary(loadSave(id)) });
  };
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const settingsRef=useRef(settings);settingsRef.current=settings;
  const [savePrompt, setSavePrompt] = useState<null | { mode: 'save' | 'saveAs'; name: string }>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [pauseOpen, setPauseOpenState] = useState(false);
  const [saveBusy,setSaveBusy]=useState(false);
  const [saves, setSaves] = useState(() => listSaves());
  const [storageState, setStorageState] = useState<'initializing' | 'ready' | 'error'>(() => (isTauri() ? 'initializing' : 'ready'));
  const storageReady = storageState === 'ready';
  const [storageError, setStorageError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [loadStage, setLoadStage] = useState('Loading country registry and geography…');
  const newGameBaseRef = useRef<SimulationState | undefined>(undefined);
  const newGameSeedRef = useRef<{ regions: RegionEntity[]; countryIds: string[]; socioeconomicData: InitializationData; politicalData: PoliticalInitializationData } | undefined>(undefined);
  // Remembers the clock's paused flag when a menu first suspends it, so returning
  // to the game view restores exactly that state instead of leaving the clock
  // stuck paused (or silently unpausing a deliberate manual pause).
  const menuPauseRef = useRef<boolean | undefined>(undefined);
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
  useEffect(()=>{
    if(!storageReady)return;
    let current=true;
    const mode=loadSettings().graphics.displayMode;
    applyNativeDisplayMode(mode).then(()=>{if(current)setDisplayError(undefined);})
      .catch(error=>{if(current){failedDisplayMode.current=mode;setDisplayError('Mode d’affichage non appliqué : '+(error instanceof Error?error.message:String(error)));}});
    return()=>{current=false;};
  },[storageReady]);
  const storeSettings = (next: AppSettings) => {
    const normalized=normalizeSettings(next);settingsRef.current=normalized;setSettings(normalized);
    const sequence=++settingsWriteSequence.current;
    void saveSettings(normalized).then(()=>{if(sequence===settingsWriteSequence.current)setSettingsError(undefined);})
      .catch(error=>{if(sequence===settingsWriteSequence.current)setSettingsError('Paramètres appliqués pour cette session, mais non sauvegardés : '+(error instanceof Error?error.message:String(error)));});
  };
  const requestDisplay = (mode: AppSettings['graphics']['displayMode']) => {
    if(displayBusyRef.current)return;
    displayBusyRef.current=true;setDisplayBusy(true);failedDisplayMode.current=mode;
    void applyNativeDisplayMode(mode).then(()=>{
      // Merge with the latest preferences: other categories remain editable while IPC runs.
      storeSettings({...settingsRef.current,graphics:{...settingsRef.current.graphics,displayMode:mode}});
      failedDisplayMode.current=undefined;setDisplayError(undefined);
    }).catch(error=>setDisplayError('Mode d’affichage non appliqué : '+(error instanceof Error?error.message:String(error))))
      .finally(()=>{displayBusyRef.current=false;setDisplayBusy(false);});
  };
  const persistSettings = (next: AppSettings) => {
    const mode=next.graphics.displayMode;
    // Displayed and saved values describe the applied mode, never an unacknowledged request.
    storeSettings({...next,graphics:{...next.graphics,displayMode:settingsRef.current.graphics.displayMode}});
    if(mode!==settingsRef.current.graphics.displayMode)requestDisplay(mode);
  };
  const clock = useRef(new SimulationClock(initialState));
  function suspendMenuClock(){
    if(menuPauseRef.current===undefined)menuPauseRef.current=clock.current.snapshot().paused;
    if(!clock.current.snapshot().paused){clock.current.setPaused(true);setSim(clock.current.snapshot());}
  }
  function setScreen(next:MenuScreen){if(next!=='game')suspendMenuClock();setScreenState(next);}
  function setPauseOpen(open:boolean){if(open)suspendMenuClock();setPauseOpenState(open);}
  function requestDestructive(label:string,action:()=>void|Promise<void>){
    suspendMenuClock();setGuardError(undefined);
    if(integrity.current.dirty){setPendingDestructive({label,action});return;}
    try{const result=action();if(result)void result.catch(error=>{setGuardError(String(error));setPauseOpen(true);});}
    catch(error){setGuardError(error instanceof Error?error.message:String(error));}
  }
  useEffect(()=>{
    const query=window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply=()=>applyUiScale(settings);query.addEventListener('change',apply);
    return()=>query.removeEventListener('change',apply);
  },[settings]);
  useEffect(()=>{
    if(isTauri())return;
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(integrity.current.dirty){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    return()=>window.removeEventListener('beforeunload',beforeUnload);
  },[]);
  useEffect(()=>{
    if(!isTauri())return;
    let active=true;let unlisten:(()=>void)|undefined;
    registerNativeCloseRequest(()=>closeAction.current()).then(stop=>{if(active)unlisten=stop;else stop();})
      .catch(error=>{if(active)setGuardError('Protection de fermeture native indisponible : '+String(error));});
    return()=>{active=false;unlisten?.();};
  },[]);

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
        newGameSelectionRef.current = startingSelectionSnapshot(clock.current.snapshot());
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
        integrity.current.changed();setSim(next);
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
            regionIds: regionIdsByMacroTerritory.get(t.id) ?? [],
          },
          geometry: t.geometry,
        })),
      } as GeoJSON.FeatureCollection),
    [world, regionData, regionIdsByMacroTerritory],
  );
  const changeClock = (next: SimulationState) => {
    const before=clock.current.snapshot();if(before.paused!==next.paused || before.speed!==next.speed)integrity.current.changed();
    clock.current.setPaused(next.paused);
    clock.current.setSpeed(next.speed);
    setSim(clock.current.snapshot());
  };
  const registryContext = countryData && regionData && world ? {
    countryIds: new Set(countryData.registry.countries.map(c => c.id)),
    regionIds: new Set(regionData.registry.regions.map(r => r.id)),
    regions: regionData.registry.regions,
  } : undefined;
  const applyState = (next: SimulationState) => { clock.current = new SimulationClock(next); menuPauseRef.current = undefined; setSim(clock.current.snapshot()); };
  const dataReady = Boolean(world && countryData && regionData && populationData && economicData);
  // Opening/cancelling the wizard never initializes or replaces the active campaign.
  const startNewGame = () => {
    if (!countryData || !newGameSelectionRef.current) return;
    setLoadPreview(undefined);setNewGameDraft(initialNewGameDraft(countryData.registry.countries));
    setScreen('new-game');
  };
  const confirmNewGame = (countryId:string,path:PoliticalStartPath,personId:string) => {
    if (!newGameBaseRef.current || !newGameSeedRef.current) throw new Error('Les données de départ sont indisponibles.');
    requestDestructive('commencer une nouvelle campagne',()=>{
    if(!newGameBaseRef.current || !newGameSeedRef.current)return;
    const next=createConfirmedCampaign(newGameBaseRef.current,newGameSeedRef.current,{countryId,path,personId});
    next.speed=settings.gameplay.defaultSpeed as 1|2|5;
    setSelected(undefined);setSelectedRegion(undefined);setActivePage('overview');setMapLayer('ownership');
    setSaveError(undefined);setMenuSelection(undefined);setPauseOpen(false);
    integrity.current.begin(false);applyState(next);setScreen('game');
    });
  };
  // Opening the pause menu, or leaving the game view entirely, genuinely
  // suspends progression: the shared clock is paused and never advances while a
  // menu is shown.
  useEffect(() => {
    const inGame = screen === 'game' && !pauseOpen && !pendingDestructive && !savePrompt;
    if (!inGame) {
      if (menuPauseRef.current === undefined) menuPauseRef.current = clock.current.snapshot().paused;
      if (!clock.current.snapshot().paused) {
        clock.current.setPaused(true);
        setSim(clock.current.snapshot());
      }
    } else if (menuPauseRef.current !== undefined) {
      const restore = menuPauseRef.current;
      menuPauseRef.current = undefined;
      if (!restore) {
        clock.current.setPaused(false);
        setSim(clock.current.snapshot());
      }
    }
  }, [screen, pauseOpen,pendingDestructive,savePrompt]);
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
      const current=clock.current.snapshot();
      const personId=current.governance.player.controlledPersonId;
      const person=personId?current.governance.persons[personId]:undefined;
      if(!person || current.paused){inFlight=false;return;}
      const checkpoint=integrity.current.checkpoint();
      const {registryContext:context,world:currentWorld}=snapshot;
      const country = person.countryId ? currentWorld?.countries.get(person.countryId) : undefined;
      let json:string;try{json=serializeSimulationState(current,context);}catch(error){setSaveError(String(error));inFlight=false;return;}
      saveGame('__autosave__', 'Autosave', json, {
        countryId: person.countryId,
        countryName: country?.commonName ?? '—',
        controlledPersonName: person.displayName ?? '—',
        office: person.office?.role ?? null,
        simulationDate: current.date,
        schemaVersion: current.schemaVersion,
      })
        .then(() => {integrity.current.acknowledge(checkpoint,'__autosave__');setSaves(listSaves());})
        .catch((error) => setSaveError(`Autosave failed: ${error instanceof Error ? error.message : String(error)}`))
        .finally(() => { inFlight = false; });
    }, intervalMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [settings.gameplay.autosave, settings.gameplay.autosaveIntervalMinutes, storageReady]);
  const previewSlot = (id:string):SimulationState => {
    if(!registryContext)throw new Error('Données du registre indisponibles.');
    const json=loadSave(id);
    if(!json)throw new Error('Cette sauvegarde ne peut pas être lue.');
    // Detached migration/invariant validation only: no applyState, clock or storage writes.
    return restoreSimulationState(json,registryContext.regions,{}, {},registryContext);
  };
  const loadSlot = (id: string) => {
    if (!registryContext) return;
    requestDestructive('charger une autre sauvegarde',()=>{
    try {
      const restored=previewSlot(id);integrity.current.begin(true,id);applyState(restored);
      setLoadSlotError(undefined);
      setMenuSelection(undefined);setLoadPreview(undefined);
      setScreen('game');
    } catch (error) {
      setLoadSlotError(error instanceof Error ? `Could not load save: ${error.message}` : 'Could not load save.');
    }
    });
  };
  const continueGame = () => {if(integrity.current.exists){setPauseOpen(false);setScreen('game');}};
  const loadLatest = () => { const recent=mostRecentSave();if(recent)loadSlot(recent.id); };
  const saveCurrent = async (name: string): Promise<boolean> => {
    if (!registryContext) return false;
    if (!storageReady) { setSaveError('Storage is still initializing — please wait a moment and try again.'); return false; }
    const country = ctrlPerson?.countryId ? world?.countries.get(ctrlPerson.countryId) : undefined;
    const checkpoint=integrity.current.checkpoint();
    const savedSnapshot=clock.current.snapshot();
    try {
      const json=serializeSimulationState(savedSnapshot,registryContext);
      await saveGame(saveIdFor(name), name, json, {
        countryId: ctrlPerson?.countryId ?? '',
        countryName: country?.commonName ?? '—',
        controlledPersonName: ctrlPerson?.displayName ?? '—',
        office: ctrlPerson?.office?.role ?? null,
        simulationDate: sim.date,
        schemaVersion: sim.schemaVersion,
      });
      integrity.current.acknowledge(checkpoint,saveIdFor(name));setSaves(listSaves());
      setSaveError(undefined);
      return true;
    } catch (error) {
      setSaveError(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
  const exitApp = () => requestDestructive('quitter ProjectAtlas',async()=>{await exitApplication();});
  closeAction.current=exitApp;
  const renderScreen=()=>{
  if (screen === 'settings') return <SettingsMenu ready={storageReady} settings={settings} onChange={persistSettings} onBack={returnFromAuxiliary} error={settingsError??storageError} displayError={displayError} displayBusy={displayBusy} onRetryDisplay={()=>{if(failedDisplayMode.current)requestDisplay(failedDisplayMode.current);}} />;
  if (screen === 'load') return storageReady
    ? <SaveManager onLoad={loadSlot} onPreview={previewSlot} onBack={() => { setLoadSlotError(undefined);setLoadPreview(undefined); setScreen(loadOrigin.current); }} selectedPreview={loadPreview} onSelectionChange={setLoadPreview} onDeleted={id=>{integrity.current.removedSave(id);setSaves(listSaves());}} error={loadSlotError ?? storageError} territories={world?.territories} regions={regionData} countries={countryData?.registry.countries} uiScale={settings.graphics.uiScale} reducedMotion={settings.accessibility.reducedMotion} onNewGame={startNewGame} onSettings={()=>openAuxiliary('settings')} onCredits={()=>openAuxiliary('credits')} onExit={exitApp} />
    : <main className="load-state"><h1>{storageState === 'error' ? 'Save storage unavailable' : 'Storage initializing'}</h1><p>{storageState === 'error' ? (storageError ?? 'Local save storage could not be read.') : 'Local save storage is still being prepared. Please wait a moment.'}</p><button onClick={returnFromAuxiliary}>← Back</button></main>;
  if(screen==='credits')return <CreditsMenu onBack={returnFromAuxiliary}/>;
  if (screen === 'menu') {
    // Re-read the existing metadata index on return from SaveManager: its delete
    // action may have changed storage independently of the in-game save prompt.
    const menuSaves = storageReady ? listSaves() : [];
    return <MainMenu hasSession={integrity.current.exists} sessionDescription={integrity.current.exists?((world?.countries.get(ctrlPerson?.countryId??'')?.commonName??'Session active')+' — '+sim.date+(integrity.current.dirty?' · non sauvegardée':'')):undefined} onLoadLatest={loadLatest} hasSave={menuSaves.length > 0} saves={menuSaves} storageStatus={storageState} error={loadSlotError ?? settingsError ?? displayError ?? storageError ?? loadError} onSelectSave={selectMenuSave} selectedSaveId={menuSelection?.id} summary={menuSelection?.summary} onLoadSave={loadSlot} ready={dataReady && storageReady} onContinue={continueGame} onNewGame={startNewGame} onLoad={() => openAuxiliary('load')} onSettings={() => openAuxiliary('settings')} onCredits={() => openAuxiliary('credits')} onExit={exitApp} settings={settings} />;
  }
  if (screen === 'new-game' && countryData && world && newGameSelectionRef.current) return <NewGameSetup data={countryData} territories={world.territories} selectionState={newGameSelectionRef.current} draft={newGameDraft} onDraftChange={setNewGameDraft} onConfirm={confirmNewGame} onBack={()=>setScreen('menu')} onLoad={()=>openAuxiliary('load')} onSettings={()=>openAuxiliary('settings')} onCredits={()=>openAuxiliary('credits')} onExit={exitApp} uiScale={settings.graphics.uiScale} reducedMotion={settings.accessibility.reducedMotion} />;
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
    if(next!==sim)integrity.current.changed();
    clock.current.replaceState(next);
    setSim(clock.current.snapshot());
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
          <small>Version {import.meta.env.VITE_APP_VERSION ?? 'alpha (pre-release)'}</small>
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
                key={`world-${mapLayer}`}
                data={collection}
                style={(f) => ({
                  color: "#202c32",
                  weight: 1.05,
                  fillColor: territoryLayerColour(mapLayer, f?.properties?.regionIds ?? [], f?.properties?.navigationCountryId, sim),
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
                key={`${selected}-${selectedRegion ?? "none"}-${mapLayer}-${mapZoom >= 5 ? "near" : "far"}`}
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
            <p className="layer-legend" role="note">{LAYER_LEGEND[mapLayer]}</p>
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
          <aside className="panel"><OperationsPanel state={sim} countryId={playerCountryId} personId={controlledPerson.id} onStateChange={commitCommand} regionsById={regionData.regionsById} /></aside>
        ) : activePage === 'treaties' && controlledPerson && playerCountryId ? (
          <aside className="panel"><MultilateralPanel state={sim} countryId={playerCountryId} personId={controlledPerson.id} onStateChange={commitCommand} /></aside>
        ) : activePage === 'trade' && controlledPerson && playerCountryId ? (
          <aside className="panel"><TradeInspection state={sim} countryId={playerCountryId} personId={controlledPerson.id} onStateChange={commitCommand} /></aside>
        ) : activePage === 'economy' ? (
          <aside className="panel"><h2>Economic information</h2>
            {playerCanReadGovernment && playerCountryId && controlledPerson ? <>
              {inspectGovernmentReports(sim, playerCountryId, controlledPerson.id).map(report => <section key={report.id}><strong>Labour report · {report.asOfDate}</strong><p>{report.valueBps === undefined ? 'Unavailable' : `Unemployment ${(report.valueBps / 100).toFixed(2)}%`}</p><small>{report.coverage} · {report.limitation}</small></section>)}
              <EconomyPanel state={sim} countryId={playerCountryId} personId={controlledPerson.id} regionsById={regionData.regionsById} />
            </> : <p>Current internal economic reports are not available to an opposition person. No public unemployment report is currently implemented.</p>}
          </aside>
        ) : activePage === 'politics' ? (
          <aside className="panel"><h2>Public political institutions</h2>
            {selected ? <><p>{politicalRegistry.countries[selected]?.coverage.legislature ?? 'unavailable'} legislative coverage.</p>{politicalRegistry.countries[selected]?.partyIds.map(id => politicalRegistry.parties[id]).sort((a, b) => a.displayName.localeCompare(b.displayName)).map(party => <section key={party.id}><strong>{party.displayName}</strong><p>{party.governmentStatus === 'government' ? 'Government bloc' : party.governmentStatus === 'opposition' ? 'Opposition' : 'Government position unavailable'} · {party.currentSeats === null ? 'seat count unavailable' : `${party.currentSeats} seats`}</p><small>Fictional gameplay party · ideology basis {party.ideologicalBasis.status}</small></section>)}</> : <p>Select a Country on the map to inspect public political information.</p>}
            {controlledPerson && playerCountryId && selected === playerCountryId && <ParliamentPanel state={sim} countryId={playerCountryId} personId={controlledPerson.id} onStateChange={commitCommand} />}
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
            showProvenance={settings.interface.showProvenance}
          />
        ) : activePage === 'overview' ? (
          <CountryPanel
            country={selectedCountry}
            factsRecord={selected ? countryData?.factsByCountryId.get(selected) : undefined}
            officeholders={selected ? countryData?.officeholdersByCountryId.get(selected) : undefined}
            nationalPopulation={selected ? populationData.nationalByCountryId.get(selected) : undefined}
            showProvenance={settings.interface.showProvenance}
          />
        ) : activePage === 'security' && selected ? (
          <aside className="panel"><h2>Security</h2>
            <SecurityPanel state={sim} countryId={selected} personId={selected === playerCountryId ? controlledPerson?.id : undefined} onStateChange={commitCommand} />
            {sim.wars.filter(war => war.status === 'active' && (war.attackerCountryId === selected || war.defenderCountryId === selected)).length > 0 && <p>This Country is party to an active war.</p>}
            {playerCanReadGovernment && selected === playerCountryId
              ? (() => { const episodes = Object.values(sim.crisis.countries[selected]?.currentByType ?? {}).filter(episode => episode.activatedOn && !episode.endedOn); return episodes.length > 0 ? <section><strong>Active crises</strong>{episodes.map(episode => <p key={episode.id}>{episode.type}: {episode.severity} (pressure {episode.currentPressure})</p>)}</section> : <p>No active crises are recorded for this Country.</p>; })()
              : <p>Crisis severity and pressure are internal government assessments, not public information.</p>}
            <p>Emergency powers require an active crisis and the executive office. Further security systems are not represented in the current build.</p>
          </aside>
        ) : activePage === 'diplomacy' && controlledPerson && playerCountryId ? (
          <aside className="panel"><DiplomacyPanel state={sim} countryId={playerCountryId} personId={controlledPerson.id} onStateChange={commitCommand} countriesById={world.countries} /></aside>
        ) : activePage === 'services' && selected ? (
          <aside className="panel"><h2>Public services</h2>
            {playerCanReadGovernment && selected === playerCountryId
              ? (() => { const fiscal = sim.fiscal.countries[selected]; return fiscal ? <section><strong>Annual budget allocations (USD)</strong>{(['health', 'education', 'pensions', 'incomeSupport', 'infrastructure'] as const).map(cat => <p key={cat}>{cat}: {fiscal.annualBudget[cat]}</p>)}</section> : <p>Fiscal service data is unavailable for this Country.</p>; })()
              : <p>Annual budget allocations are government information, not public.</p>}
            <p>Service delivery backlogs are reported through the fiscal engine where available.</p>
          </aside>
        ) : <aside className="panel"><h2>{navItems.find(([id]) => id === activePage)?.[1]}</h2><p>This system is not represented in the current ProjectAtlas build. ProjectAtlas does not fabricate placeholder capability values or actions.</p></aside>}
      </div>
      {pauseOpen && <MenuDialog title="Pause" label="Pause menu" onCancel={()=>setPauseOpen(false)}>
        <p>{integrity.current.dirty?'Session active — progression non sauvegardée.':'Session active — point de sauvegarde conservé.'}</p>
        <button onClick={()=>setPauseOpen(false)}>Resume</button>
        <button onClick={()=>setSavePrompt({mode:'save',name:ctrlPerson?.displayName??'ProjectAtlas'})}>Save</button>
        <button onClick={()=>setSavePrompt({mode:'saveAs',name:''})}>Save As</button>
        <button onClick={()=>{setPauseOpen(false);openAuxiliary('load');}}>Load Game</button>
        <button onClick={()=>{setPauseOpen(false);openAuxiliary('settings');}}>Settings</button>
        <button onClick={()=>{setPauseOpen(false);openAuxiliary('credits');}}>Crédits</button>
        <button onClick={()=>{setPauseOpen(false);setScreen('menu');}}>Return to Main Menu</button>
        <button className="danger" onClick={exitApp}>Exit Game</button>
      </MenuDialog>}
      {savePrompt && <MenuDialog title={savePrompt.mode==='saveAs'?'Save As':'Save Game'} label="Save game" onCancel={()=>{if(!saveBusy)setSavePrompt(null);}}>
            <input value={savePrompt.name} onChange={e => { setSavePrompt({ ...savePrompt, name: e.target.value }); setConfirmOverwrite(false); }} placeholder="Save name" autoFocus />
            <button disabled={!storageReady || saveBusy} onClick={async () => {
              const name = savePrompt.name || 'ProjectAtlas';
              const targetId = saveIdFor(name);
              const exists = listSaves().some(save => save.id === targetId);
              if (exists && !confirmOverwrite) { setConfirmOverwrite(true); return; }
              setSaveBusy(true);try{if (await saveCurrent(name)) { setSavePrompt(null); setPauseOpen(false); setConfirmOverwrite(false); }}finally{setSaveBusy(false);}
            }}>{confirmOverwrite ? 'Overwrite existing save' : 'Save'}</button>
            <button disabled={saveBusy} onClick={() => { setSavePrompt(null); setSaveError(undefined); setConfirmOverwrite(false); }}>Cancel</button>
            {confirmOverwrite && !saveError && <p className="save-error">A save with this name already exists. Overwrite it?</p>}
            {(saveError || storageError) && <p className="save-error">{saveError ?? storageError}</p>}
      </MenuDialog>}

    </main>
  );
  };
  return <><div className="app-screen app-screen-enter" data-screen={screen} key={screen}>{renderScreen()}</div>
    {guardError && !pendingDestructive && <div className="menu-global-error menu-error" role="alert">{guardError}<button onClick={()=>setGuardError(undefined)}>Fermer</button></div>}
    {pendingDestructive && <MenuDialog title="Progression non sauvegardée" label="Confirmer l’abandon de progression" onCancel={()=>{if(!guardBusy)setPendingDestructive(undefined);}}>
      <p>Cette action va {pendingDestructive.label} et abandonner la progression non sauvegardée de la session active.</p>
      <p>Annulez pour reprendre et sauvegarder cette session avant de continuer.</p>
      <button disabled={guardBusy} onClick={()=>setPendingDestructive(undefined)}>Annuler et conserver la session</button>
      <button className="danger" disabled={guardBusy} onClick={async()=>{setGuardBusy(true);try{await pendingDestructive.action();setPendingDestructive(undefined);}catch(error){setGuardError(String(error));}finally{setGuardBusy(false);}}}>Abandonner la progression et continuer</button>
      {guardError && <p role="alert" className="menu-error">{guardError}</p>}
    </MenuDialog>}
  </>;

}
