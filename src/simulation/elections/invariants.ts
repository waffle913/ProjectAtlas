import type { SimulationInvariant } from '../invariants';
import { isSimulationDate as validDate } from '../date';
import { ELECTIONS_VERSION } from './model';
import { politicalRegistry } from '../politics/registry';

export const electionsInvariant: SimulationInvariant = {
  id: 'elections-0.23-integrity',
  check: (state) => {
    const errors: string[] = [];
    const e = state.elections;
    if (!e || e.version !== ELECTIONS_VERSION || !e.countries) return ['Malformed elections state.'];
    for (const [countryId, entry] of Object.entries(e.countries)) {
      if (!entry || !entry.chambers) { errors.push(`Elections ${countryId} has a malformed chamber map.`); continue; }
      let totalSeats = 0;
      const chamberSeatSums: Record<string, number> = {};
      for (const [chamberId, chamber] of Object.entries(entry.chambers)) {
        if (!chamber || chamber.chamberId !== chamberId || !Number.isSafeInteger(chamber.totalSeats) || chamber.totalSeats < 0 || !Number.isSafeInteger(chamber.independentOtherSeats) || chamber.independentOtherSeats < 0 || !Number.isSafeInteger(chamber.unallocatedSeats) || chamber.unallocatedSeats < 0) { errors.push(`Elections ${countryId} chamber ${chamberId} is malformed.`); continue; }
        const allocated = Object.values(chamber.seatsByParty).reduce((a, b) => a + b, 0);
        // Exact seat reconciliation: party seats + independents + explicit unknown must equal the
        // chamber total — a seat is never silently lost or double-counted.
        if (allocated + chamber.independentOtherSeats + chamber.unallocatedSeats !== chamber.totalSeats) {
          errors.push(`Elections ${countryId} chamber ${chamberId} does not reconcile exactly: ${allocated} party + ${chamber.independentOtherSeats} independent + ${chamber.unallocatedSeats} unallocated != ${chamber.totalSeats} total.`);
        }
        for (const [partyId, count] of Object.entries(chamber.seatsByParty)) {
          if (!Number.isSafeInteger(count) || count < 0) errors.push(`Elections ${countryId} chamber ${chamberId} party ${partyId} has an invalid seat count.`);
          chamberSeatSums[partyId] = (chamberSeatSums[partyId] ?? 0) + count;
          // Every party identity must exist: a registry party of the Country or a dynamic party
          // organization of the Country — never an invented identity.
          const registryParty = politicalRegistry.parties[partyId];
          const dynamicParty = state.politics.organizations[partyId];
          const known = (registryParty && registryParty.countryId === countryId) || (dynamicParty?.type === 'party' && dynamicParty.countryId === countryId);
          if (!known) errors.push(`Elections ${countryId} chamber ${chamberId} references an unknown party ${partyId}.`);
        }
        if (chamber.lastElectionDate && !validDate(chamber.lastElectionDate)) errors.push(`Elections ${countryId} chamber ${chamberId} has a malformed election date.`);
        if (chamber.nextElectionDate && !validDate(chamber.nextElectionDate)) errors.push(`Elections ${countryId} chamber ${chamberId} has a malformed next-election date.`);
        if (chamber.lastElectionTurnout !== undefined) {
          const turnout = chamber.lastElectionTurnout;
          if (!Number.isSafeInteger(turnout.participationBps) || turnout.participationBps < 0 || turnout.participationBps > 10_000 || !['complete', 'partial', 'unavailable'].includes(turnout.eligibilityCoverage) || !turnout.limitation?.trim()) errors.push(`Elections ${countryId} chamber ${chamberId} has an invalid turnout record.`);
        }
        totalSeats += chamber.totalSeats;
      }
      for (const party of Object.values(entry.parties)) {
        if (!Number.isSafeInteger(party.currentSeats) || party.currentSeats < 0) errors.push(`Elections ${countryId} party ${party.partyId} has invalid current seats.`);
        // currentSeats must reconcile exactly with the chamber allocations.
        if (party.currentSeats !== (chamberSeatSums[party.partyId] ?? 0)) errors.push(`Elections ${countryId} party ${party.partyId} current seats (${party.currentSeats}) do not reconcile with the chambers (${chamberSeatSums[party.partyId] ?? 0}).`);
        if (party.credibilityBps !== undefined && (party.credibilityBps < 0 || party.credibilityBps > 10000)) errors.push(`Elections ${countryId} party ${party.partyId} has invalid credibility.`);
        if (!['government', 'opposition', 'unavailable'].includes(party.governmentStatus)) errors.push(`Elections ${countryId} party ${party.partyId} has an invalid government status.`);
        if (entry.government.confidence !== 'unavailable' && entry.government.coalitionPartyIds.length > 0) {
          const expected = entry.government.coalitionPartyIds.includes(party.partyId) ? 'government' : 'opposition';
          if (party.governmentStatus !== expected) errors.push(`Elections ${countryId} party ${party.partyId} government status (${party.governmentStatus}) contradicts the governing coalition (expected ${expected}).`);
        }
        for (const promise of party.promises) {
          if (!validDate(promise.madeOn) || promise.madeOn > state.date) errors.push(`Elections ${countryId} party ${party.partyId} has a malformed promise date.`);
          if (!['fiscal_reform', 'constitutional_amendment'].includes(promise.promisedKind) || !['pending', 'fulfilled', 'partially_fulfilled', 'broken', 'unavailable'].includes(promise.status)) errors.push(`Elections ${countryId} party ${party.partyId} has an invalid campaign promise.`);
          if (promise.credibilityBps !== undefined && (promise.credibilityBps < 0 || promise.credibilityBps > 10000)) errors.push(`Elections ${countryId} party ${party.partyId} has an invalid promise credibility.`);
          if (promise.madeByPersonId !== undefined && (!promise.madeByPersonId.trim() || !state.governance.persons[promise.madeByPersonId])) errors.push(`Elections ${countryId} party ${party.partyId} has an invalid promise author.`);
        }
      }
      if (!['majority', 'minority', 'coalition', 'unavailable'].includes(entry.government.confidence)) errors.push(`Elections ${countryId} has an invalid government confidence.`);
      for (const coalitionPartyId of entry.government.coalitionPartyIds) {
        if (!entry.parties[coalitionPartyId]) errors.push(`Elections ${countryId} government references unknown party ${coalitionPartyId}.`);
      }
      // The offices reconcile with the governing coalition: a parliament-chosen government's head
      // must belong to the governing coalition (when one is recorded).
      if (entry.government.coalitionPartyIds.length > 0 && entry.government.confidence !== 'unavailable') {
        const appointmentMode = state.constitution.countries[countryId]?.government.appointmentMode;
        const head = Object.values(state.governance.persons).find(p => p.status === 'active' && p.office?.countryId === countryId && p.office.role === 'head_of_government');
        if (appointmentMode === 'chosen_by_parliament' && head?.partyId && !entry.government.coalitionPartyIds.includes(head.partyId)) {
          errors.push(`Elections ${countryId}: the head of government's party (${head.partyId}) is outside the recorded governing coalition.`);
        }
      }
      if (entry.directElection !== undefined && (!validDate(entry.directElection.on) || entry.directElection.on > state.date || !entry.directElection.winnerPartyId.trim() || !entry.parties[entry.directElection.winnerPartyId])) errors.push(`Elections ${countryId} has an invalid direct-election record.`);
      if (entry.nextDirectElectionDate !== undefined && !validDate(entry.nextDirectElectionDate)) errors.push(`Elections ${countryId} has an invalid direct-election deadline.`);
      if (entry.nextHeadOfStateElectionDate !== undefined && !validDate(entry.nextHeadOfStateElectionDate)) errors.push(`Elections ${countryId} has an invalid head-of-state election deadline.`);
      if (!Array.isArray(entry.headOfStateElections)) errors.push(`Elections ${countryId} has an invalid head-of-state election history.`);
      else for (const record of entry.headOfStateElections) {
        if (!validDate(record.on) || record.on > state.date || !record.winnerPersonId?.trim() || !record.winnerPartyId?.trim() || !validDate(record.termStart) || record.termStart > state.date
          || (record.termEnd !== undefined && (!validDate(record.termEnd) || record.termEnd < record.termStart))
          || (record.participationBps !== undefined && (!Number.isSafeInteger(record.participationBps) || record.participationBps < 0 || record.participationBps > 10_000))
          || !['complete', 'partial', 'unavailable'].includes(record.eligibilityCoverage) || !record.limitation?.trim()
          || !['popular_direct', 'popular_indirect', 'parliamentary', 'appointed', 'hereditary', 'other', 'unavailable'].includes(record.method)
          || !state.governance.persons[record.winnerPersonId]) errors.push(`Elections ${countryId} has an invalid head-of-state election record.`);
      }
    }
    return errors;
  },
};
