import type { AppSettings } from '../app/preferences';

export type MenuScreen = 'menu' | 'new-game' | 'load' | 'settings' | 'credits' | 'game';

export function MainMenu({ onContinue, onNewGame, onLoad, onSettings, onCredits, onExit, hasSave, settings }: {
  onContinue: () => void;
  onNewGame: () => void;
  onLoad: () => void;
  onSettings: () => void;
  onCredits: () => void;
  onExit: () => void;
  hasSave: boolean;
  settings: AppSettings;
}) {
  return (
    <main className="main-menu" role="main" style={{ '--ui-scale': settings.graphics.uiScale } as React.CSSProperties}>
      <div className="menu-frame">
        <div className="menu-brand">
          <span className="brand-mark">◈</span>
          <h1>PROJECT<span>ATLAS</span></h1>
          <p className="menu-tagline">Geopolitical · economic · political simulation</p>
        </div>
        <nav className="menu-nav" aria-label="Main menu">
          <button onClick={onContinue} disabled={!hasSave}>Continue{!hasSave && <small>no save available</small>}</button>
          <button onClick={onNewGame}>New Game</button>
          <button onClick={onLoad}>Load Game</button>
          <button onClick={onSettings}>Settings</button>
          <button onClick={onCredits}>Credits / Data Sources</button>
          <button className="menu-exit" onClick={onExit}>Exit Game</button>
        </nav>
        <footer className="menu-footer">
          <span>Version {import.meta.env.VITE_APP_VERSION ?? '1.0.0'} · schema 18</span>
        </footer>
      </div>
    </main>
  );
}
