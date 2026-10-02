import { describe, expect, it } from 'vitest';
import { isSimulationDate } from '../date';
import { roundHalfAwayFromZero, scaledRatioSigned } from '../integerMath';
import { deterministicInteger, deterministicUint32 } from '../rng';

describe('foundation exact date/math and unbiased keyed integers', () => {
  it.each(['2026-02-30', '2026-13-01', '2026-00-10', 'not-a-date', '', undefined, 20260101])('rejects invalid date %s', date => {
    expect(isSimulationDate(date)).toBe(false);
  });
  it('admits real leap days only', () => {
    expect(isSimulationDate('2028-02-29')).toBe(true); expect(isSimulationDate('2026-02-29')).toBe(false);
  });
  it.each([1, 3])('rounds signed half ratios symmetrically for %s', value => {
    expect(scaledRatioSigned(value, 1, 2)).toBe((value + 1) / 2);
    expect(scaledRatioSigned(-value, 1, 2)).toBe(-(value + 1) / 2);
    expect(roundHalfAwayFromZero(-value / 2)).toBe(-roundHalfAwayFromZero(value / 2));
  });
  it('scales safely beyond Number intermediate precision and rejects invalid/unsafe inputs', () => {
    expect(scaledRatioSigned(Number.MAX_SAFE_INTEGER, 10_000, Number.MAX_SAFE_INTEGER)).toBe(10_000);
    for (const args of [[1, 1, 0], [1, -1, 1], [1.5, 1, 1], [Number.MAX_SAFE_INTEGER, 2, 1]]) expect(() => scaledRatioSigned(...args as [number, number, number])).toThrow();
    expect(() => roundHalfAwayFromZero(Infinity)).toThrow();
  });
  it('preserves the exact parent uint32 and accepted small-range fixtures', () => {
    const fixtures = [
      { key: { system: 'economy', entityId: 'country.a', date: '2026-02-01', tick: 31, eventKey: 'monthly' }, uint32: 912463589, small: -2648 },
      ...[['0', 3331147769, -312], ['1', 921759860, 2694], ['2', 4116184619, -1958]].map(([eventKey, uint32, small]) => ({ key: { system: 'fixture', eventKey: String(eventKey) }, uint32, small })),
    ];
    for (const fixture of fixtures) {
      expect(deterministicUint32('seed.001', fixture.key)).toBe(fixture.uint32);
      expect(deterministicInteger('seed.001', fixture.key, -5000, 5001)).toBe(fixture.small);
    }
  });
  it('rejects biased first samples instead of reducing them modulo the span', () => {
    const key = { system: 'rejection', eventKey: '0' }, span = 2147483649;
    expect(deterministicUint32('seed.001', key)).toBe(3468651603);
    const result = deterministicInteger('seed.001', key, 0, span);
    expect(result).not.toBe(3468651603 % span); expect(result).toBeGreaterThanOrEqual(0); expect(result).toBeLessThan(span);
    expect(deterministicInteger('seed.001', key, 0, span)).toBe(result);
  });
  it('supports full uint32, wide safe ranges and negative bounds independent of order', () => {
    const key = { system: 'fixture', eventKey: '0' };
    expect(deterministicInteger('seed.001', key, 0, 2 ** 32)).toBe(deterministicUint32('seed.001', key));
    const wide = deterministicInteger('seed.001', key, 0, Number.MAX_SAFE_INTEGER);
    expect(wide).toBeGreaterThan(2 ** 32); expect(wide).toBeLessThan(Number.MAX_SAFE_INTEGER);
    deterministicInteger('another', key, -10, 20);
    expect(deterministicInteger('seed.001', key, 0, Number.MAX_SAFE_INTEGER)).toBe(wide);
    expect(deterministicInteger('seed.001', key, -Number.MAX_SAFE_INTEGER, 0)).toBeLessThan(0);
    for (const [min, max] of [[0, 0], [1, 0], [0.5, 2], [0, Infinity], [-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]]) expect(() => deterministicInteger('seed', key, min, max)).toThrow();
  });
});
