import type { CampaignSummary } from '../app/campaignSummary';
import type { AppSettings } from '../app/preferences';
import type { SaveEntry } from '../app/saveStorage';
import './MainMenu.css';
export type MenuScreen = 'menu' | 'new-game' | 'load' | 'settings' | 'credits' | 'game';
type IconName = 'play' | 'globe' | 'folder' | 'settings' | 'book' | 'chart' | 'mods' | 'people' | 'power' | 'bug';
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    play: <path d="M7 3 22 12 7 21Z" fill="currentColor"/>,
    globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5q7 4 14 0M5 17.5q7-4 14 0"/></>,
    folder: <><path d="M2 7V4h8l2 3h9v13H2Z"/><path d="m2 20 3-11h18l-3 11Z" fill="currentColor"/></>,
    // Lucide Settings (ISC), copyright 2026 Lucide Icons and Contributors.
    // https://github.com/lucide-icons/lucide/blob/main/icons/settings.svg
    // Licence bundled at public/menu/lucide-settings-LICENSE.txt.
    settings: <><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></>,
    book: <><path d="M12 5Q6 1 2 4v16q5-3 10 0 5-3 10 0V4q-4-3-10 1Z"/><path d="M12 5v15"/></>,
    chart: <><path d="M2 21h21M4 17v-6h3v6M10 19V7h3v12M16 19V3h3v16"/></>,
    mods: <path d="M3 9h6V5a3 3 0 1 1 5 0v4h6v5h-3a3 3 0 1 0 0 5h3v3h-7v-4a3 3 0 1 0-5 0v4H3Z" fill="currentColor"/>,
    people: <><circle cx="9" cy="7" r="4" fill="currentColor"/><path d="M1 22v-3a8 8 0 0 1 16 0v3Z" fill="currentColor"/><path d="M17 3a4 4 0 0 1 0 8M19 14q5 1 4 8"/></>,
    power: <path d="M12 2v10M6 5a9 9 0 1 0 12 0"/>,
    bug: <path d="M8 9h8v9a4 4 0 0 1-8 0ZM9 9V6a3 3 0 0 1 6 0v3M3 11h5m8 0h5M3 18h5m8 0h5M5 3l3 3m8 0 3-3M12 10v11"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function AtlasMark({ small = false }: { small?: boolean }) {
  return <svg className={small ? 'atlas-emblem small' : 'atlas-emblem'} viewBox="0 0 220 220" fill="none" aria-hidden="true">
    <circle cx="110" cy="110" r="100"/><circle cx="110" cy="110" r="75"/><circle cx="110" cy="110" r="50"/>
    <path d="M110 6v208M6 110h208M39 39l142 142M39 181 181 39M110 10a100 100 0 0 1 100 100M110 35a75 75 0 0 1 75 75"/>
    {[[110,10],[185,44],[210,110],[110,35],[165,60],[185,110],[185,172],[110,210],[35,44]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2" fill="currentColor"/>)}
    {small && <path d="m65 163 45-110 45 110-45-32Zm45-32V74"/>}
  </svg>;
}
function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
export function MainMenu({ onContinue, onNewGame, onLoad, onLoadSave, onSelectSave, selectedSaveId, summary, onSettings, onCredits, onExit, hasSave, ready = true, settings, saves = [], storageStatus = 'ready', error }: {
  onContinue: () => void; onNewGame: () => void; onLoad: () => void; onSettings: () => void; onCredits: () => void; onExit: () => void;
  onLoadSave?: (id: string) => void; onSelectSave?: (id: string) => void; selectedSaveId?: string; summary?: CampaignSummary; hasSave: boolean; ready?: boolean; settings: AppSettings;
  saves?: SaveEntry[]; storageStatus?: 'initializing' | 'ready' | 'error'; error?: string;
}) {
  const recent = [...saves].sort((a,b) => b.metadata.modifiedAt.localeCompare(a.metadata.modifiedAt)).slice(0,4);
  const latest = recent[0];
  // Accessibility enlargement takes precedence without disabling smaller graphics scales.
  const uiScale = settings.accessibility.uiScale > 1
    ? Math.max(settings.graphics.uiScale, settings.accessibility.uiScale)
    : settings.graphics.uiScale;
  const selected = saves.find(save => save.id === selectedSaveId);
  const unavailable = 'Non disponible — fonctionnalité non implémentée';
  const actions: { icon: IconName; label: string; action?: () => void; disabled?: boolean }[] = [
    { icon: 'globe', label: 'Nouvelle partie', action: onNewGame, disabled: !ready },
    { icon: 'folder', label: 'Charger une partie', action: onLoad, disabled: !ready },
    { icon: 'settings', label: 'Paramètres', action: onSettings },
    { icon: 'book', label: 'Encyclopédie' }, { icon: 'chart', label: 'Statistiques' }, { icon: 'mods', label: 'Mods' },
    { icon: 'people', label: 'Crédits', action: onCredits }, { icon: 'power', label: 'Quitter', action: onExit },
  ];
  return <main className={`atlas-menu${settings.accessibility.highContrast ? ' atlas-contrast' : ''}${uiScale > 1.1 ? ' atlas-large-ui' : ''}`} lang="fr" style={{ '--menu-ui-scale': uiScale } as React.CSSProperties}>
    <div className="atlas-world" aria-hidden="true"/><div className="atlas-shade" aria-hidden="true"/>
    <div className="atlas-brand"><AtlasMark/><span>PROJECT</span><h1>ATLAS</h1></div>
    <div className="atlas-content">
      <nav className="atlas-nav" aria-label="Menu principal">
        <button className="atlas-continue" onClick={onContinue} disabled={!hasSave || !ready} aria-label="Continuer">
          <Icon name="play"/><span>Continuer<small>{!ready ? 'Chargement en cours…' : latest ? `${latest.metadata.countryName} — ${formatDate(latest.metadata.simulationDate)}` : 'Aucune sauvegarde disponible'}</small></span><b className="atlas-chevron">›</b>
        </button>
        <div className="atlas-nav-list">{actions.map(({icon,label,action,disabled}) => <button key={label} onClick={action} disabled={!action || disabled} title={!action ? unavailable : disabled ? 'Chargement en cours' : undefined}>
          <Icon name={icon}/><span>{label}</span>{!action && <small>Indisponible</small>}
        </button>)}</div>
      </nav>
      <div className="atlas-panels">
        <section className="atlas-panel atlas-recent" aria-labelledby="atlas-recent-title">
          <div className="atlas-panel-heading"><h2 id="atlas-recent-title">Dernières parties</h2><button onClick={onLoad} disabled={!ready}>Voir toutes <span>›</span></button></div>
          {recent.length ? <div className="atlas-save-list">{recent.map(save => <button className="atlas-save" key={save.id} aria-pressed={save.id === selectedSaveId} onClick={() => onSelectSave?.(save.id)} disabled={!ready || !onSelectSave}>
            <div className="atlas-save-thumbnail" aria-hidden="true"><Icon name="globe"/></div>
            <div className="atlas-save-details"><strong>{save.metadata.countryName}</strong><span>{formatDate(save.metadata.simulationDate)}</span><small>{save.metadata.name} · {save.metadata.controlledPersonName}</small></div><span className="atlas-chevron">›</span>
          </button>)}</div> : <div className="atlas-empty"><Icon name="folder"/><strong>{storageStatus === 'initializing' ? 'Lecture des sauvegardes…' : storageStatus === 'error' ? 'Sauvegardes indisponibles' : 'Aucune partie sauvegardée'}</strong><p>{storageStatus === 'ready' ? 'Vos dernières parties apparaîtront ici.' : 'Le stockage local n’est pas encore disponible.'}</p>{storageStatus === 'ready' && <button onClick={onNewGame} disabled={!ready}>Commencer une nouvelle partie <span>›</span></button>}</div>}
        </section>
        {selected && <section className="atlas-panel atlas-summary" aria-labelledby="atlas-summary-title">
          <div className="atlas-panel-heading"><h2 id="atlas-summary-title">Reprise de campagne</h2><button className="atlas-load-selection" onClick={() => onLoadSave?.(selected.id)} disabled={!ready || !onLoadSave}>Charger cette partie <span>›</span></button></div>
          <p className="atlas-summary-context"><strong>{selected.metadata.name}</strong> · {selected.metadata.countryName} · {selected.metadata.controlledPersonName}<br/>État enregistré au {formatDate(summary?.asOfDate ?? selected.metadata.simulationDate)}</p>
          {summary?.error ? <p role="status" className="atlas-summary-unavailable">{summary.error}</p> : <div className="atlas-summary-columns">
            {([
              ['Événements récents', summary?.events ?? [], 'Aucun événement accessible conservé dans cette sauvegarde.'],
              ['Décisions précédentes', summary?.decisions ?? [], 'Aucune proposition passée de ce personnage disponible.'],
              ['Situations en cours', summary?.situations ?? [], 'Aucune proposition en attente disponible. Les autres situations ne sont pas établies par cet historique.'],
            ] as const).map(([title, items, empty]) => <div className="atlas-summary-category" key={title}><h3>{title}</h3>{items.length ? <ul>{items.map(item => <li key={item.id}><strong>{item.title}</strong><small>{item.date ? formatDate(item.date) : 'Date non enregistrée'} · {item.detail}</small></li>)}</ul> : <p>{empty}</p>}</div>)}
          </div>}
          <small className="atlas-summary-note">Extrait limité aux informations enregistrées et accessibles au personnage sauvegardé. L’historique conservé peut être incomplet.</small>
        </section>}
        {error && <p className="atlas-menu-error" role="alert">{error}</p>}
      </div>
    </div>
    <footer className="atlas-footer"><div className="atlas-version"><AtlasMark small/><span>Version {import.meta.env.VITE_APP_VERSION ?? 'Alpha'}<br/>ProjectAtlas — Alpha</span></div><div className="atlas-footer-links"><button onClick={onCredits}><Icon name="book"/>Documentation / Sources</button><button disabled title={unavailable}>Discord <small>Indisponible</small></button><a href="https://github.com/waffle913/ProjectAtlas/issues/new" target="_blank" rel="noreferrer"><Icon name="bug"/>Signaler un bug</a></div></footer>
  </main>;
}
