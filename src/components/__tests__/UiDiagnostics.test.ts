// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import * as diagnostics from '../../app/uiDiagnostics';
import { UiDiagnostics } from '../UiDiagnostics';

let root: Root | undefined;
let sessions: ReturnType<typeof diagnostics.startUiDiagnostics>[] = [];
const startSession = () => {
  const session = diagnostics.startUiDiagnostics(() => {}); sessions.push(session); return session;
};
const key = (name: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event); return event;
};
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PerformanceObserver', undefined);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 12)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
  act(() => root?.unmount()); root = undefined; document.body.replaceChildren();
  sessions.forEach(session => session.stop()); sessions = [];
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
describe('diagnostic keyboard receipt and retained context', () => {
  it('orders F9/F10 at receipt time, without inventing a queued event onset', () => {
    expect(key('F9').defaultPrevented).toBe(false);
    const session = startSession();
    const queued = new KeyboardEvent('keydown', { key: 'F9', cancelable: true });
    const rawStamp = queued.timeStamp;
    vi.advanceTimersByTime(250); window.dispatchEvent(queued);
    vi.advanceTimersByTime(100); expect(key('F10').defaultPrevented).toBe(true);
    const markers = session.snapshot().rows.filter(row => row.type.startsWith('symptom-'));
    expect(markers.map(row => row.type)).toEqual(['symptom-start', 'symptom-end']);
    expect(markers[0].receivedMs).toBe(250); expect(markers[0].eventTimeStampMs).toBe(rawStamp);
    expect(markers[1].receivedMs).toBe(350);
    expect(session.snapshot().rows.map(row => row.ms)).toEqual(session.snapshot().rows.map(row => row.ms).sort((a,b) => a-b));
    session.stop(); const stopped = session.snapshot();
    expect(key('F9').defaultPrevented).toBe(false); expect(key('F10').defaultPrevented).toBe(false);
    expect(session.snapshot()).toEqual(stopped);
  });
  it('works in an input without consuming text, modifiers, repeats or composition', () => {
    const session = startSession();
    const input = document.createElement('input'); document.body.append(input); input.focus(); input.value = 'unchanged';
    const event = new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true });
    input.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); expect(input.value).toBe('unchanged');
    for (const options of [{ctrlKey:true},{altKey:true},{shiftKey:true},{metaKey:true},{repeat:true},{isComposing:true}]) {
      expect(key('F10', options).defaultPrevented).toBe(false);
    }
    expect(key('a').defaultPrevented).toBe(false);
    expect(session.snapshot().keyboard.keyboardMarkersReceived).toBe(1); session.stop();
  });
  it('pins preceding events with measured coverage despite ring overwrite, bounded to four contexts', () => {
    const session = startSession(); session.screen('menu');
    session.mark();
    expect(session.snapshot().markerContexts[0].marker.type).toBe('user-marker');
    window.dispatchEvent(new MouseEvent('mousemove', {clientX:72,clientY:31}));
    vi.advanceTimersByTime(1000); key('F9');
    for (let n = 0; n < diagnostics.DIAGNOSTIC_LIMIT + 10; n++) document.dispatchEvent(new Event('visibilitychange'));
    const report = session.snapshot();
    expect(report.dropped).toBeGreaterThan(0); expect(report.rows).toHaveLength(diagnostics.DIAGNOSTIC_LIMIT);
    expect(report.rows.some(row => row.type === 'symptom-start')).toBe(false);
    expect(report.markerContexts[1].rows.some(row => row.type === 'mousemove' && row.x === 72)).toBe(true);
    expect(report.markerContexts[1].coverage.spanMs).toBe(1000);
    for (let n = 0; n < 5; n++) key(n % 2 ? 'F9' : 'F10');
    expect(session.snapshot().markerContexts).toHaveLength(4);
    expect(session.snapshot().discardedMarkerContexts).toBe(3); session.stop();
  });
  it('does not listen while inactive and removes keyboard listeners on component unmount', () => {
    const start = vi.spyOn(diagnostics, 'startUiDiagnostics');
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    act(() => root!.render(createElement(UiDiagnostics, {screen:'settings'})));
    expect(start).not.toHaveBeenCalled(); expect(key('F10').defaultPrevented).toBe(false);
    act(() => container.querySelector('button')!.click());
    const session = start.mock.results[0].value as ReturnType<typeof diagnostics.startUiDiagnostics>;
    key('F9'); expect(session.snapshot().keyboard.keyboardMarkersReceived).toBe(1);
    act(() => root!.unmount()); root = undefined;
    const stopped = session.snapshot(); expect(stopped.stopped).toBe(true);
    expect(key('F9').defaultPrevented).toBe(false); expect(session.snapshot()).toEqual(stopped);
  });
});
