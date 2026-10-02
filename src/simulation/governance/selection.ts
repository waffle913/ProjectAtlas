import type { GovernanceState, PoliticalProposal } from './model';

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
