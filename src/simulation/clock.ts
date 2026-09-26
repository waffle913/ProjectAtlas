import type { SimulationState } from '../types';

const MS_PER_GAME_DAY = 1_000;
const dateAfterDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** UI-agnostic simulation time. Call advance with measured real elapsed milliseconds. */
export class SimulationClock {
  private elapsed = 0;
  private current: SimulationState;
  constructor(initial: SimulationState) { this.current = {...initial, territoryOwnership: {...initial.territoryOwnership}, regionOwnership: {...initial.regionOwnership}}; }
  snapshot = () => ({...this.current, territoryOwnership: {...this.current.territoryOwnership}, regionOwnership: {...this.current.regionOwnership}});
  setPaused = (paused: boolean) => { this.current = {...this.current, paused}; };
  setSpeed = (speed: 1 | 2 | 5) => { this.current = {...this.current, speed}; };
  setTerritoryOwnership = (territoryOwnership: Record<string, string | undefined>) => { this.current = {...this.current, territoryOwnership: {...territoryOwnership}}; };
  setRegionOwnership = (regionOwnership: Record<string, string | undefined>) => { this.current = {...this.current, regionOwnership: {...regionOwnership}}; };
  advance = (realElapsedMs: number) => {
    if (this.current.paused || realElapsedMs <= 0) return this.snapshot();
    this.elapsed += realElapsedMs * this.current.speed;
    const wholeDays = Math.floor(this.elapsed / MS_PER_GAME_DAY);
    if (wholeDays) { this.current = {...this.current, date: dateAfterDays(this.current.date, wholeDays)}; this.elapsed -= wholeDays * MS_PER_GAME_DAY; }
    return this.snapshot();
  };
}
