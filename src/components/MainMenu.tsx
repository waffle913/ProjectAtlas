import type { AppSettings } from '../app/preferences';
import type { SaveEntry } from '../app/saveStorage';
import './MainMenu.css';
export type MenuScreen = 'menu' | 'new-game' | 'load' | 'settings' | 'credits' | 'game';
type IconName = 'play' | 'globe' | 'folder' | 'settings' | 'book' | 'chart' | 'mods' | 'people' | 'power' | 'bell' | 'mail' | 'bug';
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    play: <path d="M7 3 22 12 7 21Z" fill="currentColor"/>,
    globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5q7 4 14 0M5 17.5q7-4 14 0"/></>,
    folder: <><path d="M2 7V4h8l2 3h9v13H2Z"/><path d="m2 20 3-11h18l-3 11Z" fill="currentColor"/></>,
    settings: <><path d="m10 2 4 0 1 3 3 1 3 0 1 4-2 2 0 3 1 3-3 3-3-1-3 1-2 2-4-1 0-3-2-2-3-1 0-4 3-1 1-3Z"/><circle cx="12" cy="12" r="3"/></>,
    book: <><path d="M12 5Q6 1 2 4v16q5-3 10 0 5-3 10 0V4q-4-3-10 1Z"/><path d="M12 5v15"/></>,
    chart: <><path d="M2 21h21M4 17v-6h3v6M10 19V7h3v12M16 19V3h3v16"/></>,
    mods: <path d="M3 9h6V5a3 3 0 1 1 5 0v4h6v5h-3a3 3 0 1 0 0 5h3v3h-7v-4a3 3 0 1 0-5 0v4H3Z" fill="currentColor"/>,
    people: <><circle cx="9" cy="7" r="4" fill="currentColor"/><path d="M1 22v-3a8 8 0 0 1 16 0v3Z" fill="currentColor"/><path d="M17 3a4 4 0 0 1 0 8M19 14q5 1 4 8"/></>,
    power: <path d="M12 2v10M6 5a9 9 0 1 0 12 0"/>,
    bell: <path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4ZM10 21h4M12 2v2"/>,
    mail: <><path d="M2 5h20v15H2Z"/><path d="m2 5 10 9L22 5"/></>,
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
export function MainMenu({ onContinue, onNewGame, onLoad, onLoadSave, onSettings, onCredits, onExit, hasSave, ready = true, settings, saves = [], storageStatus = 'ready', error }: {
  onContinue: () => void; onNewGame: () => void; onLoad: () => void; onSettings: () => void; onCredits: () => void; onExit: () => void;
  onLoadSave?: (id: string) => void; hasSave: boolean; ready?: boolean; settings: AppSettings;
  saves?: SaveEntry[]; storageStatus?: 'initializing' | 'ready' | 'error'; error?: string;
}) {
  const recent = [...saves].sort((a,b) => b.metadata.modifiedAt.localeCompare(a.metadata.modifiedAt)).slice(0,4);
  const latest = recent[0];
  const unavailable = 'Non disponible — fonctionnalité non implémentée';
  const actions: { icon: IconName; label: string; action?: () => void; disabled?: boolean }[] = [
    { icon: 'globe', label: 'Nouvelle partie', action: onNewGame, disabled: !ready },
    { icon: 'folder', label: 'Charger une partie', action: onLoad, disabled: !ready },
    { icon: 'settings', label: 'Paramètres', action: onSettings },
    { icon: 'book', label: 'Encyclopédie' }, { icon: 'chart', label: 'Statistiques' }, { icon: 'mods', label: 'Mods' },
    { icon: 'people', label: 'Crédits', action: onCredits }, { icon: 'power', label: 'Quitter', action: onExit },
  ];
  return <main className={`atlas-menu${settings.accessibility.highContrast ? ' atlas-contrast' : ''}`} lang="fr" style={{ '--menu-ui-scale': settings.graphics.uiScale } as React.CSSProperties}>
    <div className="atlas-world" aria-hidden="true"/><div className="atlas-shade" aria-hidden="true"/>
    <div className="atlas-brand"><AtlasMark/><span>PROJECT</span><h1>ATLAS</h1></div>
    <div className="atlas-utilities">
      <button disabled title={unavailable} aria-label="Notifications — non disponible"><Icon name="bell"/></button>
      <button disabled title={unavailable} aria-label="Messages — non disponible"><Icon name="mail"/></button>
      <button onClick={onSettings} aria-label="Paramètres"><Icon name="settings"/></button>
    </div>
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
          {recent.length ? <div className="atlas-save-list">{recent.map(save => <button className="atlas-save" key={save.id} onClick={() => onLoadSave?.(save.id)} disabled={!ready || !onLoadSave}>
            <div className="atlas-save-thumbnail" aria-hidden="true"><Icon name="globe"/></div>
            <div className="atlas-save-details"><strong>{save.metadata.countryName}</strong><span>{formatDate(save.metadata.simulationDate)}</span><small>{save.metadata.name} · {save.metadata.controlledPersonName}</small></div><span className="atlas-chevron">›</span>
          </button>)}</div> : <div className="atlas-empty"><Icon name="folder"/><strong>{storageStatus === 'initializing' ? 'Lecture des sauvegardes…' : storageStatus === 'error' ? 'Sauvegardes indisponibles' : 'Aucune partie sauvegardée'}</strong><p>{storageStatus === 'ready' ? 'Vos dernières parties apparaîtront ici.' : 'Le stockage local n’est pas encore disponible.'}</p>{storageStatus === 'ready' && <button onClick={onNewGame} disabled={!ready}>Commencer une nouvelle partie <span>›</span></button>}</div>}
        </section>
        <section className="atlas-panel atlas-news" aria-labelledby="atlas-news-title">
          <div className="atlas-panel-heading"><h2 id="atlas-news-title">Actualités du monde</h2><button disabled title="Aucun flux d’actualités connecté">Voir plus</button></div>
          <div className="atlas-news-layout"><div className="atlas-news-main"><div className="atlas-news-placeholder"><Icon name="globe"/><span>AUCUN FLUX CONNECTÉ</span></div><strong>Aucune actualité disponible</strong><p>Aucune source d’actualités n’est connectée au menu principal.</p><small>Les événements de vos parties restent accessibles en jeu.</small></div>
            <div className="atlas-news-side">{['Actualités internationales','Vie politique','Économie mondiale'].map(label => <div key={label}><Icon name={label === 'Vie politique' ? 'people' : label === 'Économie mondiale' ? 'chart' : 'globe'}/><span>{label}<small>Données indisponibles</small></span></div>)}</div>
          </div>
        </section>
        {error && <p className="atlas-menu-error" role="alert">{error}</p>}
      </div>
    </div>
    <footer className="atlas-footer"><div className="atlas-version"><AtlasMark small/><span>Version {import.meta.env.VITE_APP_VERSION ?? 'Alpha'}<br/>ProjectAtlas — Alpha</span></div><div className="atlas-footer-links"><button onClick={onCredits}><Icon name="book"/>Documentation / Sources</button><button disabled title={unavailable}>Discord <small>Indisponible</small></button><a href="https://github.com/waffle913/ProjectAtlas/issues/new" target="_blank" rel="noreferrer"><Icon name="bug"/>Signaler un bug</a></div></footer>
  </main>;
}
