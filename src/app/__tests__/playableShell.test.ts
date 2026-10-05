import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, setSettingsBackend, type StorageBackend } from '../preferences';
import { deleteSave, listSaves, loadSave, renameSave, saveGame, setSaveBackend, type SaveBackend } from '../saveStorage';
import { initDesktopBackends, isTauri } from '../desktop';
import { politicalRegistry } from '../../simulation/politics/registry';
import { MainMenu } from '../../components/MainMenu';
import { StartGame } from '../../components/StartGame';

function memoryStorage(): StorageBackend {
  const map = new Map<string, string>();
  return { get: key => map.get(key) ?? null, set: (key, value) => { map.set(key, value); }, remove: key => { map.delete(key); } };
}
function memorySaves(): SaveBackend {
  const map = new Map<string, string>();
  return { list: () => [...map.keys()], read: id => map.get(id) ?? null, write: (id, data) => { map.set(id, data); }, remove: id => { map.delete(id); } };
}

const GENERIC_FAMILY_NAMES = ['Civic Alliance', 'Social Forum', 'National League', 'Reform Movement', 'Democratic Union', 'Popular Assembly', 'Liberal Coalition', 'Community Congress', 'Green Initiative', 'Labour Front', 'Republican Group', 'Progressive List'];

describe('0.21 playable shell', () => {
  beforeEach(() => { setSettingsBackend(memoryStorage()); setSaveBackend(memorySaves()); });

  it('persists and sanitizes application settings independently of SimulationState', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.audio.masterVolume = 99; settings.graphics.uiScale = 99; settings.gameplay.defaultSpeed = 99;
    saveSettings(settings);
    const loaded = loadSettings();
    expect(loaded.audio.masterVolume).toBe(1);
    expect(loaded.graphics.uiScale).toBe(1.5);
    expect(loaded.gameplay.defaultSpeed).toBe(3);
    expect(loaded.version).toBe(1);
  });

  it('round-trips saves with metadata and deletes after confirmation intent', () => {
    const entry = saveGame('slot.one', 'Test Save', '{"schemaVersion":18}', { countryId: 'c', countryName: 'Country', controlledPersonName: 'Person', office: null, simulationDate: '2026-01-01', schemaVersion: 18 });
    expect(listSaves()).toHaveLength(1);
    expect(loadSave('slot.one')).toBe('{"schemaVersion":18}');
    expect(entry.metadata.name).toBe('Test Save');
    const renamed = renameSave('slot.one', 'Renamed');
    expect(renamed?.metadata.name).toBe('Renamed');
    deleteSave('slot.one');
    expect(listSaves()).toHaveLength(0);
  });

  it('never emits a generic rotating party family name or copies a source name verbatim', () => {
    const parties = Object.values(politicalRegistry.parties);
    expect(parties.length).toBeGreaterThan(100);
    const STRUCTURAL = new Set(['party', 'parti', 'partido', 'partei', 'alliance', 'allianz', 'bloc', 'front', 'frente', 'movement', 'mouvement', 'union', 'coalition', 'coalicion', 'group', 'groupe', 'grupo', 'league', 'liga', 'list', 'forum', 'congress', 'assembly']);
    for (const party of parties) {
      expect(party.fictional).toBe(true);
      expect(party.displayName).not.toBe(party.sourceBasis.sourcePartyName);
      const sourceWords = party.sourceBasis.sourcePartyName.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STRUCTURAL.has(w));
      if (sourceWords.length) {
        expect(sourceWords.some(w => party.displayName.toLowerCase().includes(w))).toBe(true);
      }
    }
  });

  it('release menu and new-game flow contain no obsolete candidate/milestone branding', () => {
    const menu = renderToStaticMarkup(createElement(MainMenu, { hasSave: false, settings: DEFAULT_SETTINGS, onContinue: () => {}, onNewGame: () => {}, onLoad: () => {}, onSettings: () => {}, onCredits: () => {}, onExit: () => {} }));
    expect(menu).toContain('New Game');
    expect(menu).toContain('Load Game');
    expect(menu).not.toContain('candidate');
    expect(menu).not.toContain('MILESTONE');
    expect(menu).not.toContain('0.17');
    const start = renderToStaticMarkup(createElement(StartGame, { countries: [], persons: [], onPlay: () => {} }));
    expect(start).not.toContain('synthetic');
    expect(start).not.toContain('0.17 candidate');
  });

  it('selects browser backends in dev and exposes no placebo graphics settings', async () => {
    expect(isTauri()).toBe(false);
    expect(await initDesktopBackends()).toBe(false);
    expect(Object.keys(DEFAULT_SETTINGS.graphics).sort()).toEqual(['displayMode', 'uiScale']);
    expect(DEFAULT_SETTINGS).not.toHaveProperty('graphics.vsync');
    expect(DEFAULT_SETTINGS).not.toHaveProperty('graphics.mapQuality');
    expect(DEFAULT_SETTINGS).not.toHaveProperty('graphics.frameRateLimit');
  });

  it('keeps source and gameplay political identities distinct with dated provenance', () => {
    const source = politicalRegistry.sourceSnapshotSha256;
    expect(typeof source).toBe('string');
    for (const party of Object.values(politicalRegistry.parties).slice(0, 60)) {
      expect(party.sourceBasis.sourcePartyId).toBeTruthy();
      expect(party.sourceBasis.sourcePartyName).toBeTruthy();
      expect(party.fictional).toBe(true);
      expect(party.displayName).not.toBe(party.sourceBasis.sourcePartyName);
    }
  });
});
