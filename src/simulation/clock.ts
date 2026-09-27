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
  constructor(initial: SimulationState) { this.current = cloneState(initial); }
  snapshot = () => cloneState(this.current);
  setPaused = (paused: boolean) => { this.current = {...this.current, paused}; };
  setSpeed = (speed: 1 | 2 | 5) => { this.current = {...this.current, speed}; };
  setTerritoryOwnership = (territoryOwnership: Record<string, string | undefined>) => { this.current = {...this.current, territoryOwnership: {...territoryOwnership}}; };
  setRegionOwnership = (regionOwnership: Record<string, string | undefined>) => { this.current = {...this.current, regionOwnership: {...regionOwnership}}; };
  setPopulationByRegion = (populationByRegion: Record<string, number | undefined>) => { this.current = {...this.current, populationByRegion: {...populationByRegion}}; };
  setEconomicOutputByRegion = (economicOutputByRegion: Record<string, number | undefined>) => { this.current = {...this.current, economicOutputByRegion: {...economicOutputByRegion}}; };
  setDiplomacy = (diplomacy: Pick<SimulationState, 'bilateralRelations' | 'claims' | 'explicitCasusBelli'>) => { this.current = cloneState({ ...this.current, ...diplomacy }); };
  advance = (realElapsedMs: number) => {
    if (this.current.paused || realElapsedMs <= 0) return this.snapshot();
    this.elapsed += realElapsedMs * this.current.speed;
    const wholeDays = Math.floor(this.elapsed / MS_PER_GAME_DAY);
    if (wholeDays) { this.current = {...this.current, date: dateAfterDays(this.current.date, wholeDays)}; this.elapsed -= wholeDays * MS_PER_GAME_DAY; }
    return this.snapshot();
  };
}

const cloneState = (state: SimulationState): SimulationState => ({ ...state, territoryOwnership: { ...state.territoryOwnership }, regionOwnership: { ...state.regionOwnership }, populationByRegion: { ...state.populationByRegion }, economicOutputByRegion: { ...state.economicOutputByRegion }, bilateralRelations: Object.fromEntries(Object.entries(state.bilateralRelations).map(([key, relation]) => [key, { ...relation }])), claims: state.claims.map(claim => ({ ...claim })), explicitCasusBelli: state.explicitCasusBelli.map(cb => ({ ...cb, targetRegionIds: cb.targetRegionIds ? [...cb.targetRegionIds] : undefined })) });
