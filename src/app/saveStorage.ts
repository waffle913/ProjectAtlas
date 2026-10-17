// Save management service. Saves live in a desktop/browser application-data store,
// NEVER inside the git repository, and are kept separate from the canonical
// SimulationState. The desktop release swaps in a Tauri filesystem backend; the
// browser build uses localStorage. Both implement the same interface.
//
// Writes are Promise-returning so callers can observe the actual storage outcome.
// A successful write is reported only after the underlying medium has accepted
// the data; the browser backend rejects on quota/unavailability instead of
// silently discarding the failure.

export interface SaveMetadata {
  name: string;
  countryId: string;
  countryName: string;
  controlledPersonName: string;
  office: string | null;
  simulationDate: string;
  createdAt: string;
  modifiedAt: string;
  schemaVersion: number;
}

export interface SaveEntry {
  id: string;
  metadata: SaveMetadata;
}

export interface SaveBackend {
  list(): string[]; // returns save ids
  read(id: string): string | null; // raw serialized SimulationState JSON
  write(id: string, data: string): Promise<void>;
  remove(id: string): Promise<void>;
}

function storageError(action: string, error: unknown): Error {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return new Error(`Save storage is full or unavailable while ${action} (${detail}).`);
}

function browserSaveBackend(): SaveBackend {
  const prefix = 'projectatlas.save.';
  const keys = () => {
    try {
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) out.push(key.slice(prefix.length));
      }
      return out;
    } catch { return []; }
  };
  return {
    list: keys,
    read: (id) => { try { return localStorage.getItem(prefix + id); } catch { return null; } },
    write: async (id, data) => {
      try { localStorage.setItem(prefix + id, data); }
      catch (error) { throw storageError('writing save', error); }
    },
    remove: async (id) => {
      try { localStorage.removeItem(prefix + id); }
      catch (error) { throw storageError('deleting save', error); }
    },
  };
}

let backend: SaveBackend = browserSaveBackend();
const INDEX_KEY = '__index__';

function readIndex(): Record<string, SaveMetadata> {
  try { return JSON.parse(backend.read(INDEX_KEY) ?? '{}'); } catch { return {}; }
}
function writeIndex(index: Record<string, SaveMetadata>): Promise<void> {
  return backend.write(INDEX_KEY, JSON.stringify(index));
}

// Serializes read-modify-write mutations (save/delete/rename) so two overlapping
// saves cannot each read a stale index and let the second index write drop the
// first save's entry. The chain itself never rejects, so a failed mutation does
// not block the ones queued after it.
let mutationChain: Promise<unknown> = Promise.resolve();
function serializeMutation<T>(op: () => Promise<T>): Promise<T> {
  const result = mutationChain.then(op, op);
  mutationChain = result.then(() => undefined, () => undefined);
  return result;
}

/** Desktop adapter swaps this in at startup. */
export function setSaveBackend(next: SaveBackend): void { backend = next; }

export function listSaves(): SaveEntry[] {
  const index = readIndex();
  return backend.list()
    .filter(id => id !== INDEX_KEY)
    .map(id => ({ id, metadata: index[id] }))
    .filter(entry => entry.metadata)
    .sort((a, b) => (b.metadata.modifiedAt ?? '').localeCompare(a.metadata.modifiedAt ?? ''));
}

export function mostRecentSave(): SaveEntry | undefined {
  return listSaves()[0];
}

/**
 * Persists the serialized state and its metadata. The save data is written and
 * awaited before the index is updated, so the index can never reference a save
 * whose data was not durably written. If the index write fails after the data
 * write succeeded, the error is surfaced (never silently swallowed) and the
 * already-written save data is preserved on the medium.
 */
export function saveGame(id: string, name: string, data: string, metadata: Omit<SaveMetadata, 'createdAt' | 'modifiedAt' | 'name'> & { createdAt?: string }): Promise<SaveEntry> {
  return serializeMutation(async () => {
    const index = readIndex();
    const now = new Date().toISOString();
    const existing = index[id];
    const entry: SaveMetadata = {
      ...metadata,
      name,
      createdAt: metadata.createdAt ?? existing?.createdAt ?? now,
      modifiedAt: now,
    };
    await backend.write(id, data);
    index[id] = entry;
    try {
      await writeIndex(index);
    } catch (error) {
      // Data is durable but the index update failed. Do not discard the save.
      // Revert the in-memory index so a retry rewrites it consistently, and
      // surface the divergence to the caller.
      delete index[id];
      throw new Error(`Save data was written but the save index could not be updated: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { id, metadata: entry };
  });
}

export function loadSave(id: string): string | null {
  return backend.read(id);
}

export function deleteSave(id: string): Promise<void> {
  return serializeMutation(async () => {
    await backend.remove(id);
    const index = readIndex();
    delete index[id];
    await writeIndex(index);
  });
}

export function renameSave(id: string, name: string): Promise<SaveEntry | undefined> {
  return serializeMutation(async () => {
    const index = readIndex();
    if (!index[id]) return undefined;
    index[id] = { ...index[id], name, modifiedAt: new Date().toISOString() };
    await writeIndex(index);
    return { id, metadata: index[id] };
  });
}

export function saveIdFor(name: string): string {
  return `slot.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'save'}`;
}
