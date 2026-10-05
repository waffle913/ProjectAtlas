import { useState } from 'react';
import { DEFAULT_SETTINGS, type AppSettings, type DisplayMode } from '../app/preferences';

type Category = 'graphics' | 'audio' | 'interface' | 'gameplay' | 'accessibility';

type SettingsPatch = {
  graphics?: Partial<AppSettings['graphics']>;
  audio?: Partial<AppSettings['audio']>;
  interface?: Partial<AppSettings['interface']>;
  gameplay?: Partial<AppSettings['gameplay']>;
  accessibility?: Partial<AppSettings['accessibility']>;
};

export function SettingsMenu({ settings, onChange, onBack }: {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onBack: () => void;
}) {
  const [category, setCategory] = useState<Category>('graphics');
  const update = (patch: SettingsPatch) => onChange({
    ...settings,
    graphics: { ...settings.graphics, ...(patch.graphics ?? {}) },
    audio: { ...settings.audio, ...(patch.audio ?? {}) },
    interface: { ...settings.interface, ...(patch.interface ?? {}) },
    gameplay: { ...settings.gameplay, ...(patch.gameplay ?? {}) },
    accessibility: { ...settings.accessibility, ...(patch.accessibility ?? {}) },
  } as AppSettings);

  const categories: Array<[Category, string]> = [['graphics', 'Graphics / Video'], ['audio', 'Audio'], ['interface', 'Interface'], ['gameplay', 'Gameplay'], ['accessibility', 'Accessibility']];

  return (
    <main className="settings-screen" role="main">
      <div className="settings-frame">
        <header className="settings-header">
          <h1>Settings</h1>
          <button onClick={onBack} className="back-button">← Back</button>
        </header>
        <div className="settings-body">
          <nav className="settings-tabs" aria-label="Settings categories">
            {categories.map(([id, label]) => <button key={id} className={category === id ? 'active' : ''} onClick={() => setCategory(id)}>{label}</button>)}
          </nav>
          <section className="settings-pane">
            {category === 'graphics' && <>
              <h2>Graphics / Video</h2>
              <label>Display mode
                <select value={settings.graphics.displayMode} onChange={e => update({ graphics: { displayMode: e.target.value as DisplayMode } })}>
                  <option value="windowed">Windowed</option>
                  <option value="borderless">Borderless Windowed</option>
                  <option value="fullscreen">Fullscreen</option>
                </select>
              </label>
              <label>UI scale
                <select value={String(settings.graphics.uiScale)} onChange={e => update({ graphics: { uiScale: Number(e.target.value) } })}>
                  {[0.75, 0.9, 1, 1.15, 1.3, 1.5].map(v => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
                </select>
              </label>
              <p className="settings-note">Display mode applies through the native desktop window; UI scale applies to the interface text and controls.</p>
            </>}
            {category === 'audio' && <>
              <h2>Audio</h2>
              <label>Master volume <input type="range" min={0} max={1} step={0.01} value={settings.audio.masterVolume} onChange={e => update({ audio: { masterVolume: Number(e.target.value) } })} /></label>
              <label>Music volume <input type="range" min={0} max={1} step={0.01} value={settings.audio.musicVolume} onChange={e => update({ audio: { musicVolume: Number(e.target.value) } })} /></label>
              <label>Interface volume <input type="range" min={0} max={1} step={0.01} value={settings.audio.interfaceVolume} onChange={e => update({ audio: { interfaceVolume: Number(e.target.value) } })} /></label>
              <label>Notification volume <input type="range" min={0} max={1} step={0.01} value={settings.audio.notificationVolume} onChange={e => update({ audio: { notificationVolume: Number(e.target.value) } })} /></label>
              <label className="toggle">Mute when unfocused <input type="checkbox" checked={settings.audio.muteWhenUnfocused} onChange={e => update({ audio: { muteWhenUnfocused: e.target.checked } })} /></label>
              <p className="settings-note">ProjectAtlas V1 ships no music/audio assets; these controls are persisted and ready for future content.</p>
            </>}
            {category === 'interface' && <>
              <h2>Interface</h2>
              <label className="toggle">Confirm high-impact actions <input type="checkbox" checked={settings.interface.confirmHighImpact} onChange={e => update({ interface: { confirmHighImpact: e.target.checked } })} /></label>
              <label className="toggle">Show provenance details <input type="checkbox" checked={settings.interface.showProvenance} onChange={e => update({ interface: { showProvenance: e.target.checked } })} /></label>
              <label>Map label density
                <select value={settings.interface.mapLabelDensity} onChange={e => update({ interface: { mapLabelDensity: e.target.value as 'sparse' | 'normal' | 'dense' } })}>
                  <option value="sparse">Sparse</option>
                  <option value="normal">Normal</option>
                  <option value="dense">Dense</option>
                </select>
              </label>
            </>}
            {category === 'gameplay' && <>
              <h2>Gameplay</h2>
              <label>Default simulation speed
                <select value={String(settings.gameplay.defaultSpeed)} onChange={e => update({ gameplay: { defaultSpeed: Number(e.target.value) } })}>
                  {[1, 2, 3].map(v => <option key={v} value={v}>{v}×</option>)}
                </select>
              </label>
              <label className="toggle">Pause on urgent events <input type="checkbox" checked={settings.gameplay.pauseOnUrgent} onChange={e => update({ gameplay: { pauseOnUrgent: e.target.checked } })} /></label>
              <label className="toggle">Autosave <input type="checkbox" checked={settings.gameplay.autosave} onChange={e => update({ gameplay: { autosave: e.target.checked } })} /></label>
              <label>Autosave interval
                <select value={String(settings.gameplay.autosaveIntervalMinutes)} onChange={e => update({ gameplay: { autosaveIntervalMinutes: Number(e.target.value) } })}>
                  {[5, 10, 15, 30].map(v => <option key={v} value={v}>{v} minutes</option>)}
                </select>
              </label>
            </>}
            {category === 'accessibility' && <>
              <h2>Accessibility</h2>
              <label>UI scale
                <select value={String(settings.accessibility.uiScale)} onChange={e => update({ accessibility: { uiScale: Number(e.target.value) } })}>
                  {[0.75, 0.9, 1, 1.15, 1.3, 1.5].map(v => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
                </select>
              </label>
              <label className="toggle">High contrast <input type="checkbox" checked={settings.accessibility.highContrast} onChange={e => update({ accessibility: { highContrast: e.target.checked } })} /></label>
              <label className="toggle">Reduced motion <input type="checkbox" checked={settings.accessibility.reducedMotion} onChange={e => update({ accessibility: { reducedMotion: e.target.checked } })} /></label>
              <label>Notification duration (seconds)
                <select value={String(settings.accessibility.notificationDurationMs)} onChange={e => update({ accessibility: { notificationDurationMs: Number(e.target.value) } })}>
                  {[3000, 6000, 10000].map(v => <option key={v} value={v}>{v / 1000}</option>)}
                </select>
              </label>
            </>}
            <div className="settings-actions"><button onClick={() => onChange(structuredClone(DEFAULT_SETTINGS))}>Restore defaults</button></div>
          </section>
        </div>
      </div>
    </main>
  );
}
