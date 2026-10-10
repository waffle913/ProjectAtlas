import { emptyOperations } from '../operations/model';
import { emptyInternational } from '../international/model';
import { emptyMultilateral } from '../multilateral/model';
import { emptyConstitution } from '../constitution/model';
import { emptyElections } from '../elections/model';
import { emptyAssets } from '../assets/model';
import { emptyTrade } from '../trade/model';
import { emptyMilitary } from '../military/model';
import { emptyFiscal } from '../fiscal/model';
import { emptyCrisis } from '../crisis/model';
import { emptyPolitics } from '../politics/model';
import { emptyGovernance } from '../governance/model';
import { emptyInformation } from '../information/model';
import { emptySocioeconomy } from '../../simulation/socioeconomy/model';
import { describe, expect, it } from 'vitest'; import { SimulationClock } from '../clock'; import { createEngineState } from '../state'; import { createCoreScheduler } from '../engine';
const initial = {schemaVersion: 20 as const, operations: emptyOperations(), international: emptyInternational(), multilateral: emptyMultilateral(), constitution: emptyConstitution(), elections: emptyElections(), assets: emptyAssets(), trade: emptyTrade(), military: emptyMilitary(), governance: emptyGovernance('2026-01-01'), information: emptyInformation('2026-01-01'), politics: emptyPolitics(), crisis: emptyCrisis(), fiscal: emptyFiscal(), socioeconomy: emptySocioeconomy(),date:'2026-01-01', paused:true, speed:1 as const, territoryOwnership:{},regionOwnership:{},populationByRegion:{},economicOutputByRegion:{},bilateralRelations:{},claims:[],explicitCasusBelli:[],wars:[],occupationByRegion:{},engine:createEngineState()};
describe('SimulationClock', () => {
  it('does not progress while paused and progresses when resumed', () => { const clock = new SimulationClock(initial); expect(clock.advance(5_000).date).toBe('2026-01-01'); clock.setPaused(false); expect(clock.advance(1_000).date).toBe('2026-01-02'); });
  it('applies speed multipliers deterministically', () => { const clock = new SimulationClock({...initial, paused:false}); clock.setSpeed(2); expect(clock.advance(1_000).date).toBe('2026-01-03'); expect(clock.snapshot().engine.tick).toBe(2); clock.setSpeed(5); expect(clock.advance(1_000).date).toBe('2026-01-08'); expect(clock.snapshot().engine.tick).toBe(7); });
  it('executes external monthly tasks registered in its injected runtime scheduler', () => {
    let monthlyRuns = 0;
    const scheduler = createCoreScheduler().register({ id: 'economy.monthly-test', cadence: 'monthly', run: state => { monthlyRuns += 1; return state; } });
    const clock = new SimulationClock({ ...initial, date: '2026-01-30', paused: false }, scheduler);
    expect(clock.advance(2_000).date).toBe('2026-02-01');
    expect(monthlyRuns).toBe(1);
  });
});
