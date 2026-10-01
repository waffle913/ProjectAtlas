import type { SimulationState } from '../../types';
import { fiscalReformFingerprint } from '../fiscal/runtime';
import { GOVERNANCE_VOTE_THRESHOLDS } from './analysis';
import { governanceFingerprint, type ChamberSupportEstimate, type ParliamentarySupportEstimate, type PartyProposalEvaluation, type PoliticalProposal, type PublicSupportEstimate } from './model';

const correctedDecision = (evaluation: PartyProposalEvaluation): PartyProposalEvaluation['vote'] => evaluation.confidenceBps < GOVERNANCE_VOTE_THRESHOLDS.minimumConfidenceBps || evaluation.coverage === 'unavailable' ? 'unknown' : evaluation.agreementBps >= GOVERNANCE_VOTE_THRESHOLDS.yesAgreementBps ? 'yes' : evaluation.agreementBps <= GOVERNANCE_VOTE_THRESHOLDS.noAgreementBps ? 'no' : 'abstain';
function upgradeChamber(original: ChamberSupportEstimate): ChamberSupportEstimate {
  if (!original.partyEvaluations) return original;
  const partyEvaluations = original.partyEvaluations.map(evaluation => ({ ...evaluation, vote: correctedDecision(evaluation) })), seats = (vote: PartyProposalEvaluation['vote']) => partyEvaluations.filter(item => item.vote === vote).reduce((sum, item) => sum + item.seats, 0);
  const yesSeats = seats('yes'), noSeats = seats('no'), abstainSeats = seats('abstain'), unknownSeats = seats('unknown'), partySeats = partyEvaluations.reduce((sum, item) => sum + item.seats, 0), residualSeats = Math.max(0, (original.totalSeats ?? partySeats) - partySeats), unavailableSeats = unknownSeats + residualSeats, knownSeats = yesSeats + noSeats + abstainSeats;
  const completeAllocation = original.totalSeats !== undefined && partySeats + residualSeats === original.totalSeats, coverage = !completeAllocation || !knownSeats && unavailableSeats ? 'unavailable' : unavailableSeats ? 'partial' : 'complete';
  return { ...original, yesSeats, noSeats, abstainSeats, unavailableSeats, coverage, adopted: coverage === 'complete' ? yesSeats > noSeats : undefined, partyEvaluations };
}
function unavailableLegacyAbstention<T extends ParliamentarySupportEstimate>(original: T): T {
  const chambers = original.chambers.map(chamber => chamber.partyEvaluations === undefined
    ? { ...chamber, abstainSeats: 0, unavailableSeats: chamber.unavailableSeats + chamber.abstainSeats, coverage: 'unavailable' as const, adopted: undefined }
    : chamber);
  const sum = (field: 'yesSeats' | 'noSeats' | 'abstainSeats' | 'unavailableSeats') => chambers.reduce((total, chamber) => total + chamber[field], 0);
  return { ...original, chambers, yesSeats: sum('yesSeats'), noSeats: sum('noSeats'), abstainSeats: sum('abstainSeats'), unavailableSeats: sum('unavailableSeats'), coverage: 'unavailable' };
}
function upgradeParliamentary<T extends ParliamentarySupportEstimate>(original: T): T {
  const chambers = original.chambers.map(upgradeChamber), sum = (field: 'yesSeats' | 'noSeats' | 'abstainSeats' | 'unavailableSeats') => chambers.reduce((total, chamber) => total + chamber[field], 0), coverage = chambers.length > 0 && chambers.every(item => item.coverage === 'complete') ? 'complete' : chambers.some(item => item.coverage !== 'unavailable') ? 'partial' : 'unavailable';
  return { ...original, chambers, yesSeats: sum('yesSeats'), noSeats: sum('noSeats'), abstainSeats: sum('abstainSeats'), unavailableSeats: sum('unavailableSeats'), totalSeats: chambers.reduce((total, chamber) => total + (chamber.totalSeats ?? 0), 0), coverage };
}
function upgradePublic(original: PublicSupportEstimate): PublicSupportEstimate {
  if (original.unknownBps !== undefined && original.knownPersons !== undefined && original.unknownPersons !== undefined) return original;
  const unknown = original.confidenceBps < GOVERNANCE_VOTE_THRESHOLDS.minimumConfidenceBps || original.coverage === 'unavailable';
  return unknown ? { ...original, supportBps: 0, opposeBps: 0, neutralBps: 0, unknownBps: 10_000, knownPersons: 0, unknownPersons: original.representedPersons, coverage: 'unavailable' } : { ...original, unknownBps: 0, knownPersons: original.representedPersons, unknownPersons: 0 };
}

