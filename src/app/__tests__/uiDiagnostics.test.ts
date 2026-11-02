import { describe, it, expect, vi, afterEach } from 'vitest';
import { boundedJournal, startUiDiagnostics, DIAGNOSTIC_LIMIT, DIAGNOSTIC_DURATION_MS } from '../uiDiagnostics';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('volatile diagnostic bounds', () => {
  it('keeps the newest entries in chronological order after repeated wraps', () => {
    const journal = boundedJournal(3);
    for (let ms = 0; ms < 11; ms++) journal.add({ ms, type: 'event' });
    expect(journal.snapshot()).toEqual({ dropped: 8, rows: [8,9,10].map(ms => ({ ms, type: 'event' })) });
    const copy = journal.snapshot(); copy.rows.pop();
    expect(journal.snapshot().rows).toHaveLength(3);
  });
  it('retains the full first window and enforces finite production limits', () => {
    const journal = boundedJournal();
    for (let ms = 0; ms <= DIAGNOSTIC_LIMIT; ms++) journal.add({ ms, type: 'frame' });
    expect(journal.snapshot().rows).toHaveLength(DIAGNOSTIC_LIMIT);
    expect(journal.snapshot().rows[0].ms).toBe(1);
    expect(DIAGNOSTIC_DURATION_MS).toBe(300_000);
  });
  it('expires and removes every observer of input without persisting or continuing RAF', () => {
    vi.useFakeTimers();
    const win = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
    const doc = Object.assign(new EventTarget(), { hasFocus: () => true, visibilityState: 'visible' });
    vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', { userAgent: 'Windows Chrome/140.0.0.0' });
    vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 800); vi.stubGlobal('devicePixelRatio', 1);
    vi.stubGlobal('PerformanceObserver', undefined);
    const request = vi.fn(() => 42), cancel = vi.fn(), expired = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', cancel);
    const added = vi.spyOn(win, 'addEventListener'), removed = vi.spyOn(win, 'removeEventListener');
    const docAdded = vi.spyOn(doc, 'addEventListener'), docRemoved = vi.spyOn(doc, 'removeEventListener');
    const session = startUiDiagnostics(expired);
    session.screen('menu');
    vi.advanceTimersByTime(DIAGNOSTIC_DURATION_MS);
    expect(expired).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledWith(42);
    expect(removed.mock.calls.map(c => c[0])).toEqual(added.mock.calls.map(c => c[0]));
    expect(docRemoved.mock.calls.map(c => c[0])).toEqual(docAdded.mock.calls.map(c => c[0]));
    const stopped = session.snapshot();
    session.mark(); session.screen('game'); session.stop(); win.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(1000);
    expect(session.snapshot()).toEqual(stopped); expect(request).toHaveBeenCalledOnce();
    expect(stopped.stopped).toBe(true); expect(stopped.environment.longTasks).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
