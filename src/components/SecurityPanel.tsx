import { useState } from 'react';
import type { SimulationState } from '../types';
import { declareEmergency, endEmergency } from '../simulation/constitution/runtime';

/** Security / state-of-emergency powers. The canonical declare/end procedures
 *  require an active crisis and the executive office; both fail closed with the
 *  refusal reason surfaced here. No security mechanic is invented. */
export function SecurityPanel({ state, countryId, personId, onStateChange }: {
  state: SimulationState;
  countryId: string;
  personId: string | undefined;
  onStateChange: (next: SimulationState) => void;
}) {
  const person = personId ? state.governance.persons[personId] : undefined;
  const isExecutive = Boolean(person?.status === 'active' && person.office?.countryId === countryId && ['head_of_government', 'head_of_state'].includes(person.office.role));
  const entry = state.constitution.countries[countryId];
  const emergency = entry?.emergency;
  const [message, setMessage] = useState('');
  const command = (run: () => SimulationState) => {
    try { onStateChange(run()); setMessage('Recorded. Emergency powers apply through the canonical constitution system.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  return <section>
    <h2>State of emergency</h2>
    {emergency
      ? <p>Status: {emergency.status}{emergency.status !== 'none' ? ` · justifying crises ${emergency.justificationEpisodeIds.length} · police powers ${emergency.restrictions.policePowersEnhanced ? 'enhanced' : 'standard'}` : ''}</p>
      : <p>Constitutional emergency status is unavailable for this Country.</p>}
    {isExecutive ? <>
      {(!emergency || emergency.status === 'none')
        ? <button onClick={() => command(() => declareEmergency(state, countryId, personId!))}>Declare state of emergency</button>
        : <button onClick={() => command(() => endEmergency(state, countryId, personId!))}>End state of emergency</button>}
    </> : <p>Only the executive head may declare or end a state of emergency.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
