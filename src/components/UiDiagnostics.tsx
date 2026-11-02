import { useEffect, useRef, useState } from 'react';
import { startUiDiagnostics } from '../app/uiDiagnostics';
import type { MenuScreen } from './MainMenu';

export function UiDiagnostics({ screen }: { screen: MenuScreen }) {
  const session = useRef<ReturnType<typeof startUiDiagnostics> | undefined>(undefined);
  const [state, setState] = useState<'off' | 'recording' | 'stopped'>('off');
  const [error, setError] = useState(false);
  const activate = () => {
    session.current?.stop();
    session.current = startUiDiagnostics(() => setState('stopped'));
    session.current.screen(screen); setState('recording'); setError(false);
  };
  useEffect(() => () => session.current?.stop(), []);
  useEffect(() => { session.current?.screen(screen); }, [screen]);
  const exportLog = () => {
    const current = session.current; if (!current) return;
    current.stop(); setState('stopped');
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(current.snapshot(), null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'projectatlas-ui-diagnostic.json';
      link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError(true); }
  };
  if (state === 'off') return screen === 'settings' ? <aside className="ui-diagnostic-launch"><button onClick={activate}>Activer le diagnostic du curseur (5 min)</button><p>Journal en mémoire : cadence, événements et coordonnées, sans contenu de campagne. Export manuel uniquement.</p></aside> : null;
  return <aside className="ui-diagnostic-panel" aria-label="Diagnostic du curseur">
    <span role="status">Diagnostic {state === 'recording' ? 'en cours (5 min maximum)' : 'arrêté'}</span>
    <span>F9 : symptôme présent · F10 : retour à la normale (heure de réception)</span>
    <button disabled={state !== 'recording'} onClick={() => session.current?.mark()}>Marquer le symptôme</button>
    <button onClick={exportLog}>Arrêter et exporter le diagnostic</button>
    <button onClick={() => { session.current?.stop(); session.current = undefined; setState('off'); }}>Effacer et fermer le diagnostic</button>
    {error && <p role="alert">Export impossible. Réessayez avant de fermer.</p>}
  </aside>;
}