/** Deterministic in-schema upgrade for saves written by the first schema-12 0.14 release. */
export function upgradeGovernanceSchema12(state: SimulationState): SimulationState {
  let changed = false; const proposals: Record<string, PoliticalProposal> = {}, reforms = state.fiscal.reforms.map(reform => ({ ...reform })), receipts = state.fiscal.reformReceipts.map(receipt => ({ ...receipt }));
  for (const [id, original] of Object.entries(state.governance.proposals)) {
    let proposal = structuredClone(original), proposalChanged = false;
    if (proposal.submittedOn && !proposal.submittedPayloadFingerprint) { proposal.submittedPayloadFingerprint = governanceFingerprint({ effectiveDate: proposal.effectiveDate, payload: proposal.payload }); proposalChanged = true; }
    if (proposal.publicEstimate && proposal.publicEstimate.confidenceBps === undefined) { proposal.publicEstimate.confidenceBps = 0; proposalChanged = true; }
    if (proposal.publicEstimate && (proposal.publicEstimate.unknownBps === undefined || proposal.publicEstimate.knownPersons === undefined || proposal.publicEstimate.unknownPersons === undefined)) { proposal.publicEstimate = upgradePublic(proposal.publicEstimate); proposalChanged = true; }
    if (proposal.parliamentaryEstimate) { const upgraded = upgradeParliamentary(proposal.parliamentaryEstimate); if (JSON.stringify(upgraded) !== JSON.stringify(proposal.parliamentaryEstimate)) { proposal.parliamentaryEstimate = upgraded; proposalChanged = true; } }
    if (proposal.voteResult) { const upgraded = upgradeParliamentary(proposal.voteResult); if (JSON.stringify(upgraded) !== JSON.stringify(proposal.voteResult)) { proposal.voteResult = upgraded; proposalChanged = true; } }
    if (proposal.voteResult && proposal.voteResult.confidenceBps === undefined) { proposal.voteResult.confidenceBps = proposal.parliamentaryEstimate?.confidenceBps ?? 0; proposalChanged = true; }
    const aggregateOnly = Boolean(proposal.voteResult?.chambers.some(chamber => chamber.partyEvaluations === undefined));
    const ambiguousAggregateRejection = aggregateOnly && proposal.voteResult?.outcome === 'rejected' && proposal.voteResult.yesSeats === 0 && proposal.voteResult.noSeats === 0;
    if (ambiguousAggregateRejection) {
      if (proposal.parliamentaryEstimate) proposal.parliamentaryEstimate = unavailableLegacyAbstention(proposal.parliamentaryEstimate);
      proposal.voteResult = { ...unavailableLegacyAbstention(proposal.voteResult!), outcome: 'unavailable', reason: 'institutional_data_unavailable' };
      proposal.status = 'unavailable'; proposalChanged = true;
    } else if (proposal.voteResult?.outcome === 'rejected' && proposal.voteResult.coverage !== 'complete') { proposal.voteResult.outcome = 'unavailable'; proposal.voteResult.reason = 'institutional_data_unavailable'; proposal.status = 'unavailable'; proposalChanged = true; }
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
