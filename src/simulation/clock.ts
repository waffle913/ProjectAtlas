import { requestEconomicShock } from './socioeconomy/runtime';
import type { Shock } from './socioeconomy/model';
import type { SimulationState } from '../types';
import { createCoreScheduler } from './engine';
import type { SimulationScheduler } from './scheduler';
import { cloneSimulationState } from './state';

const MS_PER_GAME_DAY = 1_000;

/** UI-agnostic simulation time. Call advance with measured real elapsed milliseconds. */
export class SimulationClock {
  private elapsed = 0;
  private current: SimulationState;
  private readonly scheduler: SimulationScheduler;
  constructor(initial: SimulationState, scheduler: SimulationScheduler = createCoreScheduler()) {
    this.current = cloneSimulationState(initial);
    this.scheduler = scheduler;
  }
  snapshot = () => cloneSimulationState(this.current);
  setEconomicShock = (regionId: string, shock: Shock) => { this.current = requestEconomicShock(this.current, this.scheduler, regionId, shock); };
  setPaused = (paused: boolean) => { this.current = {...this.current, paused}; };
  setSpeed = (speed: 1 | 2 | 5) => { this.current = {...this.current, speed}; };
  setTerritoryOwnership = (territoryOwnership: Record<string, string | undefined>) => { this.current = {...this.current, territoryOwnership: {...territoryOwnership}}; };
  setRegionOwnership = (regionOwnership: Record<string, string | undefined>) => { this.current = {...this.current, regionOwnership: {...regionOwnership}}; };
  setPopulationByRegion = (populationByRegion: Record<string, number | undefined>) => { this.current = {...this.current, populationByRegion: {...populationByRegion}}; };
  setEconomicOutputByRegion = (economicOutputByRegion: Record<string, number | undefined>) => { this.current = {...this.current, economicOutputByRegion: {...economicOutputByRegion}}; };
  setDiplomacy = (diplomacy: Pick<SimulationState, 'bilateralRelations' | 'claims' | 'explicitCasusBelli'>) => { this.current = cloneSimulationState({ ...this.current, ...diplomacy }); };
  setWars = (warState: Pick<SimulationState, 'wars' | 'occupationByRegion'>) => { this.current = cloneSimulationState({ ...this.current, ...warState }); };
  setCountries = (countryIds: Iterable<string>) => {
    const fidelityByCountry = { ...this.current.engine.fidelityByCountry };
    for (const countryId of countryIds) fidelityByCountry[countryId] ??= 'Standard';
    this.current = { ...this.current, engine: { ...this.current.engine, fidelityByCountry } };
  };
  private advanceTime = (realElapsedMs: number) => {
    if (!Number.isFinite(realElapsedMs) || this.current.paused || realElapsedMs <= 0) return false;
    this.elapsed += realElapsedMs * this.current.speed;
    const wholeDays = Math.floor(this.elapsed / MS_PER_GAME_DAY);
    if (wholeDays) {
      for (let day = 0; day < wholeDays; day += 1) this.current = this.scheduler.advanceOneDay(this.current).state;
      this.elapsed -= wholeDays * MS_PER_GAME_DAY;
    }
    return wholeDays > 0;
  };
  advance = (realElapsedMs: number) => { this.advanceTime(realElapsedMs); return this.snapshot(); };
  /** UI polling need not clone 40,000 cohorts when no logical day elapsed. */
  advanceIfChanged = (realElapsedMs: number) => this.advanceTime(realElapsedMs) ? this.snapshot() : undefined;
}
