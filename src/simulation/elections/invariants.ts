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
      if (!entry || !entry.chambers) { errors.push(`Elections ${countryId} has a malformed chamber map.`); continue; }
      let totalSeats = 0;
      for (const [chamberId, chamber] of Object.entries(entry.chambers)) {
        if (!chamber || chamber.chamberId !== chamberId || !Number.isSafeInteger(chamber.totalSeats) || chamber.totalSeats < 0 || !Number.isSafeInteger(chamber.independentOtherSeats) || chamber.independentOtherSeats < 0) { errors.push(`Elections ${countryId} chamber ${chamberId} is malformed.`); continue; }
        const allocated = Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0);
        if (allocated > chamber.totalSeats) errors.push(`Elections ${countryId} chamber ${chamberId} allocates ${allocated} seats for ${chamber.totalSeats} total.`);
        for (const [partyId, count] of Object.entries(chamber.seatsByParty)) if (!Number.isSafeInteger(count) || count < 0) errors.push(`Elections ${countryId} chamber ${chamberId} party ${partyId} has an invalid seat count.`);
        if (chamber.lastElectionDate && !validDate(chamber.lastElectionDate)) errors.push(`Elections ${countryId} chamber ${chamberId} has a malformed election date.`);
        totalSeats += chamber.totalSeats;
      }
      for (const party of Object.values(entry.parties)) {
        if (!Number.isSafeInteger(party.currentSeats) || party.currentSeats < 0) errors.push(`Elections ${countryId} party ${party.partyId} has invalid current seats.`);
        if (party.credibilityBps !== undefined && (party.credibilityBps < 0 || party.credibilityBps > 10000)) errors.push(`Elections ${countryId} party ${party.partyId} has invalid credibility.`);
        for (const promise of party.promises) {
          if (!validDate(promise.madeOn) || promise.madeOn > state.date) errors.push(`Elections ${countryId} party ${party.partyId} has a malformed promise date.`);
          if (!['fiscal_reform', 'constitutional_amendment'].includes(promise.promisedKind) || !['pending', 'fulfilled', 'partially_fulfilled', 'broken', 'unavailable'].includes(promise.status)) errors.push(`Elections ${countryId} party ${party.partyId} has an invalid campaign promise.`);
          if (promise.credibilityBps !== undefined && (promise.credibilityBps < 0 || promise.credibilityBps > 10000)) errors.push(`Elections ${countryId} party ${party.partyId} has an invalid promise credibility.`);
        }
      }
      if (!['majority', 'minority', 'coalition', 'unavailable'].includes(entry.government.confidence)) errors.push(`Elections ${countryId} has an invalid government confidence.`);
      for (const coalitionPartyId of entry.government.coalitionPartyIds) {
        if (!entry.parties[coalitionPartyId]) errors.push(`Elections ${countryId} government references unknown party ${coalitionPartyId}.`);
      }
    }
    return errors;
  },
};
