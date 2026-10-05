// Save management service. Saves live in a desktop/browser application-data store,
// NEVER inside the git repository, and are kept separate from the canonical
// SimulationState. The desktop release swaps in a Tauri filesystem backend; the
// browser build uses localStorage. Both implement the same interface.

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
  write(id: string, data: string): void;
  remove(id: string): void;
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
    write: (id, data) => { try { localStorage.setItem(prefix + id, data); } catch { /* full */ } },
    remove: (id) => { try { localStorage.removeItem(prefix + id); } catch { /* ignore */ } },
  };
}

let backend: SaveBackend = browserSaveBackend();
const META_KEY = 'projectatlas.save.index';

function readIndex(): Record<string, SaveMetadata> {
  try { return JSON.parse(localStorage.getItem(META_KEY) ?? '{}'); } catch { return {}; }
}
function writeIndex(index: Record<string, SaveMetadata>): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(index)); } catch { /* full */ }
}

/** Desktop adapter swaps this in at startup. */
export function setSaveBackend(next: SaveBackend): void { backend = next; }

export function listSaves(): SaveEntry[] {
  const index = readIndex();
  return backend.list()
    .map(id => ({ id, metadata: index[id] }))
    .filter(entry => entry.metadata)
    .sort((a, b) => (b.metadata.modifiedAt ?? '').localeCompare(a.metadata.modifiedAt ?? ''));
}

export function mostRecentSave(): SaveEntry | undefined {
  return listSaves()[0];
}

export function saveGame(id: string, name: string, data: string, metadata: Omit<SaveMetadata, 'createdAt' | 'modifiedAt' | 'name'> & { createdAt?: string }): SaveEntry {
  const index = readIndex();
  const now = new Date().toISOString();
  const existing = index[id];
  const entry: SaveMetadata = {
    ...metadata,
    name,
    createdAt: metadata.createdAt ?? existing?.createdAt ?? now,
    modifiedAt: now,
  };
  backend.write(id, data);
  index[id] = entry;
  writeIndex(index);
  return { id, metadata: entry };
}

export function loadSave(id: string): string | null {
  return backend.read(id);
}

export function deleteSave(id: string): void {
  backend.remove(id);
  const index = readIndex();
  delete index[id];
  writeIndex(index);
}

export function renameSave(id: string, name: string): SaveEntry | undefined {
  const index = readIndex();
  if (!index[id]) return undefined;
  index[id] = { ...index[id], name, modifiedAt: new Date().toISOString() };
  writeIndex(index);
  return { id, metadata: index[id] };
}

export function saveIdFor(name: string): string {
  return `slot.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'save'}`;
}
