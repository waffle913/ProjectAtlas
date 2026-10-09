import { useState } from 'react';
import { deleteSave, listSaves, type SaveEntry } from '../app/saveStorage';

export function SaveManager({ onLoad, onBack }: {
  onLoad: (id: string) => void;
  onBack: () => void;
}) {
  const [saves, setSaves] = useState<SaveEntry[]>(() => listSaves());
  const [pendingDelete, setPendingDelete] = useState<string>();
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
                      <button className="danger" onClick={() => { deleteSave(entry.id); setPendingDelete(undefined); refresh(); }}>Confirm</button>
                      <button onClick={() => setPendingDelete(undefined)}>Cancel</button>
                    </>
                  ) : (
                    <button className="danger" onClick={() => setPendingDelete(entry.id)}>Delete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
