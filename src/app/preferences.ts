// Application preferences: presentation/desktop settings kept OUTSIDE the canonical
// SimulationState. The desktop release uses the Tauri backend; the browser build uses
// localStorage. Both implement the same narrow StorageBackend interface.
//
// Writes are Promise-returning so callers can observe the actual storage outcome.
// The browser backend rejects on quota/unavailability instead of silently
// discarding the failure.

export type DisplayMode = 'windowed' | 'borderless' | 'fullscreen';

export interface AppSettings {
  version: 1;
  graphics: {
    displayMode: DisplayMode;
    uiScale: number; // 0.75 .. 1.5
  };
  audio: {
    masterVolume: number; // 0..1
    musicVolume: number;
    interfaceVolume: number;
    notificationVolume: number;
    muteWhenUnfocused: boolean;
  };
  interface: {
    tooltipDelayMs: number;
    confirmHighImpact: boolean;
    showProvenance: boolean;
    mapLabelDensity: 'sparse' | 'normal' | 'dense';
  };
  gameplay: {
    defaultSpeed: number;
    pauseOnUrgent: boolean;
    autosave: boolean;
    autosaveIntervalMinutes: number;
  };
  accessibility: {
    uiScale: number;
    highContrast: boolean;
    reducedMotion: boolean;
    notificationDurationMs: number;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  graphics: { displayMode: 'windowed', uiScale: 1 },
  audio: { masterVolume: 1, musicVolume: 0.7, interfaceVolume: 0.8, notificationVolume: 0.9, muteWhenUnfocused: false },
  interface: { tooltipDelayMs: 350, confirmHighImpact: true, showProvenance: false, mapLabelDensity: 'normal' },
  gameplay: { defaultSpeed: 1, pauseOnUrgent: true, autosave: true, autosaveIntervalMinutes: 15 },
  accessibility: { uiScale: 1, highContrast: false, reducedMotion: false, notificationDurationMs: 6000 },
};

export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

function settingsStorageError(action: string, error: unknown): Error {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return new Error(`Settings storage is full or unavailable while ${action} (${detail}).`);
}

function browserBackend(): StorageBackend {
  if (typeof localStorage === 'undefined') {
    return { get: () => null, set: async () => {}, remove: async () => {} };
  }
  return {
    get: (key) => localStorage.getItem(key),
    set: async (key, value) => {
      try { localStorage.setItem(key, value); }
      catch (error) { throw settingsStorageError('saving settings', error); }
    },
    remove: async (key) => {
      try { localStorage.removeItem(key); }
      catch (error) { throw settingsStorageError('clearing settings', error); }
    },
  };
}

let backend: StorageBackend = browserBackend();
const SETTINGS_KEY = 'projectatlas.settings.v1';

/** Desktop adapter swaps this in at startup. */
export function setSettingsBackend(next: StorageBackend): void { backend = next; }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeSettings(raw: unknown): AppSettings {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as Partial<AppSettings>;
  const merged: AppSettings = {
    version: 1,
    graphics: { ...base.graphics, ...(input.graphics ?? {}) },
    audio: { ...base.audio, ...(input.audio ?? {}) },
    interface: { ...base.interface, ...(input.interface ?? {}) },
    gameplay: { ...base.gameplay, ...(input.gameplay ?? {}) },
    accessibility: { ...base.accessibility, ...(input.accessibility ?? {}) },
  };
  merged.audio.masterVolume = clamp(Number(merged.audio.masterVolume) || 0, 0, 1);
  merged.audio.musicVolume = clamp(Number(merged.audio.musicVolume) || 0, 0, 1);
  merged.audio.interfaceVolume = clamp(Number(merged.audio.interfaceVolume) || 0, 0, 1);
  merged.audio.notificationVolume = clamp(Number(merged.audio.notificationVolume) || 0, 0, 1);
  merged.graphics.uiScale = clamp(Number(merged.graphics.uiScale) || 1, 0.75, 1.5);
  merged.accessibility.uiScale = clamp(Number(merged.accessibility.uiScale) || 1, 0.75, 1.5);
  // Keep legacy v1 fields readable while exposing one effective scale.
  const scale = merged.accessibility.uiScale>1?Math.max(merged.graphics.uiScale,merged.accessibility.uiScale):merged.graphics.uiScale;
  merged.graphics.uiScale=scale;merged.accessibility.uiScale=scale;
  if(!['windowed','borderless','fullscreen'].includes(merged.graphics.displayMode))merged.graphics.displayMode='windowed';
  merged.gameplay.defaultSpeed=[1,2,5].includes(Number(merged.gameplay.defaultSpeed))?Number(merged.gameplay.defaultSpeed):1;
  merged.gameplay.autosaveIntervalMinutes=[5,10,15,30].includes(Number(merged.gameplay.autosaveIntervalMinutes))?Number(merged.gameplay.autosaveIntervalMinutes):15;
  for(const key of ['pauseOnUrgent','autosave'] as const)if(typeof merged.gameplay[key]!=='boolean')merged.gameplay[key]=base.gameplay[key];
  for(const key of ['highContrast','reducedMotion'] as const)if(typeof merged.accessibility[key]!=='boolean')merged.accessibility[key]=base.accessibility[key];
  if(typeof merged.interface.showProvenance!=='boolean')merged.interface.showProvenance=base.interface.showProvenance;
  if(typeof merged.audio.muteWhenUnfocused!=='boolean')merged.audio.muteWhenUnfocused=false;
  if(typeof merged.interface.confirmHighImpact!=='boolean')merged.interface.confirmHighImpact=true;
  if(!['sparse','normal','dense'].includes(merged.interface.mapLabelDensity))merged.interface.mapLabelDensity='normal';
  merged.interface.tooltipDelayMs=clamp(Number(merged.interface.tooltipDelayMs)||350,0,2000);
  if(![3000,6000,10000].includes(Number(merged.accessibility.notificationDurationMs)))merged.accessibility.notificationDurationMs=6000;
  return merged;
}

export function loadSettings(): AppSettings {
  try {
    const raw = backend.get(SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : structuredClone(DEFAULT_SETTINGS);
  } catch { return structuredClone(DEFAULT_SETTINGS); }
}

/** Persists settings. Resolves only after the medium accepted the write; rejects on failure. */
export function saveSettings(settings: AppSettings): Promise<void> {
  return backend.set(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
}

export function applyUiScale(settings: AppSettings): void {
  document.documentElement.style.setProperty('--ui-scale', String(normalizeSettings(settings).graphics.uiScale));
  document.documentElement.classList.toggle('high-contrast', settings.accessibility.highContrast);
  document.documentElement.classList.toggle('reduced-motion', settings.accessibility.reducedMotion || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
}
