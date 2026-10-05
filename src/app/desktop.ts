// Native desktop adapter. Wires the application-persistence and lifecycle layer to the
// Tauri backend when running inside the packaged desktop app, and leaves the browser
// localStorage backends in place for `npm run dev` and tests. The simulation core never
// imports this module.

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** Swaps the settings/save backends to the native Tauri implementation. Returns true if native. */
export async function initDesktopBackends(): Promise<boolean> {
  if (!isTauri()) return false;
  const { setSettingsBackend } = await import('./preferences');
  const { setSaveBackend } = await import('./saveStorage');

  const settingsCache = new Map<string, string>();
  try {
    const raw = await invoke<string | null>('settings_read');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const [key, value] of Object.entries(parsed)) settingsCache.set(key, value);
    }
  } catch { /* fresh settings */ }

  const persistSettings = () => {
    void invoke('settings_write', { json: JSON.stringify(Object.fromEntries(settingsCache)) }).catch(() => {});
  };
  setSettingsBackend({
    get: (key) => settingsCache.get(key) ?? null,
    set: (key, value) => { settingsCache.set(key, value); persistSettings(); },
    remove: (key) => { settingsCache.delete(key); persistSettings(); },
  });

  const saveCache = new Map<string, string>();
  try {
    for (const id of await invoke<string[]>('save_file_list')) {
      const data = await invoke<string | null>('save_file_read', { id });
      if (data !== null) saveCache.set(id, data);
    }
  } catch { /* empty saves */ }
  setSaveBackend({
    list: () => [...saveCache.keys()],
    read: (id) => saveCache.get(id) ?? null,
    write: (id, data) => { saveCache.set(id, data); void invoke('save_file_write', { id, data }).catch(() => {}); },
    remove: (id) => { saveCache.delete(id); void invoke('save_file_delete', { id }).catch(() => {}); },
  });

  return true;
}

/** Applies the native window display mode. No-op in the browser build. */
export async function applyNativeDisplayMode(mode: 'windowed' | 'borderless' | 'fullscreen'): Promise<void> {
  if (!isTauri()) return;
  try { await invoke('set_display_mode', { mode }); } catch { /* unsupported on this platform */ }
}

/** Closes the native application. Falls back to window.close() in the browser. */
export async function exitApplication(): Promise<void> {
  if (isTauri()) {
    try { await invoke('exit_app'); return; } catch { /* fall through */ }
  }
  try { window.close(); } catch { /* blocked */ }
}
