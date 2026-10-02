import type { GovernanceState, PoliticalPersonState, PoliticalProposal } from './model';
import { politicalRegistry } from '../politics/registry';
import type { PoliticalRegistry } from '../politics/model';

export type PoliticalStartPath = 'party_leader' | 'officeholder';

function eligibleStartingPerson(person: PoliticalPersonState, path: PoliticalStartPath, registry: PoliticalRegistry): boolean {
  if (person.status !== 'active') return false;
  if (path === 'party_leader') return Boolean(person.isPartyLeader && person.partyId && registry.countries[person.countryId]?.partyIds.includes(person.partyId));
  return Boolean(person.office?.evidence?.status === 'source_reconciled'
    && person.office.countryId === person.countryId
    && (person.office.role === 'head_of_government' || person.office.role === 'head_of_state'));
}

export function startingPersonCandidates(persons: readonly PoliticalPersonState[], countryId: string, path: PoliticalStartPath, partyId?: string, registry: PoliticalRegistry = politicalRegistry): PoliticalPersonState[] {
  const candidates = persons.filter(person => person.countryId === countryId
    && eligibleStartingPerson(person, path, registry) && (path !== 'party_leader' || partyId === undefined || person.partyId === partyId));
  return [...new Map(candidates.map(person => [person.id, person])).values()].sort((a, b) => a.id === b.id ? 0 : a.id < b.id ? -1 : 1);
}

export function selectableStartingCountryIds(persons: readonly PoliticalPersonState[], registry: PoliticalRegistry = politicalRegistry): Set<string> {
  return new Set(persons.filter(person => eligibleStartingPerson(person, 'party_leader', registry)
    || eligibleStartingPerson(person, 'officeholder', registry)).map(person => person.countryId));
}

export function unresolvedFiscalProposals(governance: GovernanceState, countryId: string, personId: string): PoliticalProposal[] {
  return governance.proposalOrder.map(id => governance.proposals[id]).filter(proposal =>
    proposal.countryId === countryId && proposal.proposerPersonId === personId
    && proposal.kind === 'fiscal_reform' && (proposal.status === 'draft' || proposal.status === 'submitted'),
  );
}

export function selectUnresolvedFiscalProposal(governance: GovernanceState, countryId: string, personId: string, selectedId?: string): PoliticalProposal | undefined {
  const proposals = unresolvedFiscalProposals(governance, countryId, personId);
  return proposals.find(proposal => proposal.id === selectedId) ?? proposals.at(-1);
}
