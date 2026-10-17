// Native desktop adapter. Wires the application-persistence and lifecycle layer to the
// Tauri backend when running inside the packaged desktop app, and leaves the browser
// localStorage backends in place for `npm run dev` and tests. The simulation core never
// imports this module.
//
// Native writes are serialized per medium so an older queued write can never overwrite
// a newer one, and each write resolves only after the native command has accepted the
// data. `flushPersistence()` lets `exitApplication()` wait for in-flight writes before
// the process exits, so "save then immediately exit" cannot drop a write.

import { setSettingsBackend, type StorageBackend } from './preferences';
import { setSaveBackend, type SaveBackend } from './saveStorage';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

type InvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function defaultInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return import('@tauri-apps/api/core').then(({ invoke }) => invoke<T>(command, args));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface DesktopBackendInit {
  native: boolean;
  error?: string;
}

/**
 * Builds the native settings/save backends around an injectable `invoke`. Kept as a
 * pure factory (no Tauri import at module load) so tests can drive it with a mock and
 * exercise delayed initialization, write rejection and write ordering.
 */
export function createDesktopBackends(invokeFn: InvokeFn = defaultInvoke) {
  const settingsCache = new Map<string, string>();
  const saveCache = new Map<string, string>();
  const initErrors: string[] = [];

  let settingsChain: Promise<void> = Promise.resolve();
  let saveChain: Promise<void> = Promise.resolve();

  // Serialize an operation onto a chain. The chain itself is kept alive (never
  // rejects) so a failed write does not block the writes queued after it; the
  // returned promise carries the operation's own success/failure to its caller.
  const enqueueSettings = (op: () => Promise<void>): Promise<void> => {
    const result = settingsChain.then(op, op);
    settingsChain = result.then(() => undefined, () => undefined);
    return result;
  };
  const enqueueSave = (op: () => Promise<void>): Promise<void> => {
    const result = saveChain.then(op, op);
    saveChain = result.then(() => undefined, () => undefined);
    return result;
  };

  const settingsBackend: StorageBackend = {
    get: (key) => settingsCache.get(key) ?? null,
    set: (key, value) => enqueueSettings(async () => {
      settingsCache.set(key, value);
      await invokeFn('settings_write', { json: JSON.stringify(Object.fromEntries(settingsCache)) });
    }),
    remove: (key) => enqueueSettings(async () => {
      settingsCache.delete(key);
      await invokeFn('settings_write', { json: JSON.stringify(Object.fromEntries(settingsCache)) });
    }),
  };

  const saveBackend: SaveBackend = {
    list: () => [...saveCache.keys()],
    read: (id) => saveCache.get(id) ?? null,
    write: (id, data) => enqueueSave(async () => {
      await invokeFn('save_file_write', { id, data });
      saveCache.set(id, data);
    }),
    remove: (id) => enqueueSave(async () => {
      await invokeFn('save_file_delete', { id });
      saveCache.delete(id);
    }),
  };

  return {
    installBackends(): void {
      setSettingsBackend(settingsBackend);
      setSaveBackend(saveBackend);
    },
    async init(): Promise<DesktopBackendInit> {
      try {
        const raw = await invokeFn<string | null>('settings_read');
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, string>;
          for (const [key, value] of Object.entries(parsed)) settingsCache.set(key, value);
        }
      } catch (error) {
        initErrors.push(`settings_read: ${message(error)}`);
      }
      try {
        const ids = await invokeFn<string[]>('save_file_list');
        for (const id of ids) {
          try {
            const data = await invokeFn<string | null>('save_file_read', { id });
            if (data !== null) saveCache.set(id, data);
          } catch (error) {
            initErrors.push(`save_file_read(${id}): ${message(error)}`);
          }
        }
      } catch (error) {
        initErrors.push(`save_file_list: ${message(error)}`);
      }
      return { native: true, error: initErrors.length ? initErrors.join('; ') : undefined };
    },
    async flush(): Promise<void> {
      await Promise.allSettled([settingsChain, saveChain]);
    },
  };
}

let activeDesktop: ReturnType<typeof createDesktopBackends> | undefined;

/** Swaps the settings/save backends to the native Tauri implementation. Returns true if native. */
export async function initDesktopBackends(): Promise<DesktopBackendInit> {
  if (!isTauri()) return { native: false };
  const backends = createDesktopBackends();
  activeDesktop = backends;
  backends.installBackends();
  return backends.init();
}

/** Waits for any in-flight native write to settle before the app exits. */
export async function flushPersistence(): Promise<void> {
  await activeDesktop?.flush();
}

/** Applies the native window display mode. No-op in the browser build. */
export async function applyNativeDisplayMode(mode: 'windowed' | 'borderless' | 'fullscreen'): Promise<void> {
  if (!isTauri()) return;
  try { await defaultInvoke('set_display_mode', { mode }); } catch { /* unsupported on this platform */ }
}

/** Closes the native application. Falls back to window.close() in the browser. */
export async function exitApplication(): Promise<void> {
  if (isTauri()) {
    try {
      await flushPersistence();
      await defaultInvoke('exit_app');
      return;
    } catch { /* fall through */ }
  }
  try { window.close(); } catch { /* blocked */ }
}
