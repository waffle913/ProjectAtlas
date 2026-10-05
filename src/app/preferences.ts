// Application preferences: presentation/desktop settings kept OUTSIDE the canonical
// SimulationState. The desktop release uses the Tauri backend; the browser build uses
// localStorage. Both implement the same narrow StorageBackend interface.

export type DisplayMode = 'windowed' | 'borderless' | 'fullscreen';
export type MapQuality = 'low' | 'medium' | 'high';

export interface AppSettings {
  version: 1;
  graphics: {
    displayMode: DisplayMode;
    resolution: { width: number; height: number } | null;
    vsync: boolean;
    uiScale: number; // 0.75 .. 1.5
    mapQuality: MapQuality;
    frameRateLimit: number | null;
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
  graphics: { displayMode: 'windowed', resolution: null, vsync: true, uiScale: 1, mapQuality: 'high', frameRateLimit: null },
  audio: { masterVolume: 1, musicVolume: 0.7, interfaceVolume: 0.8, notificationVolume: 0.9, muteWhenUnfocused: false },
  interface: { tooltipDelayMs: 350, confirmHighImpact: true, showProvenance: false, mapLabelDensity: 'normal' },
  gameplay: { defaultSpeed: 1, pauseOnUrgent: true, autosave: true, autosaveIntervalMinutes: 15 },
  accessibility: { uiScale: 1, highContrast: false, reducedMotion: false, notificationDurationMs: 6000 },
};

export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

function browserBackend(): StorageBackend {
  if (typeof localStorage === 'undefined') return { get: () => null, set: () => {}, remove: () => {} };
  return {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage full/unavailable */ } },
    remove: (key) => localStorage.removeItem(key),
  };
}

let backend: StorageBackend = browserBackend();
const SETTINGS_KEY = 'projectatlas.settings.v1';

/** Desktop adapter swaps this in at startup. */
export function setSettingsBackend(next: StorageBackend): void { backend = next; }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function sanitize(raw: unknown): AppSettings {
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
  merged.gameplay.defaultSpeed = clamp(Number(merged.gameplay.defaultSpeed) || 1, 1, 3);
  return merged;
}

export function loadSettings(): AppSettings {
  const raw = backend.get(SETTINGS_KEY);
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  try { return sanitize(JSON.parse(raw)); } catch { return structuredClone(DEFAULT_SETTINGS); }
}

export function saveSettings(settings: AppSettings): void {
  backend.set(SETTINGS_KEY, JSON.stringify(settings));
}

export function applyUiScale(settings: AppSettings): void {
  document.documentElement.style.setProperty('--ui-scale', String(settings.graphics.uiScale));
  document.documentElement.classList.toggle('high-contrast', settings.accessibility.highContrast);
  document.documentElement.classList.toggle('reduced-motion', settings.accessibility.reducedMotion);
}
