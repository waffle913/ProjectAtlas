import { describe, it, expect } from 'vitest';
import { boundedJournal, DIAGNOSTIC_LIMIT, DIAGNOSTIC_DURATION_MS } from '../uiDiagnostics';
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
});
