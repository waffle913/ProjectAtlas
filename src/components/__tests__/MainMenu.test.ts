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
  const props = { settings: DEFAULT_SETTINGS, hasSave: false, onContinue: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onLoadSave: vi.fn(), onSelectSave: vi.fn(), onSettings: vi.fn(), onCredits: vi.fn(), onExit: vi.fn(), ...overrides };
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  const render = (updates: Partial<React.ComponentProps<typeof MainMenu>> = {}) => {
    Object.assign(props, updates);
    act(() => root!.render(createElement(MainMenu, props)));
  };
  render();
  return { props, render };
}
function button(text: string) { const result = [...container.querySelectorAll('button')].find(b => b.textContent?.startsWith(text)); if (!result) throw new Error(text); return result; }
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); });
function entry(id: string, modifiedAt: string): SaveEntry {
  return { id, metadata: { name: `Save ${id}`, countryId: id, countryName: `Country ${id}`, controlledPersonName: `Person ${id}`, office: null, simulationDate: '2026-02-03', createdAt: modifiedAt, modifiedAt, schemaVersion: 20 } };
}
describe('reference main menu after audit', () => {
  it('resumes memory independently of storage and never treats a save as an active session',()=>{
    const onLoadLatest=vi.fn();const {props,render}=mount({hasSave:true,saves:[entry('a','2026-01-01')],onLoadLatest});
    expect(button('Continuer').disabled).toBe(true);
    act(()=>button('Charger la dernière sauvegarde').click());expect(onLoadLatest).toHaveBeenCalledOnce();expect(props.onContinue).not.toHaveBeenCalled();
    render({hasSession:true,ready:false});expect(button('Continuer').disabled).toBe(false);act(()=>button('Continuer').click());expect(props.onContinue).toHaveBeenCalledOnce();
  });
  it('routes existing actions, removes in-game shortcuts and hides campaign panel before any selection', () => {
    const { props } = mount();
    for (const [label, handler] of [['Nouvelle partie',props.onNewGame],['Charger une partie',props.onLoad],['Paramètres',props.onSettings],['Crédits',props.onCredits],['Quitter',props.onExit],['Voir toutes',props.onLoad],['Documentation',props.onCredits]] as const) {
      act(() => button(label).click()); expect(handler).toHaveBeenCalled();
    }
    expect(button('Continuer').disabled).toBe(true);
    for (const label of ['Encyclopédie','Statistiques','Mods','Discord']) expect(button(label).disabled).toBe(true);
    expect(container.querySelector('.atlas-summary')).toBeNull();
    expect(container.textContent).not.toMatch(/Actualités du monde|AUCUN FLUX|Notifications|Messages/);
    expect(container.querySelector('[aria-label^="Notifications"],[aria-label^="Messages"]')).toBeNull();
    expect(container.querySelector('.atlas-utilities')).toBeNull();
    const settingsButtons = [...container.querySelectorAll('button')].filter(b => b.textContent === 'Paramètres' || b.getAttribute('aria-label') === 'Paramètres');
    expect(settingsButtons).toHaveLength(1);
    expect(settingsButtons[0].closest('.atlas-nav')).not.toBeNull();
  });
  it('selects without loading, shows the selected context, and only loads on explicit confirmation', () => {
    const saves = [entry('a','2026-01-01'),entry('e','2026-01-05'),entry('c','2026-01-03'),entry('b','2026-01-02'),entry('d','2026-01-04')];
    const original = saves.map(s => s.id);
    const { props, render } = mount({ hasSave: true, hasSession: true, saves });
    expect([...container.querySelectorAll('.atlas-save strong')].map(el => el.textContent)).toEqual(['Country e','Country d','Country c','Country b']);
    expect(container.querySelector('.atlas-summary')).toBeNull();
    act(() => (container.querySelectorAll('.atlas-save')[1] as HTMLButtonElement).click());
    expect(props.onSelectSave).toHaveBeenCalledExactlyOnceWith('d');
    expect(props.onLoadSave).not.toHaveBeenCalled();
    expect(props.onContinue).not.toHaveBeenCalled();
    render({ selectedSaveId: 'd', summary: { events: [], decisions: [], situations: [] } });
    expect(container.querySelector('.atlas-summary')?.textContent).toContain('Save d');
    expect(container.querySelector('.atlas-save[aria-pressed="true"] strong')?.textContent).toBe('Country d');
    expect(container.querySelector('.atlas-summary')?.textContent).toContain('Aucun événement accessible');
    act(() => button('Charger cette partie').click());
    expect(props.onLoadSave).toHaveBeenCalledExactlyOnceWith('d');
    render({ selectedSaveId: 'c' });
    expect(container.querySelector('.atlas-summary')?.textContent).toContain('Save c');
    expect(container.querySelector('.atlas-summary')?.textContent).not.toContain('Save d');
    expect(saves.map(s => s.id)).toEqual(original);
    act(() => button('Continuer').click()); expect(props.onContinue).toHaveBeenCalledOnce();
  });
  it('hides the panel when its selected save is deleted, without silently selecting another one', () => {
    const { render } = mount({ saves: [entry('a','2026-01-01')], selectedSaveId: 'a' });
    expect(container.querySelector('.atlas-summary')).not.toBeNull();
    render({ saves: [] });
    expect(container.querySelector('.atlas-summary')).toBeNull();
  });
  it('gates selection and explicit loading during initialization but keeps settings accessible', () => {
    mount({ ready: false, hasSave: true, saves: [entry('a','2026-01-01')], selectedSaveId: 'a' });
    for (const label of ['Continuer','Nouvelle partie','Charger une partie','Voir toutes','Charger cette partie']) expect(button(label).disabled).toBe(true);
    expect((container.querySelector('.atlas-save') as HTMLButtonElement).disabled).toBe(true);
    expect(button('Paramètres').disabled).toBe(false);
  });
  it('shows read errors honestly and renders only supplied summary records', () => {
    const { render } = mount({ saves: [entry('a','2026-01-01')], selectedSaveId: 'a', summary: { events: [], decisions: [], situations: [], error: 'Sauvegarde illisible' } });
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Sauvegarde illisible');
    render({ summary: { events: [{ id: '1', date: '2026-01-02', title: 'Stored headline', detail: 'partial' }], decisions: [], situations: [] } });
    expect(container.querySelector('.atlas-summary')?.textContent).toContain('Stored headline');
    expect(container.querySelector('.atlas-summary')?.textContent).not.toContain('Aucun événement accessible');
  });
  it('preserves reduced graphics scale when accessibility enlargement is not requested', () => {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.graphics.uiScale = 0.75;
    mount({ settings });
    expect((container.querySelector('.atlas-menu') as HTMLElement).style.getPropertyValue('--menu-ui-scale')).toBe('0.75');
  });
  it('applies the larger of graphics/accessibility scales and enables a scrollable large-UI layout', () => {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.accessibility.uiScale = 1.5;
    mount({ settings });
    expect(container.querySelector('.atlas-menu')?.classList.contains('atlas-large-ui')).toBe(true);
    expect((container.querySelector('.atlas-menu') as HTMLElement).style.getPropertyValue('--menu-ui-scale')).toBe('1.5');
  });
});
