import { beforeEach, describe, expect, it } from 'vitest';
import { createDesktopBackends } from '../desktop';
import { deleteSave, listSaves, loadSave, renameSave, saveGame, setSaveBackend, type SaveBackend } from '../saveStorage';

const META = { countryId: 'c1', countryName: 'Country', controlledPersonName: 'Person', office: null, simulationDate: '2026-01-01', schemaVersion: 20 };

function browserMemory(): SaveBackend {
  const map = new Map<string, string>();
  return {
    list: () => [...map.keys()],
    read: (id) => map.get(id) ?? null,
    write: async (id, data) => { map.set(id, data); },
    remove: async (id) => { map.delete(id); },
  };
}

type Disk = Map<string, string>;

/** A controllable native-invoke mock. `failures` lets a test flip write rejection on/off mid-test. */
function makeNativeInvoke(disk: Disk, failures: { write: boolean; writeDelayFor?: (id: string) => number }) {
  return async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const id = args && 'id' in args ? String(args.id) : '';
    if (command === 'save_file_write') {
      const delay = failures.writeDelayFor?.(id) ?? 0;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (failures.write && id !== '__index__') throw new Error('disk full');
      disk.set(id, args && 'data' in args ? String(args.data) : '');
      return undefined as unknown as T;
    }
    if (command === 'save_file_list') return [...disk.keys()] as unknown as T;
    if (command === 'save_file_read') return (disk.get(id) ?? null) as unknown as T;
    if (command === 'save_file_delete') { disk.delete(id); return undefined as unknown as T; }
    if (command === 'settings_read') return null as unknown as T;
    if (command === 'settings_write') return undefined as unknown as T;
    return undefined as unknown as T;
  };
}

