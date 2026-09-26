import { describe, expect, it } from 'vitest'; import { SimulationClock } from '../clock';
const initial = {date:'2026-01-01', paused:true, speed:1 as const, territoryOwnership:{}};
describe('SimulationClock', () => {
  it('does not progress while paused and progresses when resumed', () => { const clock = new SimulationClock(initial); expect(clock.advance(5_000).date).toBe('2026-01-01'); clock.setPaused(false); expect(clock.advance(1_000).date).toBe('2026-01-02'); });
  it('applies speed multipliers deterministically', () => { const clock = new SimulationClock({...initial, paused:false}); clock.setSpeed(2); expect(clock.advance(1_000).date).toBe('2026-01-03'); clock.setSpeed(5); expect(clock.advance(1_000).date).toBe('2026-01-08'); });
});
