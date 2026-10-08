import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { ELECTIONS_VERSION } from './model';

export const electionsInvariant: SimulationInvariant = {
  id: 'elections-0.23-integrity',
  check: (state) => {
    const errors: string[] = [];
    const e = state.elections;
    if (!e || e.version !== ELECTIONS_VERSION || !e.countries) return ['Malformed elections state.'];
    for (const [countryId, entry] of Object.entries(e.countries)) {
      if (!entry || !Number.isSafeInteger(entry.totalSeats) || entry.totalSeats < 0) { errors.push(`Elections ${countryId} has a malformed seat total.`); continue; }
      const allocated = Object.values(entry.seatsByParty).reduce((a, b) => a + b, 0);
      if (allocated > entry.totalSeats) errors.push(`Elections ${countryId} allocates ${allocated} seats for ${entry.totalSeats} total.`);
      for (const [partyId, count] of Object.entries(entry.seatsByParty)) {
        if (!Number.isSafeInteger(count) || count < 0) errors.push(`Elections ${countryId} party ${partyId} has an invalid seat count.`);
      }
      for (const party of Object.values(entry.parties)) {
        if (!Number.isSafeInteger(party.currentSeats) || party.currentSeats < 0) errors.push(`Elections ${countryId} party ${party.partyId} has invalid current seats.`);
        if (party.credibilityBps !== undefined && (party.credibilityBps < 0 || party.credibilityBps > 10000)) errors.push(`Elections ${countryId} party ${party.partyId} has invalid credibility.`);
        for (const promise of party.promises) if (!validDate(promise.madeOn) || promise.madeOn > state.date) errors.push(`Elections ${countryId} party ${party.partyId} has a malformed promise date.`);
      }
      if (entry.lastElectionDate && !validDate(entry.lastElectionDate)) errors.push(`Elections ${countryId} has a malformed election date.`);
    }
    return errors;
  },
};
