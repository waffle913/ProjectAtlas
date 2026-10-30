// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MainMenu } from '../MainMenu';
import { DEFAULT_SETTINGS } from '../../app/preferences';
import type { SaveEntry } from '../../app/saveStorage';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement;
function mount(overrides: Partial<React.ComponentProps<typeof MainMenu>> = {}) {
  const props = { settings: DEFAULT_SETTINGS, hasSave: false, onContinue: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onLoadSave: vi.fn(), onSettings: vi.fn(), onCredits: vi.fn(), onExit: vi.fn(), ...overrides };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  act(() => root!.render(createElement(MainMenu, props)));
  return props;
}
function button(text: string) { const result = [...container.querySelectorAll('button')].find(b => b.textContent?.startsWith(text)); if (!result) throw new Error(text); return result; }
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); });
function entry(id: string, modifiedAt: string): SaveEntry {
  return { id, metadata: { name: `Save ${id}`, countryId: id, countryName: `Country ${id}`, controlledPersonName: `Person ${id}`, office: null, simulationDate: '2026-02-03', createdAt: modifiedAt, modifiedAt, schemaVersion: 20 } };
}
describe('reference main menu', () => {
  it('routes implemented actions and disables unavailable features and empty Continue', () => {
    const props = mount();
    for (const [label, handler] of [['Nouvelle partie',props.onNewGame],['Charger une partie',props.onLoad],['Paramètres',props.onSettings],['Crédits',props.onCredits],['Quitter',props.onExit],['Voir toutes',props.onLoad],['Documentation',props.onCredits]] as const) {
      act(() => button(label).click()); expect(handler).toHaveBeenCalled();
    }
    expect(button('Continuer').disabled).toBe(true);
    for (const label of ['Encyclopédie','Statistiques','Mods','Voir plus','Discord']) expect(button(label).disabled).toBe(true);
    expect(container.textContent).toContain('Aucune partie sauvegardée');
    expect(container.textContent).toContain('Aucune actualité disponible');
    expect(container.textContent).not.toContain('3 mars 2025');
  });
  it('shows the four latest supplied entries and loads their exact IDs without mutating the input', () => {
    const saves = [entry('a','2026-01-01'),entry('e','2026-01-05'),entry('c','2026-01-03'),entry('b','2026-01-02'),entry('d','2026-01-04')];
    const original = saves.map(s => s.id);
    const props = mount({ hasSave: true, saves });
    expect([...container.querySelectorAll('.atlas-save strong')].map(el => el.textContent)).toEqual(['Country e','Country d','Country c','Country b']);
    act(() => (container.querySelector('.atlas-save') as HTMLButtonElement).click());
    expect(props.onLoadSave).toHaveBeenCalledExactlyOnceWith('e');
    act(() => button('Continuer').click()); expect(props.onContinue).toHaveBeenCalledOnce();
    expect(saves.map(s => s.id)).toEqual(original);
    expect(button('Continuer').textContent).toContain('3 février 2026');
  });
  it('gates save loading and new games until initialization completes, preserving settings access', () => {
    mount({ ready: false, hasSave: true, saves: [entry('a','2026-01-01')] });
    for (const label of ['Continuer','Nouvelle partie','Charger une partie','Voir toutes']) expect(button(label).disabled).toBe(true);
    expect((container.querySelector('.atlas-save') as HTMLButtonElement).disabled).toBe(true);
    expect(button('Paramètres').disabled).toBe(false);
  });
  it('surfaces storage failures and corrupt-save errors instead of presenting a fabricated empty library', () => {
    mount({ storageStatus: 'error', ready: false, error: 'The selected save could not be read.' });
    expect(container.textContent).toContain('Sauvegardes indisponibles');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('could not be read');
    expect(container.textContent).not.toContain('Vos dernières parties apparaîtront ici.');
  });
});
