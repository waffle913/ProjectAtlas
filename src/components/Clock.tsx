import type { SimulationState } from '../types';
export function Clock({ state, onChange }: {state: SimulationState; onChange: (next: SimulationState) => void}) {
  return <div className="clock"><span>SIMULATION DATE</span><strong>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${state.date}T00:00:00Z`))}</strong><div className="controls">
    <button onClick={() => onChange({...state, paused: !state.paused})}>{state.paused ? '▶ Resume' : 'Ⅱ Pause'}</button>
    {[1,2,4].map(speed => <button className={state.speed === speed ? 'active' : ''} key={speed} onClick={() => onChange({...state, speed: speed as 1|2|4})}>×{speed}</button>)}
  </div></div>
}
