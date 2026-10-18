import { useState } from 'react';
import { deleteSave, listSaves, type SaveEntry } from '../app/saveStorage';

export function SaveManager({ onLoad, onBack, error }: {
  onLoad: (id: string) => void;
  onBack: () => void;
  error?: string;
}) {
  const [saves, setSaves] = useState<SaveEntry[]>(() => listSaves());
  const [pendingDelete, setPendingDelete] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const refresh = () => setSaves(listSaves());

  return (
    <main className="save-screen" role="main">
      <div className="save-frame">
        <header className="settings-header">
          <h1>Load Game</h1>
          <button onClick={onBack} className="back-button">← Back</button>
        </header>
        {saves.length === 0 ? (
          <p className="save-empty">No saved games. Start a New Game to create a save.</p>
        ) : (
          <ul className="save-list">
            {saves.map(entry => (
              <li key={entry.id} className="save-entry">
                <div className="save-meta">
                  <strong>{entry.metadata.name}</strong>
                  <span>{entry.metadata.countryName}</span>
                  <span>{entry.metadata.controlledPersonName}{entry.metadata.office ? ` · ${entry.metadata.office}` : ''}</span>
                  <span>Date {entry.metadata.simulationDate} · saved {entry.metadata.modifiedAt.slice(0, 10)} · schema {entry.metadata.schemaVersion}</span>
                </div>
                <div className="save-actions">
                  <button onClick={() => onLoad(entry.id)}>Load</button>
                  {pendingDelete === entry.id ? (
                    <>
                      <span className="confirm-text">Delete permanently?</span>
                      <button className="danger" onClick={async () => {
                        try { await deleteSave(entry.id); setPendingDelete(undefined); refresh(); }
                        catch (error) { setDeleteError(`Delete failed: ${error instanceof Error ? error.message : String(error)}`); }
                      }}>Confirm</button>
                      <button onClick={() => { setPendingDelete(undefined); setDeleteError(undefined); }}>Cancel</button>
                    </>
                  ) : (
                    <button className="danger" onClick={() => setPendingDelete(entry.id)}>Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {deleteError && <p className="save-error">{deleteError}</p>}
        {error && <p className="save-error">{error}</p>}
      </div>
    </main>
  );
}
