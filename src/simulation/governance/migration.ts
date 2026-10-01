import type { SimulationState } from '../../types';
import { fiscalReformFingerprint } from '../fiscal/runtime';
import { governanceFingerprint, type PoliticalProposal } from './model';

/** Deterministic in-schema upgrade for saves written by the first schema-12 0.14 release. */
export function upgradeGovernanceSchema12(state: SimulationState): SimulationState {
  let changed = false; const proposals: Record<string, PoliticalProposal> = {}, reforms = state.fiscal.reforms.map(reform => ({ ...reform })), receipts = state.fiscal.reformReceipts.map(receipt => ({ ...receipt }));
  for (const [id, original] of Object.entries(state.governance.proposals)) {
    let proposal = structuredClone(original), proposalChanged = false;
    if (proposal.submittedOn && !proposal.submittedPayloadFingerprint) { proposal.submittedPayloadFingerprint = governanceFingerprint({ effectiveDate: proposal.effectiveDate, payload: proposal.payload }); proposalChanged = true; }
    if (proposal.publicEstimate && proposal.publicEstimate.confidenceBps === undefined) { proposal.publicEstimate.confidenceBps = 0; proposalChanged = true; }
    if (proposal.voteResult && proposal.voteResult.confidenceBps === undefined) { proposal.voteResult.confidenceBps = proposal.parliamentaryEstimate?.confidenceBps ?? 0; proposalChanged = true; }
    if (proposal.voteResult?.outcome === 'unavailable' && !proposal.voteResult.reason) { proposal.voteResult.reason = 'institutional_data_unavailable'; proposalChanged = true; }
    if (['enacted', 'rejected', 'unavailable'].includes(proposal.status) && !proposal.evaluationVersion) { proposal.evaluationVersion = 'legacy-0.14-v1'; proposalChanged = true; }
    if (proposal.status === 'enacted' && proposal.scheduledFiscalReformSequence !== undefined && !proposal.enactmentReference) {
      const reformFingerprint = fiscalReformFingerprint({ countryId: proposal.countryId, effectiveDate: proposal.effectiveDate, ...proposal.payload }), origin = { type: 'governance_proposal' as const, proposalId: proposal.id, proposalFingerprint: proposal.submittedPayloadFingerprint! };
      proposal.enactmentReference = { fiscalReformSequence: proposal.scheduledFiscalReformSequence, reformFingerprint }; proposalChanged = true;
      const queuedIndex = reforms.findIndex(reform => reform.sequence === proposal.scheduledFiscalReformSequence && reform.countryId === proposal.countryId && reform.effectiveDate === proposal.effectiveDate && fiscalReformFingerprint(reform) === reformFingerprint);
      if (queuedIndex >= 0) reforms[queuedIndex] = { ...reforms[queuedIndex], origin };
      else if (!receipts.some(receipt => receipt.sequence === proposal.scheduledFiscalReformSequence)) receipts.push({ sequence: proposal.scheduledFiscalReformSequence, countryId: proposal.countryId, effectiveDate: proposal.effectiveDate, reformFingerprint, origin, recordedBy: 'schema12_upgrade' });
    }
    proposals[id] = proposalChanged ? proposal : original; changed ||= proposalChanged;
  }
  if (!changed && state.fiscal.reforms.every((reform, index) => reform.origin === reforms[index].origin) && receipts.length === state.fiscal.reformReceipts.length) return state;
  return { ...state, governance: { ...state.governance, proposals }, fiscal: { ...state.fiscal, reforms, reformReceipts: receipts.sort((a, b) => a.sequence - b.sequence) } };
}