describe('save reliability', () => {
  beforeEach(() => { setSaveBackend(browserMemory()); });

  it('rejects a failed save write and never reports success', async () => {
    const failing: SaveBackend = {
      list: () => [],
      read: () => null,
      write: async () => { throw new Error('disk full'); },
      remove: async () => {},
    };
    setSaveBackend(failing);
    await expect(saveGame('slot.one', 'S', '{}', META)).rejects.toThrow(/disk full/);
    expect(listSaves()).toHaveLength(0);
  });

  it('surfaces an index-write failure while preserving the already-written save data', async () => {
    const stored = new Map<string, string>();
    const indexFailing: SaveBackend = {
      list: () => [...stored.keys()],
      read: (id) => stored.get(id) ?? null,
      write: async (id, data) => { if (id === '__index__') throw new Error('index disk full'); stored.set(id, data); },
      remove: async (id) => { stored.delete(id); },
    };
    setSaveBackend(indexFailing);
    await expect(saveGame('slot.one', 'S', '{"schemaVersion":20}', META)).rejects.toThrow(/index could not be updated/);
    // Data is durable; only the index update failed.
    expect(loadSave('slot.one')).toBe('{"schemaVersion":20}');
    expect(listSaves()).toHaveLength(0);
  });

  it('preserves schema-20 and legacy schema-18 payloads byte-for-byte on round-trip', async () => {
    const schema20 = '{"schemaVersion":20,"date":"2026-01-01"}';
    const schema18 = '{"schemaVersion":18,"legacy":true}';
    await saveGame('slot.s20', 'S20', schema20, { ...META, schemaVersion: 20 });
    await saveGame('slot.s18', 'S18', schema18, { ...META, schemaVersion: 18 });
    expect(loadSave('slot.s20')).toBe(schema20);
    expect(loadSave('slot.s18')).toBe(schema18);
    expect(listSaves().map(entry => entry.id).sort()).toEqual(['slot.s18', 'slot.s20']);
  });

  it('serializes rapid native saves so the newest data wins and both saves stay indexed', async () => {
    const disk = new Map<string, string>();
    let active = 0;
    let maxActive = 0;
    const invoke = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
      const id = args && 'id' in args ? String(args.id) : '';
      if (command === 'save_file_write') {
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          if (id === 'a') await new Promise(resolve => setTimeout(resolve, 15));
          disk.set(id, args && 'data' in args ? String(args.data) : '');
        } finally { active -= 1; }
        return undefined as unknown as T;
      }
      if (command === 'save_file_list') return [...disk.keys()] as unknown as T;
      if (command === 'save_file_read') return (disk.get(id) ?? null) as unknown as T;
      if (command === 'save_file_delete') { disk.delete(id); return undefined as unknown as T; }
      if (command === 'settings_read') return null as unknown as T;
      if (command === 'settings_write') return undefined as unknown as T;
      return undefined as unknown as T;
    };
    const backends = createDesktopBackends(invoke);
    backends.installBackends();
    await backends.init();

    await Promise.all([saveGame('a', 'A', 'DATA-A', META), saveGame('b', 'B', 'DATA-B', META)]);
    expect(disk.get('a')).toBe('DATA-A');
    expect(disk.get('b')).toBe('DATA-B');
    expect(maxActive).toBe(1);
    expect(listSaves().map(entry => entry.id).sort()).toEqual(['a', 'b']);

    await saveGame('a', 'A2', 'DATA-A2', META);
    expect(disk.get('a')).toBe('DATA-A2');
  });

  it('persists across a restart (a fresh backend over the same disk)', async () => {
    const disk = new Map<string, string>();
    const first = createDesktopBackends(makeNativeInvoke(disk, { write: false }));
    first.installBackends();
    await first.init();
    await saveGame('slot.one', 'First', '{"schemaVersion":20}', META);

    const second = createDesktopBackends(makeNativeInvoke(disk, { write: false }));
    second.installBackends();
    await second.init();
    expect(listSaves().map(entry => entry.id)).toEqual(['slot.one']);
    expect(loadSave('slot.one')).toBe('{"schemaVersion":20}');
  });

  it('does not expose saves before delayed native initialization completes', async () => {
    const disk = new Map<string, string>();
    disk.set('slot.one', '{"schemaVersion":20}');
    disk.set('__index__', JSON.stringify({ 'slot.one': { ...META, name: 'First', createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z' } }));
    let releaseList: (() => void) | undefined;
    const listGate = new Promise<void>(resolve => { releaseList = resolve; });
    const invoke = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
      const id = args && 'id' in args ? String(args.id) : '';
      if (command === 'save_file_list') { await listGate; return [...disk.keys()] as unknown as T; }
      if (command === 'save_file_read') return (disk.get(id) ?? null) as unknown as T;
      if (command === 'save_file_write') { disk.set(id, args && 'data' in args ? String(args.data) : ''); return undefined as unknown as T; }
      if (command === 'save_file_delete') { disk.delete(id); return undefined as unknown as T; }
      if (command === 'settings_read') return null as unknown as T;
      if (command === 'settings_write') return undefined as unknown as T;
      return undefined as unknown as T;
    };
    const backends = createDesktopBackends(invoke);
    backends.installBackends();
    const initPromise = backends.init();
    // Before init resolves the cache is empty: no saves are visible yet.
    expect(listSaves()).toHaveLength(0);
    releaseList?.();
    await initPromise;
    expect(listSaves().map(entry => entry.id)).toEqual(['slot.one']);
  });

  it('recovers after an interrupted write: prior data survives and a retry succeeds', async () => {
    const disk = new Map<string, string>();
    const failures = { write: false };
    const backends = createDesktopBackends(makeNativeInvoke(disk, failures));
    backends.installBackends();
    await backends.init();

    await saveGame('slot.one', 'Good', '{"v":1}', META);
    failures.write = true;
    await expect(saveGame('slot.one', 'Bad', '{"v":2}', META)).rejects.toThrow(/disk full/);
    // The prior durable data is intact.
    expect(disk.get('slot.one')).toBe('{"v":1}');
    failures.write = false;
    await saveGame('slot.one', 'Good2', '{"v":2}', META);
    expect(disk.get('slot.one')).toBe('{"v":2}');
  });

  it('deletes and renames durably', async () => {
    const disk = new Map<string, string>();
    const backends = createDesktopBackends(makeNativeInvoke(disk, { write: false }));
    backends.installBackends();
    await backends.init();

    await saveGame('slot.one', 'Original', '{}', META);
    const renamed = await renameSave('slot.one', 'Renamed');
    expect(renamed?.metadata.name).toBe('Renamed');
    expect(listSaves()[0].metadata.name).toBe('Renamed');
    await deleteSave('slot.one');
    expect(listSaves()).toHaveLength(0);
    expect(disk.get('slot.one')).toBeUndefined();
  });
});
