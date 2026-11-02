// UI-only, volatile diagnostics. Never reads campaign, preferences, DOM text or storage.
export const DIAGNOSTIC_LIMIT = 2400;
export const DIAGNOSTIC_DURATION_MS = 5 * 60_000;
export const DIAGNOSTIC_MARKER_CONTEXTS = 4;
type Row = { ms: number; type: string; [key: string]: unknown };
export function boundedJournal(limit = DIAGNOSTIC_LIMIT) {
  const rows: Row[] = [];
  let next = 0, dropped = 0;
  return {
    add(row: Row) {
      if (rows.length < limit) rows.push(row);
      else { rows[next] = row; next = (next + 1) % limit; dropped++; }
    },
    snapshot: () => ({ dropped, rows: rows.length < limit || next === 0 ? [...rows] : [...rows.slice(next), ...rows.slice(0, next)] }),
  };
}
export function startUiDiagnostics(onExpired: () => void) {
  const journal = boundedJournal(), started = performance.now();
  let stopped = false, stoppedAt = 0, raf = 0, lastFrame = started, bucketStart = started;
  let count = 0, total = 0, max = 0, over50 = 0, lastMove = -Infinity, moveCount = 0;
  const counts: Record<string, number> = {};
  const record = (type: string, values: Record<string, unknown> = {}) => {
    if (!stopped) journal.add({ ms: Math.round(performance.now() - started), type, ...values });
  };
  const viewport = () => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, focused: document.hasFocus(), visibility: document.visibilityState });
  const cleanups: (() => void)[] = [];
  const listen = (target: EventTarget, name: string, listener: EventListener, passive = true) => {
    target.addEventListener(name, listener, { capture: true, passive });
    cleanups.push(() => target.removeEventListener(name, listener, { capture: true }));
  };
  const mouse: EventListener = event => {
    const e = event as PointerEvent;
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (e.type === 'pointermove' || e.type === 'mousemove') {
      moveCount++;
      if (performance.now() - lastMove < 100) return;
      lastMove = performance.now();
    }
    const target = e.target instanceof Element ? e.target : null;
    record(e.type, { x: e.clientX, y: e.clientY, button: e.button, buttons: e.buttons,
      pointerType: e.pointerType ?? null, pointerId: e.pointerId ?? null,
      captured: target && e.pointerId !== undefined ? target.hasPointerCapture(e.pointerId) : null,
      target: target?.tagName ?? null, cursor: target ? getComputedStyle(target).cursor : null });
  };
  for (const name of ['pointermove','mousemove','pointerdown','pointerup','mousedown','mouseup','pointercancel','gotpointercapture','lostpointercapture','contextmenu']) listen(window, name, mouse);
  for (const name of ['focus','blur','resize']) listen(window, name, event => {
    // Capturing focus/blur also receives child controls' events. They do not
    // establish native-window focus loss (e.g. clicking an ordinary button).
    if (event.target === window) record(name, viewport());
  });
  listen(document, 'visibilitychange', () => record('visibility', viewport()));
  for (const name of ['animationstart','animationend','animationcancel','transitionrun','transitionend','transitioncancel']) {
    listen(document, name, e => record(name, { target: e.target instanceof Element ? e.target.tagName : null }));
  }
  let observer: PerformanceObserver | undefined;
  let longTasks = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask');
  const recordTasks = (entries: PerformanceEntry[]) => { for (const e of entries) record('longtask', { startMs: Math.round(e.startTime - started), durationMs: Math.round(e.duration) }); };
  if (longTasks) {
    try {
      observer = new PerformanceObserver(list => recordTasks(list.getEntries()));
      observer.observe({ type: 'longtask' });
    } catch { observer?.disconnect(); observer = undefined; longTasks = false; }
  }
  const flushFrames = (now: number, receivedMs = Math.round(performance.now() - started)) => {
    record('frames', { ms: receivedMs, windowMs: Math.round(now - bucketStart), count, meanMs: count ? total / count : null, maxMs: max, over50, moveCount, ...viewport() });
    bucketStart = now; count = total = max = over50 = moveCount = 0;
  };
  const coverage = (rows: Row[]) => ({ firstMs: rows[0]?.ms ?? null, lastMs: rows.at(-1)?.ms ?? null,
    spanMs: rows.length ? rows.at(-1)!.ms - rows[0].ms : 0, entries: rows.length });
  const markerContexts: { marker: Row; droppedBeforeMarker: number; coverage: ReturnType<typeof coverage>; rows: Row[] }[] = [];
  let discardedMarkerContexts = 0, keyboardMarkersReceived = 0;
  const captureMarker = (type: string, values: Record<string, unknown>) => {
    if (stopped) return;
    const now = performance.now(), receivedMs = Math.round(now - started);
    flushFrames(now, receivedMs);
    const marker: Row = { ms: receivedMs, receivedMs, type, ...values, sincePreviousFrameMs: Math.max(0, now - lastFrame),
      timingMeaning: 'handler receipt only; symptom onset/recovery time unknown', ...viewport() };
    journal.add(marker);
    const before = journal.snapshot();
    markerContexts.push({ marker, droppedBeforeMarker: before.dropped, coverage: coverage(before.rows), rows: before.rows });
    if (markerContexts.length > DIAGNOSTIC_MARKER_CONTEXTS) { markerContexts.shift(); discardedMarkerContexts++; }
  };
  listen(window, 'keydown', event => {
    const e = event as KeyboardEvent;
    if (stopped || e.repeat || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || (e.key !== 'F9' && e.key !== 'F10')) return;
    // Only bare function keys while explicitly recording. F10's browser menu
    // default is suppressed; ordinary text, modifiers and IME stay untouched.
    e.preventDefault(); keyboardMarkersReceived++;
    captureMarker(e.key === 'F9' ? 'symptom-start' : 'symptom-end', { source: 'keyboard', eventTimeStampMs: e.timeStamp });
  }, false);
  const frame = (now: number) => {
    const gap = now - lastFrame; lastFrame = now;
    count++; total += gap; max = Math.max(max, gap); if (gap > 50) over50++;
    if (now - bucketStart >= 1000) flushFrames(now);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  // Diagnostic expiry only; never a simulation timer. Hidden windows may throttle it.
  const expiry = window.setTimeout(() => { stop(); onExpired(); }, DIAGNOSTIC_DURATION_MS);
  function stop() {
    if (stopped) return;
    stoppedAt = performance.now(); cancelAnimationFrame(raf); clearTimeout(expiry);
    if (observer) { recordTasks(observer.takeRecords()); observer.disconnect(); }
    cleanups.forEach(cleanup => cleanup()); flushFrames(performance.now()); record('stop'); stopped = true;
  }
  const ua = navigator.userAgent;
  const environment = {
    windows: /Windows/.test(ua), chromium: ua.match(/(?:Chrome|Chromium)\/[\d.]+/)?.[0] ?? null,
    edge: ua.match(/Edg\/[\d.]+/)?.[0] ?? null,
    tauriBridgePresent: '__TAURI_INTERNALS__' in window, longTasks,
    gpu: 'unavailable: no diagnostic WebGL context created, preserving the menu-without-globe comparison',
    webView2ExactVersion: 'unavailable: Chromium UA does not establish the installed WebView2 version',
    gpuDriver: 'unavailable: collect manually using Windows diagnostics',
    build: import.meta.env.VITE_DIAGNOSTIC_SHA ?? 'development/unknown',
  };
  record('start', viewport());
  return {
    stop,
    screen: (screen: string) => { if (!stopped) record('screen', { screen }); },
    mark: () => captureMarker('user-marker', { source: 'button' }),
    snapshot: () => {
      const current = journal.snapshot();
      return { schema: 'projectatlas-ui-diagnostic-v2', environment, elapsedMs: Math.round((stopped ? stoppedAt : performance.now()) - started), stopped, counts: { ...counts }, ...current,
        coverage: coverage(current.rows), markerContexts: markerContexts.map(context => ({ ...context, rows: [...context.rows] })), discardedMarkerContexts,
        limits: { entries: DIAGNOSTIC_LIMIT, markerContexts: DIAGNOSTIC_MARKER_CONTEXTS, durationMs: DIAGNOSTIC_DURATION_MS },
        keyboard: { keyboardMarkersReceived, keys: ['F9', 'F10'], timingMeaning: 'receipt time, never inferred symptom time',
          limitation: 'No receipt cannot distinguish no press, blocked JS, lost native focus or OS interception. RAF gaps and focus/visibility are supporting observations only.' } };
    },
  };
}
